# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Updates — public v1 API (mote).
# See docs/mote-design/04-planning-hierarchy.md, section 4.
#
# X-API-Key authenticated, project-scoped CRUD for Updates, mirroring the cycle
# public API (api/views/cycle.py). Reuses the app EntityUpdateSerializer. The
# parent project is derived from the URL (never the body), so the "exactly one
# parent" CheckConstraint is safe. Cycle/initiative scopes stay app/-only for P1.

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .base import BaseAPIView
from plane.app.permissions import ProjectEntityPermission
from plane.app.serializers import EntityUpdateSerializer
from plane.db.models import EntityUpdate, Project


class ProjectUpdateListCreateAPIEndpoint(BaseAPIView):
    """Project Update List and Create Endpoint (public v1)."""

    serializer_class = EntityUpdateSerializer
    model = EntityUpdate
    permission_classes = [ProjectEntityPermission]
    use_read_replica = True

    def get_queryset(self):
        return EntityUpdate.objects.filter(
            workspace__slug=self.kwargs.get("slug"),
            project_id=self.kwargs.get("project_id"),
        ).select_related("workspace", "project")

    def get(self, request, slug, project_id):
        return self.paginate(
            request=request,
            queryset=self.get_queryset(),
            on_results=lambda updates: EntityUpdateSerializer(
                updates, many=True
            ).data,
        )

    def post(self, request, slug, project_id):
        project = Project.objects.get(pk=project_id, workspace__slug=slug)
        serializer = EntityUpdateSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(
                workspace_id=project.workspace_id,
                project_id=project_id,
                created_by_id=request.user.id,
                updated_by_id=request.user.id,
            )
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ProjectUpdateDetailAPIEndpoint(BaseAPIView):
    """Project Update Retrieve, Update and Delete Endpoint (public v1)."""

    serializer_class = EntityUpdateSerializer
    model = EntityUpdate
    permission_classes = [ProjectEntityPermission]
    use_read_replica = True

    def get_queryset(self):
        return EntityUpdate.objects.filter(
            workspace__slug=self.kwargs.get("slug"),
            project_id=self.kwargs.get("project_id"),
        ).select_related("workspace", "project")

    def get(self, request, slug, project_id, pk):
        entity_update = self.get_queryset().get(pk=pk)
        serializer = EntityUpdateSerializer(entity_update)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, slug, project_id, pk):
        entity_update = self.get_queryset().get(pk=pk)
        serializer = EntityUpdateSerializer(
            entity_update, data=request.data, partial=True
        )
        if serializer.is_valid():
            serializer.save(updated_by_id=request.user.id)
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, slug, project_id, pk):
        entity_update = self.get_queryset().get(pk=pk)
        entity_update.delete()  # soft-delete (deleted_at)
        return Response(status=status.HTTP_204_NO_CONTENT)
