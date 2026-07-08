# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Teamspaces — serializers (mote).
# See docs/mote-design/05-teamspaces-access.md, section 1.

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from plane.db.models import Team, TeamMember, TeamProject


class TeamSerializer(BaseSerializer):
    # Explicit read_only ``deleted_at`` — same fix applied to InitiativeSerializer:
    # Team.Meta.unique_together includes ``deleted_at``, which otherwise makes DRF
    # auto-generate a UniqueTogetherValidator that forces deleted_at to be a
    # *required* write field and 400s every create.
    deleted_at = serializers.DateTimeField(read_only=True)
    # Convenience read-only rollups for the list/detail UI (no extra round-trips).
    member_ids = serializers.SerializerMethodField()
    project_ids = serializers.SerializerMethodField()

    class Meta:
        model = Team
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]

    def get_member_ids(self, obj):
        return [
            str(member_id)
            for member_id in obj.team_member.filter(
                deleted_at__isnull=True
            ).values_list("member_id", flat=True)
        ]

    def get_project_ids(self, obj):
        return [
            str(project_id)
            for project_id in obj.team_project.filter(
                deleted_at__isnull=True
            ).values_list("project_id", flat=True)
        ]


class TeamMemberSerializer(BaseSerializer):
    # See TeamSerializer — join model unique_together carries ``deleted_at``.
    deleted_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = TeamMember
        fields = "__all__"
        read_only_fields = [
            "workspace",
            # Set from the URL by the endpoint, not the request body.
            "team",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]


class TeamProjectSerializer(BaseSerializer):
    # See TeamSerializer — join model unique_together carries ``deleted_at``.
    deleted_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = TeamProject
        fields = "__all__"
        read_only_fields = [
            "workspace",
            # Set from the URL by the endpoint, not the request body.
            "team",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]
