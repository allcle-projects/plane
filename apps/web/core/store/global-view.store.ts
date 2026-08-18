/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set, cloneDeep, isEqual } from "lodash-es";
import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// plane imports
import type { IWorkspaceView } from "@plane/types";
// services
import { WorkspaceService } from "@/services/workspace.service";
// store
import type { CoreRootStore } from "./root.store";

export interface IGlobalViewStore {
  // observables
  globalViewMap: Record<string, IWorkspaceView>;
  // computed
  currentWorkspaceViews: string[] | null;
  // computed actions
  getSearchedViews: (searchQuery: string) => string[] | null;
  getViewDetailsById: (viewId: string) => IWorkspaceView | null;
  // fetch actions
  fetchAllGlobalViews: (workspaceSlug: string) => Promise<IWorkspaceView[]>;
  fetchGlobalViewDetails: (workspaceSlug: string, viewId: string) => Promise<IWorkspaceView>;
  // crud actions
  createGlobalView: (workspaceSlug: string, data: Partial<IWorkspaceView>) => Promise<IWorkspaceView>;
  updateGlobalView: (
    workspaceSlug: string,
    viewId: string,
    data: Partial<IWorkspaceView>,
    shouldSyncFilters?: boolean
  ) => Promise<IWorkspaceView | undefined>;
  deleteGlobalView: (workspaceSlug: string, viewId: string) => Promise<any>;
  // mote — 기본 뷰 (사용자 x 워크스페이스, 서버 저장)
  defaultGlobalViewMap: Record<string, string | null>;
  getDefaultGlobalView: (workspaceSlug: string) => string | null;
  fetchDefaultGlobalView: (workspaceSlug: string) => Promise<string | null>;
  setDefaultGlobalView: (workspaceSlug: string, viewId: string | null) => Promise<void>;
}

