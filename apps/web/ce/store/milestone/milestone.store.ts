/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Milestones — mote (Phase 2).
// See docs/mote-design/04-planning-hierarchy.md, section 2.
//
// Project-scoped CRUD store for milestones, mirroring the mote.21 Initiative
// store (ce/store/initiative/initiative.store.ts). Holds a flat map of milestones
// keyed by id (getters filter by project), per-milestone maps of attached issue
// join rows and the cached rollup analytics snapshot, and a per-project fetched
// flag.

import { orderBy, set, unset } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// services
import milestoneService from "@/services/milestone.service";
// plane web types
import type { TMilestone, TMilestoneIssue, TMilestoneProgressSnapshot } from "@/plane-web/types/milestones";
// store
import type { CoreRootStore } from "@/store/root.store";

export interface IMilestoneStore {
  // observables
  loader: boolean;
  milestoneMap: Record<string, TMilestone>;
  issuesMap: Record<string, TMilestoneIssue[]>;
  analyticsMap: Record<string, TMilestoneProgressSnapshot>;
  fetchedMap: Record<string, boolean>;
  // computed actions
  getMilestoneById: (milestoneId: string) => TMilestone | undefined;
  getProjectMilestones: (projectId: string) => TMilestone[];
  getMilestoneIssues: (milestoneId: string) => TMilestoneIssue[];
  getMilestoneAnalytics: (milestoneId: string) => TMilestoneProgressSnapshot | undefined;
  // fetch actions
  fetchMilestones: (workspaceSlug: string, projectId: string) => Promise<TMilestone[] | undefined>;
  fetchMilestoneById: (
    workspaceSlug: string,
    projectId: string,
    milestoneId: string
  ) => Promise<TMilestone | undefined>;
  fetchMilestoneIssues: (
    workspaceSlug: string,
    projectId: string,
    milestoneId: string
  ) => Promise<TMilestoneIssue[] | undefined>;
  fetchMilestoneAnalytics: (
    workspaceSlug: string,
    projectId: string,
    milestoneId: string
  ) => Promise<TMilestoneProgressSnapshot | undefined>;
  // CRUD actions
  createMilestone: (
    workspaceSlug: string,
    projectId: string,
    payload: Partial<TMilestone>
  ) => Promise<TMilestone | undefined>;
  updateMilestone: (
    workspaceSlug: string,
    projectId: string,
    milestoneId: string,
    payload: Partial<TMilestone>
  ) => Promise<TMilestone | undefined>;
  deleteMilestone: (workspaceSlug: string, projectId: string, milestoneId: string) => Promise<void>;
  addMilestoneIssues: (
    workspaceSlug: string,
    projectId: string,
    milestoneId: string,
    issueIds: string[]
  ) => Promise<TMilestoneIssue[] | undefined>;
  removeMilestoneIssue: (
    workspaceSlug: string,
    projectId: string,
    milestoneId: string,
    issueId: string
  ) => Promise<void>;
}

