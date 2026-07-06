# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import os

# Django imports
from django.utils import timezone

# Module imports
from plane.license.utils.instance_value import get_configuration_value

# Session keys for the short-lived "half-authenticated" MFA challenge state.
# While these are set, the user has proven the first factor (password/OAuth)
# but has NOT been logged in via django.contrib.auth.login (no full session).
MFA_PENDING_USER_KEY = "mfa_pending_user_id"
MFA_PENDING_AT_KEY = "mfa_pending_at"

# The half-authenticated marker is only valid for this many seconds.
MFA_PENDING_TTL_SECONDS = 10 * 60


def set_mfa_pending(request, user):
    """Mark the session as half-authenticated for the given user.

    This does NOT mint a full auth session; it only records that the first
    factor succeeded. A full session is minted only after the second factor
    is verified (see plane.authentication.utils.login.user_login called from
    the MFA verify endpoint).
    """
    request.session[MFA_PENDING_USER_KEY] = str(user.id)
    request.session[MFA_PENDING_AT_KEY] = timezone.now().timestamp()
    # Ensure Django persists the session cookie on the redirect response.
    request.session.modified = True


def clear_mfa_pending(request):
    """Remove the half-authenticated marker from the session."""
    request.session.pop(MFA_PENDING_USER_KEY, None)
    request.session.pop(MFA_PENDING_AT_KEY, None)
    request.session.modified = True


def get_mfa_pending_user_id(request):
    """Return the pending user id if a valid, non-expired marker exists.

    Returns None if there is no marker or it has expired.
    """
    user_id = request.session.get(MFA_PENDING_USER_KEY)
    pending_at = request.session.get(MFA_PENDING_AT_KEY)
    if not user_id or not pending_at:
        return None

    try:
        pending_at = float(pending_at)
    except (TypeError, ValueError):
        return None

    if timezone.now().timestamp() - pending_at > MFA_PENDING_TTL_SECONDS:
        return None

    return user_id


def is_mfa_enforcement_enabled():
    """Instance-wide 'require 2FA for all users' toggle.

    Read from InstanceConfiguration exactly like ENABLE_SIGNUP. Defaults to
    OFF ('0'); when unset or '0', behavior is unchanged for everyone and 2FA
    is strictly per-user opt-in.
    """
    (enforce,) = get_configuration_value(
        [
            {
                "key": "ENABLE_MFA_ENFORCEMENT",
                "default": os.environ.get("ENABLE_MFA_ENFORCEMENT", "0"),
            }
        ]
    )
    return enforce == "1"
