/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Initiatives — mote.
// See docs/mote-design/04-planning-hierarchy.md, section 1.
//
// Frontend mirror of the backend ``Initiative`` / ``InitiativeProject`` /
// ``InitiativeEpic`` models (apps/api/plane/db/models/initiative.py). The
// serializers use ``fields = "__all__"`` so every model column is surfaced; the
// field names below match the model/serializer EXACTLY. ``progress_snapshot`` is
// the denormalised rollup cache (same keys as the analytics endpoint), refreshed
// server-side — treat it as read-only here.

// Free-form workspace status string (backend CharField, default "planned").
export type TInitiativeStatus = string;

// Rollup snapshot returned by ``.../initiatives/<id>/analytics/`` and cached on
// ``Initiative.progress_snapshot``. Aggregated across all linked projects/epics.
export type TInitiativeProgressSnapshot = {
  total_issues: number;
  completed_issues: number;
  backlog_issues: number;
  unstarted_issues: number;
  started_issues: number;
  cancelled_issues: number;
  total_projects: number;
  total_epics: number;
  completed_projects: number;
};

export type TInitiative = {
  id: string;
  name: string;
  description: string;
  description_html: Record<string, unknown> | null;
  lead: string | null;
  start_date: string | null;
  end_date: string | null;
  status: TInitiativeStatus;
  sort_order: number;
  logo_props: Record<string, unknown>;
  // Server-managed rollup cache (read-only).
  progress_snapshot: Partial<TInitiativeProgressSnapshot>;
  external_source: string | null;
  external_id: string | null;
  // BaseModel / workspace fields.
  workspace?: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
};

// Join row: Initiative <-> Project.
export type TInitiativeProject = {
  id: string;
  initiative: string;
  project: string;
  sort_order?: number;
  workspace?: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
};

// Join row: Initiative <-> Epic (an Issue with an ``is_epic`` type).
export type TInitiativeEpic = {
  id: string;
  initiative: string;
  epic: string;
  workspace?: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
};
