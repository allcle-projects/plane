# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Integrations — Option B (webhooks + task-bot) mapping serializers (mote) — see
# docs/mote-design/06-integrations-importers-automations.md, Feature 1, §1.3.

# Module imports
from .base import DynamicBaseSerializer
from plane.db.models import SlackProjectSync, GithubRepository


class SlackProjectSyncSerializer(DynamicBaseSerializer):
    """Project ↔ Slack incoming-webhook map (Option B). No OAuth — an admin
    pastes an incoming-webhook URL; the OAuth-only columns stay empty."""

    class Meta:
        model = SlackProjectSync
        fields = "__all__"
        read_only_fields = [
            "id",
            "workspace",
            "project",
            "workspace_integration",
            "access_token",
            "scopes",
            "bot_user_id",
            "data",
            "team_name",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]


class GithubRepositorySerializer(DynamicBaseSerializer):
    """Project ↔ GitHub repository map (Option B). Records `owner`/`name` so the
    task-bot bridge knows which project a repo's PR/issue references belong to."""

    class Meta:
        model = GithubRepository
        fields = "__all__"
        read_only_fields = [
            "id",
            "workspace",
            "project",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]
