/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Custom Fields / Work Item Properties — mote (Phase 2).
// Renders the active custom properties for a work item's type in the issue-detail
// sidebar (and peek view). Each property gets a per-type control (see
// ../issue-properties/property-value-control); edits are validated client-side and
// bulk-upserted to the property-values endpoint via the issue-detail value store.
// Mirrors the shipped time-tracking sidebar block (../worklog/property/root.tsx):
// useIssueDetail + useSWR to fetch on mount, observer for reactivity.

import React, { useState } from "react";
import { observer } from "mobx-react";
import { Calendar, Hash, Link2, List, ListChecks, ToggleRight, Type, User } from "lucide-react";
import useSWR from "swr";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useWorkItemTypes } from "@/hooks/store/use-work-item-types";
// components
import { SidebarPropertyListItem } from "@/components/common/layout/sidebar/property-list-item";
import { PropertyValueControl, validatePropertyValue } from "@/plane-web/components/issues/issue-properties";
// plane web imports
import { EIssuePropertyType } from "@/plane-web/types/issue-types";
import type { IIssueProperty } from "@/plane-web/store/issue-types/issue-property";

export type TWorkItemAdditionalSidebarProperties = {
  workItemId: string;
  workItemTypeId: string | null;
  projectId: string;
  workspaceSlug: string;
  isEditable: boolean;
  isPeekView?: boolean;
};

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

export const WorkItemAdditionalSidebarProperties = observer(function WorkItemAdditionalSidebarProperties(
  props: TWorkItemAdditionalSidebarProperties
) {
  const { workItemId, workItemTypeId, projectId, workspaceSlug, isEditable } = props;
  // store hooks
  const {
    propertyValue: { getPropertyValuesByIssueId, fetchPropertyValues, updatePropertyValues },
  } = useIssueDetail();
  const { getWorkItemTypeById, fetchWorkItemTypes, fetchProperties } = useWorkItemTypes();
  // local edit state
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  // fetch type definitions + current values on mount
  useSWR(
    workspaceSlug && projectId && workItemId && workItemTypeId
      ? `WORK_ITEM_PROPERTY_VALUES_${workspaceSlug}_${projectId}_${workItemId}_${workItemTypeId}`
      : null,
    workspaceSlug && projectId && workItemId && workItemTypeId
      ? async () => {
          await fetchWorkItemTypes(workspaceSlug);
          await fetchProperties(workspaceSlug, workItemTypeId);
          await fetchPropertyValues(workspaceSlug, projectId, workItemId);
        }
      : null
  );

  const workItemType = workItemTypeId ? getWorkItemTypeById(workItemTypeId) : undefined;
  if (!workItemTypeId || !workItemType) return null;

  const properties = workItemType.propertyIds
    .map((propertyId) => workItemType.propertyById(propertyId))
    .filter((property): property is IIssueProperty => !!property && property.is_active);
  if (properties.length === 0) return null;

  const storeValues = getPropertyValuesByIssueId(workItemId) ?? {};

  const handleCommit = async (property: IIssueProperty, next: string[]) => {
    const error = validatePropertyValue(property, next);
    setErrors((prev) => ({ ...prev, [property.id]: error }));
    if (error) return;
    try {
      await updatePropertyValues(workspaceSlug, projectId, workItemId, { [property.id]: next });
      // resync from the server response
      setDrafts((prev) => {
        const nextDrafts = { ...prev };
        delete nextDrafts[property.id];
        return nextDrafts;
      });
    } catch {
      setErrors((prev) => ({ ...prev, [property.id]: `Could not save ${property.display_name}.` }));
    }
  };

  return (
    <>
      {properties.map((property) => {
        const value = drafts[property.id] ?? storeValues[property.id] ?? [];
        const Icon = PROPERTY_TYPE_ICON[property.property_type] ?? Type;
        const error = errors[property.id];
        return (
          <SidebarPropertyListItem
            key={property.id}
            icon={Icon}
            label={property.display_name}
            appendElement={property.is_required ? <span className="text-danger-primary">*</span> : undefined}
            childrenClassName="flex-col items-stretch"
          >
            <PropertyValueControl
              property={property}
              value={value}
              onChange={(nextValue) => {
                setDrafts((prev) => ({ ...prev, [property.id]: nextValue }));
                if (errors[property.id]) setErrors((prev) => ({ ...prev, [property.id]: undefined }));
              }}
              onCommit={(nextValue) => handleCommit(property, nextValue)}
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              disabled={!isEditable}
            />
            {error && <span className="text-caption-sm-regular text-danger-primary">{error}</span>}
          </SidebarPropertyListItem>
        );
      })}
    </>
  );
});
