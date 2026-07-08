# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Project States — serializers (mote).
# See docs/mote-design/04-planning-hierarchy.md, section 3 ("Project States").

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from plane.db.models import ProjectState


class ProjectStateSerializer(BaseSerializer):
    # Explicit read_only ``deleted_at`` — REQUIRED because Meta.unique_together
    # on ProjectState includes ``deleted_at``, which otherwise makes DRF's auto
    # UniqueTogetherValidator force it to be a *required* write field and 400
    # create requests with {"deleted_at": ["This field is required."]}. (Same
    # hard-won bug hit on Milestones/Templates/Initiatives — do NOT remove.)
    deleted_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = ProjectState
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]
