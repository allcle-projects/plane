/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Custom Fields / Work Item Properties — mote (Phase 1).
// Definition store: work item types -> property definitions -> options.
// Mirrors ProjectEstimateStore (core/store/estimates/project-estimate.store.ts):
// the collection store owns fetch + CRUD and writes into the nested model maps.

import { orderBy, set, unset } from "lodash-es";
import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// types
import type {
  TIssueProperty,
  TIssuePropertyOption,
  TIssueType,
  TProjectIssueType,
} from "@/plane-web/types/issue-types";
// plane web services
import issueTypeService from "@/services/issue-type.service";
// plane web store
import type { IWorkItemType } from "@/plane-web/store/issue-types/work-item-type";
import { WorkItemType } from "@/plane-web/store/issue-types/work-item-type";
// store
import type { CoreRootStore } from "../root.store";

type TWorkItemTypeLoader = "init-loader" | "mutation-loader" | undefined;
type TErrorCodes = {
  status: string;
  message?: string;
};

export interface IWorkItemTypeStore {
  // observables
  loader: TWorkItemTypeLoader;
  workItemTypes: Record<string, IWorkItemType>;
  error: TErrorCodes | undefined;
  // computed
  workItemTypeIds: string[];
  // computed fn
  getWorkItemTypeById: (workItemTypeId: string) => IWorkItemType | undefined;
  // type actions
  fetchWorkItemTypes: (workspaceSlug: string, loader?: TWorkItemTypeLoader) => Promise<TIssueType[] | undefined>;
  createWorkItemType: (workspaceSlug: string, payload: Partial<TIssueType>) => Promise<TIssueType | undefined>;
  updateWorkItemType: (
    workspaceSlug: string,
    workItemTypeId: string,
    payload: Partial<TIssueType>
  ) => Promise<TIssueType | undefined>;
  deleteWorkItemType: (workspaceSlug: string, workItemTypeId: string) => Promise<void>;
  // property actions
  fetchProperties: (workspaceSlug: string, workItemTypeId: string) => Promise<TIssueProperty[] | undefined>;
  createProperty: (
    workspaceSlug: string,
    workItemTypeId: string,
    payload: Partial<TIssueProperty>
  ) => Promise<TIssueProperty | undefined>;
  updateProperty: (
    workspaceSlug: string,
    workItemTypeId: string,
    propertyId: string,
    payload: Partial<TIssueProperty>
  ) => Promise<TIssueProperty | undefined>;
  deleteProperty: (workspaceSlug: string, workItemTypeId: string, propertyId: string) => Promise<void>;
  // option actions
  fetchOptions: (
    workspaceSlug: string,
    workItemTypeId: string,
    propertyId: string
  ) => Promise<TIssuePropertyOption[] | undefined>;
  createOption: (
    workspaceSlug: string,
    workItemTypeId: string,
    propertyId: string,
    payload: Partial<TIssuePropertyOption>
  ) => Promise<TIssuePropertyOption | undefined>;
  updateOption: (
    workspaceSlug: string,
    workItemTypeId: string,
    propertyId: string,
    optionId: string,
    payload: Partial<TIssuePropertyOption>
  ) => Promise<TIssuePropertyOption | undefined>;
  deleteOption: (
    workspaceSlug: string,
    workItemTypeId: string,
    propertyId: string,
    optionId: string
  ) => Promise<void>;
  // project link actions (which types a project may use)
  fetchProjectIssueTypes: (
    workspaceSlug: string,
    projectId: string
  ) => Promise<TProjectIssueType[] | undefined>;
  linkProjectIssueType: (
    workspaceSlug: string,
    projectId: string,
    workItemTypeId: string
  ) => Promise<TProjectIssueType | undefined>;
  unlinkProjectIssueType: (
    workspaceSlug: string,
    projectId: string,
    projectIssueTypeId: string
  ) => Promise<void>;
}

export class WorkItemTypeStore implements IWorkItemTypeStore {
  // observables
  loader: TWorkItemTypeLoader = undefined;
  workItemTypes: Record<string, IWorkItemType> = {}; // work_item_type_id -> work item type
  error: TErrorCodes | undefined = undefined;

  constructor(private store: CoreRootStore) {
    makeObservable(this, {
      // observables
      loader: observable.ref,
      workItemTypes: observable,
      error: observable,
      // computed
      workItemTypeIds: computed,
      // type actions
      fetchWorkItemTypes: action,
      createWorkItemType: action,
      updateWorkItemType: action,
      deleteWorkItemType: action,
      // property actions
      fetchProperties: action,
      createProperty: action,
      updateProperty: action,
      deleteProperty: action,
      // option actions
      fetchOptions: action,
      createOption: action,
      updateOption: action,
      deleteOption: action,
      // project link actions
      fetchProjectIssueTypes: action,
      linkProjectIssueType: action,
      unlinkProjectIssueType: action,
    });
  }

