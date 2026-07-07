/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Templates (work item + project templates) — mote.
// See docs/mote-design/03-work-item-power.md, section 2.4.
//
// Work-item template picker rendered in the create modal's header row
// (core/components/issues/issue-modal/form.tsx). It lists the workspace's
// work_item templates (optionally narrowed to the selected work item type) and,
// on pick, PRE-FILLS the create form client-side from the template snapshot:
// it resets the react-hook-form values (preserving the currently selected
// project), seeds the custom-field ``property_values`` into the issue-modal
// context, and sets ``workItemTemplateId`` so the modal's editor sync
// (IssueModalProvider.handleTemplateChange) re-fills the description editor.
// No server instantiate on this path — §2.4 specifies pre-fill.

import { useEffect } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useFormContext } from "react-hook-form";
import { LayoutTemplate } from "lucide-react";
// plane imports
import { DEFAULT_WORK_ITEM_FORM_VALUES } from "@plane/constants";
import type { TIssue, TIssuePriorities } from "@plane/types";
import { CustomSearchSelect } from "@plane/ui";
import { cn } from "@plane/utils";
// hooks
import { useIssueModal } from "@/hooks/context/use-issue-modal";
// plane web imports
import { useTemplates } from "@/plane-web/hooks/store/use-templates";
import type { TWorkItemTemplateData } from "@/plane-web/types/templates";

export type TWorkItemTemplateDropdownSize = "xs" | "sm";

export type TWorkItemTemplateSelect = {
  projectId: string | null;
  typeId: string | null;
  disabled?: boolean;
  size?: TWorkItemTemplateDropdownSize;
  placeholder?: string;
  renderChevron?: boolean;
  dropDownContainerClassName?: string;
  handleModalClose: () => void;
  handleFormChange?: () => void;
};

export const WorkItemTemplateSelect = observer(function WorkItemTemplateSelect(props: TWorkItemTemplateSelect) {
  const {
    projectId,
    typeId,
    disabled = false,
    size = "sm",
    placeholder = "Template",
    renderChevron = false,
    dropDownContainerClassName,
    handleFormChange,
  } = props;
  // router
  const { workspaceSlug } = useParams();
  // store hooks
  const { getWorkItemTemplates, getTemplateById, fetchTemplates, fetchTemplateById, fetchedMap } = useTemplates();
  const { workItemTemplateId, isApplyingTemplate, setWorkItemTemplateId, setIssuePropertyValues } = useIssueModal();
  // form context (the select is rendered inside the create modal's FormProvider)
  const { reset, getValues } = useFormContext<TIssue>();

  // ensure the workspace templates are loaded once
  useEffect(() => {
    if (workspaceSlug && !fetchedMap[workspaceSlug.toString()]) void fetchTemplates(workspaceSlug.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug]);

  // work_item templates, narrowed to the selected type (untyped templates apply to any type)
  const templates = getWorkItemTemplates().filter((template) => {
    const templateTypeId = (template.template_data as TWorkItemTemplateData)?.type_id;
    if (!typeId) return true;
    return !templateTypeId || templateTypeId === typeId;
  });

  // nothing to offer -> render nothing (keep the modal clean, CE-stub parity)
  if (!projectId || (templates.length === 0 && !workItemTemplateId)) return <></>;

  const applyTemplate = async (templateId: string) => {
    if (!workspaceSlug || !templateId) return;
    const template = getTemplateById(templateId) ?? (await fetchTemplateById(workspaceSlug.toString(), templateId));
    const data = template?.template_data as TWorkItemTemplateData | undefined;
    if (!data) return;
    // preserve the currently selected project; the snapshot is workspace-scoped
    const currentProjectId = getValues("project_id");
    reset({
      ...DEFAULT_WORK_ITEM_FORM_VALUES,
      project_id: currentProjectId,
      name: data.name ?? "",
      description_html: data.description_html ?? "<p></p>",
      priority: (data.priority ?? "none") as TIssuePriorities,
      state_id: data.state_id ?? "",
      label_ids: data.label_ids ?? [],
      assignee_ids: data.assignee_ids ?? [],
      estimate_point: data.estimate_point_id ?? null,
      type_id: data.type_id ?? null,
    });
    // seed custom-field values consumed by WorkItemModalAdditionalProperties
    setIssuePropertyValues(data.property_values ?? {});
    // triggers form.tsx -> handleTemplateChange (editor sync)
    setWorkItemTemplateId(templateId);
    handleFormChange?.();
  };

  const options = templates.map((template) => ({
    value: template.id,
    query: template.name,
    content: <div className="truncate">{template.name}</div>,
  }));

  const selectedTemplate = workItemTemplateId ? getTemplateById(workItemTemplateId) : undefined;

  return (
    <CustomSearchSelect
      value={workItemTemplateId}
      onChange={(value: string) => void applyTemplate(value)}
      options={options}
      disabled={disabled || isApplyingTemplate}
      className={dropDownContainerClassName}
      noChevron={!renderChevron}
      customButton={
        <span
          className={cn(
            "flex items-center gap-1 rounded border-[0.5px] border-subtle px-2 text-secondary hover:bg-surface-2",
            size === "xs" ? "h-5 text-xs" : "h-6 text-sm"
          )}
        >
          <LayoutTemplate className="size-3 flex-shrink-0" />
          <span className="max-w-24 truncate">{selectedTemplate?.name ?? placeholder}</span>
        </span>
      }
    />
  );
});
