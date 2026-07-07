/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Templates (work item + project templates) — mote.
// See docs/mote-design/03-work-item-power.md, section 2.4.
//
// Project template picker rendered on the project-create cover header
// (core/components/project/create/header.tsx). It lists the workspace's
// ``project`` templates and, on pick, PRE-FILLS the create form client-side
// from the template snapshot (only the safe scalar project fields are applied;
// full project-scaffold instantiation — states/labels/modules — is a later
// phase and has no backend endpoint yet). The picker lives inside the project
// create FormProvider, so it reaches the form via useFormContext.

import { useEffect } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useFormContext } from "react-hook-form";
import { LayoutTemplate } from "lucide-react";
// plane imports
import { CustomSearchSelect } from "@plane/ui";
// plane web imports
import { useTemplates } from "@/plane-web/hooks/store/use-templates";
import type { TProject } from "@/plane-web/types/projects";
import type { TProjectTemplateData } from "@/plane-web/types/templates";

export type TProjectTemplateSelect = {
  disabled?: boolean;
  onClick?: () => void;
};

// Scalar project fields safe to seed from a snapshot (ids/relations that may be
// stale across workspaces are intentionally excluded).
const PREFILL_KEYS: (keyof TProject)[] = ["name", "description", "network", "logo_props"];

export const ProjectTemplateSelect = observer(function ProjectTemplateSelect(props: TProjectTemplateSelect) {
  const { disabled = false, onClick } = props;
  // router
  const { workspaceSlug } = useParams();
  // store hooks
  const { getProjectTemplates, getTemplateById, fetchTemplates, fetchTemplateById, fetchedMap } = useTemplates();
  // form context (the picker is rendered inside the project-create FormProvider)
  const { setValue } = useFormContext<TProject>();

  // ensure the workspace templates are loaded once
  useEffect(() => {
    if (workspaceSlug && !fetchedMap[workspaceSlug.toString()]) void fetchTemplates(workspaceSlug.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug]);

  const templates = getProjectTemplates();

  // nothing to offer -> render nothing (CE-stub parity)
  if (templates.length === 0) return <></>;

  const applyTemplate = async (templateId: string) => {
    if (!workspaceSlug || !templateId) return;
    const template = getTemplateById(templateId) ?? (await fetchTemplateById(workspaceSlug.toString(), templateId));
    const templateData = template?.template_data as TProjectTemplateData | undefined;
    if (!templateData) return;
    // snapshot may nest the project shape under ``project`` or be flat
    const snapshot = (templateData.project as Partial<TProject> | undefined) ?? (templateData as Partial<TProject>);
    const applyValue = setValue as (name: keyof TProject, value: unknown, options?: { shouldDirty?: boolean }) => void;
    PREFILL_KEYS.forEach((key) => {
      const value = snapshot[key];
      if (value !== undefined && value !== null) applyValue(key, value, { shouldDirty: true });
    });
    onClick?.();
  };

  const options = templates.map((template) => ({
    value: template.id,
    query: template.name,
    content: <div className="truncate">{template.name}</div>,
  }));

  return (
    <CustomSearchSelect
      value={null}
      onChange={(value: string) => void applyTemplate(value)}
      options={options}
      disabled={disabled}
      noChevron
      customButton={
        <span className="flex items-center gap-1 rounded bg-surface-1/80 px-2 py-1 text-sm text-secondary hover:bg-surface-1">
          <LayoutTemplate className="size-3.5 flex-shrink-0" />
          <span>Use template</span>
        </span>
      }
    />
  );
});
