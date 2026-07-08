# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Milestones — public v1 API serializers (mote).
# See docs/mote-design/04-planning-hierarchy.md, section 2 ("Milestones").

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from plane.db.models import Milestone, MilestoneIssue


class MilestoneSerializer(BaseSerializer):
    # Server-managed soft-delete + rollup cache columns; never client-writable.
    deleted_at = serializers.DateTimeField(read_only=True)
    progress_snapshot = serializers.JSONField(read_only=True)

    class Meta:
        model = Milestone
        fields = "__all__"
        read_only_fields = [
            "id",
            "workspace",
            "project",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]


class MilestoneIssueSerializer(BaseSerializer):
    # Explicit read_only ``deleted_at`` — REQUIRED because Meta.unique_together on
    # this join model includes ``deleted_at`` (otherwise DRF forces it required
    # and 400s create requests).
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
