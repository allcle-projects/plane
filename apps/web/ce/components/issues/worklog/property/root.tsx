/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { Clock, Pause, Play, Plus } from "lucide-react";
import useSWR from "swr";
// plane imports
import { Popover } from "@plane/propel/popover";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { convertMinutesToHoursMinutesString } from "@plane/utils";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// local imports
import { WorklogEntryForm } from "../form";

type TIssueWorklogProperty = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
};

const formatDuration = (minutes: number) => {
  if (!minutes) return "0m";
  return convertMinutesToHoursMinutesString(minutes).trim();
};

export const IssueWorklogProperty = observer(function IssueWorklogProperty(props: TIssueWorklogProperty) {
  const { workspaceSlug, projectId, issueId, disabled } = props;
  // states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isTimerLoading, setIsTimerLoading] = useState(false);
  const [now, setNow] = useState(Date.now());
  // store hooks
  const {
    fetchWorklogs,
    fetchTimer,
    startTimer,
    stopTimer,
    worklog: { getTotalWorklogByIssueId, getRunningTimerByIssueId },
  } = useIssueDetail();
  // fetch worklogs + running timer
  useSWR(
    workspaceSlug && projectId && issueId ? `ISSUE_WORKLOGS_${workspaceSlug}_${projectId}_${issueId}` : null,
    workspaceSlug && projectId && issueId
      ? async () => {
          await Promise.all([
            fetchWorklogs(workspaceSlug, projectId, issueId),
            fetchTimer(workspaceSlug, projectId, issueId),
          ]);
        }
      : null
  );
  // derived values
  const totalLogged = getTotalWorklogByIssueId(issueId);
  const runningTimer = getRunningTimerByIssueId(issueId);

  // tick while a timer is running so the elapsed time updates live
  useEffect(() => {
    if (!runningTimer) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [runningTimer]);

  const elapsedMinutes = runningTimer
    ? Math.max(0, Math.floor((now - new Date(runningTimer.started_at).getTime()) / 60000))
    : 0;

  const handleTimer = async () => {
    setIsTimerLoading(true);
    try {
      if (runningTimer) {
        await stopTimer(workspaceSlug, projectId, issueId);
        setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: "Timer stopped and time logged." });
      } else {
        await startTimer(workspaceSlug, projectId, issueId);
        setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: "Timer started." });
      }
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Could not update the timer. Please try again." });
    } finally {
      setIsTimerLoading(false);
    }
  };

  return (
    <div className="flex items-start gap-2">
      <div className="flex h-7.5 w-30 shrink-0 items-center gap-1.5 text-body-xs-regular text-tertiary">
        <Clock className="size-4 shrink-0" />
        <span>Time tracked</span>
      </div>
      <div className="flex min-h-7.5 grow flex-wrap items-center gap-2">
        <span className="text-body-xs-regular text-primary">{formatDuration(totalLogged)}</span>
        {runningTimer && (
          <span className="text-caption-sm-regular text-accent-primary">running · {formatDuration(elapsedMinutes)}</span>
        )}
        {!disabled && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleTimer}
              disabled={isTimerLoading}
              className="grid place-items-center rounded-sm p-1 text-tertiary outline-none hover:bg-layer-1 hover:text-secondary disabled:opacity-50"
              title={runningTimer ? "Stop timer" : "Start timer"}
            >
              {runningTimer ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            </button>
            <Popover open={isFormOpen} onOpenChange={setIsFormOpen}>
              <Popover.Button
                className="grid place-items-center rounded-sm p-1 text-tertiary outline-none hover:bg-layer-1 hover:text-secondary"
                title="Log time"
              >
                <Plus className="size-3.5" />
              </Popover.Button>
              <Popover.Panel side="bottom" align="end">
                <div className="w-64 rounded-lg border-[0.5px] border-strong bg-surface-1 p-3 shadow-raised-200">
                  <WorklogEntryForm
                    workspaceSlug={workspaceSlug}
                    projectId={projectId}
                    issueId={issueId}
                    onClose={() => setIsFormOpen(false)}
                  />
                </div>
              </Popover.Panel>
            </Popover>
          </div>
        )}
      </div>
    </div>
  );
});
