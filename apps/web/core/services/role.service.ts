/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/* eslint-disable no-useless-catch */

// Custom RBAC — mote.
// See docs/mote-design/05-teamspaces-access.md, section 2.
// Hits the workspace-scoped role/permission/assignment endpoints registered in
// apps/api/plane/app/urls/role.py.

import { API_BASE_URL } from "@plane/constants";
// plane web types
import type { TPermission, TRole, TRoleAssignment } from "@/plane-web/types/roles";
// services
import { APIService } from "@/services/api.service";

export class RoleService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getPermissions(workspaceSlug: string): Promise<TPermission[] | undefined> {
    try {
      const { data } = await this.get(`/api/workspaces/${workspaceSlug}/permissions/`);
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async getRoles(workspaceSlug: string): Promise<TRole[] | undefined> {
    try {
      const { data } = await this.get(`/api/workspaces/${workspaceSlug}/roles/`);
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async createRole(workspaceSlug: string, payload: Partial<TRole> & { permission_ids?: string[] }): Promise<TRole | undefined> {
    try {
      const { data } = await this.post(`/api/workspaces/${workspaceSlug}/roles/`, payload);
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async updateRole(
    workspaceSlug: string,
    roleId: string,
    payload: Partial<TRole> & { permission_ids?: string[] }
  ): Promise<TRole | undefined> {
    try {
      const { data } = await this.patch(`/api/workspaces/${workspaceSlug}/roles/${roleId}/`, payload);
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async deleteRole(workspaceSlug: string, roleId: string): Promise<void> {
    try {
      await this.delete(`/api/workspaces/${workspaceSlug}/roles/${roleId}/`);
    } catch (error) {
      throw error;
    }
  }

  // Member assignment ------------------------------------------------------

  async getMemberRoles(workspaceSlug: string, memberId: string): Promise<TRoleAssignment[] | undefined> {
    try {
      const { data } = await this.get(`/api/workspaces/${workspaceSlug}/members/${memberId}/roles/`);
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async assignRole(
    workspaceSlug: string,
    memberId: string,
    payload: { role_id: string; project_id?: string }
  ): Promise<TRoleAssignment | undefined> {
    try {
      const { data } = await this.post(`/api/workspaces/${workspaceSlug}/members/${memberId}/roles/`, payload);
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async unassignRole(workspaceSlug: string, memberId: string, assignmentId: string): Promise<void> {
    try {
      await this.delete(`/api/workspaces/${workspaceSlug}/members/${memberId}/roles/${assignmentId}/`);
    } catch (error) {
      throw error;
    }
  }
}

const roleService = new RoleService();

export default roleService;
