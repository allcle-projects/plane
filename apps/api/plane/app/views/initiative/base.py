# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Initiatives — CRUD + project/epic membership (mote).
# See docs/mote-design/04-planning-hierarchy.md, section 1.
#
# Workspace-scoped CRUD for Initiatives plus endpoints to attach/detach the
# projects and epics an Initiative aggregates. The rollup ``progress_snapshot``
# is computed server-side in P2; this layer only manages storage and membership.

# Django imports
from django.db import IntegrityError

# Third party imports
from rest_framework.response import Response
from rest_framework import status

# Module imports
from ..base import BaseViewSet, BaseAPIView
from plane.app.permissions import allow_permission, ROLE
from plane.app.serializers import (
    InitiativeSerializer,
    InitiativeProjectSerializer,
    InitiativeEpicSerializer,
)
from plane.db.models import (
    Workspace,
    Initiative,
    InitiativeProject,
    InitiativeEpic,
    Project,
    Issue,
)


class InitiativeViewSet(BaseViewSet):
    serializer_class = InitiativeSerializer
    model = Initiative

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .select_related("workspace", "lead")
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug):
        initiatives = self.get_queryset()
        serializer = InitiativeSerializer(initiatives, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        initiative = self.get_queryset().get(pk=pk)
        serializer = InitiativeSerializer(initiative)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def create(self, request, slug):
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

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        initiative = self.get_queryset().get(pk=pk)
        serializer = InitiativeSerializer(initiative, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save(updated_by_id=request.user.id)
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def destroy(self, request, slug, pk):
        initiative = self.get_queryset().get(pk=pk)
        initiative.delete()  # soft-delete (deleted_at)
        return Response(status=status.HTTP_204_NO_CONTENT)


class InitiativeProjectEndpoint(BaseAPIView):
    """Manage the projects an Initiative aggregates."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, initiative_id):
        initiative_projects = InitiativeProject.objects.filter(
            workspace__slug=slug,
            initiative_id=initiative_id,
        )
        serializer = InitiativeProjectSerializer(initiative_projects, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug, initiative_id):
        initiative = Initiative.objects.get(workspace__slug=slug, pk=initiative_id)
        # Accept a single project_id or a bulk project_ids list.
        project_ids = request.data.get("project_ids", [])
        if not project_ids and request.data.get("project_id"):
            project_ids = [request.data.get("project_id")]

        # Only projects that actually belong to this workspace.
        valid_project_ids = Project.objects.filter(
            workspace_id=initiative.workspace_id, pk__in=project_ids
        ).values_list("id", flat=True)

        created = []
        for project_id in valid_project_ids:
            try:
                initiative_project = InitiativeProject.objects.create(
                    workspace_id=initiative.workspace_id,
                    initiative_id=initiative.id,
                    project_id=project_id,
                    created_by_id=request.user.id,
                    updated_by_id=request.user.id,
                )
                created.append(initiative_project)
            except IntegrityError:
                # Already linked (partial unique constraint) — skip.
                continue

        serializer = InitiativeProjectSerializer(created, many=True)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def delete(self, request, slug, initiative_id, project_id):
        initiative_project = InitiativeProject.objects.get(
            workspace__slug=slug,
            initiative_id=initiative_id,
            project_id=project_id,
        )
        initiative_project.delete()  # soft-delete (deleted_at)
        return Response(status=status.HTTP_204_NO_CONTENT)


class InitiativeEpicEndpoint(BaseAPIView):
    """Manage the epics an Initiative aggregates.

    An epic is an Issue whose issue type has ``is_epic=True`` (issue_type.py:19).
    For P1 we do NOT hard-validate ``is_epic`` — any issue in the workspace is
    accepted; the epic-type validation can be added later.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, initiative_id):
        initiative_epics = InitiativeEpic.objects.filter(
            workspace__slug=slug,
            initiative_id=initiative_id,
        )
        serializer = InitiativeEpicSerializer(initiative_epics, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug, initiative_id):
        initiative = Initiative.objects.get(workspace__slug=slug, pk=initiative_id)
        # Accept a single epic_id or a bulk epic_ids list.
        epic_ids = request.data.get("epic_ids", [])
        if not epic_ids and request.data.get("epic_id"):
            epic_ids = [request.data.get("epic_id")]

        # Only issues that actually belong to this workspace (no is_epic gate in P1).
        valid_epic_ids = Issue.objects.filter(
            workspace_id=initiative.workspace_id, pk__in=epic_ids
        ).values_list("id", flat=True)

        created = []
        for epic_id in valid_epic_ids:
            try:
                initiative_epic = InitiativeEpic.objects.create(
                    workspace_id=initiative.workspace_id,
                    initiative_id=initiative.id,
                    epic_id=epic_id,
                    created_by_id=request.user.id,
                    updated_by_id=request.user.id,
                )
                created.append(initiative_epic)
            except IntegrityError:
                # Already linked (partial unique constraint) — skip.
                continue

        serializer = InitiativeEpicSerializer(created, many=True)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def delete(self, request, slug, initiative_id, epic_id):
        initiative_epic = InitiativeEpic.objects.get(
            workspace__slug=slug,
            initiative_id=initiative_id,
            epic_id=epic_id,
        )
        initiative_epic.delete()  # soft-delete (deleted_at)
        return Response(status=status.HTTP_204_NO_CONTENT)
