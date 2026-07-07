/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Custom Fields / Work Item Properties — mote (Phase 1).
// Settings admin surface: manage work item types -> property definitions ->
// options. Mirrors the EstimateRoot structure (SWR fetch + heading + list +
// CRUD modals). Definition management only — NO value rendering / columns /
// filters (those are Phase 2+).

import { useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { AlertModalCore } from "@plane/ui";
// components
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { useWorkItemTypes } from "@/hooks/store/use-work-item-types";
// local imports
import { PropertyList } from "./property-list";
import { PropertyModal } from "./property-modal";
import { WorkItemTypeList } from "./work-item-type-list";
import { WorkItemTypeModal } from "./work-item-type-modal";

type TWorkItemTypesRootProps = {
  workspaceSlug: string;
  isAdmin: boolean;
};

export const WorkItemTypesRoot = observer(function WorkItemTypesRoot(props: TWorkItemTypesRootProps) {
  const { workspaceSlug, isAdmin } = props;
  // translation
  const { t } = useTranslation();
  // store hooks
  const {
    workItemTypeIds,
    getWorkItemTypeById,
    fetchWorkItemTypes,
    fetchProperties,
    deleteWorkItemType,
    deleteProperty,
  } = useWorkItemTypes();
  // states
  const [selectedTypeId, setSelectedTypeId] = useState<string | undefined>();
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
  const [typeToEdit, setTypeToEdit] = useState<string | undefined>();
  const [typeToDelete, setTypeToDelete] = useState<string | undefined>();
  const [isPropertyModalOpen, setIsPropertyModalOpen] = useState(false);
  const [propertyToEdit, setPropertyToEdit] = useState<string | undefined>();
  const [propertyToDelete, setPropertyToDelete] = useState<string | undefined>();
  const [isDeleting, setIsDeleting] = useState(false);

  // fetch work item types
  useSWR(
    workspaceSlug ? `WORK_ITEM_TYPES_${workspaceSlug}` : null,
    workspaceSlug ? () => fetchWorkItemTypes(workspaceSlug) : null
  );

  // fetch properties for the selected type
  useSWR(
    workspaceSlug && selectedTypeId ? `WORK_ITEM_TYPE_PROPERTIES_${workspaceSlug}_${selectedTypeId}` : null,
    workspaceSlug && selectedTypeId ? () => fetchProperties(workspaceSlug, selectedTypeId) : null
  );

  const openCreateType = () => {
    setTypeToEdit(undefined);
    setIsTypeModalOpen(true);
  };

  const openEditType = (typeId: string) => {
    setTypeToEdit(typeId);
    setIsTypeModalOpen(true);
  };

  const openCreateProperty = () => {
    setPropertyToEdit(undefined);
    setIsPropertyModalOpen(true);
  };

  const openEditProperty = (propertyId: string) => {
    setPropertyToEdit(propertyId);
    setIsPropertyModalOpen(true);
  };

  const handleDeleteType = async () => {
    if (!typeToDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteWorkItemType(workspaceSlug, typeToDelete);
      if (selectedTypeId === typeToDelete) setSelectedTypeId(undefined);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: "Work item type deleted." });
      setTypeToDelete(undefined);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Failed to delete work item type." });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteProperty = async () => {
    if (!selectedTypeId || !propertyToDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteProperty(workspaceSlug, selectedTypeId, propertyToDelete);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: "Property deleted." });
      setPropertyToDelete(undefined);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Failed to delete property." });
    } finally {
      setIsDeleting(false);
    }
  };

  const selectedType = selectedTypeId ? getWorkItemTypeById(selectedTypeId) : undefined;

  return (
    <>
      <div>
        <SettingsHeading
          title={t("workspace_settings.settings.work_item_types.heading")}
          description={t("workspace_settings.settings.work_item_types.description")}
          control={
            isAdmin ? (
              <Button variant="primary" size="lg" onClick={openCreateType}>
                {t("workspace_settings.settings.work_item_types.add_type")}
              </Button>
            ) : undefined
          }
        />
        <div className="mt-6 flex flex-col gap-8">
          <WorkItemTypeList
            workItemTypeIds={workItemTypeIds}
            selectedTypeId={selectedTypeId}
            isAdmin={isAdmin}
            onSelect={(typeId) => setSelectedTypeId(typeId)}
            onEdit={openEditType}
            onDelete={(typeId) => setTypeToDelete(typeId)}
          />
          {selectedType && (
            <PropertyList
              workItemTypeId={selectedType.id}
              typeName={selectedType.name}
              propertyIds={selectedType.propertyIds}
              isAdmin={isAdmin}
              onAdd={openCreateProperty}
              onEdit={openEditProperty}
              onDelete={(propertyId) => setPropertyToDelete(propertyId)}
            />
          )}
        </div>
      </div>

      {/* CRUD modals */}
      <WorkItemTypeModal
        workspaceSlug={workspaceSlug}
        workItemTypeId={typeToEdit}
        isOpen={isTypeModalOpen}
        handleClose={() => {
          setIsTypeModalOpen(false);
          setTypeToEdit(undefined);
        }}
      />
      {selectedTypeId && (
        <PropertyModal
          workspaceSlug={workspaceSlug}
          workItemTypeId={selectedTypeId}
          propertyId={propertyToEdit}
          isOpen={isPropertyModalOpen}
          handleClose={() => {
            setIsPropertyModalOpen(false);
            setPropertyToEdit(undefined);
          }}
        />
      )}
      <AlertModalCore
        isOpen={Boolean(typeToDelete)}
        handleClose={() => setTypeToDelete(undefined)}
        handleSubmit={handleDeleteType}
        isSubmitting={isDeleting}
        title="Delete work item type"
        content="Are you sure you want to delete this work item type? Its properties will be deleted too."
      />
      <AlertModalCore
        isOpen={Boolean(propertyToDelete)}
        handleClose={() => setPropertyToDelete(undefined)}
        handleSubmit={handleDeleteProperty}
        isSubmitting={isDeleting}
        title="Delete property"
        content="Are you sure you want to delete this property?"
      />
    </>
  );
});
