/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Recurring work items — mote.
// See docs/mote-design/03-work-item-power.md, section 3.4.
//
// Project-settings management surface: header + "New recurrence" action, the
// list of existing recurrences, and the schedule editor modal.

import { useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { Plus } from "lucide-react";
// plane imports
import { Button } from "@plane/ui";
// plane web imports
import { useRecurringIssues } from "@/plane-web/hooks/store/use-recurring-issues";
// local imports
import { RecurringList } from "./list";
import { RecurrenceModal } from "./recurrence-modal";

type TRootProps = {
  workspaceSlug: string;
  projectId: string;
  isEditable: boolean;
};

export const RecurringIssuesRoot = observer(function RecurringIssuesRoot(props: TRootProps) {
  const { workspaceSlug, projectId, isEditable } = props;
  // store hooks
  const { fetchRecurringIssues } = useRecurringIssues();
  // state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useSWR(
    workspaceSlug && projectId ? `RECURRING_ISSUES_${workspaceSlug}_${projectId}` : null,
    workspaceSlug && projectId ? () => fetchRecurringIssues(workspaceSlug, projectId) : null,
    { revalidateOnFocus: false }
  );

  const openCreate = () => {
    setEditingId(null);
    setIsModalOpen(true);
  };

  const openEdit = (recurringId: string) => {
    setEditingId(recurringId);
    setIsModalOpen(true);
  };

  const handleClose = () => {
    setIsModalOpen(false);
    setEditingId(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between border-b border-subtle pb-3">
        <div className="flex flex-col">
          <h3 className="text-base font-medium text-primary">Recurring work items</h3>
          <span className="text-sm text-tertiary">
            Auto-generate work items from a template on a daily, weekly, monthly, or cron schedule.
          </span>
        </div>
        {isEditable && (
          <Button variant="primary" size="sm" prependIcon={<Plus className="size-3.5" />} onClick={openCreate}>
            New recurrence
          </Button>
        )}
      </div>

      <RecurringList
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        isEditable={isEditable}
        onEdit={openEdit}
      />

      <RecurrenceModal
        isOpen={isModalOpen}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        recurringId={editingId}
        handleClose={handleClose}
      />
    </div>
  );
});
