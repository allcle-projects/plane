/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// components
import { Outlet } from "react-router";
import useSWR from "swr";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
// plane web hooks
import { EPageStoreType, usePageStore } from "@/plane-web/hooks/store";
// local components
import type { Route } from "./+types/layout";
import { WikiPagesListHeader } from "./header";

export default function WorkspaceWikiListLayout({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const { fetchPagesList } = usePageStore(EPageStoreType.WORKSPACE);
  // fetching workspace (global) pages list
  useSWR(workspaceSlug ? `WORKSPACE_PAGES_${workspaceSlug}` : null, () => fetchPagesList(workspaceSlug));
  return (
    <>
      <AppHeader header={<WikiPagesListHeader />} />
      <ContentWrapper>
        <Outlet />
      </ContentWrapper>
    </>
  );
}
