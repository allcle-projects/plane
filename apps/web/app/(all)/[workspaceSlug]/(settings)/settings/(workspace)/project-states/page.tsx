/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Project States — mote (Phase 2).
// See docs/mote-design/04-planning-hierarchy.md, section 3.
//
// Workspace settings screen for project states. Mirrors the issue-state settings
// page (settings/projects/[projectId]/states/page.tsx) at the workspace scope.

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
// plane web components
import { WorkspaceProjectStateRoot } from "@/plane-web/components/workspace-project-states";
// local imports
import { ProjectStatesWorkspaceSettingsHeader } from "./header";

function ProjectStatesPage() {
  // router
  const { workspaceSlug } = useParams();
  // store hooks
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { currentWorkspace } = useWorkspace();
  const { t } = useTranslation();

  // derived values
  const canPerformWorkspaceAdminActions = allowPermissions(
    [EUserPermissions.ADMIN],
    EUserPermissionsLevel.WORKSPACE
  );
  const canPerformWorkspaceMemberActions = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE
  );
  const pageTitle = currentWorkspace?.name
    ? `${currentWorkspace.name} - ${t("workspace_settings.settings.project_states.title")}`
    : undefined;

  // if user is not authorized to view this page
  if (workspaceUserInfo && !canPerformWorkspaceMemberActions) {
    return <NotAuthorizedView section="settings" className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<ProjectStatesWorkspaceSettingsHeader />}>
      <PageHead title={pageTitle} />
      <div className="w-full">
        <SettingsHeading
          title={t("workspace_settings.settings.project_states.heading")}
          description={t("workspace_settings.settings.project_states.description")}
        />
        <div className="mt-6">
          {workspaceSlug && (
            <WorkspaceProjectStateRoot
              workspaceSlug={workspaceSlug.toString()}
              isEditable={canPerformWorkspaceAdminActions}
            />
          )}
        </div>
      </div>
    </SettingsContentWrapper>
  );
}

export default observer(ProjectStatesPage);
