# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Integrations — Option B (webhooks + task-bot) mapping CRUD (mote) — see
# docs/mote-design/06-integrations-importers-automations.md, Feature 1, §1.3.
#
# Project-scoped, admin-managed maps that let the task-bot bridge know which
# Slack channel / GitHub repo a project talks to. No OAuth, no inbound receiver.

# Django imports
from django.db import IntegrityError

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from ..base import BaseAPIView
from plane.app.permissions import allow_permission, ROLE
from plane.app.serializers import (
    SlackProjectSyncSerializer,
    GithubRepositorySerializer,
)
from plane.db.models import SlackProjectSync, GithubRepository


class SlackProjectSyncEndpoint(BaseAPIView):
    """CRUD for the project ↔ Slack incoming-webhook map."""

    @allow_permission([ROLE.ADMIN])
    def get(self, request, slug, project_id, pk=None):
        if pk is None:
            syncs = SlackProjectSync.objects.filter(
                workspace__slug=slug, project_id=project_id
            )
            serializer = SlackProjectSyncSerializer(syncs, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)
        sync = SlackProjectSync.objects.get(
            workspace__slug=slug, project_id=project_id, pk=pk
        )
        serializer = SlackProjectSyncSerializer(sync)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def post(self, request, slug, project_id):
        try:
            serializer = SlackProjectSyncSerializer(data=request.data)
            if serializer.is_valid():
                serializer.save(project_id=project_id)
                return Response(serializer.data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except IntegrityError:
            return Response(
                {"error": "A Slack sync for this team already exists on the project"},
                status=status.HTTP_409_CONFLICT,
            )

    @allow_permission([ROLE.ADMIN])
    def patch(self, request, slug, project_id, pk):
        sync = SlackProjectSync.objects.get(
            workspace__slug=slug, project_id=project_id, pk=pk
        )
        serializer = SlackProjectSyncSerializer(sync, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN])
    def delete(self, request, slug, project_id, pk):
        sync = SlackProjectSync.objects.get(
            workspace__slug=slug, project_id=project_id, pk=pk
        )
        sync.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class GithubRepositorySyncEndpoint(BaseAPIView):
    """CRUD for the project ↔ GitHub repository (owner/name) map."""

    @allow_permission([ROLE.ADMIN])
    def get(self, request, slug, project_id, pk=None):
        if pk is None:
            repos = GithubRepository.objects.filter(
                workspace__slug=slug, project_id=project_id
            )
            serializer = GithubRepositorySerializer(repos, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)
        repo = GithubRepository.objects.get(
            workspace__slug=slug, project_id=project_id, pk=pk
        )
        serializer = GithubRepositorySerializer(repo)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def post(self, request, slug, project_id):
        serializer = GithubRepositorySerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(project_id=project_id)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN])
    def patch(self, request, slug, project_id, pk):
        repo = GithubRepository.objects.get(
            workspace__slug=slug, project_id=project_id, pk=pk
        )
        serializer = GithubRepositorySerializer(repo, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN])
    def delete(self, request, slug, project_id, pk):
        repo = GithubRepository.objects.get(
            workspace__slug=slug, project_id=project_id, pk=pk
        )
        repo.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
