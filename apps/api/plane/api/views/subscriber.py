# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import status
from rest_framework.response import Response
from drf_spectacular.utils import OpenApiResponse, OpenApiRequest

# Module imports
from .base import BaseAPIView
from plane.api.serializers import IssueSubscriberSerializer
from plane.app.permissions import ProjectEntityPermission, ProjectLitePermission
from plane.db.models import IssueSubscriber, ProjectMember
from plane.utils.openapi import (
    subscriber_docs,
    ISSUE_ID_PARAMETER,
    SUBSCRIBER_ID_PARAMETER,
    CURSOR_PARAMETER,
    PER_PAGE_PARAMETER,
    FIELDS_PARAMETER,
    EXPAND_PARAMETER,
    create_paginated_response,
    ISSUE_NOT_FOUND_RESPONSE,
    SUBSCRIBER_NOT_FOUND_RESPONSE,
    ALREADY_SUBSCRIBED_RESPONSE,
    DELETED_RESPONSE,
)


class IssueSubscriberListCreateAPIEndpoint(BaseAPIView):
    """Work Item Subscriber List and Subscribe Endpoint"""

    serializer_class = IssueSubscriberSerializer
    model = IssueSubscriber
    use_read_replica = True

    def get_permissions(self):
        # Self-subscribe is a lightweight, self-service action available to any
        # active project member (including guests), mirroring the internal
        # IssueSubscriberViewSet.subscribe permission override. Subscribing
        # *another* user (arbitrary `subscriber` in the body) is a management
        # action and requires ProjectEntityPermission, so a guest/member cannot
        # force-subscribe arbitrary users and spam their notifications.
        if self.request.method == "POST":
            subscriber = self.request.data.get("subscriber")
            if subscriber and str(subscriber) != str(self.request.user.id):
                self.permission_classes = [ProjectEntityPermission]
            else:
                self.permission_classes = [ProjectLitePermission]
        else:
            self.permission_classes = [ProjectEntityPermission]
        return super().get_permissions()

    def get_queryset(self):
        return (
            IssueSubscriber.objects.filter(workspace__slug=self.kwargs.get("slug"))
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

    @subscriber_docs(
        operation_id="list_work_item_subscribers",
        description="Retrieve all subscribers of a work item.",
        parameters=[
            ISSUE_ID_PARAMETER,
            CURSOR_PARAMETER,
            PER_PAGE_PARAMETER,
            FIELDS_PARAMETER,
            EXPAND_PARAMETER,
        ],
        responses={
            200: create_paginated_response(
                IssueSubscriberSerializer,
                "PaginatedIssueSubscriberResponse",
                "Paginated list of work item subscribers",
                "Paginated Work Item Subscribers",
            ),
            404: ISSUE_NOT_FOUND_RESPONSE,
        },
    )
    def get(self, request, slug, project_id, issue_id):
        """List work item subscribers

        Retrieve all subscribers of a work item.
        """
        return self.paginate(
            request=request,
            queryset=(self.get_queryset()),
            on_results=lambda subscribers: (
                IssueSubscriberSerializer(subscribers, many=True, fields=self.fields, expand=self.expand).data
            ),
        )

    @subscriber_docs(
        operation_id="subscribe_work_item",
        description="Subscribe a user to a work item. Defaults to the authenticated user when no subscriber is provided.",  # noqa: E501
        parameters=[
            ISSUE_ID_PARAMETER,
        ],
        request=OpenApiRequest(
            request={"type": "object", "properties": {"subscriber": {"type": "string", "format": "uuid"}}},
        ),
        responses={
            201: OpenApiResponse(
                description="Subscribed successfully",
                response=IssueSubscriberSerializer,
            ),
            400: ALREADY_SUBSCRIBED_RESPONSE,
            404: ISSUE_NOT_FOUND_RESPONSE,
        },
    )
    def post(self, request, slug, project_id, issue_id):
        """Subscribe to work item

        Subscribe a user to a work item. If no subscriber ID is provided in the
        request body, the authenticated user is subscribed.
        """
        subscriber_id = request.data.get("subscriber", request.user.id)

        # When subscribing another user (already gated to ProjectEntityPermission
        # in get_permissions), that user must be an active member of this project
        # so an arbitrary/foreign user UUID cannot be attached as a subscriber.
        if str(subscriber_id) != str(request.user.id) and not ProjectMember.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            member_id=subscriber_id,
            is_active=True,
        ).exists():
            return Response(
                {"error": "Subscriber must be an active project member."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if IssueSubscriber.objects.filter(
            issue_id=issue_id,
            subscriber_id=subscriber_id,
            workspace__slug=slug,
            project_id=project_id,
        ).exists():
            return Response(
                {"message": "User already subscribed to the issue."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        subscriber = IssueSubscriber.objects.create(
            issue_id=issue_id, subscriber_id=subscriber_id, project_id=project_id
        )
        serializer = IssueSubscriberSerializer(subscriber)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class IssueSubscriberDetailAPIEndpoint(BaseAPIView):
    """Work Item Unsubscribe Endpoint"""

    serializer_class = IssueSubscriberSerializer
    model = IssueSubscriber
    permission_classes = [ProjectEntityPermission]

    @subscriber_docs(
        operation_id="unsubscribe_work_item",
        description="Remove a subscriber from a work item.",
        parameters=[
            ISSUE_ID_PARAMETER,
            SUBSCRIBER_ID_PARAMETER,
        ],
        responses={
            204: DELETED_RESPONSE,
            404: SUBSCRIBER_NOT_FOUND_RESPONSE,
        },
    )
    def delete(self, request, slug, project_id, issue_id, subscriber_id):
        """Unsubscribe from work item

        Remove a subscriber from a work item.
        """
        issue_subscriber = IssueSubscriber.objects.get(
            project_id=project_id,
            subscriber_id=subscriber_id,
            workspace__slug=slug,
            issue_id=issue_id,
        )
        issue_subscriber.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class IssueSubscriptionStatusAPIEndpoint(BaseAPIView):
    """Work Item Subscription Status Endpoint"""

    serializer_class = IssueSubscriberSerializer
    model = IssueSubscriber
    permission_classes = [ProjectLitePermission]
    use_read_replica = True

    @subscriber_docs(
        operation_id="get_work_item_subscription_status",
        description="Check whether the authenticated user is subscribed to a work item.",
        parameters=[
            ISSUE_ID_PARAMETER,
        ],
        responses={
            200: OpenApiResponse(
                description="Subscription status",
                examples=[],
            ),
            404: ISSUE_NOT_FOUND_RESPONSE,
        },
    )
    def get(self, request, slug, project_id, issue_id):
        """Get work item subscription status

        Check whether the authenticated user is subscribed to a work item.
        """
        is_subscribed = IssueSubscriber.objects.filter(
            issue_id=issue_id,
            subscriber=request.user,
            workspace__slug=slug,
            project_id=project_id,
        ).exists()
        return Response({"subscribed": is_subscribed}, status=status.HTTP_200_OK)
