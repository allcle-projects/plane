# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.api.views import (
    IssueSubscriberListCreateAPIEndpoint,
    IssueSubscriberDetailAPIEndpoint,
    IssueSubscriptionStatusAPIEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/work-items/<uuid:issue_id>/subscribers/",
        IssueSubscriberListCreateAPIEndpoint.as_view(http_method_names=["get", "post"]),
        name="work-item-subscriber-list",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/work-items/<uuid:issue_id>/subscribers/status/",
        IssueSubscriptionStatusAPIEndpoint.as_view(http_method_names=["get"]),
        name="work-item-subscription-status",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/work-items/<uuid:issue_id>/subscribers/<uuid:subscriber_id>/",
        IssueSubscriberDetailAPIEndpoint.as_view(http_method_names=["delete"]),
        name="work-item-subscriber-detail",
    ),
]
