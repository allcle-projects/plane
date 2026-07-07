/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Recurring work items — mote.
// See docs/mote-design/03-work-item-power.md, section 3.4.
//
// Schedule editor modal. Defines the cadence (daily / weekly / monthly / cron)
// + interval + weekday set (weekly) / cron expression (cron) + start / optional
// end date, and picks the payload source. Per §3.4 the v1 shape source is a
// mote.14 Template chosen from the Templates dropdown (``template`` FK). The
// backend also accepts an inline ``issue_data`` snapshot, left unset here.

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import {
  Button,
  CustomSearchSelect,
  CustomSelect,
  EModalWidth,
  Input,
  ModalCore,
  ToggleSwitch,
} from "@plane/ui";
import { cn } from "@plane/utils";
// plane web imports
import { useRecurringIssues } from "@/plane-web/hooks/store/use-recurring-issues";
import { useTemplates } from "@/plane-web/hooks/store/use-templates";
import type { TRecurringCadence, TRecurringIssue } from "@/plane-web/types/recurring";

type TRecurrenceModalProps = {
  isOpen: boolean;
  workspaceSlug: string;
  projectId: string;
  recurringId?: string | null;
  handleClose: () => void;
};

const CADENCE_OPTIONS: { value: TRecurringCadence; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "cron", label: "Cron" },
];

// 0=Monday .. 6=Sunday (Python weekday()), matching RecurringIssue.weekdays.
const WEEKDAYS: { value: number; label: string }[] = [
  { value: 0, label: "Mon" },
  { value: 1, label: "Tue" },
  { value: 2, label: "Wed" },
  { value: 3, label: "Thu" },
  { value: 4, label: "Fri" },
  { value: 5, label: "Sat" },
  { value: 6, label: "Sun" },
];

type TFormState = {
  name: string;
  template: string | null;
  cadence: TRecurringCadence;
  cron_expression: string;
  interval: number;
  weekdays: number[];
  start_date: string;
  end_date: string;
  is_active: boolean;
};

const DEFAULT_FORM: TFormState = {
  name: "",
  template: null,
  cadence: "weekly",
  cron_expression: "",
  interval: 1,
  weekdays: [],
  start_date: "",
  end_date: "",
  is_active: true,
};

