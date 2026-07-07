/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Recurring work items — mote.
// See docs/mote-design/03-work-item-power.md, section 3.4.
//
// Materialization history for a single recurrence, read from the runs
// endpoint (apps/api/plane/app/urls/recurring.py -> recurring-issue-runs).

import { useEffect } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { cn } from "@plane/utils";
// plane web imports
import { useRecurringIssues } from "@/plane-web/hooks/store/use-recurring-issues";

type TRunsListProps = {
  workspaceSlug: string;
  projectId: string;
  recurringId: string;
};

export const RecurringRunsList = observer(function RecurringRunsList(props: TRunsListProps) {
  const { workspaceSlug, projectId, recurringId } = props;
  // store hooks
  const { getRecurringIssueRuns, fetchRecurringIssueRuns } = useRecurringIssues();

  useSWR(
    workspaceSlug && projectId && recurringId ? `RECURRING_RUNS_${recurringId}` : null,
    workspaceSlug && projectId && recurringId
      ? () => fetchRecurringIssueRuns(workspaceSlug, projectId, recurringId)
      : null,
    { revalidateOnFocus: false }
  );

  useEffect(() => {
    // no-op; SWR drives the fetch. Kept for lint parity with sibling lists.
  }, [recurringId]);

  const runs = getRecurringIssueRuns(recurringId);

  if (runs.length === 0) {
    return <div className="px-4 py-3 text-xs text-tertiary">No runs yet.</div>;
  }

  return (
    <div className="flex flex-col divide-y divide-subtle">
      {runs.map((run) => (
        <div key={run.id} className="flex items-center justify-between px-4 py-2 text-xs">
          <span className="text-secondary">{new Date(run.run_at).toLocaleString()}</span>
          <span
            className={cn(
              "rounded px-1.5 py-0.5",
              run.status === "success" ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"
            )}
          >
            {run.status}
          </span>
        </div>
      ))}
    </div>
  );
});
