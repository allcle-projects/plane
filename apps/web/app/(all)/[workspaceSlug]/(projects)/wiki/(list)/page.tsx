/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useSearchParams } from "next/navigation";
// plane imports
import type { TPageNavigationTabs } from "@plane/types";
// components
import { PageHead } from "@/components/core/page-title";
import { PagesListRoot } from "@/components/pages/list/root";
import { PagesListView } from "@/components/pages/pages-list-view";
// plane web hooks
import { EPageStoreType } from "@/plane-web/hooks/store";
import type { Route } from "./+types/page";

const getPageType = (pageType?: string | null): TPageNavigationTabs => {
  if (pageType === "private") return "private";
  if (pageType === "archived") return "archived";
  return "public";
};

function WorkspaceWikiPage({ params }: Route.ComponentProps) {
  // router
  const searchParams = useSearchParams();
  const type = searchParams.get("type");
  const { workspaceSlug } = params;
  // derived values
  const pageType = getPageType(type);

  return (
    <>
      <PageHead title="Wiki" />
      <PagesListView pageType={pageType} projectId="" storeType={EPageStoreType.WORKSPACE} workspaceSlug={workspaceSlug}>
        <PagesListRoot pageType={pageType} storeType={EPageStoreType.WORKSPACE} />
      </PagesListView>
    </>
  );
}

export default observer(WorkspaceWikiPage);
