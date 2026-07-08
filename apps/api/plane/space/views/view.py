# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db.models import F, Func, OuterRef, Prefetch, Q, Subquery

# Third Party imports
from rest_framework.permissions import AllowAny
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .base import BaseAPIView
from plane.app.serializers import DeployBoardSerializer
from plane.db.models import (
    CycleIssue,
    DeployBoard,
    FileAsset,
    Issue,
    IssueLink,
    IssueReaction,
    IssueVote,
    IssueView,
)
from plane.space.serializer.project import ProjectLiteSerializer
from plane.space.serializer.view import ViewLiteSerializer
from plane.space.utils.grouper import (
    issue_group_values,
    issue_on_results,
    issue_queryset_grouper,
)
from plane.utils.order_queryset import order_issue_queryset
from plane.utils.paginator import GroupedOffsetPaginator, SubGroupedOffsetPaginator


class ViewMetaDataEndpoint(BaseAPIView):
    """Anon-accessible meta for a published View anchor.

    Mirrors ``plane.space.views.meta.ProjectMetaDataEndpoint`` but resolves the
    ``DeployBoard`` by ``entity_name="view"`` and additionally surfaces the view's own
    lite details alongside the project it belongs to.
    """

    permission_classes = [AllowAny]

    def get(self, request, anchor):
        try:
            deploy_board = DeployBoard.objects.get(anchor=anchor, entity_name="view")
        except DeployBoard.DoesNotExist:
            return Response({"error": "View is not published"}, status=status.HTTP_404_NOT_FOUND)

        try:
            view = IssueView.objects.get(pk=deploy_board.entity_identifier)
        except IssueView.DoesNotExist:
            return Response({"error": "View is not published"}, status=status.HTTP_404_NOT_FOUND)

        project = deploy_board.project

        return Response(
            {
                "project": ProjectLiteSerializer(project).data,
                "view": ViewLiteSerializer(view).data,
            },
            status=status.HTTP_200_OK,
        )


class ViewDeployBoardPublicSettingsEndpoint(BaseAPIView):
    """Anon-accessible settings for a published View anchor.

    Mirrors ``plane.space.views.project.ProjectDeployBoardPublicSettingsEndpoint``.
    """

    permission_classes = [AllowAny]

    def get(self, request, anchor):
        view_deploy_board = DeployBoard.objects.get(anchor=anchor, entity_name="view")
        serializer = DeployBoardSerializer(view_deploy_board)
        return Response(serializer.data, status=status.HTTP_200_OK)


