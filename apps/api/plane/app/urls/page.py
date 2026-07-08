# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path


from plane.app.views import (
    PageViewSet,
    PageFavoriteViewSet,
    PagesDescriptionViewSet,
    PageVersionEndpoint,
    PageDuplicateEndpoint,
    PageCommentViewSet,
    PageCommentReactionViewSet,
    PageCollectionViewSet,
    PageCollaboratorViewSet,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages-summary/",
        PageViewSet.as_view({"get": "summary"}),
        name="project-pages-summary",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/",
        PageViewSet.as_view({"get": "list", "post": "create"}),
        name="project-pages",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/",
        PageViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="project-pages",
    ),
    # favorite pages
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/favorite-pages/<uuid:page_id>/",
        PageFavoriteViewSet.as_view({"post": "create", "delete": "destroy"}),
        name="user-favorite-pages",
    ),
    # archived pages
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/archive/",
        PageViewSet.as_view({"post": "archive", "delete": "unarchive"}),
        name="project-page-archive-unarchive",
    ),
    # lock and unlock
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/lock/",
        PageViewSet.as_view({"post": "lock", "delete": "unlock"}),
        name="project-pages-lock-unlock",
    ),
    # private and public page
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/access/",
        PageViewSet.as_view({"post": "access"}),
        name="project-pages-access",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/description/",
        PagesDescriptionViewSet.as_view({"get": "retrieve", "patch": "partial_update"}),
        name="page-description",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/versions/",
        PageVersionEndpoint.as_view(),
        name="page-versions",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/versions/<uuid:pk>/",
        PageVersionEndpoint.as_view(),
        name="page-versions",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/duplicate/",
        PageDuplicateEndpoint.as_view(),
        name="page-duplicate",
    ),
    # Workspace-scoped (global / wiki) pages
    path(
        "workspaces/<str:slug>/pages/",
        PageViewSet.as_view({"get": "list", "post": "create"}),
        name="workspace-pages",
    ),
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/",
        PageViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="workspace-pages",
    ),
    # archived pages
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/archive/",
        PageViewSet.as_view({"post": "archive", "delete": "unarchive"}),
        name="workspace-page-archive-unarchive",
    ),
    # lock and unlock
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/lock/",
        PageViewSet.as_view({"post": "lock", "delete": "unlock"}),
        name="workspace-pages-lock-unlock",
    ),
    # private and public page
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/access/",
        PageViewSet.as_view({"post": "access"}),
        name="workspace-pages-access",
    ),
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/description/",
        PagesDescriptionViewSet.as_view({"get": "retrieve", "patch": "partial_update"}),
        name="workspace-page-description",
    ),
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/versions/",
        PageVersionEndpoint.as_view(),
        name="workspace-page-versions",
    ),
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/versions/<uuid:pk>/",
        PageVersionEndpoint.as_view(),
        name="workspace-page-versions",
    ),
    # Page comments (workspace-scoped; serves both project & global / wiki pages)
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/comments/",
        PageCommentViewSet.as_view({"get": "list", "post": "create"}),
        name="page-comments",
    ),
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/comments/<uuid:pk>/",
        PageCommentViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="page-comments",
    ),
    # Page comment reactions
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/comments/<uuid:comment_id>/reactions/",
        PageCommentReactionViewSet.as_view({"post": "create"}),
        name="page-comment-reactions",
    ),
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/comments/<uuid:comment_id>/reactions/<str:reaction_code>/",
        PageCommentReactionViewSet.as_view({"delete": "destroy"}),
        name="page-comment-reactions",
    ),
    # Page collections
    path(
        "workspaces/<str:slug>/page-collections/",
        PageCollectionViewSet.as_view({"get": "list", "post": "create"}),
        name="page-collections",
    ),
    path(
        "workspaces/<str:slug>/page-collections/<uuid:pk>/",
        PageCollectionViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="page-collections",
    ),
    path(
        "workspaces/<str:slug>/page-collections/<uuid:collection_id>/pages/",
        PageCollectionViewSet.as_view({"post": "add_pages"}),
        name="page-collection-pages",
    ),
    path(
        "workspaces/<str:slug>/page-collections/<uuid:collection_id>/pages/<uuid:page_id>/",
        PageCollectionViewSet.as_view({"delete": "remove_page"}),
        name="page-collection-pages",
    ),
    # Shared pages (page collaborators)
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/collaborators/",
        PageCollaboratorViewSet.as_view({"get": "list", "post": "create"}),
        name="page-collaborators",
    ),
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/collaborators/<uuid:member_id>/",
        PageCollaboratorViewSet.as_view({"patch": "partial_update", "delete": "destroy"}),
        name="page-collaborators",
    ),
]
