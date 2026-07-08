/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Automations rule engine — mote.
// See docs/mote-design/06-integrations-importers-automations.md, Feature 3.
//
// Project-scoped CRUD store for automation rules, mirroring the mote.14
// Template store / mote recurring-issue store (ce/store/recurring/recurring-issue.store.ts).
// Holds a flat map of rules keyed by id, a per-project fetched flag, and a
// per-rule map of execution logs (fetched on demand from the ``/logs/``
// endpoint).

import { orderBy, set, unset } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// services
import automationService from "@/services/automation.service";
// plane web types
import type { TAutomationRule, TAutomationRuleLog } from "@/plane-web/types/automations";
// store
import type { CoreRootStore } from "@/store/root.store";

export interface IAutomationStore {
  // observables
  loader: boolean;
  ruleMap: Record<string, TAutomationRule>;
  logsMap: Record<string, TAutomationRuleLog[]>;
  fetchedMap: Record<string, boolean>;
  // computed actions
  getRuleById: (ruleId: string) => TAutomationRule | undefined;
  getProjectAutomationRules: (projectId: string) => TAutomationRule[];
  getRuleLogs: (ruleId: string) => TAutomationRuleLog[];
  // fetch actions
  fetchAutomationRules: (workspaceSlug: string, projectId: string) => Promise<TAutomationRule[] | undefined>;
  fetchRuleLogs: (
    workspaceSlug: string,
    projectId: string,
    ruleId: string
  ) => Promise<TAutomationRuleLog[] | undefined>;
  // CRUD actions
  createAutomationRule: (
    workspaceSlug: string,
    projectId: string,
    payload: Partial<TAutomationRule>
  ) => Promise<TAutomationRule | undefined>;
  updateAutomationRule: (
    workspaceSlug: string,
    projectId: string,
    ruleId: string,
    payload: Partial<TAutomationRule>
  ) => Promise<TAutomationRule | undefined>;
  toggleAutomationRule: (
    workspaceSlug: string,
    projectId: string,
    ruleId: string,
    isActive: boolean
  ) => Promise<TAutomationRule | undefined>;
  deleteAutomationRule: (workspaceSlug: string, projectId: string, ruleId: string) => Promise<void>;
}

export class AutomationStore implements IAutomationStore {
  // observables
  loader: boolean = false;
  ruleMap: Record<string, TAutomationRule> = {};
  logsMap: Record<string, TAutomationRuleLog[]> = {};
  fetchedMap: Record<string, boolean> = {};
  // root store
  rootStore: CoreRootStore;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      // observables
      loader: observable.ref,
      ruleMap: observable,
      logsMap: observable,
      fetchedMap: observable,
      // fetch actions
      fetchAutomationRules: action,
      fetchRuleLogs: action,
      // CRUD actions
      createAutomationRule: action,
      updateAutomationRule: action,
      toggleAutomationRule: action,
      deleteAutomationRule: action,
    });
    this.rootStore = _rootStore;
  }

  /**
   * @description returns a single rule by id
   */
  getRuleById = computedFn((ruleId: string) => this.ruleMap?.[ruleId] ?? undefined);

  /**
   * @description rules for a project, ordered like the backend (run_order, newest first)
   */
  getProjectAutomationRules = computedFn((projectId: string) =>
    orderBy(
      Object.values(this.ruleMap ?? {}).filter((rule) => rule.project === projectId),
      ["run_order", "created_at"],
      ["asc", "desc"]
    )
  );

  /**
   * @description execution logs for a rule, newest first
   */
  getRuleLogs = computedFn((ruleId: string) => this.logsMap?.[ruleId] ?? []);

  /**
   * @description fetches all automation rules for a project
   */
  fetchAutomationRules = async (
    workspaceSlug: string,
    projectId: string
  ): Promise<TAutomationRule[] | undefined> => {
    try {
      this.loader = true;
      const response = await automationService.list(workspaceSlug, projectId);
      runInAction(() => {
        (response ?? []).forEach((rule) => {
          set(this.ruleMap, [rule.id], rule);
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
   * @description fetches the execution log history for a rule and stores it
   */
  fetchRuleLogs = async (
    workspaceSlug: string,
    projectId: string,
    ruleId: string
  ): Promise<TAutomationRuleLog[] | undefined> => {
    const response = await automationService.logs(workspaceSlug, projectId, ruleId);
    runInAction(() => {
      set(this.logsMap, [ruleId], response ?? []);
    });
    return response;
  };

  /**
   * @description creates a new automation rule and adds it to the store
   */
  createAutomationRule = async (
    workspaceSlug: string,
    projectId: string,
    payload: Partial<TAutomationRule>
  ): Promise<TAutomationRule | undefined> => {
    const response = await automationService.create(workspaceSlug, projectId, payload);
    if (response) {
      runInAction(() => {
        set(this.ruleMap, [response.id], response);
      });
    }
    return response;
  };

  /**
   * @description updates an automation rule and refreshes it in the store
   */
  updateAutomationRule = async (
    workspaceSlug: string,
    projectId: string,
    ruleId: string,
    payload: Partial<TAutomationRule>
  ): Promise<TAutomationRule | undefined> => {
    const response = await automationService.update(workspaceSlug, projectId, ruleId, payload);
    if (response) {
      runInAction(() => {
        set(this.ruleMap, [response.id], response);
      });
    }
    return response;
  };

  /**
   * @description flips a rule's is_active flag via the dedicated toggle endpoint
   */
  toggleAutomationRule = async (
    workspaceSlug: string,
    projectId: string,
    ruleId: string,
    isActive: boolean
  ): Promise<TAutomationRule | undefined> => {
    const response = await automationService.toggle(workspaceSlug, projectId, ruleId, isActive);
    if (response) {
      runInAction(() => {
        set(this.ruleMap, [response.id], response);
      });
    }
    return response;
  };

  /**
   * @description deletes an automation rule and removes it from the store
   */
  deleteAutomationRule = async (workspaceSlug: string, projectId: string, ruleId: string): Promise<void> => {
    await automationService.remove(workspaceSlug, projectId, ruleId);
    runInAction(() => {
      unset(this.ruleMap, [ruleId]);
      unset(this.logsMap, [ruleId]);
    });
  };
}
