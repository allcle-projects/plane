/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { LayoutGrid } from "lucide-react";
import useSWR from "swr";
// plane imports
import { EUserPermissionsLevel, EUserPermissions } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EmptyStateDetailed } from "@plane/propel/empty-state";
import { ContentWrapper } from "@plane/ui";
// components
import { calculateTotalFilters } from "@plane/utils";
import { ProjectsLoader } from "@/components/ui/loader/projects-loader";
// hooks
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useProject } from "@/hooks/store/use-project";
import { useProjectFilter } from "@/hooks/store/use-project-filter";
import { useUserPermissions } from "@/hooks/store/user";
// plane web hooks — Project States (mote, docs/mote-design/04-planning-hierarchy.md §3)
import { useWorkspaceProjectStates } from "@/plane-web/hooks/store/use-workspace-project-states";
// local imports
import { ProjectCard } from "./card";

type TProjectCardListProps = {
  totalProjectIds?: string[];
  filteredProjectIds?: string[];
};

export const ProjectCardList = observer(function ProjectCardList(props: TProjectCardListProps) {
  const { totalProjectIds: totalProjectIdsProps, filteredProjectIds: filteredProjectIdsProps } = props;
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { toggleCreateProjectModal } = useCommandPalette();
  const {
    loader,
    fetchStatus,
    workspaceProjectIds: storeWorkspaceProjectIds,
    filteredProjectIds: storeFilteredProjectIds,
    getProjectById,
  } = useProject();
  const { currentWorkspaceDisplayFilters, currentWorkspaceFilters } = useProjectFilter();
  const { allowPermissions } = useUserPermissions();
  // Project States (mote) — group-by-status support.
  const { workspaceSlug } = useParams();
  const { getProjectStatesForWorkspace, fetchProjectStates } = useWorkspaceProjectStates();
  const [groupByStatus, setGroupByStatus] = useState(false);

  // fetch project states so cards can render their status badge and grouping
  useSWR(
    workspaceSlug ? `WORKSPACE_PROJECT_STATES_${workspaceSlug}` : null,
    workspaceSlug ? () => fetchProjectStates(workspaceSlug.toString()) : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  // derived values
  const workspaceProjectIds = totalProjectIdsProps ?? storeWorkspaceProjectIds;
  const filteredProjectIds = filteredProjectIdsProps ?? storeFilteredProjectIds;
  const projectStates = workspaceSlug ? getProjectStatesForWorkspace(workspaceSlug.toString()) : [];

  // permissions
  const canPerformEmptyStateActions = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE
  );

  if (!filteredProjectIds || !workspaceProjectIds || loader === "init-loader" || fetchStatus !== "complete")
    return <ProjectsLoader />;

  if (workspaceProjectIds?.length === 0 && !currentWorkspaceDisplayFilters?.archived_projects)
    return (
      <EmptyStateDetailed
        title={t("workspace_projects.empty_state.general.title")}
        description={t("workspace_projects.empty_state.general.description")}
        assetKey="project"
        assetClassName="size-40"
        actions={[
          {
            label: t("workspace_projects.empty_state.general.primary_button.text"),
            onClick: () => {
              toggleCreateProjectModal(true);
            },
            disabled: !canPerformEmptyStateActions,
            variant: "primary",
          },
        ]}
      />
    );

  if (filteredProjectIds.length === 0)
    return (
      <EmptyStateDetailed
        title={
          currentWorkspaceDisplayFilters?.archived_projects &&
          calculateTotalFilters(currentWorkspaceFilters ?? {}) === 0
            ? t("workspace_empty_state.projects_archived.title")
            : t("common_empty_state.search.title")
        }
        description={
          currentWorkspaceDisplayFilters?.archived_projects &&
          calculateTotalFilters(currentWorkspaceFilters ?? {}) === 0
            ? t("workspace_empty_state.projects_archived.description")
            : t("common_empty_state.search.description")
        }
        assetKey={
          currentWorkspaceDisplayFilters?.archived_projects &&
          calculateTotalFilters(currentWorkspaceFilters ?? {}) === 0
            ? "archived-work-item"
            : "search"
        }
        assetClassName="size-40"
      />
    );

  // Ordered status buckets (by state sequence) + a trailing "No status" bucket.
  const groupedProjectIds: { key: string; label: string; color?: string; projectIds: string[] }[] = [];
  if (groupByStatus) {
    projectStates.forEach((state) => {
      const bucketIds = filteredProjectIds.filter((projectId) => getProjectById(projectId)?.state === state.id);
      if (bucketIds.length > 0)
        groupedProjectIds.push({ key: state.id, label: state.name, color: state.color, projectIds: bucketIds });
    });
    const stateIds = new Set(projectStates.map((state) => state.id));
    const noStatusIds = filteredProjectIds.filter((projectId) => {
      const stateId = getProjectById(projectId)?.state;
      return !stateId || !stateIds.has(stateId);
    });
    if (noStatusIds.length > 0)
      groupedProjectIds.push({ key: "no-status", label: "No status", projectIds: noStatusIds });
  }

  return (
    <ContentWrapper>
      {projectStates.length > 0 && (
        <div className="flex items-center justify-end">
          <Button
            variant={groupByStatus ? "primary" : "secondary"}
            size="sm"
            prependIcon={<LayoutGrid className="h-3.5 w-3.5" />}
            onClick={() => setGroupByStatus((prev) => !prev)}
          >
            Group by status
          </Button>
        </div>
      )}
      {groupByStatus ? (
        <div className="flex flex-col gap-8">
          {groupedProjectIds.map((group) => (
            <div key={group.key} className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: group.color ?? "#60646C" }}
                />
                <h4 className="text-13 font-medium text-secondary">{group.label}</h4>
                <span className="text-11 text-placeholder">{group.projectIds.length}</span>
              </div>
              <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
                {group.projectIds.map((projectId) => {
                  const projectDetails = getProjectById(projectId);
                  if (!projectDetails) return null;
                  return <ProjectCard key={projectDetails.id} project={projectDetails} />;
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {filteredProjectIds.map((projectId) => {
            const projectDetails = getProjectById(projectId);
            if (!projectDetails) return;
            return <ProjectCard key={projectDetails.id} project={projectDetails} />;
          })}
        </div>
      )}
    </ContentWrapper>
  );
});
