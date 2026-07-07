/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Custom Fields / Work Item Properties — mote (Phase 1).
// Option model for SELECT / MULTI_SELECT properties. Mirrors the
// EstimatePoint model (core/store/estimates/estimate-point.ts).

import { set } from "lodash-es";
import { computed, makeObservable, observable } from "mobx";
// types
import type { TIssuePropertyOption } from "@/plane-web/types/issue-types";

export interface IPropertyOption extends TIssuePropertyOption {
  // computed
  asJson: TIssuePropertyOption;
  // helper actions
  updateOptionObject: (option: Partial<TIssuePropertyOption>) => void;
}

export class PropertyOption implements IPropertyOption {
  // data model observables
  id: string;
  workspace: string;
  project: string | null;
  property: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  is_default: boolean;
  parent: string | null;
  external_source: string | null;
  external_id: string | null;
  created_at: string | undefined;
  updated_at: string | undefined;
  created_by: string | null;
  updated_by: string | null;

  constructor(private data: TIssuePropertyOption) {
    makeObservable(this, {
      // data model observables
      id: observable.ref,
      workspace: observable.ref,
      project: observable.ref,
      property: observable.ref,
      name: observable.ref,
      sort_order: observable.ref,
      is_active: observable.ref,
      is_default: observable.ref,
      parent: observable.ref,
      external_source: observable.ref,
      external_id: observable.ref,
      created_at: observable.ref,
      updated_at: observable.ref,
      created_by: observable.ref,
      updated_by: observable.ref,
      // computed
      asJson: computed,
    });
    this.id = this.data.id;
    this.workspace = this.data.workspace;
    this.project = this.data.project;
    this.property = this.data.property;
    this.name = this.data.name;
    this.sort_order = this.data.sort_order;
    this.is_active = this.data.is_active;
    this.is_default = this.data.is_default;
    this.parent = this.data.parent;
    this.external_source = this.data.external_source;
    this.external_id = this.data.external_id;
    this.created_at = this.data.created_at;
    this.updated_at = this.data.updated_at;
    this.created_by = this.data.created_by;
    this.updated_by = this.data.updated_by;
  }

  // computed
  get asJson(): TIssuePropertyOption {
    return {
      id: this.id,
      workspace: this.workspace,
      project: this.project,
      property: this.property,
      name: this.name,
      sort_order: this.sort_order,
      is_active: this.is_active,
      is_default: this.is_default,
      parent: this.parent,
      external_source: this.external_source,
      external_id: this.external_id,
      created_at: this.created_at,
      updated_at: this.updated_at,
      created_by: this.created_by,
      updated_by: this.updated_by,
    };
  }

  // helper actions
  /**
   * @description update an option object in the local store
   * @param { Partial<TIssuePropertyOption> } option
   */
  updateOptionObject = (option: Partial<TIssuePropertyOption>) => {
    Object.keys(option).map((key) => {
      const optionKey = key as keyof TIssuePropertyOption;
      set(this, optionKey, option[optionKey]);
    });
  };
}
