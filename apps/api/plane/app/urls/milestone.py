# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Milestones — mote.
# See docs/mote-design/04-planning-hierarchy.md, section 2 ("Milestones").

from django.urls import path

from plane.app.views import (
    MilestoneViewSet,
    MilestoneIssueEndpoint,
    MilestoneAnalyticsEndpoint,
)


urlpatterns = [
    # Project-scoped milestone CRUD.
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/milestones/",
        MilestoneViewSet.as_view({"get": "list", "post": "create"}),
        name="project-milestones",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/milestones/<uuid:pk>/",
        MilestoneViewSet.as_view(
            {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
        ),
        name="project-milestones",
    ),
    # Work items attached to a milestone (list / bulk attach).
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/milestones/<uuid:milestone_id>/milestone-issues/",
        MilestoneIssueEndpoint.as_view(),
        name="project-milestone-issues",
    ),
    # Detach one work item from a milestone.
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/milestones/<uuid:milestone_id>/milestone-issues/<uuid:issue_id>/",
        MilestoneIssueEndpoint.as_view(),
        name="project-milestone-issues",
    ),
    # Rollup progress (recompute + persist + return the snapshot).
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/milestones/<uuid:milestone_id>/analytics/",
        MilestoneAnalyticsEndpoint.as_view(),
        name="project-milestone-analytics",
    ),
]
