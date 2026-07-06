# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import json

# Django imports
from django.utils import timezone
from django.db import transaction
from django.db.models import Sum
from django.core.serializers.json import DjangoJSONEncoder

# Third Party imports
from rest_framework.response import Response
from rest_framework import status

# Module imports
from .. import BaseViewSet, BaseAPIView
from plane.app.serializers import IssueWorklogSerializer, IssueTimerSerializer
from plane.app.permissions import allow_permission, ROLE, ProjectEntityPermission
from plane.db.models import IssueWorklog, IssueTimer, Issue, CycleIssue, ModuleIssue
from plane.bgtasks.issue_activities_task import issue_activity
from plane.utils.host import base_host


class IssueWorklogViewSet(BaseViewSet):
    serializer_class = IssueWorklogSerializer
    model = IssueWorklog

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(issue_id=self.kwargs.get("issue_id"))
            .filter(
                project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True,
                project__archived_at__isnull=True,
            )
            .select_related("project", "workspace", "issue", "logged_by")
            .distinct()
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def create(self, request, slug, project_id, issue_id):
        serializer = IssueWorklogSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(
                project_id=project_id,
                issue_id=issue_id,
                logged_by=request.user,
                logged_at=serializer.validated_data.get("logged_at") or timezone.now(),
            )
            issue_activity.delay(
                type="worklog.activity.created",
                requested_data=json.dumps(serializer.data, cls=DjangoJSONEncoder),
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

    @allow_permission(allowed_roles=[ROLE.ADMIN], creator=True, model=IssueWorklog)
    def partial_update(self, request, slug, project_id, issue_id, pk):
        worklog = IssueWorklog.objects.get(
            workspace__slug=slug, project_id=project_id, issue_id=issue_id, pk=pk
        )
        current_instance = json.dumps(IssueWorklogSerializer(worklog).data, cls=DjangoJSONEncoder)
        requested_data = json.dumps(self.request.data, cls=DjangoJSONEncoder)
        serializer = IssueWorklogSerializer(worklog, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            issue_activity.delay(
                type="worklog.activity.updated",
                requested_data=requested_data,
                actor_id=str(request.user.id),
                issue_id=str(issue_id),
                project_id=str(project_id),
                current_instance=current_instance,
                epoch=int(timezone.now().timestamp()),
                notification=True,
                origin=base_host(request=request, is_app=True),
            )
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission(allowed_roles=[ROLE.ADMIN], creator=True, model=IssueWorklog)
    def destroy(self, request, slug, project_id, issue_id, pk):
        worklog = IssueWorklog.objects.get(
            workspace__slug=slug, project_id=project_id, issue_id=issue_id, pk=pk
        )
        current_instance = json.dumps(IssueWorklogSerializer(worklog).data, cls=DjangoJSONEncoder)
        worklog.delete()
        issue_activity.delay(
            type="worklog.activity.deleted",
            requested_data=json.dumps({"worklog_id": str(pk)}),
            actor_id=str(request.user.id),
            issue_id=str(issue_id),
            project_id=str(project_id),
            current_instance=current_instance,
            epoch=int(timezone.now().timestamp()),
            notification=True,
            origin=base_host(request=request, is_app=True),
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class IssueTimerViewSet(BaseViewSet):
    serializer_class = IssueTimerSerializer
    model = IssueTimer

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(issue_id=self.kwargs.get("issue_id"))
            .filter(user=self.request.user)
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def current(self, request, slug, project_id, issue_id):
        timer = self.get_queryset().filter(is_running=True).first()
        if timer is None:
            return Response({}, status=status.HTTP_200_OK)
        return Response(IssueTimerSerializer(timer).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def start(self, request, slug, project_id, issue_id):
        existing = self.get_queryset().filter(is_running=True).first()
        if existing is not None:
            return Response(
                {"error": "A timer is already running for this work item."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Ensure the issue exists / is in scope
        Issue.objects.get(workspace__slug=slug, project_id=project_id, pk=issue_id)
        timer = IssueTimer.objects.create(
            project_id=project_id,
            issue_id=issue_id,
            user=request.user,
            started_at=timezone.now(),
            is_running=True,
        )
        return Response(IssueTimerSerializer(timer).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def stop(self, request, slug, project_id, issue_id):
        with transaction.atomic():
            timer = (
                IssueTimer.objects.select_for_update()
                .filter(
                    workspace__slug=slug,
                    project_id=project_id,
                    issue_id=issue_id,
                    user=request.user,
                    is_running=True,
                )
                .first()
            )
            if timer is None:
                return Response(
                    {"error": "No running timer found for this work item."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            # Duration computed SERVER-SIDE from started_at (never trust client clock).
            now = timezone.now()
            duration = max(1, round((now - timer.started_at).total_seconds() / 60))
            worklog = IssueWorklog.objects.create(
                project_id=project_id,
                issue_id=issue_id,
                logged_by=request.user,
                duration=duration,
                description=request.data.get("description", ""),
                logged_at=timer.started_at,
            )
            timer.delete()

        issue_activity.delay(
            type="worklog.activity.created",
            requested_data=json.dumps(IssueWorklogSerializer(worklog).data, cls=DjangoJSONEncoder),
            actor_id=str(request.user.id),
            issue_id=str(issue_id),
            project_id=str(project_id),
            current_instance=None,
            epoch=int(timezone.now().timestamp()),
            notification=True,
            origin=base_host(request=request, is_app=True),
        )
        return Response(IssueWorklogSerializer(worklog).data, status=status.HTTP_201_CREATED)


class ProjectWorklogSummaryEndpoint(BaseAPIView):
    """Aggregate logged time across a project, grouped by user and by issue.

    Optional ``cycle_id`` / ``module_id`` query params scope the rollup.
    """

    permission_classes = [ProjectEntityPermission]

    def get(self, request, slug, project_id):
        worklogs = IssueWorklog.objects.filter(
            workspace__slug=slug, project_id=project_id
        )

        cycle_id = request.query_params.get("cycle_id")
        if cycle_id:
            issue_ids = CycleIssue.objects.filter(
                workspace__slug=slug, project_id=project_id, cycle_id=cycle_id
            ).values_list("issue_id", flat=True)
            worklogs = worklogs.filter(issue_id__in=issue_ids)

        module_id = request.query_params.get("module_id")
        if module_id:
            issue_ids = ModuleIssue.objects.filter(
                workspace__slug=slug, project_id=project_id, module_id=module_id
            ).values_list("issue_id", flat=True)
            worklogs = worklogs.filter(issue_id__in=issue_ids)

        by_user = list(
            worklogs.values("logged_by_id")
            .annotate(duration=Sum("duration"))
            .order_by("-duration")
        )
        by_issue = list(
            worklogs.values("issue_id")
            .annotate(duration=Sum("duration"))
            .order_by("-duration")
        )
        total = worklogs.aggregate(duration=Sum("duration")).get("duration") or 0

        return Response(
            {"total_duration": total, "by_user": by_user, "by_issue": by_issue},
            status=status.HTTP_200_OK,
        )
