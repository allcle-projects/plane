/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Initiatives — mote.
// See docs/mote-design/04-planning-hierarchy.md, section 1.
//
// Workspace-level list surface: header + "New initiative" action, the grid of
// initiative cards, and the empty state.

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { Plus, Target } from "lucide-react";
// plane imports
import { Button } from "@plane/ui";
// components
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
// plane web imports
import { useInitiatives } from "@/plane-web/hooks/store/use-initiatives";
// local imports
import { InitiativeCard } from "./initiative-card";
import { InitiativeModal } from "./initiative-modal";

export const InitiativesListRoot = observer(function InitiativesListRoot() {
  // router params
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  // store hooks
  const { getWorkspaceInitiatives, fetchInitiatives } = useInitiatives();
  // state
  const [isModalOpen, setIsModalOpen] = useState(false);

  useSWR(
    slug ? `WORKSPACE_INITIATIVES_${slug}` : null,
    slug ? () => fetchInitiatives(slug) : null,
    { revalidateOnFocus: false }
  );

  const initiatives = getWorkspaceInitiatives();

  return (
    <ContentWrapper>
      <PageHead title="Initiatives" />
      <div className="flex h-full w-full flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <h3 className="text-base font-medium text-primary">Initiatives</h3>
            <span className="text-sm text-tertiary">
              Group projects and epics under a top-level goal and track the combined rollup.
            </span>
          </div>
          <Button variant="primary" size="sm" prependIcon={<Plus className="size-3.5" />} onClick={() => setIsModalOpen(true)}>
            New initiative
          </Button>
        </div>

        {initiatives.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-subtle py-16 text-center">
            <Target className="size-8 text-tertiary" />
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-secondary">No initiatives yet</span>
              <span className="text-xs text-tertiary">Create one to group projects under a shared goal.</span>
            </div>
            <Button variant="primary" size="sm" prependIcon={<Plus className="size-3.5" />} onClick={() => setIsModalOpen(true)}>
              New initiative
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {initiatives.map((initiative) => (
              <InitiativeCard key={initiative.id} workspaceSlug={slug} initiative={initiative} />
            ))}
          </div>
        )}
      </div>

      <InitiativeModal isOpen={isModalOpen} workspaceSlug={slug} handleClose={() => setIsModalOpen(false)} />
    </ContentWrapper>
  );
});