export const RecurrenceModal = observer(function RecurrenceModal(props: TRecurrenceModalProps) {
  const { isOpen, workspaceSlug, projectId, recurringId, handleClose } = props;
  // store hooks
  const { getRecurringIssueById, createRecurringIssue, updateRecurringIssue } = useRecurringIssues();
  const { getWorkItemTemplates, fetchTemplates, fetchedMap } = useTemplates();
  // state
  const [form, setForm] = useState<TFormState>(DEFAULT_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const existing = recurringId ? getRecurringIssueById(recurringId) : undefined;

  // ensure workspace templates are loaded for the picker
  useEffect(() => {
    if (isOpen && workspaceSlug && !fetchedMap[workspaceSlug]) void fetchTemplates(workspaceSlug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, workspaceSlug]);

  // seed the form when opening (edit -> hydrate, create -> defaults)
  useEffect(() => {
    if (!isOpen) return;
    if (existing) {
      setForm({
        name: existing.name ?? "",
        template: existing.template ?? null,
        cadence: existing.cadence,
        cron_expression: existing.cron_expression ?? "",
        interval: existing.interval ?? 1,
        weekdays: existing.weekdays ?? [],
        start_date: existing.start_date ?? "",
        end_date: existing.end_date ?? "",
        is_active: existing.is_active ?? true,
      });
    } else {
      setForm(DEFAULT_FORM);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, recurringId]);

  const setField = <K extends keyof TFormState>(key: K, value: TFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const toggleWeekday = (day: number) =>
    setForm((prev) => ({
      ...prev,
      weekdays: prev.weekdays.includes(day)
        ? prev.weekdays.filter((d) => d !== day)
        : [...prev.weekdays, day].sort((a, b) => a - b),
    }));

  const templateOptions = getWorkItemTemplates().map((template) => ({
    value: template.id,
    query: template.name,
    content: <div className="truncate">{template.name}</div>,
  }));

  const onSubmit = async () => {
    // client-side guards mirroring the serializer's validate()
    if (!form.name.trim()) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Name is required." });
      return;
    }
    if (!form.template) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Pick a template to recur." });
      return;
    }
    if (!form.start_date) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Start date is required." });
      return;
    }
    if (form.interval < 1) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Interval must be at least 1." });
      return;
    }
    if (form.cadence === "cron" && !form.cron_expression.trim()) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Cron cadence requires a cron expression." });
      return;
    }

    const payload: Partial<TRecurringIssue> = {
      name: form.name.trim(),
      template: form.template,
      cadence: form.cadence,
      interval: form.interval,
      weekdays: form.cadence === "weekly" ? form.weekdays : [],
      cron_expression: form.cadence === "cron" ? form.cron_expression.trim() : null,
      start_date: form.start_date,
      end_date: form.end_date || null,
      is_active: form.is_active,
    };

    try {
      setIsSubmitting(true);
      if (recurringId) {
        await updateRecurringIssue(workspaceSlug, projectId, recurringId, payload);
        setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: "Recurrence updated." });
      } else {
        await createRecurringIssue(workspaceSlug, projectId, payload);
        setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: "Recurrence created." });
      }
      handleClose();
    } catch (error) {
      const err = error as { data?: { error?: string } };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: err?.data?.error ?? "Recurrence could not be saved. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedTemplateName = form.template
    ? templateOptions.find((option) => option.value === form.template)?.query
    : undefined;

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} width={EModalWidth.XXL}>
      <div className="flex flex-col gap-4 p-5">
        <h3 className="text-lg font-medium text-primary">
          {recurringId ? "Edit recurrence" : "New recurrence"}
        </h3>

        {/* Name */}
        <div className="flex flex-col gap-1">
          <label className="text-sm text-secondary">Name</label>
          <Input
            type="text"
            value={form.name}
            onChange={(e) => setField("name", e.target.value)}
            placeholder="Weekly standup"
            className="w-full"
          />
        </div>

        {/* Template (payload source) */}
        <div className="flex flex-col gap-1">
          <label className="text-sm text-secondary">Template to recur</label>
          <CustomSearchSelect
            value={form.template}
            onChange={(value: string) => setField("template", value)}
            options={templateOptions}
            input
            label={selectedTemplateName ?? "Select a work item template"}
            buttonClassName="w-full justify-between"
            maxHeight="md"
          />
        </div>

        {/* Cadence + interval */}
        <div className="flex items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-secondary">Cadence</label>
            <CustomSelect
              value={form.cadence}
              onChange={(value: TRecurringCadence) => setField("cadence", value)}
              label={CADENCE_OPTIONS.find((option) => option.value === form.cadence)?.label ?? "Cadence"}
              buttonClassName="w-40 justify-between"
            >
              {CADENCE_OPTIONS.map((option) => (
                <CustomSelect.Option key={option.value} value={option.value}>
                  {option.label}
                </CustomSelect.Option>
              ))}
            </CustomSelect>
          </div>
          {form.cadence !== "cron" && (
            <div className="flex flex-col gap-1">
              <label className="text-sm text-secondary">Every</label>
              <Input
                type="number"
                min={1}
                value={form.interval}
                onChange={(e) => setField("interval", Math.max(1, Number(e.target.value) || 1))}
                className="w-24"
              />
            </div>
          )}
        </div>

        {/* Weekly -> weekday set */}
        {form.cadence === "weekly" && (
          <div className="flex flex-col gap-1">
            <label className="text-sm text-secondary">On days</label>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((day) => {
                const active = form.weekdays.includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleWeekday(day.value)}
                    className={cn(
                      "h-7 w-11 rounded border text-xs transition-colors",
                      active
                        ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
                        : "border-subtle text-secondary hover:bg-surface-2"
                    )}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Cron -> expression */}
        {form.cadence === "cron" && (
          <div className="flex flex-col gap-1">
            <label className="text-sm text-secondary">Cron expression</label>
            <Input
              type="text"
              value={form.cron_expression}
              onChange={(e) => setField("cron_expression", e.target.value)}
              placeholder="0 9 * * 1"
              className="w-full font-mono"
            />
          </div>
        )}

        {/* Start / end dates */}
        <div className="flex items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-secondary">Start date</label>
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

        {/* Active */}
        <div className="flex items-center gap-2">
          <ToggleSwitch value={form.is_active} onChange={(value) => setField("is_active", value)} />
          <span className="text-sm text-secondary">Active</span>
        </div>

        {/* Actions */}
        <div className="mt-2 flex items-center justify-end gap-2">
          <Button variant="neutral-primary" size="sm" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={() => void onSubmit()} loading={isSubmitting}>
            {recurringId ? "Update" : "Create"}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
