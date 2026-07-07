/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Templates (work item + project templates) — mote.
// See docs/mote-design/03-work-item-power.md, section 2.
//
// Workspace-scoped CRUD store for templates, mirroring the simple workspace
// list store pattern (e.g. core/store/project-view.store.ts). Holds a flat map
// of templates keyed by id and tracks which workspaces have been fetched.

import { orderBy, set, unset } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// services
import templateService from "@/services/template.service";
// plane web types
import type { TTemplate } from "@/plane-web/types/templates";
// store
import type { CoreRootStore } from "@/store/root.store";

export interface ITemplateStore {
  // observables
  loader: boolean;
  templateMap: Record<string, TTemplate>;
  fetchedMap: Record<string, boolean>;
  // computed actions
  getTemplateById: (templateId: string) => TTemplate | undefined;
  getWorkItemTemplates: () => TTemplate[];
  getProjectTemplates: () => TTemplate[];
  // fetch actions
  fetchTemplates: (workspaceSlug: string) => Promise<TTemplate[] | undefined>;
  fetchTemplateById: (workspaceSlug: string, templateId: string) => Promise<TTemplate | undefined>;
  // CRUD actions
  createTemplate: (workspaceSlug: string, payload: Partial<TTemplate>) => Promise<TTemplate | undefined>;
  deleteTemplate: (workspaceSlug: string, templateId: string) => Promise<void>;
}

export class TemplateStore implements ITemplateStore {
  // observables
  loader: boolean = false;
  templateMap: Record<string, TTemplate> = {};
  fetchedMap: Record<string, boolean> = {};
  // root store
  rootStore: CoreRootStore;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      // observables
      loader: observable.ref,
      templateMap: observable,
      fetchedMap: observable,
      // fetch actions
      fetchTemplates: action,
      fetchTemplateById: action,
      // CRUD actions
      createTemplate: action,
      deleteTemplate: action,
    });
    this.rootStore = _rootStore;
  }

  /**
   * @description returns a single template by id
   */
  getTemplateById = computedFn((templateId: string) => this.templateMap?.[templateId] ?? undefined);

  /**
   * @description active work item templates, newest first
   */
  getWorkItemTemplates = computedFn(() =>
    orderBy(
      Object.values(this.templateMap ?? {}).filter(
        (template) => template.template_type === "work_item" && template.is_active
      ),
      ["created_at"],
      "desc"
    )
  );

  /**
   * @description active project templates, newest first
   */
  getProjectTemplates = computedFn(() =>
    orderBy(
      Object.values(this.templateMap ?? {}).filter(
        (template) => template.template_type === "project" && template.is_active
      ),
      ["created_at"],
      "desc"
    )
  );

  /**
   * @description fetches all templates for a workspace
   */
  fetchTemplates = async (workspaceSlug: string): Promise<TTemplate[] | undefined> => {
    try {
      this.loader = true;
      const response = await templateService.fetchTemplates(workspaceSlug);
      runInAction(() => {
        (response ?? []).forEach((template) => {
          set(this.templateMap, [template.id], template);
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
   * @description fetches a single template by id and stores it
   */
  fetchTemplateById = async (workspaceSlug: string, templateId: string): Promise<TTemplate | undefined> => {
    const response = await templateService.fetchTemplateById(workspaceSlug, templateId);
    if (response) {
      runInAction(() => {
        set(this.templateMap, [response.id], response);
      });
    }
    return response;
  };

  /**
   * @description creates a new template and adds it to the store
   */
  createTemplate = async (workspaceSlug: string, payload: Partial<TTemplate>): Promise<TTemplate | undefined> => {
    const response = await templateService.createTemplate(workspaceSlug, payload);
    if (response) {
      runInAction(() => {
        set(this.templateMap, [response.id], response);
      });
    }
    return response;
  };

  /**
   * @description soft-deletes a template and removes it from the store
   */
  deleteTemplate = async (workspaceSlug: string, templateId: string): Promise<void> => {
    await templateService.deleteTemplate(workspaceSlug, templateId);
    runInAction(() => {
      unset(this.templateMap, [templateId]);
    });
  };
}
