/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Custom Fields / Work Item Properties — mote (Phase 2).
// Per-issue value store: holds the ``{property_id: [values]}`` map for each work
// item and drives bulk read/upsert against the property-values endpoint. Mirrors
// IssueWorklogStore (worklog.store.ts): a per-issue sub-store of the issue-detail
// root that owns fetch + mutation and refreshes the activity feed on change.

import { set } from "lodash-es";
import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// services
import { IssuePropertyValueService } from "@/services/issue";
// plane web types
import type { TIssuePropertyValues } from "@/plane-web/types/issue-types";
// types
import type { IIssueDetail } from "./root.store";

export interface IIssuePropertyValueStore {
  // observables
  propertyValues: Record<string, TIssuePropertyValues>; // issue_id -> { property_id: [values] }
  // computed
  issuePropertyValues: TIssuePropertyValues | undefined;
  // helper methods
  getPropertyValuesByIssueId: (issueId: string) => TIssuePropertyValues | undefined;
  getValueByIssueAndPropertyId: (issueId: string, propertyId: string) => string[];
  // actions
  fetchPropertyValues: (workspaceSlug: string, projectId: string, issueId: string) => Promise<TIssuePropertyValues>;
  updatePropertyValues: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: TIssuePropertyValues
  ) => Promise<TIssuePropertyValues>;
}

export class IssuePropertyValueStore implements IIssuePropertyValueStore {
  // observables
  propertyValues: Record<string, TIssuePropertyValues> = {};
  // root store
  rootIssueDetailStore: IIssueDetail;
  // services
  issuePropertyValueService: IssuePropertyValueService;

  constructor(rootStore: IIssueDetail) {
    makeObservable(this, {
      // observables
      propertyValues: observable,
      // computed
      issuePropertyValues: computed,
      // actions
      fetchPropertyValues: action,
      updatePropertyValues: action,
    });
    // root store
    this.rootIssueDetailStore = rootStore;
    // services
    this.issuePropertyValueService = new IssuePropertyValueService();
  }

  // computed
  get issuePropertyValues() {
    const issueId = this.rootIssueDetailStore.peekIssue?.issueId;
    if (!issueId) return undefined;
    return this.propertyValues[issueId] ?? undefined;
  }

  // helper methods
  getPropertyValuesByIssueId = (issueId: string) => {
    if (!issueId) return undefined;
    return this.propertyValues[issueId] ?? undefined;
  };

  getValueByIssueAndPropertyId = computedFn((issueId: string, propertyId: string) => {
    if (!issueId || !propertyId) return [];
    return this.propertyValues[issueId]?.[propertyId] ?? [];
  });

  // actions
  fetchPropertyValues = async (workspaceSlug: string, projectId: string, issueId: string) => {
    const response = await this.issuePropertyValueService.fetchPropertyValues(workspaceSlug, projectId, issueId);
    runInAction(() => {
      set(this.propertyValues, [issueId], response ?? {});
    });
    return response;
  };

  updatePropertyValues = async (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: TIssuePropertyValues
  ) => {
    const response = await this.issuePropertyValueService.updatePropertyValues(workspaceSlug, projectId, issueId, data);
    runInAction(() => {
      // the endpoint returns the full current map after the upsert
      set(this.propertyValues, [issueId], response ?? {});
    });
    // refresh the activity feed so custom-field changes appear
    this.rootIssueDetailStore.activity.fetchActivities(workspaceSlug, projectId, issueId);
    return response;
  };
}
