# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import status
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema, OpenApiResponse

# Module imports
from .base import BaseAPIView
from plane.api.serializers import LabelSerializer, StateSerializer
from plane.app.permissions import WorkspaceEntityPermission, WorkspaceViewerPermission
from plane.db.models import Label, State
from plane.utils.openapi import (
    WORKSPACE_SLUG_PARAMETER,
    FIELDS_PARAMETER,
    EXPAND_PARAMETER,
    UNAUTHORIZED_RESPONSE,
    FORBIDDEN_RESPONSE,
    WORKSPACE_NOT_FOUND_RESPONSE,
)


class WorkspaceLabelsListAPIEndpoint(BaseAPIView):
    """Workspace-wide Label List Endpoint"""

    serializer_class = LabelSerializer
    model = Label
    permission_classes = [WorkspaceViewerPermission]
    use_read_replica = True

    @extend_schema(
        operation_id="list_workspace_labels",
        summary="List workspace labels",
        description="Retrieve all labels across every project in the workspace that the authenticated user is a member of.",  # noqa: E501
        tags=["Labels"],
        parameters=[
            WORKSPACE_SLUG_PARAMETER,
            FIELDS_PARAMETER,
            EXPAND_PARAMETER,
        ],
        responses={
            200: OpenApiResponse(
                description="Workspace labels",
                response=LabelSerializer(many=True),
            ),
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: WORKSPACE_NOT_FOUND_RESPONSE,
        },
    )
    def get(self, request, slug):
        """List workspace labels

        Retrieve all labels across every project in the workspace that the
        authenticated user is a member of.
        """
        labels = Label.objects.filter(
            workspace__slug=slug,
            project__project_projectmember__member=request.user,
            project__project_projectmember__is_active=True,
            project__archived_at__isnull=True,
        ).distinct()
        serializer = LabelSerializer(labels, many=True, fields=self.fields, expand=self.expand)
        return Response(serializer.data, status=status.HTTP_200_OK)


class WorkspaceStatesListAPIEndpoint(BaseAPIView):
    """Workspace-wide State List Endpoint"""

    serializer_class = StateSerializer
    model = State
    permission_classes = [WorkspaceEntityPermission]
    use_read_replica = True

    @extend_schema(
        operation_id="list_workspace_states",
        summary="List workspace states",
        description="Retrieve all workflow states across every project in the workspace that the authenticated user is a member of.",  # noqa: E501
        tags=["States"],
        parameters=[
            WORKSPACE_SLUG_PARAMETER,
            FIELDS_PARAMETER,
            EXPAND_PARAMETER,
        ],
        responses={
            200: OpenApiResponse(
                description="Workspace states",
                response=StateSerializer(many=True),
            ),
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: WORKSPACE_NOT_FOUND_RESPONSE,
        },
    )
    def get(self, request, slug):
        """List workspace states

        Retrieve all workflow states across every project in the workspace
        that the authenticated user is a member of.
        """
        states = State.objects.filter(
            workspace__slug=slug,
            project__project_projectmember__member=request.user,
            project__project_projectmember__is_active=True,
            project__archived_at__isnull=True,
            is_triage=False,
        ).distinct()
        serializer = StateSerializer(states, many=True, fields=self.fields, expand=self.expand)
        return Response(serializer.data, status=status.HTTP_200_OK)
