/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Milestones — mote (Phase 2).
// See docs/mote-design/04-planning-hierarchy.md, section 2.
//
// Project-level list surface: header + "New milestone" action, the grid of
// milestone cards, and the empty state.

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
import { useMilestones } from "@/plane-web/hooks/store/use-milestones";
// local imports
import { MilestoneCard } from "./milestone-card";
import { MilestoneModal } from "./milestone-modal";

export const MilestonesListRoot = observer(function MilestonesListRoot() {
  // router params
  const { workspaceSlug, projectId } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const project = projectId?.toString() ?? "";
  // store hooks
  const { getProjectMilestones, fetchMilestones } = useMilestones();
  // state
  const [isModalOpen, setIsModalOpen] = useState(false);

  useSWR(
    slug && project ? `PROJECT_MILESTONES_${slug}_${project}` : null,
    slug && project ? () => fetchMilestones(slug, project) : null,
    { revalidateOnFocus: false }
  );

  const milestones = getProjectMilestones(project);

  return (
    <ContentWrapper>
      <PageHead title="Milestones" />
      <div className="flex h-full w-full flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <h3 className="text-base font-medium text-primary">Milestones</h3>
            <span className="text-sm text-tertiary">
              Time-box goals within this project, attach work items and track the combined progress.
            </span>
          </div>
          <Button
            variant="primary"
            size="sm"
            prependIcon={<Plus className="size-3.5" />}
            onClick={() => setIsModalOpen(true)}
          >
            New milestone
          </Button>
        </div>

        {milestones.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-subtle py-16 text-center">
            <Target className="size-8 text-tertiary" />
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-secondary">No milestones yet</span>
              <span className="text-xs text-tertiary">Create one to group work items under a shared goal.</span>
            </div>
            <Button
              variant="primary"
              size="sm"
              prependIcon={<Plus className="size-3.5" />}
              onClick={() => setIsModalOpen(true)}
            >
              New milestone
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {milestones.map((milestone) => (
              <MilestoneCard key={milestone.id} workspaceSlug={slug} projectId={project} milestone={milestone} />
            ))}
          </div>
        )}
      </div>

      <MilestoneModal
        isOpen={isModalOpen}
        workspaceSlug={slug}
        projectId={project}
        handleClose={() => setIsModalOpen(false)}
      />
    </ContentWrapper>
  );
});
