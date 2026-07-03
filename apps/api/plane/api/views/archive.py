# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import json

# Django imports
from django.core.serializers.json import DjangoJSONEncoder
from django.db.models import F, Func, OuterRef
from django.utils import timezone

# Third party imports
from rest_framework import status
from rest_framework.response import Response
from drf_spectacular.utils import OpenApiResponse, OpenApiRequest

# Module imports
from .base import BaseAPIView
from plane.api.serializers import IssueSerializer
from plane.app.permissions import ProjectEntityPermission
from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import CycleIssue, Issue, ModuleIssue, ProjectMember
from plane.utils.host import base_host
from plane.utils.openapi import (
    archive_docs,
    WORK_ITEM_PK_PARAMETER,
    CURSOR_PARAMETER,
    PER_PAGE_PARAMETER,
    FIELDS_PARAMETER,
    EXPAND_PARAMETER,
    create_paginated_response,
    WORK_ITEM_NOT_FOUND_RESPONSE,
    INVALID_ARCHIVE_STATE_RESPONSE,
    REQUIRED_ISSUE_IDS_RESPONSE,
    DELETED_RESPONSE,
)


class IssueArchiveAPIEndpoint(BaseAPIView):
    """Work Item Archive/Unarchive Endpoint"""

    serializer_class = IssueSerializer
    model = Issue
    permission_classes = [ProjectEntityPermission]

    @archive_docs(
        operation_id="archive_work_item",
        summary="Archive work item",
        description="Archive a work item. Only work items in a completed or cancelled state group can be archived.",  # noqa: E501
        parameters=[
            WORK_ITEM_PK_PARAMETER,
        ],
        responses={
            200: OpenApiResponse(description="Work item archived"),
            400: INVALID_ARCHIVE_STATE_RESPONSE,
            404: WORK_ITEM_NOT_FOUND_RESPONSE,
        },
    )
    def post(self, request, slug, project_id, pk):
        """Archive work item

        Archive a work item. Only work items in a completed or cancelled
        state group can be archived.
        """
        issue = Issue.issue_objects.get(workspace__slug=slug, project_id=project_id, pk=pk)
        if issue.state.group not in ["completed", "cancelled"]:
            return Response(
                {"error": "Can only archive completed or cancelled state group issue"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        issue_activity.delay(
            type="issue.activity.updated",
            requested_data=json.dumps({"archived_at": str(timezone.now().date()), "automation": False}),
            actor_id=str(request.user.id),
            issue_id=str(issue.id),
            project_id=str(project_id),
            current_instance=json.dumps(IssueSerializer(issue).data, cls=DjangoJSONEncoder),
            epoch=int(timezone.now().timestamp()),
            notification=True,
            origin=base_host(request=request, is_app=True),
        )
        issue.archived_at = timezone.now().date()
        issue.save(update_fields=["archived_at"])

        return Response({"archived_at": str(issue.archived_at)}, status=status.HTTP_200_OK)

    @archive_docs(
        operation_id="unarchive_work_item",
        summary="Unarchive work item",
        description="Restore a previously archived work item.",
        parameters=[
            WORK_ITEM_PK_PARAMETER,
        ],
        responses={
            204: DELETED_RESPONSE,
            404: WORK_ITEM_NOT_FOUND_RESPONSE,
        },
    )
    def delete(self, request, slug, project_id, pk):
        """Unarchive work item

        Restore a previously archived work item.
        """
        issue = Issue.objects.get(
            workspace__slug=slug,
            project_id=project_id,
            archived_at__isnull=False,
            pk=pk,
        )
        issue_activity.delay(
            type="issue.activity.updated",
            requested_data=json.dumps({"archived_at": None}),
            actor_id=str(request.user.id),
            issue_id=str(issue.id),
            project_id=str(project_id),
            current_instance=json.dumps(IssueSerializer(issue).data, cls=DjangoJSONEncoder),
            epoch=int(timezone.now().timestamp()),
            notification=True,
            origin=base_host(request=request, is_app=True),
        )
        issue.archived_at = None
        issue.save(update_fields=["archived_at"])

        return Response(status=status.HTTP_204_NO_CONTENT)


class ArchivedIssueListAPIEndpoint(BaseAPIView):
    """Archived Work Items List Endpoint"""

    serializer_class = IssueSerializer
    model = Issue
    permission_classes = [ProjectEntityPermission]
    use_read_replica = True

    def get_queryset(self):
        return (
            Issue.objects.annotate(
                sub_issues_count=Issue.issue_objects.filter(parent=OuterRef("id"))
                .order_by()
                .annotate(count=Func(F("id"), function="Count"))
                .values("count")
            )
            .filter(archived_at__isnull=False)
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(workspace__slug=self.kwargs.get("slug"))
            .select_related("project", "workspace", "state", "parent")
            .prefetch_related("assignees", "labels")
            .order_by(self.kwargs.get("order_by", "-created_at"))
            .distinct()
        )

    @archive_docs(
        operation_id="list_archived_work_items",
        summary="List archived work items",
        description="Retrieve a paginated list of archived work items in a project.",
        parameters=[
            CURSOR_PARAMETER,
            PER_PAGE_PARAMETER,
            FIELDS_PARAMETER,
            EXPAND_PARAMETER,
        ],
        responses={
            200: create_paginated_response(
                IssueSerializer,
                "PaginatedArchivedWorkItemResponse",
                "Paginated list of archived work items",
                "Paginated Archived Work Items",
            ),
        },
    )
    def get(self, request, slug, project_id):
        """List archived work items

        Retrieve a paginated list of archived work items in a project.
        """
        return self.paginate(
            request=request,
            queryset=(self.get_queryset()),
            on_results=lambda issues: IssueSerializer(issues, many=True, fields=self.fields, expand=self.expand).data,
        )


class BulkArchiveIssuesAPIEndpoint(BaseAPIView):
    """Bulk Archive Work Items Endpoint"""

    permission_classes = [ProjectEntityPermission]

    @archive_docs(
        operation_id="bulk_archive_work_items",
        summary="Bulk archive work items",
        description="Archive multiple work items at once. Only work items in a completed or cancelled state group can be archived.",  # noqa: E501
        request=OpenApiRequest(
            request={
                "type": "object",
                "properties": {
                    "issue_ids": {"type": "array", "items": {"type": "string", "format": "uuid"}},
                },
            },
        ),
        responses={
            200: OpenApiResponse(description="Work items archived"),
            400: REQUIRED_ISSUE_IDS_RESPONSE,
        },
    )
    def post(self, request, slug, project_id):
        """Bulk archive work items

        Archive multiple work items at once. Only work items in a completed
        or cancelled state group can be archived.
        """
        issue_ids = request.data.get("issue_ids", [])

        if not len(issue_ids):
            return Response({"error": "Issue IDs are required"}, status=status.HTTP_400_BAD_REQUEST)

        issues = Issue.objects.filter(workspace__slug=slug, project_id=project_id, pk__in=issue_ids).select_related(
            "state"
        )
        bulk_archive_issues = []
        for issue in issues:
            if issue.state.group not in ["completed", "cancelled"]:
                return Response(
                    {"error": "Can only archive completed or cancelled state group issue"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            issue_activity.delay(
                type="issue.activity.updated",
                requested_data=json.dumps({"archived_at": str(timezone.now().date()), "automation": False}),
                actor_id=str(request.user.id),
                issue_id=str(issue.id),
                project_id=str(project_id),
                current_instance=json.dumps(IssueSerializer(issue).data, cls=DjangoJSONEncoder),
                epoch=int(timezone.now().timestamp()),
                notification=True,
                origin=base_host(request=request, is_app=True),
            )
            issue.archived_at = timezone.now().date()
            bulk_archive_issues.append(issue)
        Issue.objects.bulk_update(bulk_archive_issues, ["archived_at"])

        return Response({"archived_at": str(timezone.now().date())}, status=status.HTTP_200_OK)


class BulkDeleteIssuesAPIEndpoint(BaseAPIView):
    """Bulk Delete Work Items Endpoint"""

    permission_classes = [ProjectEntityPermission]

    @archive_docs(
        operation_id="bulk_delete_work_items",
        summary="Bulk delete work items",
        description="Permanently delete multiple work items at once. Only project admins can perform this action.",
        request=OpenApiRequest(
            request={
                "type": "object",
                "properties": {
                    "issue_ids": {"type": "array", "items": {"type": "string", "format": "uuid"}},
                },
            },
        ),
        responses={
            200: OpenApiResponse(description="Work items deleted"),
            400: REQUIRED_ISSUE_IDS_RESPONSE,
            403: OpenApiResponse(description="Only admins can bulk delete work items"),
        },
    )
    def post(self, request, slug, project_id):
        """Bulk delete work items

        Permanently delete multiple work items at once.
        Only project admins can perform this action.
        """
        if not ProjectMember.objects.filter(
            workspace__slug=slug,
            member=request.user,
            role=20,
            project_id=project_id,
            is_active=True,
        ).exists():
            return Response(
                {"error": "Only admins can bulk delete work items"},
                status=status.HTTP_403_FORBIDDEN,
            )

        issue_ids = request.data.get("issue_ids", [])

        if not len(issue_ids):
            return Response({"error": "Issue IDs are required"}, status=status.HTTP_400_BAD_REQUEST)

        issues = Issue.issue_objects.filter(workspace__slug=slug, project_id=project_id, pk__in=issue_ids)

        total_issues = len(issues)

        # First, delete all related cycle issues
        CycleIssue.objects.filter(issue_id__in=issue_ids).delete()

        # Then, delete all related module issues
        ModuleIssue.objects.filter(issue_id__in=issue_ids).delete()

        # Finally, delete the issues themselves
        issues.delete()

        return Response(
            {"message": f"{total_issues} issues were deleted"},
            status=status.HTTP_200_OK,
        )
