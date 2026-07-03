# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import IntegrityError
from django.db.models import Q

# Third party imports
from rest_framework import status
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema, OpenApiResponse, OpenApiRequest

# Module imports
from .base import BaseAPIView
from plane.api.serializers import UserFavoriteSerializer
from plane.app.permissions import WorkSpaceAdminPermission
from plane.db.models import UserFavorite, Workspace
from plane.utils.openapi import (
    WORKSPACE_SLUG_PARAMETER,
    UNAUTHORIZED_RESPONSE,
    FORBIDDEN_RESPONSE,
    NOT_FOUND_RESPONSE,
    VALIDATION_ERROR_RESPONSE,
    DELETED_RESPONSE,
    WORKSPACE_NOT_FOUND_RESPONSE,
)


class WorkspaceFavoriteAPIEndpoint(BaseAPIView):
    """Workspace User Favorite List, Create, Update and Delete Endpoint"""

    serializer_class = UserFavoriteSerializer
    model = UserFavorite
    permission_classes = [WorkSpaceAdminPermission]

    @extend_schema(
        operation_id="list_workspace_favorites",
        summary="List workspace favorites",
        description="Retrieve the authenticated user's top-level favorites in the workspace.",
        tags=["Favorites"],
        parameters=[WORKSPACE_SLUG_PARAMETER],
        responses={
            200: OpenApiResponse(description="User favorites", response=UserFavoriteSerializer(many=True)),
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: WORKSPACE_NOT_FOUND_RESPONSE,
        },
    )
    def get(self, request, slug):
        """List workspace favorites"""
        favorites = UserFavorite.objects.filter(user=request.user, workspace__slug=slug, parent__isnull=True).filter(
            Q(project__isnull=True) & ~Q(entity_type="page")
            | (
                Q(project__isnull=False)
                & Q(project__project_projectmember__member=request.user)
                & Q(project__project_projectmember__is_active=True)
            )
        )
        serializer = UserFavoriteSerializer(favorites, many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        operation_id="create_workspace_favorite",
        summary="Create workspace favorite",
        description="Add an entity (project, cycle, module, view, page) to the authenticated user's favorites.",
        tags=["Favorites"],
        parameters=[WORKSPACE_SLUG_PARAMETER],
        request=OpenApiRequest(request=UserFavoriteSerializer),
        responses={
            200: OpenApiResponse(description="Favorite created", response=UserFavoriteSerializer),
            400: VALIDATION_ERROR_RESPONSE,
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: WORKSPACE_NOT_FOUND_RESPONSE,
        },
    )
    def post(self, request, slug):
        """Create workspace favorite"""
        try:
            workspace = Workspace.objects.get(slug=slug)

            # If the favorite exists return
            if request.data.get("entity_identifier"):
                user_favorites = UserFavorite.objects.filter(
                    workspace=workspace,
                    user_id=request.user.id,
                    entity_type=request.data.get("entity_type"),
                    entity_identifier=request.data.get("entity_identifier"),
                ).first()

                if user_favorites:
                    serializer = UserFavoriteSerializer(user_favorites, context={"request": request})
                    return Response(serializer.data, status=status.HTTP_200_OK)

            serializer = UserFavoriteSerializer(data=request.data, context={"request": request})
            if serializer.is_valid():
                serializer.save(
                    user_id=request.user.id,
                    workspace=workspace,
                    project_id=request.data.get("project_id", None),
                )
                return Response(serializer.data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except IntegrityError:
            return Response({"error": "Favorite already exists"}, status=status.HTTP_400_BAD_REQUEST)

    @extend_schema(
        operation_id="update_workspace_favorite",
        summary="Update workspace favorite",
        description="Partially update one of the authenticated user's workspace favorites.",
        tags=["Favorites"],
        parameters=[WORKSPACE_SLUG_PARAMETER],
        request=OpenApiRequest(request=UserFavoriteSerializer),
        responses={
            200: OpenApiResponse(description="Favorite updated", response=UserFavoriteSerializer),
            400: VALIDATION_ERROR_RESPONSE,
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: NOT_FOUND_RESPONSE,
        },
    )
    def patch(self, request, slug, favorite_id):
        """Update workspace favorite"""
        favorite = UserFavorite.objects.get(user=request.user, workspace__slug=slug, pk=favorite_id)
        serializer = UserFavoriteSerializer(favorite, data=request.data, partial=True, context={"request": request})
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @extend_schema(
        operation_id="delete_workspace_favorite",
        summary="Delete workspace favorite",
        description="Remove one of the authenticated user's workspace favorites.",
        tags=["Favorites"],
        parameters=[WORKSPACE_SLUG_PARAMETER],
        responses={
            204: DELETED_RESPONSE,
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: NOT_FOUND_RESPONSE,
        },
    )
    def delete(self, request, slug, favorite_id):
        """Delete workspace favorite"""
        favorite = UserFavorite.objects.get(user=request.user, workspace__slug=slug, pk=favorite_id)
        favorite.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkspaceFavoriteGroupAPIEndpoint(BaseAPIView):
    """Workspace Favorite Group Children Endpoint"""

    serializer_class = UserFavoriteSerializer
    model = UserFavorite
    permission_classes = [WorkSpaceAdminPermission]

    @extend_schema(
        operation_id="list_workspace_favorite_group",
        summary="List favorites within a group",
        description="Retrieve the authenticated user's favorites nested under a favorite group (folder).",
        tags=["Favorites"],
        parameters=[WORKSPACE_SLUG_PARAMETER],
        responses={
            200: OpenApiResponse(description="Grouped favorites", response=UserFavoriteSerializer(many=True)),
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: NOT_FOUND_RESPONSE,
        },
    )
    def get(self, request, slug, favorite_id):
        """List favorites within a group"""
        favorites = UserFavorite.objects.filter(user=request.user, workspace__slug=slug, parent_id=favorite_id).filter(
            Q(project__isnull=True)
            | (
                Q(project__isnull=False)
                & Q(project__project_projectmember__member=request.user)
                & Q(project__project_projectmember__is_active=True)
            )
        )
        serializer = UserFavoriteSerializer(favorites, many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)
