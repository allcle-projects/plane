# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.contrib.postgres.aggregates import ArrayAgg
from django.contrib.postgres.fields import ArrayField
from django.db.models import Q, UUIDField, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

# Third party imports
from rest_framework import status
from rest_framework.response import Response
from drf_spectacular.utils import OpenApiRequest, OpenApiResponse

# Module imports
from plane.api.serializers import (
    PageSerializer,
    PageCreateSerializer,
    PageUpdateSerializer,
)
from plane.app.permissions import ProjectEntityPermission
from plane.bgtasks.page_transaction_task import page_transaction
from plane.db.models import Page, ProjectMember, UserFavorite
from .base import BaseAPIView
from plane.utils.openapi import (
    page_docs,
    PAGE_PK_PARAMETER,
    CURSOR_PARAMETER,
    PER_PAGE_PARAMETER,
    ORDER_BY_PARAMETER,
    FIELDS_PARAMETER,
    EXPAND_PARAMETER,
    create_paginated_response,
    # Request Examples
    PAGE_CREATE_EXAMPLE,
    PAGE_UPDATE_EXAMPLE,
    # Response Examples
    PAGE_EXAMPLE,
    DELETED_RESPONSE,
    ARCHIVED_RESPONSE,
    UNARCHIVED_RESPONSE,
    ADMIN_ONLY_RESPONSE,
    INVALID_REQUEST_RESPONSE,
    PAGE_NOT_FOUND_RESPONSE,
    PAGE_LOCKED_RESPONSE,
)


def _annotate_project_ids(queryset):
    return queryset.annotate(
        project_ids=Coalesce(
            ArrayAgg("projects__id", distinct=True, filter=~Q(projects__id=True)),
            Value([], output_field=ArrayField(UUIDField())),
        )
    )


