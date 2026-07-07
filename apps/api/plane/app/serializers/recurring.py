# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Recurring work items — serializers (mote).
# See docs/mote-design/03-work-item-power.md, section 3.

# Module imports
from rest_framework import serializers

from .base import BaseSerializer
from plane.db.models import RecurringIssue, RecurringIssueRun
from plane.utils.recurrence import compute_initial_next_run

# Schedule fields that, when changed, require reseeding next_run_at.
SCHEDULE_FIELDS = (
    "cadence",
    "start_date",
    "interval",
    "weekdays",
    "cron_expression",
)


class RecurringIssueSerializer(BaseSerializer):
    class Meta:
        model = RecurringIssue
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "project",
            "next_run_at",
            "last_run_at",
            "occurrence_count",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]

    def validate(self, data):
        # Merge with the existing instance so partial updates validate against
        # the effective (post-update) schedule.
        instance = self.instance

        def eff(field, default=None):
            if field in data:
                return data[field]
            if instance is not None:
                return getattr(instance, field)
            return default

        cadence = eff("cadence")
        interval = eff("interval", 1)
        weekdays = eff("weekdays", []) or []
        cron_expression = eff("cron_expression")
        start_date = eff("start_date")
        end_date = eff("end_date")

        if interval is not None and interval < 1:
            raise serializers.ValidationError(
                {"interval": "interval must be a positive integer."}
            )

        for wd in weekdays:
            if wd < 0 or wd > 6:
                raise serializers.ValidationError(
                    {"weekdays": "weekdays must be integers 0 (Mon) .. 6 (Sun)."}
                )

        if cadence == "cron":
            if not cron_expression:
                raise serializers.ValidationError(
                    {"cron_expression": "cron cadence requires a cron_expression."}
                )
            try:
                from croniter import croniter

                if not croniter.is_valid(cron_expression):
                    raise serializers.ValidationError(
                        {"cron_expression": "Invalid cron expression."}
                    )
            except ImportError:
                raise serializers.ValidationError(
                    {"cron_expression": "cron cadence requires the croniter package."}
                )

        if end_date and start_date and end_date < start_date:
            raise serializers.ValidationError(
                {"end_date": "end_date must be on or after start_date."}
            )

        # Require a shape: a template reference or a non-empty inline issue_data.
        template = eff("template")
        issue_data = eff("issue_data", {})
        if template is None and not issue_data:
            raise serializers.ValidationError(
                "Provide either 'template' or a non-empty 'issue_data'."
            )

        return data

    def _seed_next_run(self, instance):
        instance.next_run_at = compute_initial_next_run(
            cadence=instance.cadence,
            start_date=instance.start_date,
            interval=instance.interval,
            weekdays=instance.weekdays,
            cron_expression=instance.cron_expression,
        )

    def create(self, validated_data):
        instance = RecurringIssue(**validated_data)
        self._seed_next_run(instance)
        instance.save()
        return instance

    def update(self, instance, validated_data):
        reseed = any(field in validated_data for field in SCHEDULE_FIELDS)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if reseed:
            self._seed_next_run(instance)
        instance.save()
        return instance


class RecurringIssueRunSerializer(BaseSerializer):
    class Meta:
        model = RecurringIssueRun
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "project",
            "recurring",
            "issue",
            "run_at",
            "status",
            "error",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]
