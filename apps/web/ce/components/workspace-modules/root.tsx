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
import { WORKSPACE_MODULES } from "@/constants/fetch-keys";
// hooks
import { useModule } from "@/hooks/store/use-module";
import { useProject } from "@/hooks/store/use-project";
import { useWorkspace } from "@/hooks/store/use-workspace";
// local imports
import { WorkspaceModuleCard } from "./module-card";

export const WorkspaceModulesRoot = observer(function WorkspaceModulesRoot() {
  const { t } = useTranslation();
  // store hooks
  const { currentWorkspace } = useWorkspace();
  const { moduleMap, fetchWorkspaceModules } = useModule();
  const { getProjectById } = useProject();

  const workspaceSlug = currentWorkspace?.slug;

  const { isLoading } = useSWR(
    workspaceSlug ? WORKSPACE_MODULES(workspaceSlug) : null,
    workspaceSlug ? () => fetchWorkspaceModules(workspaceSlug) : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  if (!currentWorkspace || !workspaceSlug) return null;

  const moduleIds = Object.values(moduleMap)
    .filter((m) => m.workspace_id === currentWorkspace.id && !m.archived_at)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .map((m) => m.id);

  if (isLoading && moduleIds.length === 0) {
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

  if (moduleIds.length === 0) {
    return (
      <ContentWrapper className="items-center justify-center">
        <SimpleEmptyState title={t("modules")} description="None of your projects have any modules yet." />
      </ContentWrapper>
    );
  }

  const grouped: Record<string, string[]> = {};
  moduleIds.forEach((id) => {
    const m = moduleMap[id];
    if (!m) return;
    if (!grouped[m.project_id]) grouped[m.project_id] = [];
    grouped[m.project_id].push(id);
  });

  return (
    <ContentWrapper className="gap-5">
      <div className="flex flex-col gap-8 pb-8">
        {Object.entries(grouped).map(([projectId, ids]) => {
          const project = getProjectById(projectId);
          return (
            <div key={projectId} className="flex flex-col gap-3">
              <h3 className="text-14 font-semibold text-primary">{project?.name ?? "—"}</h3>
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
                {ids.map((moduleId) => (
                  <WorkspaceModuleCard key={moduleId} moduleId={moduleId} workspaceSlug={workspaceSlug} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </ContentWrapper>
  );
});
