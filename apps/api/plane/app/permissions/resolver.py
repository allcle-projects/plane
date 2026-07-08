# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Custom RBAC — permission resolver (mote).
# See docs/mote-design/05-teamspaces-access.md, section 2.
#
# ``has_permission(user, workspace_slug, project_id, permission_key)`` is the
# single entry point that unifies custom-role grants with the legacy int roles.
#
# CRITICAL COMPATIBILITY CONTRACT: for a user who has NO custom RoleAssignment
# (i.e. everyone today), the resolver falls back to the permission set implied by
# their WorkspaceMember/ProjectMember int role — so it returns EXACTLY what the
# legacy int check would. Custom assignments are ADDITIVE: they can only widen
# the granted set, never revoke the base int grant. This lets the resolver be
# introduced with zero behavior change and adopted per-gate later.

# Django imports
from django.db.models import Q

# Module imports
from plane.db.models import WorkspaceMember, ProjectMember, RoleAssignment
from plane.utils.rbac_catalog import permissions_for_base_role


def _base_role_permissions(user, workspace_slug, project_id):
    """Permission set from the user's legacy int role (project role if a project
    is in scope and the user is a project member, else workspace role)."""
    keys = set()

    ws_member = WorkspaceMember.objects.filter(
        member=user, workspace__slug=workspace_slug, is_active=True
    ).first()
    if ws_member:
        keys |= permissions_for_base_role(ws_member.role)

    if project_id:
        proj_member = ProjectMember.objects.filter(
            member=user,
            workspace__slug=workspace_slug,
            project_id=project_id,
            is_active=True,
        ).first()
        if proj_member:
            keys |= permissions_for_base_role(proj_member.role)

    return keys


def _custom_role_permissions(user, workspace_slug, project_id):
    """Permission keys unioned from the user's custom RoleAssignments in this
    workspace. Workspace-level assignments (project is null) always apply;
    project-level assignments apply only when that project is in scope."""
    scope = Q(project__isnull=True)
    if project_id:
        scope |= Q(project_id=project_id)

    assignments = (
        RoleAssignment.objects.filter(
            member=user,
            workspace__slug=workspace_slug,
            deleted_at__isnull=True,
        )
        .filter(scope)
        .prefetch_related("role__permissions")
    )

    keys = set()
    for assignment in assignments:
        for perm in assignment.role.permissions.all():
            keys.add(perm.key)
    return keys


def get_permissions(user, workspace_slug, project_id=None):
    """The full permission-key set for a user in a workspace (+ optional
    project): legacy int-role permissions UNION custom-role permissions."""
    if user is None or not user.is_authenticated:
        return set()
    return _base_role_permissions(user, workspace_slug, project_id) | _custom_role_permissions(
        user, workspace_slug, project_id
    )


def has_permission(user, workspace_slug, permission_key, project_id=None):
    """True if the user is granted ``permission_key`` in this scope, via either
    their legacy int role or a custom role assignment."""
    return permission_key in get_permissions(user, workspace_slug, project_id)
