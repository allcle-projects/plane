# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Project States — internal app urls (mote).
# See docs/mote-design/04-planning-hierarchy.md, section 3 ("Project States").

from django.urls import path

from plane.app.views import ProjectStateViewSet


urlpatterns = [
    path(
        "workspaces/<str:slug>/project-states/",
        ProjectStateViewSet.as_view({"get": "list", "post": "create"}),
        name="project-states",
    ),
    path(
        "workspaces/<str:slug>/project-states/<uuid:pk>/",
        ProjectStateViewSet.as_view(
            {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
        ),
        name="project-state-detail",
    ),
]
