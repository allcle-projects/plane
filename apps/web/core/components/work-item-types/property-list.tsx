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
import { Button } from "@plane/propel/button";
// components
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { useWorkItemTypes } from "@/hooks/store/use-work-item-types";

type TPropertyListProps = {
  workItemTypeId: string;
  typeName: string;
  propertyIds: string[];
  isAdmin: boolean;
  onAdd: () => void;
  onEdit: (propertyId: string) => void;
  onDelete: (propertyId: string) => void;
};

export const PropertyList = observer(function PropertyList(props: TPropertyListProps) {
  const { workItemTypeId, typeName, propertyIds, isAdmin, onAdd, onEdit, onDelete } = props;
  // translation
  const { t } = useTranslation();
  // store hooks
  const { getWorkItemTypeById } = useWorkItemTypes();
  // derived values
  const workItemType = getWorkItemTypeById(workItemTypeId);

  return (
    <div className="flex flex-col gap-4">
      <SettingsHeading
        title={`Properties · ${typeName}`}
        variant="h6"
        control={
          isAdmin ? (
            <Button variant="secondary" size="sm" onClick={onAdd}>
              {t("workspace_settings.settings.work_item_types.add_property")}
            </Button>
          ) : undefined
        }
      />
      {propertyIds.length === 0 ? (
        <p className="text-body-sm-regular text-tertiary">
          {t("workspace_settings.settings.work_item_types.empty_properties")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {propertyIds.map((propertyId) => {
            const property = workItemType?.propertyById(propertyId);
            if (!property) return null;
            return (
              <div
                key={propertyId}
                className="flex items-center justify-between rounded-md border border-subtle px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <span className="text-body-sm-medium text-primary">{property.display_name}</span>
                  <span className="rounded-sm bg-layer-3 px-1.5 py-0.5 text-caption-sm-medium text-secondary">
                    {property.property_type}
                  </span>
                  {property.is_required && (
                    <span className="rounded-sm bg-layer-3 px-1.5 py-0.5 text-caption-sm-medium text-secondary">
                      Required
                    </span>
                  )}
                  {!property.is_active && (
                    <span className="rounded-sm bg-layer-3 px-1.5 py-0.5 text-caption-sm-medium text-tertiary">
                      Inactive
                    </span>
                  )}
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => onEdit(propertyId)}
                      className="text-tertiary hover:text-primary"
                      aria-label="Edit property"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(propertyId)}
                      className="text-tertiary hover:text-danger-primary"
                      aria-label="Delete property"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});
