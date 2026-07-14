/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// components
import { PageHead } from "@/components/core/page-title";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
// plane web components
import { WorkspaceModulesRoot } from "@/plane-web/components/workspace-modules";

function WorkspaceModulesPage() {
  const { currentWorkspace } = useWorkspace();
  // derived values
  const pageTitle = currentWorkspace?.name ? `${currentWorkspace?.name} - Modules` : undefined;

  return (
    <>
      <PageHead title={pageTitle} />
      <WorkspaceModulesRoot />
    </>
  );
}

export default observer(WorkspaceModulesPage);
