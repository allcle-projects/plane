# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db.models import Exists, OuterRef, Q, Case, When, BooleanField
from django.utils import timezone

# Third party imports
from rest_framework import status
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema, OpenApiResponse, OpenApiRequest

# Module imports
from .base import BaseAPIView
from plane.api.serializers import (
    NotificationSerializer,
    UserNotificationPreferenceSerializer,
)
from plane.app.permissions import WorkspaceViewerPermission
from plane.db.models import (
    Issue,
    IssueAssignee,
    IssueSubscriber,
    Notification,
    UserNotificationPreference,
    WorkspaceMember,
)
from plane.utils.openapi import (
    WORKSPACE_SLUG_PARAMETER,
    CURSOR_PARAMETER,
    PER_PAGE_PARAMETER,
    UNAUTHORIZED_RESPONSE,
    FORBIDDEN_RESPONSE,
    NOT_FOUND_RESPONSE,
    VALIDATION_ERROR_RESPONSE,
    DELETED_RESPONSE,
    WORKSPACE_NOT_FOUND_RESPONSE,
)


class NotificationListAPIEndpoint(BaseAPIView):
    """User Notification List Endpoint"""

    serializer_class = NotificationSerializer
    model = Notification
    permission_classes = [WorkspaceViewerPermission]
    use_read_replica = True

    @extend_schema(
        operation_id="list_notifications",
        summary="List notifications",
        description="Retrieve the authenticated user's notifications in the workspace, with optional filters.",
        tags=["Notifications"],
        parameters=[WORKSPACE_SLUG_PARAMETER, CURSOR_PARAMETER, PER_PAGE_PARAMETER],
        responses={
            200: OpenApiResponse(description="Notifications", response=NotificationSerializer(many=True)),
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: WORKSPACE_NOT_FOUND_RESPONSE,
        },
    )
    def get(self, request, slug):
        """List notifications"""
        snoozed = request.GET.get("snoozed", "false")
        archived = request.GET.get("archived", "false")
        read = request.GET.get("read", None)
        type = request.GET.get("type", "all")
        mentioned = request.GET.get("mentioned", False)
        q_filters = Q()

        intake_issue = Issue.objects.filter(
            pk=OuterRef("entity_identifier"),
            issue_intake__status__in=[0, 2, -2],
            workspace__slug=slug,
        )

        notifications = (
            Notification.objects.filter(workspace__slug=slug, receiver_id=request.user.id)
            .filter(entity_name="issue")
            .annotate(is_inbox_issue=Exists(intake_issue))
            .annotate(is_intake_issue=Exists(intake_issue))
            .annotate(
                is_mentioned_notification=Case(
                    When(sender__icontains="mentioned", then=True),
                    default=False,
                    output_field=BooleanField(),
                )
            )
            .select_related("workspace", "project", "triggered_by", "receiver")
            .order_by("snoozed_till", "-created_at")
        )

        snoozed_filters = {
            "true": Q(snoozed_till__lt=timezone.now()) | Q(snoozed_till__isnull=False),
            "false": Q(snoozed_till__gte=timezone.now()) | Q(snoozed_till__isnull=True),
        }

        notifications = notifications.filter(snoozed_filters[snoozed])

        archived_filters = {
            "true": Q(archived_at__isnull=False),
            "false": Q(archived_at__isnull=True),
        }

        notifications = notifications.filter(archived_filters[archived])

        if read == "false":
            notifications = notifications.filter(read_at__isnull=True)

        if read == "true":
            notifications = notifications.filter(read_at__isnull=False)

        if mentioned:
            notifications = notifications.filter(sender__icontains="mentioned")
        else:
            notifications = notifications.exclude(sender__icontains="mentioned")

        type = type.split(",")
        # Subscribed issues
        if "subscribed" in type:
            issue_ids = (
                IssueSubscriber.objects.filter(workspace__slug=slug, subscriber_id=request.user.id)
                .annotate(created=Exists(Issue.objects.filter(created_by=request.user, pk=OuterRef("issue_id"))))
                .annotate(assigned=Exists(IssueAssignee.objects.filter(pk=OuterRef("issue_id"), assignee=request.user)))
                .filter(created=False, assigned=False)
                .values_list("issue_id", flat=True)
            )
            q_filters |= Q(entity_identifier__in=issue_ids)

        # Assigned Issues
        if "assigned" in type:
            issue_ids = IssueAssignee.objects.filter(workspace__slug=slug, assignee_id=request.user.id).values_list(
                "issue_id", flat=True
            )
            q_filters |= Q(entity_identifier__in=issue_ids)

        # Created issues
        if "created" in type:
            if WorkspaceMember.objects.filter(
                workspace__slug=slug, member=request.user, role__lt=15, is_active=True
            ).exists():
                notifications = notifications.none()
            else:
                issue_ids = Issue.objects.filter(workspace__slug=slug, created_by=request.user).values_list(
                    "pk", flat=True
                )
                q_filters |= Q(entity_identifier__in=issue_ids)

        notifications = notifications.filter(q_filters)

        if request.GET.get("per_page", False) and request.GET.get("cursor", False):
            return self.paginate(
                order_by=request.GET.get("order_by", "-created_at"),
                request=request,
                queryset=(notifications),
                on_results=lambda notifications: NotificationSerializer(notifications, many=True).data,
            )

        serializer = NotificationSerializer(notifications, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class NotificationDetailAPIEndpoint(BaseAPIView):
    """User Notification Detail Endpoint"""

    serializer_class = NotificationSerializer
    model = Notification
    permission_classes = [WorkspaceViewerPermission]

    def get_queryset(self):
        return (
            Notification.objects.filter(
                workspace__slug=self.kwargs.get("slug"),
                receiver_id=self.request.user.id,
            )
            .select_related("workspace", "project", "triggered_by", "receiver")
        )

    @extend_schema(
        operation_id="retrieve_notification",
        summary="Retrieve notification",
        description="Retrieve a single notification belonging to the authenticated user.",
        tags=["Notifications"],
        parameters=[WORKSPACE_SLUG_PARAMETER],
        responses={
            200: OpenApiResponse(description="Notification", response=NotificationSerializer),
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: NOT_FOUND_RESPONSE,
        },
    )
    def get(self, request, slug, pk):
        """Retrieve notification"""
        notification = self.get_queryset().filter(pk=pk).first()
        if not notification:
            return Response({"error": "The requested resource does not exist."}, status=status.HTTP_404_NOT_FOUND)
        serializer = NotificationSerializer(notification)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        operation_id="update_notification",
        summary="Update notification",
        description="Update a notification's snooze time.",
        tags=["Notifications"],
        parameters=[WORKSPACE_SLUG_PARAMETER],
        request=OpenApiRequest(
            request={"type": "object", "properties": {"snoozed_till": {"type": "string", "format": "date-time"}}},
        ),
        responses={
            200: OpenApiResponse(description="Notification updated", response=NotificationSerializer),
            400: VALIDATION_ERROR_RESPONSE,
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: NOT_FOUND_RESPONSE,
        },
    )
    def patch(self, request, slug, pk):
        """Update notification"""
        notification = Notification.objects.get(workspace__slug=slug, pk=pk, receiver=request.user)
        # Only snoozed_till can be updated
        notification_data = {"snoozed_till": request.data.get("snoozed_till", None)}
        serializer = NotificationSerializer(notification, data=notification_data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @extend_schema(
        operation_id="delete_notification",
        summary="Delete notification",
        description="Delete a notification belonging to the authenticated user.",
        tags=["Notifications"],
        parameters=[WORKSPACE_SLUG_PARAMETER],
        responses={
            204: DELETED_RESPONSE,
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: NOT_FOUND_RESPONSE,
        },
    )
    def delete(self, request, slug, pk):
        """Delete notification"""
        notification = Notification.objects.get(workspace__slug=slug, pk=pk, receiver=request.user)
        notification.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class NotificationMarkReadAPIEndpoint(BaseAPIView):
    """Notification Mark Read / Unread Endpoint"""

    serializer_class = NotificationSerializer
    model = Notification
    permission_classes = [WorkspaceViewerPermission]

    @extend_schema(
        operation_id="mark_notification_read",
        summary="Mark notification as read",
        description="Mark a notification as read.",
        tags=["Notifications"],
        parameters=[WORKSPACE_SLUG_PARAMETER],
        responses={
            200: OpenApiResponse(description="Notification marked read", response=NotificationSerializer),
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: NOT_FOUND_RESPONSE,
        },
    )
    def post(self, request, slug, pk):
        """Mark notification as read"""
        notification = Notification.objects.get(receiver=request.user, workspace__slug=slug, pk=pk)
        notification.read_at = timezone.now()
        notification.save()
        serializer = NotificationSerializer(notification)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        operation_id="mark_notification_unread",
        summary="Mark notification as unread",
        description="Mark a notification as unread.",
        tags=["Notifications"],
        parameters=[WORKSPACE_SLUG_PARAMETER],
        responses={
            200: OpenApiResponse(description="Notification marked unread", response=NotificationSerializer),
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: NOT_FOUND_RESPONSE,
        },
    )
    def delete(self, request, slug, pk):
        """Mark notification as unread"""
        notification = Notification.objects.get(receiver=request.user, workspace__slug=slug, pk=pk)
        notification.read_at = None
        notification.save()
        serializer = NotificationSerializer(notification)
        return Response(serializer.data, status=status.HTTP_200_OK)