class PageListCreateAPIEndpoint(BaseAPIView):
    """Page List and Create Endpoint"""

    serializer_class = PageSerializer
    model = Page
    webhook_event = "page"
    permission_classes = [ProjectEntityPermission]
    use_read_replica = True

    def get_queryset(self):
        return _annotate_project_ids(
            Page.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .filter(projects__id=self.kwargs.get("project_id"))
            .filter(project_pages__deleted_at__isnull=True)
            .filter(
                projects__project_projectmember__member=self.request.user,
                projects__project_projectmember__is_active=True,
            )
            .filter(Q(owned_by=self.request.user) | Q(access=Page.PUBLIC_ACCESS))
            .select_related("workspace")
            .select_related("owned_by")
        ).order_by(self.kwargs.get("order_by", "-created_at")).distinct()

    @page_docs(
        operation_id="list_pages",
        summary="List pages",
        description="Retrieve all non-archived pages linked to a project.",
        parameters=[
            CURSOR_PARAMETER,
            PER_PAGE_PARAMETER,
            ORDER_BY_PARAMETER,
            FIELDS_PARAMETER,
            EXPAND_PARAMETER,
        ],
        responses={
            200: create_paginated_response(
                PageSerializer,
                "PaginatedPageResponse",
                "Paginated list of pages",
                "Paginated Pages",
            ),
        },
    )
    def get(self, request, slug, project_id):
        """List pages

        Retrieve all non-archived pages linked to a project.
        Archived pages are available via the archived pages endpoint.
        """
        return self.paginate(
            request=request,
            queryset=(self.get_queryset().filter(archived_at__isnull=True)),
            on_results=lambda pages: PageSerializer(pages, many=True, fields=self.fields, expand=self.expand).data,
        )

    @page_docs(
        operation_id="create_page",
        summary="Create page",
        description="Create a new page and link it to the project.",
        request=OpenApiRequest(
            request=PageCreateSerializer,
            examples=[PAGE_CREATE_EXAMPLE],
        ),
        responses={
            201: OpenApiResponse(
                description="Page created",
                response=PageSerializer,
                examples=[PAGE_EXAMPLE],
            ),
            400: INVALID_REQUEST_RESPONSE,
        },
    )
    def post(self, request, slug, project_id):
        """Create page

        Create a new page with the specified name, description, and access level.
        Automatically links the page to the requesting project and assigns the
        creator as owner.
        """
        serializer = PageCreateSerializer(
            data=request.data,
            context={"project_id": project_id, "owned_by_id": request.user.id},
        )
        if serializer.is_valid():
            serializer.save()
            # capture the page transaction
            page_transaction.delay(
                new_description_html=request.data.get("description_html", "<p></p>"),
                old_description_html=None,
                page_id=serializer.instance.id,
            )
            page = self.get_queryset().get(pk=serializer.instance.id)
            serializer = PageSerializer(page)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class PageDetailAPIEndpoint(BaseAPIView):
    """Page Detail Endpoint"""

    serializer_class = PageSerializer
    model = Page
    webhook_event = "page"
    permission_classes = [ProjectEntityPermission]
    use_read_replica = True

    def get_queryset(self):
        return _annotate_project_ids(
            Page.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .filter(projects__id=self.kwargs.get("project_id"))
            .filter(project_pages__deleted_at__isnull=True)
            .filter(
                projects__project_projectmember__member=self.request.user,
                projects__project_projectmember__is_active=True,
            )
            .filter(Q(owned_by=self.request.user) | Q(access=Page.PUBLIC_ACCESS))
            .select_related("workspace")
            .select_related("owned_by")
        ).distinct()

    @page_docs(
        operation_id="retrieve_page",
        summary="Retrieve page",
        description="Retrieve details of a specific page.",
        parameters=[PAGE_PK_PARAMETER],
        responses={
            200: OpenApiResponse(
                description="Page",
                response=PageSerializer,
                examples=[PAGE_EXAMPLE],
            ),
            404: PAGE_NOT_FOUND_RESPONSE,
        },
    )
    def get(self, request, slug, project_id, pk):
        """Retrieve page

        Retrieve details of a specific page, including archived pages.
        """
        page = self.get_queryset().get(pk=pk)
        data = PageSerializer(page, fields=self.fields, expand=self.expand).data
        return Response(data, status=status.HTTP_200_OK)

    @page_docs(
        operation_id="update_page",
        summary="Update page",
        description="Modify an existing page's name, description, or access level. Locked pages cannot be edited.",  # noqa: E501
        parameters=[PAGE_PK_PARAMETER],
        request=OpenApiRequest(
            request=PageUpdateSerializer,
            examples=[PAGE_UPDATE_EXAMPLE],
        ),
        responses={
            200: OpenApiResponse(
                description="Page updated",
                response=PageSerializer,
                examples=[PAGE_EXAMPLE],
            ),
            400: PAGE_LOCKED_RESPONSE,
            404: PAGE_NOT_FOUND_RESPONSE,
        },
    )
    def patch(self, request, slug, project_id, pk):
        """Update page

        Modify an existing page's name, description, or access level.
        Locked pages cannot be edited, and only the page owner can change
        its access level.
        """
        page = Page.objects.get(
            pk=pk,
            workspace__slug=slug,
            projects__id=project_id,
            project_pages__deleted_at__isnull=True,
        )

        if page.is_locked:
            return Response({"error": "Page is locked"}, status=status.HTTP_400_BAD_REQUEST)

        # Only update access if the page owner is the requesting user
        if page.access != request.data.get("access", page.access) and page.owned_by_id != request.user.id:
            return Response(
                {"error": "Access cannot be updated since this page is owned by someone else"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        old_description_html = page.description_html
        serializer = PageUpdateSerializer(page, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            # capture the page transaction
            if request.data.get("description_html"):
                page_transaction.delay(
                    new_description_html=request.data.get("description_html", "<p></p>"),
                    old_description_html=old_description_html,
                    page_id=pk,
                )
                # the collaborative editor loads description_binary when present,
                # which would shadow an HTML update made through the API — reset
                # it so the live server rebuilds the document from the new HTML
                Page.objects.filter(pk=pk).update(description_binary=None)
            page = self.get_queryset().get(pk=pk)
            return Response(PageSerializer(page).data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @page_docs(
        operation_id="delete_page",
        summary="Delete page",
        description="Permanently remove a page. The page must be archived before it can be deleted.",
        parameters=[PAGE_PK_PARAMETER],
        responses={
            204: DELETED_RESPONSE,
            400: INVALID_REQUEST_RESPONSE,
            403: ADMIN_ONLY_RESPONSE,
            404: PAGE_NOT_FOUND_RESPONSE,
        },
    )
    def delete(self, request, slug, project_id, pk):
        """Delete page

        Permanently remove a page. The page must be archived before it can be
        deleted, and only the page owner or a project admin can delete it.
        """
        page = Page.objects.get(
            pk=pk,
            workspace__slug=slug,
            projects__id=project_id,
            project_pages__deleted_at__isnull=True,
        )

        if page.archived_at is None:
            return Response(
                {"error": "The page should be archived before deleting"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if page.owned_by_id != request.user.id and (
            not ProjectMember.objects.filter(
                workspace__slug=slug,
                member=request.user,
                role=20,
                project_id=project_id,
                is_active=True,
            ).exists()
        ):
            return Response(
                {"error": "Only admin or owner can delete the page"},
                status=status.HTTP_403_FORBIDDEN,
            )

        page.delete()
        # Delete the user favorite page
        UserFavorite.objects.filter(
            project=project_id,
            workspace__slug=slug,
            entity_identifier=pk,
            entity_type="page",
        ).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PageArchiveUnarchiveAPIEndpoint(BaseAPIView):
    """Page Archive and Unarchive Endpoint"""

    permission_classes = [ProjectEntityPermission]
    use_read_replica = True

    def get_queryset(self):
        return _annotate_project_ids(
            Page.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .filter(projects__id=self.kwargs.get("project_id"))
            .filter(project_pages__deleted_at__isnull=True)
            .filter(
                projects__project_projectmember__member=self.request.user,
                projects__project_projectmember__is_active=True,
            )
            .filter(Q(owned_by=self.request.user) | Q(access=Page.PUBLIC_ACCESS))
            .filter(archived_at__isnull=False)
            .select_related("workspace")
            .select_related("owned_by")
        ).order_by(self.kwargs.get("order_by", "-created_at")).distinct()

    @page_docs(
        operation_id="list_archived_pages",
        summary="List archived pages",
        description="Retrieve all pages that have been archived in the project.",
        parameters=[CURSOR_PARAMETER, PER_PAGE_PARAMETER],
        request={},
        responses={
            200: create_paginated_response(
                PageSerializer,
                "PaginatedArchivedPageResponse",
                "Paginated list of archived pages",
                "Paginated Archived Pages",
            ),
        },
    )
    def get(self, request, slug, project_id):
        """List archived pages

        Retrieve all pages that have been archived in the project.
        """
        return self.paginate(
            request=request,
            queryset=(self.get_queryset()),
            on_results=lambda pages: PageSerializer(pages, many=True, fields=self.fields, expand=self.expand).data,
        )

    @page_docs(
        operation_id="archive_page",
        summary="Archive page",
        description="Move a page to archived status. Only the page owner or a project admin can archive it.",
        parameters=[PAGE_PK_PARAMETER],
        request={},
        responses={
            204: ARCHIVED_RESPONSE,
            400: ADMIN_ONLY_RESPONSE,
            404: PAGE_NOT_FOUND_RESPONSE,
        },
    )
    def post(self, request, slug, project_id, pk):
        """Archive page

        Move a page to archived status for historical tracking.
        Only the page owner or a project admin can archive it.
        """
        page = Page.objects.get(
            pk=pk,
            workspace__slug=slug,
            projects__id=project_id,
            project_pages__deleted_at__isnull=True,
        )

        # only the owner or admin can archive the page
        if (
            ProjectMember.objects.filter(
                project_id=project_id, member=request.user, is_active=True, role__lte=15
            ).exists()
            and request.user.id != page.owned_by_id
        ):
            return Response(
                {"error": "Only the owner or admin can archive the page"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        UserFavorite.objects.filter(
            entity_type="page",
            entity_identifier=pk,
            project_id=project_id,
            workspace__slug=slug,
        ).delete()

        page.archived_at = timezone.now()
        page.save()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @page_docs(
        operation_id="unarchive_page",
        summary="Unarchive page",
        description="Restore an archived page to active status. Only the page owner or a project admin can unarchive it.",  # noqa: E501
        parameters=[PAGE_PK_PARAMETER],
        responses={
            204: UNARCHIVED_RESPONSE,
            400: ADMIN_ONLY_RESPONSE,
            404: PAGE_NOT_FOUND_RESPONSE,
        },
    )
    def delete(self, request, slug, project_id, pk):
        """Unarchive page

        Restore an archived page to active status, making it available for
        regular use. Only the page owner or a project admin can unarchive it.
        """
        page = Page.objects.get(
            pk=pk,
            workspace__slug=slug,
            projects__id=project_id,
            project_pages__deleted_at__isnull=True,
        )

        # only the owner or admin can un archive the page
        if (
            ProjectMember.objects.filter(
                project_id=project_id, member=request.user, is_active=True, role__lte=15
            ).exists()
            and request.user.id != page.owned_by_id
        ):
            return Response(
                {"error": "Only the owner or admin can un archive the page"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        page.archived_at = None
        page.save()
        return Response(status=status.HTTP_204_NO_CONTENT)
