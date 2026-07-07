# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Recurring work items — dispatcher + materialization (mote).
# See docs/mote-design/03-work-item-power.md, section 3.3.
#
# ``dispatch_due_recurring_issues`` is the celery-beat tick (registered in
# plane/celery.py beat_schedule, every 5 min). It fans out one
# ``create_recurring_issue`` per due row. ``create_recurring_issue`` builds a
# fresh Issue from the recurrence's Template / inline ``issue_data`` (reusing the
# shared instantiation helper, which reuses the CF Phase-2 property-value write),
# records a RecurringIssueRun, and advances ``next_run_at``.
#
# Idempotency: ``create_recurring_issue`` re-reads the row under
# ``select_for_update()`` and re-checks ``is_active`` + ``next_run_at`` inside the
# same transaction as the create + advance. Overlapping beat ticks (or a worker
# restart mid-run) therefore cannot double-create: the second runner blocks on
# the lock, then sees ``next_run_at`` already advanced into the future and exits.

# Python imports
import json

# Third party imports
from celery import shared_task

# Django imports
from django.db import transaction
from django.utils import timezone
from django.core.serializers.json import DjangoJSONEncoder

# Module imports
from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import RecurringIssue, RecurringIssueRun
from plane.utils.exception_logger import log_exception
from plane.utils.issue_instantiation import instantiate_issue_from_data
from plane.utils.recurrence import next_occurrence

# Safeguard cap on the catch-up loop (no backfill: skip missed slots forward).
_MAX_ADVANCE_STEPS = 5000


def _advance_next_run(recurring, now):
    """Advance ``next_run_at`` past ``now`` from its current value (drift-free).

    Skips any missed occurrences (no backfill) so a long-dormant recurrence
    materializes once and jumps forward rather than firing repeatedly.
    """
    nxt = next_occurrence(
        recurring.next_run_at,
        cadence=recurring.cadence,
        interval=recurring.interval,
        weekdays=recurring.weekdays,
        cron_expression=recurring.cron_expression,
    )
    steps = 0
    while nxt <= now and steps < _MAX_ADVANCE_STEPS:
        nxt = next_occurrence(
            nxt,
            cadence=recurring.cadence,
            interval=recurring.interval,
            weekdays=recurring.weekdays,
            cron_expression=recurring.cron_expression,
        )
        steps += 1
    recurring.next_run_at = nxt


def _should_deactivate(recurring):
    if (
        recurring.max_occurrences is not None
        and recurring.occurrence_count >= recurring.max_occurrences
    ):
        return True
    if recurring.end_date is not None and recurring.next_run_at.date() > recurring.end_date:
        return True
    return False


@shared_task
def dispatch_due_recurring_issues():
    """Beat tick: fan out one materialization task per due recurrence."""
    now = timezone.now()
    due_ids = list(
        RecurringIssue.objects.filter(
            is_active=True, next_run_at__lte=now
        ).values_list("id", flat=True)
    )
    for recurring_id in due_ids:
        create_recurring_issue.delay(str(recurring_id))
    return len(due_ids)


@shared_task
def create_recurring_issue(recurring_id):
    """Materialize one issue for a due recurrence, then advance its schedule."""
    now = timezone.now()
    issue = None
    payload = None
    property_changes = []
    project_id = None

    with transaction.atomic():
        try:
            # Lock ONLY the recurring row (of=("self",)). `template` is a nullable
            # FK → select_related emits a LEFT OUTER JOIN, and Postgres rejects
            # `FOR UPDATE` on the nullable side of an outer join
            # (NotSupportedError). Locking just self sidesteps that while still
            # serialising concurrent ticks on this recurrence.
            recurring = (
                RecurringIssue.objects.select_for_update(of=("self",))
                .select_related("project", "template")
                .get(pk=recurring_id)
            )
        except RecurringIssue.DoesNotExist:
            return

        # Idempotency guard: re-check under the row lock. A concurrent tick that
        # already ran will have advanced next_run_at into the future.
        if not recurring.is_active or recurring.next_run_at > now:
            return

        project = recurring.project
        project_id = project.id
        # Shape: the referenced Template's snapshot, else the inline issue_data.
        if recurring.template_id and recurring.template is not None:
            shape = recurring.template.template_data or {}
        else:
            shape = recurring.issue_data or {}

        try:
            issue, payload, property_changes = instantiate_issue_from_data(
                shape, project, actor_id=None
            )
        except Exception as e:
            # Record the failure, still advance the schedule so a bad shape does
            # not hot-loop every tick, and bail.
            log_exception(e)
            RecurringIssueRun.objects.create(
                recurring=recurring,
                project_id=project.id,
                run_at=now,
                status="failed",
                error=str(e)[:2000],
            )
            recurring.last_run_at = now
            _advance_next_run(recurring, now)
            if _should_deactivate(recurring):
                recurring.is_active = False
            recurring.save(
                update_fields=[
                    "last_run_at",
                    "next_run_at",
                    "is_active",
                    "updated_at",
                ]
            )
            return

        RecurringIssueRun.objects.create(
            recurring=recurring,
            issue=issue,
            project_id=project.id,
            run_at=now,
            status="success",
        )
        recurring.last_run_at = now
        recurring.occurrence_count += 1
        _advance_next_run(recurring, now)
        if _should_deactivate(recurring):
            recurring.is_active = False
        recurring.save(
            update_fields=[
                "last_run_at",
                "occurrence_count",
                "next_run_at",
                "is_active",
                "updated_at",
            ]
        )

    # Emit activity after commit. actor_id=None => system-created (no notifier).
    if issue is not None:
        epoch = int(timezone.now().timestamp())
        issue_activity.delay(
            type="issue.activity.created",
            requested_data=json.dumps(payload, cls=DjangoJSONEncoder),
            actor_id=None,
            issue_id=str(issue.id),
            project_id=str(project_id),
            current_instance=None,
            epoch=epoch,
            notification=False,
        )
        for change in property_changes:
            issue_activity.delay(
                type=f"issue_property_value.activity.{change['verb']}",
                requested_data=json.dumps(change, cls=DjangoJSONEncoder),
                actor_id=None,
                issue_id=str(issue.id),
                project_id=str(project_id),
                current_instance=json.dumps(
                    {"old_values": change["old_values"]}, cls=DjangoJSONEncoder
                ),
                epoch=epoch,
                notification=False,
            )
