# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.api.views import (
    GlobalSearchAPIEndpoint,
    EntitySearchAPIEndpoint,
    IssueSearchAPIEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/search/",
        GlobalSearchAPIEndpoint.as_view(http_method_names=["get"]),
        name="global-search",
    ),
    path(
        "workspaces/<str:slug>/entity-search/",
        EntitySearchAPIEndpoint.as_view(http_method_names=["get"]),
        name="entity-search",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/search-issues/",
        IssueSearchAPIEndpoint.as_view(http_method_names=["get"]),
        name="project-issue-search",
    ),
]