export class MilestoneStore implements IMilestoneStore {
  // observables
  loader: boolean = false;
  milestoneMap: Record<string, TMilestone> = {};
  issuesMap: Record<string, TMilestoneIssue[]> = {};
  analyticsMap: Record<string, TMilestoneProgressSnapshot> = {};
  fetchedMap: Record<string, boolean> = {};
  // root store
  rootStore: CoreRootStore;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      // observables
      loader: observable.ref,
      milestoneMap: observable,
      issuesMap: observable,
      analyticsMap: observable,
      fetchedMap: observable,
      // fetch actions
      fetchMilestones: action,
      fetchMilestoneById: action,
      fetchMilestoneIssues: action,
      fetchMilestoneAnalytics: action,
      // CRUD actions
      createMilestone: action,
      updateMilestone: action,
      deleteMilestone: action,
      addMilestoneIssues: action,
      removeMilestoneIssue: action,
    });
    this.rootStore = _rootStore;
  }

  /**
   * @description returns a single milestone by id
   */
  getMilestoneById = computedFn((milestoneId: string) => this.milestoneMap?.[milestoneId] ?? undefined);

  /**
   * @description milestones for a project, ordered by target_date then sort_order
   */
  getProjectMilestones = computedFn((projectId: string) =>
    orderBy(
      Object.values(this.milestoneMap ?? {}).filter((milestone) => milestone.project === projectId),
      ["target_date", "sort_order", "created_at"],
      ["asc", "asc", "desc"]
    )
  );

  /**
   * @description attached issue join rows for a milestone
   */
  getMilestoneIssues = computedFn((milestoneId: string) => this.issuesMap?.[milestoneId] ?? []);

  /**
   * @description cached rollup snapshot for a milestone
   */
  getMilestoneAnalytics = computedFn((milestoneId: string) => this.analyticsMap?.[milestoneId] ?? undefined);

  /**
   * @description fetches all milestones for a project
   */
  fetchMilestones = async (workspaceSlug: string, projectId: string): Promise<TMilestone[] | undefined> => {
    try {
      this.loader = true;
      const response = await milestoneService.getMilestones(workspaceSlug, projectId);
      runInAction(() => {
        (response ?? []).forEach((milestone) => {
          set(this.milestoneMap, [milestone.id], milestone);
        });
        set(this.fetchedMap, [projectId], true);
        this.loader = false;
      });
      return response;
    } catch (_error) {
      this.loader = false;
      return undefined;
    }
  };

  /**
   * @description fetches a single milestone by id and stores it
   */
  fetchMilestoneById = async (
    workspaceSlug: string,
    projectId: string,
    milestoneId: string
  ): Promise<TMilestone | undefined> => {
    const response = await milestoneService.getMilestone(workspaceSlug, projectId, milestoneId);
    if (response) {
      runInAction(() => {
        set(this.milestoneMap, [response.id], response);
      });
    }
    return response;
  };

  /**
   * @description fetches the attached issue join rows for a milestone and stores them
   */
  fetchMilestoneIssues = async (
    workspaceSlug: string,
    projectId: string,
    milestoneId: string
  ): Promise<TMilestoneIssue[] | undefined> => {
    const response = await milestoneService.getMilestoneIssues(workspaceSlug, projectId, milestoneId);
    runInAction(() => {
      set(this.issuesMap, [milestoneId], response ?? []);
    });
    return response;
  };

  /**
   * @description fetches the rollup snapshot for a milestone and stores it
   */
  fetchMilestoneAnalytics = async (
    workspaceSlug: string,
    projectId: string,
    milestoneId: string
  ): Promise<TMilestoneProgressSnapshot | undefined> => {
    const response = await milestoneService.getMilestoneAnalytics(workspaceSlug, projectId, milestoneId);
    if (response) {
      runInAction(() => {
        set(this.analyticsMap, [milestoneId], response);
      });
    }
    return response;
  };

  /**
   * @description creates a new milestone and adds it to the store
   */
  createMilestone = async (
    workspaceSlug: string,
    projectId: string,
    payload: Partial<TMilestone>
  ): Promise<TMilestone | undefined> => {
    const response = await milestoneService.createMilestone(workspaceSlug, projectId, payload);
    if (response) {
      runInAction(() => {
        set(this.milestoneMap, [response.id], response);
      });
    }
    return response;
  };

  /**
   * @description updates a milestone and refreshes it in the store
   */
  updateMilestone = async (
    workspaceSlug: string,
    projectId: string,
    milestoneId: string,
    payload: Partial<TMilestone>
  ): Promise<TMilestone | undefined> => {
    const response = await milestoneService.updateMilestone(workspaceSlug, projectId, milestoneId, payload);
    if (response) {
      runInAction(() => {
        set(this.milestoneMap, [response.id], response);
      });
    }
    return response;
  };

  /**
   * @description deletes a milestone and removes it from the store
   */
  deleteMilestone = async (workspaceSlug: string, projectId: string, milestoneId: string): Promise<void> => {
    await milestoneService.deleteMilestone(workspaceSlug, projectId, milestoneId);
    runInAction(() => {
      unset(this.milestoneMap, [milestoneId]);
      unset(this.issuesMap, [milestoneId]);
      unset(this.analyticsMap, [milestoneId]);
    });
  };

  /**
   * @description attaches work items to a milestone and appends the created rows
   */
  addMilestoneIssues = async (
    workspaceSlug: string,
    projectId: string,
    milestoneId: string,
    issueIds: string[]
  ): Promise<TMilestoneIssue[] | undefined> => {
    const response = await milestoneService.addMilestoneIssues(workspaceSlug, projectId, milestoneId, issueIds);
    if (response) {
      runInAction(() => {
        const existing = this.issuesMap?.[milestoneId] ?? [];
        set(this.issuesMap, [milestoneId], [...existing, ...response]);
      });
    }
    return response;
  };

  /**
   * @description detaches a work item from a milestone
   */
  removeMilestoneIssue = async (
    workspaceSlug: string,
    projectId: string,
    milestoneId: string,
    issueId: string
  ): Promise<void> => {
    await milestoneService.removeMilestoneIssue(workspaceSlug, projectId, milestoneId, issueId);
    runInAction(() => {
      const existing = this.issuesMap?.[milestoneId] ?? [];
      set(
        this.issuesMap,
        [milestoneId],
        existing.filter((link) => link.issue !== issueId)
      );
    });
  };
}