class NotificationArchiveAPIEndpoint(BaseAPIView):
    """Notification Archive / Unarchive Endpoint"""

    serializer_class = NotificationSerializer
    model = Notification
    permission_classes = [WorkspaceViewerPermission]

    @extend_schema(
        operation_id="archive_notification",
        summary="Archive notification",
        description="Archive a notification.",
        tags=["Notifications"],
        parameters=[WORKSPACE_SLUG_PARAMETER],
        responses={
            200: OpenApiResponse(description="Notification archived", response=NotificationSerializer),
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: NOT_FOUND_RESPONSE,
        },
    )
    def post(self, request, slug, pk):
        """Archive notification"""
        notification = Notification.objects.get(receiver=request.user, workspace__slug=slug, pk=pk)
        notification.archived_at = timezone.now()
        notification.save()
        serializer = NotificationSerializer(notification)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        operation_id="unarchive_notification",
        summary="Unarchive notification",
        description="Unarchive a notification.",
        tags=["Notifications"],
        parameters=[WORKSPACE_SLUG_PARAMETER],
        responses={
            200: OpenApiResponse(description="Notification unarchived", response=NotificationSerializer),
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: NOT_FOUND_RESPONSE,
        },
    )
    def delete(self, request, slug, pk):
        """Unarchive notification"""
        notification = Notification.objects.get(receiver=request.user, workspace__slug=slug, pk=pk)
        notification.archived_at = None
        notification.save()
        serializer = NotificationSerializer(notification)
        return Response(serializer.data, status=status.HTTP_200_OK)


