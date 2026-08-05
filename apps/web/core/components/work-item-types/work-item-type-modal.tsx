/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Custom Fields / Work Item Properties — mote (Phase 1).
// Create / edit modal for a work item type. Mirrors the estimate create modal
// idioms (react-hook-form + ModalCore + propel Button/Toast).

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { Controller, useForm } from "react-hook-form";
// plane imports
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Checkbox, EModalPosition, EModalWidth, Input, ModalCore, TextArea, ToggleSwitch } from "@plane/ui";
// hooks
import { useProject } from "@/hooks/store/use-project";
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
  const {
    getWorkItemTypeById,
    createWorkItemType,
    updateWorkItemType,
    fetchProjectIssueTypes,
    linkProjectIssueType,
    unlinkProjectIssueType,
  } = useWorkItemTypes();
  const { workspaceProjectIds, getProjectById } = useProject();
  // derived values
  const workItemType = workItemTypeId ? getWorkItemTypeById(workItemTypeId) : undefined;
  const isEditing = Boolean(workItemTypeId);
  // project link state: currently-selected project ids, plus a map of
  // project id -> existing link row id, used to diff and to unlink on save.
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [projectLinkMap, setProjectLinkMap] = useState<Record<string, string>>({});
  // guards submit until the project-link seed fetch below resolves, so saving
  // mid-fetch can't wipe out existing links the form hasn't loaded yet.
  const [isLoadingProjectLinks, setIsLoadingProjectLinks] = useState(false);
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

  // Seed the project link selection from the backend when editing an existing
  // type. The list endpoint is project-scoped, so fan out across the workspace's
  // projects and keep the link row whose issue_type matches this type.
  useEffect(() => {
    if (!isOpen) return;
    setSelectedProjectIds([]);
    setProjectLinkMap({});
    if (!isEditing || !workItemTypeId || !workspaceProjectIds) return;
    let cancelled = false;
    setIsLoadingProjectLinks(true);
    (async () => {
      const results = await Promise.all(
        workspaceProjectIds.map(async (projectId) => {
          const links = await fetchProjectIssueTypes(workspaceSlug, projectId);
          const match = links?.find((link) => link.issue_type === workItemTypeId);
          return match ? { projectId, linkId: match.id } : undefined;
        })
      );
      if (cancelled) return;
      const map: Record<string, string> = {};
      const linkedProjectIds: string[] = [];
      results.forEach((result) => {
        if (result) {
          map[result.projectId] = result.linkId;
          linkedProjectIds.push(result.projectId);
        }
      });
      setProjectLinkMap(map);
      setSelectedProjectIds(linkedProjectIds);
      setIsLoadingProjectLinks(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, isEditing, workItemTypeId, workspaceSlug, workspaceProjectIds, fetchProjectIssueTypes]);

  const toggleProject = (projectId: string) => {
    setSelectedProjectIds((prev) =>
      prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId]
    );
  };

  const syncProjectLinks = async (targetTypeId: string) => {
    const original = Object.keys(projectLinkMap);
    const toLink = selectedProjectIds.filter((id) => !original.includes(id));
    const toUnlink = original.filter((id) => !selectedProjectIds.includes(id));
    await Promise.all([
      ...toLink.map((projectId) => linkProjectIssueType(workspaceSlug, projectId, targetTypeId)),
      ...toUnlink.map((projectId) => unlinkProjectIssueType(workspaceSlug, projectId, projectLinkMap[projectId])),
    ]);
  };

  const onClose = () => {
    reset(defaultValues);
    setSelectedProjectIds([]);
    setProjectLinkMap({});
    setIsLoadingProjectLinks(false);
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
      let targetTypeId = workItemTypeId;
      if (isEditing && workItemTypeId) {
        await updateWorkItemType(workspaceSlug, workItemTypeId, payload);
      } else {
        const created = await createWorkItemType(workspaceSlug, payload);
        targetTypeId = created?.id;
      }
      if (targetTypeId) await syncProjectLinks(targetTypeId);
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
          <div className="flex flex-col gap-2">
            <span className="text-body-sm-regular text-secondary">Available in projects</span>
            <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
              {workspaceProjectIds && workspaceProjectIds.length > 0 ? (
                workspaceProjectIds.map((projectId) => {
                  const project = getProjectById(projectId);
                  if (!project) return null;
                  return (
                    <label
                      key={projectId}
                      className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-layer-1"
                    >
                      <Checkbox
                        checked={selectedProjectIds.includes(projectId)}
                        onChange={() => toggleProject(projectId)}
                      />
                      <span className="text-body-sm-regular text-primary">{project.name}</span>
                    </label>
                  );
                })
              ) : (
                <span className="text-body-sm-regular text-tertiary">No projects available.</span>
              )}
            </div>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="submit"
            loading={isSubmitting}
            disabled={isLoadingProjectLinks}
          >
            {isEditing ? "Update" : "Create"}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
});
