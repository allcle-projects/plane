# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Initiatives — serializers (mote).
# See docs/mote-design/04-planning-hierarchy.md, section 1.

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from plane.db.models import Initiative, InitiativeProject, InitiativeEpic


class InitiativeSerializer(BaseSerializer):
    # Explicit read_only ``deleted_at`` — same fix applied to TemplateSerializer.
    # Server-managed soft-delete column; never client-writable (deletion goes
    # through the destroy endpoint). Declaring it explicitly also avoids DRF's
    # auto UniqueTogetherValidator (from join models' unique_together on
    # deleted_at) forcing it to be a *required* write field, which would 400
    # create requests with {"deleted_at": ["This field is required."]}.
    deleted_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = Initiative
        fields = "__all__"
        read_only_fields = [
            "workspace",
            # Rollup cache is computed server-side (P2), never client-writable.
            "progress_snapshot",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]


class InitiativeProjectSerializer(BaseSerializer):
    # Explicit read_only ``deleted_at`` — see InitiativeSerializer. Required here
    # because Meta.unique_together on this join model includes ``deleted_at``,
    # which otherwise makes DRF force it to be a required write field.
    deleted_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = InitiativeProject
        fields = "__all__"
        read_only_fields = [
            "workspace",
            # Set from the URL by the endpoint, not the request body.
            "initiative",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]


class InitiativeEpicSerializer(BaseSerializer):
    # Explicit read_only ``deleted_at`` — see InitiativeSerializer. Required here
    # because Meta.unique_together on this join model includes ``deleted_at``,
    # which otherwise makes DRF force it to be a required write field.
    deleted_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = InitiativeEpic
        fields = "__all__"
        read_only_fields = [
            "workspace",
            # Set from the URL by the endpoint, not the request body.
            "initiative",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]
