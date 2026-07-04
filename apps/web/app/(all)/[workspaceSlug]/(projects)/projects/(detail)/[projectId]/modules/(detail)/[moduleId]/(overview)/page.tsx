/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "react-router";
import useSWR from "swr";
// components
import { ProjectModuleOverview } from "@/components/analytics/overview/project-module-overview";
import { PageHead } from "@/components/core/page-title";
// hooks
import { useModule } from "@/hooks/store/use-module";
import { useProject } from "@/hooks/store/use-project";

function ModuleOverviewPage() {
  const { workspaceSlug, projectId, moduleId } = useParams();
  // store hooks
  const { fetchModuleDetails, getModuleById } = useModule();
  const { getProjectById } = useProject();
  // fetch module details (mirrors the module issues page)
  useSWR(
    workspaceSlug && projectId && moduleId ? `CURRENT_MODULE_DETAILS_${moduleId}` : null,
    workspaceSlug && projectId && moduleId
      ? () => fetchModuleDetails(workspaceSlug.toString(), projectId.toString(), moduleId.toString())
      : null
  );
  // derived values
  const project = projectId ? getProjectById(projectId.toString()) : undefined;
  const projectModule = moduleId ? getModuleById(moduleId.toString()) : undefined;
  const pageTitle =
    project?.name && projectModule?.name ? `${project.name} - ${projectModule.name} - Overview` : undefined;

  if (!projectId || !moduleId) return null;

  return (
    <>
      <PageHead title={pageTitle} />
      <div className="h-full w-full overflow-y-auto">
        <ProjectModuleOverview projectId={projectId.toString()} moduleId={moduleId.toString()} />
      </div>
    </>
  );
}

export default observer(ModuleOverviewPage);
