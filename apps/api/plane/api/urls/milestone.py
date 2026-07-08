# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Milestones — public v1 API urls (mote).
# See docs/mote-design/04-planning-hierarchy.md, section 2 ("Milestones").

from django.urls import path

from plane.api.views import (
    MilestoneListCreateAPIEndpoint,
    MilestoneDetailAPIEndpoint,
    MilestoneIssueListCreateAPIEndpoint,
    MilestoneIssueDetailAPIEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/milestones/",
        MilestoneListCreateAPIEndpoint.as_view(http_method_names=["get", "post"]),
        name="milestones",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/milestones/<uuid:pk>/",
        MilestoneDetailAPIEndpoint.as_view(http_method_names=["get", "patch", "delete"]),
        name="milestones-detail",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/milestones/<uuid:milestone_id>/milestone-issues/",
        MilestoneIssueListCreateAPIEndpoint.as_view(http_method_names=["get", "post"]),
        name="milestone-issues",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/milestones/<uuid:milestone_id>/milestone-issues/<uuid:issue_id>/",
        MilestoneIssueDetailAPIEndpoint.as_view(http_method_names=["delete"]),
        name="milestone-issues-detail",
    ),
]
