/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { MouseEvent } from "react";
import { observer } from "mobx-react";
import { CalendarDays } from "lucide-react";
// plane imports
import { MODULE_STATUS_COLORS } from "@plane/constants";
import { CircularProgressIndicator, ControlLink } from "@plane/ui";
// components
import { MergedDateDisplay } from "@/components/dropdowns/merged-date";
// hooks
import { useModule } from "@/hooks/store/use-module";
import { useAppRouter } from "@/hooks/use-app-router";

type Props = {
  moduleId: string;
  workspaceSlug: string;
};

export const WorkspaceModuleCard = observer(function WorkspaceModuleCard(props: Props) {
  const { moduleId, workspaceSlug } = props;
  // router
  const router = useAppRouter();
  // store hooks
  const { getModuleById } = useModule();

  const moduleDetails = getModuleById(moduleId);
  if (!moduleDetails) return null;

  const progress = moduleDetails.total_issues
    ? Math.round(
        ((moduleDetails.completed_issues + moduleDetails.cancelled_issues) / moduleDetails.total_issues) * 100
      )
    : 0;
  const moduleLink = `/${workspaceSlug}/projects/${moduleDetails.project_id}/modules/${moduleDetails.id}`;
  const statusColor = moduleDetails.status ? MODULE_STATUS_COLORS[moduleDetails.status] : undefined;

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    router.push(moduleLink);
  };

  return (
    <ControlLink
      href={moduleLink}
      onClick={handleClick}
      className="flex flex-col gap-3 rounded-md border border-subtle bg-layer-1 p-4 hover:bg-layer-transparent-hover"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate text-14 font-medium text-primary">{moduleDetails.name}</h3>
        <CircularProgressIndicator size={30} percentage={progress} strokeWidth={3}>
          <span className="text-9 text-primary">{`${progress}%`}</span>
        </CircularProgressIndicator>
      </div>
      {statusColor && (
        <div className="flex items-center gap-1.5 text-11 font-medium text-tertiary">
          <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: statusColor }} />
          <span className="capitalize">{moduleDetails.status}</span>
        </div>
      )}
      <div className="flex items-center gap-1 text-11 font-medium text-tertiary">
        <CalendarDays className="h-3 w-3 flex-shrink-0" />
        <MergedDateDisplay startDate={moduleDetails.start_date} endDate={moduleDetails.target_date} />
      </div>
      <div className="text-11 text-tertiary">
        {moduleDetails.completed_issues + moduleDetails.cancelled_issues}/{moduleDetails.total_issues} work items closed
      </div>
    </ControlLink>
  );
});
