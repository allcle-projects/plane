# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Templates (work item + project templates) — mote.
# See docs/mote-design/03-work-item-power.md, section 2.
#
# A single workspace-scoped model holds both work item and project templates,
# discriminated by ``template_type``. ``template_data`` is a plain JSON snapshot
# (not FKs) so a template survives deletion of the state/label/assignee it
# references and stays portable across projects; IDs are resolved-or-dropped at
# apply time. Table name mirrors Plane EE (``templates``) to ease future merges.

# Django imports
from django.db import models
from django.db.models import Q

# Module imports
from .workspace import WorkspaceBaseModel


class Template(WorkspaceBaseModel):
    TEMPLATE_TYPES = (
        ("work_item", "Work Item"),
        ("project", "Project"),
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    template_type = models.CharField(max_length=30, choices=TEMPLATE_TYPES)
    # Snapshot of the captured shape. For a work item:
    #   {name, description_html, priority, state_id, label_ids, assignee_ids,
    #    estimate_point_id, type_id, property_values: {property_id: [values]}}
    # For a project: {project, states, labels, modules, views, members_roles}.
    template_data = models.JSONField(default=dict)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Template"
        verbose_name_plural = "Templates"
        db_table = "templates"
        ordering = ("-created_at",)
        unique_together = ["workspace", "name", "template_type", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "name", "template_type"],
                condition=Q(deleted_at__isnull=True),
                name="template_unique_name_type_per_workspace_when_deleted_at_null",
            )
        ]

    def __str__(self):
        return f"{self.name} <{self.template_type}>"
