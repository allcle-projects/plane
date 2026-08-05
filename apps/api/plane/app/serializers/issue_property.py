# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Custom Fields / Work Item Properties — mote (Phase 1).
# See docs/mote-design/03-work-item-power.md, section 1.
#
# Definition-level serializers only. Per-type validation applies to the
# DEFINITION (number range / url format / required), not to values —
# no value endpoints ship in Phase 1.

# Django imports
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import URLValidator

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from plane.db.models import (
    IssueType,
    IssueProperty,
    IssuePropertyOption,
    ProjectIssueType,
    PropertyTypeEnum,
)


class IssueTypeSerializer(BaseSerializer):
    class Meta:
        model = IssueType
        fields = "__all__"
        read_only_fields = ["workspace", "created_by", "updated_by", "created_at", "updated_at"]


class ProjectIssueTypeSerializer(BaseSerializer):
    # Read-only embed of the linked work item type, so the project-scoped
    # list endpoint carries the type's name/logo/flags without a second call.
    issue_type_detail = IssueTypeSerializer(source="issue_type", read_only=True)

    class Meta:
        model = ProjectIssueType
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "project",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]


class IssuePropertyOptionSerializer(BaseSerializer):
    class Meta:
        model = IssuePropertyOption
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "project",
            "property",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]


class IssuePropertySerializer(BaseSerializer):
    def validate(self, data):
        # property_type may be absent on partial updates; fall back to instance.
        property_type = data.get("property_type") or (
            self.instance.property_type if self.instance else None
        )
        settings = data.get("settings")
        if settings is None and self.instance is not None:
            settings = self.instance.settings
        settings = settings or {}
        default_value = data.get("default_value")
        if default_value is None and self.instance is not None:
            default_value = self.instance.default_value

        # NUMBER: settings min/max must be numeric with min <= max; defaults numeric + in range.
        if property_type == PropertyTypeEnum.NUMBER:
            minimum = settings.get("min")
            maximum = settings.get("max")
            for bound_name, bound in (("min", minimum), ("max", maximum)):
                if bound is not None and not isinstance(bound, (int, float)):
                    raise serializers.ValidationError(
                        {"settings": f"'{bound_name}' must be a number."}
                    )
            if (
                isinstance(minimum, (int, float))
                and isinstance(maximum, (int, float))
                and minimum > maximum
            ):
                raise serializers.ValidationError({"settings": "'min' cannot be greater than 'max'."})
            for entry in default_value or []:
                try:
                    numeric = float(entry)
                except (TypeError, ValueError):
                    raise serializers.ValidationError(
                        {"default_value": f"'{entry}' is not a valid number."}
                    )
                if isinstance(minimum, (int, float)) and numeric < minimum:
                    raise serializers.ValidationError(
                        {"default_value": f"'{entry}' is below the minimum ({minimum})."}
                    )
                if isinstance(maximum, (int, float)) and numeric > maximum:
                    raise serializers.ValidationError(
                        {"default_value": f"'{entry}' is above the maximum ({maximum})."}
                    )

        # URL: default values must be well-formed URLs.
        if property_type == PropertyTypeEnum.URL:
            url_validator = URLValidator()
            for entry in default_value or []:
                try:
                    url_validator(entry)
                except DjangoValidationError:
                    raise serializers.ValidationError(
                        {"default_value": f"'{entry}' is not a valid URL."}
                    )

        # Single-value definitions cannot carry more than one default.
        is_multi = data.get("is_multi")
        if is_multi is None and self.instance is not None:
            is_multi = self.instance.is_multi
        if (
            property_type != PropertyTypeEnum.MULTI_SELECT
            and not is_multi
            and default_value
            and len(default_value) > 1
        ):
            raise serializers.ValidationError(
                {"default_value": "A single-value property can have at most one default value."}
            )

        return data

    class Meta:
        model = IssueProperty
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "project",
            "issue_type",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]


class IssuePropertyReadSerializer(BaseSerializer):
    # Output-only serializer (list/retrieve); embeds options for the settings UI.
    options = IssuePropertyOptionSerializer(read_only=True, many=True)

    class Meta:
        model = IssueProperty
        fields = "__all__"
