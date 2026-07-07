/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Custom Fields / Work Item Properties — mote (Phase 3).
// Renders custom-property values as read-only pills in the list / kanban block
// property row (consumed by core/.../issue-layouts/properties/all-properties.tsx).
// Visibility is gated by ``displayProperties.custom_properties`` — the same key the
// spreadsheet columns use — and values come from the per-row ``property_values``
// payload embedded by the list endpoint (perf-gated to the toggled ids). Inline
// editing lives in the spreadsheet layout (see ./spreadsheet-columns.tsx).

import { observer } from "mobx-react";
import type { IIssueDisplayProperties, TIssue } from "@plane/types";
// plane web imports
import type { IIssueProperty } from "@/plane-web/store/issue-types/issue-property";
import { EIssuePropertyType } from "@/plane-web/types/issue-types";
// local
import { useCustomPropertyColumns } from "./use-custom-property-columns";

export type TWorkItemLayoutAdditionalProperties = {
  displayProperties: IIssueDisplayProperties;
  issue: TIssue;
};

const formatPropertyValue = (property: IIssueProperty, values: string[]): string => {
  switch (property.property_type) {
    case EIssuePropertyType.SELECT:
    case EIssuePropertyType.MULTI_SELECT:
      return values
        .map((optionId) => property.optionById(optionId)?.name)
        .filter((name): name is string => !!name)
        .join(", ");
    case EIssuePropertyType.BOOLEAN:
      return values[0] === "true" ? "Yes" : "No";
    case EIssuePropertyType.MEMBER:
      return values.length === 1 ? "1 member" : `${values.length} members`;
    default:
      return values.join(", ");
  }
};

export const WorkItemLayoutAdditionalProperties = observer(function WorkItemLayoutAdditionalProperties(
  props: TWorkItemLayoutAdditionalProperties
) {
  const { displayProperties, issue } = props;
  const { getPropertyById } = useCustomPropertyColumns();

  const customPropertyIds = displayProperties?.custom_properties ?? [];
  if (customPropertyIds.length === 0) return null;

  return (
    <>
      {customPropertyIds.map((propertyId) => {
        const property = getPropertyById(propertyId);
        const values = issue.property_values?.[propertyId] ?? [];
        if (!property || values.length === 0) return null;
        const label = formatPropertyValue(property, values);
        if (!label) return null;
        return (
          <div
            key={propertyId}
            className="flex h-5 flex-shrink-0 items-center gap-1 overflow-hidden rounded-sm border-[0.5px] border-strong px-2.5 py-1 text-caption-sm-regular"
          >
            <span className="text-tertiary">{property.display_name}:</span>
            <span className="truncate">{label}</span>
          </div>
        );
      })}
    </>
  );
});
