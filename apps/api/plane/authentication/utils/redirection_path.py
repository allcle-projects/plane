# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from plane.db.models import Profile, UserMFA, Workspace, WorkspaceMemberInvite
from plane.authentication.utils.mfa import is_mfa_enforcement_enabled


def get_redirection_path(user):
    # Handle redirections
    profile, _ = Profile.objects.get_or_create(user=user)

    # Redirect to onboarding if the user is not onboarded yet
    if not profile.is_onboarded:
        return "onboarding"

    # Instance-wide 2FA enforcement (default OFF). If enforcement is on and the
    # user has no confirmed second factor, push them to forced enrollment. This
    # is a soft UX nudge post-login; the per-user opt-in challenge in the adapter
    # is the hard gate. When enforcement is off this branch is a no-op.
    if is_mfa_enforcement_enabled() and not UserMFA.objects.filter(
        user=user, is_enabled=True, confirmed_at__isnull=False
    ).exists():
        return "mfa-setup"

    # Redirect to the last workspace if the user has last workspace
    if (
        profile.last_workspace_id
        and Workspace.objects.filter(
            pk=profile.last_workspace_id,
            workspace_member__member_id=user.id,
            workspace_member__is_active=True,
        ).exists()
    ):
        workspace = Workspace.objects.filter(
            pk=profile.last_workspace_id,
            workspace_member__member_id=user.id,
            workspace_member__is_active=True,
        ).first()
        return f"{workspace.slug}"

    fallback_workspace = (
        Workspace.objects.filter(workspace_member__member_id=user.id, workspace_member__is_active=True)
        .order_by("created_at")
        .first()
    )
    # Redirect to fallback workspace
    if fallback_workspace:
        return f"{fallback_workspace.slug}"

    # Redirect to invitations if the user has unaccepted invitations
    if WorkspaceMemberInvite.objects.filter(email=user.email).count():
        return "invitations"

    # Redirect the user to create workspace
    return "create-workspace"
