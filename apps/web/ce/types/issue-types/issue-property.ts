/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Custom Fields / Work Item Properties — mote (Phase 1).
// Definition-level types (work item type -> property -> option) for the
// settings admin surface. Value types stay a stub (see
// ./issue-property-values.d.ts) — values ship in Phase 2.
// Mirrors the backend contract in
// apps/api/plane/app/serializers/issue_property.py.

// Supported property types (mirrors PropertyTypeEnum in
// apps/api/plane/db/models/issue_property.py). A runtime enum so the settings
// UI can build the type dropdown.
export enum EIssuePropertyType {
  TEXT = "TEXT",
  NUMBER = "NUMBER",
  SELECT = "SELECT",
  MULTI_SELECT = "MULTI_SELECT",
  DATE = "DATE",
  MEMBER = "MEMBER",
  BOOLEAN = "BOOLEAN",
  URL = "URL",
}

// A work item type (IssueType) — the parent a property definition hangs off.
export type TIssueType = {
  id: string;
  workspace: string;
  name: string;
  description: string;
  logo_props: Record<string, unknown>;
  is_epic: boolean;
  is_default: boolean;
  is_active: boolean;
  level: number;
  external_source: string | null;
  external_id: string | null;
  created_at: string | undefined;
  updated_at: string | undefined;
  created_by: string | null;
  updated_by: string | null;
};

// An option for a SELECT / MULTI_SELECT property.
export type TIssuePropertyOption = {
  id: string;
  workspace: string;
  project: string | null;
  property: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  is_default: boolean;
  parent: string | null;
  external_source: string | null;
  external_id: string | null;
  created_at: string | undefined;
  updated_at: string | undefined;
  created_by: string | null;
  updated_by: string | null;
};

// A custom-field definition attached to a work item type.
export type TIssueProperty = {
  id: string;
  workspace: string;
  project: string | null;
  issue_type: string;
  name: string;
  display_name: string;
  description: string;
  property_type: EIssuePropertyType;
  relation_type: string | null;
  is_required: boolean;
  is_active: boolean;
  is_multi: boolean;
  default_value: string[];
  settings: Record<string, unknown>;
  sort_order: number;
  external_source: string | null;
  external_id: string | null;
  // options are embedded on list/retrieve (IssuePropertyReadSerializer).
  options?: TIssuePropertyOption[];
  created_at: string | undefined;
  updated_at: string | undefined;
  created_by: string | null;
  updated_by: string | null;
};
