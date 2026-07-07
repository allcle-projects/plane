# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Recurring work items — CRUD + run history (mote).
# See docs/mote-design/03-work-item-power.md, section 3.
#
# Project-scoped CRUD for recurrence definitions. ``next_run_at`` is computed
# server-side by the serializer from the schedule spec; the celery-beat
# dispatcher (plane.bgtasks.recurring_issue_task) materializes issues on cadence.

# Third party imports
from rest_framework.response import Response
from rest_framework import status

# Module imports
from ..base import BaseViewSet, BaseAPIView
from plane.app.permissions import allow_permission, ROLE
from plane.app.serializers import (
    RecurringIssueSerializer,
    RecurringIssueRunSerializer,
)
from plane.db.models import RecurringIssue, RecurringIssueRun


class RecurringIssueViewSet(BaseViewSet):
    serializer_class = RecurringIssueSerializer
    model = RecurringIssue

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .select_related("project", "workspace", "template")
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id):
        recurrences = self.get_queryset()
        serializer = RecurringIssueSerializer(recurrences, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def retrieve(self, request, slug, project_id, pk):
        recurrence = self.get_queryset().get(pk=pk)
        serializer = RecurringIssueSerializer(recurrence)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def create(self, request, slug, project_id):
        serializer = RecurringIssueSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(
                project_id=project_id,
                created_by_id=request.user.id,
                updated_by_id=request.user.id,
            )
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def partial_update(self, request, slug, project_id, pk):
        recurrence = self.get_queryset().get(pk=pk)
        serializer = RecurringIssueSerializer(
            recurrence, data=request.data, partial=True
        )
        if serializer.is_valid():
            serializer.save(updated_by_id=request.user.id)
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def destroy(self, request, slug, project_id, pk):
        recurrence = self.get_queryset().get(pk=pk)
        recurrence.delete()  # soft-delete (deleted_at)
        return Response(status=status.HTTP_204_NO_CONTENT)


class RecurringIssueRunEndpoint(BaseAPIView):
    """Materialization history for a recurrence (read-only)."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, recurring_id):
        runs = RecurringIssueRun.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            recurring_id=recurring_id,
        ).order_by("-run_at")
        serializer = RecurringIssueRunSerializer(runs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
