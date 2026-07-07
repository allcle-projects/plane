/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Custom Fields / Work Item Properties — mote (Phase 1).
// Work item type (IssueType) definition model. Holds its property definitions,
// mirroring the Estimate model (ce/store/estimates/estimate.ts) which holds
// its estimate points.

import { orderBy, set } from "lodash-es";
import { computed, makeObservable, observable } from "mobx";
import { computedFn } from "mobx-utils";
// types
import type { TIssueProperty, TIssueType } from "@/plane-web/types/issue-types";
// store
import type { IIssueProperty } from "./issue-property";
import { IssueProperty } from "./issue-property";

export interface IWorkItemType extends TIssueType {
  // observables
  properties: Record<string, IIssueProperty>;
  // computed
  asJson: TIssueType;
  propertyIds: string[];
  propertyById: (propertyId: string) => IIssueProperty | undefined;
  // helper actions
  updateWorkItemTypeObject: (workItemType: Partial<TIssueType>) => void;
  addOrUpdateProperty: (property: TIssueProperty) => void;
  removeProperty: (propertyId: string) => void;
}

export class WorkItemType implements IWorkItemType {
  // data model observables
  id: string;
  workspace: string;
  name: string;
  description: string;
  logo_props: Record<string, unknown>;
  is_epic: boolean;
  is_default: boolean;
  is_active: boolean;
  level: number;
  external_source: string | null;
  external_id: string | null;
  created_at: string | undefined;
  updated_at: string | undefined;
  created_by: string | null;
  updated_by: string | null;
  // observables
  properties: Record<string, IIssueProperty> = {};

  constructor(private data: TIssueType) {
    makeObservable(this, {
      // data model observables
      id: observable.ref,
      workspace: observable.ref,
      name: observable.ref,
      description: observable.ref,
      logo_props: observable,
      is_epic: observable.ref,
      is_default: observable.ref,
      is_active: observable.ref,
      level: observable.ref,
      external_source: observable.ref,
      external_id: observable.ref,
      created_at: observable.ref,
      updated_at: observable.ref,
      created_by: observable.ref,
      updated_by: observable.ref,
      // observables
      properties: observable,
      // computed
      asJson: computed,
      propertyIds: computed,
    });
    this.id = this.data.id;
    this.workspace = this.data.workspace;
    this.name = this.data.name;
    this.description = this.data.description;
    this.logo_props = this.data.logo_props ?? {};
    this.is_epic = this.data.is_epic;
    this.is_default = this.data.is_default;
    this.is_active = this.data.is_active;
    this.level = this.data.level;
    this.external_source = this.data.external_source;
    this.external_id = this.data.external_id;
    this.created_at = this.data.created_at;
    this.updated_at = this.data.updated_at;
    this.created_by = this.data.created_by;
    this.updated_by = this.data.updated_by;
  }

  // computed
  get asJson(): TIssueType {
    return {
      id: this.id,
      workspace: this.workspace,
      name: this.name,
      description: this.description,
      logo_props: this.logo_props,
      is_epic: this.is_epic,
      is_default: this.is_default,
      is_active: this.is_active,
      level: this.level,
      external_source: this.external_source,
      external_id: this.external_id,
      created_at: this.created_at,
      updated_at: this.updated_at,
      created_by: this.created_by,
      updated_by: this.updated_by,
    };
  }

  get propertyIds(): string[] {
    const properties = orderBy(Object.values(this.properties ?? {}), ["sort_order"], "asc");
    return properties.map((property) => property.id);
  }

  propertyById = computedFn((propertyId: string) => {
    if (!propertyId) return undefined;
    return this.properties[propertyId] ?? undefined;
  });

  // helper actions
  /**
   * @description update a work item type object in the local store
   * @param { Partial<TIssueType> } workItemType
   */
  updateWorkItemTypeObject = (workItemType: Partial<TIssueType>) => {
    Object.keys(workItemType).map((key) => {
      const workItemTypeKey = key as keyof TIssueType;
      set(this, workItemTypeKey, workItemType[workItemTypeKey]);
    });
  };

  /**
   * @description add or replace a property in the local store
   * @param { TIssueProperty } property
   */
  addOrUpdateProperty = (property: TIssueProperty) => {
    if (property.id) set(this.properties, [property.id], new IssueProperty(property));
  };

  /**
   * @description remove a property from the local store
   * @param { string } propertyId
   */
  removeProperty = (propertyId: string) => {
    if (propertyId && this.properties[propertyId]) delete this.properties[propertyId];
  };
}
