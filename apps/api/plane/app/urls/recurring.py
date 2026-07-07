# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Recurring work items — mote.
# See docs/mote-design/03-work-item-power.md, section 3.

from django.urls import path

from plane.app.views import (
    RecurringIssueViewSet,
    RecurringIssueRunEndpoint,
)


urlpatterns = [
    # Project-scoped recurrence CRUD.
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/recurring-issues/",
        RecurringIssueViewSet.as_view({"get": "list", "post": "create"}),
        name="recurring-issues",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/recurring-issues/<uuid:pk>/",
        RecurringIssueViewSet.as_view(
            {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
        ),
        name="recurring-issues",
    ),
    # Materialization history for a recurrence.
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/recurring-issues/<uuid:recurring_id>/runs/",
        RecurringIssueRunEndpoint.as_view(),
        name="recurring-issue-runs",
    ),
]
