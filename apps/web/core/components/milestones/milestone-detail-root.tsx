/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Milestones — mote (Phase 2).
// See docs/mote-design/04-planning-hierarchy.md, section 2.
//
// Project-level detail surface: header (name, status, owner, dates, progress),
// the rollup stats grid, and the attached-work-items section with attach /
// detach. Analytics are refreshed on mount to keep the snapshot current.

import { useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Avatar, Button, Loader } from "@plane/ui";
import { getFileURL } from "@plane/utils";
// components
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
// hooks
import { useMember } from "@/hooks/store/use-member";
// services
import milestoneService from "@/services/milestone.service";
// plane web imports
import { useMilestones } from "@/plane-web/hooks/store/use-milestones";
import type { TMilestoneProgressSnapshot } from "@/plane-web/types/milestones";
// local imports
import { MilestoneStatusBadge } from "./helper";
import { IssueLinkModal } from "./issue-link-modal";
import { MilestoneModal } from "./milestone-modal";
import { MilestoneProgressBar } from "./milestone-progress-bar";

const STAT_TILES: { key: keyof TMilestoneProgressSnapshot; label: string }[] = [
  { key: "total_issues", label: "Total work items" },
  { key: "completed_issues", label: "Completed" },
  { key: "started_issues", label: "In progress" },
  { key: "unstarted_issues", label: "Unstarted" },
  { key: "backlog_issues", label: "Backlog" },
  { key: "cancelled_issues", label: "Cancelled" },
];

export const MilestoneDetailRoot = observer(function MilestoneDetailRoot() {
  // router params
  const { workspaceSlug, projectId, milestoneId } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const project = projectId?.toString() ?? "";
  const id = milestoneId?.toString() ?? "";
  // store hooks
  const {
    getMilestoneById,
    getMilestoneAnalytics,
    getMilestoneIssues,
    fetchMilestoneById,
    fetchMilestoneIssues,
    fetchMilestoneAnalytics,
    removeMilestoneIssue,
  } = useMilestones();
  const { getUserDetails } = useMember();
  // state
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isLinkOpen, setIsLinkOpen] = useState(false);

  useSWR(
    slug && project && id ? `MILESTONE_${slug}_${project}_${id}` : null,
    slug && project && id ? () => fetchMilestoneById(slug, project, id) : null,
    { revalidateOnFocus: false }
  );
  useSWR(
    slug && project && id ? `MILESTONE_ISSUES_${slug}_${project}_${id}` : null,
    slug && project && id ? () => fetchMilestoneIssues(slug, project, id) : null,
    { revalidateOnFocus: false }
  );
  useSWR(
    slug && project && id ? `MILESTONE_ANALYTICS_${slug}_${project}_${id}` : null,
    slug && project && id ? () => fetchMilestoneAnalytics(slug, project, id) : null,
    { revalidateOnFocus: false }
  );
  const { data: workItems } = useSWR(
    slug && project ? `PROJECT_WORK_ITEMS_${slug}_${project}` : null,
    slug && project ? () => milestoneService.getProjectWorkItems(slug, project) : null,
    { revalidateOnFocus: false }
  );

  const milestone = getMilestoneById(id);
  const analytics = getMilestoneAnalytics(id);
  const issueLinks = getMilestoneIssues(id);
  const workItemList = workItems ?? [];
  const workItemName = (issueId: string) => workItemList.find((issue) => issue.id === issueId)?.name ?? issueId;

  if (!milestone) {
    return (
      <ContentWrapper>
        <Loader className="flex flex-col gap-4">
          <Loader.Item height="40px" width="40%" />
          <Loader.Item height="16px" width="60%" />
          <Loader.Item height="120px" />
        </Loader>
      </ContentWrapper>
    );
  }

  const owner = milestone.owned_by ? getUserDetails(milestone.owned_by) : undefined;
  // prefer the freshly-fetched analytics, fall back to the cached snapshot
  const snapshot = analytics ?? milestone.progress_snapshot;

  const handleRemoveIssue = async (issueId: string) => {
    try {
      await removeMilestoneIssue(slug, project, id, issueId);
      await fetchMilestoneAnalytics(slug, project, id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: "Work item detached." });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Could not detach the work item." });
    }
  };

  return (
    <ContentWrapper>
      <PageHead title={milestone.name} />
      <div className="flex h-full w-full flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col gap-3 border-b border-subtle pb-4">
          <Link
            href={`/${slug}/projects/${project}/milestones`}
            className="flex w-fit items-center gap-1 text-xs text-tertiary hover:text-secondary"
          >
            <ArrowLeft className="size-3.5" /> Milestones
          </Link>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold text-primary">{milestone.name}</h2>
              <MilestoneStatusBadge status={milestone.status} />
            </div>
            <Button
              variant="neutral-primary"
              size="sm"
              prependIcon={<Pencil className="size-3.5" />}
              onClick={() => setIsEditOpen(true)}
            >
              Edit
            </Button>
          </div>

          {milestone.description && <p className="text-sm text-secondary">{milestone.description}</p>}

          <div className="flex flex-wrap items-center gap-4 text-xs text-tertiary">
            <div className="flex items-center gap-1.5">
              <span>Owner:</span>
              {owner ? (
                <span className="flex items-center gap-1.5 text-secondary">
                  <Avatar name={owner.display_name} src={getFileURL(owner.avatar_url ?? "")} size="sm" />
                  {owner.display_name}
                </span>
              ) : (
                <span>None</span>
              )}
            </div>
            <span>Start: {milestone.start_date ?? "—"}</span>
            <span>Due: {milestone.target_date ?? "—"}</span>
          </div>

          <MilestoneProgressBar snapshot={snapshot} className="max-w-md" />
        </div>

        {/* Rollup stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {STAT_TILES.map((tile) => (
            <div key={tile.key} className="flex flex-col gap-1 rounded-lg border border-subtle bg-surface-1 p-3">
              <span className="text-lg font-semibold text-primary">{snapshot?.[tile.key] ?? 0}</span>
              <span className="text-xs text-tertiary">{tile.label}</span>
            </div>
          ))}
        </div>

        {/* Attached work items */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-primary">Attached work items</h3>
            <Button
              variant="neutral-primary"
              size="sm"
              prependIcon={<Plus className="size-3.5" />}
              onClick={() => setIsLinkOpen(true)}
            >
              Add work items
            </Button>
          </div>

          {issueLinks.length === 0 ? (
            <div className="rounded border border-subtle px-4 py-8 text-center text-sm text-tertiary">
              No work items attached yet. Add work items to roll their progress up into this milestone.
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-subtle rounded border border-subtle">
              {issueLinks.map((link) => (
                <div key={link.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="truncate text-sm text-primary">{workItemName(link.issue)}</span>
                  <button
                    type="button"
                    onClick={() => void handleRemoveIssue(link.issue)}
                    className="text-tertiary hover:text-red-500"
                    aria-label="Detach work item"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <MilestoneModal
        isOpen={isEditOpen}
        workspaceSlug={slug}
        projectId={project}
        milestoneId={id}
        handleClose={() => setIsEditOpen(false)}
      />
      <IssueLinkModal
        isOpen={isLinkOpen}
        workspaceSlug={slug}
        projectId={project}
        milestoneId={id}
        workItems={workItemList}
        handleClose={() => setIsLinkOpen(false)}
      />
    </ContentWrapper>
  );
});
