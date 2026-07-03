# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
from collections import defaultdict

# Django imports
from django.contrib.postgres.aggregates import ArrayAgg
from django.contrib.postgres.fields import ArrayField
from django.db.models import Count, F, IntegerField, OuterRef, Subquery, UUIDField, Value
from django.db.models.functions import Coalesce
from django.utils.decorators import method_decorator
from django.views.decorators.gzip import gzip_page

# Third party imports
from rest_framework import status
from rest_framework.response import Response
from drf_spectacular.utils import OpenApiResponse

# Module imports
from .base import BaseAPIView
from plane.app.permissions import ProjectEntityPermission
from plane.db.models import CycleIssue, FileAsset, Issue, IssueAssignee, IssueLabel, ModuleIssue
from plane.utils.openapi import sub_issue_docs, ISSUE_ID_PARAMETER, ISSUE_NOT_FOUND_RESPONSE
from plane.utils.timezone_converter import user_timezone_converter


class SubIssuesListAPIEndpoint(BaseAPIView):
    """Work Item Sub-issues (children) Read Endpoint"""

    permission_classes = [ProjectEntityPermission]
    use_read_replica = True

    @sub_issue_docs(
        operation_id="list_sub_issues",
        summary="List sub-issues",
        description="Retrieve the direct children of a work item, grouped by state group distribution.",
        parameters=[
            ISSUE_ID_PARAMETER,
        ],
        responses={
            200: OpenApiResponse(description="Sub-issues with state group distribution"),
            404: ISSUE_NOT_FOUND_RESPONSE,
        },
    )
    @method_decorator(gzip_page)
    def get(self, request, slug, project_id, issue_id):
        """List sub-issues

        Retrieve the direct children of a work item along with a cheap
        state-group distribution (mirrors the internal SubIssuesEndpoint
        read path).
        """
        sub_issues = (
            Issue.issue_objects.filter(parent_id=issue_id, workspace__slug=slug, project_id=project_id)
            .annotate(
                cycle_id=Subquery(
                    CycleIssue.objects.filter(issue=OuterRef("id"), deleted_at__isnull=True).values("cycle_id")[:1]
                )
            )
            .annotate(
                link_count=Coalesce(
                    Subquery(
                        Issue.issue_objects.filter(parent=OuterRef("id"))
                        .order_by()
                        .values("parent")
                        .annotate(count=Count("id"))
                        .values("count"),
                        output_field=IntegerField(),
                    ),
                    0,
                )
            )
            .annotate(
                attachment_count=Coalesce(
                    Subquery(
                        FileAsset.objects.filter(
                            issue_id=OuterRef("id"),
                            entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
                        )
                        .order_by()
                        .values("issue_id")
                        .annotate(count=Count("id"))
                        .values("count"),
                        output_field=IntegerField(),
                    ),
                    0,
                )
            )
            .annotate(
                sub_issues_count=Coalesce(
                    Subquery(
                        Issue.issue_objects.filter(parent=OuterRef("id"))
                        .order_by()
                        .values("parent")
                        .annotate(count=Count("id"))
                        .values("count"),
                        output_field=IntegerField(),
                    ),
                    0,
                )
            )
            .annotate(
                label_ids=Coalesce(
                    Subquery(
                        IssueLabel.objects.filter(issue_id=OuterRef("id"), deleted_at__isnull=True)
                        .order_by()
                        .values("issue_id")
                        .annotate(arr=ArrayAgg("label_id", distinct=True))
                        .values("arr"),
                        output_field=ArrayField(UUIDField()),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
                assignee_ids=Coalesce(
                    Subquery(
                        IssueAssignee.objects.filter(
                            issue_id=OuterRef("id"),
                            assignee__member_project__is_active=True,
                            deleted_at__isnull=True,
                        )
                        .order_by()
                        .values("issue_id")
                        .annotate(arr=ArrayAgg("assignee_id", distinct=True))
                        .values("arr"),
                        output_field=ArrayField(UUIDField()),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
                module_ids=Coalesce(
                    Subquery(
                        ModuleIssue.objects.filter(
                            issue_id=OuterRef("id"),
                            module__archived_at__isnull=True,
                            deleted_at__isnull=True,
                        )
                        .order_by()
                        .values("issue_id")
                        .annotate(arr=ArrayAgg("module_id", distinct=True))
                        .values("arr"),
                        output_field=ArrayField(UUIDField()),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
            )
            .annotate(state_group=F("state__group"))
            .order_by(request.GET.get("order_by", "-created_at"))
        )

        sub_issues = list(
            sub_issues.values(
                "id",
                "name",
                "state_id",
                "sort_order",
                "completed_at",
                "estimate_point",
                "priority",
                "start_date",
                "target_date",
                "sequence_id",
                "project_id",
                "parent_id",
                "cycle_id",
                "module_ids",
                "label_ids",
                "assignee_ids",
                "sub_issues_count",
                "created_at",
                "updated_at",
                "created_by",
                "updated_by",
                "attachment_count",
                "link_count",
                "is_draft",
                "archived_at",
                "state_group",
            )
        )

        # Build the state group distribution cheaply from the already-fetched rows.
        result = defaultdict(list)
        for sub_issue in sub_issues:
            result[sub_issue["state_group"]].append(str(sub_issue["id"]))

        datetime_fields = ["created_at", "updated_at"]
        sub_issues = user_timezone_converter(sub_issues, datetime_fields, request.user.user_timezone)

        return Response(
            {"sub_issues": sub_issues, "state_distribution": result},
            status=status.HTTP_200_OK,
        )
