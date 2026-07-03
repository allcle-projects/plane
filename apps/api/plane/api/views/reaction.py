# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import json

# Django imports
from django.core.serializers.json import DjangoJSONEncoder
from django.db import IntegrityError
from django.utils import timezone

# Third party imports
from rest_framework import status
from rest_framework.response import Response
from drf_spectacular.utils import OpenApiResponse, OpenApiRequest

# Module imports
from .base import BaseAPIView
from plane.api.serializers import IssueReactionSerializer, CommentReactionSerializer
from plane.app.permissions import ProjectLitePermission
from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import IssueReaction, CommentReaction
from plane.utils.host import base_host
from plane.utils.openapi import (
    reaction_docs,
    comment_reaction_docs,
    ISSUE_ID_PARAMETER,
    COMMENT_ID_PATH_PARAMETER,
    REACTION_CODE_PARAMETER,
    CURSOR_PARAMETER,
    PER_PAGE_PARAMETER,
    FIELDS_PARAMETER,
    EXPAND_PARAMETER,
    create_paginated_response,
    INVALID_REQUEST_RESPONSE,
    ISSUE_NOT_FOUND_RESPONSE,
    REACTION_NOT_FOUND_RESPONSE,
    DELETED_RESPONSE,
)


class IssueReactionListCreateAPIEndpoint(BaseAPIView):
    """Work Item Reaction List and Create Endpoint"""

    serializer_class = IssueReactionSerializer
    model = IssueReaction
    permission_classes = [ProjectLitePermission]
    use_read_replica = True

    def get_queryset(self):
        return (
            IssueReaction.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(issue_id=self.kwargs.get("issue_id"))
            .filter(
                project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True,
            )
            .filter(project__archived_at__isnull=True)
            .order_by(self.kwargs.get("order_by", "-created_at"))
            .distinct()
        )

    @reaction_docs(
        operation_id="list_work_item_reactions",
        description="Retrieve all emoji reactions on a work item.",
        parameters=[
            ISSUE_ID_PARAMETER,
            CURSOR_PARAMETER,
            PER_PAGE_PARAMETER,
            FIELDS_PARAMETER,
            EXPAND_PARAMETER,
        ],
        responses={
            200: create_paginated_response(
                IssueReactionSerializer,
                "PaginatedIssueReactionResponse",
                "Paginated list of work item reactions",
                "Paginated Work Item Reactions",
            ),
            404: ISSUE_NOT_FOUND_RESPONSE,
        },
    )
    def get(self, request, slug, project_id, issue_id):
        """List work item reactions

        Retrieve all emoji reactions on a work item.
        """
        return self.paginate(
            request=request,
            queryset=(self.get_queryset()),
            on_results=lambda reactions: (
                IssueReactionSerializer(reactions, many=True, fields=self.fields, expand=self.expand).data
            ),
        )

    @reaction_docs(
        operation_id="create_work_item_reaction",
        description="Add a new emoji reaction to a work item.",
        parameters=[
            ISSUE_ID_PARAMETER,
        ],
        request=OpenApiRequest(request=IssueReactionSerializer),
        responses={
            201: OpenApiResponse(
                description="Work item reaction created successfully",
                response=IssueReactionSerializer,
            ),
            400: INVALID_REQUEST_RESPONSE,
            404: ISSUE_NOT_FOUND_RESPONSE,
        },
    )
    def post(self, request, slug, project_id, issue_id):
        """Create work item reaction

        Add a new emoji reaction to a work item. The actor is always the
        authenticated user making the request.
        """
        serializer = IssueReactionSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(issue_id=issue_id, project_id=project_id, actor=request.user)
            issue_activity.delay(
                type="issue_reaction.activity.created",
                requested_data=json.dumps(request.data, cls=DjangoJSONEncoder),
                actor_id=str(request.user.id),
                issue_id=str(issue_id),
                project_id=str(project_id),
                current_instance=None,
                epoch=int(timezone.now().timestamp()),
                notification=True,
                origin=base_host(request=request, is_app=True),
            )
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class IssueReactionDetailAPIEndpoint(BaseAPIView):
    """Work Item Reaction Detail (Delete) Endpoint"""

    serializer_class = IssueReactionSerializer
    model = IssueReaction
    permission_classes = [ProjectLitePermission]

    @reaction_docs(
        operation_id="delete_work_item_reaction",
        description="Remove the authenticated user's emoji reaction from a work item.",
        parameters=[
            ISSUE_ID_PARAMETER,
            REACTION_CODE_PARAMETER,
        ],
        responses={
            204: DELETED_RESPONSE,
            404: REACTION_NOT_FOUND_RESPONSE,
        },
    )
    def delete(self, request, slug, project_id, issue_id, reaction_code):
        """Delete work item reaction

        Remove the authenticated user's emoji reaction from a work item.
        Only the reaction's own actor can remove it.
        """
        issue_reaction = IssueReaction.objects.get(
            workspace__slug=slug,
            project_id=project_id,
            issue_id=issue_id,
            reaction=reaction_code,
            actor=request.user,
        )
        issue_activity.delay(
            type="issue_reaction.activity.deleted",
            requested_data=None,
            actor_id=str(request.user.id),
            issue_id=str(issue_id),
            project_id=str(project_id),
            current_instance=json.dumps({"reaction": str(reaction_code), "identifier": str(issue_reaction.id)}),
            epoch=int(timezone.now().timestamp()),
            notification=True,
            origin=base_host(request=request, is_app=True),
        )
        issue_reaction.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CommentReactionListCreateAPIEndpoint(BaseAPIView):
    """Work Item Comment Reaction List and Create Endpoint"""

    serializer_class = CommentReactionSerializer
    model = CommentReaction
    permission_classes = [ProjectLitePermission]
    use_read_replica = True

    def get_queryset(self):
        return (
            CommentReaction.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(comment_id=self.kwargs.get("comment_id"))
            .filter(
                project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True,
            )
            .filter(project__archived_at__isnull=True)
            .order_by(self.kwargs.get("order_by", "-created_at"))
            .distinct()
        )

    @comment_reaction_docs(
        operation_id="list_work_item_comment_reactions",
        description="Retrieve all emoji reactions on a work item comment.",
        parameters=[
            COMMENT_ID_PATH_PARAMETER,
            CURSOR_PARAMETER,
            PER_PAGE_PARAMETER,
            FIELDS_PARAMETER,
            EXPAND_PARAMETER,
        ],
        responses={
            200: create_paginated_response(
                CommentReactionSerializer,
                "PaginatedCommentReactionResponse",
                "Paginated list of work item comment reactions",
                "Paginated Work Item Comment Reactions",
            ),
            404: ISSUE_NOT_FOUND_RESPONSE,
        },
    )
    def get(self, request, slug, project_id, comment_id):
        """List work item comment reactions

        Retrieve all emoji reactions on a work item comment.
        """
        return self.paginate(
            request=request,
            queryset=(self.get_queryset()),
            on_results=lambda reactions: (
                CommentReactionSerializer(reactions, many=True, fields=self.fields, expand=self.expand).data
            ),
        )

    @comment_reaction_docs(
        operation_id="create_work_item_comment_reaction",
        description="Add a new emoji reaction to a work item comment.",
        parameters=[
            COMMENT_ID_PATH_PARAMETER,
        ],
        request=OpenApiRequest(request=CommentReactionSerializer),
        responses={
            201: OpenApiResponse(
                description="Work item comment reaction created successfully",
                response=CommentReactionSerializer,
            ),
            400: INVALID_REQUEST_RESPONSE,
            404: ISSUE_NOT_FOUND_RESPONSE,
        },
    )
    def post(self, request, slug, project_id, comment_id):
        """Create work item comment reaction

        Add a new emoji reaction to a work item comment. The actor is always
        the authenticated user making the request.
        """
        try:
            serializer = CommentReactionSerializer(data=request.data)
            if serializer.is_valid():
                serializer.save(project_id=project_id, actor_id=request.user.id, comment_id=comment_id)
                issue_activity.delay(
                    type="comment_reaction.activity.created",
                    requested_data=json.dumps(request.data, cls=DjangoJSONEncoder),
                    actor_id=str(request.user.id),
                    issue_id=None,
                    project_id=str(project_id),
                    current_instance=None,
                    epoch=int(timezone.now().timestamp()),
                    notification=True,
                    origin=base_host(request=request, is_app=True),
                )
                return Response(serializer.data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except IntegrityError:
            return Response(
                {"error": "Reaction already exists for the user"},
                status=status.HTTP_400_BAD_REQUEST,
            )


class CommentReactionDetailAPIEndpoint(BaseAPIView):
    """Work Item Comment Reaction Detail (Delete) Endpoint"""

    serializer_class = CommentReactionSerializer
    model = CommentReaction
    permission_classes = [ProjectLitePermission]

    @comment_reaction_docs(
        operation_id="delete_work_item_comment_reaction",
        description="Remove the authenticated user's emoji reaction from a work item comment.",
        parameters=[
            COMMENT_ID_PATH_PARAMETER,
            REACTION_CODE_PARAMETER,
        ],
        responses={
            204: DELETED_RESPONSE,
            404: REACTION_NOT_FOUND_RESPONSE,
        },
    )
    def delete(self, request, slug, project_id, comment_id, reaction_code):
        """Delete work item comment reaction

        Remove the authenticated user's emoji reaction from a work item comment.
        Only the reaction's own actor can remove it.
        """
        comment_reaction = CommentReaction.objects.get(
            workspace__slug=slug,
            project_id=project_id,
            comment_id=comment_id,
            reaction=reaction_code,
            actor=request.user,
        )
        issue_activity.delay(
            type="comment_reaction.activity.deleted",
            requested_data=None,
            actor_id=str(request.user.id),
            issue_id=None,
            project_id=str(project_id),
            current_instance=json.dumps(
                {
                    "reaction": str(reaction_code),
                    "identifier": str(comment_reaction.id),
                    "comment_id": str(comment_id),
                }
            ),
            epoch=int(timezone.now().timestamp()),
            notification=True,
            origin=base_host(request=request, is_app=True),
        )
        comment_reaction.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
