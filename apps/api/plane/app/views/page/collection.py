# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db.models import Q

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import WorkspaceEntityPermission
from plane.app.serializers import PageCollectionSerializer
from plane.db.models import Page, PageCollection, PageCollectionItem, Workspace

# Local imports
from ..base import BaseViewSet


class PageCollectionViewSet(BaseViewSet):
    serializer_class = PageCollectionSerializer
    model = PageCollection
    permission_classes = [WorkspaceEntityPermission]

    def get_queryset(self):
        # Read scope: own collections + workspace-shared ones.
        slug = self.kwargs.get("slug")
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=slug)
            .filter(Q(owned_by=self.request.user) | Q(is_shared=True))
            .prefetch_related("items")
            .select_related("workspace", "owned_by")
        )

    def _get_owned(self, slug, pk):
        # Mutations are restricted to the owner (a shared collection is only
        # editable by whoever created it).
        return PageCollection.objects.filter(
            workspace__slug=slug, owned_by=self.request.user, pk=pk
        ).first()

    def create(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        serializer = PageCollectionSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(
                workspace_id=workspace.id,
                owned_by_id=request.user.id,
                created_by_id=request.user.id,
            )
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def partial_update(self, request, slug, pk=None):
        collection = self._get_owned(slug, pk)
        if collection is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        serializer = PageCollectionSerializer(collection, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def destroy(self, request, slug, pk=None):
        collection = self._get_owned(slug, pk)
        if collection is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        collection.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def add_pages(self, request, slug, collection_id=None):
        collection = self._get_owned(slug, collection_id)
        if collection is None:
            return Response(status=status.HTTP_404_NOT_FOUND)

        requested_ids = [str(pid) for pid in request.data.get("page_ids", [])]
        # Only pages that actually live in this workspace can be added.
        valid_ids = set(
            str(pid)
            for pid in Page.objects.filter(
                workspace_id=collection.workspace_id, id__in=requested_ids
            ).values_list("id", flat=True)
        )
        existing_ids = set(
            str(pid)
            for pid in collection.items.filter(deleted_at__isnull=True).values_list(
                "page_id", flat=True
            )
        )

        to_add = [pid for pid in requested_ids if pid in valid_ids and pid not in existing_ids]
        if to_add:
            PageCollectionItem.objects.bulk_create(
                [
                    PageCollectionItem(
                        workspace_id=collection.workspace_id,
                        collection_id=collection.id,
                        page_id=pid,
                        created_by_id=request.user.id,
                    )
                    for pid in to_add
                ]
            )

        serializer = PageCollectionSerializer(collection)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def remove_page(self, request, slug, collection_id=None, page_id=None):
        collection = self._get_owned(slug, collection_id)
        if collection is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        item = PageCollectionItem.objects.filter(
            collection_id=collection.id, page_id=page_id
        ).first()
        if item is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
