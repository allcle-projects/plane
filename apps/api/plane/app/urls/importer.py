# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# CSV importer — mote.
# See docs/mote-design/06-integrations-importers-automations.md.

from django.urls import path

from plane.app.views import ProjectIssueCSVImportEndpoint


urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/import-csv/",
        ProjectIssueCSVImportEndpoint.as_view(),
        name="project-issue-csv-import",
    ),
]
