# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import json

# Django imports
from django.utils import timezone
from django.core import serializers
from django.core.serializers.json import DjangoJSONEncoder
from django.contrib.postgres.aggregates import ArrayAgg
from django.contrib.postgres.fields import ArrayField
from django.db.models import Q, UUIDField, Value, Subquery, OuterRef
from django.db.models.functions import Coalesce
from django.utils.decorators import method_decorator
from django.views.decorators.gzip import gzip_page

# Third party imports
from rest_framework import status
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema, OpenApiResponse, OpenApiRequest

# Module imports
from .base import BaseAPIView
from plane.api.serializers import (
    IssueSerializer,
    DraftIssueCreateSerializer,
    DraftIssueSerializer,
    DraftIssueDetailSerializer,
)
from plane.app.permissions import WorkspaceEntityPermission
from plane.db.models import (
    DraftIssue,
    CycleIssue,
    ModuleIssue,
    DraftIssueCycle,
    Workspace,
    FileAsset,
    ProjectMember,
)
from plane.bgtasks.issue_activities_task import issue_activity
from plane.utils.issue_filters import issue_filters
from plane.utils.host import base_host
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


class WorkspaceDraftIssueAPIEndpoint(BaseAPIView):
    """Workspace Draft Work Item List and Create Endpoint"""

    model = DraftIssue
    serializer_class = DraftIssueSerializer
    permission_classes = [WorkspaceEntityPermission]

    def get_queryset(self):
        return (
            DraftIssue.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .select_related("workspace", "project", "state", "parent")
            .prefetch_related("assignees", "labels", "draft_issue_module__module")
            .annotate(
                cycle_id=Subquery(
                    DraftIssueCycle.objects.filter(draft_issue=OuterRef("id"), deleted_at__isnull=True).values(
                        "cycle_id"
                    )[:1]
                )
            )
            .annotate(
                label_ids=Coalesce(
                    ArrayAgg(
                        "labels__id",
                        distinct=True,
                        filter=Q(~Q(labels__id__isnull=True) & (Q(draft_label_issue__deleted_at__isnull=True))),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
                assignee_ids=Coalesce(
                    ArrayAgg(
                        "assignees__id",
                        distinct=True,
                        filter=Q(
                            ~Q(assignees__id__isnull=True)
                            & Q(assignees__member_project__is_active=True)
                            & Q(draft_issue_assignee__deleted_at__isnull=True)
                        ),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
                module_ids=Coalesce(
                    ArrayAgg(
                        "draft_issue_module__module_id",
                        distinct=True,
                        filter=Q(
                            ~Q(draft_issue_module__module_id__isnull=True)
                            & Q(draft_issue_module__module__archived_at__isnull=True)
                            & Q(draft_issue_module__deleted_at__isnull=True)
                        ),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
            )
        ).distinct()

    @method_decorator(gzip_page)
    @extend_schema(
        operation_id="list_workspace_draft_work_items",
        summary="List draft work items",
        description="Retrieve the authenticated user's draft work items in the workspace.",
        tags=["Draft Work Items"],
        parameters=[WORKSPACE_SLUG_PARAMETER, CURSOR_PARAMETER, PER_PAGE_PARAMETER],
        responses={
            200: OpenApiResponse(description="Draft work items", response=DraftIssueSerializer(many=True)),
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: WORKSPACE_NOT_FOUND_RESPONSE,
        },
    )
    def get(self, request, slug):
        """List draft work items"""
        filters = issue_filters(request.query_params, "GET")
        issues = self.get_queryset().filter(created_by=request.user).order_by("-created_at")
        issues = issues.filter(**filters)
        return self.paginate(
            request=request,
            queryset=(issues),
            on_results=lambda issues: DraftIssueSerializer(issues, many=True).data,
        )

    @extend_schema(
        operation_id="create_workspace_draft_work_item",
        summary="Create draft work item",
        description="Create a new draft work item owned by the authenticated user.",
        tags=["Draft Work Items"],
        parameters=[WORKSPACE_SLUG_PARAMETER],
        request=OpenApiRequest(request=DraftIssueCreateSerializer),
        responses={
            201: OpenApiResponse(description="Draft work item created", response=DraftIssueSerializer),
            400: VALIDATION_ERROR_RESPONSE,
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: WORKSPACE_NOT_FOUND_RESPONSE,
        },
    )
    def post(self, request, slug):
        """Create draft work item"""
        workspace = Workspace.objects.get(slug=slug)

        # A caller-supplied project_id must be a project the caller is an active
        # member of — otherwise a workspace member could stage (and later convert)
        # a work item into a project they don't belong to, or into another
        # workspace's project entirely.
        project_id = request.data.get("project_id", None)
        if project_id and not ProjectMember.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            member=request.user,
            is_active=True,
        ).exists():
            return Response(
                {"error": "You are not a member of the target project."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = DraftIssueCreateSerializer(
            data=request.data,
            context={
                "workspace_id": workspace.id,
                "project_id": request.data.get("project_id", None),
            },
        )
        if serializer.is_valid():
            serializer.save()
            issue = (
                self.get_queryset()
                .filter(pk=serializer.data.get("id"))
                .values(
                    "id",
                    "name",
                    "state_id",
                    "sort_order",
                    "completed_at",
                    "estimate_point",
                    "priority",
                    "start_date",
                    "target_date",
                    "project_id",
                    "parent_id",
                    "cycle_id",
                    "module_ids",
                    "label_ids",
                    "assignee_ids",
                    "created_at",
                    "updated_at",
                    "created_by",
                    "updated_by",
                    "type_id",
                    "description_html",
                )
                .first()
            )
            return Response(issue, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class WorkspaceDraftIssueDetailAPIEndpoint(BaseAPIView):
    """Workspace Draft Work Item Detail Endpoint"""

    model = DraftIssue
    serializer_class = DraftIssueDetailSerializer
    permission_classes = [WorkspaceEntityPermission]

    def get_queryset(self):
        return (
            DraftIssue.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .select_related("workspace", "project", "state", "parent")
            .prefetch_related("assignees", "labels", "draft_issue_module__module")
            .annotate(
                cycle_id=Subquery(
                    DraftIssueCycle.objects.filter(draft_issue=OuterRef("id"), deleted_at__isnull=True).values(
                        "cycle_id"
                    )[:1]
                )
            )
            .annotate(
                label_ids=Coalesce(
                    ArrayAgg(
                        "labels__id",
                        distinct=True,
                        filter=Q(~Q(labels__id__isnull=True) & (Q(draft_label_issue__deleted_at__isnull=True))),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
                assignee_ids=Coalesce(
                    ArrayAgg(
                        "assignees__id",
                        distinct=True,
                        filter=Q(
                            ~Q(assignees__id__isnull=True)
                            & Q(assignees__member_project__is_active=True)
                            & Q(draft_issue_assignee__deleted_at__isnull=True)
                        ),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
                module_ids=Coalesce(
                    ArrayAgg(
                        "draft_issue_module__module_id",
                        distinct=True,
                        filter=Q(
                            ~Q(draft_issue_module__module_id__isnull=True)
                            & Q(draft_issue_module__module__archived_at__isnull=True)
                            & Q(draft_issue_module__deleted_at__isnull=True)
                        ),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
            )
        ).distinct()

    @extend_schema(
        operation_id="retrieve_workspace_draft_work_item",
        summary="Retrieve draft work item",
        description="Retrieve a draft work item owned by the authenticated user.",
        tags=["Draft Work Items"],
        parameters=[WORKSPACE_SLUG_PARAMETER],
        responses={
            200: OpenApiResponse(description="Draft work item", response=DraftIssueDetailSerializer),
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: NOT_FOUND_RESPONSE,
        },
    )
    def get(self, request, slug, pk):
        """Retrieve draft work item"""
        issue = self.get_queryset().filter(pk=pk, created_by=request.user).first()
        if not issue:
            return Response(
                {"error": "The required object does not exist."},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = DraftIssueDetailSerializer(issue)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        operation_id="update_workspace_draft_work_item",
        summary="Update draft work item",
        description="Partially update a draft work item owned by the authenticated user.",
        tags=["Draft Work Items"],
        parameters=[WORKSPACE_SLUG_PARAMETER],
        request=OpenApiRequest(request=DraftIssueCreateSerializer),
        responses={
            204: DELETED_RESPONSE,
            400: VALIDATION_ERROR_RESPONSE,
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: NOT_FOUND_RESPONSE,
        },
    )
    def patch(self, request, slug, pk):
        """Update draft work item"""
        issue = self.get_queryset().filter(pk=pk, created_by=request.user).first()
        if not issue:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)

        project_id = request.data.get("project_id", issue.project_id)

        # If the caller is moving the draft to a different project, they must be
        # an active member of that target project.
        if "project_id" in request.data and not ProjectMember.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            member=request.user,
            is_active=True,
        ).exists():
            return Response(
                {"error": "You are not a member of the target project."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = DraftIssueCreateSerializer(
            issue,
            data=request.data,
            partial=True,
            context={
                "project_id": project_id,
                "cycle_id": request.data.get("cycle_id", "not_provided"),
            },
        )
        if serializer.is_valid():
            serializer.save()
            return Response(status=status.HTTP_204_NO_CONTENT)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @extend_schema(
        operation_id="delete_workspace_draft_work_item",
        summary="Delete draft work item",
        description="Delete a draft work item owned by the authenticated user.",
        tags=["Draft Work Items"],
        parameters=[WORKSPACE_SLUG_PARAMETER],
        responses={
            204: DELETED_RESPONSE,
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: NOT_FOUND_RESPONSE,
        },
    )
    def delete(self, request, slug, pk):
        """Delete draft work item"""
        draft_issue = DraftIssue.objects.get(workspace__slug=slug, pk=pk, created_by=request.user)
        draft_issue.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkspaceDraftToIssueAPIEndpoint(BaseAPIView):
    """Convert a Draft Work Item into a Work Item"""

    model = DraftIssue
    permission_classes = [WorkspaceEntityPermission]

    def get_queryset(self):
        return (
            DraftIssue.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .select_related("workspace", "project", "state", "parent")
            .distinct()
        )

    @extend_schema(
        operation_id="convert_draft_to_work_item",
        summary="Convert draft to work item",
        description="Convert a draft work item into a work item. The draft must have a project set.",
        tags=["Draft Work Items"],
        parameters=[WORKSPACE_SLUG_PARAMETER],
        request=OpenApiRequest(request=IssueSerializer),
        responses={
            201: OpenApiResponse(description="Work item created", response=IssueSerializer),
            400: VALIDATION_ERROR_RESPONSE,
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: NOT_FOUND_RESPONSE,
        },
    )
    def post(self, request, slug, draft_id):
        """Convert draft to work item"""
        draft_issue = self.get_queryset().filter(pk=draft_id, created_by=request.user).first()

        if not draft_issue:
            return Response(
                {"error": "The required object does not exist."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not draft_issue.project_id:
            return Response(
                {"error": "Project is required to create an issue."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = IssueSerializer(
            data=request.data,
            context={
                "project_id": draft_issue.project_id,
                "workspace_id": draft_issue.project.workspace_id,
                "default_assignee_id": draft_issue.project.default_assignee_id,
            },
        )

        if serializer.is_valid():
            serializer.save()

            issue_activity.delay(
                type="issue.activity.created",
                requested_data=json.dumps(self.request.data, cls=DjangoJSONEncoder),
                actor_id=str(request.user.id),
                issue_id=str(serializer.data.get("id", None)),
                project_id=str(draft_issue.project_id),
                current_instance=None,
                epoch=int(timezone.now().timestamp()),
                notification=True,
                origin=base_host(request=request, is_app=True),
            )

            if request.data.get("cycle_id", None):
                created_records = CycleIssue.objects.create(
                    cycle_id=request.data.get("cycle_id", None),
                    issue_id=serializer.data.get("id", None),
                    project_id=draft_issue.project_id,
                    workspace_id=draft_issue.workspace_id,
                    created_by_id=draft_issue.created_by_id,
                    updated_by_id=draft_issue.updated_by_id,
                )
                issue_activity.delay(
                    type="cycle.activity.created",
                    requested_data=None,
                    actor_id=str(self.request.user.id),
                    issue_id=None,
                    project_id=str(draft_issue.project_id),
                    current_instance=json.dumps(
                        {
                            "updated_cycle_issues": None,
                            "created_cycle_issues": serializers.serialize("json", [created_records]),
                        }
                    ),
                    epoch=int(timezone.now().timestamp()),
                    notification=True,
                    origin=base_host(request=request, is_app=True),
                )

            if request.data.get("module_ids", []):
                ModuleIssue.objects.bulk_create(
                    [
                        ModuleIssue(
                            module_id=module,
                            issue_id=serializer.data.get("id", None),
                            workspace_id=draft_issue.workspace_id,
                            project_id=draft_issue.project_id,
                            created_by_id=draft_issue.created_by_id,
                            updated_by_id=draft_issue.updated_by_id,
                        )
                        for module in request.data.get("module_ids", [])
                    ],
                    batch_size=10,
                )
                _ = [
                    issue_activity.delay(
                        type="module.activity.created",
                        requested_data=json.dumps({"module_id": str(module)}),
                        actor_id=str(request.user.id),
                        issue_id=serializer.data.get("id", None),
                        project_id=draft_issue.project_id,
                        current_instance=None,
                        epoch=int(timezone.now().timestamp()),
                        notification=True,
                        origin=base_host(request=request, is_app=True),
                    )
                    for module in request.data.get("module_ids", [])
                ]

            # Update file assets
            file_assets = FileAsset.objects.filter(draft_issue_id=draft_id)
            file_assets.update(
                issue_id=serializer.data.get("id", None),
                entity_type=FileAsset.EntityTypeContext.ISSUE_DESCRIPTION,
                draft_issue_id=None,
            )

            # delete the draft issue
            draft_issue.delete()

            return Response(serializer.data, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
