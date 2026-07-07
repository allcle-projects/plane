/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TFilterValue } from "../expression";
import type { TBaseFilterFieldConfig } from "./shared";

/**
 * Extended filter types
 *
 * Custom Fields — Phase 4 (mote.13): TEXT_INPUT backs the free-input controls
 * for TEXT / NUMBER / URL custom properties, which have no fixed option list and
 * so don't fit the core SINGLE_SELECT / MULTI_SELECT / DATE / DATE_RANGE types.
 * Consumed by apps/web/ce/components/rich-filters/filter-value-input/root.tsx
 * (core's FilterValueInput falls through to the CE component for any type it
 * doesn't recognize, so no core change is required).
 */
export const EXTENDED_FILTER_FIELD_TYPE = {
  TEXT_INPUT: "text_input",
} as const;

/**
 * Free-input filter configuration - for TEXT / NUMBER / URL custom properties.
 * - inputMode: which native input type to render (defaults to "text")
 */
export type TTextInputFilterFieldConfig<V extends TFilterValue> = TBaseFilterFieldConfig & {
  type: typeof EXTENDED_FILTER_FIELD_TYPE.TEXT_INPUT;
  defaultValue?: V;
  inputMode?: "text" | "number" | "url";
};

// -------- UNION TYPES --------

/**
 * All extended filter configurations
 */
export type TExtendedFilterFieldConfigs<V extends TFilterValue = TFilterValue> = TTextInputFilterFieldConfig<V>;
