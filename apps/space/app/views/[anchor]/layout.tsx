/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Outlet } from "react-router";
import useSWR from "swr";
// plane imports
import { SitesViewService } from "@plane/services";
// components
import { LogoSpinner } from "@/components/common/logo-spinner";
import { PoweredBy } from "@/components/common/powered-by";
import { SomethingWentWrongError } from "@/components/issues/issue-layouts/error";
import { PageNotFound } from "@/components/ui/not-found";

/**
 * Layout for the published-View anchor route — mote (docs/mote-design/02-wiki-publishing.md,
 * Feature 5). Mirrors `apps/space/app/issues/[anchor]/layout.tsx` (project publish) but resolves
 * the anchor against `entity_name="view"` via the new anon `view-meta` endpoint instead of the
 * project meta endpoint. Deliberately does not include a server loader/meta function (no SEO
 * requirement called out for view publishing) — just the anchor-resolution + not-found/error
 * states the project layout also handles.
 */
const viewService = new SitesViewService();

function ViewsLayout() {
  // params
  const params = useParams<{ anchor: string }>();
  const { anchor } = params;

  // fetch view meta (resolves the anchor -> project + view, 404s if unpublished)
  const { data: viewMeta, error } = useSWR(
    anchor ? `PUBLIC_VIEW_META_${anchor}` : null,
    anchor ? () => viewService.retrieveMetaByAnchor(anchor) : null
  );

  if (!viewMeta && !error) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-surface-1">
        <LogoSpinner />
      </div>
    );
  }

  if (error?.status === 404) return <PageNotFound />;

  if (error) return <SomethingWentWrongError />;

  return (
    <>
      <div className="relative flex h-screen min-h-[500px] w-screen flex-col overflow-hidden">
        <div className="relative flex h-[60px] shrink-0 items-center border-b border-subtle-1 bg-surface-1 px-4 select-none">
          <span className="truncate text-14 font-medium">{viewMeta?.view?.name}</span>
        </div>
        <div className="relative size-full overflow-y-auto bg-surface-2">
          <Outlet />
        </div>
      </div>
      <PoweredBy />
    </>
  );
}

export default observer(ViewsLayout);
