/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Updates — mote.
// See docs/mote-design/04-planning-hierarchy.md, section 4.
//
// Frontend mirror of the backend ``EntityUpdate`` model (mote.22). A single
// status post attached to exactly one parent entity (project | cycle |
// initiative); the other two parent columns are null. Field names match the
// serializer EXACTLY. On create/patch only ``status``, ``description`` and
// ``completed_percentage`` are writable — parents are set server-side.

export type TUpdateStatus = "on-track" | "at-risk" | "off-track";

export type TUpdateEntityType = "project" | "cycle" | "initiative";

export type TEntityUpdate = {
  id: string;
  status: TUpdateStatus;
  description: string;
  description_html: Record<string, unknown> | null;
  completed_percentage: number;
  // Exactly one of these is set; the others are null.
  project: string | null;
  cycle: string | null;
  initiative: string | null;
  // BaseModel / workspace fields.
  workspace?: string;
  created_by?: string;
  updated_by?: string;
  created_at?: string;
  updated_at?: string;
};

// Writable payload for create / patch.
export type TUpdateFormData = {
  status: TUpdateStatus;
  description: string;
  completed_percentage: number;
};
