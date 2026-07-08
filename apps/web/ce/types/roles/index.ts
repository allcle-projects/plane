/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Custom RBAC — mote.
// See docs/mote-design/05-teamspaces-access.md, section 2.
//
// Frontend mirror of the backend Permission / Role / RoleAssignment models
// (apps/api/plane/db/models/role.py). Field names match the serializer exactly.

export type TPermission = {
  id: string;
  key: string;
  category: string;
  description: string;
};

export type TRole = {
  id: string;
  name: string;
  description: string;
  level: "WORKSPACE" | "PROJECT";
  is_system: boolean;
  base_role: number | null;
  // M2M of permission ids + a read-only convenience list of their keys.
  permissions: string[];
  permission_keys: string[];
  workspace?: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
};

export type TRoleAssignment = {
  id: string;
  role: string;
  member: string;
  project: string | null;
  workspace?: string;
  created_at?: string;
  updated_at?: string;
};
