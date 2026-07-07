/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Custom Fields / Work Item Properties — mote (Phase 1).
// Property definition model. Holds its SELECT / MULTI_SELECT options, mirroring
// the way the Estimate model (ce/store/estimates/estimate.ts) holds points.

import { orderBy, set } from "lodash-es";
import { computed, makeObservable, observable } from "mobx";
import { computedFn } from "mobx-utils";
// types
import type { EIssuePropertyType, TIssueProperty, TIssuePropertyOption } from "@/plane-web/types/issue-types";
// store
import type { IPropertyOption } from "./property-option";
import { PropertyOption } from "./property-option";

export interface IIssueProperty extends Omit<TIssueProperty, "options"> {
  // observables
  options: Record<string, IPropertyOption>;
  // computed
  asJson: Omit<TIssueProperty, "options">;
  optionIds: string[];
  optionById: (optionId: string) => IPropertyOption | undefined;
  // helper actions
  updateIssuePropertyObject: (property: Partial<TIssueProperty>) => void;
  addOrUpdateOption: (option: TIssuePropertyOption) => void;
  removeOption: (optionId: string) => void;
}

export class IssueProperty implements IIssueProperty {
  // data model observables
  id: string;
  workspace: string;
  project: string | null;
  issue_type: string;
  name: string;
  display_name: string;
  description: string;
  property_type: EIssuePropertyType;
  relation_type: string | null;
  is_required: boolean;
  is_active: boolean;
  is_multi: boolean;
  default_value: string[];
  settings: Record<string, unknown>;
  sort_order: number;
  external_source: string | null;
  external_id: string | null;
  created_at: string | undefined;
  updated_at: string | undefined;
  created_by: string | null;
  updated_by: string | null;
  // observables
  options: Record<string, IPropertyOption> = {};

  constructor(private data: TIssueProperty) {
    makeObservable(this, {
      // data model observables
      id: observable.ref,
      workspace: observable.ref,
      project: observable.ref,
      issue_type: observable.ref,
      name: observable.ref,
      display_name: observable.ref,
      description: observable.ref,
      property_type: observable.ref,
      relation_type: observable.ref,
      is_required: observable.ref,
      is_active: observable.ref,
      is_multi: observable.ref,
      default_value: observable,
      settings: observable,
      sort_order: observable.ref,
      external_source: observable.ref,
      external_id: observable.ref,
      created_at: observable.ref,
      updated_at: observable.ref,
      created_by: observable.ref,
      updated_by: observable.ref,
      // observables
      options: observable,
      // computed
      asJson: computed,
      optionIds: computed,
    });
    this.id = this.data.id;
    this.workspace = this.data.workspace;
    this.project = this.data.project;
    this.issue_type = this.data.issue_type;
    this.name = this.data.name;
    this.display_name = this.data.display_name;
    this.description = this.data.description;
    this.property_type = this.data.property_type;
    this.relation_type = this.data.relation_type;
    this.is_required = this.data.is_required;
    this.is_active = this.data.is_active;
    this.is_multi = this.data.is_multi;
    this.default_value = this.data.default_value ?? [];
    this.settings = this.data.settings ?? {};
    this.sort_order = this.data.sort_order;
    this.external_source = this.data.external_source;
    this.external_id = this.data.external_id;
    this.created_at = this.data.created_at;
    this.updated_at = this.data.updated_at;
    this.created_by = this.data.created_by;
    this.updated_by = this.data.updated_by;
    this.data.options?.forEach((option) => {
      if (option.id) set(this.options, [option.id], new PropertyOption(option));
    });
  }

  // computed
  get asJson(): Omit<TIssueProperty, "options"> {
    return {
      id: this.id,
      workspace: this.workspace,
      project: this.project,
      issue_type: this.issue_type,
      name: this.name,
      display_name: this.display_name,
      description: this.description,
      property_type: this.property_type,
      relation_type: this.relation_type,
      is_required: this.is_required,
      is_active: this.is_active,
      is_multi: this.is_multi,
      default_value: this.default_value,
      settings: this.settings,
      sort_order: this.sort_order,
      external_source: this.external_source,
      external_id: this.external_id,
      created_at: this.created_at,
      updated_at: this.updated_at,
      created_by: this.created_by,
      updated_by: this.updated_by,
    };
  }

  get optionIds(): string[] {
    const options = orderBy(Object.values(this.options ?? {}), ["sort_order"], "asc");
    return options.map((option) => option.id);
  }

  optionById = computedFn((optionId: string) => {
    if (!optionId) return undefined;
    return this.options[optionId] ?? undefined;
  });

  // helper actions
  /**
   * @description update a property object in the local store
   * @param { Partial<TIssueProperty> } property
   */
  updateIssuePropertyObject = (property: Partial<TIssueProperty>) => {
    Object.keys(property).map((key) => {
      const propertyKey = key as keyof TIssueProperty;
      if (propertyKey === "options") return;
      set(this, propertyKey, property[propertyKey]);
    });
  };

  /**
   * @description add or replace an option in the local store
   * @param { TIssuePropertyOption } option
   */
  addOrUpdateOption = (option: TIssuePropertyOption) => {
    if (option.id) set(this.options, [option.id], new PropertyOption(option));
  };

  /**
   * @description remove an option from the local store
   * @param { string } optionId
   */
  removeOption = (optionId: string) => {
    if (optionId && this.options[optionId]) delete this.options[optionId];
  };
}
