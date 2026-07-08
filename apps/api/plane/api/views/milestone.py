# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Milestones — public v1 API (mote).
# See docs/mote-design/04-planning-hierarchy.md, section 2 ("Milestones").
#
# X-API-Key authenticated CRUD for Milestones and their attached work items,
# cloning api/views/module.py (Module<->ModuleIssue mirrors
# Milestone<->MilestoneIssue). Scoped under
# /api/v1/workspaces/<slug>/projects/<project_id>/milestones/...

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.api.serializers import (
    MilestoneSerializer,
    MilestoneIssueSerializer,
)
from plane.app.permissions import WorkspaceEntityPermission
from plane.db.models import (
    Issue,
    Milestone,
    MilestoneIssue,
    Project,
)

from .base import BaseAPIView


class MilestoneListCreateAPIEndpoint(BaseAPIView):
    """Milestone List and Create Endpoint"""

    serializer_class = MilestoneSerializer
    model = Milestone
    permission_classes = [WorkspaceEntityPermission]
    use_read_replica = True

    def get_queryset(self):
        return (
            Milestone.objects.filter(project_id=self.kwargs.get("project_id"))
            .filter(workspace__slug=self.kwargs.get("slug"))
            .select_related("project", "workspace", "cycle", "owned_by")
            .order_by(self.kwargs.get("order_by", "-created_at"))
        )

    def get(self, request, slug, project_id):
        return self.paginate(
            request=request,
            queryset=self.get_queryset(),
            on_results=lambda milestones: MilestoneSerializer(
                milestones, many=True, fields=self.fields, expand=self.expand
            ).data,
        )

    def post(self, request, slug, project_id):
        project = Project.objects.get(pk=project_id, workspace__slug=slug)
        serializer = MilestoneSerializer(data=request.data)
        if serializer.is_valid():
            # ProjectBaseModel.save auto-fills workspace from project.
            serializer.save(
                project_id=project.id,
                created_by_id=request.user.id,
                updated_by_id=request.user.id,
            )
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class MilestoneDetailAPIEndpoint(BaseAPIView):
    """Milestone Detail Endpoint"""

    serializer_class = MilestoneSerializer
    model = Milestone
    permission_classes = [WorkspaceEntityPermission]
    use_read_replica = True

    def get_queryset(self):
        return (
            Milestone.objects.filter(project_id=self.kwargs.get("project_id"))
            .filter(workspace__slug=self.kwargs.get("slug"))
            .select_related("project", "workspace", "cycle", "owned_by")
        )

    def get(self, request, slug, project_id, pk):
        milestone = self.get_queryset().get(pk=pk)
        serializer = MilestoneSerializer(milestone, fields=self.fields, expand=self.expand)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, slug, project_id, pk):
        milestone = self.get_queryset().get(pk=pk)
        serializer = MilestoneSerializer(milestone, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save(updated_by_id=request.user.id)
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, slug, project_id, pk):
        milestone = self.get_queryset().get(pk=pk)
        milestone.delete()  # soft-delete (deleted_at)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MilestoneIssueListCreateAPIEndpoint(BaseAPIView):
    """Milestone Work Item List and Create Endpoint"""

    serializer_class = MilestoneIssueSerializer
    model = MilestoneIssue
    permission_classes = [WorkspaceEntityPermission]
    use_read_replica = True

    def get_queryset(self):
        return (
            MilestoneIssue.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(milestone_id=self.kwargs.get("milestone_id"))
            .select_related("project", "workspace", "milestone")
            .select_related("issue", "issue__state", "issue__project")
            .order_by(self.kwargs.get("order_by", "-created_at"))
            .distinct()
        )

    def get(self, request, slug, project_id, milestone_id):
        return self.paginate(
            request=request,
            queryset=self.get_queryset(),
            on_results=lambda milestone_issues: MilestoneIssueSerializer(
                milestone_issues, many=True, fields=self.fields, expand=self.expand
            ).data,
        )

    def post(self, request, slug, project_id, milestone_id):
        issues = request.data.get("issues", [])
        if not len(issues):
            return Response(
                {"error": "Issues are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        milestone = Milestone.objects.get(
            workspace__slug=slug, project_id=project_id, pk=milestone_id
        )
        project = Project.objects.get(pk=project_id)

        valid_issue_ids = Issue.objects.filter(
            workspace__slug=slug, project_id=project_id, pk__in=issues
        ).values_list("id", flat=True)

        record_to_create = [
            MilestoneIssue(
                milestone=milestone,
                issue_id=issue_id,
                project_id=project_id,
                workspace_id=project.workspace_id,
                created_by=request.user,
                updated_by=request.user,
            )
            for issue_id in valid_issue_ids
        ]
        MilestoneIssue.objects.bulk_create(record_to_create, batch_size=10, ignore_conflicts=True)

        milestone_issues = MilestoneIssue.objects.filter(
            milestone_id=milestone_id, deleted_at__isnull=True
        )
        return Response(
            MilestoneIssueSerializer(milestone_issues, many=True).data,
            status=status.HTTP_201_CREATED,
        )


class MilestoneIssueDetailAPIEndpoint(BaseAPIView):
    """Milestone Work Item Detail Endpoint (detach)"""

    serializer_class = MilestoneIssueSerializer
    model = MilestoneIssue
    permission_classes = [WorkspaceEntityPermission]
    use_read_replica = True

    def delete(self, request, slug, project_id, milestone_id, issue_id):
        milestone_issue = MilestoneIssue.objects.get(
            workspace__slug=slug,
            project_id=project_id,
            milestone_id=milestone_id,
            issue_id=issue_id,
        )
        milestone_issue.delete()  # soft-delete (deleted_at)
        return Response(status=status.HTTP_204_NO_CONTENT)
