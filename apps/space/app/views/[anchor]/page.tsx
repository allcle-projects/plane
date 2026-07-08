/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
// plane imports
import { STATE_GROUPS } from "@plane/constants";
import { SitesViewService } from "@plane/services";
import type { IPublicIssue, TStateGroups } from "@plane/types";

/**
 * Published-View anon issue feed — mote (docs/mote-design/02-wiki-publishing.md, Feature 5).
 *
 * DELIBERATELY renders a simple read-only list (title + state + assignee count) instead of
 * reusing `IssuesLayoutsRoot` (the full kanban/list/calendar board used by
 * `apps/space/app/issues/[anchor]/page.tsx`). That board is tightly coupled to project-scoped
 * anon plumbing that doesn't exist for views yet:
 *   - `usePublish`/`usePublishList` resolve settings via `/anchor/<anchor>/settings/`
 *     (`entity_name="project"` only) — a view's anchor has a *different* DeployBoard row, so
 *     those stores can't resolve it.
 *   - `useStates`/`useLabel` fetch full State/Label objects via project-anchor-scoped anon
 *     endpoints, which likewise don't exist for `entity_name="view"` anchors. Only
 *     `view-meta` / `view-settings` / `view-issues` are wired for views (see
 *     `apps/api/plane/space/urls/view.py`).
 * Without state/label/member resolution, we can only show what `view-issues` itself returns:
 * `state__group` (raw group key, not the state's display name) and `assignee_ids` (a count, not
 * resolved member names). Reusing the full board would silently show broken/empty
 * filters+properties instead of failing loudly, so the simpler list is the correctness-first
 * choice here.
 */
const viewService = new SitesViewService();

type TSimplePublicIssue = IPublicIssue & { state__group?: TStateGroups | null };

function ViewIssuesPage() {
  const params = useParams<{ anchor: string }>();
  const { anchor } = params;

  const { data: issuesResponse } = useSWR(
    anchor ? `PUBLIC_VIEW_ISSUES_${anchor}` : null,
    anchor ? () => viewService.listIssues(anchor, {}) : null
  );

  if (!issuesResponse) {
    return <div className="p-6 text-13 text-tertiary">Loading...</div>;
  }

  const issues: TSimplePublicIssue[] = Array.isArray(issuesResponse.results)
    ? (issuesResponse.results as TSimplePublicIssue[])
    : [];

  if (issues.length === 0) {
    return <div className="p-6 text-13 text-tertiary">No work items in this view.</div>;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="divide-y divide-subtle rounded-md border border-subtle bg-surface-1">
        {issues.map((issue) => {
          const stateGroup = issue.state__group ? STATE_GROUPS[issue.state__group] : undefined;
          const assigneeCount = issue.assignee_ids?.length ?? 0;

          return (
            <div key={issue.id} className="flex items-center gap-3 px-4 py-3">
              <span
                className="size-2 flex-shrink-0 rounded-full"
                style={{ backgroundColor: stateGroup?.color ?? "#d9d9d9" }}
              />
              <span className="flex-1 truncate text-13">{issue.name}</span>
              <span className="w-24 flex-shrink-0 text-11 text-tertiary">{stateGroup?.label ?? "—"}</span>
              <span className="w-28 flex-shrink-0 text-right text-11 text-tertiary">
                {assigneeCount > 0 ? `${assigneeCount} assignee${assigneeCount > 1 ? "s" : ""}` : "Unassigned"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default observer(ViewIssuesPage);
