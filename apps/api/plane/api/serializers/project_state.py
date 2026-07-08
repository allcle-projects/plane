# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Project States — public v1 API serializer (mote).
# See docs/mote-design/04-planning-hierarchy.md, section 3 ("Project States").

# Module imports
from .base import BaseSerializer
from plane.db.models import ProjectState


class ProjectStateSerializer(BaseSerializer):
    """Serializer for workspace-level project states (mote)."""

    class Meta:
        model = ProjectState
        fields = "__all__"
        read_only_fields = [
            "id",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
            "workspace",
            "deleted_at",
        ]
