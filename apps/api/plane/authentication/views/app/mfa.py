# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import secrets
import time

# Third party imports
import pyotp
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

# Django imports
from django.utils import timezone

# Module imports
from plane.authentication.adapter.error import AUTHENTICATION_ERROR_CODES
from plane.authentication.session import BaseSessionAuthentication
from plane.authentication.utils.login import user_login
from plane.authentication.utils.mfa import (
    clear_mfa_pending,
    get_mfa_pending_user_id,
)
from plane.authentication.utils.redirection_path import get_redirection_path
from plane.db.models import MFABackupCode, User, UserMFA
from plane.license.api.permissions import InstanceAdminPermission
from plane.license.models import Instance

# Number of single-use backup codes generated at confirm time.
BACKUP_CODE_COUNT = 10
# TOTP acceptance window (± one 30s step) to tolerate clock skew.
TOTP_VALID_WINDOW = 1
# Session key counting consecutive bad codes at the verify step. After this many
# failures the half-authenticated marker is burned, forcing a full re-login.
MFA_VERIFY_FAIL_KEY = "mfa_pending_fail_count"
MFA_VERIFY_MAX_FAILS = 5


def _error(code_key, message=None, http_status=status.HTTP_400_BAD_REQUEST):
    return Response(
        {
            "error_code": AUTHENTICATION_ERROR_CODES[code_key],
            "error_message": message or code_key,
        },
        status=http_status,
    )


def _normalize_backup_code(value):
    """Canonical backup-code form used for hashing and comparison."""
    return str(value).strip().lower().replace(" ", "").replace("-", "")


def _generate_backup_codes(mfa):
    """(Re)generate backup codes for an MFA record; return plaintext list once.

    The displayed form is grouped ("xxxxx-xxxxx") but the hash is over the
    normalized (dash/space-stripped, lowercase) form so matching is tolerant of
    how the user re-types it.
    """
    # Invalidate any previous codes. Hard delete: never retain old secrets.
    MFABackupCode.objects.filter(mfa=mfa).delete(soft=False)
    plaintext_codes = []
    for _ in range(BACKUP_CODE_COUNT):
        raw = secrets.token_hex(5)  # 10 hex chars, cryptographically strong
        display = f"{raw[:5]}-{raw[5:]}"
        code = MFABackupCode(mfa=mfa)
        code.set_code(_normalize_backup_code(display))
        code.save()
        plaintext_codes.append(display)
    return plaintext_codes


def _matching_totp_timestep(mfa, code):
    """Return the timestep index (unix_time // step) a valid TOTP code matches
    within the skew window, or None if `code` is not a currently-valid TOTP.

    Used both to accept a code and to detect replay: a matched timestep that is
    <= the last accepted one means the code was already used inside its window.
    """
    if not code:
        return None
    totp = pyotp.TOTP(mfa.get_secret())
    step = totp.interval
    current_step = int(time.time()) // step
    for offset in range(-TOTP_VALID_WINDOW, TOTP_VALID_WINDOW + 1):
        candidate = current_step + offset
        if secrets.compare_digest(str(totp.at(candidate * step)), str(code)):
            return candidate
    return None


def _verify_totp_or_backup(mfa, code):
    """Return True if `code` is a valid, non-replayed TOTP or an unused backup code.

    A matching backup code is marked used (single-use). An accepted TOTP advances
    the persisted last-verified timestep, and a code whose timestep was already
    accepted is rejected so it cannot be replayed inside its skew window.
    """
    if not code:
        return False
    code = code.strip()

    # 1) TOTP (with in-window replay protection)
    matched_step = _matching_totp_timestep(mfa, code)
    if matched_step is not None:
        if mfa.last_verified_timestep is not None and matched_step <= mfa.last_verified_timestep:
            # Already-consumed timestep — a replay of a previously accepted code.
            return False
        mfa.last_verified_timestep = matched_step
        mfa.save(update_fields=["last_verified_timestep", "updated_at"])
        return True

    # 2) Backup code (compare against the normalized, hashed form)
    normalized = _normalize_backup_code(code)
    for backup in MFABackupCode.objects.filter(mfa=mfa, used_at__isnull=True):
        if backup.check_code(normalized):
            backup.used_at = timezone.now()
            backup.save(update_fields=["used_at", "updated_at"])
            return True
    return False


