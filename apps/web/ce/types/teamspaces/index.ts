/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Teamspaces — mote.
// See docs/mote-design/05-teamspaces-access.md, section 1.
//
// Frontend mirror of the backend ``Team`` / ``TeamMember`` / ``TeamProject``
// models (apps/api/plane/db/models/workspace.py). The serializers use
// ``fields = "__all__"`` so every model column is surfaced; ``member_ids`` and
// ``project_ids`` are read-only rollup convenience fields added by
// TeamSerializer. Field names match the model/serializer EXACTLY.

export type TTeam = {
  id: string;
  name: string;
  description: string;
  lead: string | null;
  logo_props: Record<string, unknown>;
  is_public: boolean;
  // Server-computed read-only rollups (SerializerMethodField).
  member_ids: string[];
  project_ids: string[];
  // BaseModel / workspace fields.
  workspace?: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
};

// Join row: Team <-> member (user).
export type TTeamMember = {
  id: string;
  team: string;
  member: string;
  workspace?: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
};

// Join row: Team <-> Project.
export type TTeamProject = {
  id: string;
  team: string;
  project: string;
  workspace?: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
};

// Phase 3: a team-scoped view or page (both carry at least id + name + team).
export type TTeamEntity = {
  id: string;
  name: string;
  team?: string | null;
  workspace?: string;
  created_at?: string;
  updated_at?: string;
};
