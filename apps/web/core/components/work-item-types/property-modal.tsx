/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Custom Fields / Work Item Properties — mote (Phase 1).
// Create / edit modal for a property definition on a work item type, including
// an inline options manager for SELECT / MULTI_SELECT properties (edit mode).
// Definition admin surface only — no value rendering.

import { useEffect } from "react";
import { observer } from "mobx-react";
import { Controller, useForm } from "react-hook-form";
// plane imports
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import {
  CustomSelect,
  EModalPosition,
  EModalWidth,
  Input,
  ModalCore,
  TextArea,
  ToggleSwitch,
} from "@plane/ui";
// hooks
import { useWorkItemTypes } from "@/hooks/store/use-work-item-types";
// plane web types
import { EIssuePropertyType } from "@/plane-web/types/issue-types";
import type { TIssueProperty } from "@/plane-web/types/issue-types";
// local imports
import { PropertyOptionsManager } from "./property-options-manager";

const PROPERTY_TYPE_LABELS: Record<EIssuePropertyType, string> = {
  [EIssuePropertyType.TEXT]: "Text",
  [EIssuePropertyType.NUMBER]: "Number",
  [EIssuePropertyType.SELECT]: "Select",
  [EIssuePropertyType.MULTI_SELECT]: "Multi select",
  [EIssuePropertyType.DATE]: "Date",
  [EIssuePropertyType.MEMBER]: "Member",
  [EIssuePropertyType.BOOLEAN]: "Boolean",
  [EIssuePropertyType.URL]: "URL",
};

type TPropertyModalProps = {
  workspaceSlug: string;
  workItemTypeId: string;
  propertyId?: string;
  isOpen: boolean;
  handleClose: () => void;
};

type TPropertyForm = {
  display_name: string;
  name: string;
  description: string;
  property_type: EIssuePropertyType;
  is_required: boolean;
  is_active: boolean;
  is_multi: boolean;
  default_value: string;
};

const defaultValues: TPropertyForm = {
  display_name: "",
  name: "",
  description: "",
  property_type: EIssuePropertyType.TEXT,
  is_required: false,
  is_active: true,
  is_multi: false,
  default_value: "",
};

