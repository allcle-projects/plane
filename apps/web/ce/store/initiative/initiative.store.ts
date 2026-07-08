/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Initiatives — mote.
// See docs/mote-design/04-planning-hierarchy.md, section 1.
//
// Workspace-scoped CRUD store for initiatives, mirroring the mote.14 Template
// store (ce/store/templates/template.store.ts). Holds a flat map of initiatives
// keyed by id, per-initiative maps of linked projects / epics and the cached
// rollup analytics snapshot, and a per-workspace fetched flag.

import { orderBy, set, unset } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// services
import initiativeService from "@/services/initiative.service";
// plane web types
import type {
  TInitiative,
  TInitiativeEpic,
  TInitiativeProgressSnapshot,
  TInitiativeProject,
} from "@/plane-web/types/initiatives";
// store
import type { CoreRootStore } from "@/store/root.store";

export interface IInitiativeStore {
  // observables
  loader: boolean;
  initiativeMap: Record<string, TInitiative>;
  projectsMap: Record<string, TInitiativeProject[]>;
  epicsMap: Record<string, TInitiativeEpic[]>;
  analyticsMap: Record<string, TInitiativeProgressSnapshot>;
  fetchedMap: Record<string, boolean>;
  // computed actions
  getInitiativeById: (initiativeId: string) => TInitiative | undefined;
  getWorkspaceInitiatives: () => TInitiative[];
  getInitiativeProjects: (initiativeId: string) => TInitiativeProject[];
  getInitiativeEpics: (initiativeId: string) => TInitiativeEpic[];
  getInitiativeAnalytics: (initiativeId: string) => TInitiativeProgressSnapshot | undefined;
  // fetch actions
  fetchInitiatives: (workspaceSlug: string) => Promise<TInitiative[] | undefined>;
  fetchInitiativeById: (workspaceSlug: string, initiativeId: string) => Promise<TInitiative | undefined>;
  fetchInitiativeProjects: (
    workspaceSlug: string,
    initiativeId: string
  ) => Promise<TInitiativeProject[] | undefined>;
  fetchInitiativeEpics: (workspaceSlug: string, initiativeId: string) => Promise<TInitiativeEpic[] | undefined>;
  fetchInitiativeAnalytics: (
    workspaceSlug: string,
    initiativeId: string
  ) => Promise<TInitiativeProgressSnapshot | undefined>;
  // CRUD actions
  createInitiative: (workspaceSlug: string, payload: Partial<TInitiative>) => Promise<TInitiative | undefined>;
  updateInitiative: (
    workspaceSlug: string,
    initiativeId: string,
    payload: Partial<TInitiative>
  ) => Promise<TInitiative | undefined>;
  deleteInitiative: (workspaceSlug: string, initiativeId: string) => Promise<void>;
  addInitiativeProjects: (
    workspaceSlug: string,
    initiativeId: string,
    projectIds: string[]
  ) => Promise<TInitiativeProject[] | undefined>;
  removeInitiativeProject: (workspaceSlug: string, initiativeId: string, projectId: string) => Promise<void>;
  addInitiativeEpics: (
    workspaceSlug: string,
    initiativeId: string,
    epicIds: string[]
  ) => Promise<TInitiativeEpic[] | undefined>;
  removeInitiativeEpic: (workspaceSlug: string, initiativeId: string, epicId: string) => Promise<void>;
}

