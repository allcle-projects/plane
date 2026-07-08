# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Initiatives — mote.
# See docs/mote-design/04-planning-hierarchy.md, section 1.
#
# An Initiative is a workspace-scoped grouping that sits *above* projects:
# ``Initiative -> (Projects + Epics)``. It carries its own name, lead, dates and
# lifecycle status and aggregates the work items of every linked project/epic
# into a rollup ``progress_snapshot`` (computed server-side in P2). Because an
# Initiative spans many projects it extends ``BaseModel`` (workspace-scoped), not
# ``ProjectBaseModel``. Model/table names mirror Plane EE to ease future merges.

# Django imports
from django.conf import settings
from django.db import models
from django.db.models import Q

# Module imports
from .base import BaseModel


class Initiative(BaseModel):
    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="workspace_initiative",
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    description_html = models.JSONField(blank=True, null=True)
    lead = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="initiative_leads",
    )
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=30, default="planned")
    sort_order = models.FloatField(default=65535)
    logo_props = models.JSONField(default=dict)
    # Denormalised rollup cache (completed vs total across linked
    # projects/epics). Populated by the P2 rollup task; default now.
    progress_snapshot = models.JSONField(default=dict)
    external_source = models.CharField(max_length=255, null=True, blank=True)
    external_id = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        verbose_name = "Initiative"
        verbose_name_plural = "Initiatives"
        db_table = "initiatives"
        ordering = ("sort_order",)

    def __str__(self):
        return f"{self.name}"


class InitiativeProject(BaseModel):
    """Join model: Initiative <-> Project (mirrors CycleIssue, cycle.py:104)."""

    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="workspace_initiative_projects",
    )
    initiative = models.ForeignKey(
        Initiative,
        on_delete=models.CASCADE,
        related_name="initiative_projects",
    )
    project = models.ForeignKey(
        "db.Project",
        on_delete=models.CASCADE,
        related_name="project_initiatives",
    )
    sort_order = models.FloatField(default=65535)

    class Meta:
        unique_together = ["initiative", "project", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["initiative", "project"],
                condition=Q(deleted_at__isnull=True),
                name="initiative_project_when_deleted_at_null",
            )
        ]
        verbose_name = "Initiative Project"
        verbose_name_plural = "Initiative Projects"
        db_table = "initiative_projects"
        ordering = ("sort_order",)

    def __str__(self):
        return f"{self.initiative}"


class InitiativeEpic(BaseModel):
    """Join model: Initiative <-> Epic (an Issue whose type is_epic=True)."""

    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="workspace_initiative_epics",
    )
    initiative = models.ForeignKey(
        Initiative,
        on_delete=models.CASCADE,
        related_name="initiative_epics",
    )
    epic = models.ForeignKey(
        "db.Issue",
        on_delete=models.CASCADE,
        related_name="epic_initiatives",
    )

    class Meta:
        unique_together = ["initiative", "epic", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["initiative", "epic"],
                condition=Q(deleted_at__isnull=True),
                name="initiative_epic_when_deleted_at_null",
            )
        ]
        verbose_name = "Initiative Epic"
        verbose_name_plural = "Initiative Epics"
        db_table = "initiative_epics"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.initiative}"
