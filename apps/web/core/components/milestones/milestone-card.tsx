/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Milestones — mote (Phase 2).
// See docs/mote-design/04-planning-hierarchy.md, section 2.
//
// List card for a single milestone: name, owner avatar, status badge, target
// date and the progress bar. Navigates to the detail page on click.

import { observer } from "mobx-react";
import Link from "next/link";
// plane imports
import { Avatar } from "@plane/ui";
import { getFileURL } from "@plane/utils";
// hooks
import { useMember } from "@/hooks/store/use-member";
// plane web imports
import type { TMilestone } from "@/plane-web/types/milestones";
// local imports
import { MilestoneStatusBadge } from "./helper";
import { MilestoneProgressBar } from "./milestone-progress-bar";

type TMilestoneCardProps = {
  workspaceSlug: string;
  projectId: string;
  milestone: TMilestone;
};

export const MilestoneCard = observer(function MilestoneCard(props: TMilestoneCardProps) {
  const { workspaceSlug, projectId, milestone } = props;
  // store hooks
  const { getUserDetails } = useMember();

  const owner = milestone.owned_by ? getUserDetails(milestone.owned_by) : undefined;

  return (
    <Link
      href={`/${workspaceSlug}/projects/${projectId}/milestones/${milestone.id}`}
      className="flex flex-col gap-3 rounded-lg border border-subtle bg-surface-1 p-4 transition-colors hover:border-strong"
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="truncate text-sm font-medium text-primary">{milestone.name}</h4>
        <MilestoneStatusBadge status={milestone.status} />
      </div>

      <MilestoneProgressBar snapshot={milestone.progress_snapshot} />

      <div className="flex items-center justify-between text-xs text-tertiary">
        <div className="flex items-center gap-1.5">
          {owner ? (
            <>
              <Avatar name={owner.display_name} src={getFileURL(owner.avatar_url ?? "")} size="sm" />
              <span className="truncate">{owner.display_name}</span>
            </>
          ) : (
            <span>No owner</span>
          )}
        </div>
        <span>Due {milestone.target_date ?? "—"}</span>
      </div>
    </Link>
  );
});
