/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Custom Fields / Work Item Properties — mote (Phase 1).
// Inline options manager for a persisted SELECT / MULTI_SELECT property.
// Definition admin surface only.

import { useState } from "react";
import { observer } from "mobx-react";
import { Trash2 } from "lucide-react";
import useSWR from "swr";
// plane imports
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Input } from "@plane/ui";
// hooks
import { useWorkItemTypes } from "@/hooks/store/use-work-item-types";

type TPropertyOptionsManagerProps = {
  workspaceSlug: string;
  workItemTypeId: string;
  propertyId: string;
};

export const PropertyOptionsManager = observer(function PropertyOptionsManager(props: TPropertyOptionsManagerProps) {
  const { workspaceSlug, workItemTypeId, propertyId } = props;
  // store hooks
  const { getWorkItemTypeById, fetchOptions, createOption, deleteOption } = useWorkItemTypes();
  // states
  const [newOptionName, setNewOptionName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  // derived values
  const property = getWorkItemTypeById(workItemTypeId)?.propertyById(propertyId);

  useSWR(
    workspaceSlug && workItemTypeId && propertyId
      ? `PROPERTY_OPTIONS_${workspaceSlug}_${workItemTypeId}_${propertyId}`
      : null,
    () => fetchOptions(workspaceSlug, workItemTypeId, propertyId)
  );

  const handleAddOption = async () => {
    const name = newOptionName.trim();
    if (!name || isCreating) return;
    setIsCreating(true);
    try {
      await createOption(workspaceSlug, workItemTypeId, propertyId, { name });
      setNewOptionName("");
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Failed to add option." });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteOption = async (optionId: string) => {
    try {
      await deleteOption(workspaceSlug, workItemTypeId, propertyId, optionId);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Failed to delete option." });
    }
  };

  const optionIds = property?.optionIds ?? [];

  return (
    <div className="mt-3 flex flex-col gap-2">
      {optionIds.length > 0 ? (
        <div className="flex flex-col gap-1">
          {optionIds.map((optionId) => {
            const option = property?.optionById(optionId);
            if (!option) return null;
            return (
              <div
                key={optionId}
                className="flex items-center justify-between rounded-md border border-subtle px-3 py-1.5"
              >
                <span className="text-body-sm-regular text-primary">{option.name}</span>
                <button
                  type="button"
                  onClick={() => handleDeleteOption(optionId)}
                  className="text-tertiary hover:text-danger-primary"
                  aria-label="Delete option"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-body-xs-regular text-tertiary">No options yet.</p>
      )}
      <div className="flex items-center gap-2">
        <Input
          id="new_option"
          type="text"
          value={newOptionName}
          onChange={(e) => setNewOptionName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAddOption();
            }
          }}
          placeholder="New option"
          className="w-full"
        />
        <Button variant="secondary" size="sm" type="button" onClick={handleAddOption} loading={isCreating}>
          Add
        </Button>
      </div>
    </div>
  );
});
