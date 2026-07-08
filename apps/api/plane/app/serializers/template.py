# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Templates (work item + project templates) — mote.
# See docs/mote-design/03-work-item-power.md, section 2.

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from plane.db.models import Template


class TemplateSerializer(BaseSerializer):
    # `deleted_at` is part of the model's unique_together (so a soft-deleted row
    # can be recreated). With fields="__all__" DRF would otherwise auto-build a
    # UniqueTogetherValidator that forces `deleted_at` to be a *required* write
    # field, breaking every create (400 {"deleted_at": ["required"]}). Declaring
    # it read_only drops that validator; the conditional DB UniqueConstraint
    # (deleted_at IS NULL) still guarantees name uniqueness among live rows.
    deleted_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = Template
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]
