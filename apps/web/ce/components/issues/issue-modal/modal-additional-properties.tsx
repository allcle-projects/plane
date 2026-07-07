/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Custom Fields / Work Item Properties — mote (Phase 2).
// Renders the active custom properties for the work item type selected in the
// create modal. Reads the selected type from the shared react-hook-form context
// (form.tsx wraps the modal in a FormProvider) and the in-progress values from
// the issue-modal context (see ./provider). Edits are held in context state and
// posted after create by handleCreateUpdatePropertyValues; required/typed
// validation runs on submit via handlePropertyValuesValidation.

import React from "react";
import { observer } from "mobx-react";
import { useFormContext } from "react-hook-form";
import useSWR from "swr";
// plane imports
import type { TIssue } from "@plane/types";
// hooks
import { useIssueModal } from "@/hooks/context/use-issue-modal";
import { useWorkItemTypes } from "@/hooks/store/use-work-item-types";
// components
import { PropertyValueControl } from "@/plane-web/components/issues/issue-properties";
// plane web imports
import type { IIssueProperty } from "@/plane-web/store/issue-types/issue-property";

export type TWorkItemModalAdditionalPropertiesProps = {
  isDraft?: boolean;
  projectId: string | null;
  workItemId: string | undefined;
  workspaceSlug: string;
};

export const WorkItemModalAdditionalProperties = observer(function WorkItemModalAdditionalProperties(
  props: TWorkItemModalAdditionalPropertiesProps
) {
  const { projectId, workspaceSlug } = props;
  // form + modal context
  const { watch } = useFormContext<TIssue>();
  const { issuePropertyValues, setIssuePropertyValues, issuePropertyValueErrors } = useIssueModal();
  // store hooks
  const { getWorkItemTypeById, fetchProperties } = useWorkItemTypes();
  // derived values
  const workItemTypeId = watch("type_id");

  // fetch the selected type's property definitions
  useSWR(
    workspaceSlug && workItemTypeId ? `MODAL_WORK_ITEM_TYPE_PROPERTIES_${workspaceSlug}_${workItemTypeId}` : null,
    workspaceSlug && workItemTypeId ? () => fetchProperties(workspaceSlug, workItemTypeId) : null
  );

  const workItemType = workItemTypeId ? getWorkItemTypeById(workItemTypeId) : undefined;
  if (!workItemTypeId || !workItemType || !projectId) return null;

  const properties = workItemType.propertyIds
    .map((propertyId) => workItemType.propertyById(propertyId))
    .filter((property): property is IIssueProperty => !!property && property.is_active);
  if (properties.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 px-4 pt-2">
      {properties.map((property) => {
        const value = issuePropertyValues[property.id] ?? [];
        const error = issuePropertyValueErrors[property.id];
        return (
          <div key={property.id} className="flex flex-col gap-1">
            <span className="text-caption-sm-medium text-tertiary">
              {property.display_name}
              {property.is_required && <span className="ml-0.5 text-danger-primary">*</span>}
            </span>
            <PropertyValueControl
              property={property}
              value={value}
              onChange={(nextValue) =>
                setIssuePropertyValues((prev) => ({ ...prev, [property.id]: nextValue }))
              }
              workspaceSlug={workspaceSlug}
              projectId={projectId}
            />
            {error && <span className="text-caption-sm-regular text-danger-primary">{error}</span>}
          </div>
        );
      })}
    </div>
  );
});
