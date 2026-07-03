# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.api.views import (
    IssueReactionListCreateAPIEndpoint,
    IssueReactionDetailAPIEndpoint,
    CommentReactionListCreateAPIEndpoint,
    CommentReactionDetailAPIEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/work-items/<uuid:issue_id>/reactions/",
        IssueReactionListCreateAPIEndpoint.as_view(http_method_names=["get", "post"]),
        name="work-item-reaction-list",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/work-items/<uuid:issue_id>/reactions/<str:reaction_code>/",
        IssueReactionDetailAPIEndpoint.as_view(http_method_names=["delete"]),
        name="work-item-reaction-detail",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/comments/<uuid:comment_id>/reactions/",
        CommentReactionListCreateAPIEndpoint.as_view(http_method_names=["get", "post"]),
        name="work-item-comment-reaction-list",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/comments/<uuid:comment_id>/reactions/<str:reaction_code>/",
        CommentReactionDetailAPIEndpoint.as_view(http_method_names=["delete"]),
        name="work-item-comment-reaction-detail",
    ),
]
