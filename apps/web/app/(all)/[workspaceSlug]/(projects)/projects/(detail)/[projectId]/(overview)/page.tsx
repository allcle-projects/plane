/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "react-router";
// components
import { ProjectModuleOverview } from "@/components/analytics/overview/project-module-overview";
import { PageHead } from "@/components/core/page-title";
// hooks
import { useProject } from "@/hooks/store/use-project";
// plane web imports
import { UpdatesPanel } from "@/plane-web/components/updates";

function ProjectOverviewPage() {
  const { workspaceSlug, projectId } = useParams();
  // store hooks
  const { getProjectById } = useProject();
  // derived values
  const project = projectId ? getProjectById(projectId.toString()) : undefined;
  const pageTitle = project?.name ? `${project.name} - Overview` : undefined;

  if (!projectId) return null;

  return (
    <>
      <PageHead title={pageTitle} />
      <div className="h-full w-full overflow-y-auto">
        <ProjectModuleOverview projectId={projectId.toString()} />
        <div className="mx-auto w-full max-w-5xl px-6 pb-10">
          <UpdatesPanel
            entityType="project"
            workspaceSlug={workspaceSlug!.toString()}
            projectId={projectId.toString()}
          />
        </div>
      </div>
    </>
  );
}

export default observer(ProjectOverviewPage);
