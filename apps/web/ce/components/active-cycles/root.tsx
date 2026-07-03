/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { ContentWrapper, Loader } from "@plane/ui";
// components
import { SimpleEmptyState } from "@/components/empty-state/simple-empty-state-root";
// constants
import { WORKSPACE_CYCLES } from "@/constants/fetch-keys";
// hooks
import { useCycle } from "@/hooks/store/use-cycle";
import { useWorkspace } from "@/hooks/store/use-workspace";
// local imports
import { WorkspaceActiveCycleCard } from "./cycle-card";

export const WorkspaceActiveCyclesRoot = observer(function WorkspaceActiveCyclesRoot() {
  const { t } = useTranslation();
  // store hooks
  const { currentWorkspace } = useWorkspace();
  const { cycleMap, fetchWorkspaceCycles } = useCycle();

  const workspaceSlug = currentWorkspace?.slug;

  const { isLoading } = useSWR(
    workspaceSlug ? WORKSPACE_CYCLES(workspaceSlug) : null,
    workspaceSlug ? () => fetchWorkspaceCycles(workspaceSlug) : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  if (!currentWorkspace || !workspaceSlug) return null;

  const activeCycleIds = Object.values(cycleMap)
    .filter((cycle) => cycle.workspace_id === currentWorkspace.id && cycle.status?.toLocaleLowerCase() === "current")
    .sort((a, b) => new Date(a.end_date ?? 0).getTime() - new Date(b.end_date ?? 0).getTime())
    .map((cycle) => cycle.id);

  if (isLoading && activeCycleIds.length === 0) {
    return (
      <ContentWrapper className="gap-5">
        <Loader className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
          <Loader.Item height="150px" />
          <Loader.Item height="150px" />
          <Loader.Item height="150px" />
        </Loader>
      </ContentWrapper>
    );
  }

  if (activeCycleIds.length === 0) {
    return (
      <ContentWrapper className="items-center justify-center">
        <SimpleEmptyState
          title={t("active_cycles")}
          description="None of your projects have a cycle running right now."
        />
      </ContentWrapper>
    );
  }

  return (
    <ContentWrapper className="gap-5">
      <div className="grid grid-cols-1 gap-5 pb-8 lg:grid-cols-2 xl:grid-cols-3">
        {activeCycleIds.map((cycleId) => (
          <WorkspaceActiveCycleCard key={cycleId} cycleId={cycleId} workspaceSlug={workspaceSlug} />
        ))}
      </div>
    </ContentWrapper>
  );
});
