/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Milestones — mote (Phase 2).
// See docs/mote-design/04-planning-hierarchy.md, section 2.
//
// Frontend mirror of the backend ``Milestone`` / ``MilestoneIssue`` models
// (apps/api/plane/db/models/milestone.py). Milestones are project-scoped
// (ProjectBaseModel) time-boxed goals with work items attached. Field names match
// the serializer EXACTLY. ``progress_snapshot`` is the denormalised rollup cache
// (same keys as the analytics endpoint), refreshed server-side — read-only here.

// Free-form project status string (backend CharField, default "planned").
export type TMilestoneStatus = string;

// Rollup snapshot returned by ``.../milestones/<id>/analytics/`` and cached on
// ``Milestone.progress_snapshot``. Aggregated across all attached work items.
export type TMilestoneProgressSnapshot = {
  total_issues: number;
  completed_issues: number;
  backlog_issues: number;
  unstarted_issues: number;
  started_issues: number;
  cancelled_issues: number;
};

export type TMilestone = {
  id: string;
  name: string;
  description: string;
  start_date: string | null;
  target_date: string | null;
  cycle: string | null;
  status: TMilestoneStatus;
  owned_by: string | null;
  sort_order: number;
  // Server-managed rollup cache (read-only).
  progress_snapshot: Partial<TMilestoneProgressSnapshot>;
  // ProjectBaseModel / workspace fields.
  project?: string;
  workspace?: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
};

// Join row: Milestone <-> Issue.
export type TMilestoneIssue = {
  id: string;
  milestone: string;
  issue: string;
  project?: string;
  workspace?: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
};
