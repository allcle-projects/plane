/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Teamspaces — mote.
// See docs/mote-design/05-teamspaces-access.md, section 1.
//
// Workspace-level list surface: header + "New teamspace" action, the grid of
// teamspace cards, and the empty state.

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { Plus, Users } from "lucide-react";
// plane imports
import { Button } from "@plane/ui";
// components
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
// plane web imports
import { useTeamspaces } from "@/plane-web/hooks/store/use-teamspaces";
// local imports
import { TeamspaceCard } from "./teamspace-card";
import { TeamspaceModal } from "./teamspace-modal";

export const TeamspacesListRoot = observer(function TeamspacesListRoot() {
  // router params
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  // store hooks
  const { getWorkspaceTeams, fetchTeams } = useTeamspaces();
  // state
  const [isModalOpen, setIsModalOpen] = useState(false);

  useSWR(slug ? `WORKSPACE_TEAMSPACES_${slug}` : null, slug ? () => fetchTeams(slug) : null, {
    revalidateOnFocus: false,
  });

  const teams = getWorkspaceTeams();

  return (
    <ContentWrapper>
      <PageHead title="Teamspaces" />
      <div className="flex h-full w-full flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <h3 className="text-base font-medium text-primary">Teamspaces</h3>
            <span className="text-sm text-tertiary">
              Group members and projects into a team and track their combined work.
            </span>
          </div>
          <Button
            variant="primary"
            size="sm"
            prependIcon={<Plus className="size-3.5" />}
            onClick={() => setIsModalOpen(true)}
          >
            New teamspace
          </Button>
        </div>

        {teams.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-subtle py-16 text-center">
            <Users className="size-8 text-tertiary" />
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-secondary">No teamspaces yet</span>
              <span className="text-xs text-tertiary">Create one to group members and projects into a team.</span>
            </div>
            <Button
              variant="primary"
              size="sm"
              prependIcon={<Plus className="size-3.5" />}
              onClick={() => setIsModalOpen(true)}
            >
              New teamspace
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {teams.map((team) => (
              <TeamspaceCard key={team.id} workspaceSlug={slug} team={team} />
            ))}
          </div>
        )}
      </div>

      <TeamspaceModal isOpen={isModalOpen} workspaceSlug={slug} handleClose={() => setIsModalOpen(false)} />
    </ContentWrapper>
  );
});
