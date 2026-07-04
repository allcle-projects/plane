# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Integrations — Option B (webhooks + task-bot) mapping routes (mote) — see
# docs/mote-design/06-integrations-importers-automations.md, Feature 1, §1.3.

from django.urls import path

from plane.app.views import (
    SlackProjectSyncEndpoint,
    GithubRepositorySyncEndpoint,
)


urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/slack-syncs/",
        SlackProjectSyncEndpoint.as_view(),
        name="slack-project-sync",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/slack-syncs/<uuid:pk>/",
        SlackProjectSyncEndpoint.as_view(),
        name="slack-project-sync",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/github-repository-syncs/",
        GithubRepositorySyncEndpoint.as_view(),
        name="github-repository-sync",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/github-repository-syncs/<uuid:pk>/",
        GithubRepositorySyncEndpoint.as_view(),
        name="github-repository-sync",
    ),
]
