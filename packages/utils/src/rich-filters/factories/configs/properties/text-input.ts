/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Custom Fields — Phase 4 (mote.13). Free-input property filter: backs TEXT /
// NUMBER / URL custom properties, which have no fixed option list and so can't
// use getOptionPickerPropertyFilterConfig (./select-picker.ts). Builds the
// extended TEXT_INPUT field config directly (see
// @plane/types rich-filters/field-types/extended.ts) since
// createFilterFieldConfig (../shared.ts) only covers the core field types.
// Rendered by apps/web/ce/components/rich-filters/filter-value-input/root.tsx.

// plane imports
import type { TFilterProperty, TFilterValue, TTextInputFilterFieldConfig } from "@plane/types";
import { EQUALITY_OPERATOR, EXTENDED_FILTER_FIELD_TYPE } from "@plane/types";
// local imports
import type { TCreateFilterConfig, TFilterIconType } from "../shared";
import { createFilterConfig, createOperatorConfigEntry } from "../shared";
import type { TCustomPropertyFilterParams } from "./shared";

/**
 * Text-input property filter specific params
 */
export type TCreateTextInputPropertyFilterParams<T extends TFilterIconType = undefined> =
  TCustomPropertyFilterParams<T> & {
    inputMode?: "text" | "number" | "url";
  };

/**
 * Get the text-input property filter config (TEXT / NUMBER / URL custom properties).
 * @param key - The filter key to use (`customproperty_<property_id>`)
 * @returns A function that takes parameters and returns the text-input property filter config
 */
export const getTextInputPropertyFilterConfig =
  <P extends TFilterProperty>(key: P): TCreateFilterConfig<P, TCreateTextInputPropertyFilterParams> =>
  (params: TCreateTextInputPropertyFilterParams) =>
    createFilterConfig<P>({
      id: key,
      ...params,
      label: params.propertyDisplayName,
      icon: params.filterIcon,
      supportedOperatorConfigsMap: new Map([
        createOperatorConfigEntry(EQUALITY_OPERATOR.EXACT, params, (updatedParams) => {
          const fieldConfig: TTextInputFilterFieldConfig<TFilterValue> = {
            ...updatedParams,
            type: EXTENDED_FILTER_FIELD_TYPE.TEXT_INPUT,
          };
          return fieldConfig;
        }),
      ]),
    });