class UnreadNotificationAPIEndpoint(BaseAPIView):
    """Unread Notification Count Endpoint"""

    permission_classes = [WorkspaceViewerPermission]
    use_read_replica = True

    @extend_schema(
        operation_id="get_unread_notification_count",
        summary="Get unread notification count",
        description="Retrieve the counts of unread and unread-mention notifications for the authenticated user.",
        tags=["Notifications"],
        parameters=[WORKSPACE_SLUG_PARAMETER],
        responses={
            200: OpenApiResponse(description="Unread counts"),
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: WORKSPACE_NOT_FOUND_RESPONSE,
        },
    )
    def get(self, request, slug):
        """Get unread notification count"""
        unread_notifications_count = (
            Notification.objects.filter(
                workspace__slug=slug,
                receiver_id=request.user.id,
                read_at__isnull=True,
                archived_at__isnull=True,
                snoozed_till__isnull=True,
            )
            .exclude(sender__icontains="mentioned")
            .count()
        )

        mention_notifications_count = Notification.objects.filter(
            workspace__slug=slug,
            receiver_id=request.user.id,
            read_at__isnull=True,
            archived_at__isnull=True,
            snoozed_till__isnull=True,
            sender__icontains="mentioned",
        ).count()

        return Response(
            {
                "total_unread_notifications_count": int(unread_notifications_count),
                "mention_unread_notifications_count": int(mention_notifications_count),
            },
            status=status.HTTP_200_OK,
        )


