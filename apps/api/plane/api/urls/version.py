# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.api.views import (
    IssueDescriptionVersionListAPIEndpoint,
    IssueDescriptionVersionDetailAPIEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/work-items/<uuid:issue_id>/description-versions/",
        IssueDescriptionVersionListAPIEndpoint.as_view(http_method_names=["get"]),
        name="work-item-description-version-list",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/work-items/<uuid:issue_id>/description-versions/<uuid:pk>/",
        IssueDescriptionVersionDetailAPIEndpoint.as_view(http_method_names=["get"]),
        name="work-item-description-version-detail",
    ),
]
