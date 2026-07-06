# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.core.cache import cache
from django.http import JsonResponse

# Module imports
from plane.authentication.utils.mfa import is_mfa_enforcement_enabled
from plane.db.models import UserMFA

# Cache the instance-wide enforcement flag so the off-safe fast path never hits
# the database. Short TTL: toggling ENABLE_MFA_ENFORCEMENT takes effect within a
# minute (enforcing sooner is the fail-safe direction).
_ENFORCEMENT_CACHE_KEY = "mfa_enforcement_enabled"
_ENFORCEMENT_CACHE_TTL = 60  # seconds


def _enforcement_enabled():
    cached = cache.get(_ENFORCEMENT_CACHE_KEY)
    if cached is None:
        cached = is_mfa_enforcement_enabled()
        cache.set(_ENFORCEMENT_CACHE_KEY, cached, _ENFORCEMENT_CACHE_TTL)
    return cached


class MFAEnforcementMiddleware:
    """Request-time gate for instance-wide 2FA enforcement.

    When ``ENABLE_MFA_ENFORCEMENT`` is on and an authenticated user has no
    confirmed second factor, every request outside the auth surface is rejected
    with 403 so the user is forced to enroll before using the app. This makes
    enforcement a real server-side gate rather than an advisory client redirect.

    Off-safe: when enforcement is disabled the middleware short-circuits on a
    cached config read and adds zero database queries to the hot path.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Off-safe fast path — no user access, no DB query when enforcement is off.
        if not _enforcement_enabled():
            return self.get_response(request)

        # Always allow the auth surface: sign-in/out, OAuth/magic callbacks, and
        # the MFA enroll/confirm/verify/disable endpoints (all under /auth/), so
        # an enforced user can still reach enrollment and sign out.
        if request.path.startswith("/auth/"):
            return self.get_response(request)

        user = getattr(request, "user", None)
        if user is None or not user.is_authenticated:
            return self.get_response(request)

        # Enforced + authenticated: block until a confirmed second factor exists.
        if not UserMFA.objects.filter(
            user=user, is_enabled=True, confirmed_at__isnull=False
        ).exists():
            return JsonResponse(
                {
                    "error": "MFA_ENROLLMENT_REQUIRED",
                    "detail": "Two-factor authentication is required. Enroll to continue.",
                },
                status=403,
            )

        return self.get_response(request)
