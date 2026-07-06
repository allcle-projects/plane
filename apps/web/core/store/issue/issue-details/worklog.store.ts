/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set } from "lodash-es";
import { action, computed, makeObservable, observable, runInAction } from "mobx";
// plane types
import type { TIssueTimer, TIssueWorklog, TIssueWorklogIdMap, TIssueWorklogMap, TIssueTimerMap } from "@plane/types";
// services
import { IssueWorklogService } from "@/services/issue";
// types
import type { IIssueDetail } from "./root.store";

export interface IIssueWorklogStoreActions {
  addWorklogs: (issueId: string, worklogs: TIssueWorklog[]) => void;
  fetchWorklogs: (workspaceSlug: string, projectId: string, issueId: string) => Promise<TIssueWorklog[]>;
  createWorklog: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: Partial<TIssueWorklog>
  ) => Promise<TIssueWorklog>;
  updateWorklog: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    worklogId: string,
    data: Partial<TIssueWorklog>
  ) => Promise<TIssueWorklog>;
  removeWorklog: (workspaceSlug: string, projectId: string, issueId: string, worklogId: string) => Promise<void>;
  fetchTimer: (workspaceSlug: string, projectId: string, issueId: string) => Promise<TIssueTimer | undefined>;
  startTimer: (workspaceSlug: string, projectId: string, issueId: string) => Promise<TIssueTimer>;
  stopTimer: (workspaceSlug: string, projectId: string, issueId: string, description?: string) => Promise<TIssueWorklog>;
}

export interface IIssueWorklogStore extends IIssueWorklogStoreActions {
  // observables
  worklogs: TIssueWorklogIdMap;
  worklogMap: TIssueWorklogMap;
  timerMap: TIssueTimerMap;
  // computed
  issueWorklogs: string[] | undefined;
  // helper methods
  getWorklogsByIssueId: (issueId: string) => string[] | undefined;
  getWorklogById: (worklogId: string) => TIssueWorklog | undefined;
  getTotalWorklogByIssueId: (issueId: string) => number;
  getRunningTimerByIssueId: (issueId: string) => TIssueTimer | undefined;
}

export class IssueWorklogStore implements IIssueWorklogStore {
  // observables
  worklogs: TIssueWorklogIdMap = {};
  worklogMap: TIssueWorklogMap = {};
  timerMap: TIssueTimerMap = {};
  // root store
  rootIssueDetailStore: IIssueDetail;
  // services
  issueWorklogService;

  constructor(rootStore: IIssueDetail) {
    makeObservable(this, {
      // observables
      worklogs: observable,
      worklogMap: observable,
      timerMap: observable,
      // computed
      issueWorklogs: computed,
      // actions
      addWorklogs: action.bound,
      fetchWorklogs: action,
      createWorklog: action,
      updateWorklog: action,
      removeWorklog: action,
      fetchTimer: action,
      startTimer: action,
      stopTimer: action,
    });
    // root store
    this.rootIssueDetailStore = rootStore;
    // services
    this.issueWorklogService = new IssueWorklogService();
  }

  // computed
  get issueWorklogs() {
    const issueId = this.rootIssueDetailStore.peekIssue?.issueId;
    if (!issueId) return undefined;
    return this.worklogs[issueId] ?? undefined;
  }

  // helper methods
  getWorklogsByIssueId = (issueId: string) => {
    if (!issueId) return undefined;
    return this.worklogs[issueId] ?? undefined;
  };

  getWorklogById = (worklogId: string) => {
    if (!worklogId) return undefined;
    return this.worklogMap[worklogId] ?? undefined;
  };

  getTotalWorklogByIssueId = (issueId: string) => {
    const worklogIds = this.getWorklogsByIssueId(issueId) ?? [];
    return worklogIds.reduce((total, worklogId) => total + (this.worklogMap[worklogId]?.duration ?? 0), 0);
  };

