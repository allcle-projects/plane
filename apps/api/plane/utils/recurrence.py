# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Recurring work items — schedule math (mote).
# See docs/mote-design/03-work-item-power.md, section 3.
#
# All datetimes here are timezone-aware UTC. Storing and advancing next_run_at
# in UTC keeps cadence math DST-free (UTC has no DST); daily/weekly/monthly are
# pure date arithmetic and cron is delegated to croniter. Callers: the serializer
# (initial seed on create) and the dispatcher task (advance after each run).

# Python imports
from datetime import datetime, time, timezone

# Third party imports
from dateutil.relativedelta import relativedelta

DAILY = "daily"
WEEKLY = "weekly"
MONTHLY = "monthly"
CRON = "cron"


def start_datetime(start_date):
    """Anchor a ``DateField`` start_date to 00:00 UTC (tz-aware)."""
    return datetime.combine(start_date, time.min, tzinfo=timezone.utc)


def _next_weekly(prev, interval, weekdays):
    """Next weekly occurrence strictly after ``prev`` (preserving time-of-day).

    ``weekdays`` is a set/list of Python weekday ints (0=Mon..6=Sun); empty
    means "same weekday as ``prev``". ``interval`` counts weeks between cycles.
    """
    days = sorted(set(weekdays)) if weekdays else [prev.weekday()]
    current = prev.weekday()
    # Next scheduled weekday later in the same week.
    for d in days:
        if d > current:
            return prev + relativedelta(days=(d - current))
    # Otherwise wrap to the first scheduled weekday ``interval`` weeks ahead.
    delta_days = 7 * interval - current + days[0]
    return prev + relativedelta(days=delta_days)


def next_occurrence(prev, *, cadence, interval=1, weekdays=None, cron_expression=None):
    """Return the next occurrence strictly after ``prev`` (tz-aware UTC in/out).

    Drift-free: always computed from the previous occurrence, not from ``now``.
    """
    interval = max(int(interval or 1), 1)
    if cadence == DAILY:
        return prev + relativedelta(days=interval)
    if cadence == WEEKLY:
        return _next_weekly(prev, interval, weekdays or [])
    if cadence == MONTHLY:
        # relativedelta clamps the day-of-month (e.g. Jan 31 -> Feb 28).
        return prev + relativedelta(months=interval)
    if cadence == CRON:
        # Lazy import so daily/weekly/monthly work even if croniter is absent.
        from croniter import croniter

        return croniter(cron_expression, prev).get_next(datetime)
    raise ValueError(f"Unknown cadence '{cadence}'")


def compute_initial_next_run(
    *, cadence, start_date, interval=1, weekdays=None, cron_expression=None, now=None
):
    """First fire time (tz-aware UTC) at/after ``start_date``.

    Anchors to ``start_date`` 00:00 UTC. For weekly, rolls forward to the first
    scheduled weekday on/after the anchor. Cron seeds from croniter at the
    anchor. The dispatcher performs no backfill; a seed in the past simply fires
    on the next tick and is then advanced forward.
    """
    anchor = start_datetime(start_date)
    if cadence == CRON:
        from croniter import croniter

        # get_next returns the first fire strictly after its base; step the base
        # back one second so a fire landing exactly on the anchor is not skipped.
        return croniter(cron_expression, anchor - relativedelta(seconds=1)).get_next(
            datetime
        )
    if cadence == WEEKLY:
        days = sorted(set(weekdays)) if weekdays else [anchor.weekday()]
        current = anchor.weekday()
        for d in days:
            if d >= current:
                return anchor + relativedelta(days=(d - current))
        return anchor + relativedelta(days=(7 - current + days[0]))
    # daily / monthly: the anchor itself is the first occurrence.
    return anchor
