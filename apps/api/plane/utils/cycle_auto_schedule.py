# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.utils import timezone

# Module imports
from plane.db.models import Cycle
from plane.bgtasks.webhook_task import model_activity
from plane.utils.host import base_host


def auto_schedule_next_cycle(*, completed_cycle, actor_id, slug, request):
    """
    When a cycle with `auto_schedule=True` completes, activate the next queued
    (upcoming) cycle in the same project.

    Selection: the earliest `upcoming`, non-archived cycle ordered by
    start_date then sort_order. The manual `state` governs the lifecycle, so we
    do not reject on date overlap here (a manually-extended current cycle may
    overlap the next upcoming one) — activation is unconditional.

    Returns the activated Cycle instance, or None if nothing was scheduled.
    """
    if not completed_cycle.auto_schedule:
        return None

    next_cycle = (
        Cycle.objects.filter(
            workspace__slug=slug,
            project_id=completed_cycle.project_id,
            state="upcoming",
            archived_at__isnull=True,
        )
        .exclude(pk=completed_cycle.pk)
        .order_by("start_date", "sort_order")
        .first()
    )

    if next_cycle is None:
        return None

    next_cycle.state = "current"
    next_cycle.started_at = timezone.now()
    next_cycle.save(update_fields=["state", "started_at"])

    # Emit the model activity for the auto-activated cycle.
    model_activity.delay(
        model_name="cycle",
        model_id=str(next_cycle.id),
        requested_data={"state": "current", "auto_scheduled": True},
        current_instance=None,
        actor_id=actor_id,
        slug=slug,
        origin=base_host(request=request, is_app=True),
    )

    return next_cycle
