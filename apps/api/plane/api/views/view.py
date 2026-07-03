# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import transaction
from django.db.models import Exists, OuterRef, Q

# Third party imports
from rest_framework import status
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema, OpenApiResponse, OpenApiRequest

# Module imports
from .base import BaseAPIView
from plane.api.serializers import IssueViewSerializer
from plane.app.permissions import ProjectEntityPermission, WorkspaceEntityPermission
from plane.db.models import (
    IssueView,
    UserFavorite,
    UserRecentVisit,
    WorkspaceMember,
    ProjectMember,
    Project,
    Workspace,
)
from plane.utils.openapi import (
    WORKSPACE_SLUG_PARAMETER,
    PROJECT_ID_PARAMETER,
    FIELDS_PARAMETER,
    EXPAND_PARAMETER,
    UNAUTHORIZED_RESPONSE,
    FORBIDDEN_RESPONSE,
    NOT_FOUND_RESPONSE,
    VALIDATION_ERROR_RESPONSE,
    DELETED_RESPONSE,
    WORKSPACE_NOT_FOUND_RESPONSE,
)


class WorkspaceViewAPIEndpoint(BaseAPIView):
    """Workspace View List and Create Endpoint"""

    serializer_class = IssueViewSerializer
    model = IssueView
    permission_classes = [WorkspaceEntityPermission]

    def get_queryset(self):
        return (
            IssueView.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project__isnull=True)
            .filter(Q(owned_by=self.request.user) | Q(access=1))
            .order_by(self.request.GET.get("order_by", "-created_at"))
            .distinct()
        )

    @extend_schema(
        operation_id="list_workspace_views",
        summary="List workspace views",
        description="Retrieve all workspace-level views the authenticated user can access.",
        tags=["Views"],
        parameters=[WORKSPACE_SLUG_PARAMETER, FIELDS_PARAMETER, EXPAND_PARAMETER],
        responses={
            200: OpenApiResponse(description="Workspace views", response=IssueViewSerializer(many=True)),
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: WORKSPACE_NOT_FOUND_RESPONSE,
        },
    )
    def get(self, request, slug):
        """List workspace views"""
        queryset = self.get_queryset()
        if WorkspaceMember.objects.filter(
            workspace__slug=slug, member=request.user, role=5, is_active=True
        ).exists():
            queryset = queryset.filter(owned_by=request.user)
        views = IssueViewSerializer(queryset, many=True, fields=self.fields, expand=self.expand).data
        return Response(views, status=status.HTTP_200_OK)

    @extend_schema(
        operation_id="create_workspace_view",
        summary="Create workspace view",
        description="Create a new workspace-level view owned by the authenticated user.",
        tags=["Views"],
        parameters=[WORKSPACE_SLUG_PARAMETER],
        request=OpenApiRequest(request=IssueViewSerializer),
        responses={
            201: OpenApiResponse(description="View created", response=IssueViewSerializer),
            400: VALIDATION_ERROR_RESPONSE,
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: WORKSPACE_NOT_FOUND_RESPONSE,
        },
    )
    def post(self, request, slug):
        """Create workspace view"""
        workspace = Workspace.objects.get(slug=slug)
        serializer = IssueViewSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(workspace_id=workspace.id, owned_by=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class WorkspaceViewDetailAPIEndpoint(BaseAPIView):
    """Workspace View Detail Endpoint"""

    serializer_class = IssueViewSerializer
    model = IssueView
    permission_classes = [WorkspaceEntityPermission]

    def get_queryset(self):
        return (
            IssueView.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project__isnull=True)
            .filter(Q(owned_by=self.request.user) | Q(access=1))
            .distinct()
        )

    @extend_schema(
        operation_id="retrieve_workspace_view",
        summary="Retrieve workspace view",
        description="Retrieve details of a specific workspace-level view.",
        tags=["Views"],
        parameters=[WORKSPACE_SLUG_PARAMETER, FIELDS_PARAMETER, EXPAND_PARAMETER],
        responses={
            200: OpenApiResponse(description="Workspace view", response=IssueViewSerializer),
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: NOT_FOUND_RESPONSE,
        },
    )
    def get(self, request, slug, pk):
        """Retrieve workspace view"""
        issue_view = self.get_queryset().filter(pk=pk).first()
        if not issue_view:
            return Response({"error": "The requested resource does not exist."}, status=status.HTTP_404_NOT_FOUND)
        serializer = IssueViewSerializer(issue_view, fields=self.fields, expand=self.expand)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        operation_id="update_workspace_view",
        summary="Update workspace view",
        description="Partially update a workspace-level view. Only the owner can update the view.",
        tags=["Views"],
        parameters=[WORKSPACE_SLUG_PARAMETER],
        request=OpenApiRequest(request=IssueViewSerializer),
        responses={
            200: OpenApiResponse(description="View updated", response=IssueViewSerializer),
            400: VALIDATION_ERROR_RESPONSE,
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: NOT_FOUND_RESPONSE,
        },
    )
    def patch(self, request, slug, pk):
        """Update workspace view"""
        with transaction.atomic():
            workspace_view = IssueView.objects.select_for_update().get(pk=pk, workspace__slug=slug, project__isnull=True)

            if workspace_view.is_locked:
                return Response({"error": "view is locked"}, status=status.HTTP_400_BAD_REQUEST)

            # Only update the view if owner is updating
            if workspace_view.owned_by_id != request.user.id:
                return Response(
                    {"error": "Only the owner of the view can update the view"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            serializer = IssueViewSerializer(workspace_view, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @extend_schema(
        operation_id="delete_workspace_view",
        summary="Delete workspace view",
        description="Delete a workspace-level view. Only a workspace admin or the view owner can delete it.",
        tags=["Views"],
        parameters=[WORKSPACE_SLUG_PARAMETER],
        responses={
            204: DELETED_RESPONSE,
            400: VALIDATION_ERROR_RESPONSE,
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: NOT_FOUND_RESPONSE,
        },
    )
    def delete(self, request, slug, pk):
        """Delete workspace view"""
        workspace_view = IssueView.objects.get(pk=pk, workspace__slug=slug, project__isnull=True)

        if (
            WorkspaceMember.objects.filter(
                workspace__slug=slug, member=request.user, role=20, is_active=True
            ).exists()
            or workspace_view.owned_by_id == request.user.id
        ):
            workspace_view.delete()
            UserFavorite.objects.filter(
                workspace__slug=slug,
                entity_identifier=pk,
                project__isnull=True,
                entity_type="view",
            ).delete()
        else:
            return Response(
                {"error": "Only admin or owner can delete the view"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectViewAPIEndpoint(BaseAPIView):
    """Project View List and Create Endpoint"""

    serializer_class = IssueViewSerializer
    model = IssueView
    permission_classes = [ProjectEntityPermission]

    def get_queryset(self):
        subquery = UserFavorite.objects.filter(
            user=self.request.user,
            entity_identifier=OuterRef("pk"),
            entity_type="view",
            project_id=self.kwargs.get("project_id"),
            workspace__slug=self.kwargs.get("slug"),
        )
        return (
            IssueView.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(
                project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True,
                project__archived_at__isnull=True,
            )
            .filter(Q(owned_by=self.request.user) | Q(access=1))
            .select_related("project", "workspace")
            .annotate(is_favorite=Exists(subquery))
            .order_by("-is_favorite", "name")
            .distinct()
        )

    @extend_schema(
        operation_id="list_project_views",
        summary="List project views",
        description="Retrieve all views in a project that the authenticated user can access.",
        tags=["Views"],
        parameters=[WORKSPACE_SLUG_PARAMETER, PROJECT_ID_PARAMETER, FIELDS_PARAMETER, EXPAND_PARAMETER],
        responses={
            200: OpenApiResponse(description="Project views", response=IssueViewSerializer(many=True)),
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: NOT_FOUND_RESPONSE,
        },
    )
    def get(self, request, slug, project_id):
        """List project views"""
        queryset = self.get_queryset()
        project = Project.objects.get(id=project_id)
        if (
            ProjectMember.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                member=request.user,
                role=5,
                is_active=True,
            ).exists()
            and not project.guest_view_all_features
        ):
            queryset = queryset.filter(owned_by=request.user)
        views = IssueViewSerializer(queryset, many=True, fields=self.fields, expand=self.expand).data
        return Response(views, status=status.HTTP_200_OK)

    @extend_schema(
        operation_id="create_project_view",
        summary="Create project view",
        description="Create a new view in a project owned by the authenticated user.",
        tags=["Views"],
        parameters=[WORKSPACE_SLUG_PARAMETER, PROJECT_ID_PARAMETER],
        request=OpenApiRequest(request=IssueViewSerializer),
        responses={
            201: OpenApiResponse(description="View created", response=IssueViewSerializer),
            400: VALIDATION_ERROR_RESPONSE,
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: NOT_FOUND_RESPONSE,
        },
    )
    def post(self, request, slug, project_id):
        """Create project view"""
        serializer = IssueViewSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(project_id=project_id, owned_by=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ProjectViewDetailAPIEndpoint(BaseAPIView):
    """Project View Detail Endpoint"""

    serializer_class = IssueViewSerializer
    model = IssueView
    permission_classes = [ProjectEntityPermission]

    def get_queryset(self):
        subquery = UserFavorite.objects.filter(
            user=self.request.user,
            entity_identifier=OuterRef("pk"),
            entity_type="view",
            project_id=self.kwargs.get("project_id"),
            workspace__slug=self.kwargs.get("slug"),
        )
        return (
            IssueView.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(
                project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True,
                project__archived_at__isnull=True,
            )
            .filter(Q(owned_by=self.request.user) | Q(access=1))
            .select_related("project", "workspace")
            .annotate(is_favorite=Exists(subquery))
            .distinct()
        )

    @extend_schema(
        operation_id="retrieve_project_view",
        summary="Retrieve project view",
        description="Retrieve details of a specific project view.",
        tags=["Views"],
        parameters=[WORKSPACE_SLUG_PARAMETER, PROJECT_ID_PARAMETER, FIELDS_PARAMETER, EXPAND_PARAMETER],
        responses={
            200: OpenApiResponse(description="Project view", response=IssueViewSerializer),
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: NOT_FOUND_RESPONSE,
        },
    )
    def get(self, request, slug, project_id, pk):
        """Retrieve project view"""
        issue_view = self.get_queryset().filter(pk=pk, project_id=project_id).first()
        if not issue_view:
            return Response({"error": "The requested resource does not exist."}, status=status.HTTP_404_NOT_FOUND)
        project = Project.objects.get(id=project_id)
        if (
            ProjectMember.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                member=request.user,
                role=5,
                is_active=True,
            ).exists()
            and not project.guest_view_all_features
            and not issue_view.owned_by == request.user
        ):
            return Response(
                {"error": "You are not allowed to view this issue"},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = IssueViewSerializer(issue_view, fields=self.fields, expand=self.expand)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        operation_id="update_project_view",
        summary="Update project view",
        description="Partially update a project view. Only the owner can update the view.",
        tags=["Views"],
        parameters=[WORKSPACE_SLUG_PARAMETER, PROJECT_ID_PARAMETER],
        request=OpenApiRequest(request=IssueViewSerializer),
        responses={
            200: OpenApiResponse(description="View updated", response=IssueViewSerializer),
            400: VALIDATION_ERROR_RESPONSE,
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: NOT_FOUND_RESPONSE,
        },
    )
    def patch(self, request, slug, project_id, pk):
        """Update project view"""
        with transaction.atomic():
            issue_view = IssueView.objects.select_for_update().get(pk=pk, workspace__slug=slug, project_id=project_id)

            if issue_view.is_locked:
                return Response({"error": "view is locked"}, status=status.HTTP_400_BAD_REQUEST)

            # Only update the view if owner is updating
            if issue_view.owned_by_id != request.user.id:
                return Response(
                    {"error": "Only the owner of the view can update the view"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            serializer = IssueViewSerializer(issue_view, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @extend_schema(
        operation_id="delete_project_view",
        summary="Delete project view",
        description="Delete a project view. Only a project admin or the view owner can delete it.",
        tags=["Views"],
        parameters=[WORKSPACE_SLUG_PARAMETER, PROJECT_ID_PARAMETER],
        responses={
            204: DELETED_RESPONSE,
            400: VALIDATION_ERROR_RESPONSE,
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: NOT_FOUND_RESPONSE,
        },
    )
    def delete(self, request, slug, project_id, pk):
        """Delete project view"""
        project_view = IssueView.objects.get(pk=pk, project_id=project_id, workspace__slug=slug)
        if (
            ProjectMember.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                member=request.user,
                role=20,
                is_active=True,
            ).exists()
            or project_view.owned_by_id == request.user.id
        ):
            project_view.delete()
            UserFavorite.objects.filter(
                project_id=project_id,
                workspace__slug=slug,
                entity_identifier=pk,
                entity_type="view",
            ).delete()
            UserRecentVisit.objects.filter(
                project_id=project_id,
                workspace__slug=slug,
                entity_identifier=pk,
                entity_name="view",
            ).delete(soft=False)
        else:
            return Response(
                {"error": "Only admin or owner can delete the view"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectViewFavoriteAPIEndpoint(BaseAPIView):
    """Project View Favorite Create and Delete Endpoint"""

    model = UserFavorite
    permission_classes = [ProjectEntityPermission]

    @extend_schema(
        operation_id="favorite_project_view",
        summary="Favorite project view",
        description="Add a project view to the authenticated user's favorites.",
        tags=["Views"],
        parameters=[WORKSPACE_SLUG_PARAMETER, PROJECT_ID_PARAMETER],
        request=OpenApiRequest(
            request={"type": "object", "properties": {"view": {"type": "string", "format": "uuid"}}},
        ),
        responses={
            204: DELETED_RESPONSE,
            400: VALIDATION_ERROR_RESPONSE,
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: NOT_FOUND_RESPONSE,
        },
    )
    def post(self, request, slug, project_id):
        """Favorite project view"""
        _ = UserFavorite.objects.create(
            user=request.user,
            entity_identifier=request.data.get("view"),
            entity_type="view",
            project_id=project_id,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(
        operation_id="unfavorite_project_view",
        summary="Unfavorite project view",
        description="Remove a project view from the authenticated user's favorites.",
        tags=["Views"],
        parameters=[WORKSPACE_SLUG_PARAMETER, PROJECT_ID_PARAMETER],
        responses={
            204: DELETED_RESPONSE,
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: NOT_FOUND_RESPONSE,
        },
    )
    def delete(self, request, slug, project_id, view_id):
        """Unfavorite project view"""
        view_favorite = UserFavorite.objects.get(
            project=project_id,
            user=request.user,
            workspace__slug=slug,
            entity_type="view",
            entity_identifier=view_id,
        )
        view_favorite.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)
