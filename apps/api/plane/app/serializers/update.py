# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Updates — serializers (mote).
# See docs/mote-design/04-planning-hierarchy.md, section 4.

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from plane.db.models import EntityUpdate


class EntityUpdateSerializer(BaseSerializer):
    # Explicit read_only ``deleted_at`` — same fix applied to Initiative/Template
    # serializers. Server-managed soft-delete column; never client-writable
    # (deletion goes through the destroy endpoint).
    deleted_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = EntityUpdate
        fields = "__all__"
        read_only_fields = [
            "workspace",
            # Parent FKs are set from the URL by the endpoint (exactly one),
            # never the request body — this also keeps the CheckConstraint safe.
            "project",
            "cycle",
            "initiative",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]

    def validate(self, data):
        completed_percentage = data.get("completed_percentage")
        if completed_percentage is not None and not (
            0 <= completed_percentage <= 100
        ):
            raise serializers.ValidationError(
                {"completed_percentage": "Must be between 0 and 100."}
            )
        return data
