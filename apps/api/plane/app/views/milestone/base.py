# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Milestones — CRUD + work-item membership + rollup (mote).
# See docs/mote-design/04-planning-hierarchy.md, section 2 ("Milestones").
#
# Project-scoped CRUD for Milestones plus endpoints to attach/detach the work
# items a Milestone tracks and to recompute its progress rollup. Mirrors the
# Module (module/base.py, module/issue.py) and Initiative (initiative/base.py)
# templates. After every attach/detach the ``progress_snapshot`` is recomputed
# synchronously so the response is fresh (cf. InitiativeAnalyticsEndpoint).

# Django imports
from django.db import IntegrityError

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from ..base import BaseViewSet, BaseAPIView
from plane.app.permissions import allow_permission, ROLE
from plane.app.serializers import (
    MilestoneSerializer,
    MilestoneIssueSerializer,
)
from plane.bgtasks.milestone_rollup_task import compute_milestone_snapshot
from plane.db.models import (
    Project,
    Milestone,
    MilestoneIssue,
    Issue,
)


class MilestoneViewSet(BaseViewSet):
    serializer_class = MilestoneSerializer
    model = Milestone

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .select_related("workspace", "project", "cycle", "owned_by")
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id):
        milestones = self.get_queryset()
        serializer = MilestoneSerializer(milestones, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def retrieve(self, request, slug, project_id, pk):
        milestone = self.get_queryset().get(pk=pk)
        serializer = MilestoneSerializer(milestone)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def create(self, request, slug, project_id):
        # Ensure the project (and thus workspace) exists; ProjectBaseModel.save
        # auto-fills ``workspace`` from ``project`` (project.py:193).
        project = Project.objects.get(workspace__slug=slug, pk=project_id)
        serializer = MilestoneSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(
                project_id=project.id,
                created_by_id=request.user.id,
                updated_by_id=request.user.id,
            )
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def partial_update(self, request, slug, project_id, pk):
        milestone = self.get_queryset().get(pk=pk)
        serializer = MilestoneSerializer(milestone, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save(updated_by_id=request.user.id)
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def destroy(self, request, slug, project_id, pk):
        milestone = self.get_queryset().get(pk=pk)
        milestone.delete()  # soft-delete (deleted_at)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MilestoneIssueEndpoint(BaseAPIView):
    """Manage the work items a Milestone tracks (attach / list / detach)."""

    def _refresh_snapshot(self, milestone):
        # Recompute + persist synchronously so reads stay current (cf.
        # InitiativeAnalyticsEndpoint).
        milestone.progress_snapshot = compute_milestone_snapshot(milestone)
        milestone.save(update_fields=["progress_snapshot", "updated_at"])

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, milestone_id):
        milestone_issues = MilestoneIssue.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            milestone_id=milestone_id,
            deleted_at__isnull=True,
        )
        serializer = MilestoneIssueSerializer(milestone_issues, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, milestone_id):
        milestone = Milestone.objects.get(
            workspace__slug=slug, project_id=project_id, pk=milestone_id
        )
        issues = request.data.get("issues", [])
        if not issues:
            return Response(
                {"error": "Issues are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Only issues that actually belong to this project.
        valid_issue_ids = Issue.objects.filter(
            workspace__slug=slug, project_id=project_id, pk__in=issues
        ).values_list("id", flat=True)

        created = []
        for issue_id in valid_issue_ids:
            try:
                milestone_issue = MilestoneIssue.objects.create(
                    milestone_id=milestone.id,
                    issue_id=issue_id,
                    project_id=project_id,
                    created_by_id=request.user.id,
                    updated_by_id=request.user.id,
                )
                created.append(milestone_issue)
            except IntegrityError:
                # Already attached (partial unique constraint) — skip.
                continue

        self._refresh_snapshot(milestone)
        serializer = MilestoneIssueSerializer(created, many=True)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def delete(self, request, slug, project_id, milestone_id, issue_id):
        milestone_issue = MilestoneIssue.objects.get(
            workspace__slug=slug,
            project_id=project_id,
            milestone_id=milestone_id,
            issue_id=issue_id,
        )
        milestone_issue.delete()  # soft-delete (deleted_at)
        milestone = Milestone.objects.get(
            workspace__slug=slug, project_id=project_id, pk=milestone_id
        )
        self._refresh_snapshot(milestone)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MilestoneAnalyticsEndpoint(BaseAPIView):
    """Rollup progress for one Milestone.

    Recomputes the completion snapshot across the Milestone's attached work
    items, persists it to ``Milestone.progress_snapshot`` (so list/detail reads
    stay cheap and never aggregate live), and returns it. This is the on-demand
    refresh trigger; the same computation runs async via
    ``update_milestone_progress`` on issue state changes.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, milestone_id):
        milestone = Milestone.objects.get(
            workspace__slug=slug, project_id=project_id, pk=milestone_id
        )
        snapshot = compute_milestone_snapshot(milestone)
        milestone.progress_snapshot = snapshot
        milestone.save(update_fields=["progress_snapshot", "updated_at"])
        return Response(snapshot, status=status.HTTP_200_OK)