export class GlobalViewStore implements IGlobalViewStore {
  // observables
  globalViewMap: Record<string, IWorkspaceView> = {};
  /**
   * mote — workspaceSlug -> 기본 뷰 id.
   * 값은 스톡 뷰 key("all-issues" 등) 또는 커스텀 뷰 UUID. null = 미설정(=all-issues).
   * 서버의 WorkspaceUserProperties.default_global_view 를 그대로 담는다.
   */
  defaultGlobalViewMap: Record<string, string | null> = {};
  // root store
  rootStore;
  // services
  workspaceService;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      // observables
      globalViewMap: observable,
      defaultGlobalViewMap: observable,
      // computed
      currentWorkspaceViews: computed,
      // actions
      fetchAllGlobalViews: action,
      fetchGlobalViewDetails: action,
      deleteGlobalView: action,
      updateGlobalView: action,
      createGlobalView: action,
      fetchDefaultGlobalView: action,
      setDefaultGlobalView: action,
    });

    // root store
    this.rootStore = _rootStore;
    // services
    this.workspaceService = new WorkspaceService();

    this.createGlobalView = this.createGlobalView.bind(this);
    this.updateGlobalView = this.updateGlobalView.bind(this);
  }

  /**
   * mote — 이 워크스페이스의 기본 뷰. 아직 안 불러왔거나 미설정이면 null.
   * null 일 때 호출부는 종전 동작(all-issues)으로 떨어져야 한다.
   */
  getDefaultGlobalView = (workspaceSlug: string): string | null =>
    this.defaultGlobalViewMap[workspaceSlug] ?? null;

  /**
   * mote — 서버에서 기본 뷰를 읽어 캐시한다.
   * 실패는 삼킨다 — 기본 뷰는 편의 기능이라, 못 읽었다고 Views 진입을 막으면 안 된다.
   * (다만 콘솔에는 남긴다. 조용히 사라지면 다음 사람이 원인을 못 찾는다.)
   */
  fetchDefaultGlobalView = async (workspaceSlug: string): Promise<string | null> => {
    try {
      const response = await this.workspaceService.fetchWorkspaceUserProperties(workspaceSlug);
      const value = response?.default_global_view ?? null;
      runInAction(() => {
        this.defaultGlobalViewMap[workspaceSlug] = value;
      });
      return value;
    } catch (error) {
      console.error("[mote] failed to fetch default global view", error);
      return null;
    }
  };

  /**
   * mote — 기본 뷰를 서버에 저장한다. viewId=null 이면 해제.
   * 낙관적으로 먼저 반영하고, 실패하면 되돌린다 — 실패했는데 UI 가 바뀐 채로 남으면
   * "설정됐다"는 착시가 생긴다.
   */
  setDefaultGlobalView = async (workspaceSlug: string, viewId: string | null): Promise<void> => {
    const previous = this.defaultGlobalViewMap[workspaceSlug] ?? null;
    runInAction(() => {
      this.defaultGlobalViewMap[workspaceSlug] = viewId;
    });
    try {
      await this.workspaceService.updateWorkspaceUserProperties(workspaceSlug, {
        default_global_view: viewId,
      });
    } catch (error) {
      runInAction(() => {
        this.defaultGlobalViewMap[workspaceSlug] = previous;
      });
      throw error;
    }
  };

  /**
   * @description returns list of views for current workspace
   */
  get currentWorkspaceViews() {
    const currentWorkspaceDetails = this.rootStore.workspaceRoot.currentWorkspace;
    if (!currentWorkspaceDetails) return null;

    return (
      Object.keys(this.globalViewMap ?? {})?.filter(
        (viewId) => this.globalViewMap[viewId]?.workspace === currentWorkspaceDetails.id
      ) ?? null
    );
  }

  /**
   * @description returns list of views for current workspace based on search query
   * @param searchQuery
   * @returns
   */
  getSearchedViews = computedFn((searchQuery: string) => {
    const currentWorkspaceDetails = this.rootStore.workspaceRoot.currentWorkspace;
    if (!currentWorkspaceDetails) return null;

    return (
      Object.keys(this.globalViewMap ?? {})?.filter(
        (viewId) =>
          this.globalViewMap[viewId]?.workspace === currentWorkspaceDetails.id &&
          this.globalViewMap[viewId]?.name?.toLowerCase().includes(searchQuery.toLowerCase())
      ) ?? null
    );
  });

  /**
   * @description returns view details for given viewId
   * @param viewId
   */
  getViewDetailsById = computedFn((viewId: string): IWorkspaceView | null => this.globalViewMap[viewId] ?? null);

  /**
   * @description fetch all global views for given workspace
   * @param workspaceSlug
   */
  fetchAllGlobalViews = async (workspaceSlug: string): Promise<IWorkspaceView[]> =>
    await this.workspaceService.getAllViews(workspaceSlug).then((response) => {
      runInAction(() => {
        response.forEach((view) => {
          set(this.globalViewMap, view.id, view);
        });
      });
      return response;
    });

  /**
   * @description fetch view details for given viewId
   * @param viewId
   */
  fetchGlobalViewDetails = async (workspaceSlug: string, viewId: string): Promise<IWorkspaceView> =>
    await this.workspaceService.getViewDetails(workspaceSlug, viewId).then((response) => {
      runInAction(() => {
        set(this.globalViewMap, viewId, response);
      });
      return response;
    });

  /**
   * @description create new global view
   * @param workspaceSlug
   * @param data
   */
  async createGlobalView(workspaceSlug: string, data: Partial<IWorkspaceView>) {
    try {
      const response = await this.workspaceService.createView(workspaceSlug, data);
      runInAction(() => {
        set(this.globalViewMap, response.id, response);
      });

      return response;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * @description update global view
   * @param workspaceSlug
   * @param viewId
   * @param data
   */
  async updateGlobalView(
    workspaceSlug: string,
    viewId: string,
    data: Partial<IWorkspaceView>,
    shouldSyncFilters: boolean = true
  ): Promise<IWorkspaceView | undefined> {
    const currentViewData = this.getViewDetailsById(viewId) ? cloneDeep(this.getViewDetailsById(viewId)) : undefined;
    try {
      Object.keys(data).forEach((key) => {
        const currentKey = key as keyof IWorkspaceView;
        set(this.globalViewMap, [viewId, currentKey], data[currentKey]);
      });

      const currentView = await this.workspaceService.updateView(workspaceSlug, viewId, data);

      // applying the filters in the global view
      if (shouldSyncFilters && !isEqual(currentViewData?.rich_filters || {}, currentView?.rich_filters || {})) {
        await this.rootStore.issue.workspaceIssuesFilter.updateFilterExpression(
          workspaceSlug,
          viewId,
          currentView?.rich_filters || {}
        );
        this.rootStore.issue.workspaceIssues.fetchIssuesWithExistingPagination(workspaceSlug, viewId, "mutation");
      }
      return currentView;
    } catch {
      Object.keys(data).forEach((key) => {
        const currentKey = key as keyof IWorkspaceView;
        if (currentViewData) set(this.globalViewMap, [viewId, currentKey], currentViewData[currentKey]);
      });
    }
  }

  /**
   * @description delete global view
   * @param workspaceSlug
   * @param viewId
   */
  deleteGlobalView = async (workspaceSlug: string, viewId: string): Promise<any> =>
    await this.workspaceService.deleteView(workspaceSlug, viewId).then(() => {
      runInAction(() => {
        delete this.globalViewMap[viewId];
      });
    });
}
