# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Milestones — rollup progress snapshot (mote).
# See docs/mote-design/04-planning-hierarchy.md, section 2 ("Milestones").
#
# A Milestone denormalises the completion state of its attached work items into
# ``Milestone.progress_snapshot`` (mirroring how Cycle caches ``progress_snapshot``
# at cycle.py:74) so list/detail reads stay cheap and never aggregate live.
# ``compute_milestone_snapshot`` builds the dict; ``update_milestone_progress`` is
# the celery task that recomputes + persists it (call on demand from the analytics
# endpoint, or async on issue state changes).

# Third party imports
from celery import shared_task

# Django imports
from django.db.models import Count

# Module imports
from plane.db.models import Milestone, MilestoneIssue, Issue
from plane.utils.exception_logger import log_exception


def compute_milestone_snapshot(milestone):
    """Aggregate work-item completion for one Milestone's attached issues.

    Counts the live (non-deleted) work items attached to the milestone, grouped
    by their state ``group``. Triage issues are excluded (they are not "real"
    planned work). Returns a plain dict suitable for JSON storage in
    ``progress_snapshot``.
    """
    issue_ids = list(
        MilestoneIssue.objects.filter(
            milestone=milestone, deleted_at__isnull=True
        ).values_list("issue_id", flat=True)
    )

    group_rows = (
        Issue.issue_objects.filter(id__in=issue_ids)
        .exclude(state__group="triage")
        .values("state__group")
        .annotate(cnt=Count("id"))
    )
    by_group = {row["state__group"]: row["cnt"] for row in group_rows}

    backlog = by_group.get("backlog", 0)
    unstarted = by_group.get("unstarted", 0)
    started = by_group.get("started", 0)
    completed = by_group.get("completed", 0)
    cancelled = by_group.get("cancelled", 0)
    total = backlog + unstarted + started + completed + cancelled

    return {
        "total_issues": total,
        "completed_issues": completed,
        "backlog_issues": backlog,
        "unstarted_issues": unstarted,
        "started_issues": started,
        "cancelled_issues": cancelled,
    }


@shared_task
def update_milestone_progress(milestone_id):
    """Recompute + persist one Milestone's progress_snapshot."""
    try:
        milestone = Milestone.objects.get(pk=milestone_id)
    except Milestone.DoesNotExist:
        return
    try:
        milestone.progress_snapshot = compute_milestone_snapshot(milestone)
        milestone.save(update_fields=["progress_snapshot", "updated_at"])
    except Exception as e:
        log_exception(e)
