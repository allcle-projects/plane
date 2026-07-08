# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Updates — public v1 API (mote).
# See docs/mote-design/04-planning-hierarchy.md, section 4.

from django.urls import path

from plane.api.views.update import (
    ProjectUpdateListCreateAPIEndpoint,
    ProjectUpdateDetailAPIEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/updates/",
        ProjectUpdateListCreateAPIEndpoint.as_view(http_method_names=["get", "post"]),
        name="updates",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/updates/<uuid:pk>/",
        ProjectUpdateDetailAPIEndpoint.as_view(
            http_method_names=["get", "patch", "delete"]
        ),
        name="updates",
    ),
]
