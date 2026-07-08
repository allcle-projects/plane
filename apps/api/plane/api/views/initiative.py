# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Initiatives — public v1 API (mote).
# See docs/mote-design/04-planning-hierarchy.md, section 1.
#
# X-API-Key authenticated, workspace-scoped CRUD for Initiatives, mirroring the
# cycle public API (api/views/cycle.py). Reuses the app InitiativeSerializer.
# Join (project/epic) management stays app/-only for P1.

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .base import BaseAPIView
from plane.app.permissions import WorkspaceEntityPermission
from plane.app.serializers import InitiativeSerializer
from plane.db.models import Initiative, Workspace


class InitiativeListCreateAPIEndpoint(BaseAPIView):
    """Initiative List and Create Endpoint (public v1)."""

    serializer_class = InitiativeSerializer
    model = Initiative
    permission_classes = [WorkspaceEntityPermission]
    use_read_replica = True

    def get_queryset(self):
        return (
            Initiative.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .select_related("workspace", "lead")
            .order_by(self.kwargs.get("order_by", "sort_order"))
        )

    def get(self, request, slug):
        return self.paginate(
            request=request,
            queryset=self.get_queryset(),
            on_results=lambda initiatives: InitiativeSerializer(
                initiatives, many=True
            ).data,
        )

    def post(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        serializer = InitiativeSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(
                workspace_id=workspace.id,
                created_by_id=request.user.id,
                updated_by_id=request.user.id,
            )
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class InitiativeDetailAPIEndpoint(BaseAPIView):
    """Initiative Retrieve, Update and Delete Endpoint (public v1)."""

    serializer_class = InitiativeSerializer
    model = Initiative
    permission_classes = [WorkspaceEntityPermission]
    use_read_replica = True

    def get_queryset(self):
        return Initiative.objects.filter(
            workspace__slug=self.kwargs.get("slug")
        ).select_related("workspace", "lead")

    def get(self, request, slug, pk):
        initiative = self.get_queryset().get(pk=pk)
        serializer = InitiativeSerializer(initiative)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, slug, pk):
        initiative = self.get_queryset().get(pk=pk)
        serializer = InitiativeSerializer(initiative, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save(updated_by_id=request.user.id)
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, slug, pk):
        initiative = self.get_queryset().get(pk=pk)
        initiative.delete()  # soft-delete (deleted_at)
        return Response(status=status.HTTP_204_NO_CONTENT)
