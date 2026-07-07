/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Custom Fields / Work Item Properties — mote (Phase 2).
// Client-side validation for custom-field values, mirroring the backend rules in
// apps/api/plane/utils/issue_property_values.py (required, number range, url
// format, option membership). Returns an error message string, or undefined when
// the value list is valid for the given property definition.

import { EIssuePropertyType } from "@/plane-web/types/issue-types";
import type { IIssueProperty } from "@/plane-web/store/issue-types/issue-property";

const isValidUrl = (value: string): boolean => {
  try {
    // eslint-disable-next-line no-new
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

export const validatePropertyValue = (property: IIssueProperty, values: string[]): string | undefined => {
  const cleaned = (values ?? []).filter((value) => value !== undefined && value !== null && `${value}`.trim() !== "");

  if (property.is_required && cleaned.length === 0) {
    return `${property.display_name} is required.`;
  }

  const settings = property.settings ?? {};

  for (const raw of cleaned) {
    switch (property.property_type) {
      case EIssuePropertyType.NUMBER: {
        const num = Number(raw);
        if (Number.isNaN(num)) return `${property.display_name} must be a number.`;
        const min = settings.min as number | undefined;
        const max = settings.max as number | undefined;
        if (typeof min === "number" && num < min) return `${property.display_name} must be at least ${min}.`;
        if (typeof max === "number" && num > max) return `${property.display_name} must be at most ${max}.`;
        break;
      }
      case EIssuePropertyType.URL: {
        if (!isValidUrl(raw)) return `${property.display_name} must be a valid URL.`;
        break;
      }
      case EIssuePropertyType.SELECT:
      case EIssuePropertyType.MULTI_SELECT: {
        if (!property.optionIds.includes(raw)) return `${property.display_name} has an invalid option.`;
        break;
      }
      default:
        break;
    }
  }

  return undefined;
};
