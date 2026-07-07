/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Recurring work items — mote.
// See docs/mote-design/03-work-item-power.md, section 3.4.
//
// Project-settings list of recurrences: each row shows the cadence summary,
// next_run_at, an active toggle, edit / delete, and an expandable run history.

import { useState } from "react";
import { observer } from "mobx-react";
import { ChevronDown, ChevronRight, Pencil, Trash2 } from "lucide-react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { ToggleSwitch } from "@plane/ui";
import { cn } from "@plane/utils";
// plane web imports
import { useRecurringIssues } from "@/plane-web/hooks/store/use-recurring-issues";
import { useTemplates } from "@/plane-web/hooks/store/use-templates";
import type { TRecurringIssue } from "@/plane-web/types/recurring";
// local imports
import { RecurringRunsList } from "./runs-list";

type TListProps = {
  workspaceSlug: string;
  projectId: string;
  isEditable: boolean;
  onEdit: (recurringId: string) => void;
};

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const cadenceSummary = (recurring: TRecurringIssue): string => {
  const every = recurring.interval > 1 ? `every ${recurring.interval} ` : "every ";
  switch (recurring.cadence) {
    case "daily":
      return `${every}${recurring.interval > 1 ? "days" : "day"}`;
    case "weekly": {
      const days = (recurring.weekdays ?? []).map((d) => WEEKDAY_LABELS[d]).join(", ");
      return `${every}${recurring.interval > 1 ? "weeks" : "week"}${days ? ` on ${days}` : ""}`;
    }
    case "monthly":
      return `${every}${recurring.interval > 1 ? "months" : "month"}`;
    case "cron":
      return `cron: ${recurring.cron_expression ?? ""}`;
    default:
      return recurring.cadence;
  }
};

export const RecurringList = observer(function RecurringList(props: TListProps) {
  const { workspaceSlug, projectId, isEditable, onEdit } = props;
  // store hooks
  const { getProjectRecurringIssues, updateRecurringIssue, deleteRecurringIssue } = useRecurringIssues();
  const { getTemplateById } = useTemplates();
  // state
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const recurrences = getProjectRecurringIssues(projectId);

  if (recurrences.length === 0) {
    return (
      <div className="rounded border border-subtle px-4 py-8 text-center text-sm text-tertiary">
        No recurrences yet. Create one to auto-generate work items on a schedule.
      </div>
    );
  }

  const handleToggleActive = async (recurring: TRecurringIssue) => {
    try {
      await updateRecurringIssue(workspaceSlug, projectId, recurring.id, { is_active: !recurring.is_active });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Could not update the recurrence." });
    }
  };

  const handleDelete = async (recurring: TRecurringIssue) => {
    try {
      await deleteRecurringIssue(workspaceSlug, projectId, recurring.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: "Recurrence deleted." });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Could not delete the recurrence." });
    }
  };

  return (
    <div className="flex flex-col divide-y divide-subtle rounded border border-subtle">
      {recurrences.map((recurring) => {
        const isExpanded = expandedId === recurring.id;
        const templateName = recurring.template ? getTemplateById(recurring.template)?.name : undefined;
        return (
          <div key={recurring.id} className="flex flex-col">
            <div className="flex items-center gap-3 px-4 py-3">
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : recurring.id)}
                className="text-tertiary hover:text-secondary"
                aria-label="Toggle runs"
              >
                {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              </button>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-primary">{recurring.name}</span>
                <span className="truncate text-xs text-tertiary">
                  {cadenceSummary(recurring)}
                  {templateName ? ` · ${templateName}` : ""}
                </span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-xs text-secondary">Next run</span>
                <span className="text-xs text-tertiary">
                  {recurring.next_run_at ? new Date(recurring.next_run_at).toLocaleString() : "—"}
                </span>
              </div>
              <ToggleSwitch
                value={recurring.is_active}
                onChange={() => void handleToggleActive(recurring)}
                disabled={!isEditable}
              />
              <div className={cn("flex items-center gap-2", !isEditable && "pointer-events-none opacity-50")}>
                <button
                  type="button"
                  onClick={() => onEdit(recurring.id)}
                  className="text-tertiary hover:text-secondary"
                  aria-label="Edit recurrence"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(recurring)}
                  className="text-tertiary hover:text-red-500"
                  aria-label="Delete recurrence"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
            {isExpanded && (
              <div className="border-t border-subtle bg-surface-2">
                <RecurringRunsList
                  workspaceSlug={workspaceSlug}
                  projectId={projectId}
                  recurringId={recurring.id}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});
