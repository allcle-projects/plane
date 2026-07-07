/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Recurring work items — mote (Phase 2).
// Project settings page listing recurrences + the schedule editor. Mirrors the
// estimates project settings page.

import { observer } from "mobx-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
// plane web imports
import { RecurringIssuesRoot } from "@/plane-web/components/issues/recurring";
// local imports
import type { Route } from "./+types/page";
import { RecurringProjectSettingsHeader } from "./header";

function RecurringSettingsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  // store
  const { currentProjectDetails } = useProject();
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();

  // derived values
  const pageTitle = currentProjectDetails?.name ? `${currentProjectDetails?.name} - Recurring` : undefined;
  const canPerformProjectAdminActions = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT);

  if (workspaceUserInfo && !canPerformProjectAdminActions) {
    return <NotAuthorizedView section="settings" isProjectView className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<RecurringProjectSettingsHeader />}>
      <PageHead title={pageTitle} />
      <div className="w-full">
        <RecurringIssuesRoot
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          isEditable={canPerformProjectAdminActions}
        />
      </div>
    </SettingsContentWrapper>
  );
}

export default observer(RecurringSettingsPage);
