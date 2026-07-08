/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Milestones — mote (Phase 2).
// See docs/mote-design/04-planning-hierarchy.md, section 2.
//
// Create / edit editor for a Milestone: name, description, owner, status and the
// optional start / target dates. Project-scoped — mirrors the Initiative modal.

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Button, CustomSelect, EModalWidth, Input, ModalCore } from "@plane/ui";
// components
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
// plane web imports
import { useMilestones } from "@/plane-web/hooks/store/use-milestones";
import type { TMilestone, TMilestoneStatus } from "@/plane-web/types/milestones";
// local imports
import { MILESTONE_STATUS_OPTIONS, getMilestoneStatusLabel } from "./helper";

type TMilestoneModalProps = {
  isOpen: boolean;
  workspaceSlug: string;
  projectId: string;
  milestoneId?: string | null;
  handleClose: () => void;
};

type TFormState = {
  name: string;
  description: string;
  owned_by: string | null;
  status: TMilestoneStatus;
  start_date: string;
  target_date: string;
};

const DEFAULT_FORM: TFormState = {
  name: "",
  description: "",
  owned_by: null,
  status: "planned",
  start_date: "",
  target_date: "",
};

export const MilestoneModal = observer(function MilestoneModal(props: TMilestoneModalProps) {
  const { isOpen, workspaceSlug, projectId, milestoneId, handleClose } = props;
  // store hooks
  const { getMilestoneById, createMilestone, updateMilestone } = useMilestones();
  // state
  const [form, setForm] = useState<TFormState>(DEFAULT_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const existing = milestoneId ? getMilestoneById(milestoneId) : undefined;

  // seed the form when opening (edit -> hydrate, create -> defaults)
  useEffect(() => {
    if (!isOpen) return;
    if (existing) {
      setForm({
        name: existing.name ?? "",
        description: existing.description ?? "",
        owned_by: existing.owned_by ?? null,
        status: existing.status ?? "planned",
        start_date: existing.start_date ?? "",
        target_date: existing.target_date ?? "",
      });
    } else {
      setForm(DEFAULT_FORM);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, milestoneId]);

  const setField = <K extends keyof TFormState>(key: K, value: TFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const onSubmit = async () => {
    if (!form.name.trim()) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Name is required." });
      return;
    }

    const payload: Partial<TMilestone> = {
      name: form.name.trim(),
      description: form.description.trim(),
      owned_by: form.owned_by,
      status: form.status,
      start_date: form.start_date || null,
      target_date: form.target_date || null,
    };

    try {
      setIsSubmitting(true);
      if (milestoneId) {
        await updateMilestone(workspaceSlug, projectId, milestoneId, payload);
        setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: "Milestone updated." });
      } else {
        await createMilestone(workspaceSlug, projectId, payload);
        setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: "Milestone created." });
      }
      handleClose();
    } catch (error) {
      const err = error as { data?: { error?: string } };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: err?.data?.error ?? "Milestone could not be saved. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} width={EModalWidth.XXL}>
      <div className="flex flex-col gap-4 p-5">
        <h3 className="text-lg font-medium text-primary">{milestoneId ? "Edit milestone" : "New milestone"}</h3>

        {/* Name */}
        <div className="flex flex-col gap-1">
          <label className="text-sm text-secondary">Name</label>
          <Input
            type="text"
            value={form.name}
            onChange={(e) => setField("name", e.target.value)}
            placeholder="Beta launch"
            className="w-full"
          />
        </div>

        {/* Description */}
        <div className="flex flex-col gap-1">
          <label className="text-sm text-secondary">Description (optional)</label>
          <textarea
            value={form.description}
            onChange={(e) => setField("description", e.target.value)}
            placeholder="What this milestone covers"
            rows={3}
            className="w-full resize-none rounded-md border border-subtle bg-transparent px-3 py-2 text-sm text-primary outline-none focus:border-accent-primary"
          />
        </div>

        {/* Owner + status */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-secondary">Owner</label>
            <MemberDropdown
              value={form.owned_by}
              onChange={(value) => setField("owned_by", value)}
              multiple={false}
              buttonVariant="border-with-text"
              placeholder="Select owner"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-secondary">Status</label>
            <CustomSelect
              value={form.status}
              onChange={(value: TMilestoneStatus) => setField("status", value)}
              label={getMilestoneStatusLabel(form.status)}
              buttonClassName="w-40 justify-between"
            >
              {MILESTONE_STATUS_OPTIONS.map((option) => (
                <CustomSelect.Option key={option.value} value={option.value}>
                  {option.label}
                </CustomSelect.Option>
              ))}
            </CustomSelect>
          </div>
        </div>

        {/* Start / target dates */}
        <div className="flex items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-secondary">Start date (optional)</label>
            <Input
              type="date"
              value={form.start_date}
              onChange={(e) => setField("start_date", e.target.value)}
              className="w-44"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-secondary">Target date (optional)</label>
            <Input
              type="date"
              value={form.target_date}
              onChange={(e) => setField("target_date", e.target.value)}
              className="w-44"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="mt-2 flex items-center justify-end gap-2">
          <Button variant="neutral-primary" size="sm" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={() => void onSubmit()} loading={isSubmitting}>
            {milestoneId ? "Update" : "Create"}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