class MarkAllReadNotificationAPIEndpoint(BaseAPIView):
    """Mark All Notifications Read Endpoint"""

    permission_classes = [WorkspaceViewerPermission]

    @extend_schema(
        operation_id="mark_all_notifications_read",
        summary="Mark all notifications as read",
        description="Mark all of the authenticated user's notifications matching the filters as read.",
        tags=["Notifications"],
        parameters=[WORKSPACE_SLUG_PARAMETER],
        request=OpenApiRequest(
            request={
                "type": "object",
                "properties": {
                    "snoozed": {"type": "boolean"},
                    "archived": {"type": "boolean"},
                    "type": {"type": "string"},
                },
            },
        ),
        responses={
            200: OpenApiResponse(description="Notifications marked read"),
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: WORKSPACE_NOT_FOUND_RESPONSE,
        },
    )
    def post(self, request, slug):
        """Mark all notifications as read"""
        snoozed = request.data.get("snoozed", False)
        archived = request.data.get("archived", False)
        type = request.data.get("type", "all")

        notifications = (
            Notification.objects.filter(workspace__slug=slug, receiver_id=request.user.id, read_at__isnull=True)
            .select_related("workspace", "project", "triggered_by", "receiver")
            .order_by("snoozed_till", "-created_at")
        )

        if snoozed:
            notifications = notifications.filter(Q(snoozed_till__lt=timezone.now()) | Q(snoozed_till__isnull=False))
        else:
            notifications = notifications.filter(Q(snoozed_till__gte=timezone.now()) | Q(snoozed_till__isnull=True))

        if archived:
            notifications = notifications.filter(archived_at__isnull=False)
        else:
            notifications = notifications.filter(archived_at__isnull=True)

        if type == "watching":
            issue_ids = IssueSubscriber.objects.filter(workspace__slug=slug, subscriber_id=request.user.id).values_list(
                "issue_id", flat=True
            )
            notifications = notifications.filter(entity_identifier__in=issue_ids)

        if type == "assigned":
            issue_ids = IssueAssignee.objects.filter(workspace__slug=slug, assignee_id=request.user.id).values_list(
                "issue_id", flat=True
            )
            notifications = notifications.filter(entity_identifier__in=issue_ids)

        if type == "created":
            if WorkspaceMember.objects.filter(
                workspace__slug=slug, member=request.user, role__lt=15, is_active=True
            ).exists():
                notifications = Notification.objects.none()
            else:
                issue_ids = Issue.objects.filter(workspace__slug=slug, created_by=request.user).values_list(
                    "pk", flat=True
                )
                notifications = notifications.filter(entity_identifier__in=issue_ids)

        updated_notifications = []
        for notification in notifications:
            notification.read_at = timezone.now()
            updated_notifications.append(notification)
        Notification.objects.bulk_update(updated_notifications, ["read_at"], batch_size=100)
        return Response({"message": "Successful"}, status=status.HTTP_200_OK)


class UserNotificationPreferenceAPIEndpoint(BaseAPIView):
    """User Notification Preference Endpoint"""

    model = UserNotificationPreference
    serializer_class = UserNotificationPreferenceSerializer

    @extend_schema(
        operation_id="retrieve_notification_preferences",
        summary="Retrieve notification preferences",
        description="Retrieve the authenticated user's notification preferences.",
        tags=["Notifications"],
        responses={
            200: OpenApiResponse(
                description="Notification preferences",
                response=UserNotificationPreferenceSerializer,
            ),
            401: UNAUTHORIZED_RESPONSE,
            404: NOT_FOUND_RESPONSE,
        },
    )
    def get(self, request):
        """Retrieve notification preferences"""
        user_notification_preference = UserNotificationPreference.objects.get(user=request.user)
        serializer = UserNotificationPreferenceSerializer(user_notification_preference)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        operation_id="update_notification_preferences",
        summary="Update notification preferences",
        description="Partially update the authenticated user's notification preferences.",
        tags=["Notifications"],
        request=OpenApiRequest(request=UserNotificationPreferenceSerializer),
        responses={
            200: OpenApiResponse(
                description="Notification preferences updated",
                response=UserNotificationPreferenceSerializer,
            ),
            400: VALIDATION_ERROR_RESPONSE,
            401: UNAUTHORIZED_RESPONSE,
            404: NOT_FOUND_RESPONSE,
        },
    )
    def patch(self, request):
        """Update notification preferences"""
        user_notification_preference = UserNotificationPreference.objects.get(user=request.user)
        serializer = UserNotificationPreferenceSerializer(user_notification_preference, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
