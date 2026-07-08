# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Automations rule engine — serializers (mote).
# See docs/mote-design/06-integrations-importers-automations.md, Feature 3.

# Module imports
from rest_framework import serializers

from .base import BaseSerializer
from plane.db.models import AutomationRule, AutomationRuleLog

VALID_OPERATORS = {"eq", "neq", "in", "contains", "is_empty", "is_not_empty"}
VALID_ACTION_TYPES = {
    "set_state",
    "set_priority",
    "add_label",
    "remove_label",
    "set_completed_at",
    # Documented but unimplemented in v1 — accepted so rules can be authored
    # ahead of support; evaluate_automations logs them as unsupported.
    "notify_slack",
    "create_subtask",
    "move_project",
}


class AutomationRuleSerializer(BaseSerializer):
    class Meta:
        model = AutomationRule
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "project",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
            "deleted_at",
        ]

    def validate_conditions(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("conditions must be a list.")
        for condition in value:
            if not isinstance(condition, dict):
                raise serializers.ValidationError(
                    "each condition must be an object with field/operator/value."
                )
            if not condition.get("field") or not condition.get("operator"):
                raise serializers.ValidationError(
                    "each condition requires a 'field' and an 'operator'."
                )
            if condition["operator"] not in VALID_OPERATORS:
                raise serializers.ValidationError(
                    f"unsupported operator '{condition['operator']}'."
                )
        return value

    def validate_actions(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("actions must be a list.")
        for action in value:
            if not isinstance(action, dict):
                raise serializers.ValidationError(
                    "each action must be an object with type/params."
                )
            if not action.get("type"):
                raise serializers.ValidationError("each action requires a 'type'.")
            if action["type"] not in VALID_ACTION_TYPES:
                raise serializers.ValidationError(
                    f"unsupported action type '{action['type']}'."
                )
            if "params" in action and not isinstance(action["params"], dict):
                raise serializers.ValidationError("action 'params' must be an object.")
        return value


class AutomationRuleLogSerializer(BaseSerializer):
    class Meta:
        model = AutomationRuleLog
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "project",
            "rule",
            "issue",
            "matched",
            "actions_run",
            "error",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
            "deleted_at",
        ]
