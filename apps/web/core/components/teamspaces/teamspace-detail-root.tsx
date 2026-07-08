/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Teamspaces — mote.
// See docs/mote-design/05-teamspaces-access.md, section 1.
//
// Team home / detail: header (name, edit, delete), a members section and a
// projects section (each add/remove), and the team-scoped work-item feed
// (union of issues across the team's projects, access-scoped server-side).

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { FolderKanban, Pencil, Trash2, Users, X } from "lucide-react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Avatar, Button } from "@plane/ui";
import { getFileURL } from "@plane/utils";
// components
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { ProjectDropdown } from "@/components/dropdowns/project/dropdown";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
// plane web imports
import { useTeamspaces } from "@/plane-web/hooks/store/use-teamspaces";
// local imports
import { TeamspaceModal } from "./teamspace-modal";

type TWorkItem = { id: string; name: string; sequence_id?: number; project?: string };

type TTeamspaceDetailRootProps = {
  teamId: string;
};

export const TeamspaceDetailRoot = observer(function TeamspaceDetailRoot(props: TTeamspaceDetailRootProps) {
  const { teamId } = props;
  // router
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const router = useRouter();
  // store hooks
  const {
    getTeamById,
    getTeamWorkItems,
    fetchTeamById,
    fetchTeamMembers,
    fetchTeamProjects,
    fetchTeamWorkItems,
    addTeamMembers,
    removeTeamMember,
    addTeamProjects,
    removeTeamProject,
    deleteTeam,
  } = useTeamspaces();
  const { getUserDetails } = useMember();
  const { getProjectById } = useProject();
  // state
  const [isEditOpen, setIsEditOpen] = useState(false);

  useSWR(slug && teamId ? `TEAMSPACE_${slug}_${teamId}` : null, slug && teamId ? () => fetchTeamById(slug, teamId) : null);
  useSWR(
    slug && teamId ? `TEAMSPACE_MEMBERS_${slug}_${teamId}` : null,
    slug && teamId ? () => fetchTeamMembers(slug, teamId) : null
  );
  useSWR(
    slug && teamId ? `TEAMSPACE_PROJECTS_${slug}_${teamId}` : null,
    slug && teamId ? () => fetchTeamProjects(slug, teamId) : null
  );
  useSWR(
    slug && teamId ? `TEAMSPACE_WORKITEMS_${slug}_${teamId}` : null,
    slug && teamId ? () => fetchTeamWorkItems(slug, teamId) : null
  );

  const team = getTeamById(teamId);
  const workItems = getTeamWorkItems(teamId) as TWorkItem[];

  if (!team) {
    return (
      <ContentWrapper>
        <div className="flex flex-1 items-center justify-center text-sm text-tertiary">Loading teamspace…</div>
      </ContentWrapper>
    );
  }

  const memberIds = team.member_ids ?? [];
  const projectIds = team.project_ids ?? [];

  const onAddMembers = async (values: string[]) => {
    const toAdd = values.filter((v) => !memberIds.includes(v));
    if (toAdd.length === 0) return;
    try {
      await addTeamMembers(slug, teamId, toAdd);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Could not add members." });
    }
  };

  const onAddProjects = async (values: string[]) => {
    const toAdd = values.filter((v) => !projectIds.includes(v));
    if (toAdd.length === 0) return;
    try {
      await addTeamProjects(slug, teamId, toAdd);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Could not add projects." });
    }
  };

  const onDelete = async () => {
    try {
      await deleteTeam(slug, teamId);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: "Teamspace deleted." });
      router.push(`/${slug}/teamspaces`);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Could not delete teamspace." });
    }
  };

  return (
    <ContentWrapper>
      <PageHead title={team.name} />
      <div className="flex h-full w-full flex-col gap-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <h3 className="text-lg font-medium text-primary">{team.name}</h3>
            {team.description ? (
              <span className="text-sm text-tertiary">{team.description}</span>
            ) : (
              <span className="text-sm text-tertiary italic">No description</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="neutral-primary" size="sm" prependIcon={<Pencil className="size-3.5" />} onClick={() => setIsEditOpen(true)}>
              Edit
            </Button>
            <Button variant="danger" size="sm" prependIcon={<Trash2 className="size-3.5" />} onClick={() => void onDelete()}>
              Delete
            </Button>
          </div>
        </div>

        {/* Members */}
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h4 className="flex items-center gap-1.5 text-sm font-medium text-secondary">
              <Users className="size-4" /> Members ({memberIds.length})
            </h4>
            <MemberDropdown
              value={memberIds}
              onChange={(values: string[]) => void onAddMembers(values)}
              multiple
              buttonVariant="border-with-text"
              placeholder="Add members"
            />
          </div>
          <div className="flex flex-col divide-y divide-subtle rounded-md border border-subtle">
            {memberIds.length === 0 ? (
              <span className="px-3 py-2 text-sm text-tertiary">No members yet.</span>
            ) : (
              memberIds.map((id) => {
                const user = getUserDetails(id);
                return (
                  <div key={id} className="flex items-center justify-between px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Avatar name={user?.display_name} src={getFileURL(user?.avatar_url ?? "")} size="sm" />
                      <span className="text-sm text-primary">{user?.display_name ?? id}</span>
                    </div>
                    <button
                      type="button"
                      className="rounded-sm p-1 text-tertiary hover:bg-layer-1 hover:text-primary"
                      onClick={() => void removeTeamMember(slug, teamId, id)}
                      aria-label="Remove member"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Projects */}
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h4 className="flex items-center gap-1.5 text-sm font-medium text-secondary">
              <FolderKanban className="size-4" /> Projects ({projectIds.length})
            </h4>
            <ProjectDropdown
              value={projectIds}
              onChange={(values: string[]) => void onAddProjects(values)}
              multiple
              buttonVariant="border-with-text"
              placeholder="Add projects"
            />
          </div>
          <div className="flex flex-col divide-y divide-subtle rounded-md border border-subtle">
            {projectIds.length === 0 ? (
              <span className="px-3 py-2 text-sm text-tertiary">No projects yet.</span>
            ) : (
              projectIds.map((id) => {
                const project = getProjectById(id);
                return (
                  <div key={id} className="flex items-center justify-between px-3 py-2">
                    <span className="text-sm text-primary">{project?.name ?? id}</span>
                    <button
                      type="button"
                      className="rounded-sm p-1 text-tertiary hover:bg-layer-1 hover:text-primary"
                      onClick={() => void removeTeamProject(slug, teamId, id)}
                      aria-label="Remove project"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Work items (team-scoped feed) */}
        <section className="flex flex-col gap-2">
          <h4 className="text-sm font-medium text-secondary">Work items ({workItems.length})</h4>
          <div className="flex flex-col divide-y divide-subtle rounded-md border border-subtle">
            {workItems.length === 0 ? (
              <span className="px-3 py-2 text-sm text-tertiary">
                No work items across this team&apos;s projects (or none you can access).
              </span>
            ) : (
              workItems.slice(0, 100).map((item) => (
                <div key={item.id} className="flex items-center gap-2 px-3 py-2 text-sm text-primary">
                  <span className="truncate">{item.name}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <TeamspaceModal isOpen={isEditOpen} workspaceSlug={slug} teamId={teamId} handleClose={() => setIsEditOpen(false)} />
    </ContentWrapper>
  );
});
