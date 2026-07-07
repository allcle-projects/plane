# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Custom Fields / Work Item Properties — mote (Phase 1).
# See docs/mote-design/03-work-item-power.md, section 1.
#
# Workspace-scoped CRUD for work item types, their property definitions,
# and select/multi-select options. NO value endpoints in Phase 1.

# Third party imports
from rest_framework.response import Response
from rest_framework import status

# Module imports
from ..base import BaseViewSet
from plane.app.permissions import allow_permission, ROLE
from plane.app.serializers import (
    IssueTypeSerializer,
    IssuePropertySerializer,
    IssuePropertyReadSerializer,
    IssuePropertyOptionSerializer,
)
from plane.db.models import (
    Workspace,
    IssueType,
    IssueProperty,
    IssuePropertyOption,
)


class IssueTypeViewSet(BaseViewSet):
    serializer_class = IssueTypeSerializer
    model = IssueType

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug):
        issue_types = self.get_queryset()
        serializer = IssueTypeSerializer(issue_types, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        issue_type = self.get_queryset().get(pk=pk)
        serializer = IssueTypeSerializer(issue_type)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def create(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        serializer = IssueTypeSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(workspace_id=workspace.id)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        issue_type = self.get_queryset().get(pk=pk)
        serializer = IssueTypeSerializer(issue_type, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def destroy(self, request, slug, pk):
        issue_type = self.get_queryset().get(pk=pk)
        issue_type.delete()  # soft-delete (deleted_at); soft-cascades to children
        return Response(status=status.HTTP_204_NO_CONTENT)


class IssuePropertyViewSet(BaseViewSet):
    serializer_class = IssuePropertySerializer
    model = IssueProperty

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(issue_type_id=self.kwargs.get("type_id"))
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug, type_id):
        properties = self.get_queryset().prefetch_related("options")
        serializer = IssuePropertyReadSerializer(properties, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def retrieve(self, request, slug, type_id, pk):
        issue_property = self.get_queryset().prefetch_related("options").get(pk=pk)
        serializer = IssuePropertyReadSerializer(issue_property)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def create(self, request, slug, type_id):
        # Ensure the work item type exists within this workspace.
        issue_type = IssueType.objects.get(workspace__slug=slug, pk=type_id)
        serializer = IssuePropertySerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(workspace_id=issue_type.workspace_id, issue_type_id=issue_type.id)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def partial_update(self, request, slug, type_id, pk):
        issue_property = self.get_queryset().get(pk=pk)
        serializer = IssuePropertySerializer(issue_property, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def destroy(self, request, slug, type_id, pk):
        issue_property = self.get_queryset().get(pk=pk)
        issue_property.delete()  # soft-delete; soft-cascades to options/values
        return Response(status=status.HTTP_204_NO_CONTENT)


class IssuePropertyOptionViewSet(BaseViewSet):
    serializer_class = IssuePropertyOptionSerializer
    model = IssuePropertyOption

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(property_id=self.kwargs.get("property_id"))
            .filter(property__issue_type_id=self.kwargs.get("type_id"))
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug, type_id, property_id):
        options = self.get_queryset()
        serializer = IssuePropertyOptionSerializer(options, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def retrieve(self, request, slug, type_id, property_id, pk):
        option = self.get_queryset().get(pk=pk)
        serializer = IssuePropertyOptionSerializer(option)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def create(self, request, slug, type_id, property_id):
        issue_property = IssueProperty.objects.get(
            workspace__slug=slug, issue_type_id=type_id, pk=property_id
        )
        serializer = IssuePropertyOptionSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(
                workspace_id=issue_property.workspace_id,
                project_id=issue_property.project_id,
                property_id=issue_property.id,
            )
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def partial_update(self, request, slug, type_id, property_id, pk):
        option = self.get_queryset().get(pk=pk)
        serializer = IssuePropertyOptionSerializer(option, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def destroy(self, request, slug, type_id, property_id, pk):
        option = self.get_queryset().get(pk=pk)
        option.delete()  # soft-delete; soft-cascades to child options/values
        return Response(status=status.HTTP_204_NO_CONTENT)
