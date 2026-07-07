/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Custom Fields / Work Item Properties — mote (Phase 3).
// Renders custom-property definitions as extra spreadsheet columns (header + per
// row cell), appended after the built-in columns. The visible set is driven purely
// by ``displayProperties.custom_properties`` (a list of property ids), so the
// header and every row iterate the SAME list and stay column-aligned regardless of
// definition load state. Cells reuse the Phase 2 ``PropertyValueControl`` for inline
// edit and read values from the row payload embedded by the list endpoint
// (``issue.property_values``), falling back to the issue-detail value store once the
// user edits a row (which the store then holds authoritatively).

import React, { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Calendar, Hash, Link2, List, ListChecks, ToggleRight, Type, User } from "lucide-react";
// types
import type { IIssueDisplayProperties, TIssue } from "@plane/types";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// plane web imports
import { PropertyValueControl, validatePropertyValue } from "@/plane-web/components/issues/issue-properties";
import type { IIssueProperty } from "@/plane-web/store/issue-types/issue-property";
import { EIssuePropertyType } from "@/plane-web/types/issue-types";
// local
import { useCustomPropertyColumns } from "./use-custom-property-columns";

const PROPERTY_TYPE_ICON: Record<EIssuePropertyType, React.FC<{ className?: string }>> = {
  [EIssuePropertyType.TEXT]: Type,
  [EIssuePropertyType.NUMBER]: Hash,
  [EIssuePropertyType.SELECT]: List,
  [EIssuePropertyType.MULTI_SELECT]: ListChecks,
  [EIssuePropertyType.DATE]: Calendar,
  [EIssuePropertyType.MEMBER]: User,
  [EIssuePropertyType.BOOLEAN]: ToggleRight,
  [EIssuePropertyType.URL]: Link2,
};

type THeadersProps = {
  displayProperties: IIssueDisplayProperties;
};

// -------------------------------------------------------------------- headers
export const WorkItemSpreadsheetColumnHeaders = observer(function WorkItemSpreadsheetColumnHeaders(
  props: THeadersProps
) {
  const { displayProperties } = props;
  const { getPropertyById } = useCustomPropertyColumns();

  const customPropertyIds = displayProperties?.custom_properties ?? [];
  if (customPropertyIds.length === 0) return null;

  return (
    <>
      {customPropertyIds.map((propertyId) => {
        const property = getPropertyById(propertyId);
        const Icon = property ? (PROPERTY_TYPE_ICON[property.property_type] ?? Type) : Type;
        return (
          <th
            key={propertyId}
            className="h-11 min-w-36 items-center border border-t-0 border-b-0 border-subtle bg-layer-1 py-1 text-13 font-medium"
            tabIndex={0}
          >
            <div className="flex w-full items-center gap-1.5 px-page-x py-2 text-13 text-secondary">
              <Icon className="h-4 w-4 flex-shrink-0 text-placeholder" />
              <span className="truncate">{property?.display_name ?? ""}</span>
            </div>
          </th>
        );
      })}
    </>
  );
});

type TCellsProps = {
  displayProperties: IIssueDisplayProperties;
  issue: TIssue;
  disabled: boolean;
};

// ---------------------------------------------------------------------- cells
export const WorkItemSpreadsheetColumnCells = observer(function WorkItemSpreadsheetColumnCells(props: TCellsProps) {
  const { displayProperties, issue, disabled } = props;

  const customPropertyIds = displayProperties?.custom_properties ?? [];
  if (customPropertyIds.length === 0) return null;

  return (
    <>
      {customPropertyIds.map((propertyId) => (
        <CustomPropertyCell key={propertyId} propertyId={propertyId} issue={issue} disabled={disabled} />
      ))}
    </>
  );
});

type TCellProps = {
  propertyId: string;
  issue: TIssue;
  disabled: boolean;
};

const CustomPropertyCell = observer(function CustomPropertyCell(props: TCellProps) {
  const { propertyId, issue, disabled } = props;
  // router
  const { workspaceSlug } = useParams();
  // store hooks
  const {
    propertyValue: { getPropertyValuesByIssueId, updatePropertyValues },
  } = useIssueDetail();
  const { getPropertyById } = useCustomPropertyColumns();
  // local edit state
  const [draft, setDraft] = useState<string[] | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  const property = getPropertyById(propertyId);

  // committed value: prefer the value store (authoritative once a row has been
  // edited/fetched), else the per-row payload embedded by the list endpoint.
  const storeMap = getPropertyValuesByIssueId(issue.id);
  const committed = storeMap ? (storeMap[propertyId] ?? []) : (issue.property_values?.[propertyId] ?? []);
  const value = draft ?? committed;

  const handleCommit = async (next: string[]) => {
    if (!property || !workspaceSlug || !issue.project_id) return;
    const validationError = validatePropertyValue(property, next);
    setError(validationError);
    if (validationError) return;
    try {
      await updatePropertyValues(workspaceSlug.toString(), issue.project_id, issue.id, { [propertyId]: next });
      setDraft(undefined);
    } catch {
      setError(`Could not save ${property.display_name}.`);
    }
  };

  return (
    <td
      tabIndex={0}
      className="h-11 min-w-36 border-r-[1px] border-subtle text-13 after:absolute after:bottom-[-1px] after:w-full after:border after:border-subtle"
    >
      {property && workspaceSlug && issue.project_id ? (
        <div className="flex h-full w-full items-center px-page-x">
          <PropertyValueControl
            property={property}
            value={value}
            onChange={(next) => {
              setDraft(next);
              if (error) setError(undefined);
            }}
            onCommit={(next) => handleCommit(next)}
            workspaceSlug={workspaceSlug.toString()}
            projectId={issue.project_id}
            disabled={disabled}
          />
        </div>
      ) : null}
    </td>
  );
});
