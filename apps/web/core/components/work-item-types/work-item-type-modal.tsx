/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Custom Fields / Work Item Properties — mote (Phase 1).
// Create / edit modal for a work item type. Mirrors the estimate create modal
// idioms (react-hook-form + ModalCore + propel Button/Toast).

import { useEffect } from "react";
import { observer } from "mobx-react";
import { Controller, useForm } from "react-hook-form";
// plane imports
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EModalPosition, EModalWidth, Input, ModalCore, TextArea, ToggleSwitch } from "@plane/ui";
// hooks
import { useWorkItemTypes } from "@/hooks/store/use-work-item-types";
// plane web types
import type { TIssueType } from "@/plane-web/types/issue-types";

type TWorkItemTypeModalProps = {
  workspaceSlug: string;
  workItemTypeId?: string;
  isOpen: boolean;
  handleClose: () => void;
};

type TWorkItemTypeForm = {
  name: string;
  description: string;
  is_epic: boolean;
  is_active: boolean;
};

const defaultValues: TWorkItemTypeForm = {
  name: "",
  description: "",
  is_epic: false,
  is_active: true,
};

export const WorkItemTypeModal = observer(function WorkItemTypeModal(props: TWorkItemTypeModalProps) {
  const { workspaceSlug, workItemTypeId, isOpen, handleClose } = props;
  // store hooks
  const { getWorkItemTypeById, createWorkItemType, updateWorkItemType } = useWorkItemTypes();
  // derived values
  const workItemType = workItemTypeId ? getWorkItemTypeById(workItemTypeId) : undefined;
  const isEditing = Boolean(workItemTypeId);
  // form info
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<TWorkItemTypeForm>({ defaultValues });

  useEffect(() => {
    if (isOpen) {
      reset(
        workItemType
          ? {
              name: workItemType.name,
              description: workItemType.description,
              is_epic: workItemType.is_epic,
              is_active: workItemType.is_active,
            }
          : defaultValues
      );
    }
  }, [isOpen, workItemType, reset]);

  const onClose = () => {
    reset(defaultValues);
    handleClose();
  };

  const onSubmit = async (formData: TWorkItemTypeForm) => {
    try {
      const payload: Partial<TIssueType> = {
        name: formData.name,
        description: formData.description,
        is_epic: formData.is_epic,
        is_active: formData.is_active,
      };
      if (isEditing && workItemTypeId) {
        await updateWorkItemType(workspaceSlug, workItemTypeId, payload);
      } else {
        await createWorkItemType(workspaceSlug, payload);
      }
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: isEditing ? "Work item type updated." : "Work item type created.",
      });
      onClose();
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: isEditing ? "Failed to update work item type." : "Failed to create work item type.",
      });
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.XXL}>
      <form onSubmit={handleSubmit(onSubmit)} className="p-5">
        <h3 className="text-h5-medium text-primary">
          {isEditing ? "Edit work item type" : "Create work item type"}
        </h3>
        <div className="mt-4 flex flex-col gap-4">
          <Controller
            control={control}
            name="name"
            rules={{ required: "Name is required" }}
            render={({ field: { value, onChange } }) => (
              <Input
                id="name"
                type="text"
                value={value}
                onChange={onChange}
                placeholder="Name"
                className="w-full"
                autoFocus
              />
            )}
          />
          <Controller
            control={control}
            name="description"
            render={({ field: { value, onChange } }) => (
              <TextArea
                id="description"
                value={value}
                onChange={onChange}
                placeholder="Description"
                className="w-full min-h-24 resize-none text-body-sm-regular"
              />
            )}
          />
          <Controller
            control={control}
            name="is_epic"
            render={({ field: { value, onChange } }) => (
              <div className="flex items-center justify-between">
                <span className="text-body-sm-regular text-secondary">Epic</span>
                <ToggleSwitch value={value} onChange={onChange} size="sm" />
              </div>
            )}
          />
          <Controller
            control={control}
            name="is_active"
            render={({ field: { value, onChange } }) => (
              <div className="flex items-center justify-between">
                <span className="text-body-sm-regular text-secondary">Active</span>
                <ToggleSwitch value={value} onChange={onChange} size="sm" />
              </div>
            )}
          />
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button variant="primary" size="sm" type="submit" loading={isSubmitting}>
            {isEditing ? "Update" : "Create"}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
});
