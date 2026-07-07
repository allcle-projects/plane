/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Custom Fields — Phase 4 (mote.13). Shared helper for extracting
// `customproperty_<property_id>` conditions out of a work item rich-filter
// expression (the external, persisted wire shape — `{ and: [{ "<key>": value }] }`
// — not the internal FilterExpression tree used by @plane/shared-state).
//
// Consumed by:
// - apps/web/core/store/issue/helpers/issue-filter-helper.store.ts
//   (computedFilteredParams): strips these conditions out of the JSON sent as
//   `?filters=` and re-emits them as top-level `?property_<property_id>=` params
//   to match the backend contract (apps/api/plane/utils/issue_filters.py
//   custom_property_filters).
// - apps/web/ce/hooks/work-item-filters/use-work-item-filters-config.tsx:
//   counts how many distinct custom properties already have an active filter
//   condition, to enforce the 5-filter cap client-side.

import { LOGICAL_OPERATOR } from "@plane/types";
import type { TWorkItemFilterExpression } from "@plane/types";

/** Prefix used for custom-property condition keys inside the rich-filter expression. */
export const CUSTOM_PROPERTY_FILTER_CONDITION_PREFIX = "customproperty_";

/** Max simultaneous custom-property filters — mirrors the backend cap exactly
 * (apps/api/plane/utils/issue_filters.py MAX_CUSTOM_PROPERTY_FILTERS). */
export const MAX_CUSTOM_PROPERTY_FILTERS = 5;

const getConditionPropertyKey = (conditionKey: string): string => {
  const lastDoubleUnderscoreIndex = conditionKey.lastIndexOf("__");
  return lastDoubleUnderscoreIndex > 0 ? conditionKey.substring(0, lastDoubleUnderscoreIndex) : conditionKey;
};

const isCustomPropertyConditionKey = (conditionKey: string): boolean =>
  getConditionPropertyKey(conditionKey).startsWith(CUSTOM_PROPERTY_FILTER_CONDITION_PREFIX);

/**
 * Returns the set of distinct custom property ids that currently have an active
 * filter condition in the given rich-filter expression.
 */
export const getActiveCustomPropertyFilterIds = (
  expression: TWorkItemFilterExpression | undefined
): Set<string> => {
  const propertyIds = new Set<string>();
  if (!expression || typeof expression !== "object") return propertyIds;

  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    const obj = node as Record<string, unknown>;

    if (LOGICAL_OPERATOR.AND in obj && Array.isArray(obj[LOGICAL_OPERATOR.AND])) {
      (obj[LOGICAL_OPERATOR.AND] as unknown[]).forEach(walk);
      return;
    }

    Object.keys(obj).forEach((conditionKey) => {
      if (isCustomPropertyConditionKey(conditionKey)) {
        propertyIds.add(getConditionPropertyKey(conditionKey).substring(CUSTOM_PROPERTY_FILTER_CONDITION_PREFIX.length));
      }
    });
  };

  walk(expression);
  return propertyIds;
};

/**
 * Splits a rich-filter expression into:
 * - `cleanedExpression`: the same expression with all `customproperty_*`
 *   conditions removed (safe to `JSON.stringify` and send as `?filters=`).
 * - `customPropertyParams`: a `{ property_id: value }` map of the extracted
 *   conditions' raw values (already comma-joined for multi-value operators,
 *   matching the backend's GET param parsing exactly).
 */
export const extractCustomPropertyFilterParams = (
  expression: TWorkItemFilterExpression | undefined
): { cleanedExpression: TWorkItemFilterExpression; customPropertyParams: Record<string, string> } => {
  const customPropertyParams: Record<string, string> = {};

  const stripConditionObject = (conditionObj: Record<string, unknown>): Record<string, unknown> | null => {
    const remainingEntries = Object.entries(conditionObj).filter(([conditionKey, value]) => {
      if (!isCustomPropertyConditionKey(conditionKey)) return true;

      const propertyId = getConditionPropertyKey(conditionKey).substring(
        CUSTOM_PROPERTY_FILTER_CONDITION_PREFIX.length
      );
      if (propertyId && typeof value === "string" && value.length > 0) {
        customPropertyParams[propertyId] = value;
      }
      return false;
    });
    return remainingEntries.length > 0 ? Object.fromEntries(remainingEntries) : null;
  };

  const walk = (node: unknown): Record<string, unknown> | null => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return node as Record<string, unknown> | null;
    const obj = node as Record<string, unknown>;

    if (LOGICAL_OPERATOR.AND in obj && Array.isArray(obj[LOGICAL_OPERATOR.AND])) {
      const cleanedChildren = (obj[LOGICAL_OPERATOR.AND] as unknown[]).map(walk).filter((child) => !!child);
      return cleanedChildren.length > 0 ? { [LOGICAL_OPERATOR.AND]: cleanedChildren } : null;
    }

    return stripConditionObject(obj);
  };

  const hasExpression = expression && typeof expression === "object" && Object.keys(expression).length > 0;
  const cleaned = hasExpression ? walk(expression) : null;

  return {
    cleanedExpression: (cleaned ?? {}) as TWorkItemFilterExpression,
    customPropertyParams,
  };
};
