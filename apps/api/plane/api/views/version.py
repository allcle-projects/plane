# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import status
from rest_framework.response import Response
from drf_spectacular.utils import OpenApiResponse

# Module imports
from .base import BaseAPIView
from plane.api.serializers import (
    IssueDescriptionVersionSerializer,
    IssueDescriptionVersionDetailSerializer,
)
from plane.app.permissions import ProjectEntityPermission
from plane.db.models import IssueDescriptionVersion
from plane.utils.openapi import (
    version_docs,
    ISSUE_ID_PARAMETER,
    VERSION_PK_PARAMETER,
    CURSOR_PARAMETER,
    PER_PAGE_PARAMETER,
    FIELDS_PARAMETER,
    EXPAND_PARAMETER,
    create_paginated_response,
    ISSUE_NOT_FOUND_RESPONSE,
)


class IssueDescriptionVersionListAPIEndpoint(BaseAPIView):
    """Work Item Description Version List Endpoint (read-only)"""

    serializer_class = IssueDescriptionVersionSerializer
    model = IssueDescriptionVersion
    permission_classes = [ProjectEntityPermission]
    use_read_replica = True

    def get_queryset(self):
        return (
            IssueDescriptionVersion.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(issue_id=self.kwargs.get("issue_id"))
            .filter(
                project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True,
            )
            .filter(project__archived_at__isnull=True)
            .order_by(self.kwargs.get("order_by", "-created_at"))
            .distinct()
        )

    @version_docs(
        operation_id="list_work_item_description_versions",
        description="Retrieve the description version history of a work item (read-only).",
        parameters=[
            ISSUE_ID_PARAMETER,
            CURSOR_PARAMETER,
            PER_PAGE_PARAMETER,
            FIELDS_PARAMETER,
            EXPAND_PARAMETER,
        ],
        responses={
            200: create_paginated_response(
                IssueDescriptionVersionSerializer,
                "PaginatedIssueDescriptionVersionResponse",
                "Paginated list of work item description versions",
                "Paginated Work Item Description Versions",
            ),
            404: ISSUE_NOT_FOUND_RESPONSE,
        },
    )
    def get(self, request, slug, project_id, issue_id):
        """List work item description versions

        Retrieve the description version history of a work item. This is a
        read-only endpoint mirroring the internal version tracking system.
        """
        return self.paginate(
            request=request,
            queryset=(self.get_queryset()),
            on_results=lambda versions: (
                IssueDescriptionVersionSerializer(versions, many=True, fields=self.fields, expand=self.expand).data
            ),
        )


class IssueDescriptionVersionDetailAPIEndpoint(BaseAPIView):
    """Work Item Description Version Detail Endpoint (read-only)"""

    serializer_class = IssueDescriptionVersionDetailSerializer
    model = IssueDescriptionVersion
    permission_classes = [ProjectEntityPermission]
    use_read_replica = True

    def get_queryset(self):
        return (
            IssueDescriptionVersion.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(issue_id=self.kwargs.get("issue_id"))
            .filter(
                project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True,
            )
            .filter(project__archived_at__isnull=True)
            .distinct()
        )

    @version_docs(
        operation_id="retrieve_work_item_description_version",
        description="Retrieve a specific work item description version, including the full description payload.",
        parameters=[
            ISSUE_ID_PARAMETER,
            VERSION_PK_PARAMETER,
        ],
        responses={
            200: OpenApiResponse(
                description="Work item description version details",
                response=IssueDescriptionVersionDetailSerializer,
            ),
            404: ISSUE_NOT_FOUND_RESPONSE,
        },
    )
    def get(self, request, slug, project_id, issue_id, pk):
        """Retrieve work item description version

        Retrieve a specific work item description version, including the
        full description payload (binary, html, stripped text, and json).
        """
        issue_description_version = self.get_queryset().get(pk=pk)
        serializer = IssueDescriptionVersionDetailSerializer(issue_description_version)
        return Response(serializer.data, status=status.HTTP_200_OK)
