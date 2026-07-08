# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Teamspaces — mote.
# See docs/mote-design/05-teamspaces-access.md, section 1.

from django.urls import path

from plane.app.views import (
    TeamViewSet,
    TeamMemberEndpoint,
    TeamProjectEndpoint,
    TeamWorkItemsEndpoint,
)


urlpatterns = [
    # Workspace-scoped teamspace CRUD.
    path(
        "workspaces/<str:slug>/teamspaces/",
        TeamViewSet.as_view({"get": "list", "post": "create"}),
        name="teamspaces",
    ),
    path(
        "workspaces/<str:slug>/teamspaces/<uuid:pk>/",
        TeamViewSet.as_view(
            {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
        ),
        name="teamspaces",
    ),
    # Members of a teamspace.
    path(
        "workspaces/<str:slug>/teamspaces/<uuid:team_id>/members/",
        TeamMemberEndpoint.as_view(),
        name="teamspace-members",
    ),
    path(
        "workspaces/<str:slug>/teamspaces/<uuid:team_id>/members/<uuid:member_id>/",
        TeamMemberEndpoint.as_view(),
        name="teamspace-members",
    ),
    # Projects bundled into a teamspace.
    path(
        "workspaces/<str:slug>/teamspaces/<uuid:team_id>/projects/",
        TeamProjectEndpoint.as_view(),
        name="teamspace-projects",
    ),
    path(
        "workspaces/<str:slug>/teamspaces/<uuid:team_id>/projects/<uuid:project_id>/",
        TeamProjectEndpoint.as_view(),
        name="teamspace-projects",
    ),
    # Team-scoped work-item feed (union of issues across the team's projects).
    path(
        "workspaces/<str:slug>/teamspaces/<uuid:team_id>/work-items/",
        TeamWorkItemsEndpoint.as_view(),
        name="teamspace-work-items",
    ),
]