class ViewIssuesPublicEndpoint(BaseAPIView):
    """Anon-accessible issue feed for a published View anchor.

    Mirrors ``plane.space.views.issue.ProjectIssuesPublicEndpoint`` (same queryset
    shape, annotations, grouping and pagination), but the issue queryset is scoped to
    the view's own saved filters (``IssueView.query``, computed from ``IssueView.filters``
    on save — see ``db/models/view.py``) instead of client-supplied query params. Client
    filters are never trusted here: only presentation params (``order_by``, ``group_by``,
    ``sub_group_by``) are read from the request.
    """

    permission_classes = [AllowAny]

    def get(self, request, anchor):
        order_by_param = request.GET.get("order_by", "-created_at")

        deploy_board = DeployBoard.objects.filter(anchor=anchor, entity_name="view").first()
        if not deploy_board:
            return Response({"error": "View is not published"}, status=status.HTTP_404_NOT_FOUND)

        view = IssueView.objects.filter(pk=deploy_board.entity_identifier).first()
        if not view:
            return Response({"error": "View is not published"}, status=status.HTTP_404_NOT_FOUND)

        project_id = deploy_board.project_id
        slug = deploy_board.workspace.slug

        # The view's own saved filters are the sole source of truth for which issues
        # are visible through this anchor — never derived from request.query_params.
        filters = view.query or {}

        issue_queryset = (
            Issue.issue_objects.filter(workspace__slug=slug, project_id=project_id)
            .select_related("workspace", "project", "state", "parent")
            .prefetch_related("assignees", "labels", "issue_module__module")
            .prefetch_related(
                Prefetch(
                    "issue_reactions",
                    queryset=IssueReaction.objects.select_related("actor"),
                )
            )
            .prefetch_related(Prefetch("votes", queryset=IssueVote.objects.select_related("actor")))
            .annotate(
                cycle_id=Subquery(
                    CycleIssue.objects.filter(issue=OuterRef("id"), deleted_at__isnull=True).values("cycle_id")[:1]
                )
            )
            .annotate(
                link_count=IssueLink.objects.filter(issue=OuterRef("id"))
                .order_by()
                .annotate(count=Func(F("id"), function="Count"))
                .values("count")
            )
            .annotate(
                attachment_count=FileAsset.objects.filter(
                    issue_id=OuterRef("id"),
                    entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
                )
                .order_by()
                .annotate(count=Func(F("id"), function="Count"))
                .values("count")
            )
            .annotate(
                sub_issues_count=Issue.issue_objects.filter(parent=OuterRef("id"))
                .order_by()
                .annotate(count=Func(F("id"), function="Count"))
                .values("count")
            )
        ).distinct()

        issue_queryset = issue_queryset.filter(**filters)

        # Issue queryset
        issue_queryset, order_by_param = order_issue_queryset(
            issue_queryset=issue_queryset, order_by_param=order_by_param
        )

        # Group by
        group_by = request.GET.get("group_by", False)
        sub_group_by = request.GET.get("sub_group_by", False)

        # issue queryset
        issue_queryset = issue_queryset_grouper(queryset=issue_queryset, group_by=group_by, sub_group_by=sub_group_by)

        if group_by:
            if sub_group_by:
                if group_by == sub_group_by:
                    return Response(
                        {"error": "Group by and sub group by cannot have same parameters"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                else:
                    return self.paginate(
                        request=request,
                        order_by=order_by_param,
                        queryset=issue_queryset,
                        on_results=lambda issues: issue_on_results(
                            group_by=group_by, issues=issues, sub_group_by=sub_group_by
                        ),
                        paginator_cls=SubGroupedOffsetPaginator,
                        group_by_fields=issue_group_values(
                            field=group_by,
                            slug=slug,
                            project_id=project_id,
                            filters=filters,
                        ),
                        sub_group_by_fields=issue_group_values(
                            field=sub_group_by,
                            slug=slug,
                            project_id=project_id,
                            filters=filters,
                        ),
                        group_by_field_name=group_by,
                        sub_group_by_field_name=sub_group_by,
                        count_filter=Q(
                            Q(issue_intake__status=1)
                            | Q(issue_intake__status=-1)
                            | Q(issue_intake__status=2)
                            | Q(issue_intake__isnull=True),
                            archived_at__isnull=True,
                            is_draft=False,
                        ),
                    )
            else:
                # Group paginate
                return self.paginate(
                    request=request,
                    order_by=order_by_param,
                    queryset=issue_queryset,
                    on_results=lambda issues: issue_on_results(
                        group_by=group_by, issues=issues, sub_group_by=sub_group_by
                    ),
                    paginator_cls=GroupedOffsetPaginator,
                    group_by_fields=issue_group_values(
                        field=group_by,
                        slug=slug,
                        project_id=project_id,
                        filters=filters,
                    ),
                    group_by_field_name=group_by,
                    count_filter=Q(
                        Q(issue_intake__status=1)
                        | Q(issue_intake__status=-1)
                        | Q(issue_intake__status=2)
                        | Q(issue_intake__isnull=True),
                        archived_at__isnull=True,
                        is_draft=False,
                    ),
                )
        else:
            return self.paginate(
                order_by=order_by_param,
                request=request,
                queryset=issue_queryset,
                on_results=lambda issues: issue_on_results(group_by=group_by, issues=issues, sub_group_by=sub_group_by),
            )
