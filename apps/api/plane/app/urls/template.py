# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Templates (work item + project templates) — mote.
# See docs/mote-design/03-work-item-power.md, section 2.

from django.urls import path

from plane.app.views import (
    TemplateViewSet,
    TemplateInstantiateEndpoint,
)


urlpatterns = [
    # Workspace-scoped template CRUD (both work_item and project types;
    # filter with ?type=work_item|project).
    path(
        "workspaces/<str:slug>/templates/",
        TemplateViewSet.as_view({"get": "list", "post": "create"}),
        name="templates",
    ),
    path(
        "workspaces/<str:slug>/templates/<uuid:pk>/",
        TemplateViewSet.as_view(
            {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
        ),
        name="templates",
    ),
    # Instantiate a work_item template into a fresh Issue in a target project.
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/templates/<uuid:template_id>/instantiate/",
        TemplateInstantiateEndpoint.as_view(),
        name="template-instantiate",
    ),
]