export class InitiativeStore implements IInitiativeStore {
  // observables
  loader: boolean = false;
  initiativeMap: Record<string, TInitiative> = {};
  projectsMap: Record<string, TInitiativeProject[]> = {};
  epicsMap: Record<string, TInitiativeEpic[]> = {};
  analyticsMap: Record<string, TInitiativeProgressSnapshot> = {};
  fetchedMap: Record<string, boolean> = {};
  // root store
  rootStore: CoreRootStore;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      // observables
      loader: observable.ref,
      initiativeMap: observable,
      projectsMap: observable,
      epicsMap: observable,
      analyticsMap: observable,
      fetchedMap: observable,
      // fetch actions
      fetchInitiatives: action,
      fetchInitiativeById: action,
      fetchInitiativeProjects: action,
      fetchInitiativeEpics: action,
      fetchInitiativeAnalytics: action,
      // CRUD actions
      createInitiative: action,
      updateInitiative: action,
      deleteInitiative: action,
      addInitiativeProjects: action,
      removeInitiativeProject: action,
      addInitiativeEpics: action,
      removeInitiativeEpic: action,
    });
    this.rootStore = _rootStore;
  }

  /**
   * @description returns a single initiative by id
   */
  getInitiativeById = computedFn((initiativeId: string) => this.initiativeMap?.[initiativeId] ?? undefined);

  /**
   * @description initiatives for the workspace, ordered by sort_order
   */
  getWorkspaceInitiatives = computedFn(() =>
    orderBy(Object.values(this.initiativeMap ?? {}), ["sort_order", "created_at"], ["asc", "desc"])
  );

  /**
   * @description linked projects for an initiative
   */
  getInitiativeProjects = computedFn((initiativeId: string) => this.projectsMap?.[initiativeId] ?? []);

  /**
   * @description linked epics for an initiative
   */
  getInitiativeEpics = computedFn((initiativeId: string) => this.epicsMap?.[initiativeId] ?? []);

  /**
   * @description cached rollup snapshot for an initiative
   */
  getInitiativeAnalytics = computedFn((initiativeId: string) => this.analyticsMap?.[initiativeId] ?? undefined);

  /**
   * @description fetches all initiatives for a workspace
   */
  fetchInitiatives = async (workspaceSlug: string): Promise<TInitiative[] | undefined> => {
    try {
      this.loader = true;
      const response = await initiativeService.getInitiatives(workspaceSlug);
      runInAction(() => {
        (response ?? []).forEach((initiative) => {
          set(this.initiativeMap, [initiative.id], initiative);
        });
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
   * @description fetches a single initiative by id and stores it
   */
  fetchInitiativeById = async (workspaceSlug: string, initiativeId: string): Promise<TInitiative | undefined> => {
    const response = await initiativeService.getInitiative(workspaceSlug, initiativeId);
    if (response) {
      runInAction(() => {
        set(this.initiativeMap, [response.id], response);
      });
    }
    return response;
  };

  /**
   * @description fetches the linked projects for an initiative and stores them
   */
  fetchInitiativeProjects = async (
    workspaceSlug: string,
    initiativeId: string
  ): Promise<TInitiativeProject[] | undefined> => {
    const response = await initiativeService.getInitiativeProjects(workspaceSlug, initiativeId);
    runInAction(() => {
      set(this.projectsMap, [initiativeId], response ?? []);
    });
    return response;
  };

  /**
   * @description fetches the linked epics for an initiative and stores them
   */
  fetchInitiativeEpics = async (
    workspaceSlug: string,
    initiativeId: string
  ): Promise<TInitiativeEpic[] | undefined> => {
    const response = await initiativeService.getInitiativeEpics(workspaceSlug, initiativeId);
    runInAction(() => {
      set(this.epicsMap, [initiativeId], response ?? []);
    });
    return response;
  };

  /**
   * @description fetches the rollup snapshot for an initiative and stores it
   */
  fetchInitiativeAnalytics = async (
    workspaceSlug: string,
    initiativeId: string
  ): Promise<TInitiativeProgressSnapshot | undefined> => {
    const response = await initiativeService.getInitiativeAnalytics(workspaceSlug, initiativeId);
    if (response) {
      runInAction(() => {
        set(this.analyticsMap, [initiativeId], response);
      });
    }
    return response;
  };

  /**
   * @description creates a new initiative and adds it to the store
   */
  createInitiative = async (workspaceSlug: string, payload: Partial<TInitiative>): Promise<TInitiative | undefined> => {
    const response = await initiativeService.createInitiative(workspaceSlug, payload);
    if (response) {
      runInAction(() => {
        set(this.initiativeMap, [response.id], response);
      });
    }
    return response;
  };

  /**
   * @description updates an initiative and refreshes it in the store
   */
  updateInitiative = async (
    workspaceSlug: string,
    initiativeId: string,
    payload: Partial<TInitiative>
  ): Promise<TInitiative | undefined> => {
    const response = await initiativeService.updateInitiative(workspaceSlug, initiativeId, payload);
    if (response) {
      runInAction(() => {
        set(this.initiativeMap, [response.id], response);
      });
    }
    return response;
  };

  /**
   * @description deletes an initiative and removes it from the store
   */
  deleteInitiative = async (workspaceSlug: string, initiativeId: string): Promise<void> => {
    await initiativeService.deleteInitiative(workspaceSlug, initiativeId);
    runInAction(() => {
      unset(this.initiativeMap, [initiativeId]);
      unset(this.projectsMap, [initiativeId]);
      unset(this.epicsMap, [initiativeId]);
      unset(this.analyticsMap, [initiativeId]);
    });
  };

  /**
   * @description links projects to an initiative and appends the created rows
   */
  addInitiativeProjects = async (
    workspaceSlug: string,
    initiativeId: string,
    projectIds: string[]
  ): Promise<TInitiativeProject[] | undefined> => {
    const response = await initiativeService.addInitiativeProjects(workspaceSlug, initiativeId, projectIds);
    if (response) {
      runInAction(() => {
        const existing = this.projectsMap?.[initiativeId] ?? [];
        set(this.projectsMap, [initiativeId], [...existing, ...response]);
      });
    }
    return response;
  };

  /**
   * @description unlinks a project from an initiative
   */
  removeInitiativeProject = async (
    workspaceSlug: string,
    initiativeId: string,
    projectId: string
  ): Promise<void> => {
    await initiativeService.removeInitiativeProject(workspaceSlug, initiativeId, projectId);
    runInAction(() => {
      const existing = this.projectsMap?.[initiativeId] ?? [];
      set(
        this.projectsMap,
        [initiativeId],
        existing.filter((link) => link.project !== projectId)
      );
    });
  };

  /**
   * @description links epics to an initiative and appends the created rows
   */
  addInitiativeEpics = async (
    workspaceSlug: string,
    initiativeId: string,
    epicIds: string[]
  ): Promise<TInitiativeEpic[] | undefined> => {
    const response = await initiativeService.addInitiativeEpics(workspaceSlug, initiativeId, epicIds);
    if (response) {
      runInAction(() => {
        const existing = this.epicsMap?.[initiativeId] ?? [];
        set(this.epicsMap, [initiativeId], [...existing, ...response]);
      });
    }
    return response;
  };

  /**
   * @description unlinks an epic from an initiative
   */
  removeInitiativeEpic = async (workspaceSlug: string, initiativeId: string, epicId: string): Promise<void> => {
    await initiativeService.removeInitiativeEpic(workspaceSlug, initiativeId, epicId);
    runInAction(() => {
      const existing = this.epicsMap?.[initiativeId] ?? [];
      set(
        this.epicsMap,
        [initiativeId],
        existing.filter((link) => link.epic !== epicId)
      );
    });
  };
}
