# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Project States — public v1 API (mote).
# See docs/mote-design/04-planning-hierarchy.md, section 3 ("Project States").
#
# X-API-Key authenticated CRUD for workspace-level ProjectState, cloning the
# issue-state public endpoint (api/views/state.py) but scoped to the WORKSPACE
# (no project_id), under /api/v1/workspaces/<slug>/project-states/...

# Django imports
from django.db import IntegrityError

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.api.serializers import ProjectStateSerializer
from plane.app.permissions import WorkspaceEntityPermission
from plane.db.models import ProjectState, Workspace

from .base import BaseAPIView


class ProjectStateListCreateAPIEndpoint(BaseAPIView):
    """Project State List and Create Endpoint"""

    serializer_class = ProjectStateSerializer
    model = ProjectState
    permission_classes = [WorkspaceEntityPermission]
    use_read_replica = True

    def get_queryset(self):
        return (
            ProjectState.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .select_related("workspace")
            .order_by(self.kwargs.get("order_by", "sequence"))
            .distinct()
        )

    def get(self, request, slug):
        return self.paginate(
            request=request,
            queryset=self.get_queryset(),
            on_results=lambda project_states: ProjectStateSerializer(
                project_states, many=True, fields=self.fields, expand=self.expand
            ).data,
        )

    def post(self, request, slug):
        try:
            workspace = Workspace.objects.get(slug=slug)
            serializer = ProjectStateSerializer(data=request.data)
            if serializer.is_valid():
                serializer.save(
                    workspace_id=workspace.id,
                    created_by_id=request.user.id,
                    updated_by_id=request.user.id,
                )
                return Response(serializer.data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except IntegrityError:
            project_state = ProjectState.objects.filter(
                workspace__slug=slug, name=request.data.get("name")
            ).first()
            return Response(
                {
                    "error": "Project state with the same name already exists in the workspace",
                    "id": str(project_state.id) if project_state else None,
                },
                status=status.HTTP_409_CONFLICT,
            )
        except Workspace.DoesNotExist:
            return Response({"error": "Workspace does not exist"}, status=status.HTTP_404_NOT_FOUND)


class ProjectStateDetailAPIEndpoint(BaseAPIView):
    """Project State Detail Endpoint"""

    serializer_class = ProjectStateSerializer
    model = ProjectState
    permission_classes = [WorkspaceEntityPermission]
    use_read_replica = True

    def get_queryset(self):
        return (
            ProjectState.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .select_related("workspace")
            .distinct()
        )

    def get(self, request, slug, pk):
        serializer = ProjectStateSerializer(
            self.get_queryset().get(pk=pk),
            fields=self.fields,
            expand=self.expand,
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, slug, pk):
        project_state = self.get_queryset().get(pk=pk)
        serializer = ProjectStateSerializer(project_state, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save(updated_by_id=request.user.id)
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, slug, pk):
        project_state = ProjectState.objects.get(workspace__slug=slug, pk=pk)

        # Mirror the issue-state rule: a default state cannot be deleted. The FK
        # on Project is SET_NULL so deleting a non-default state detaches its
        # projects rather than cascading.
        if project_state.default:
            return Response(
                {"error": "Default project state cannot be deleted"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        project_state.delete()  # soft-delete (deleted_at)
        return Response(status=status.HTTP_204_NO_CONTENT)
