/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Teamspaces — mote.
// See docs/mote-design/05-teamspaces-access.md, section 1.
//
// Workspace-scoped store for teamspaces, mirroring the Initiative store
// (ce/store/initiative/initiative.store.ts). Holds a flat map of teams keyed by
// id, per-team maps of members / projects / work-items, and a per-workspace
// fetched flag.

import { orderBy, set, unset } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// services
import teamService from "@/services/team.service";
// plane web types
import type { TTeam, TTeamMember, TTeamProject } from "@/plane-web/types/teamspaces";
// store
import type { CoreRootStore } from "@/store/root.store";

export interface ITeamspaceStore {
  // observables
  loader: boolean;
  teamMap: Record<string, TTeam>;
  membersMap: Record<string, TTeamMember[]>;
  projectsMap: Record<string, TTeamProject[]>;
  workItemsMap: Record<string, unknown[]>;
  fetchedMap: Record<string, boolean>;
  // computed actions
  getTeamById: (teamId: string) => TTeam | undefined;
  getWorkspaceTeams: () => TTeam[];
  getTeamsForProject: (projectId: string) => TTeam[];
  getTeamMembers: (teamId: string) => TTeamMember[];
  getTeamProjects: (teamId: string) => TTeamProject[];
  getTeamWorkItems: (teamId: string) => unknown[];
  // fetch actions
  fetchTeams: (workspaceSlug: string) => Promise<TTeam[] | undefined>;
  fetchTeamById: (workspaceSlug: string, teamId: string) => Promise<TTeam | undefined>;
  fetchTeamMembers: (workspaceSlug: string, teamId: string) => Promise<TTeamMember[] | undefined>;
  fetchTeamProjects: (workspaceSlug: string, teamId: string) => Promise<TTeamProject[] | undefined>;
  fetchTeamWorkItems: (workspaceSlug: string, teamId: string) => Promise<unknown[] | undefined>;
  // CRUD actions
  createTeam: (workspaceSlug: string, payload: Partial<TTeam>) => Promise<TTeam | undefined>;
  updateTeam: (workspaceSlug: string, teamId: string, payload: Partial<TTeam>) => Promise<TTeam | undefined>;
  deleteTeam: (workspaceSlug: string, teamId: string) => Promise<void>;
  addTeamMembers: (workspaceSlug: string, teamId: string, memberIds: string[]) => Promise<TTeamMember[] | undefined>;
  removeTeamMember: (workspaceSlug: string, teamId: string, memberId: string) => Promise<void>;
  addTeamProjects: (
    workspaceSlug: string,
    teamId: string,
    projectIds: string[]
  ) => Promise<TTeamProject[] | undefined>;
  removeTeamProject: (workspaceSlug: string, teamId: string, projectId: string) => Promise<void>;
}

