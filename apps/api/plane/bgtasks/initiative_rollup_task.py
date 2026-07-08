# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Initiatives — rollup progress snapshot (mote).
# See docs/mote-design/04-planning-hierarchy.md, section 1 ("Rollup progress").
#
# An Initiative denormalises the completion state of every work item across its
# linked projects and epics into ``Initiative.progress_snapshot`` (mirroring how
# Cycle caches ``progress_snapshot`` at cycle.py:74) so list/detail reads stay
# cheap and never aggregate live. ``compute_initiative_snapshot`` builds the dict;
# ``update_initiative_progress`` is the celery task that recomputes + persists it
# (call on demand from the analytics endpoint, or async on issue state changes).

# Third party imports
from celery import shared_task

# Django imports
from django.db.models import Count, Q

# Module imports
from plane.db.models import (
    Initiative,
    InitiativeProject,
    InitiativeEpic,
    Issue,
)
from plane.utils.exception_logger import log_exception


def compute_initiative_snapshot(initiative):
    """Aggregate work-item completion across an Initiative's projects + epics.

    Counts live (non-deleted) issues in every linked project, unioned with the
    linked epic issues themselves, grouped by their state ``group``. Triage
    issues are excluded (they are not "real" planned work). Returns a plain dict
    suitable for JSON storage in ``progress_snapshot``.
    """
    project_ids = list(
        InitiativeProject.objects.filter(
            initiative=initiative, deleted_at__isnull=True
        ).values_list("project_id", flat=True)
    )
    epic_ids = list(
        InitiativeEpic.objects.filter(
            initiative=initiative, deleted_at__isnull=True
        ).values_list("epic_id", flat=True)
    )

    # Issues in linked projects OR the linked epics themselves, minus triage.
    # Single grouped query keyed by State.group (no live per-read aggregation
    # elsewhere — callers read the cached snapshot).
    group_rows = (
        Issue.issue_objects.filter(Q(project_id__in=project_ids) | Q(id__in=epic_ids))
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
        "total_projects": len(project_ids),
        "total_epics": len(epic_ids),
        # completed_projects needs the Project-States feature (design 04 §3),
        # which is not built yet; report 0 until then.
        "completed_projects": 0,
    }


@shared_task
def update_initiative_progress(initiative_id):
    """Recompute + persist one Initiative's progress_snapshot."""
    try:
        initiative = Initiative.objects.get(pk=initiative_id)
    except Initiative.DoesNotExist:
        return
    try:
        initiative.progress_snapshot = compute_initiative_snapshot(initiative)
        initiative.save(update_fields=["progress_snapshot", "updated_at"])
    except Exception as e:
        log_exception(e)
