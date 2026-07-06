# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from plane.db.models import IssueWorklog


class IssueWorklogSerializer(BaseSerializer):
    # logged_at defaults to the current time server-side when omitted
    logged_at = serializers.DateTimeField(required=False)

    def validate_duration(self, value):
        if value is None or value <= 0:
            raise serializers.ValidationError("Duration must be a positive number of minutes.")
        return value

    class Meta:
        model = IssueWorklog
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "project",
            "issue",
            "logged_by",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]
