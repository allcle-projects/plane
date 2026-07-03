# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.api.views import (
    NotificationListAPIEndpoint,
    NotificationDetailAPIEndpoint,
    NotificationMarkReadAPIEndpoint,
    NotificationArchiveAPIEndpoint,
    UnreadNotificationAPIEndpoint,
    MarkAllReadNotificationAPIEndpoint,
    UserNotificationPreferenceAPIEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/users/notifications/",
        NotificationListAPIEndpoint.as_view(http_method_names=["get"]),
        name="notifications",
    ),
    path(
        "workspaces/<str:slug>/users/notifications/unread/",
        UnreadNotificationAPIEndpoint.as_view(http_method_names=["get"]),
        name="unread-notifications",
    ),
    path(
        "workspaces/<str:slug>/users/notifications/mark-all-read/",
        MarkAllReadNotificationAPIEndpoint.as_view(http_method_names=["post"]),
        name="mark-all-read-notifications",
    ),
    path(
        "workspaces/<str:slug>/users/notifications/<uuid:pk>/",
        NotificationDetailAPIEndpoint.as_view(http_method_names=["get", "patch", "delete"]),
        name="notification-detail",
    ),
    path(
        "workspaces/<str:slug>/users/notifications/<uuid:pk>/read/",
        NotificationMarkReadAPIEndpoint.as_view(http_method_names=["post", "delete"]),
        name="notification-mark-read",
    ),
    path(
        "workspaces/<str:slug>/users/notifications/<uuid:pk>/archive/",
        NotificationArchiveAPIEndpoint.as_view(http_method_names=["post", "delete"]),
        name="notification-archive",
    ),
    path(
        "users/me/notification-preferences/",
        UserNotificationPreferenceAPIEndpoint.as_view(http_method_names=["get", "patch"]),
        name="user-notification-preferences",
    ),
]
