# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports

# Django imports
from django.db import models

# Module imports
from plane.db.models.project import ProjectBaseModel


class SlackProjectSync(ProjectBaseModel):
    # OAuth-only fields — unused in the lightweight (Option B) mapping flow where
    # an admin simply pastes an incoming-webhook URL. Kept for the native OAuth
    # path (Option A) but made optional so the table doubles as a plain map.
    access_token = models.CharField(max_length=300, blank=True, default="")
    scopes = models.TextField(blank=True, default="")
    bot_user_id = models.CharField(max_length=50, blank=True, default="")
    webhook_url = models.URLField(max_length=1000)
    # Optional human-readable channel label (the incoming webhook already binds
    # to a channel; this is for display/reference only).
    channel = models.CharField(max_length=300, blank=True, default="")
    data = models.JSONField(default=dict)
    team_id = models.CharField(max_length=30, blank=True, default="")
    team_name = models.CharField(max_length=300, blank=True, default="")
    workspace_integration = models.ForeignKey(
        "db.WorkspaceIntegration",
        related_name="slack_syncs",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    def __str__(self):
        """Return the repo name"""
        return f"{self.project.name}"

    class Meta:
        unique_together = ["team_id", "project"]
        verbose_name = "Slack Project Sync"
        verbose_name_plural = "Slack Project Syncs"
        db_table = "slack_project_syncs"
        ordering = ("-created_at",)