  // computed
  /**
   * @description all work item type ids, ordered by level
   */
  get workItemTypeIds(): string[] {
    const workItemTypes = orderBy(Object.values(this.workItemTypes ?? {}), ["level"], "asc");
    return workItemTypes.map((workItemType) => workItemType.id);
  }

  // computed fn
  getWorkItemTypeById = computedFn((workItemTypeId: string) => {
    if (!workItemTypeId) return undefined;
    return this.workItemTypes[workItemTypeId] ?? undefined;
  });

  // ------------------------------------------------------------- type actions
  /**
   * @description fetch all work item types for a workspace
   */
  fetchWorkItemTypes = async (
    workspaceSlug: string,
    loader: TWorkItemTypeLoader = "mutation-loader"
  ): Promise<TIssueType[] | undefined> => {
    try {
      this.error = undefined;
      if (Object.keys(this.workItemTypes ?? {}).length <= 0) this.loader = loader ? loader : "init-loader";

      const workItemTypes = await issueTypeService.fetchIssueTypes(workspaceSlug);
      runInAction(() => {
        if (workItemTypes) {
          workItemTypes.forEach((workItemType) => {
            if (workItemType.id) set(this.workItemTypes, [workItemType.id], new WorkItemType(workItemType));
          });
        }
        this.loader = undefined;
      });

      return workItemTypes;
    } catch (error) {
      this.loader = undefined;
      this.error = { status: "error", message: "Error fetching work item types" };
      throw error;
    }
  };

  /**
   * @description create a work item type
   */
  createWorkItemType = async (
    workspaceSlug: string,
    payload: Partial<TIssueType>
  ): Promise<TIssueType | undefined> => {
    try {
      this.error = undefined;
      const workItemType = await issueTypeService.createIssueType(workspaceSlug, payload);
      runInAction(() => {
        if (workItemType?.id) set(this.workItemTypes, [workItemType.id], new WorkItemType(workItemType));
      });
      return workItemType;
    } catch (error) {
      this.error = { status: "error", message: "Error creating work item type" };
      throw error;
    }
  };

  /**
   * @description update a work item type
   */
  updateWorkItemType = async (
    workspaceSlug: string,
    workItemTypeId: string,
    payload: Partial<TIssueType>
  ): Promise<TIssueType | undefined> => {
    try {
      this.error = undefined;
      const workItemType = await issueTypeService.updateIssueType(workspaceSlug, workItemTypeId, payload);
      runInAction(() => {
        if (workItemType) this.workItemTypes[workItemTypeId]?.updateWorkItemTypeObject(workItemType);
      });
      return workItemType;
    } catch (error) {
      this.error = { status: "error", message: "Error updating work item type" };
      throw error;
    }
  };

  /**
   * @description delete a work item type
   */
  deleteWorkItemType = async (workspaceSlug: string, workItemTypeId: string): Promise<void> => {
    try {
      await issueTypeService.deleteIssueType(workspaceSlug, workItemTypeId);
      runInAction(() => workItemTypeId && unset(this.workItemTypes, [workItemTypeId]));
    } catch (error) {
      this.error = { status: "error", message: "Error deleting work item type" };
      throw error;
    }
  };

  // --------------------------------------------------------- property actions
  /**
   * @description fetch all property definitions for a work item type
   */
  fetchProperties = async (
    workspaceSlug: string,
    workItemTypeId: string
  ): Promise<TIssueProperty[] | undefined> => {
    try {
      this.error = undefined;
      const properties = await issueTypeService.fetchIssueProperties(workspaceSlug, workItemTypeId);
      runInAction(() => {
        const workItemType = this.workItemTypes[workItemTypeId];
        if (workItemType && properties) {
          properties.forEach((property) => workItemType.addOrUpdateProperty(property));
        }
      });
      return properties;
    } catch (error) {
      this.error = { status: "error", message: "Error fetching properties" };
      throw error;
    }
  };

  /**
   * @description create a property definition on a work item type
   */
  createProperty = async (
    workspaceSlug: string,
    workItemTypeId: string,
    payload: Partial<TIssueProperty>
  ): Promise<TIssueProperty | undefined> => {
    try {
      this.error = undefined;
      const property = await issueTypeService.createIssueProperty(workspaceSlug, workItemTypeId, payload);
      runInAction(() => {
        if (property) this.workItemTypes[workItemTypeId]?.addOrUpdateProperty(property);
      });
      return property;
    } catch (error) {
      this.error = { status: "error", message: "Error creating property" };
      throw error;
    }
  };

  /**
   * @description update a property definition
   */
  updateProperty = async (
    workspaceSlug: string,
    workItemTypeId: string,
    propertyId: string,
    payload: Partial<TIssueProperty>
  ): Promise<TIssueProperty | undefined> => {
    try {
      this.error = undefined;
      const property = await issueTypeService.updateIssueProperty(
        workspaceSlug,
        workItemTypeId,
        propertyId,
        payload
      );
      runInAction(() => {
        if (property) this.workItemTypes[workItemTypeId]?.propertyById(propertyId)?.updateIssuePropertyObject(property);
      });
      return property;
    } catch (error) {
      this.error = { status: "error", message: "Error updating property" };
      throw error;
    }
  };

