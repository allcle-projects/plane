/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Project States — mote (Phase 2).
// See docs/mote-design/04-planning-hierarchy.md, section 3.
//
// Workspace-scoped CRUD store for project states, mirroring the mote.24
// Milestone store (ce/store/milestone/milestone.store.ts). Holds project states
// keyed by workspace slug (getters order by sequence, or resolve a single state
// by id across workspaces), plus a per-workspace fetched flag.

import { orderBy, set, unset } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// services
import workspaceProjectStateService from "@/services/workspace-project-state.service";
// plane web types
import type { TProjectState } from "@/plane-web/types/workspace-project-states";
// store
import type { CoreRootStore } from "@/store/root.store";

export interface IWorkspaceProjectStateStore {
  // observables
  loader: boolean;
  projectStatesMap: Record<string, TProjectState[]>;
  fetchedMap: Record<string, boolean>;
  // computed actions
  getProjectStatesForWorkspace: (workspaceSlug: string) => TProjectState[];
  getProjectStateById: (projectStateId: string) => TProjectState | undefined;
  // fetch actions
  fetchProjectStates: (workspaceSlug: string) => Promise<TProjectState[] | undefined>;
  // CRUD actions
  createProjectState: (
    workspaceSlug: string,
    payload: Partial<TProjectState>
  ) => Promise<TProjectState | undefined>;
  updateProjectState: (
    workspaceSlug: string,
    projectStateId: string,
    payload: Partial<TProjectState>
  ) => Promise<TProjectState | undefined>;
  deleteProjectState: (workspaceSlug: string, projectStateId: string) => Promise<void>;
}

export class WorkspaceProjectStateStore implements IWorkspaceProjectStateStore {
  // observables
  loader: boolean = false;
  projectStatesMap: Record<string, TProjectState[]> = {};
  fetchedMap: Record<string, boolean> = {};
  // root store
  rootStore: CoreRootStore;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      // observables
      loader: observable.ref,
      projectStatesMap: observable,
      fetchedMap: observable,
      // fetch actions
      fetchProjectStates: action,
      // CRUD actions
      createProjectState: action,
      updateProjectState: action,
      deleteProjectState: action,
    });
    this.rootStore = _rootStore;
  }

  /**
   * @description project states for a workspace, ordered by sequence
   */
  getProjectStatesForWorkspace = computedFn((workspaceSlug: string) =>
    orderBy(this.projectStatesMap?.[workspaceSlug] ?? [], ["sequence", "created_at"], ["asc", "asc"])
  );

  /**
   * @description resolves a single project state by id across all loaded workspaces
   */
  getProjectStateById = computedFn((projectStateId: string) => {
    for (const states of Object.values(this.projectStatesMap ?? {})) {
      const match = states.find((state) => state.id === projectStateId);
      if (match) return match;
    }
    return undefined;
  });

  /**
   * @description fetches all project states for a workspace
   */
  fetchProjectStates = async (workspaceSlug: string): Promise<TProjectState[] | undefined> => {
    try {
      this.loader = true;
      const response = await workspaceProjectStateService.getProjectStates(workspaceSlug);
      runInAction(() => {
        set(this.projectStatesMap, [workspaceSlug], response ?? []);
        set(this.fetchedMap, [workspaceSlug], true);
        this.loader = false;
      });
      return response;
    } catch (_error) {
      this.loader = false;
      return undefined;
    }
  };

  /**
   * @description creates a new project state and appends it to the workspace bucket
   */
  createProjectState = async (
    workspaceSlug: string,
    payload: Partial<TProjectState>
  ): Promise<TProjectState | undefined> => {
    const response = await workspaceProjectStateService.createProjectState(workspaceSlug, payload);
    if (response) {
      runInAction(() => {
        const existing = this.projectStatesMap?.[workspaceSlug] ?? [];
        set(this.projectStatesMap, [workspaceSlug], [...existing, response]);
      });
    }
    return response;
  };

  /**
   * @description updates a project state and refreshes it in the workspace bucket
   */
  updateProjectState = async (
    workspaceSlug: string,
    projectStateId: string,
    payload: Partial<TProjectState>
  ): Promise<TProjectState | undefined> => {
    const response = await workspaceProjectStateService.updateProjectState(workspaceSlug, projectStateId, payload);
    if (response) {
      runInAction(() => {
        const existing = this.projectStatesMap?.[workspaceSlug] ?? [];
        set(
          this.projectStatesMap,
          [workspaceSlug],
          existing.map((state) => (state.id === projectStateId ? response : state))
        );
      });
    }
    return response;
  };

  /**
   * @description deletes a project state and removes it from the workspace bucket
   */
  deleteProjectState = async (workspaceSlug: string, projectStateId: string): Promise<void> => {
    await workspaceProjectStateService.deleteProjectState(workspaceSlug, projectStateId);
    runInAction(() => {
      const existing = this.projectStatesMap?.[workspaceSlug];
      if (existing) {
        set(
          this.projectStatesMap,
          [workspaceSlug],
          existing.filter((state) => state.id !== projectStateId)
        );
      } else {
        unset(this.projectStatesMap, [workspaceSlug]);
      }
    });
  };
}
