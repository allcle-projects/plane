# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Milestones — serializers (mote).
# See docs/mote-design/04-planning-hierarchy.md, section 2 ("Milestones").

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from plane.db.models import Milestone, MilestoneIssue


class MilestoneSerializer(BaseSerializer):
    # Server-managed soft-delete column; never client-writable. Declared
    # explicitly for hygiene/consistency with the join serializer below (cf.
    # InitiativeSerializer / TemplateSerializer).
    deleted_at = serializers.DateTimeField(read_only=True)
    # Rollup cache is computed server-side (milestone_rollup_task), never
    # client-writable.
    progress_snapshot = serializers.JSONField(read_only=True)

    class Meta:
        model = Milestone
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "project",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]


class MilestoneIssueSerializer(BaseSerializer):
    # Explicit read_only ``deleted_at`` — REQUIRED here because Meta.unique_together
    # on this join model includes ``deleted_at``, which otherwise makes DRF's
    # auto UniqueTogetherValidator force it to be a *required* write field and 400
    # create requests with {"deleted_at": ["This field is required."]}. (Same
    # hard-won bug hit on Templates/Initiatives — do NOT remove.)
    deleted_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = MilestoneIssue
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "project",
            "milestone",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]
