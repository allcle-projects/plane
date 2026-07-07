/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Recurring work items — mote.
// See docs/mote-design/03-work-item-power.md, section 3.
//
// Project-scoped CRUD store for recurrences, mirroring the mote.14 Template
// store (ce/store/templates/template.store.ts). Holds a flat map of
// recurrences keyed by id, a per-project fetched flag, and a per-recurrence
// map of materialization runs.

import { orderBy, set, unset } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// services
import recurringIssueService from "@/services/recurring-issue.service";
// plane web types
import type { TRecurringIssue, TRecurringIssueRun } from "@/plane-web/types/recurring";
// store
import type { CoreRootStore } from "@/store/root.store";

export interface IRecurringIssueStore {
  // observables
  loader: boolean;
  recurringIssueMap: Record<string, TRecurringIssue>;
  runsMap: Record<string, TRecurringIssueRun[]>;
  fetchedMap: Record<string, boolean>;
  // computed actions
  getRecurringIssueById: (recurringId: string) => TRecurringIssue | undefined;
  getProjectRecurringIssues: (projectId: string) => TRecurringIssue[];
  getRecurringIssueRuns: (recurringId: string) => TRecurringIssueRun[];
  // fetch actions
  fetchRecurringIssues: (workspaceSlug: string, projectId: string) => Promise<TRecurringIssue[] | undefined>;
  fetchRecurringIssueRuns: (
    workspaceSlug: string,
    projectId: string,
    recurringId: string
  ) => Promise<TRecurringIssueRun[] | undefined>;
  // CRUD actions
  createRecurringIssue: (
    workspaceSlug: string,
    projectId: string,
    payload: Partial<TRecurringIssue>
  ) => Promise<TRecurringIssue | undefined>;
  updateRecurringIssue: (
    workspaceSlug: string,
    projectId: string,
    recurringId: string,
    payload: Partial<TRecurringIssue>
  ) => Promise<TRecurringIssue | undefined>;
  deleteRecurringIssue: (workspaceSlug: string, projectId: string, recurringId: string) => Promise<void>;
}

export class RecurringIssueStore implements IRecurringIssueStore {
  // observables
  loader: boolean = false;
  recurringIssueMap: Record<string, TRecurringIssue> = {};
  runsMap: Record<string, TRecurringIssueRun[]> = {};
  fetchedMap: Record<string, boolean> = {};
  // root store
  rootStore: CoreRootStore;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      // observables
      loader: observable.ref,
      recurringIssueMap: observable,
      runsMap: observable,
      fetchedMap: observable,
      // fetch actions
      fetchRecurringIssues: action,
      fetchRecurringIssueRuns: action,
      // CRUD actions
      createRecurringIssue: action,
      updateRecurringIssue: action,
      deleteRecurringIssue: action,
    });
    this.rootStore = _rootStore;
  }

  /**
   * @description returns a single recurrence by id
   */
  getRecurringIssueById = computedFn(
    (recurringId: string) => this.recurringIssueMap?.[recurringId] ?? undefined
  );

  /**
   * @description recurrences for a project, newest first
   */
  getProjectRecurringIssues = computedFn((projectId: string) =>
    orderBy(
      Object.values(this.recurringIssueMap ?? {}).filter((recurring) => recurring.project === projectId),
      ["created_at"],
      "desc"
    )
  );

  /**
   * @description materialization runs for a recurrence, newest first
   */
  getRecurringIssueRuns = computedFn((recurringId: string) => this.runsMap?.[recurringId] ?? []);

  /**
   * @description fetches all recurrences for a project
   */
  fetchRecurringIssues = async (
    workspaceSlug: string,
    projectId: string
  ): Promise<TRecurringIssue[] | undefined> => {
    try {
      this.loader = true;
      const response = await recurringIssueService.fetchRecurringIssues(workspaceSlug, projectId);
      runInAction(() => {
        (response ?? []).forEach((recurring) => {
          set(this.recurringIssueMap, [recurring.id], recurring);
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
   * @description fetches the run history for a recurrence and stores it
   */
  fetchRecurringIssueRuns = async (
    workspaceSlug: string,
    projectId: string,
    recurringId: string
  ): Promise<TRecurringIssueRun[] | undefined> => {
    const response = await recurringIssueService.fetchRecurringIssueRuns(workspaceSlug, projectId, recurringId);
    runInAction(() => {
      set(this.runsMap, [recurringId], response ?? []);
    });
    return response;
  };

  /**
   * @description creates a new recurrence and adds it to the store
   */
  createRecurringIssue = async (
    workspaceSlug: string,
    projectId: string,
    payload: Partial<TRecurringIssue>
  ): Promise<TRecurringIssue | undefined> => {
    const response = await recurringIssueService.createRecurringIssue(workspaceSlug, projectId, payload);
    if (response) {
      runInAction(() => {
        set(this.recurringIssueMap, [response.id], response);
      });
    }
    return response;
  };

  /**
   * @description updates a recurrence and refreshes it in the store
   */
  updateRecurringIssue = async (
    workspaceSlug: string,
    projectId: string,
    recurringId: string,
    payload: Partial<TRecurringIssue>
  ): Promise<TRecurringIssue | undefined> => {
    const response = await recurringIssueService.updateRecurringIssue(
      workspaceSlug,
      projectId,
      recurringId,
      payload
    );
    if (response) {
      runInAction(() => {
        set(this.recurringIssueMap, [response.id], response);
      });
    }
    return response;
  };

  /**
   * @description deletes a recurrence and removes it from the store
   */
  deleteRecurringIssue = async (workspaceSlug: string, projectId: string, recurringId: string): Promise<void> => {
    await recurringIssueService.deleteRecurringIssue(workspaceSlug, projectId, recurringId);
    runInAction(() => {
      unset(this.recurringIssueMap, [recurringId]);
      unset(this.runsMap, [recurringId]);
    });
  };
}
