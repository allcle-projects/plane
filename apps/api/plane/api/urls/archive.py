# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.api.views import (
    IssueArchiveAPIEndpoint,
    ArchivedIssueListAPIEndpoint,
    BulkArchiveIssuesAPIEndpoint,
    BulkDeleteIssuesAPIEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/archived-work-items/",
        ArchivedIssueListAPIEndpoint.as_view(http_method_names=["get"]),
        name="archived-work-item-list",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/work-items/<uuid:pk>/archive/",
        IssueArchiveAPIEndpoint.as_view(http_method_names=["post", "delete"]),
        name="work-item-archive-unarchive",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/work-items/bulk-archive/",
        BulkArchiveIssuesAPIEndpoint.as_view(http_method_names=["post"]),
        name="work-item-bulk-archive",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/work-items/bulk-delete/",
        BulkDeleteIssuesAPIEndpoint.as_view(http_method_names=["post"]),
        name="work-item-bulk-delete",
    ),
]
