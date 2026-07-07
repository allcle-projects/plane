# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Templates (work item + project templates) — mote.
# See docs/mote-design/03-work-item-power.md, section 2.

# Module imports
from .base import BaseSerializer
from plane.db.models import Template


class TemplateSerializer(BaseSerializer):
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
