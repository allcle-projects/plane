# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Custom RBAC — mote.
# See docs/mote-design/05-teamspaces-access.md, section 2.

from django.urls import path

from plane.app.views import (
    RoleViewSet,
    PermissionCatalogEndpoint,
    MemberRoleAssignmentEndpoint,
)


urlpatterns = [
    # Permission catalog (for the role editor).
    path(
        "workspaces/<str:slug>/permissions/",
        PermissionCatalogEndpoint.as_view(),
        name="rbac-permissions",
    ),
    # Role CRUD.
    path(
        "workspaces/<str:slug>/roles/",
        RoleViewSet.as_view({"get": "list", "post": "create"}),
        name="roles",
    ),
    path(
        "workspaces/<str:slug>/roles/<uuid:pk>/",
        RoleViewSet.as_view(
            {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
        ),
        name="roles",
    ),
    # Member role assignment.
    path(
        "workspaces/<str:slug>/members/<uuid:member_id>/roles/",
        MemberRoleAssignmentEndpoint.as_view(),
        name="member-roles",
    ),
    path(
        "workspaces/<str:slug>/members/<uuid:member_id>/roles/<uuid:assignment_id>/",
        MemberRoleAssignmentEndpoint.as_view(),
        name="member-roles",
    ),
]
