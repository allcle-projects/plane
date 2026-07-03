# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.api.views import (
    WorkspaceDraftIssueAPIEndpoint,
    WorkspaceDraftIssueDetailAPIEndpoint,
    WorkspaceDraftToIssueAPIEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/draft-work-items/",
        WorkspaceDraftIssueAPIEndpoint.as_view(http_method_names=["get", "post"]),
        name="workspace-draft-work-items",
    ),
    path(
        "workspaces/<str:slug>/draft-work-items/<uuid:pk>/",
        WorkspaceDraftIssueDetailAPIEndpoint.as_view(http_method_names=["get", "patch", "delete"]),
        name="workspace-draft-work-item-detail",
    ),
    path(
        "workspaces/<str:slug>/draft-to-work-item/<uuid:draft_id>/",
        WorkspaceDraftToIssueAPIEndpoint.as_view(http_method_names=["post"]),
        name="workspace-draft-to-work-item",
    ),
]
