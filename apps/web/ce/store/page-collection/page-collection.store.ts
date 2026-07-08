/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Page Collections — mote.
// See docs/mote-design/02-wiki-publishing.md, Feature 4.
//
// Workspace-scoped CRUD store for page collections, mirroring the
// WorkspaceProjectStateStore (ce/store/workspace-project-state/project-state.store.ts).
// Holds collections keyed by id in a flat map, with computed getters that
// filter/sort per workspace.

import { orderBy, set, unset } from "lodash-es";
import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// services
import pageCollectionService from "@/services/page-collection.service";
// plane web types
import type { TPageCollection, TPageCollectionCreatePayload, TPageCollectionUpdatePayload } from "@/plane-web/types/page-collections";
// store
import type { CoreRootStore } from "@/store/root.store";

export interface IPageCollectionStore {
  // observables
  loader: boolean;
  collectionsMap: Record<string, TPageCollection>;
  fetchedMap: Record<string, boolean>;
  // computed
  collections: TPageCollection[];
  // computed actions
  getCollectionsForWorkspace: (workspaceSlug: string) => TPageCollection[];
  getCollectionById: (collectionId: string) => TPageCollection | undefined;
  // fetch actions
  fetchCollections: (workspaceSlug: string) => Promise<TPageCollection[] | undefined>;
  // CRUD actions
  createCollection: (
    workspaceSlug: string,
    payload: TPageCollectionCreatePayload
  ) => Promise<TPageCollection | undefined>;
  updateCollection: (
    workspaceSlug: string,
    collectionId: string,
    payload: TPageCollectionUpdatePayload
  ) => Promise<TPageCollection | undefined>;
  deleteCollection: (workspaceSlug: string, collectionId: string) => Promise<void>;
  addPagesToCollection: (
    workspaceSlug: string,
    collectionId: string,
    pageIds: string[]
  ) => Promise<TPageCollection | undefined>;
  removePageFromCollection: (workspaceSlug: string, collectionId: string, pageId: string) => Promise<void>;
}

export class PageCollectionStore implements IPageCollectionStore {
  // observables
  loader: boolean = false;
  collectionsMap: Record<string, TPageCollection> = {};
  fetchedMap: Record<string, boolean> = {};
  // root store
  rootStore: CoreRootStore;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      // observables
      loader: observable.ref,
      collectionsMap: observable,
      fetchedMap: observable,
      // computed
      collections: computed,
      // fetch actions
      fetchCollections: action,
      // CRUD actions
      createCollection: action,
      updateCollection: action,
      deleteCollection: action,
      addPagesToCollection: action,
      removePageFromCollection: action,
    });
    this.rootStore = _rootStore;
  }

  /**
   * @description all loaded collections, ordered by sort_order
   */
  get collections(): TPageCollection[] {
    return orderBy(Object.values(this.collectionsMap ?? {}), ["sort_order", "created_at"], ["asc", "asc"]);
  }

  /**
   * @description collections belonging to a specific workspace, ordered by sort_order
   */
  getCollectionsForWorkspace = computedFn((workspaceSlug: string) =>
    orderBy(
      Object.values(this.collectionsMap ?? {}).filter((collection) => collection.workspace === workspaceSlug),
      ["sort_order", "created_at"],
      ["asc", "asc"]
    )
  );

  /**
   * @description resolves a single collection by id
   */
  getCollectionById = computedFn((collectionId: string) => this.collectionsMap?.[collectionId]);

  /**
   * @description fetches all page collections for a workspace
   */
  fetchCollections = async (workspaceSlug: string): Promise<TPageCollection[] | undefined> => {
    try {
      this.loader = true;
      const response = await pageCollectionService.list(workspaceSlug);
      runInAction(() => {
        (response ?? []).forEach((collection) => {
          set(this.collectionsMap, [collection.id], collection);
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
   * @description creates a new page collection and adds it to the map
   */
  createCollection = async (
    workspaceSlug: string,
    payload: TPageCollectionCreatePayload
  ): Promise<TPageCollection | undefined> => {
    const response = await pageCollectionService.create(workspaceSlug, payload);
    if (response) {
      runInAction(() => {
        set(this.collectionsMap, [response.id], response);
      });
    }
    return response;
  };

  /**
   * @description updates a page collection and refreshes it in the map
   */
  updateCollection = async (
    workspaceSlug: string,
    collectionId: string,
    payload: TPageCollectionUpdatePayload
  ): Promise<TPageCollection | undefined> => {
    const response = await pageCollectionService.update(workspaceSlug, collectionId, payload);
    if (response) {
      runInAction(() => {
        set(this.collectionsMap, [collectionId], response);
      });
    }
    return response;
  };

  /**
   * @description deletes a page collection and removes it from the map
   */
  deleteCollection = async (workspaceSlug: string, collectionId: string): Promise<void> => {
    await pageCollectionService.destroy(workspaceSlug, collectionId);
    runInAction(() => {
      unset(this.collectionsMap, [collectionId]);
    });
  };

  /**
   * @description adds pages to a collection and refreshes it in the map
   */
  addPagesToCollection = async (
    workspaceSlug: string,
    collectionId: string,
    pageIds: string[]
  ): Promise<TPageCollection | undefined> => {
    const response = await pageCollectionService.addPages(workspaceSlug, collectionId, pageIds);
    if (response) {
      runInAction(() => {
        set(this.collectionsMap, [collectionId], response);
      });
    }
    return response;
  };

  /**
   * @description removes a page from a collection and updates the map optimistically
   */
  removePageFromCollection = async (workspaceSlug: string, collectionId: string, pageId: string): Promise<void> => {
    await pageCollectionService.removePage(workspaceSlug, collectionId, pageId);
    runInAction(() => {
      const existing = this.collectionsMap?.[collectionId];
      if (existing) {
        set(this.collectionsMap, [collectionId], {
          ...existing,
          page_ids: existing.page_ids.filter((id) => id !== pageId),
        });
      }
    });
  };
}
