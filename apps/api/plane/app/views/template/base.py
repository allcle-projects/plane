# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Templates (work item + project templates) — mote.
# See docs/mote-design/03-work-item-power.md, section 2.
#
# Workspace-scoped CRUD for templates (both work_item and project types,
# filtered by ?type=), plus server-side instantiation of a work_item template
# into a fresh Issue in a target project. Property values are written by reusing
# the Custom Fields Phase-2 write util (utils/issue_property_values.py) so the
# validation lives in one place. Stale ID references in template_data are
# resolved-or-dropped against the target project (never hard-fail).

# Python imports
import json

# Django imports
from django.utils import timezone
from django.core.serializers.json import DjangoJSONEncoder

# Third party imports
from rest_framework.response import Response
from rest_framework import status

# Module imports
from ..base import BaseViewSet, BaseAPIView
from plane.app.permissions import allow_permission, ROLE
from plane.app.serializers import TemplateSerializer, IssueCreateSerializer
from plane.bgtasks.issue_activities_task import issue_activity
from plane.utils.host import base_host
from plane.utils.issue_instantiation import instantiate_issue_from_data
from plane.db.models import (
    Workspace,
    Template,
    Project,
)


class TemplateViewSet(BaseViewSet):
    serializer_class = TemplateSerializer
    model = Template

    def get_queryset(self):
        queryset = (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
        )
        template_type = self.request.query_params.get("type")
        if template_type:
            queryset = queryset.filter(template_type=template_type)
        return queryset

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug):
        templates = self.get_queryset()
        serializer = TemplateSerializer(templates, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        template = self.get_queryset().get(pk=pk)
        serializer = TemplateSerializer(template)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def create(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        serializer = TemplateSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(workspace_id=workspace.id)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        template = self.get_queryset().get(pk=pk)
        serializer = TemplateSerializer(template, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def destroy(self, request, slug, pk):
        template = self.get_queryset().get(pk=pk)
        template.delete()  # soft-delete (deleted_at)
        return Response(status=status.HTTP_204_NO_CONTENT)


class TemplateInstantiateEndpoint(BaseAPIView):
    """Create a fresh Issue in a project from a work_item template's snapshot.

    ``template_data`` IDs (state / labels / assignees / estimate / type) are
    resolved against the target project and silently dropped if absent, so a
    template referencing since-deleted or foreign entities still applies. Custom
    property values are written via the Phase-2 upsert util; if they no longer
    validate against the resolved work item type, they are dropped rather than
    failing the whole instantiation.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, template_id):
        template = Template.objects.get(
            workspace__slug=slug, pk=template_id, template_type="work_item"
        )
        project = Project.objects.get(pk=project_id, workspace__slug=slug)

        template_data = template.template_data or {}
        # Resolve + create the issue and write property values via the shared
        # instantiation helper (reused by the recurring dispatcher, mote.15).
        # User-triggered apply → the requesting user is the author (created_by);
        # the recurring dispatcher passes actor_id=None for system creates.
        issue, payload, property_changes = instantiate_issue_from_data(
            template_data, project, actor_id=request.user.id
        )

        # Track the new issue.
        issue_activity.delay(
            type="issue.activity.created",
            requested_data=json.dumps(payload, cls=DjangoJSONEncoder),
            actor_id=str(request.user.id),
            issue_id=str(issue.id),
            project_id=str(project_id),
            current_instance=None,
            epoch=int(timezone.now().timestamp()),
            notification=True,
            origin=base_host(request=request, is_app=True),
        )
        for change in property_changes:
            issue_activity.delay(
                type=f"issue_property_value.activity.{change['verb']}",
                requested_data=json.dumps(change, cls=DjangoJSONEncoder),
                actor_id=str(request.user.id),
                issue_id=str(issue.id),
                project_id=str(project_id),
                current_instance=json.dumps(
                    {"old_values": change["old_values"]}, cls=DjangoJSONEncoder
                ),
                epoch=int(timezone.now().timestamp()),
                notification=True,
                origin=base_host(request=request, is_app=True),
            )

        return Response(
            IssueCreateSerializer(issue).data, status=status.HTTP_201_CREATED
        )
