# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path


from plane.space.views import (
    ViewMetaDataEndpoint,
    ViewDeployBoardPublicSettingsEndpoint,
    ViewIssuesPublicEndpoint,
)

urlpatterns = [
    path(
        "anchor/<str:anchor>/view-meta/",
        ViewMetaDataEndpoint.as_view(),
        name="view-deploy-board-meta",
    ),
    path(
        "anchor/<str:anchor>/view-settings/",
        ViewDeployBoardPublicSettingsEndpoint.as_view(),
        name="view-deploy-board-settings",
    ),
    path(
        "anchor/<str:anchor>/view-issues/",
        ViewIssuesPublicEndpoint.as_view(),
        name="view-deploy-board-issues",
    ),
]
