# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from plane.utils.content_validator import validate_html_content
from plane.db.models import Page, Project, ProjectPage


class PageSerializer(BaseSerializer):
    """
    Page serializer for read operations.

    Provides page details including ownership, access level, lock and
    archive state, and the IDs of the projects the page is linked to.
    """

    project_ids = serializers.ListField(child=serializers.UUIDField(), read_only=True, required=False)

    class Meta:
        model = Page
        fields = [
            "id",
            "name",
            "description_html",
            "access",
            "archived_at",
            "is_locked",
            "owned_by",
            "created_at",
            "updated_at",
            "project_ids",
        ]
        read_only_fields = [
            "id",
            "archived_at",
            "is_locked",
            "owned_by",
            "created_at",
            "updated_at",
            "project_ids",
        ]


class PageCreateSerializer(BaseSerializer):
    """
    Serializer for creating pages with project linkage.

    Handles page creation including workspace resolution from the project
    and automatic project-page linkage for the requesting project.
    """

    class Meta:
        model = Page
        fields = ["name", "description_html", "access"]
        read_only_fields = ["id", "workspace", "owned_by", "created_at", "updated_at"]

    def validate_description_html(self, value):
        """Validate and sanitize the HTML content"""
        if not value:
            return value
        is_valid, error_message, sanitized_html = validate_html_content(value)
        if not is_valid:
            raise serializers.ValidationError(error_message)
        return sanitized_html if sanitized_html is not None else value

    def create(self, validated_data):
        project_id = self.context["project_id"]
        owned_by_id = self.context["owned_by_id"]

        # Get the workspace id from the project
        project = Project.objects.get(pk=project_id)

        # Create the page
        page = Page.objects.create(
            **validated_data,
            owned_by_id=owned_by_id,
            workspace_id=project.workspace_id,
        )

        # Create the project page link
        ProjectPage.objects.create(
            workspace_id=page.workspace_id,
            project_id=project_id,
            page_id=page.id,
            created_by_id=page.created_by_id,
            updated_by_id=page.updated_by_id,
        )

        return page


class PageUpdateSerializer(BaseSerializer):
    """
    Serializer for updating page name, description, and access.

    Locked and archived pages are guarded at the view layer to mirror
    the internal application API's edit restrictions.
    """

    class Meta:
        model = Page
        fields = ["name", "description_html", "access"]
        read_only_fields = ["id", "workspace", "owned_by", "created_at", "updated_at"]

    def validate_description_html(self, value):
        """Validate and sanitize the HTML content"""
        if not value:
            return value
        is_valid, error_message, sanitized_html = validate_html_content(value)
        if not is_valid:
            raise serializers.ValidationError(error_message)
        return sanitized_html if sanitized_html is not None else value
