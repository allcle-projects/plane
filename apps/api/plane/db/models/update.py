# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Updates — mote.
# See docs/mote-design/04-planning-hierarchy.md, section 4.
#
# An Update is a periodic status post (health colour + rich text + optional
# completion %) attached to *exactly one* parent: a project, a cycle or an
# initiative. It renders as a reverse-chronological timeline on the parent's
# detail page (frontend is P2). Because the parent varies across three
# entities (one of which — Initiative — is workspace-scoped) this extends
# ``BaseModel`` (workspace-scoped), not ``ProjectBaseModel``. A CheckConstraint
# enforces that exactly one parent FK is set.

# Django imports
from django.db import models
from django.db.models import Q

# Module imports
from .base import BaseModel


class UpdateStatus(models.TextChoices):
    ON_TRACK = "on-track", "On Track"
    AT_RISK = "at-risk", "At Risk"
    OFF_TRACK = "off-track", "Off Track"


class EntityUpdate(BaseModel):
    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="workspace_updates",
    )
    # Exactly one of the three parent FKs below is set (enforced by the
    # CheckConstraint and by the view, which sets it from the URL).
    project = models.ForeignKey(
        "db.Project",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="project_updates",
    )
    cycle = models.ForeignKey(
        "db.Cycle",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="cycle_updates",
    )
    initiative = models.ForeignKey(
        "db.Initiative",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="initiative_updates",
    )
    status = models.CharField(
        max_length=20,
        choices=UpdateStatus.choices,
        default=UpdateStatus.ON_TRACK,
    )
    description = models.TextField(blank=True)
    description_html = models.JSONField(blank=True, null=True)
    completed_percentage = models.FloatField(default=0)

    class Meta:
        verbose_name = "Update"
        verbose_name_plural = "Updates"
        db_table = "entity_updates"
        ordering = ("-created_at",)
        constraints = [
            models.CheckConstraint(
                name="entity_update_exactly_one_parent",
                check=(
                    Q(project__isnull=False, cycle__isnull=True, initiative__isnull=True)
                    | Q(project__isnull=True, cycle__isnull=False, initiative__isnull=True)
                    | Q(project__isnull=True, cycle__isnull=True, initiative__isnull=False)
                ),
            )
        ]

    def __str__(self):
        return f"{self.status} <{self.id}>"
