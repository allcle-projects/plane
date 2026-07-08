# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Automations rule engine — CRUD + toggle + logs (mote).
# See docs/mote-design/06-integrations-importers-automations.md, Feature 3.
#
# Project-admin only: rules can mutate issues (state/priority/labels), so
# authoring them is scoped the same way State management is (see
# app/views/state/base.py, which uses the same bare ``allow_permission([ROLE.ADMIN])``
# i.e. level="PROJECT" pattern copied here).

# Third party imports
from rest_framework.response import Response
from rest_framework import status

# Module imports
from ..base import BaseViewSet, BaseAPIView
from plane.app.permissions import allow_permission, ROLE
from plane.app.serializers import AutomationRuleSerializer, AutomationRuleLogSerializer
from plane.db.models import AutomationRule, AutomationRuleLog


class AutomationRuleViewSet(BaseViewSet):
    serializer_class = AutomationRuleSerializer
    model = AutomationRule

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .select_related("project", "workspace")
        )

    @allow_permission([ROLE.ADMIN])
    def list(self, request, slug, project_id):
        rules = self.get_queryset()
        serializer = AutomationRuleSerializer(rules, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def retrieve(self, request, slug, project_id, pk):
        rule = self.get_queryset().get(pk=pk)
        serializer = AutomationRuleSerializer(rule)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def create(self, request, slug, project_id):
        serializer = AutomationRuleSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(
                project_id=project_id,
                created_by_id=request.user.id,
                updated_by_id=request.user.id,
            )
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN])
    def partial_update(self, request, slug, project_id, pk):
        rule = self.get_queryset().get(pk=pk)
        serializer = AutomationRuleSerializer(rule, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save(updated_by_id=request.user.id)
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN])
    def destroy(self, request, slug, project_id, pk):
        rule = self.get_queryset().get(pk=pk)
        rule.delete()  # soft-delete (deleted_at)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission([ROLE.ADMIN])
    def toggle(self, request, slug, project_id, pk):
        rule = self.get_queryset().get(pk=pk)
        is_active = request.data.get("is_active")
        if is_active is None:
            return Response(
                {"error": "is_active is required."}, status=status.HTTP_400_BAD_REQUEST
            )
        rule.is_active = bool(is_active)
        rule.updated_by_id = request.user.id
        rule.save(update_fields=["is_active", "updated_by", "updated_at"])
        serializer = AutomationRuleSerializer(rule)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def logs(self, request, slug, project_id, pk):
        logs = (
            AutomationRuleLog.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                rule_id=pk,
            )
            .select_related("issue")
            .order_by("-created_at")[:200]
        )
        serializer = AutomationRuleLogSerializer(logs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
