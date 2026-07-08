/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Initiatives — mote.
// See docs/mote-design/04-planning-hierarchy.md, section 1.
//
// Workspace-level detail surface: header (name, status, lead, dates, rollup
// progress), the linked-projects section with add / remove, and the rollup
// stats grid. Analytics are refreshed on mount to keep the snapshot current.

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
import { useProject } from "@/hooks/store/use-project";
// plane web imports
import { useInitiatives } from "@/plane-web/hooks/store/use-initiatives";
import type { TInitiativeProgressSnapshot } from "@/plane-web/types/initiatives";
// local imports
import { InitiativeStatusBadge } from "./helper";
import { InitiativeModal } from "./initiative-modal";
import { InitiativeProgressBar } from "./initiative-progress-bar";
import { ProjectLinkModal } from "./project-link-modal";

const STAT_TILES: { key: keyof TInitiativeProgressSnapshot; label: string }[] = [
  { key: "total_issues", label: "Total work items" },
  { key: "completed_issues", label: "Completed" },
  { key: "started_issues", label: "In progress" },
  { key: "unstarted_issues", label: "Unstarted" },
  { key: "backlog_issues", label: "Backlog" },
  { key: "total_projects", label: "Projects" },
];

export const InitiativeDetailRoot = observer(function InitiativeDetailRoot() {
  // router params
  const { workspaceSlug, initiativeId } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const id = initiativeId?.toString() ?? "";
  // store hooks
  const {
    getInitiativeById,
    getInitiativeAnalytics,
    getInitiativeProjects,
    fetchInitiativeById,
    fetchInitiativeProjects,
    fetchInitiativeAnalytics,
    removeInitiativeProject,
  } = useInitiatives();
  const { getUserDetails } = useMember();
  const { getProjectById } = useProject();
  // state
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isLinkOpen, setIsLinkOpen] = useState(false);

  useSWR(slug && id ? `INITIATIVE_${slug}_${id}` : null, slug && id ? () => fetchInitiativeById(slug, id) : null, {
    revalidateOnFocus: false,
  });
  useSWR(
    slug && id ? `INITIATIVE_PROJECTS_${slug}_${id}` : null,
    slug && id ? () => fetchInitiativeProjects(slug, id) : null,
    { revalidateOnFocus: false }
  );
  useSWR(
    slug && id ? `INITIATIVE_ANALYTICS_${slug}_${id}` : null,
    slug && id ? () => fetchInitiativeAnalytics(slug, id) : null,
    { revalidateOnFocus: false }
  );

  const initiative = getInitiativeById(id);
  const analytics = getInitiativeAnalytics(id);
  const projectLinks = getInitiativeProjects(id);

  if (!initiative) {
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

  const lead = initiative.lead ? getUserDetails(initiative.lead) : undefined;
  // prefer the freshly-fetched analytics, fall back to the cached snapshot
  const snapshot = analytics ?? initiative.progress_snapshot;

  const handleRemoveProject = async (projectId: string) => {
    try {
      await removeInitiativeProject(slug, id, projectId);
      await fetchInitiativeAnalytics(slug, id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: "Project unlinked." });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Could not unlink the project." });
    }
  };

  return (
    <ContentWrapper>
      <PageHead title={initiative.name} />
      <div className="flex h-full w-full flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col gap-3 border-b border-subtle pb-4">
          <Link
            href={`/${slug}/initiatives`}
            className="flex w-fit items-center gap-1 text-xs text-tertiary hover:text-secondary"
          >
            <ArrowLeft className="size-3.5" /> Initiatives
          </Link>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold text-primary">{initiative.name}</h2>
              <InitiativeStatusBadge status={initiative.status} />
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

          {initiative.description && <p className="text-sm text-secondary">{initiative.description}</p>}

          <div className="flex flex-wrap items-center gap-4 text-xs text-tertiary">
            <div className="flex items-center gap-1.5">
              <span>Lead:</span>
              {lead ? (
                <span className="flex items-center gap-1.5 text-secondary">
                  <Avatar name={lead.display_name} src={getFileURL(lead.avatar_url ?? "")} size="sm" />
                  {lead.display_name}
                </span>
              ) : (
                <span>None</span>
              )}
            </div>
            <span>Start: {initiative.start_date ?? "—"}</span>
            <span>End: {initiative.end_date ?? "—"}</span>
          </div>

          <InitiativeProgressBar snapshot={snapshot} className="max-w-md" />
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

        {/* Linked projects */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-primary">Projects</h3>
            <Button
              variant="neutral-primary"
              size="sm"
              prependIcon={<Plus className="size-3.5" />}
              onClick={() => setIsLinkOpen(true)}
            >
              Add project
            </Button>
          </div>

          {projectLinks.length === 0 ? (
            <div className="rounded border border-subtle px-4 py-8 text-center text-sm text-tertiary">
              No projects linked yet. Add a project to roll its work items up into this initiative.
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-subtle rounded border border-subtle">
              {projectLinks.map((link) => {
                const project = getProjectById(link.project);
                return (
                  <div key={link.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="truncate text-sm text-primary">{project?.name ?? link.project}</span>
                    <button
                      type="button"
                      onClick={() => void handleRemoveProject(link.project)}
                      className="text-tertiary hover:text-red-500"
                      aria-label="Unlink project"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <InitiativeModal
        isOpen={isEditOpen}
        workspaceSlug={slug}
        initiativeId={id}
        handleClose={() => setIsEditOpen(false)}
      />
      <ProjectLinkModal
        isOpen={isLinkOpen}
        workspaceSlug={slug}
        initiativeId={id}
        handleClose={() => setIsLinkOpen(false)}
      />
    </ContentWrapper>
  );
});
