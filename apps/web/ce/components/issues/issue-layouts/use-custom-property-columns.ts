/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Custom Fields / Work Item Properties — mote (Phase 3).
// Shared loader/resolver for the list + spreadsheet custom-property columns and
// their visibility toggle. Fetches the workspace's work item types and their
// property definitions once (SWR de-dupes the key across every column/cell/toggle
// that mounts it) and exposes lookups by id. Mirrors the Phase 2 sidebar fetch
// (ce/components/issues/issue-details/additional-properties.tsx).

import { useParams } from "next/navigation";
import useSWR from "swr";
// hooks
import { useWorkItemTypes } from "@/hooks/store/use-work-item-types";
// plane web store
import type { IIssueProperty } from "@/plane-web/store/issue-types/issue-property";

export type TUseCustomPropertyColumns = {
  // active custom properties across the workspace's work item types (toggle list)
  activeProperties: IIssueProperty[];
  // resolve a single property definition by its id (undefined until loaded / if deleted)
  getPropertyById: (propertyId: string) => IIssueProperty | undefined;
};

export const useCustomPropertyColumns = (): TUseCustomPropertyColumns => {
  const { workspaceSlug } = useParams();
  const { workItemTypeIds, getWorkItemTypeById, fetchWorkItemTypes, fetchProperties } = useWorkItemTypes();

  // load types + their properties once per workspace (SWR key de-dupes across mounts)
  useSWR(
    workspaceSlug ? `CUSTOM_PROPERTY_COLUMN_DEFINITIONS_${workspaceSlug.toString()}` : null,
    workspaceSlug
      ? async () => {
          const types = await fetchWorkItemTypes(workspaceSlug.toString());
          await Promise.all((types ?? []).map((type) => fetchProperties(workspaceSlug.toString(), type.id)));
        }
      : null,
    { revalidateOnFocus: false, revalidateIfStale: false }
  );

  const getPropertyById = (propertyId: string): IIssueProperty | undefined => {
    for (const typeId of workItemTypeIds) {
      const property = getWorkItemTypeById(typeId)?.propertyById(propertyId);
      if (property) return property;
    }
    return undefined;
  };

  const activeProperties = workItemTypeIds
    .flatMap((typeId) => {
      const workItemType = getWorkItemTypeById(typeId);
      return (workItemType?.propertyIds ?? []).map((propertyId) => workItemType?.propertyById(propertyId));
    })
    .filter((property): property is IIssueProperty => !!property && property.is_active);

  return { activeProperties, getPropertyById };
};
