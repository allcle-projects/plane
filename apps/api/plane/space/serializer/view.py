# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Module imports
from .base import BaseSerializer
from plane.db.models import IssueView


class ViewLiteSerializer(BaseSerializer):
    class Meta:
        model = IssueView
        fields = [
            "id",
            "name",
            "description",
            "logo_props",
        ]
        read_only_fields = fields
