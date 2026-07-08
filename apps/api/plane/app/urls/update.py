# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Updates — mote.
# See docs/mote-design/04-planning-hierarchy.md, section 4.

from django.urls import path

from plane.app.views import (
    ProjectUpdateEndpoint,
    ProjectUpdateDetailEndpoint,
    CycleUpdateEndpoint,
    CycleUpdateDetailEndpoint,
    InitiativeUpdateEndpoint,
    InitiativeUpdateDetailEndpoint,
)


urlpatterns = [
    # Project-scoped updates.
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/updates/",
        ProjectUpdateEndpoint.as_view(),
        name="project-updates",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/updates/<uuid:pk>/",
        ProjectUpdateDetailEndpoint.as_view(),
        name="project-updates",
    ),
    # Cycle-scoped updates.
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/cycles/<uuid:cycle_id>/updates/",
        CycleUpdateEndpoint.as_view(),
        name="cycle-updates",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/cycles/<uuid:cycle_id>/updates/<uuid:pk>/",
        CycleUpdateDetailEndpoint.as_view(),
        name="cycle-updates",
    ),
    # Initiative-scoped updates.
    path(
        "workspaces/<str:slug>/initiatives/<uuid:initiative_id>/updates/",
        InitiativeUpdateEndpoint.as_view(),
        name="initiative-updates",
    ),
    path(
        "workspaces/<str:slug>/initiatives/<uuid:initiative_id>/updates/<uuid:pk>/",
        InitiativeUpdateDetailEndpoint.as_view(),
        name="initiative-updates",
    ),
]
