# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.api.views import (
    WorkspaceFavoriteAPIEndpoint,
    WorkspaceFavoriteGroupAPIEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/user-favorites/",
        WorkspaceFavoriteAPIEndpoint.as_view(http_method_names=["get", "post"]),
        name="workspace-user-favorites",
    ),
    path(
        "workspaces/<str:slug>/user-favorites/<uuid:favorite_id>/",
        WorkspaceFavoriteAPIEndpoint.as_view(http_method_names=["patch", "delete"]),
        name="workspace-user-favorite-detail",
    ),
    path(
        "workspaces/<str:slug>/user-favorites/<uuid:favorite_id>/group/",
        WorkspaceFavoriteGroupAPIEndpoint.as_view(http_method_names=["get"]),
        name="workspace-user-favorite-group",
    ),
]
