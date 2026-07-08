/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Updates — mote.
// See docs/mote-design/04-planning-hierarchy.md, section 4.
//
// Lean status composer: health select + completion percentage + a plain
// textarea (writes the ``description`` string, leaves ``description_html``
// null). No rich-text editor by design — rich text is a v2 upgrade.

import { useState } from "react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Button } from "@plane/ui";
// plane web imports
import type { TUpdateFormData, TUpdateStatus } from "@/plane-web/types/updates";
// local imports
import { UPDATE_STATUS_OPTIONS } from "./helper";

type TUpdateComposerProps = {
  onSubmit: (data: TUpdateFormData) => Promise<void>;
};

const DEFAULT_FORM: TUpdateFormData = {
  status: "on-track",
  description: "",
  completed_percentage: 0,
};

export function UpdateComposer({ onSubmit }: TUpdateComposerProps) {
  const [form, setForm] = useState<TUpdateFormData>(DEFAULT_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setField = <K extends keyof TUpdateFormData>(key: K, value: TUpdateFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    if (!form.description.trim()) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Write a short status before posting." });
      return;
    }

    const clamped = Math.min(100, Math.max(0, Math.round(form.completed_percentage || 0)));
    const payload: TUpdateFormData = {
      status: form.status,
      description: form.description.trim(),
      completed_percentage: clamped,
    };

    try {
      setIsSubmitting(true);
      await onSubmit(payload);
      setForm(DEFAULT_FORM);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: "Update posted." });
    } catch (error) {
      const err = error as { error?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: err?.error ?? "Update could not be posted. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-subtle bg-surface-1 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-secondary">Health</label>
          <select
            value={form.status}
            onChange={(e) => setField("status", e.target.value as TUpdateStatus)}
            className="h-8 rounded-md border border-subtle bg-transparent px-2 text-sm text-primary outline-none focus:border-accent-primary"
          >
            {UPDATE_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-secondary">Completion %</label>
          <input
            type="number"
            min={0}
            max={100}
            value={form.completed_percentage}
            onChange={(e) => setField("completed_percentage", Number(e.target.value))}
            className="h-8 w-24 rounded-md border border-subtle bg-transparent px-2 text-sm text-primary outline-none focus:border-accent-primary"
          />
        </div>
      </div>

      <textarea
        value={form.description}
        onChange={(e) => setField("description", e.target.value)}
        placeholder="What changed since the last update?"
        rows={3}
        className="w-full resize-none rounded-md border border-subtle bg-transparent px-3 py-2 text-sm text-primary outline-none focus:border-accent-primary"
      />

      <div className="flex items-center justify-end">
        <Button variant="primary" size="sm" onClick={() => void handleSubmit()} loading={isSubmitting}>
          Post update
        </Button>
      </div>
    </div>
  );
}
