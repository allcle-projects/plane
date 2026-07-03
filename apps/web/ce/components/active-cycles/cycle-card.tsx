/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { MouseEvent } from "react";
import { observer } from "mobx-react";
import { CalendarDays } from "lucide-react";
// plane imports
import { ProjectIcon } from "@plane/propel/icons";
import { CircularProgressIndicator, ControlLink } from "@plane/ui";
import { calculateCycleProgress } from "@plane/utils";
// components
import { SwitcherLabel } from "@/components/common/switcher-label";
import { MergedDateDisplay } from "@/components/dropdowns/merged-date";
// hooks
import { useCycle } from "@/hooks/store/use-cycle";
import { useProject } from "@/hooks/store/use-project";
import { useAppRouter } from "@/hooks/use-app-router";

type Props = {
  cycleId: string;
  workspaceSlug: string;
};

export const WorkspaceActiveCycleCard = observer(function WorkspaceActiveCycleCard(props: Props) {
  const { cycleId, workspaceSlug } = props;
  // router
  const router = useAppRouter();
  // store hooks
  const { getCycleById } = useCycle();
  const { getProjectById } = useProject();

  const cycle = getCycleById(cycleId);
  if (!cycle) return null;

  const project = getProjectById(cycle.project_id);
  const progress = calculateCycleProgress(cycle);
  const cycleLink = `/${workspaceSlug}/projects/${cycle.project_id}/cycles/${cycle.id}`;

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    router.push(cycleLink);
  };

  return (
    <ControlLink
      href={cycleLink}
      onClick={handleClick}
      className="flex flex-col gap-3 rounded-md border border-subtle bg-layer-1 p-4 hover:bg-layer-transparent-hover"
    >
      <SwitcherLabel name={project?.name} logo_props={project?.logo_props} LabelIcon={ProjectIcon} type="material" />
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate text-14 font-medium text-primary">{cycle.name}</h3>
        <CircularProgressIndicator size={30} percentage={progress} strokeWidth={3}>
          <span className="text-9 text-primary">{`${progress}%`}</span>
        </CircularProgressIndicator>
      </div>
      <div className="flex items-center gap-1 text-11 font-medium text-tertiary">
        <CalendarDays className="h-3 w-3 flex-shrink-0" />
        <MergedDateDisplay startDate={cycle.start_date} endDate={cycle.end_date} />
      </div>
      <div className="text-11 text-tertiary">
        {cycle.completed_issues + cycle.cancelled_issues}/{cycle.total_issues} work items closed
      </div>
    </ControlLink>
  );
});