export const PropertyModal = observer(function PropertyModal(props: TPropertyModalProps) {
  const { workspaceSlug, workItemTypeId, propertyId, isOpen, handleClose } = props;
  // store hooks
  const { getWorkItemTypeById, createProperty, updateProperty } = useWorkItemTypes();
  // derived values
  const workItemType = getWorkItemTypeById(workItemTypeId);
  const property = propertyId ? workItemType?.propertyById(propertyId) : undefined;
  const isEditing = Boolean(propertyId);
  // form info
  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { isSubmitting },
  } = useForm<TPropertyForm>({ defaultValues });

  const selectedType = watch("property_type");
  const isSelectType =
    selectedType === EIssuePropertyType.SELECT || selectedType === EIssuePropertyType.MULTI_SELECT;

  useEffect(() => {
    if (isOpen) {
      reset(
        property
          ? {
              display_name: property.display_name,
              name: property.name,
              description: property.description,
              property_type: property.property_type,
              is_required: property.is_required,
              is_active: property.is_active,
              is_multi: property.is_multi,
              default_value: (property.default_value ?? [])[0] ?? "",
            }
          : defaultValues
      );
    }
  }, [isOpen, property, reset]);

  const onClose = () => {
    reset(defaultValues);
    handleClose();
  };

  const onSubmit = async (formData: TPropertyForm) => {
    try {
      const trimmedDefault = formData.default_value.trim();
      // SELECT/MULTI_SELECT defaults are expressed via option is_default, not here.
      const includeDefault =
        !isSelectType &&
        formData.property_type !== EIssuePropertyType.MEMBER &&
        trimmedDefault.length > 0;
      const payload: Partial<TIssueProperty> = {
        display_name: formData.display_name,
        name: formData.name || formData.display_name,
        description: formData.description,
        property_type: formData.property_type,
        is_required: formData.is_required,
        is_active: formData.is_active,
        is_multi: formData.property_type === EIssuePropertyType.MULTI_SELECT ? true : formData.is_multi,
        default_value: includeDefault ? [trimmedDefault] : [],
      };
      if (isEditing && propertyId) {
        await updateProperty(workspaceSlug, workItemTypeId, propertyId, payload);
      } else {
        await createProperty(workspaceSlug, workItemTypeId, payload);
      }
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: isEditing ? "Property updated." : "Property created.",
      });
      onClose();
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: isEditing ? "Failed to update property." : "Failed to create property.",
      });
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.XXL}>
      <form onSubmit={handleSubmit(onSubmit)} className="p-5">
        <h3 className="text-h5-medium text-primary">{isEditing ? "Edit property" : "Create property"}</h3>
        <div className="mt-4 flex flex-col gap-4">
          <Controller
            control={control}
            name="display_name"
            rules={{ required: "Display name is required" }}
            render={({ field: { value, onChange } }) => (
              <Input
                id="display_name"
                type="text"
                value={value}
                onChange={onChange}
                placeholder="Display name"
                className="w-full"
                autoFocus
              />
            )}
          />
          <Controller
            control={control}
            name="name"
            render={({ field: { value, onChange } }) => (
              <Input
                id="name"
                type="text"
                value={value}
                onChange={onChange}
                placeholder="Internal name (optional)"
                className="w-full"
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
                className="w-full min-h-20 resize-none text-body-sm-regular"
              />
            )}
          />
          <div className="flex flex-col gap-1">
            <span className="text-body-sm-regular text-secondary">Type</span>
            <Controller
              control={control}
              name="property_type"
              render={({ field: { value, onChange } }) => (
                <CustomSelect
                  value={value}
                  label={PROPERTY_TYPE_LABELS[value]}
                  onChange={onChange}
                  maxHeight="lg"
                  buttonClassName="w-full justify-between"
                  // disable type change after creation to keep stored values coherent (Phase 2)
                  disabled={isEditing}
                >
                  {Object.values(EIssuePropertyType).map((type) => (
                    <CustomSelect.Option key={type} value={type}>
                      {PROPERTY_TYPE_LABELS[type]}
                    </CustomSelect.Option>
                  ))}
                </CustomSelect>
              )}
            />
          </div>
          {!isSelectType && selectedType !== EIssuePropertyType.MEMBER && (
            <Controller
              control={control}
              name="default_value"
              render={({ field: { value, onChange } }) => (
                <Input
                  id="default_value"
                  type="text"
                  value={value}
                  onChange={onChange}
                  placeholder="Default value (optional)"
                  className="w-full"
                />
              )}
            />
          )}
          <Controller
            control={control}
            name="is_required"
            render={({ field: { value, onChange } }) => (
              <div className="flex items-center justify-between">
                <span className="text-body-sm-regular text-secondary">Required</span>
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
          {selectedType !== EIssuePropertyType.MULTI_SELECT && (
            <Controller
              control={control}
              name="is_multi"
              render={({ field: { value, onChange } }) => (
                <div className="flex items-center justify-between">
                  <span className="text-body-sm-regular text-secondary">Allow multiple values</span>
                  <ToggleSwitch value={value} onChange={onChange} size="sm" />
                </div>
              )}
            />
          )}
          {isSelectType && (
            <div className="mt-2 border-t border-subtle pt-4">
              <span className="text-body-sm-medium text-primary">Options</span>
              {isEditing && propertyId ? (
                <PropertyOptionsManager
                  workspaceSlug={workspaceSlug}
                  workItemTypeId={workItemTypeId}
                  propertyId={propertyId}
                />
              ) : (
                <p className="mt-2 text-body-xs-regular text-tertiary">
                  Save the property first, then reopen it to add options.
                </p>
              )}
            </div>
          )}
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
