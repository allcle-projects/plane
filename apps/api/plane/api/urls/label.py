# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.api.views import (
    LabelListCreateAPIEndpoint,
    LabelDetailAPIEndpoint,
    BulkCreateIssueLabelsAPIEndpoint,
)


urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/labels/",
        LabelListCreateAPIEndpoint.as_view(http_method_names=["get", "post"]),
        name="label",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/labels/<uuid:pk>/",
        LabelDetailAPIEndpoint.as_view(http_method_names=["get", "patch", "delete"]),
        name="label",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/bulk-create-labels/",
        BulkCreateIssueLabelsAPIEndpoint.as_view(http_method_names=["post"]),
        name="bulk-create-labels",
    ),
]
