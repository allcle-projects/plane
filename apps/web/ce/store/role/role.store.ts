/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Custom RBAC — mote.
// See docs/mote-design/05-teamspaces-access.md, section 2.
//
// Workspace-scoped store for roles + the permission catalog, mirroring the
// Teamspace store shape.

import { orderBy, set, unset } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// services
import roleService from "@/services/role.service";
// plane web types
import type { TPermission, TRole } from "@/plane-web/types/roles";
// store
import type { CoreRootStore } from "@/store/root.store";

export interface IRoleStore {
  // observables
  loader: boolean;
  roleMap: Record<string, TRole>;
  permissions: TPermission[];
  fetchedMap: Record<string, boolean>;
  // computed
  getRoleById: (roleId: string) => TRole | undefined;
  getWorkspaceRoles: () => TRole[];
  getPermissions: () => TPermission[];
  // fetch
  fetchRoles: (workspaceSlug: string) => Promise<TRole[] | undefined>;
  fetchPermissions: (workspaceSlug: string) => Promise<TPermission[] | undefined>;
  // CRUD
  createRole: (
    workspaceSlug: string,
    payload: Partial<TRole> & { permission_ids?: string[] }
  ) => Promise<TRole | undefined>;
  updateRole: (
    workspaceSlug: string,
    roleId: string,
    payload: Partial<TRole> & { permission_ids?: string[] }
  ) => Promise<TRole | undefined>;
  deleteRole: (workspaceSlug: string, roleId: string) => Promise<void>;
}

export class RoleStore implements IRoleStore {
  loader: boolean = false;
  roleMap: Record<string, TRole> = {};
  permissions: TPermission[] = [];
  fetchedMap: Record<string, boolean> = {};
  rootStore: CoreRootStore;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      loader: observable.ref,
      roleMap: observable,
      permissions: observable,
      fetchedMap: observable,
      fetchRoles: action,
      fetchPermissions: action,
      createRole: action,
      updateRole: action,
      deleteRole: action,
    });
    this.rootStore = _rootStore;
  }

  getRoleById = computedFn((roleId: string) => this.roleMap?.[roleId] ?? undefined);

  getWorkspaceRoles = computedFn(() =>
    // system roles first (Admin/Member/Guest by base_role desc), then custom by name
    orderBy(
      Object.values(this.roleMap ?? {}),
      [(r) => (r.is_system ? 0 : 1), (r) => -(r.base_role ?? 0), "name"],
      ["asc", "asc", "asc"]
    )
  );

  getPermissions = computedFn(() => this.permissions ?? []);

  fetchRoles = async (workspaceSlug: string): Promise<TRole[] | undefined> => {
    try {
      this.loader = true;
      const response = await roleService.getRoles(workspaceSlug);
      runInAction(() => {
        (response ?? []).forEach((role) => set(this.roleMap, [role.id], role));
        set(this.fetchedMap, [workspaceSlug], true);
        this.loader = false;
      });
      return response;
    } catch (_error) {
      this.loader = false;
      return undefined;
    }
  };

  fetchPermissions = async (workspaceSlug: string): Promise<TPermission[] | undefined> => {
    const response = await roleService.getPermissions(workspaceSlug);
    runInAction(() => {
      this.permissions = response ?? [];
    });
    return response;
  };

  createRole = async (
    workspaceSlug: string,
    payload: Partial<TRole> & { permission_ids?: string[] }
  ): Promise<TRole | undefined> => {
    const response = await roleService.createRole(workspaceSlug, payload);
    if (response) {
      runInAction(() => set(this.roleMap, [response.id], response));
    }
    return response;
  };

  updateRole = async (
    workspaceSlug: string,
    roleId: string,
    payload: Partial<TRole> & { permission_ids?: string[] }
  ): Promise<TRole | undefined> => {
    const response = await roleService.updateRole(workspaceSlug, roleId, payload);
    if (response) {
      runInAction(() => set(this.roleMap, [response.id], response));
    }
    return response;
  };

  deleteRole = async (workspaceSlug: string, roleId: string): Promise<void> => {
    await roleService.deleteRole(workspaceSlug, roleId);
    runInAction(() => unset(this.roleMap, [roleId]));
  };
}
