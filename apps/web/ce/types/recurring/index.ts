/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Recurring work items — mote.
// See docs/mote-design/03-work-item-power.md, section 3.
//
// Frontend mirror of the backend ``RecurringIssue`` /
// ``RecurringIssueRun`` models (apps/api/plane/db/models/recurring.py). The
// serializers use ``fields = "__all__"`` so every model column is surfaced;
// the schedule field names below match the model/serializer EXACTLY (a
// mismatch is a silent no-op or a 400). The payload shape is either a
// ``template`` FK (a mote.14 Template id) or an inline ``issue_data`` JSON
// snapshot (same shape as ``Template.template_data`` for a work item). The v1
// editor uses template selection only (§3.4 "Reuse the Templates dropdown to
// pick the shape"); ``issue_data`` stays backend-supported but unset here.

import type { TWorkItemTemplateData } from "@/plane-web/types/templates";

// daily | weekly | monthly | cron — matches RecurringIssue.CADENCE_CHOICES.
export type TRecurringCadence = "daily" | "weekly" | "monthly" | "cron";

export type TRecurringIssue = {
  id: string;
  name: string;
  // Shape source: a Template id, or an inline issue_data snapshot.
  template: string | null;
  issue_data: TWorkItemTemplateData | Record<string, unknown>;
  // Schedule spec.
  cadence: TRecurringCadence;
  cron_expression: string | null;
  interval: number;
  // 0=Monday .. 6=Sunday (Python weekday()).
  weekdays: number[];
  start_date: string;
  end_date: string | null;
  max_occurrences: number | null;
  // Server-managed bookkeeping (read-only).
  occurrence_count: number;
  next_run_at: string;
  last_run_at: string | null;
  is_active: boolean;
  // ProjectBaseModel fields.
  project?: string;
  workspace?: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
};

export type TRecurringRunStatus = "success" | "failed";

export type TRecurringIssueRun = {
  id: string;
  recurring: string;
  issue: string | null;
  run_at: string;
  status: TRecurringRunStatus;
  error: string;
  project?: string;
  workspace?: string;
  created_at?: string;
  updated_at?: string;
};
