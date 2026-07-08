# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Automations rule engine — mote.
# See docs/mote-design/06-integrations-importers-automations.md, Feature 3.

from django.urls import path

from plane.app.views import AutomationRuleViewSet


urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/automations/",
        AutomationRuleViewSet.as_view({"get": "list", "post": "create"}),
        name="project-automations",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/automations/<uuid:pk>/",
        AutomationRuleViewSet.as_view(
            {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
        ),
        name="project-automations",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/automations/<uuid:pk>/toggle/",
        AutomationRuleViewSet.as_view({"patch": "toggle"}),
        name="project-automation-toggle",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/automations/<uuid:pk>/logs/",
        AutomationRuleViewSet.as_view({"get": "logs"}),
        name="project-automation-logs",
    ),
]
