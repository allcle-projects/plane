/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Initiatives — mote.
// See docs/mote-design/04-planning-hierarchy.md, section 1.
//
// List card for a single initiative: name, lead avatar, status badge and the
// rollup progress bar. Navigates to the detail page on click.

import { observer } from "mobx-react";
import Link from "next/link";
// plane imports
import { Avatar } from "@plane/ui";
import { getFileURL } from "@plane/utils";
// hooks
import { useMember } from "@/hooks/store/use-member";
// plane web imports
import type { TInitiative } from "@/plane-web/types/initiatives";
// local imports
import { InitiativeStatusBadge } from "./helper";
import { InitiativeProgressBar } from "./initiative-progress-bar";

type TInitiativeCardProps = {
  workspaceSlug: string;
  initiative: TInitiative;
};

export const InitiativeCard = observer(function InitiativeCard(props: TInitiativeCardProps) {
  const { workspaceSlug, initiative } = props;
  // store hooks
  const { getUserDetails } = useMember();

  const lead = initiative.lead ? getUserDetails(initiative.lead) : undefined;

  return (
    <Link
      href={`/${workspaceSlug}/initiatives/${initiative.id}`}
      className="flex flex-col gap-3 rounded-lg border border-subtle bg-surface-1 p-4 transition-colors hover:border-strong"
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="truncate text-sm font-medium text-primary">{initiative.name}</h4>
        <InitiativeStatusBadge status={initiative.status} />
      </div>

      <InitiativeProgressBar snapshot={initiative.progress_snapshot} />

      <div className="flex items-center justify-between text-xs text-tertiary">
        <div className="flex items-center gap-1.5">
          {lead ? (
            <>
              <Avatar name={lead.display_name} src={getFileURL(lead.avatar_url ?? "")} size="sm" />
              <span className="truncate">{lead.display_name}</span>
            </>
          ) : (
            <span>No lead</span>
          )}
        </div>
        <span>
          {initiative.progress_snapshot?.total_projects ?? 0} project
          {(initiative.progress_snapshot?.total_projects ?? 0) === 1 ? "" : "s"}
        </span>
      </div>
    </Link>
  );
});
