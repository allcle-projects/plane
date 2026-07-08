/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Project States — mote (Phase 2).
// See docs/mote-design/04-planning-hierarchy.md, section 3.
//
// Frontend mirror of the backend ``ProjectState`` model
// (apps/api/plane/db/models/project_state.py). Project states are
// workspace-scoped statuses a project can be in (the project's ``state`` FK).
// Field names match the serializer EXACTLY. Every workspace is seeded with 6
// default states, one per group.

// The 6 lifecycle groups a project state belongs to.
export type TProjectStateGroup =
  | "backlog"
  | "planned"
  | "execution"
  | "monitoring"
  | "completed"
  | "cancelled";

export const PROJECT_STATE_GROUPS: TProjectStateGroup[] = [
  "backlog",
  "planned",
  "execution",
  "monitoring",
  "completed",
  "cancelled",
];

export type TProjectState = {
  id: string;
  name: string;
  description: string;
  color: string;
  group: TProjectStateGroup;
  sequence: number;
  default: boolean;
  // Workspace scope fields.
  workspace?: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
};
