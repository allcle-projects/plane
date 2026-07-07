# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Custom Fields / Work Item Properties — mote.
# See docs/mote-design/03-work-item-power.md, section 1 (Phase 1).
#
# Definition + child-option shape mirrors Estimate / EstimatePoint
# (db/models/estimate.py). Table names mirror Plane EE
# (issue_properties, issue_property_options, issue_property_values)
# to ease future upstream merges.

# Django imports
from django.contrib.postgres.fields import ArrayField
from django.db import models
from django.db.models import Q

# Module imports
from .workspace import WorkspaceBaseModel  # workspace-scoped, nullable project


class PropertyTypeEnum(models.TextChoices):
    TEXT = "TEXT", "Text"
    NUMBER = "NUMBER", "Number"
    SELECT = "SELECT", "Select"
    MULTI_SELECT = "MULTI_SELECT", "Multi Select"
    DATE = "DATE", "Date"
    MEMBER = "MEMBER", "Member"
    BOOLEAN = "BOOLEAN", "Boolean"
    URL = "URL", "URL"


class IssueProperty(WorkspaceBaseModel):
    """A custom-field definition attached to a work item type (IssueType)."""

    issue_type = models.ForeignKey(
        "db.IssueType", on_delete=models.CASCADE, related_name="properties"
    )
    name = models.CharField(max_length=255)  # internal
    display_name = models.CharField(max_length=255)  # UI label
    description = models.TextField(blank=True)
    property_type = models.CharField(max_length=30, choices=PropertyTypeEnum.choices)
    relation_type = models.CharField(max_length=30, null=True, blank=True)  # MEMBER/RELATION subtype
    is_required = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    is_multi = models.BooleanField(default=False)  # multi-select / multi-value
    default_value = ArrayField(models.TextField(), default=list, blank=True)
    settings = models.JSONField(default=dict)  # {min, max, format, ...}
    sort_order = models.FloatField(default=65535)
    external_source = models.CharField(max_length=255, null=True, blank=True)
    external_id = models.CharField(max_length=255, null=True, blank=True)

    def __str__(self):
        return f"{self.display_name} <{self.property_type}>"

    class Meta:
        verbose_name = "Issue Property"
        verbose_name_plural = "Issue Properties"
        db_table = "issue_properties"
        ordering = ("sort_order",)
        unique_together = ["issue_type", "name", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["issue_type", "name"],
                condition=Q(deleted_at__isnull=True),
                name="issue_property_unique_type_name_when_deleted_at_null",
            )
        ]


class IssuePropertyOption(WorkspaceBaseModel):
    """An option for a SELECT / MULTI_SELECT property (with cascading support)."""

    property = models.ForeignKey(
        "db.IssueProperty", on_delete=models.CASCADE, related_name="options"
    )
    name = models.CharField(max_length=255)
    sort_order = models.FloatField(default=65535)
    is_active = models.BooleanField(default=True)
    is_default = models.BooleanField(default=False)
    parent = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.CASCADE, related_name="children"
    )  # cascading selects
    external_source = models.CharField(max_length=255, null=True, blank=True)
    external_id = models.CharField(max_length=255, null=True, blank=True)

    def __str__(self):
        return f"{self.property.display_name} <{self.name}>"

    class Meta:
        verbose_name = "Issue Property Option"
        verbose_name_plural = "Issue Property Options"
        db_table = "issue_property_options"
        ordering = ("sort_order",)


class IssuePropertyValue(WorkspaceBaseModel):
    """A single typed value on a work item (one row per value; multi = N rows).

    Typed-column EAV: exactly one ``value_*`` column is populated based on the
    parent property's ``property_type``. No value endpoints ship in Phase 1 —
    the table is created now for use in Phase 2.
    """

    property = models.ForeignKey(
        "db.IssueProperty", on_delete=models.CASCADE, related_name="values"
    )
    issue = models.ForeignKey(
        "db.Issue", on_delete=models.CASCADE, related_name="property_values"
    )
    # exactly one of the following is populated based on property_type:
    value_text = models.TextField(null=True, blank=True)
    value_decimal = models.DecimalField(max_digits=20, decimal_places=6, null=True, blank=True)
    value_datetime = models.DateTimeField(null=True, blank=True)
    value_boolean = models.BooleanField(null=True)
    value_uuid = models.UUIDField(null=True)  # member id / option id
    value_option = models.ForeignKey(
        "db.IssuePropertyOption",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="value_entries",
    )

    def __str__(self):
        return f"{self.issue_id} <{self.property_id}>"

    class Meta:
        verbose_name = "Issue Property Value"
        verbose_name_plural = "Issue Property Values"
        db_table = "issue_property_values"
        indexes = [
            models.Index(fields=["issue", "property"], name="issue_prop_value_issue_idx"),
            models.Index(fields=["property", "value_uuid"], name="issue_prop_value_uuid_idx"),
            models.Index(fields=["property", "value_option"], name="issue_prop_value_option_idx"),
        ]
