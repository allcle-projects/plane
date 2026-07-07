# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Custom Fields / Work Item Properties — mote (Phase 2).
# See docs/mote-design/03-work-item-power.md, section 1 (Phase 2).
#
# Bulk read/upsert of IssuePropertyValue rows for a single work item.
# Mirrors the worklog sub-resource pattern (app/views/issue/worklog.py):
# ProjectEntityPermission, IssueActivity emission via the issue_activity bgtask.

# Python imports
import json

# Django imports
from django.db import transaction
from django.utils import timezone
from django.core.serializers.json import DjangoJSONEncoder

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .. import BaseAPIView
from plane.app.permissions import allow_permission, ROLE
from plane.db.models import Issue
from plane.bgtasks.issue_activities_task import issue_activity
from plane.utils.host import base_host
from plane.utils.issue_property_values import (
    PropertyValueError,
    get_issue_property_values,
    upsert_property_values,
)


class IssuePropertyValueEndpoint(BaseAPIView):
    """GET/POST/PATCH work item custom-field values (bulk upsert)."""

    def _get_issue(self, slug, project_id, issue_id):
        return Issue.objects.get(
            workspace__slug=slug, project_id=project_id, pk=issue_id
        )

    def _emit_activities(self, request, issue, changes):
        for change in changes:
            issue_activity.delay(
                type=f"issue_property_value.activity.{change['verb']}",
                requested_data=json.dumps(change, cls=DjangoJSONEncoder),
                actor_id=str(request.user.id),
                issue_id=str(issue.id),
                project_id=str(issue.project_id),
                current_instance=json.dumps(
                    {"old_values": change["old_values"]}, cls=DjangoJSONEncoder
                ),
                epoch=int(timezone.now().timestamp()),
                notification=True,
                origin=base_host(request=request, is_app=True),
            )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id):
        issue = self._get_issue(slug, project_id, issue_id)
        return Response(get_issue_property_values(issue), status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id):
        return self._upsert(request, slug, project_id, issue_id)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def patch(self, request, slug, project_id, issue_id):
        return self._upsert(request, slug, project_id, issue_id)

    def _upsert(self, request, slug, project_id, issue_id):
        issue = self._get_issue(slug, project_id, issue_id)
        try:
            with transaction.atomic():
                result, changes = upsert_property_values(issue, request.data)
        except PropertyValueError as exc:
            return Response({"error": exc.message}, status=status.HTTP_400_BAD_REQUEST)

        self._emit_activities(request, issue, changes)
        return Response(result, status=status.HTTP_200_OK)
