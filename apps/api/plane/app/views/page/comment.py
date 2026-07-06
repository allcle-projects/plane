# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.utils import timezone
from django.db import IntegrityError

# Third Party imports
from rest_framework.response import Response
from rest_framework import status

# Module imports
from .. import BaseViewSet
from plane.app.serializers import PageCommentSerializer, PageCommentReactionSerializer
from plane.app.permissions import WorkspacePagePermission
from plane.db.models import Page, PageComment, PageCommentReaction


class PageCommentViewSet(BaseViewSet):
    serializer_class = PageCommentSerializer
    model = PageComment
    permission_classes = [WorkspacePagePermission]

    filterset_fields = ["page__id", "workspace__id"]

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(page_id=self.kwargs.get("page_id"))
            .select_related("workspace")
            .select_related("project")
            .select_related("page")
            .select_related("actor")
            .prefetch_related("reactions")
            .distinct()
        )

    def create(self, request, slug, page_id):
        page = Page.objects.get(pk=page_id, workspace__slug=slug)
        serializer = PageCommentSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(
                page_id=page_id,
                workspace_id=page.workspace_id,
                actor=request.user,
            )
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def partial_update(self, request, slug, page_id, pk):
        page_comment = PageComment.objects.get(workspace__slug=slug, page_id=page_id, pk=pk)
        serializer = PageCommentSerializer(page_comment, data=request.data, partial=True)
        if serializer.is_valid():
            if "comment_html" in request.data and request.data["comment_html"] != page_comment.comment_html:
                serializer.save(edited_at=timezone.now())
            else:
                serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def destroy(self, request, slug, page_id, pk):
        page_comment = PageComment.objects.get(workspace__slug=slug, page_id=page_id, pk=pk)
        page_comment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PageCommentReactionViewSet(BaseViewSet):
    serializer_class = PageCommentReactionSerializer
    model = PageCommentReaction
    permission_classes = [WorkspacePagePermission]

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(comment_id=self.kwargs.get("comment_id"))
            .order_by("-created_at")
            .distinct()
        )

    def create(self, request, slug, page_id, comment_id):
        try:
            comment = PageComment.objects.get(workspace__slug=slug, page_id=page_id, pk=comment_id)
            serializer = PageCommentReactionSerializer(data=request.data)
            if serializer.is_valid():
                serializer.save(
                    workspace_id=comment.workspace_id,
                    project_id=comment.project_id,
                    actor_id=request.user.id,
                    comment_id=comment_id,
                )
                return Response(serializer.data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except IntegrityError:
            return Response(
                {"error": "Reaction already exists for the user"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    def destroy(self, request, slug, page_id, comment_id, reaction_code):
        page_comment_reaction = PageCommentReaction.objects.get(
            workspace__slug=slug,
            comment_id=comment_id,
            reaction=reaction_code,
            actor=request.user,
        )
        page_comment_reaction.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
