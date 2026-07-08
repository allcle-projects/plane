# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Automations rule engine — mote.
# See docs/mote-design/06-integrations-importers-automations.md, Feature 3.
#
# Per-project rules of the shape "WHEN <trigger> IF <conditions> THEN <actions>".
# Evaluated by plane.bgtasks.automation_task.evaluate_automations, dispatched from
# the issue_activity hot path (plane.bgtasks.issue_activities_task.issue_activity).
# Net-new model/table (no EE equivalent).

# Django imports
from django.db import models

# Module imports
from .project import ProjectBaseModel


class AutomationRule(ProjectBaseModel):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True)
    # "issue.created" | "issue.state.changed" | "issue.priority.changed" |
    # "issue.assignee.changed" | "issue.label.added"
    trigger = models.CharField(max_length=64)
    # [{field, operator, value}], AND-joined.
    conditions = models.JSONField(default=list, blank=True)
    # [{type, params}]
    actions = models.JSONField(default=list, blank=True)
    run_order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "automation_rules"
        ordering = ("run_order", "-created_at")
        verbose_name = "Automation Rule"
        verbose_name_plural = "Automation Rules"
        indexes = [
            models.Index(
                fields=["project", "is_active", "trigger"],
                name="automation_rule_lookup_idx",
            )
        ]

    def __str__(self):
        return f"{self.name} <{self.trigger}>"


class AutomationRuleLog(ProjectBaseModel):
    rule = models.ForeignKey(
        "db.AutomationRule", on_delete=models.CASCADE, related_name="logs"
    )
    issue = models.ForeignKey(
        "db.Issue",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="automation_logs",
    )
    matched = models.BooleanField(default=False)
    actions_run = models.JSONField(default=list, blank=True)
    error = models.TextField(null=True, blank=True)

    class Meta:
        db_table = "automation_rule_logs"
        ordering = ("-created_at",)
        verbose_name = "Automation Rule Log"
        verbose_name_plural = "Automation Rule Logs"

    def __str__(self):
        return f"{self.rule_id} @ {self.created_at} <matched={self.matched}>"
