# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db.models import Case, CharField, Q, Value, When


def cycle_status_annotation(now):
    """
    State-first cycle status annotation (mote).

    The manual `state` column is authoritative; the legacy date-based math is
    used only as a fallback for `draft`/unmanaged cycles. This preserves the
    existing wire contract (status in CURRENT/UPCOMING/COMPLETED/DRAFT) while
    letting a manually started/completed cycle ignore its calendar boundary.

    Args:
        now: timezone-aware datetime to compare date fields against.
    """
    return Case(
        When(state="current", then=Value("CURRENT")),
        When(state="completed", then=Value("COMPLETED")),
        When(state="upcoming", then=Value("UPCOMING")),
        # Legacy date fallback only for draft/unmanaged cycles.
        When(
            Q(state="draft") & Q(start_date__lte=now) & Q(end_date__gte=now),
            then=Value("CURRENT"),
        ),
        When(Q(state="draft") & Q(start_date__gt=now), then=Value("UPCOMING")),
        When(Q(state="draft") & Q(end_date__lt=now), then=Value("COMPLETED")),
        default=Value("DRAFT"),
        output_field=CharField(),
    )
