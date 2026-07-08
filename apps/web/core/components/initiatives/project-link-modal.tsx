/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Initiatives — mote.
// See docs/mote-design/04-planning-hierarchy.md, section 1.
//
// Multiselect modal to link existing workspace projects to an initiative. Lists
// the workspace projects not already linked and adds the checked set.

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { Check } from "lucide-react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Button, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
// hooks
import { useProject } from "@/hooks/store/use-project";
// plane web imports
import { useInitiatives } from "@/plane-web/hooks/store/use-initiatives";

type TProjectLinkModalProps = {
  isOpen: boolean;
  workspaceSlug: string;
  initiativeId: string;
  handleClose: () => void;
};

export const ProjectLinkModal = observer(function ProjectLinkModal(props: TProjectLinkModalProps) {
  const { isOpen, workspaceSlug, initiativeId, handleClose } = props;
  // store hooks
  const { joinedProjectIds, getProjectById } = useProject();
  const { getInitiativeProjects, addInitiativeProjects } = useInitiatives();
  // state
  const [selected, setSelected] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) setSelected([]);
  }, [isOpen]);

  const linkedProjectIds = new Set(getInitiativeProjects(initiativeId).map((link) => link.project));
  const availableProjectIds = joinedProjectIds.filter((projectId) => !linkedProjectIds.has(projectId));

  const toggle = (projectId: string) =>
    setSelected((prev) =>
      prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId]
    );

  const onSubmit = async () => {
    if (selected.length === 0) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Select at least one project." });
      return;
    }
    try {
      setIsSubmitting(true);
      await addInitiativeProjects(workspaceSlug, initiativeId, selected);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: "Projects linked." });
      handleClose();
    } catch (error) {
      const err = error as { data?: { error?: string } };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: err?.data?.error ?? "Projects could not be linked. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} width={EModalWidth.XL}>
      <div className="flex flex-col gap-4 p-5">
        <h3 className="text-lg font-medium text-primary">Add projects</h3>

        {availableProjectIds.length === 0 ? (
          <div className="rounded border border-subtle px-4 py-8 text-center text-sm text-tertiary">
            All of your projects are already linked to this initiative.
          </div>
        ) : (
          <div className="flex max-h-80 flex-col gap-0.5 overflow-y-auto">
            {availableProjectIds.map((projectId) => {
              const project = getProjectById(projectId);
              if (!project) return null;
              const isChecked = selected.includes(projectId);
              return (
                <button
                  key={projectId}
                  type="button"
                  onClick={() => toggle(projectId)}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-2 text-left hover:bg-surface-2"
                >
                  <span className="truncate text-sm text-primary">{project.name}</span>
                  <span
                    className={cn(
                      "flex size-4 flex-shrink-0 items-center justify-center rounded border",
                      isChecked ? "border-accent-primary bg-accent-primary text-white" : "border-subtle"
                    )}
                  >
                    {isChecked && <Check className="size-3" />}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-2 flex items-center justify-end gap-2">
          <Button variant="neutral-primary" size="sm" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void onSubmit()}
            loading={isSubmitting}
            disabled={selected.length === 0}
          >
            Add {selected.length > 0 ? `(${selected.length})` : ""}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
