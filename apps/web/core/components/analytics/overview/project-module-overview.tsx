/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useEffect, useState } from "react";
import { observer } from "mobx-react";
// plane package imports
import { Spinner } from "@plane/ui";
// hooks
import { useAnalytics } from "@/hooks/store/use-analytics";
// local imports
import AnalyticsWrapper from "../analytics-wrapper";
import TotalInsights from "../total-insights";
import CreatedVsResolved from "../work-items/created-vs-resolved";
import CustomizedInsights from "../work-items/customized-insights";
import WorkItemsInsightTable from "../work-items/workitems-insight-table";

type Props = {
  projectId: string;
  moduleId?: string;
};

/**
 * Project / Module overview analytics.
 *
 * Reuses the existing advance-analytics components in "peek view" mode. Setting
 * `isPeekView` + `selectedProjects` scopes every child request to the project's
 * advance-analytics endpoints, and `selectedModule` additionally scopes them to a
 * single module via the `module_id` query param (already supported by the backend).
 */
export const ProjectModuleOverview = observer(function ProjectModuleOverview({ projectId, moduleId }: Props) {
  const { updateSelectedProjects, updateSelectedModule, updateSelectedCycle, updateIsPeekView } = useAnalytics();
  const [isConfigured, setIsConfigured] = useState(false);

  useEffect(() => {
    updateIsPeekView(true);
    updateSelectedProjects(projectId ? [projectId] : []);
    updateSelectedModule(moduleId ?? "");
    setIsConfigured(true);

    // Reset the shared analytics store when leaving the overview.
    return () => {
      updateSelectedProjects([]);
      updateSelectedModule("");
      updateSelectedCycle("");
      updateIsPeekView(false);
    };
  }, [projectId, moduleId, updateSelectedProjects, updateSelectedModule, updateSelectedCycle, updateIsPeekView]);

  if (!isConfigured)
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );

  return (
    <AnalyticsWrapper i18nTitle="common.overview">
      <div className="flex flex-col gap-14">
        <TotalInsights analyticsType="work-items" />
        <CreatedVsResolved />
        <CustomizedInsights />
        <WorkItemsInsightTable />
      </div>
    </AnalyticsWrapper>
  );
});

export default ProjectModuleOverview;
