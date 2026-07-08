/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Shared Pages — mote.
// See docs/mote-design/02-wiki-publishing.md, Feature 3.
//
// This is the per-page silo extension point: every `BasePage` instance
// (`core/store/pages/base-page.ts`) extends this class, so any observable or
// action declared here is available on every page instance at runtime.

import { action, computed, makeObservable, observable, runInAction } from "mobx";
// plane imports
import type { TPage, TPageExtended } from "@plane/types";
// plane web services
import { PageCollaboratorService } from "@/services/page/page-collaborator.service";
// plane web types
import type { TPageCollaborator, TPageCollaboratorRole } from "@/plane-web/types/page-collaborators";
import type { RootStore } from "@/plane-web/store/root.store";
// store
import type { TBasePageServices } from "@/store/pages/base-page";

export type TExtendedPageInstance = TPageExtended & {
  // observables
  collaborators: TPageCollaborator[];
  // actions
  fetchCollaborators: () => Promise<TPageCollaborator[] | undefined>;
  addCollaborator: (member: string, role: TPageCollaboratorRole) => Promise<TPageCollaborator | undefined>;
  updateCollaboratorRole: (member: string, role: TPageCollaboratorRole) => Promise<void>;
  removeCollaborator: (member: string) => Promise<void>;
  // computed
  asJSONExtended: TPageExtended & {
    collaborators: TPageCollaborator[];
  };
};

export class ExtendedBasePage implements TExtendedPageInstance {
  // observables
  collaborators: TPageCollaborator[] = [];
  // the page id, captured directly from the constructor's `page` argument
  // (`BasePage` only assigns `this.id` *after* calling `super()`)
  private pageId: string | undefined;
  // services
  private collaboratorService: PageCollaboratorService;
  // root store
  private rootStore: RootStore;

  constructor(store: RootStore, page: TPage, _services: TBasePageServices) {
    this.rootStore = store;
    this.pageId = page?.id || undefined;
    this.collaboratorService = new PageCollaboratorService();

    makeObservable(this, {
      // observables
      collaborators: observable,
      // computed
      asJSONExtended: computed,
      // actions
      fetchCollaborators: action,
      addCollaborator: action,
      updateCollaboratorRole: action,
      removeCollaborator: action,
    });
  }

  get asJSONExtended(): TExtendedPageInstance["asJSONExtended"] {
    return {
      collaborators: this.collaborators,
    };
  }

  /**
   * @description fetch the list of collaborators for this page
   */
  fetchCollaborators = async () => {
    const workspaceSlug = this.rootStore.router.workspaceSlug;
    if (!workspaceSlug || !this.pageId) return undefined;

    const collaborators = await this.collaboratorService.list(workspaceSlug, this.pageId);
    runInAction(() => {
      this.collaborators = collaborators;
    });
    return collaborators;
  };

  /**
   * @description share this page with a workspace member at the given role.
   * The backend upserts on (page, member), so re-adding an existing
   * collaborator simply updates their role.
   */
  addCollaborator = async (member: string, role: TPageCollaboratorRole) => {
    const workspaceSlug = this.rootStore.router.workspaceSlug;
    if (!workspaceSlug || !this.pageId) return undefined;

    const collaborator = await this.collaboratorService.create(workspaceSlug, this.pageId, { member, role });
    runInAction(() => {
      const existingIndex = this.collaborators.findIndex((c) => c.member === collaborator.member);
      if (existingIndex >= 0) this.collaborators[existingIndex] = collaborator;
      else this.collaborators.push(collaborator);
    });
    return collaborator;
  };

  /**
   * @description update an existing collaborator's role
   */
  updateCollaboratorRole = async (member: string, role: TPageCollaboratorRole) => {
    const workspaceSlug = this.rootStore.router.workspaceSlug;
    if (!workspaceSlug || !this.pageId) return;

    const updated = await this.collaboratorService.updateRole(workspaceSlug, this.pageId, member, { role });
    runInAction(() => {
      const existingIndex = this.collaborators.findIndex((c) => c.member === member);
      if (existingIndex >= 0) this.collaborators[existingIndex] = updated;
    });
  };

  /**
   * @description remove a collaborator's access to this page
   */
  removeCollaborator = async (member: string) => {
    const workspaceSlug = this.rootStore.router.workspaceSlug;
    if (!workspaceSlug || !this.pageId) return;

    await this.collaboratorService.remove(workspaceSlug, this.pageId, member);
    runInAction(() => {
      this.collaborators = this.collaborators.filter((c) => c.member !== member);
    });
  };
}
