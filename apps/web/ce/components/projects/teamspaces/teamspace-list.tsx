/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Teamspaces — mote.
// See docs/mote-design/05-teamspaces-access.md, section 1.
//
// Replaces the inert CE stub (which returned null). Rendered on the project
// members settings page (members/page.tsx): lists the teamspaces this project
// belongs to, using the store's project_ids rollup.

import { observer } from "mobx-react";
import Link from "next/link";
import useSWR from "swr";
import { Users } from "lucide-react";
// plane web imports
import { useTeamspaces } from "@/plane-web/hooks/store/use-teamspaces";

export type TProjectTeamspaceList = {
  workspaceSlug: string;
  projectId: string;
};

export const ProjectTeamspaceList = observer(function ProjectTeamspaceList(props: TProjectTeamspaceList) {
  const { workspaceSlug, projectId } = props;
  // store hooks
  const { getTeamsForProject, fetchTeams } = useTeamspaces();

  // Fetch all workspace teams once; the store's project_ids rollup drives the filter.
  useSWR(
    workspaceSlug ? `WORKSPACE_TEAMSPACES_${workspaceSlug}` : null,
    workspaceSlug ? () => fetchTeams(workspaceSlug) : null,
    { revalidateOnFocus: false }
  );

  const teams = getTeamsForProject(projectId);

  if (teams.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 py-4">
      <h4 className="flex items-center gap-1.5 text-sm font-medium text-secondary">
        <Users className="size-4" /> Teamspaces
      </h4>
      <div className="flex flex-wrap gap-2">
        {teams.map((team) => (
          <Link
            key={team.id}
            href={`/${workspaceSlug}/teamspaces/${team.id}`}
            className="rounded-md border border-subtle bg-surface-1 px-3 py-1 text-sm text-primary transition-colors hover:border-strong"
          >
            {team.name}
          </Link>
        ))}
      </div>
    </div>
  );
});
