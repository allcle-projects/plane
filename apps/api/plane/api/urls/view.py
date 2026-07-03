# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.api.views import (
    WorkspaceViewAPIEndpoint,
    WorkspaceViewDetailAPIEndpoint,
    ProjectViewAPIEndpoint,
    ProjectViewDetailAPIEndpoint,
    ProjectViewFavoriteAPIEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/views/",
        WorkspaceViewAPIEndpoint.as_view(http_method_names=["get", "post"]),
        name="workspace-views",
    ),
    path(
        "workspaces/<str:slug>/views/<uuid:pk>/",
        WorkspaceViewDetailAPIEndpoint.as_view(http_method_names=["get", "patch", "delete"]),
        name="workspace-view-detail",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/views/",
        ProjectViewAPIEndpoint.as_view(http_method_names=["get", "post"]),
        name="project-views",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/views/<uuid:pk>/",
        ProjectViewDetailAPIEndpoint.as_view(http_method_names=["get", "patch", "delete"]),
        name="project-view-detail",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/user-favorite-views/",
        ProjectViewFavoriteAPIEndpoint.as_view(http_method_names=["post"]),
        name="project-view-favorite",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/user-favorite-views/<uuid:view_id>/",
        ProjectViewFavoriteAPIEndpoint.as_view(http_method_names=["delete"]),
        name="project-view-favorite-detail",
    ),
]
