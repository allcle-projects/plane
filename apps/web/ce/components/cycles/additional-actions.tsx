/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { setPromiseToast } from "@plane/propel/toast";
import { ToggleSwitch } from "@plane/ui";
// hooks
import { useCycle } from "@/hooks/store/use-cycle";
import { useUserPermissions } from "@/hooks/store/user";

type Props = {
  cycleId: string;
  projectId: string;
};

/**
 * Manual cycle lifecycle controls (mote): Start / Complete buttons driven by the
 * cycle's manual `state`, plus an "Auto-schedule next" toggle. Backend enforces
 * the same guards; this only renders for members/admins.
 */
export const CycleAdditionalActions = observer(function CycleAdditionalActions(props: Props) {
  const { cycleId, projectId } = props;
  // router
  const { workspaceSlug } = useParams();
  // store hooks
  const { getCycleById, startCycle, completeCycle, toggleAutoSchedule } = useCycle();
  const { allowPermissions } = useUserPermissions();
  // states
  const [isLoading, setIsLoading] = useState(false);

  const cycle = getCycleById(cycleId);
  const isEditingAllowed = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT
  );

  if (!cycle || !workspaceSlug || !isEditingAllowed) return null;

  const state = cycle.state;
  const canStart = state === "draft" || state === "upcoming";
  const canComplete = state === "current";

  const handleStart = () => {
    setIsLoading(true);
    const startPromise = startCycle(workspaceSlug.toString(), projectId, cycleId).finally(() => setIsLoading(false));
    setPromiseToast(startPromise, {
      loading: "Starting cycle...",
      success: { title: "Success", message: () => "Cycle started successfully." },
      error: { title: "Error", message: (err: any) => err?.error ?? "Failed to start the cycle." },
    });
  };

  const handleComplete = () => {
    setIsLoading(true);
    const completePromise = completeCycle(workspaceSlug.toString(), projectId, cycleId).finally(() =>
      setIsLoading(false)
    );
    setPromiseToast(completePromise, {
      loading: "Completing cycle...",
      success: { title: "Success", message: () => "Cycle completed successfully." },
      error: { title: "Error", message: (err: any) => err?.error ?? "Failed to complete the cycle." },
    });
  };

  const handleToggleAutoSchedule = (value: boolean) => {
    const togglePromise = toggleAutoSchedule(workspaceSlug.toString(), projectId, cycleId, value);
    setPromiseToast(togglePromise, {
      loading: "Updating auto-schedule...",
      success: { title: "Success", message: () => "Auto-schedule updated." },
      error: { title: "Error", message: (err: any) => err?.error ?? "Failed to update auto-schedule." },
    });
  };

  return (
    <div className="flex items-center gap-3">
      {state !== "completed" && (
        <div className="flex items-center gap-1.5 text-xs text-custom-text-300">
          <ToggleSwitch value={!!cycle.auto_schedule} onChange={handleToggleAutoSchedule} size="sm" />
          <span>Auto-schedule next</span>
        </div>
      )}
      {canStart && (
        <Button variant="primary" size="sm" onClick={handleStart} disabled={isLoading} loading={isLoading}>
          Start
        </Button>
      )}
      {canComplete && (
        <Button variant="secondary" size="sm" onClick={handleComplete} disabled={isLoading} loading={isLoading}>
          Complete
        </Button>
      )}
    </div>
  );
});
