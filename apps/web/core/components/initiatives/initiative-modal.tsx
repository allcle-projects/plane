/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Initiatives — mote.
// See docs/mote-design/04-planning-hierarchy.md, section 1.
//
// Create / edit editor for an Initiative: name, description, lead, status and
// the optional start / end dates. Mirrors the mote recurrence modal shape.

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Button, CustomSelect, EModalWidth, Input, ModalCore } from "@plane/ui";
// components
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
// plane web imports
import { useInitiatives } from "@/plane-web/hooks/store/use-initiatives";
import type { TInitiative, TInitiativeStatus } from "@/plane-web/types/initiatives";
// local imports
import { INITIATIVE_STATUS_OPTIONS, getInitiativeStatusLabel } from "./helper";

type TInitiativeModalProps = {
  isOpen: boolean;
  workspaceSlug: string;
  initiativeId?: string | null;
  handleClose: () => void;
};

type TFormState = {
  name: string;
  description: string;
  lead: string | null;
  status: TInitiativeStatus;
  start_date: string;
  end_date: string;
};

const DEFAULT_FORM: TFormState = {
  name: "",
  description: "",
  lead: null,
  status: "planned",
  start_date: "",
  end_date: "",
};

export const InitiativeModal = observer(function InitiativeModal(props: TInitiativeModalProps) {
  const { isOpen, workspaceSlug, initiativeId, handleClose } = props;
  // store hooks
  const { getInitiativeById, createInitiative, updateInitiative } = useInitiatives();
  // state
  const [form, setForm] = useState<TFormState>(DEFAULT_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const existing = initiativeId ? getInitiativeById(initiativeId) : undefined;

  // seed the form when opening (edit -> hydrate, create -> defaults)
  useEffect(() => {
    if (!isOpen) return;
    if (existing) {
      setForm({
        name: existing.name ?? "",
        description: existing.description ?? "",
        lead: existing.lead ?? null,
        status: existing.status ?? "planned",
        start_date: existing.start_date ?? "",
        end_date: existing.end_date ?? "",
      });
    } else {
      setForm(DEFAULT_FORM);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initiativeId]);

  const setField = <K extends keyof TFormState>(key: K, value: TFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const onSubmit = async () => {
    if (!form.name.trim()) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Name is required." });
      return;
    }

    const payload: Partial<TInitiative> = {
      name: form.name.trim(),
      description: form.description.trim(),
      lead: form.lead,
      status: form.status,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
    };

    try {
      setIsSubmitting(true);
      if (initiativeId) {
        await updateInitiative(workspaceSlug, initiativeId, payload);
        setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: "Initiative updated." });
      } else {
        await createInitiative(workspaceSlug, payload);
        setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: "Initiative created." });
      }
      handleClose();
    } catch (error) {
      const err = error as { data?: { error?: string } };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: err?.data?.error ?? "Initiative could not be saved. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} width={EModalWidth.XXL}>
      <div className="flex flex-col gap-4 p-5">
        <h3 className="text-lg font-medium text-primary">{initiativeId ? "Edit initiative" : "New initiative"}</h3>

        {/* Name */}
        <div className="flex flex-col gap-1">
          <label className="text-sm text-secondary">Name</label>
          <Input
            type="text"
            value={form.name}
            onChange={(e) => setField("name", e.target.value)}
            placeholder="Q3 platform revamp"
            className="w-full"
          />
        </div>

        {/* Description */}
        <div className="flex flex-col gap-1">
          <label className="text-sm text-secondary">Description (optional)</label>
          <textarea
            value={form.description}
            onChange={(e) => setField("description", e.target.value)}
            placeholder="What this initiative is about"
            rows={3}
            className="w-full resize-none rounded-md border border-subtle bg-transparent px-3 py-2 text-sm text-primary outline-none focus:border-accent-primary"
          />
        </div>

        {/* Lead + status */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-secondary">Lead</label>
            <MemberDropdown
              value={form.lead}
              onChange={(value) => setField("lead", value)}
              multiple={false}
              buttonVariant="border-with-text"
              placeholder="Select lead"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-secondary">Status</label>
            <CustomSelect
              value={form.status}
              onChange={(value: TInitiativeStatus) => setField("status", value)}
              label={getInitiativeStatusLabel(form.status)}
              buttonClassName="w-40 justify-between"
            >
              {INITIATIVE_STATUS_OPTIONS.map((option) => (
                <CustomSelect.Option key={option.value} value={option.value}>
                  {option.label}
                </CustomSelect.Option>
              ))}
            </CustomSelect>
          </div>
        </div>

        {/* Start / end dates */}
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
            <label className="text-sm text-secondary">End date (optional)</label>
            <Input
              type="date"
              value={form.end_date}
              onChange={(e) => setField("end_date", e.target.value)}
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
            {initiativeId ? "Update" : "Create"}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
