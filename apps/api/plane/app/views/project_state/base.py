# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Project States — internal app CRUD (mote).
# See docs/mote-design/04-planning-hierarchy.md, section 3 ("Project States").
#
# Workspace-scoped CRUD for ProjectState, mirroring the issue State viewset
# (app/views/state/base.py) but at WORKSPACE level (like the project list view,
# app/views/project/base.py). A ``default`` project state cannot be deleted
# (mirrors State.destroy); the FK on Project is SET_NULL so deleting a non-default
# state just detaches its projects.

# Django imports
from django.db import IntegrityError

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from ..base import BaseViewSet
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import ProjectStateSerializer
from plane.db.models import ProjectState, Workspace


class ProjectStateViewSet(BaseViewSet):
    serializer_class = ProjectStateSerializer
    model = ProjectState

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .select_related("workspace")
            .distinct()
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug):
        project_states = ProjectStateSerializer(self.get_queryset(), many=True).data
        return Response(project_states, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        project_state = self.get_queryset().get(pk=pk)
        serializer = ProjectStateSerializer(project_state)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def create(self, request, slug):
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
        except IntegrityError as e:
            if "already exists" in str(e):
                return Response(
                    {"name": "The project state name is already taken"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            raise

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        try:
            project_state = self.get_queryset().get(pk=pk)
            serializer = ProjectStateSerializer(project_state, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save(updated_by_id=request.user.id)
                return Response(serializer.data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except IntegrityError as e:
            if "already exists" in str(e):
                return Response(
                    {"name": "The project state name is already taken"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            raise

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def destroy(self, request, slug, pk):
        project_state = self.get_queryset().get(pk=pk)

        # Mirror State.destroy: a default state cannot be deleted. Projects still
        # pointing at a non-default state are safely detached (FK is SET_NULL).
        if project_state.default:
            return Response(
                {"error": "Default project state cannot be deleted"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        project_state.delete()  # soft-delete (deleted_at)
        return Response(status=status.HTTP_204_NO_CONTENT)