class MFAEnrollEndpoint(APIView):
    """POST /auth/mfa/enroll/ — issue a TOTP secret + provisioning URI.

    Does NOT enable MFA; the user must confirm a code at /auth/mfa/confirm/.
    """

    authentication_classes = [BaseSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        mfa = UserMFA.objects.filter(user=request.user).first()
        if mfa and mfa.is_enabled and mfa.confirmed_at:
            return _error("MFA_ALREADY_ENABLED", "MFA is already enabled")

        secret = pyotp.random_base32()
        if mfa is None:
            mfa = UserMFA(user=request.user)
        mfa.set_secret(secret)
        mfa.is_enabled = False
        mfa.confirmed_at = None
        mfa.save()
        # Clear any stale (pre-confirm) backup codes from a prior enroll attempt.
        MFABackupCode.objects.filter(mfa=mfa).delete(soft=False)

        instance = Instance.objects.first()
        issuer_name = instance.instance_name if instance and instance.instance_name else "Plane"
        provisioning_uri = pyotp.TOTP(secret).provisioning_uri(
            name=request.user.email,
            issuer_name=issuer_name,
        )
        return Response(
            {"secret": secret, "provisioning_uri": provisioning_uri},
            status=status.HTTP_200_OK,
        )


class MFAConfirmEndpoint(APIView):
    """POST /auth/mfa/confirm/ — verify the first code, enable MFA, return backup codes."""

    authentication_classes = [BaseSessionAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "mfa"

    def post(self, request):
        code = request.data.get("code")
        mfa = UserMFA.objects.filter(user=request.user).first()
        if mfa is None:
            return _error("MFA_ENROLLMENT_NOT_STARTED", "Enroll before confirming")
        if mfa.is_enabled and mfa.confirmed_at:
            return _error("MFA_ALREADY_ENABLED", "MFA is already enabled")

        if not code:
            return _error("MFA_INVALID_CODE", "Code is required")

        matched_step = _matching_totp_timestep(mfa, str(code).strip())
        if matched_step is None:
            return _error("MFA_INVALID_CODE", "Invalid code")

        # Record the timestep so the confirmation code cannot be replayed at verify.
        mfa.last_verified_timestep = matched_step
        mfa.is_enabled = True
        mfa.confirmed_at = timezone.now()
        mfa.save()

        backup_codes = _generate_backup_codes(mfa)
        return Response(
            {"backup_codes": backup_codes},
            status=status.HTTP_200_OK,
        )


class MFAVerifyEndpoint(APIView):
    """POST /auth/mfa/verify/ — second factor during login.

    Reads the short-lived half-authenticated marker from the session (set by the
    adapter after the first factor). Only on success is a full session minted via
    user_login. There is no authenticated user on this request.
    """

    authentication_classes = [BaseSessionAuthentication]
    permission_classes = [AllowAny]

    def post(self, request):
        user_id = get_mfa_pending_user_id(request)
        if not user_id:
            return _error("MFA_PENDING_EXPIRED", "MFA challenge expired, sign in again")

        user = User.objects.filter(id=user_id, is_active=True).first()
        if user is None:
            clear_mfa_pending(request)
            return _error("MFA_PENDING_EXPIRED", "MFA challenge expired, sign in again")

        mfa = UserMFA.objects.filter(user=user, is_enabled=True, confirmed_at__isnull=False).first()
        if mfa is None:
            # No confirmed MFA: nothing to challenge. Do not mint a session here.
            clear_mfa_pending(request)
            return _error("MFA_NOT_ENROLLED", "No active MFA for this account")

        code = request.data.get("code")
        if not _verify_totp_or_backup(mfa, str(code) if code is not None else ""):
            # Per-session failure cap: burn the pending marker after too many bad
            # codes so a stolen half-authenticated session cannot brute-force TOTP.
            fails = request.session.get(MFA_VERIFY_FAIL_KEY, 0) + 1
            request.session[MFA_VERIFY_FAIL_KEY] = fails
            request.session.modified = True
            if fails >= MFA_VERIFY_MAX_FAILS:
                clear_mfa_pending(request)
                request.session.pop(MFA_VERIFY_FAIL_KEY, None)
                return _error("MFA_PENDING_EXPIRED", "Too many attempts, sign in again")
            return _error("MFA_INVALID_CODE", "Invalid code")

        # Second factor verified — mint the full session now.
        request.session.pop(MFA_VERIFY_FAIL_KEY, None)
        user_login(request=request, user=user, is_app=True)
        clear_mfa_pending(request)
        return Response(
            {"redirect_path": get_redirection_path(user=user)},
            status=status.HTTP_200_OK,
        )


class MFADisableEndpoint(APIView):
    """POST /auth/mfa/disable/ — disable MFA for the current user.

    Requires a valid current TOTP or backup code so a hijacked live session
    cannot silently turn off the second factor.
    """

    authentication_classes = [BaseSessionAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "mfa"

    def post(self, request):
        mfa = UserMFA.objects.filter(
            user=request.user, is_enabled=True, confirmed_at__isnull=False
        ).first()
        if mfa is None:
            return _error("MFA_NOT_ENROLLED", "MFA is not enabled")

        code = request.data.get("code")
        if not _verify_totp_or_backup(mfa, str(code) if code is not None else ""):
            return _error("MFA_INVALID_CODE", "Invalid code")

        # Hard delete so the OneToOne slot frees up for future re-enrollment and
        # the secret is purged. Cascades to backup codes at the DB level.
        mfa.delete(soft=False)
        return Response({"disabled": True}, status=status.HTTP_200_OK)


class MFAAdminResetEndpoint(APIView):
    """POST /auth/mfa/admin/reset/ — instance-admin escape hatch.

    Disables/removes MFA for a locked-out user (by user_id or email) so they can
    recover. Instance-admin only.
    """

    authentication_classes = [BaseSessionAuthentication]
    permission_classes = [InstanceAdminPermission]

    def post(self, request):
        user_id = request.data.get("user_id")
        email = request.data.get("email")
        if not user_id and not email:
            return _error("MFA_NOT_ENROLLED", "user_id or email is required")

        if user_id:
            target = User.objects.filter(id=user_id).first()
        else:
            target = User.objects.filter(email=str(email).strip().lower()).first()

        if target is None:
            return _error("MFA_NOT_ENROLLED", "User not found", http_status=status.HTTP_404_NOT_FOUND)

        # Hard delete so the locked-out user can cleanly re-enroll; cascades to
        # backup codes at the DB level.
        deleted, _ = UserMFA.objects.filter(user=target).delete(soft=False)
        return Response(
            {"reset": True, "had_mfa": bool(deleted)},
            status=status.HTTP_200_OK,
        )
