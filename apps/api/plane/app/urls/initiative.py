# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Initiatives — mote.
# See docs/mote-design/04-planning-hierarchy.md, section 1.

from django.urls import path

from plane.app.views import (
    InitiativeViewSet,
    InitiativeProjectEndpoint,
    InitiativeEpicEndpoint,
    InitiativeAnalyticsEndpoint,
)


urlpatterns = [
    # Workspace-scoped initiative CRUD.
    path(
        "workspaces/<str:slug>/initiatives/",
        InitiativeViewSet.as_view({"get": "list", "post": "create"}),
        name="initiatives",
    ),
    path(
        "workspaces/<str:slug>/initiatives/<uuid:pk>/",
        InitiativeViewSet.as_view(
            {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
        ),
        name="initiatives",
    ),
    # Projects aggregated by an initiative.
    path(
        "workspaces/<str:slug>/initiatives/<uuid:initiative_id>/projects/",
        InitiativeProjectEndpoint.as_view(),
        name="initiative-projects",
    ),
    path(
        "workspaces/<str:slug>/initiatives/<uuid:initiative_id>/projects/<uuid:project_id>/",
        InitiativeProjectEndpoint.as_view(),
        name="initiative-projects",
    ),
    # Epics aggregated by an initiative.
    path(
        "workspaces/<str:slug>/initiatives/<uuid:initiative_id>/epics/",
        InitiativeEpicEndpoint.as_view(),
        name="initiative-epics",
    ),
    path(
        "workspaces/<str:slug>/initiatives/<uuid:initiative_id>/epics/<uuid:epic_id>/",
        InitiativeEpicEndpoint.as_view(),
        name="initiative-epics",
    ),
    # Rollup progress (recompute + persist + return the snapshot).
    path(
        "workspaces/<str:slug>/initiatives/<uuid:initiative_id>/analytics/",
        InitiativeAnalyticsEndpoint.as_view(),
        name="initiative-analytics",
    ),
]
