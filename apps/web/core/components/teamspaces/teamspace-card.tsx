/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Teamspaces — mote.
// See docs/mote-design/05-teamspaces-access.md, section 1.
//
// List card for a single teamspace: name, lead avatar, member/project counts.
// Navigates to the detail (team home) page on click.

import { observer } from "mobx-react";
import Link from "next/link";
import { FolderKanban, Users } from "lucide-react";
// plane imports
import { Avatar } from "@plane/ui";
import { getFileURL } from "@plane/utils";
// hooks
import { useMember } from "@/hooks/store/use-member";
// plane web imports
import type { TTeam } from "@/plane-web/types/teamspaces";

type TTeamspaceCardProps = {
  workspaceSlug: string;
  team: TTeam;
};

export const TeamspaceCard = observer(function TeamspaceCard(props: TTeamspaceCardProps) {
  const { workspaceSlug, team } = props;
  // store hooks
  const { getUserDetails } = useMember();

  const lead = team.lead ? getUserDetails(team.lead) : undefined;
  const memberCount = team.member_ids?.length ?? 0;
  const projectCount = team.project_ids?.length ?? 0;

  return (
    <Link
      href={`/${workspaceSlug}/teamspaces/${team.id}`}
      className="flex flex-col gap-3 rounded-lg border border-subtle bg-surface-1 p-4 transition-colors hover:border-strong"
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="truncate text-sm font-medium text-primary">{team.name}</h4>
      </div>

      {team.description ? (
        <p className="line-clamp-2 text-xs text-tertiary">{team.description}</p>
      ) : (
        <p className="text-xs text-tertiary italic">No description</p>
      )}

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
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Users className="size-3.5" />
            {memberCount}
          </span>
          <span className="flex items-center gap-1">
            <FolderKanban className="size-3.5" />
            {projectCount}
          </span>
        </div>
      </div>
    </Link>
  );
});
