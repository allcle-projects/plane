# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.api.views import WorkspaceLabelsListAPIEndpoint, WorkspaceStatesListAPIEndpoint

urlpatterns = [
    path(
        "workspaces/<str:slug>/labels/",
        WorkspaceLabelsListAPIEndpoint.as_view(http_method_names=["get"]),
        name="workspace-label-list",
    ),
    path(
        "workspaces/<str:slug>/states/",
        WorkspaceStatesListAPIEndpoint.as_view(http_method_names=["get"]),
        name="workspace-state-list",
    ),
]
