/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Milestones — mote (Phase 2).
// See docs/mote-design/04-planning-hierarchy.md, section 2.
//
// Multiselect modal to attach existing project work items to a milestone. Lists
// the project work items not already attached and attaches the checked set via
// the bulk milestone-issues endpoint. Candidate work items are passed in from the
// detail root (fetched once) — mirrors the Initiative project-link modal.

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { Check } from "lucide-react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Button, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import type { TIssue } from "@plane/types";
// plane web imports
import { useMilestones } from "@/plane-web/hooks/store/use-milestones";

type TIssueLinkModalProps = {
  isOpen: boolean;
  workspaceSlug: string;
  projectId: string;
  milestoneId: string;
  workItems: TIssue[];
  handleClose: () => void;
};

export const IssueLinkModal = observer(function IssueLinkModal(props: TIssueLinkModalProps) {
  const { isOpen, workspaceSlug, projectId, milestoneId, workItems, handleClose } = props;
  // store hooks
  const { getMilestoneIssues, addMilestoneIssues } = useMilestones();
  // state
  const [selected, setSelected] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) setSelected([]);
  }, [isOpen]);

  const attachedIssueIds = new Set(getMilestoneIssues(milestoneId).map((link) => link.issue));
  const availableWorkItems = workItems.filter((issue) => !attachedIssueIds.has(issue.id));

  const toggle = (issueId: string) =>
    setSelected((prev) => (prev.includes(issueId) ? prev.filter((id) => id !== issueId) : [...prev, issueId]));

  const onSubmit = async () => {
    if (selected.length === 0) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Select at least one work item." });
      return;
    }
    try {
      setIsSubmitting(true);
      await addMilestoneIssues(workspaceSlug, projectId, milestoneId, selected);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: "Work items attached." });
      handleClose();
    } catch (error) {
      const err = error as { data?: { error?: string } };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: err?.data?.error ?? "Work items could not be attached. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} width={EModalWidth.XL}>
      <div className="flex flex-col gap-4 p-5">
        <h3 className="text-lg font-medium text-primary">Add work items</h3>

        {availableWorkItems.length === 0 ? (
          <div className="rounded border border-subtle px-4 py-8 text-center text-sm text-tertiary">
            All of this project&apos;s work items are already attached to this milestone.
          </div>
        ) : (
          <div className="flex max-h-80 flex-col gap-0.5 overflow-y-auto">
            {availableWorkItems.map((issue) => {
              const isChecked = selected.includes(issue.id);
              return (
                <button
                  key={issue.id}
                  type="button"
                  onClick={() => toggle(issue.id)}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-2 text-left hover:bg-surface-2"
                >
                  <span className="truncate text-sm text-primary">{issue.name}</span>
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
