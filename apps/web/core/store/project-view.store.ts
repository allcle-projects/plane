/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set, unset } from "lodash-es";
import { observable, action, makeObservable, runInAction, computed } from "mobx";
import { computedFn } from "mobx-utils";
// types
import type { IProjectView, TViewFilters, TViewPublishSettings } from "@plane/types";
// constants
// helpers
import { getValidatedViewFilters, getViewName, orderViews, shouldFilterView } from "@plane/utils";
// services
import { ViewPublishService } from "@/services/view-publish.service";
import { ViewService } from "@/services/view.service";
// store
import type { CoreRootStore } from "./root.store";

export interface IProjectViewStore {
  //Loaders
  loader: boolean;
  fetchedMap: Record<string, boolean>;
  // observables
  viewMap: Record<string, IProjectView>;
  filters: TViewFilters;
  // view publish — mote (docs/mote-design/02-wiki-publishing.md, Feature 5)
  viewPublishGeneralLoader: boolean;
  viewPublishFetchLoader: boolean;
  viewPublishSettingsMap: Record<string, TViewPublishSettings>;
  // computed
  projectViewIds: string[] | null;
  // computed actions
  getProjectViews: (projectId: string) => IProjectView[] | undefined;
  getFilteredProjectViews: (projectId: string) => IProjectView[] | undefined;
  getViewById: (viewId: string) => IProjectView;
  getViewPublishSettings: (viewId: string) => TViewPublishSettings | undefined;
  // fetch actions
  fetchViews: (workspaceSlug: string, projectId: string) => Promise<undefined | IProjectView[]>;
  fetchViewDetails: (workspaceSlug: string, projectId: string, viewId: string) => Promise<IProjectView>;
  // CRUD actions
  createView: (workspaceSlug: string, projectId: string, data: Partial<IProjectView>) => Promise<IProjectView>;
  updateView: (
    workspaceSlug: string,
    projectId: string,
    viewId: string,
    data: Partial<IProjectView>
  ) => Promise<IProjectView>;
  deleteView: (workspaceSlug: string, projectId: string, viewId: string) => Promise<any>;
  updateFilters: <T extends keyof TViewFilters>(filterKey: T, filterValue: TViewFilters[T]) => void;
  clearAllFilters: () => void;
  // favorites actions
  addViewToFavorites: (workspaceSlug: string, projectId: string, viewId: string) => Promise<any>;
  removeViewFromFavorites: (workspaceSlug: string, projectId: string, viewId: string) => Promise<any>;
  // view publish actions — mote (docs/mote-design/02-wiki-publishing.md, Feature 5)
  fetchViewPublishSettings: (
    workspaceSlug: string,
    projectId: string,
    viewId: string
  ) => Promise<TViewPublishSettings>;
  publishView: (
    workspaceSlug: string,
    projectId: string,
    viewId: string,
    data: Partial<TViewPublishSettings>
  ) => Promise<TViewPublishSettings>;
  unpublishView: (workspaceSlug: string, projectId: string, viewId: string, viewPublishId: string) => Promise<void>;
}

