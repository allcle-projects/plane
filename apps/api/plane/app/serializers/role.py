# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Custom RBAC — serializers (mote).
# See docs/mote-design/05-teamspaces-access.md, section 2.

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from plane.db.models import Permission, Role, RoleAssignment


class PermissionSerializer(BaseSerializer):
    class Meta:
        model = Permission
        fields = ["id", "key", "category", "description"]
        read_only_fields = fields


class RoleSerializer(BaseSerializer):
    # See InitiativeSerializer: unique_together carries deleted_at, so declare it
    # read_only to avoid DRF forcing it as a required write field.
    deleted_at = serializers.DateTimeField(read_only=True)
    # Read-only convenience: the permission keys this role grants.
    permission_keys = serializers.SerializerMethodField()

    class Meta:
        model = Role
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "is_system",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]

    def get_permission_keys(self, obj):
        return list(obj.permissions.values_list("key", flat=True))


class RoleAssignmentSerializer(BaseSerializer):
    deleted_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = RoleAssignment
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]
