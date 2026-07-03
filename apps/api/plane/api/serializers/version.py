# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Module imports
from .base import BaseSerializer
from plane.db.models import IssueDescriptionVersion


class IssueDescriptionVersionSerializer(BaseSerializer):
    """
    Lightweight serializer for listing work item description versions.

    Mirrors the internal WorkItemDescriptionVersionEndpoint list response, which
    excludes the (potentially large) description payload fields.
    """

    class Meta:
        model = IssueDescriptionVersion
        fields = [
            "id",
            "workspace",
            "project",
            "issue",
            "last_saved_at",
            "owned_by",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = fields


class IssueDescriptionVersionDetailSerializer(BaseSerializer):
    """
    Serializer for retrieving a single work item description version, including
    the full description payload (binary, html, stripped text, and json).

    Mirrors the internal IssueDescriptionVersionDetailSerializer.
    """

    class Meta:
        model = IssueDescriptionVersion
        fields = [
            "id",
            "workspace",
            "project",
            "issue",
            "description_binary",
            "description_html",
            "description_stripped",
            "description_json",
            "last_saved_at",
            "owned_by",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = fields
