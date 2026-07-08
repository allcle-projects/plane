# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import WorkspaceEntityPermission
from plane.app.serializers import PageCollaboratorSerializer
from plane.db.models import Page, PageCollaborator

# Local imports
from ..base import BaseViewSet


class PageCollaboratorViewSet(BaseViewSet):
    serializer_class = PageCollaboratorSerializer
    model = PageCollaborator
    permission_classes = [WorkspaceEntityPermission]

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(page_id=self.kwargs.get("page_id"))
            .select_related("workspace", "page", "member")
        )

    def _get_owned_page(self, slug, page_id, request):
        # Only the page owner may manage the collaborator list.
        page = Page.objects.filter(pk=page_id, workspace__slug=slug).first()
        if page is None:
            return None
        if page.owned_by_id != request.user.id:
            return None
        return page

    def list(self, request, slug, page_id):
        collaborators = self.get_queryset()
        serializer = PageCollaboratorSerializer(collaborators, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def create(self, request, slug, page_id):
        page = self._get_owned_page(slug, page_id, request)
        if page is None:
            return Response(
                {"error": "Only the page owner can share this page"},
                status=status.HTTP_403_FORBIDDEN,
            )

        member_id = request.data.get("member")
        role = request.data.get("role", PageCollaborator.VIEWER_ROLE)

        existing = PageCollaborator.objects.filter(page_id=page_id, member_id=member_id).first()
        if existing is not None:
            existing.role = role
            existing.save(update_fields=["role"])
            serializer = PageCollaboratorSerializer(existing)
            return Response(serializer.data, status=status.HTTP_200_OK)

        serializer = PageCollaboratorSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(
                page_id=page_id,
                workspace_id=page.workspace_id,
                member_id=member_id,
                created_by_id=request.user.id,
            )
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def partial_update(self, request, slug, page_id, member_id=None):
        page = self._get_owned_page(slug, page_id, request)
        if page is None:
            return Response(
                {"error": "Only the page owner can update a collaborator's role"},
                status=status.HTTP_403_FORBIDDEN,
            )

        collaborator = PageCollaborator.objects.filter(page_id=page_id, member_id=member_id).first()
        if collaborator is None:
            return Response(status=status.HTTP_404_NOT_FOUND)

        serializer = PageCollaboratorSerializer(collaborator, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def destroy(self, request, slug, page_id, member_id=None):
        page = self._get_owned_page(slug, page_id, request)
        if page is None:
            return Response(
                {"error": "Only the page owner can remove a collaborator"},
                status=status.HTTP_403_FORBIDDEN,
            )

        collaborator = PageCollaborator.objects.filter(page_id=page_id, member_id=member_id).first()
        if collaborator is None:
            return Response(status=status.HTTP_404_NOT_FOUND)

        collaborator.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
