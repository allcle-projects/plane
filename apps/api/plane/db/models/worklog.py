# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.db import models
from django.db.models import Q

# Module imports
from .project import ProjectBaseModel


class IssueWorklog(ProjectBaseModel):
    """A single logged-time entry against a work item.

    ``duration`` is stored in the canonical unit of **minutes**.
    """

    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="worklogs")
    logged_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="worklogs")
    duration = models.PositiveIntegerField()  # minutes (canonical unit)
    description = models.TextField(blank=True)
    logged_at = models.DateTimeField()  # when the work happened

    def __str__(self):
        return f"{self.issue.name} <{self.duration}m>"

    class Meta:
        verbose_name = "Issue Worklog"
        verbose_name_plural = "Issue Worklogs"
        db_table = "issue_worklogs"
        ordering = ("-logged_at",)
        indexes = [
            models.Index(fields=["issue"], name="issue_worklog_issue_idx"),
            models.Index(fields=["logged_by", "logged_at"], name="issue_worklog_logged_by_idx"),
        ]


class IssueTimer(ProjectBaseModel):
    """A running start/stop timer for a user against a work item.

    On stop, the duration is computed server-side from ``started_at`` and
    persisted as an :class:`IssueWorklog`; the timer is then closed.
    """

    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="timers")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="issue_timers")
    started_at = models.DateTimeField()
    is_running = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.issue.name} <{self.user_id}>"

    class Meta:
        verbose_name = "Issue Timer"
        verbose_name_plural = "Issue Timers"
        db_table = "issue_timers"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["user", "issue"],
                condition=Q(is_running=True, deleted_at__isnull=True),
                name="one_running_timer_per_user_issue",
            )
        ]
