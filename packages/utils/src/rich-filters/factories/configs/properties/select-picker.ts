/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Custom Fields — Phase 4 (mote.13). Generic option-picker property filter:
// backs SELECT / MULTI_SELECT custom properties (options come from the property
// definition) and BOOLEAN custom properties (options are the two static
// true/false entries built by the caller). Mirrors getLabelFilterConfig /
// getProjectMultiSelectConfig (../../filters/label.ts, ../../filters/shared.ts),
// generic over any pre-shaped `IFilterOption`-like item so this package doesn't
// need to know about `IIssueProperty` (owned by apps/web/ce).

// plane imports
import type { TFilterProperty, TFilterValue } from "@plane/types";
import { EQUALITY_OPERATOR, COLLECTION_OPERATOR } from "@plane/types";
// local imports
import { getMultiSelectConfig } from "../core";
import type { TCreateFilterConfig, TFilterIconType } from "../shared";
import { createFilterConfig, createOperatorConfigEntry } from "../shared";
import type { TCustomPropertyFilterParams } from "./shared";

/**
 * A single pre-shaped option for a custom-property select/multi-select/boolean filter.
 */
export type TCustomPropertyFilterOption<V extends TFilterValue = string> = {
  id: string;
  label: string;
  value: V;
};

/**
 * Option-picker property filter specific params
 */
export type TCreateOptionPickerPropertyFilterParams<
  V extends TFilterValue = string,
  T extends TFilterIconType = undefined,
> = TCustomPropertyFilterParams<T> & {
  options: TCustomPropertyFilterOption<V>[];
};

/**
 * Get the option-picker property filter config (SELECT / MULTI_SELECT / BOOLEAN
 * custom properties).
 * @param key - The filter key to use (`customproperty_<property_id>`)
 * @returns A function that takes parameters and returns the option-picker property filter config
 */
export const getOptionPickerPropertyFilterConfig =
  <P extends TFilterProperty, V extends TFilterValue = string>(
    key: P
  ): TCreateFilterConfig<P, TCreateOptionPickerPropertyFilterParams<V>> =>
  (params: TCreateOptionPickerPropertyFilterParams<V>) =>
    createFilterConfig<P>({
      id: key,
      ...params,
      label: params.propertyDisplayName,
      icon: params.filterIcon,
      supportedOperatorConfigsMap: new Map([
        createOperatorConfigEntry(COLLECTION_OPERATOR.IN, params, (updatedParams) =>
          getMultiSelectConfig<TCustomPropertyFilterOption<V>, V, undefined>(
            {
              items: params.options,
              getId: (option) => option.id,
              getLabel: (option) => option.label,
              getValue: (option) => option.value,
            },
            {
              singleValueOperator: EQUALITY_OPERATOR.EXACT,
              ...updatedParams,
            }
          )
        ),
      ]),
    });
