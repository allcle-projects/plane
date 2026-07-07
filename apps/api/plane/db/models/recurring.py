# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Recurring work items — mote.
# See docs/mote-design/03-work-item-power.md, section 3.
#
# A recurrence attaches a schedule (daily / weekly / monthly / cron) to a shape
# to materialize on cadence. The shape is either a reference to a Template
# (``template``) or an inline ``issue_data`` JSON snapshot (same shape as
# ``Template.template_data`` for a work item, including ``property_values``). A
# celery-beat dispatcher (plane.bgtasks.recurring_issue_task) scans due rows and
# creates a fresh Issue per due recurrence, then advances ``next_run_at``. Each
# materialization is recorded as a RecurringIssueRun for audit. Model + table
# names are net-new (no EE equivalent) but follow the section-3 spec.

# Django imports
from django.contrib.postgres.fields import ArrayField
from django.db import models

# Module imports
from .project import ProjectBaseModel


class RecurringIssue(ProjectBaseModel):
    CADENCE_CHOICES = (
        ("daily", "Daily"),
        ("weekly", "Weekly"),
        ("monthly", "Monthly"),
        ("cron", "Cron"),
    )
    name = models.CharField(max_length=255)
    # Shape source: either a Template reference or an inline issue_data snapshot.
    template = models.ForeignKey(
        "db.Template",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="recurring_issues",
    )
    # Inline shape used when no template is set. Same shape as
    # ``Template.template_data`` for a work item (incl. ``property_values``).
    issue_data = models.JSONField(default=dict, blank=True)
    # Schedule spec.
    cadence = models.CharField(max_length=30, choices=CADENCE_CHOICES)
    cron_expression = models.CharField(max_length=100, null=True, blank=True)
    interval = models.PositiveIntegerField(default=1)  # every N units
    weekdays = ArrayField(
        models.PositiveSmallIntegerField(), default=list, blank=True
    )  # 0=Monday .. 6=Sunday (Python weekday())
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    max_occurrences = models.PositiveIntegerField(null=True, blank=True)
    occurrence_count = models.PositiveIntegerField(default=0)
    # Next fire time, stored in UTC. The dispatcher scans on this column.
    next_run_at = models.DateTimeField(db_index=True)
    last_run_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Recurring Issue"
        verbose_name_plural = "Recurring Issues"
        db_table = "recurring_issues"
        ordering = ("-created_at",)
        indexes = [
            models.Index(
                fields=["is_active", "next_run_at"],
                name="recurring_active_nextrun_idx",
            )
        ]

    def __str__(self):
        return f"{self.name} <{self.cadence}>"


class RecurringIssueRun(ProjectBaseModel):
    # Audit of each auto-create performed by the dispatcher.
    recurring = models.ForeignKey(
        "db.RecurringIssue",
        related_name="runs",
        on_delete=models.CASCADE,
    )
    issue = models.ForeignKey(
        "db.Issue",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="recurring_runs",
    )
    run_at = models.DateTimeField()
    status = models.CharField(max_length=30, default="success")  # success|failed
    error = models.TextField(blank=True)

    class Meta:
        verbose_name = "Recurring Issue Run"
        verbose_name_plural = "Recurring Issue Runs"
        db_table = "recurring_issue_runs"
        ordering = ("-run_at",)

    def __str__(self):
        return f"{self.recurring_id} @ {self.run_at} <{self.status}>"
