# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ProjectMemberPermission
from plane.app.serializers import DeployBoardSerializer
from plane.db.models import DeployBoard, IssueView
from ..base import BaseViewSet


class ViewDeployBoardViewSet(BaseViewSet):
    """Publish (deploy) a saved project ``IssueView`` to a public anchor URL.

    Mirrors ``plane.app.views.project.base.DeployBoardViewSet`` but targets
    ``DeployBoard.entity_name="view"`` / ``entity_identifier=<view_id>`` instead of
    ``entity_name="project"``. Purely additive: the project deploy board flow is
    untouched.
    """

    permission_classes = [ProjectMemberPermission]
    serializer_class = DeployBoardSerializer
    model = DeployBoard

    def list(self, request, slug, project_id, view_id):
        view_deploy_board = DeployBoard.objects.filter(
            entity_name="view",
            entity_identifier=view_id,
            project_id=project_id,
            workspace__slug=slug,
        ).first()

        serializer = DeployBoardSerializer(view_deploy_board)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def retrieve(self, request, slug, project_id, view_id, pk):
        view_deploy_board = DeployBoard.objects.filter(
            pk=pk,
            entity_name="view",
            entity_identifier=view_id,
            project_id=project_id,
            workspace__slug=slug,
        ).first()

        if view_deploy_board is None:
            return Response({"error": "View is not published"}, status=status.HTTP_404_NOT_FOUND)

        serializer = DeployBoardSerializer(view_deploy_board)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def create(self, request, slug, project_id, view_id):
        # Ensure the view actually belongs to this project/workspace before publishing it
        IssueView.objects.get(pk=view_id, project_id=project_id, workspace__slug=slug)

        view_props = request.data.get("view_props", {})

        # Guard the [entity_name, entity_identifier, deleted_at] unique_together:
        # get_or_create returns the existing DeployBoard (with its existing anchor) if
        # this view was already published, instead of erroring.
        view_deploy_board, _ = DeployBoard.objects.get_or_create(
            entity_name="view", entity_identifier=view_id, project_id=project_id
        )
        view_deploy_board.view_props = view_props
        view_deploy_board.save()

        serializer = DeployBoardSerializer(view_deploy_board)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def destroy(self, request, slug, project_id, view_id, pk):
        DeployBoard.objects.filter(
            pk=pk,
            entity_name="view",
            entity_identifier=view_id,
            project_id=project_id,
            workspace__slug=slug,
        ).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