  getRunningTimerByIssueId = (issueId: string) => {
    if (!issueId) return undefined;
    const timer = this.timerMap[issueId];
    return timer?.is_running ? timer : undefined;
  };

  // actions
  addWorklogs = (issueId: string, worklogs: TIssueWorklog[]) => {
    runInAction(() => {
      this.worklogs[issueId] = worklogs.map((worklog) => worklog.id);
      worklogs.forEach((worklog) => set(this.worklogMap, worklog.id, worklog));
    });
  };

  fetchWorklogs = async (workspaceSlug: string, projectId: string, issueId: string) => {
    const response = await this.issueWorklogService.getWorklogs(workspaceSlug, projectId, issueId);
    this.addWorklogs(issueId, response);
    return response;
  };

  createWorklog = async (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: Partial<TIssueWorklog>
  ) => {
    const response = await this.issueWorklogService.createWorklog(workspaceSlug, projectId, issueId, data);
    runInAction(() => {
      if (!this.worklogs[issueId]) this.worklogs[issueId] = [];
      this.worklogs[issueId].unshift(response.id);
      set(this.worklogMap, response.id, response);
    });
    // fetching activity
    this.rootIssueDetailStore.activity.fetchActivities(workspaceSlug, projectId, issueId);
    return response;
  };

  updateWorklog = async (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    worklogId: string,
    data: Partial<TIssueWorklog>
  ) => {
    const initialData = { ...this.worklogMap[worklogId] };
    try {
      runInAction(() => {
        Object.keys(data).forEach((key) => {
          set(this.worklogMap, [worklogId, key], data[key as keyof TIssueWorklog]);
        });
      });
      const response = await this.issueWorklogService.updateWorklog(workspaceSlug, projectId, issueId, worklogId, data);
      // fetching activity
      this.rootIssueDetailStore.activity.fetchActivities(workspaceSlug, projectId, issueId);
      return response;
    } catch (error) {
      runInAction(() => {
        Object.keys(initialData).forEach((key) => {
          set(this.worklogMap, [worklogId, key], initialData[key as keyof TIssueWorklog]);
        });
      });
      throw error;
    }
  };

  removeWorklog = async (workspaceSlug: string, projectId: string, issueId: string, worklogId: string) => {
    await this.issueWorklogService.deleteWorklog(workspaceSlug, projectId, issueId, worklogId);
    const worklogIndex = this.worklogs[issueId]?.findIndex((_worklogId) => _worklogId === worklogId) ?? -1;
    if (worklogIndex >= 0)
      runInAction(() => {
        this.worklogs[issueId].splice(worklogIndex, 1);
        delete this.worklogMap[worklogId];
      });
    // fetching activity
    this.rootIssueDetailStore.activity.fetchActivities(workspaceSlug, projectId, issueId);
  };

  fetchTimer = async (workspaceSlug: string, projectId: string, issueId: string) => {
    const response = await this.issueWorklogService.getTimer(workspaceSlug, projectId, issueId);
    const timer = response && "id" in response ? (response as TIssueTimer) : undefined;
    runInAction(() => {
      set(this.timerMap, issueId, timer);
    });
    return timer;
  };

  startTimer = async (workspaceSlug: string, projectId: string, issueId: string) => {
    const response = await this.issueWorklogService.startTimer(workspaceSlug, projectId, issueId);
    runInAction(() => {
      set(this.timerMap, issueId, response);
    });
    return response;
  };

  stopTimer = async (workspaceSlug: string, projectId: string, issueId: string, description?: string) => {
    const response = await this.issueWorklogService.stopTimer(workspaceSlug, projectId, issueId, { description });
    runInAction(() => {
      set(this.timerMap, issueId, undefined);
      if (!this.worklogs[issueId]) this.worklogs[issueId] = [];
      this.worklogs[issueId].unshift(response.id);
      set(this.worklogMap, response.id, response);
    });
    // fetching activity
    this.rootIssueDetailStore.activity.fetchActivities(workspaceSlug, projectId, issueId);
    return response;
  };
}
