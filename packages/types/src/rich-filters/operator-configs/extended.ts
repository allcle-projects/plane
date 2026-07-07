/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TFilterValue } from "../expression";
import type { TTextInputFilterFieldConfig } from "../field-types";

// ----------------------------- EXACT Operator -----------------------------
// Custom Fields — Phase 4 (mote.13): TEXT / NUMBER / URL custom properties use
// the EXACT operator with the extended TEXT_INPUT field type (see
// ../field-types/extended.ts).
export type TExtendedExactOperatorConfigs = TTextInputFilterFieldConfig<TFilterValue>;

// ----------------------------- IN Operator -----------------------------
export type TExtendedInOperatorConfigs = never;

// ----------------------------- RANGE Operator -----------------------------
export type TExtendedRangeOperatorConfigs = never;

// ----------------------------- Extended Operator Specific Configs -----------------------------
export type TExtendedOperatorSpecificConfigs = unknown;
