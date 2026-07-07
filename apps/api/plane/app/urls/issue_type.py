# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Custom Fields / Work Item Properties — mote (Phase 1).
# Workspace-scoped work item type / property / option definition CRUD.

from django.urls import path

from plane.app.views import (
    IssueTypeViewSet,
    IssuePropertyViewSet,
    IssuePropertyOptionViewSet,
)


urlpatterns = [
    # Work item types
    path(
        "workspaces/<str:slug>/issue-types/",
        IssueTypeViewSet.as_view({"get": "list", "post": "create"}),
        name="issue-types",
    ),
    path(
        "workspaces/<str:slug>/issue-types/<uuid:pk>/",
        IssueTypeViewSet.as_view(
            {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
        ),
        name="issue-types",
    ),
    # Properties (definitions on a type)
    path(
        "workspaces/<str:slug>/issue-types/<uuid:type_id>/properties/",
        IssuePropertyViewSet.as_view({"get": "list", "post": "create"}),
        name="issue-type-properties",
    ),
    path(
        "workspaces/<str:slug>/issue-types/<uuid:type_id>/properties/<uuid:pk>/",
        IssuePropertyViewSet.as_view(
            {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
        ),
        name="issue-type-properties",
    ),
    # Options (for SELECT / MULTI_SELECT properties)
    path(
        "workspaces/<str:slug>/issue-types/<uuid:type_id>/properties/<uuid:property_id>/options/",
        IssuePropertyOptionViewSet.as_view({"get": "list", "post": "create"}),
        name="issue-property-options",
    ),
    path(
        "workspaces/<str:slug>/issue-types/<uuid:type_id>/properties/<uuid:property_id>/options/<uuid:pk>/",
        IssuePropertyOptionViewSet.as_view(
            {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
        ),
        name="issue-property-options",
    ),
]
