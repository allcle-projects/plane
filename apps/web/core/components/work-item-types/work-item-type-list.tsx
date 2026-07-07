/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Custom Fields / Work Item Properties — mote (Phase 1).

import { observer } from "mobx-react";
import { Pencil, Trash2 } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/ui";
// hooks
import { useWorkItemTypes } from "@/hooks/store/use-work-item-types";

type TWorkItemTypeListProps = {
  workItemTypeIds: string[];
  selectedTypeId: string | undefined;
  isAdmin: boolean;
  onSelect: (typeId: string) => void;
  onEdit: (typeId: string) => void;
  onDelete: (typeId: string) => void;
};

export const WorkItemTypeList = observer(function WorkItemTypeList(props: TWorkItemTypeListProps) {
  const { workItemTypeIds, selectedTypeId, isAdmin, onSelect, onEdit, onDelete } = props;
  // translation
  const { t } = useTranslation();
  // store hooks
  const { getWorkItemTypeById } = useWorkItemTypes();

  if (workItemTypeIds.length === 0) {
    return (
      <p className="text-body-sm-regular text-tertiary">
        {t("workspace_settings.settings.work_item_types.empty_types")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {workItemTypeIds.map((typeId) => {
        const workItemType = getWorkItemTypeById(typeId);
        if (!workItemType) return null;
        const isSelected = selectedTypeId === typeId;
        return (
          <div
            key={typeId}
            className={cn(
              "flex items-center justify-between rounded-md border px-4 py-3 transition-colors",
              isSelected ? "border-accent-primary bg-layer-1" : "border-subtle hover:bg-layer-1"
            )}
          >
            <button type="button" onClick={() => onSelect(typeId)} className="flex flex-1 items-center gap-2 text-left">
              <span className="text-body-sm-medium text-primary">{workItemType.name}</span>
              {workItemType.is_epic && (
                <span className="rounded-sm bg-layer-3 px-1.5 py-0.5 text-caption-sm-medium text-secondary">Epic</span>
              )}
              {!workItemType.is_active && (
                <span className="rounded-sm bg-layer-3 px-1.5 py-0.5 text-caption-sm-medium text-tertiary">
                  Inactive
                </span>
              )}
            </button>
            {isAdmin && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onEdit(typeId)}
                  className="text-tertiary hover:text-primary"
                  aria-label="Edit work item type"
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(typeId)}
                  className="text-tertiary hover:text-danger-primary"
                  aria-label="Delete work item type"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});
