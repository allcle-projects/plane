# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Custom RBAC — role CRUD + permission catalog + member assignment (mote).
# See docs/mote-design/05-teamspaces-access.md, section 2.
#
# Workspace admins manage custom Roles (a name + a set of granular Permissions)
# and assign them to members. System roles (Admin/Member/Guest, is_system=True)
# are read-only. Assignments are additive overlays consumed by the resolver
# (app/permissions/resolver.py); they never remove a member's base int role.

# Django imports
from django.db import IntegrityError

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from ..base import BaseViewSet, BaseAPIView
from plane.app.permissions import allow_permission, ROLE
from plane.app.serializers import (
    PermissionSerializer,
    RoleSerializer,
    RoleAssignmentSerializer,
)
from plane.db.models import (
    Workspace,
    WorkspaceMember,
    Permission,
    Role,
    RoleAssignment,
)
from plane.utils.rbac_catalog import SYSTEM_ROLES


def _ensure_system_roles(workspace):
    """Lazily seed the three built-in system roles for a workspace (covers
    workspaces created after migration 0142). No-op if they already exist."""
    for name, base_role, permission_keys in SYSTEM_ROLES:
        if Role.objects.filter(
            workspace=workspace, name=name, deleted_at__isnull=True
        ).exists():
            continue
        role = Role.objects.create(
            workspace=workspace,
            name=name,
            level="WORKSPACE",
            is_system=True,
            base_role=base_role,
        )
        role.permissions.set(Permission.objects.filter(key__in=permission_keys))


def _set_role_permissions(role, permission_ids):
    """Replace a role's permission set from a list of Permission ids (ignores
    unknown ids)."""
    if permission_ids is None:
        return
    valid = Permission.objects.filter(id__in=permission_ids)
    role.permissions.set(valid)


class RoleViewSet(BaseViewSet):
    serializer_class = RoleSerializer
    model = Role

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .select_related("workspace")
            .prefetch_related("permissions")
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def list(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        _ensure_system_roles(workspace)
        roles = self.get_queryset()
        return Response(RoleSerializer(roles, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        role = self.get_queryset().get(pk=pk)
        return Response(RoleSerializer(role).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def create(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        serializer = RoleSerializer(data=request.data)
        if serializer.is_valid():
            role = serializer.save(
                workspace_id=workspace.id,
                is_system=False,
                created_by_id=request.user.id,
                updated_by_id=request.user.id,
            )
            _set_role_permissions(role, request.data.get("permission_ids"))
            return Response(RoleSerializer(role).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        role = self.get_queryset().get(pk=pk)
        if role.is_system:
            return Response(
                {"error": "System roles cannot be edited."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = RoleSerializer(role, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save(updated_by_id=request.user.id)
            _set_role_permissions(role, request.data.get("permission_ids"))
            return Response(RoleSerializer(role).data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def destroy(self, request, slug, pk):
        role = self.get_queryset().get(pk=pk)
        if role.is_system:
            return Response(
                {"error": "System roles cannot be deleted."},
                status=status.HTTP_403_FORBIDDEN,
            )
        role.delete()  # soft-delete (deleted_at)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PermissionCatalogEndpoint(BaseAPIView):
    """The global permission catalog for the role editor UI."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug):
        permissions = Permission.objects.all()
        return Response(PermissionSerializer(permissions, many=True).data, status=status.HTTP_200_OK)


class MemberRoleAssignmentEndpoint(BaseAPIView):
    """Assign / unassign custom roles to a workspace member."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug, member_id):
        assignments = RoleAssignment.objects.filter(
            workspace__slug=slug, member_id=member_id, deleted_at__isnull=True
        ).select_related("role")
        return Response(RoleAssignmentSerializer(assignments, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug, member_id):
        workspace = Workspace.objects.get(slug=slug)
        # target must be an active member of the workspace
        if not WorkspaceMember.objects.filter(
            workspace_id=workspace.id, member_id=member_id, is_active=True
        ).exists():
            return Response(
                {"error": "User is not an active member of this workspace."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        role_id = request.data.get("role_id")
        project_id = request.data.get("project_id")  # optional (project-scoped)
        role = Role.objects.filter(workspace_id=workspace.id, pk=role_id).first()
        if role is None:
            return Response({"error": "Role not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            assignment = RoleAssignment.objects.create(
                workspace_id=workspace.id,
                role_id=role.id,
                member_id=member_id,
                project_id=project_id,
                created_by_id=request.user.id,
                updated_by_id=request.user.id,
            )
        except IntegrityError:
            # Already assigned (partial unique) — return the existing row.
            assignment = RoleAssignment.objects.filter(
                workspace_id=workspace.id,
                role_id=role.id,
                member_id=member_id,
                project_id=project_id,
                deleted_at__isnull=True,
            ).first()
        return Response(RoleAssignmentSerializer(assignment).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def delete(self, request, slug, member_id, assignment_id):
        assignment = RoleAssignment.objects.filter(
            workspace__slug=slug, member_id=member_id, pk=assignment_id
        ).first()
        if assignment is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        assignment.delete()  # soft-delete (deleted_at)
        return Response(status=status.HTTP_204_NO_CONTENT)
