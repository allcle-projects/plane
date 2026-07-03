# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Module imports
from plane.db.models import UserFavorite, Cycle, Module, Issue, IssueView, Page, Project


class ProjectFavoriteLiteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Project
        fields = ["id", "name", "logo_props"]


class PageFavoriteLiteSerializer(serializers.ModelSerializer):
    project_id = serializers.SerializerMethodField()

    class Meta:
        model = Page
        fields = ["id", "name", "logo_props", "project_id"]

    def get_project_id(self, obj):
        project = obj.projects.first()  # This gets the first project related to the Page
        return project.id if project else None


class CycleFavoriteLiteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cycle
        fields = ["id", "name", "logo_props", "project_id"]


class ModuleFavoriteLiteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Module
        fields = ["id", "name", "logo_props", "project_id"]


class ViewFavoriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = IssueView
        fields = ["id", "name", "logo_props", "project_id"]


def get_entity_model_and_serializer(entity_type):
    entity_map = {
        "cycle": (Cycle, CycleFavoriteLiteSerializer),
        "issue": (Issue, None),
        "module": (Module, ModuleFavoriteLiteSerializer),
        "view": (IssueView, ViewFavoriteSerializer),
        "page": (Page, PageFavoriteLiteSerializer),
        "project": (Project, ProjectFavoriteLiteSerializer),
        "folder": (None, None),
    }
    return entity_map.get(entity_type, (None, None))


class UserFavoriteSerializer(serializers.ModelSerializer):
    entity_data = serializers.SerializerMethodField()

    class Meta:
        model = UserFavorite
        fields = [
            "id",
            "entity_type",
            "entity_identifier",
            "entity_data",
            "name",
            "is_folder",
            "sequence",
            "parent",
            "workspace_id",
            "project_id",
        ]
        read_only_fields = ["workspace", "created_by", "updated_by"]

    def get_entity_data(self, obj):
        entity_type = obj.entity_type
        entity_identifier = obj.entity_identifier

        entity_model, entity_serializer = get_entity_model_and_serializer(entity_type)
        if not (entity_model and entity_serializer):
            return None

        # Scope the entity lookup to the favorite's workspace and to projects the
        # requesting user is an active member of. Without this, a caller could
        # favorite an arbitrary entity UUID (from a project/workspace they cannot
        # access) and read back its name/logo via entity_data.
        qs = entity_model.objects.filter(pk=entity_identifier, workspace_id=obj.workspace_id)
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is not None:
            if entity_type == "project":
                qs = qs.filter(
                    project_projectmember__member=user,
                    project_projectmember__is_active=True,
                )
            elif entity_type == "page":
                qs = qs.filter(
                    projects__project_projectmember__member=user,
                    projects__project_projectmember__is_active=True,
                )
            else:  # cycle, module, view — project-scoped via a project FK
                qs = qs.filter(
                    project__project_projectmember__member=user,
                    project__project_projectmember__is_active=True,
                )
        entity = qs.first()
        return entity_serializer(entity).data if entity else None
