# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Updates — CRUD (mote).
# See docs/mote-design/04-planning-hierarchy.md, section 4.
#
# An Update is a periodic status post attached to exactly one parent: a
# project, a cycle or an initiative. The parent is derived from the URL (never
# the request body), so the "exactly one parent" CheckConstraint can't be
# violated by client input. Because the three parents differ in scope, we expose
# three endpoint pairs (list/create + detail); shared list/create/detail logic
# lives in the two small bases below to keep them DRY and Plane-idiomatic.

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from ..base import BaseAPIView
from plane.app.permissions import allow_permission, ROLE
from plane.app.serializers import EntityUpdateSerializer
from plane.db.models import EntityUpdate, Project, Initiative


class EntityUpdateListCreateBase(BaseAPIView):
    """Shared list/create logic. Subclasses supply the parent scope."""

    serializer_class = EntityUpdateSerializer
    model = EntityUpdate

    def _list(self, queryset):
        serializer = EntityUpdateSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def _create(self, request, workspace_id, **parent_kwargs):
        serializer = EntityUpdateSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(
                workspace_id=workspace_id,
                created_by_id=request.user.id,
                updated_by_id=request.user.id,
                **parent_kwargs,
            )
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class EntityUpdateDetailBase(BaseAPIView):
    """Shared retrieve/patch/delete logic. Subclasses supply the parent scope."""

    serializer_class = EntityUpdateSerializer
    model = EntityUpdate

    def _retrieve(self, queryset, pk):
        entity_update = queryset.get(pk=pk)
        serializer = EntityUpdateSerializer(entity_update)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def _patch(self, request, queryset, pk):
        entity_update = queryset.get(pk=pk)
        # Parent FKs are read_only in the serializer, so the parent cannot change.
        serializer = EntityUpdateSerializer(
            entity_update, data=request.data, partial=True
        )
        if serializer.is_valid():
            serializer.save(updated_by_id=request.user.id)
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def _delete(self, queryset, pk):
        entity_update = queryset.get(pk=pk)
        entity_update.delete()  # soft-delete (deleted_at)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Project-scoped updates
# ---------------------------------------------------------------------------


class ProjectUpdateEndpoint(EntityUpdateListCreateBase):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        queryset = EntityUpdate.objects.filter(
            workspace__slug=slug, project_id=project_id
        )
        return self._list(queryset)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id):
        project = Project.objects.get(pk=project_id, workspace__slug=slug)
        return self._create(
            request, workspace_id=project.workspace_id, project_id=project_id
        )


class ProjectUpdateDetailEndpoint(EntityUpdateDetailBase):
    def _get_queryset(self, slug, project_id):
        return EntityUpdate.objects.filter(
            workspace__slug=slug, project_id=project_id
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, pk):
        return self._retrieve(self._get_queryset(slug, project_id), pk)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def patch(self, request, slug, project_id, pk):
        return self._patch(request, self._get_queryset(slug, project_id), pk)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def delete(self, request, slug, project_id, pk):
        return self._delete(self._get_queryset(slug, project_id), pk)


# ---------------------------------------------------------------------------
# Cycle-scoped updates (nested under a project → project-level permissions)
# ---------------------------------------------------------------------------


class CycleUpdateEndpoint(EntityUpdateListCreateBase):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, cycle_id):
        queryset = EntityUpdate.objects.filter(
            workspace__slug=slug, cycle_id=cycle_id
        )
        return self._list(queryset)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, cycle_id):
        project = Project.objects.get(pk=project_id, workspace__slug=slug)
        return self._create(
            request, workspace_id=project.workspace_id, cycle_id=cycle_id
        )


class CycleUpdateDetailEndpoint(EntityUpdateDetailBase):
    def _get_queryset(self, slug, cycle_id):
        return EntityUpdate.objects.filter(workspace__slug=slug, cycle_id=cycle_id)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, cycle_id, pk):
        return self._retrieve(self._get_queryset(slug, cycle_id), pk)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def patch(self, request, slug, project_id, cycle_id, pk):
        return self._patch(request, self._get_queryset(slug, cycle_id), pk)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def delete(self, request, slug, project_id, cycle_id, pk):
        return self._delete(self._get_queryset(slug, cycle_id), pk)


# ---------------------------------------------------------------------------
# Initiative-scoped updates (workspace-scoped → workspace-level permissions)
# ---------------------------------------------------------------------------


class InitiativeUpdateEndpoint(EntityUpdateListCreateBase):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, initiative_id):
        queryset = EntityUpdate.objects.filter(
            workspace__slug=slug, initiative_id=initiative_id
        )
        return self._list(queryset)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug, initiative_id):
        initiative = Initiative.objects.get(pk=initiative_id, workspace__slug=slug)
        return self._create(
            request,
            workspace_id=initiative.workspace_id,
            initiative_id=initiative_id,
        )


class InitiativeUpdateDetailEndpoint(EntityUpdateDetailBase):
    def _get_queryset(self, slug, initiative_id):
        return EntityUpdate.objects.filter(
            workspace__slug=slug, initiative_id=initiative_id
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, initiative_id, pk):
        return self._retrieve(self._get_queryset(slug, initiative_id), pk)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def patch(self, request, slug, initiative_id, pk):
        return self._patch(request, self._get_queryset(slug, initiative_id), pk)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def delete(self, request, slug, initiative_id, pk):
        return self._delete(self._get_queryset(slug, initiative_id), pk)