export class ProjectViewStore implements IProjectViewStore {
  // observables
  loader: boolean = false;
  viewMap: Record<string, IProjectView> = {};
  //loaders
  fetchedMap: Record<string, boolean> = {};
  filters: TViewFilters = { searchQuery: "", sortBy: "desc", sortKey: "updated_at" };
  // view publish — mote (docs/mote-design/02-wiki-publishing.md, Feature 5)
  viewPublishGeneralLoader: boolean = false;
  viewPublishFetchLoader: boolean = false;
  viewPublishSettingsMap: Record<string, TViewPublishSettings> = {};
  // root store
  rootStore;
  // services
  viewService;
  viewPublishService;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      // observables
      loader: observable.ref,
      viewMap: observable,
      fetchedMap: observable,
      filters: observable,
      viewPublishGeneralLoader: observable.ref,
      viewPublishFetchLoader: observable.ref,
      viewPublishSettingsMap: observable,
      // computed
      projectViewIds: computed,
      // fetch actions
      fetchViews: action,
      fetchViewDetails: action,
      // CRUD actions
      createView: action,
      updateView: action,
      deleteView: action,
      // actions
      updateFilters: action,
      clearAllFilters: action,
      // favorites actions
      addViewToFavorites: action,
      removeViewFromFavorites: action,
      // view publish actions
      fetchViewPublishSettings: action,
      publishView: action,
      unpublishView: action,
    });
    // root store
    this.rootStore = _rootStore;
    // services
    this.viewService = new ViewService();
    this.viewPublishService = new ViewPublishService();

    this.createView = this.createView.bind(this);
    this.updateView = this.updateView.bind(this);
  }

  /**
   * Returns array of view ids for current project
   */
  get projectViewIds() {
    const projectId = this.rootStore.router.projectId;
    if (!projectId || !this.fetchedMap[projectId]) return null;
    const viewIds = Object.keys(this.viewMap ?? {})?.filter((viewId) => this.viewMap?.[viewId]?.project === projectId);
    return viewIds;
  }

  getProjectViews = computedFn((projectId: string) => {
    if (!this.fetchedMap[projectId]) return undefined;

    const ViewsList = Object.values(this.viewMap ?? {});
    // helps to filter views based on the projectId
    let filteredViews = ViewsList.filter((view) => view?.project === projectId);
    filteredViews = orderViews(filteredViews, this.filters.sortKey, this.filters.sortBy);

    return filteredViews ?? undefined;
  });
  /**
   * returns viewsIds of issues
   */
  getFilteredProjectViews = computedFn((projectId: string) => {
    if (!this.fetchedMap[projectId]) return undefined;

    const ViewsList = Object.values(this.viewMap ?? {});
    // helps to filter views based on the projectId, searchQuery and filters
    let filteredViews = ViewsList.filter(
      (view) =>
        view?.project === projectId &&
        getViewName(view.name).toLowerCase().includes(this.filters.searchQuery.toLowerCase()) &&
        shouldFilterView(view, this.filters.filters)
    );
    filteredViews = orderViews(filteredViews, this.filters.sortKey, this.filters.sortBy);

    return filteredViews ?? undefined;
  });

  /**
   * Returns view details by id
   */
  getViewById = computedFn((viewId: string) => this.viewMap?.[viewId] ?? null);

  /**
   * @description returns the publish settings of a particular view — mote
   * (docs/mote-design/02-wiki-publishing.md, Feature 5)
   * @param {string} viewId
   * @returns {TViewPublishSettings | undefined}
   */
  getViewPublishSettings = (viewId: string): TViewPublishSettings | undefined =>
    this.viewPublishSettingsMap?.[viewId] ?? undefined;

  /**
   * Updates the filter
   * @param filterKey
   * @param filterValue
   */
  updateFilters = <T extends keyof TViewFilters>(filterKey: T, filterValue: TViewFilters[T]) => {
    runInAction(() => {
      set(this.filters, [filterKey], filterValue);
    });
  };

  /**
   * @description clears all the filters
   */
  clearAllFilters = () =>
    runInAction(() => {
      set(this.filters, ["filters"], {});
    });

  /**
   * Fetches views for current project
   * @param workspaceSlug
   * @param projectId
   * @returns Promise<IProjectView[]>
   */
  fetchViews = async (workspaceSlug: string, projectId: string) => {
    try {
      this.loader = true;
      await this.viewService.getViews(workspaceSlug, projectId).then((response) => {
        runInAction(() => {
          response.forEach((view) => {
            set(this.viewMap, [view.id], view);
          });
          set(this.fetchedMap, projectId, true);
          this.loader = false;
        });
        return response;
      });
    } catch (_error) {
      this.loader = false;
      return undefined;
    }
  };

  /**
   * Fetches view details for a specific view
   * @param workspaceSlug
   * @param projectId
   * @param viewId
   * @returns Promise<IProjectView>
   */
  fetchViewDetails = async (workspaceSlug: string, projectId: string, viewId: string): Promise<IProjectView> =>
    await this.viewService.getViewDetails(workspaceSlug, projectId, viewId).then((response) => {
      runInAction(() => {
        set(this.viewMap, [viewId], response);
      });
      return response;
    });

  /**
   * Creates a new view for a specific project and adds it to the store
   * @param workspaceSlug
   * @param projectId
   * @param data
   * @returns Promise<IProjectView>
   */
  async createView(workspaceSlug: string, projectId: string, data: Partial<IProjectView>): Promise<IProjectView> {
    const response = await this.viewService.createView(workspaceSlug, projectId, getValidatedViewFilters(data));

    runInAction(() => {
      set(this.viewMap, [response.id], response);
    });

    return response;
  }

  /**
   * Updates a view details of specific view and updates it in the store
   * @param workspaceSlug
   * @param projectId
   * @param viewId
   * @param data
   * @returns Promise<IProjectView>
   */
  async updateView(
    workspaceSlug: string,
    projectId: string,
    viewId: string,
    data: Partial<IProjectView>
  ): Promise<IProjectView> {
    const currentView = this.getViewById(viewId);

    runInAction(() => {
      set(this.viewMap, [viewId], { ...currentView, ...data });
    });

    const response = await this.viewService.patchView(workspaceSlug, projectId, viewId, data);

    return response;
  }

  /**
   * Deletes a view and removes it from the viewMap object
   * @param workspaceSlug
   * @param projectId
   * @param viewId
   * @returns
   */
  deleteView = async (workspaceSlug: string, projectId: string, viewId: string): Promise<any> => {
    await this.viewService.deleteView(workspaceSlug, projectId, viewId).then(() => {
      runInAction(() => {
        delete this.viewMap[viewId];
        if (this.rootStore.favorite.entityMap[viewId]) this.rootStore.favorite.removeFavoriteFromStore(viewId);
      });
    });
  };

  /**
   * Adds a view to favorites
   * @param workspaceSlug
   * @param projectId
   * @param viewId
   * @returns
   */
  addViewToFavorites = async (workspaceSlug: string, projectId: string, viewId: string) => {
    try {
      const currentView = this.getViewById(viewId);
      if (currentView?.is_favorite) return;
      runInAction(() => {
        set(this.viewMap, [viewId, "is_favorite"], true);
      });
      await this.rootStore.favorite.addFavorite(workspaceSlug.toString(), {
        entity_type: "view",
        entity_identifier: viewId,
        project_id: projectId,
        entity_data: { name: this.viewMap[viewId].name || "" },
      });
    } catch (error) {
      console.error("Failed to add view to favorites in view store", error);
      runInAction(() => {
        set(this.viewMap, [viewId, "is_favorite"], false);
      });
    }
  };

  /**
   * Removes a view from favorites
   * @param workspaceSlug
   * @param projectId
   * @param viewId
   * @returns
   */
  removeViewFromFavorites = async (workspaceSlug: string, projectId: string, viewId: string) => {
    try {
      const currentView = this.getViewById(viewId);
      if (!currentView?.is_favorite) return;
      runInAction(() => {
        set(this.viewMap, [viewId, "is_favorite"], false);
      });
      await this.rootStore.favorite.removeFavoriteEntity(workspaceSlug, viewId);
    } catch (error) {
      console.error("Failed to remove view from favorites in view store", error);
      runInAction(() => {
        set(this.viewMap, [viewId, "is_favorite"], true);
      });
    }
  };

  /**
   * Fetches publish settings for a specific view — mote (docs/mote-design/02-wiki-publishing.md,
   * Feature 5)
   * @param workspaceSlug
   * @param projectId
   * @param viewId
   * @returns
   */
  fetchViewPublishSettings = async (workspaceSlug: string, projectId: string, viewId: string) => {
    try {
      runInAction(() => {
        this.viewPublishFetchLoader = true;
      });
      const response = await this.viewPublishService.fetchPublishSettings(workspaceSlug, projectId, viewId);
      runInAction(() => {
        set(this.viewPublishSettingsMap, [viewId], response);
        this.viewPublishFetchLoader = false;
      });
      return response;
    } catch (error) {
      runInAction(() => {
        this.viewPublishFetchLoader = false;
      });
      throw error;
    }
  };

  /**
   * Publishes a view (or updates its publish settings — the backend upserts by
   * [entity_name, entity_identifier]) and updates the view's anchor in the store
   * @param workspaceSlug
   * @param projectId
   * @param viewId
   * @param data
   * @returns
   */
  publishView = async (
    workspaceSlug: string,
    projectId: string,
    viewId: string,
    data: Partial<TViewPublishSettings>
  ) => {
    try {
      runInAction(() => {
        this.viewPublishGeneralLoader = true;
      });
      const response = await this.viewPublishService.publishView(workspaceSlug, projectId, viewId, data);
      runInAction(() => {
        set(this.viewPublishSettingsMap, [viewId], response);
        set(this.viewMap, [viewId, "anchor"], response.anchor);
        this.viewPublishGeneralLoader = false;
      });
      return response;
    } catch (error) {
      runInAction(() => {
        this.viewPublishGeneralLoader = false;
      });
      throw error;
    }
  };

  /**
   * Unpublishes a view and clears its publish settings + anchor from the store
   * @param workspaceSlug
   * @param projectId
   * @param viewId
   * @param viewPublishId
   * @returns
   */
  unpublishView = async (workspaceSlug: string, projectId: string, viewId: string, viewPublishId: string) => {
    try {
      runInAction(() => {
        this.viewPublishGeneralLoader = true;
      });
      await this.viewPublishService.unpublishView(workspaceSlug, projectId, viewId, viewPublishId);
      runInAction(() => {
        unset(this.viewPublishSettingsMap, [viewId]);
        set(this.viewMap, [viewId, "anchor"], undefined);
        this.viewPublishGeneralLoader = false;
      });
    } catch (error) {
      runInAction(() => {
        this.viewPublishGeneralLoader = false;
      });
      throw error;
    }
  };
}
