# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Milestones — mote.
# See docs/mote-design/04-planning-hierarchy.md, section 2 ("Milestones").
#
# A Milestone is a time-boxed goal *within a project* (optionally tied to a
# Cycle) with work items attached and a completed/total progress rollup. It is a
# near-clone of Module (module.py) / Cycle (cycle.py): ``Milestone`` extends
# ``ProjectBaseModel`` (project.py:186, auto-fills ``workspace`` from ``project``)
# and ``MilestoneIssue`` is the join model mirroring ``CycleIssue``/``ModuleIssue``.
# The denormalised ``progress_snapshot`` (cf. cycle.py:74) caches the rollup so
# list/detail reads stay cheap and never aggregate live.

# Django imports
from django.conf import settings
from django.db import models
from django.db.models import Q

# Module imports
from .project import ProjectBaseModel


class Milestone(ProjectBaseModel):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    start_date = models.DateField(null=True, blank=True)
    target_date = models.DateField(null=True, blank=True)
    cycle = models.ForeignKey(
        "db.Cycle",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cycle_milestones",
    )
    # Plain CharField mirroring ModuleStatus (module.py:59) without hard choices;
    # defaults to "planned".
    status = models.CharField(max_length=20, default="planned")
    owned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="owned_milestones",
    )
    sort_order = models.FloatField(default=65535)
    # Denormalised rollup cache (completed vs total across linked work items).
    # Populated by plane.bgtasks.milestone_rollup_task; default now.
    progress_snapshot = models.JSONField(default=dict)
    external_source = models.CharField(max_length=255, null=True, blank=True)
    external_id = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        verbose_name = "Milestone"
        verbose_name_plural = "Milestones"
        db_table = "milestones"
        ordering = ("target_date", "sort_order")

    def __str__(self):
        return f"{self.name} {self.target_date}"


class MilestoneIssue(ProjectBaseModel):
    """Join model: Milestone <-> Issue (exact CycleIssue/ModuleIssue shape)."""

    milestone = models.ForeignKey(
        Milestone,
        on_delete=models.CASCADE,
        related_name="milestone_issues",
    )
    issue = models.ForeignKey(
        "db.Issue",
        on_delete=models.CASCADE,
        related_name="issue_milestone",
    )

    class Meta:
        unique_together = ["milestone", "issue", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["milestone", "issue"],
                condition=Q(deleted_at__isnull=True),
                name="milestone_issue_when_deleted_at_null",
            )
        ]
        verbose_name = "Milestone Issue"
        verbose_name_plural = "Milestone Issues"
        db_table = "milestone_issues"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.milestone.name} {self.issue_id}"