  /**
   * @description delete a property definition
   */
  deleteProperty = async (workspaceSlug: string, workItemTypeId: string, propertyId: string): Promise<void> => {
    try {
      await issueTypeService.deleteIssueProperty(workspaceSlug, workItemTypeId, propertyId);
      runInAction(() => this.workItemTypes[workItemTypeId]?.removeProperty(propertyId));
    } catch (error) {
      this.error = { status: "error", message: "Error deleting property" };
      throw error;
    }
  };

  // ----------------------------------------------------------- option actions
  /**
   * @description fetch all options for a property
   */
  fetchOptions = async (
    workspaceSlug: string,
    workItemTypeId: string,
    propertyId: string
  ): Promise<TIssuePropertyOption[] | undefined> => {
    try {
      this.error = undefined;
      const options = await issueTypeService.fetchPropertyOptions(workspaceSlug, workItemTypeId, propertyId);
      runInAction(() => {
        const property = this.workItemTypes[workItemTypeId]?.propertyById(propertyId);
        if (property && options) options.forEach((option) => property.addOrUpdateOption(option));
      });
      return options;
    } catch (error) {
      this.error = { status: "error", message: "Error fetching options" };
      throw error;
    }
  };

  /**
   * @description create an option on a property
   */
  createOption = async (
    workspaceSlug: string,
    workItemTypeId: string,
    propertyId: string,
    payload: Partial<TIssuePropertyOption>
  ): Promise<TIssuePropertyOption | undefined> => {
    try {
      this.error = undefined;
      const option = await issueTypeService.createPropertyOption(workspaceSlug, workItemTypeId, propertyId, payload);
      runInAction(() => {
        if (option) this.workItemTypes[workItemTypeId]?.propertyById(propertyId)?.addOrUpdateOption(option);
      });
      return option;
    } catch (error) {
      this.error = { status: "error", message: "Error creating option" };
      throw error;
    }
  };

  /**
   * @description update an option
   */
  updateOption = async (
    workspaceSlug: string,
    workItemTypeId: string,
    propertyId: string,
    optionId: string,
    payload: Partial<TIssuePropertyOption>
  ): Promise<TIssuePropertyOption | undefined> => {
    try {
      this.error = undefined;
      const option = await issueTypeService.updatePropertyOption(
        workspaceSlug,
        workItemTypeId,
        propertyId,
        optionId,
        payload
      );
      runInAction(() => {
        if (option) this.workItemTypes[workItemTypeId]?.propertyById(propertyId)?.addOrUpdateOption(option);
      });
      return option;
    } catch (error) {
      this.error = { status: "error", message: "Error updating option" };
      throw error;
    }
  };

  /**
   * @description delete an option
   */
  deleteOption = async (
    workspaceSlug: string,
    workItemTypeId: string,
    propertyId: string,
    optionId: string
  ): Promise<void> => {
    try {
      await issueTypeService.deletePropertyOption(workspaceSlug, workItemTypeId, propertyId, optionId);
      runInAction(() => this.workItemTypes[workItemTypeId]?.propertyById(propertyId)?.removeOption(optionId));
    } catch (error) {
      this.error = { status: "error", message: "Error deleting option" };
      throw error;
    }
  };

  // ----------------------------------------------------- project link actions
  // These rows are project-scoped, not workspace-scoped, so they are not held
  // in the workItemTypes map; the modal owns the transient link state.
  /**
   * @description fetch the work item types enabled on a project
   */
  fetchProjectIssueTypes = async (
    workspaceSlug: string,
    projectId: string
  ): Promise<TProjectIssueType[] | undefined> => {
    try {
      this.error = undefined;
      return await issueTypeService.fetchProjectIssueTypes(workspaceSlug, projectId);
    } catch (error) {
      this.error = { status: "error", message: "Error fetching project work item types" };
      throw error;
    }
  };

  /**
   * @description enable a work item type on a project
   */
  linkProjectIssueType = async (
    workspaceSlug: string,
    projectId: string,
    workItemTypeId: string
  ): Promise<TProjectIssueType | undefined> => {
    try {
      this.error = undefined;
      return await issueTypeService.linkProjectIssueType(workspaceSlug, projectId, workItemTypeId);
    } catch (error) {
      this.error = { status: "error", message: "Error linking work item type to project" };
      throw error;
    }
  };

  /**
   * @description disable a work item type on a project
   */
  unlinkProjectIssueType = async (
    workspaceSlug: string,
    projectId: string,
    projectIssueTypeId: string
  ): Promise<void> => {
    try {
      this.error = undefined;
      await issueTypeService.unlinkProjectIssueType(workspaceSlug, projectId, projectIssueTypeId);
    } catch (error) {
      this.error = { status: "error", message: "Error unlinking work item type from project" };
      throw error;
    }
  };
}