export class TeamspaceStore implements ITeamspaceStore {
  // observables
  loader: boolean = false;
  teamMap: Record<string, TTeam> = {};
  membersMap: Record<string, TTeamMember[]> = {};
  projectsMap: Record<string, TTeamProject[]> = {};
  workItemsMap: Record<string, unknown[]> = {};
  fetchedMap: Record<string, boolean> = {};
  // root store
  rootStore: CoreRootStore;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      // observables
      loader: observable.ref,
      teamMap: observable,
      membersMap: observable,
      projectsMap: observable,
      workItemsMap: observable,
      fetchedMap: observable,
      // fetch actions
      fetchTeams: action,
      fetchTeamById: action,
      fetchTeamMembers: action,
      fetchTeamProjects: action,
      fetchTeamWorkItems: action,
      // CRUD actions
      createTeam: action,
      updateTeam: action,
      deleteTeam: action,
      addTeamMembers: action,
      removeTeamMember: action,
      addTeamProjects: action,
      removeTeamProject: action,
    });
    this.rootStore = _rootStore;
  }

  /**
   * @description returns a single team by id
   */
  getTeamById = computedFn((teamId: string) => this.teamMap?.[teamId] ?? undefined);

  /**
   * @description teams for the workspace, ordered by name
   */
  getWorkspaceTeams = computedFn(() =>
    orderBy(Object.values(this.teamMap ?? {}), ["name", "created_at"], ["asc", "desc"])
  );

  /**
   * @description teams a given project belongs to (uses the cached project_ids rollup)
   */
  getTeamsForProject = computedFn((projectId: string) =>
    orderBy(
      Object.values(this.teamMap ?? {}).filter((team) => (team.project_ids ?? []).includes(projectId)),
      ["name"],
      ["asc"]
    )
  );

  /**
   * @description member rows for a team
   */
  getTeamMembers = computedFn((teamId: string) => this.membersMap?.[teamId] ?? []);

  /**
   * @description project rows for a team
   */
  getTeamProjects = computedFn((teamId: string) => this.projectsMap?.[teamId] ?? []);

  /**
   * @description work-item feed for a team
   */
  getTeamWorkItems = computedFn((teamId: string) => this.workItemsMap?.[teamId] ?? []);

  /**
   * @description fetches all teams for a workspace
   */
  fetchTeams = async (workspaceSlug: string): Promise<TTeam[] | undefined> => {
    try {
      this.loader = true;
      const response = await teamService.getTeams(workspaceSlug);
      runInAction(() => {
        (response ?? []).forEach((team) => {
          set(this.teamMap, [team.id], team);
        });
        set(this.fetchedMap, [workspaceSlug], true);
        this.loader = false;
      });
      return response;
    } catch (_error) {
      this.loader = false;
      return undefined;
    }
  };

  /**
   * @description fetches a single team by id and stores it
   */
  fetchTeamById = async (workspaceSlug: string, teamId: string): Promise<TTeam | undefined> => {
    const response = await teamService.getTeam(workspaceSlug, teamId);
    if (response) {
      runInAction(() => {
        set(this.teamMap, [response.id], response);
      });
    }
    return response;
  };

  /**
   * @description fetches the member rows for a team and stores them
   */
  fetchTeamMembers = async (workspaceSlug: string, teamId: string): Promise<TTeamMember[] | undefined> => {
    const response = await teamService.getTeamMembers(workspaceSlug, teamId);
    runInAction(() => {
      set(this.membersMap, [teamId], response ?? []);
    });
    return response;
  };

  /**
   * @description fetches the project rows for a team and stores them
   */
  fetchTeamProjects = async (workspaceSlug: string, teamId: string): Promise<TTeamProject[] | undefined> => {
    const response = await teamService.getTeamProjects(workspaceSlug, teamId);
    runInAction(() => {
      set(this.projectsMap, [teamId], response ?? []);
    });
    return response;
  };

  /**
   * @description fetches the team-scoped work-item feed and stores it
   */
  fetchTeamWorkItems = async (workspaceSlug: string, teamId: string): Promise<unknown[] | undefined> => {
    const response = await teamService.getTeamWorkItems(workspaceSlug, teamId);
    runInAction(() => {
      set(this.workItemsMap, [teamId], response ?? []);
    });
    return response;
  };

  /**
   * @description creates a new team and adds it to the store
   */
  createTeam = async (workspaceSlug: string, payload: Partial<TTeam>): Promise<TTeam | undefined> => {
    const response = await teamService.createTeam(workspaceSlug, payload);
    if (response) {
      runInAction(() => {
        set(this.teamMap, [response.id], response);
      });
    }
    return response;
  };

  /**
   * @description updates a team and refreshes it in the store
   */
  updateTeam = async (workspaceSlug: string, teamId: string, payload: Partial<TTeam>): Promise<TTeam | undefined> => {
    const response = await teamService.updateTeam(workspaceSlug, teamId, payload);
    if (response) {
      runInAction(() => {
        set(this.teamMap, [response.id], response);
      });
    }
    return response;
  };

  /**
   * @description deletes a team and removes it from the store
   */
  deleteTeam = async (workspaceSlug: string, teamId: string): Promise<void> => {
    await teamService.deleteTeam(workspaceSlug, teamId);
    runInAction(() => {
      unset(this.teamMap, [teamId]);
      unset(this.membersMap, [teamId]);
      unset(this.projectsMap, [teamId]);
      unset(this.workItemsMap, [teamId]);
    });
  };

  /**
   * @description adds members to a team, then refreshes the team (to sync member_ids)
   */
  addTeamMembers = async (
    workspaceSlug: string,
    teamId: string,
    memberIds: string[]
  ): Promise<TTeamMember[] | undefined> => {
    const response = await teamService.addTeamMembers(workspaceSlug, teamId, memberIds);
    if (response) {
      runInAction(() => {
        const existing = this.membersMap?.[teamId] ?? [];
        set(this.membersMap, [teamId], [...existing, ...response]);
      });
      // Refresh the team so the member_ids rollup reflects the new members.
      await this.fetchTeamById(workspaceSlug, teamId);
    }
    return response;
  };

  /**
   * @description removes a member from a team
   */
  removeTeamMember = async (workspaceSlug: string, teamId: string, memberId: string): Promise<void> => {
    await teamService.removeTeamMember(workspaceSlug, teamId, memberId);
    runInAction(() => {
      const existing = this.membersMap?.[teamId] ?? [];
      set(
        this.membersMap,
        [teamId],
        existing.filter((row) => row.member !== memberId)
      );
    });
    await this.fetchTeamById(workspaceSlug, teamId);
  };

  /**
   * @description adds projects to a team, then refreshes the team (to sync project_ids)
   */
  addTeamProjects = async (
    workspaceSlug: string,
    teamId: string,
    projectIds: string[]
  ): Promise<TTeamProject[] | undefined> => {
    const response = await teamService.addTeamProjects(workspaceSlug, teamId, projectIds);
    if (response) {
      runInAction(() => {
        const existing = this.projectsMap?.[teamId] ?? [];
        set(this.projectsMap, [teamId], [...existing, ...response]);
      });
      await this.fetchTeamById(workspaceSlug, teamId);
    }
    return response;
  };

  /**
   * @description removes a project from a team
   */
  removeTeamProject = async (workspaceSlug: string, teamId: string, projectId: string): Promise<void> => {
    await teamService.removeTeamProject(workspaceSlug, teamId, projectId);
    runInAction(() => {
      const existing = this.projectsMap?.[teamId] ?? [];
      set(
        this.projectsMap,
        [teamId],
        existing.filter((row) => row.project !== projectId)
      );
    });
    await this.fetchTeamById(workspaceSlug, teamId);
  };
}
