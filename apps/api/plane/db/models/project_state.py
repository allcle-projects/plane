# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Project States — mote.
# See docs/mote-design/04-planning-hierarchy.md, section 3 ("Project States").
#
# A workspace-level status for *projects* (so the projects list can be grouped
# or kanban'd by status). This is a near-clone of the issue ``State`` model
# (state.py:79 ``State`` / state.py:14 ``StateGroup`` / state.py:24
# ``DEFAULT_STATES``) but keyed to the **workspace** (via ``BaseModel``,
# base.py:17) instead of a project, and namespaced strictly as ``ProjectState``
# to avoid any collision with the issue ``State``.

# Django imports
from django.db import models

# Module imports
from .base import BaseModel


class ProjectStateGroup(models.TextChoices):
    # Mirror StateGroup (state.py:14), tuned to the project life-cycle.
    BACKLOG = "backlog", "Backlog"
    PLANNED = "planned", "Planned"
    EXECUTION = "execution", "Execution"
    MONITORING = "monitoring", "Monitoring"
    COMPLETED = "completed", "Completed"
    CANCELLED = "cancelled", "Cancelled"


# Default project states seeded per workspace. Mirror DEFAULT_STATES
# (state.py:24) — one entry per group, colors drawn from the issue-state palette.
DEFAULT_PROJECT_STATES = [
    {
        "name": "Backlog",
        "color": "#A3A3A3",
        "sequence": 15000,
        "group": ProjectStateGroup.BACKLOG.value,
        "default": False,
    },
    {
        "name": "Planned",
        "color": "#60646C",
        "sequence": 25000,
        "group": ProjectStateGroup.PLANNED.value,
        "default": True,
    },
    {
        "name": "Execution",
        "color": "#F59E0B",
        "sequence": 35000,
        "group": ProjectStateGroup.EXECUTION.value,
        "default": False,
    },
    {
        "name": "Monitoring",
        "color": "#3B82F6",
        "sequence": 45000,
        "group": ProjectStateGroup.MONITORING.value,
        "default": False,
    },
    {
        "name": "Completed",
        "color": "#46A758",
        "sequence": 55000,
        "group": ProjectStateGroup.COMPLETED.value,
        "default": False,
    },
    {
        "name": "Cancelled",
        "color": "#9AA4BC",
        "sequence": 65000,
        "group": ProjectStateGroup.CANCELLED.value,
        "default": False,
    },
]


class ProjectState(BaseModel):
    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="workspace_project_states",
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    color = models.CharField(max_length=255)
    group = models.CharField(
        choices=ProjectStateGroup.choices,
        default=ProjectStateGroup.PLANNED,
        max_length=20,
    )
    sequence = models.FloatField(default=65535)
    default = models.BooleanField(default=False)

    def __str__(self):
        """Return name of the project state"""
        return f"{self.name} <{self.workspace.name}>"

    class Meta:
        unique_together = ["name", "workspace", "deleted_at"]
        verbose_name = "Project State"
        verbose_name_plural = "Project States"
        db_table = "project_states"
        ordering = ("sequence",)

    def save(self, *args, **kwargs):
        # Auto-assign an incrementing sequence within the workspace, mirroring
        # State.save (state.py:117).
        if self._state.adding:
            largest = ProjectState.objects.filter(workspace=self.workspace).aggregate(
                largest=models.Max("sequence")
            )["largest"]
            self.sequence = (largest + 15000) if largest is not None else 15000
        return super().save(*args, **kwargs)
