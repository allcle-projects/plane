# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Project States — public v1 API urls (mote).
# See docs/mote-design/04-planning-hierarchy.md, section 3 ("Project States").

from django.urls import path

from plane.api.views import (
    ProjectStateListCreateAPIEndpoint,
    ProjectStateDetailAPIEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/project-states/",
        ProjectStateListCreateAPIEndpoint.as_view(http_method_names=["get", "post"]),
        name="project-states",
    ),
    path(
        "workspaces/<str:slug>/project-states/<uuid:pk>/",
        ProjectStateDetailAPIEndpoint.as_view(http_method_names=["get", "patch", "delete"]),
        name="project-states-detail",
    ),
]
