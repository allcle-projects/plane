/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Updates — mote.
// See docs/mote-design/04-planning-hierarchy.md, section 4.
//
// Per-entity timeline store for EntityUpdates. Holds a flat map of update
// arrays keyed by ``${entityType}:${entityId}`` (entityId = the leaf parent id:
// projectId / cycleId / initiativeId) plus a parallel loader flag map. Mirrors
// the initiative store's makeObservable / runInAction conventions.

import { set } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// services
import updateService, { type TUpdatePathParams } from "@/services/update.service";
// plane web types
import type { TEntityUpdate, TUpdateFormData } from "@/plane-web/types/updates";
// store
import type { CoreRootStore } from "@/store/root.store";

export interface IUpdateStore {
  // observables
  updatesMap: Record<string, TEntityUpdate[]>;
  loaderMap: Record<string, boolean>;
  // computed actions
  getUpdatesByKey: (key: string) => TEntityUpdate[];
  getIsLoading: (key: string) => boolean;
  // actions
  fetchUpdates: (workspaceSlug: string, key: string, params: TUpdatePathParams) => Promise<TEntityUpdate[] | undefined>;
  createUpdate: (
    workspaceSlug: string,
    key: string,
    params: TUpdatePathParams,
    data: TUpdateFormData
  ) => Promise<TEntityUpdate | undefined>;
  updateUpdate: (
    workspaceSlug: string,
    key: string,
    params: TUpdatePathParams,
    updateId: string,
    data: Partial<TUpdateFormData>
  ) => Promise<TEntityUpdate | undefined>;
  deleteUpdate: (
    workspaceSlug: string,
    key: string,
    params: TUpdatePathParams,
    updateId: string
  ) => Promise<void>;
}

export class UpdateStore implements IUpdateStore {
  // observables
  updatesMap: Record<string, TEntityUpdate[]> = {};
  loaderMap: Record<string, boolean> = {};
  // root store
  rootStore: CoreRootStore;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      // observables
      updatesMap: observable,
      loaderMap: observable,
      // actions
      fetchUpdates: action,
      createUpdate: action,
      updateUpdate: action,
      deleteUpdate: action,
    });
    this.rootStore = _rootStore;
  }

  /**
   * @description returns the cached timeline for an entity key
   */
  getUpdatesByKey = computedFn((key: string) => this.updatesMap?.[key] ?? []);

  /**
   * @description returns the loading flag for an entity key
   */
  getIsLoading = computedFn((key: string) => this.loaderMap?.[key] ?? false);

  /**
   * @description fetches the updates for an entity and stores them (already
   * ``-created_at`` ordered by the API)
   */
  fetchUpdates = async (
    workspaceSlug: string,
    key: string,
    params: TUpdatePathParams
  ): Promise<TEntityUpdate[] | undefined> => {
    try {
      runInAction(() => {
        set(this.loaderMap, [key], true);
      });
      const response = await updateService.getUpdates(workspaceSlug, params);
      runInAction(() => {
        set(this.updatesMap, [key], response ?? []);
        set(this.loaderMap, [key], false);
      });
      return response;
    } catch (_error) {
      runInAction(() => {
        set(this.loaderMap, [key], false);
      });
      return undefined;
    }
  };

  /**
   * @description creates an update and prepends it to the timeline
   */
  createUpdate = async (
    workspaceSlug: string,
    key: string,
    params: TUpdatePathParams,
    data: TUpdateFormData
  ): Promise<TEntityUpdate | undefined> => {
    const response = await updateService.createUpdate(workspaceSlug, params, data);
    if (response) {
      runInAction(() => {
        const existing = this.updatesMap?.[key] ?? [];
        set(this.updatesMap, [key], [response, ...existing]);
      });
    }
    return response;
  };

  /**
   * @description patches an update in place within the timeline
   */
  updateUpdate = async (
    workspaceSlug: string,
    key: string,
    params: TUpdatePathParams,
    updateId: string,
    data: Partial<TUpdateFormData>
  ): Promise<TEntityUpdate | undefined> => {
    const response = await updateService.updateUpdate(workspaceSlug, params, updateId, data);
    if (response) {
      runInAction(() => {
        const existing = this.updatesMap?.[key] ?? [];
        set(
          this.updatesMap,
          [key],
          existing.map((update) => (update.id === updateId ? response : update))
        );
      });
    }
    return response;
  };

  /**
   * @description deletes an update and removes it from the timeline
   */
  deleteUpdate = async (
    workspaceSlug: string,
    key: string,
    params: TUpdatePathParams,
    updateId: string
  ): Promise<void> => {
    await updateService.deleteUpdate(workspaceSlug, params, updateId);
    runInAction(() => {
      const existing = this.updatesMap?.[key] ?? [];
      set(
        this.updatesMap,
        [key],
        existing.filter((update) => update.id !== updateId)
      );
    });
  };
}
