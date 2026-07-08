/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/* eslint-disable no-useless-catch */

// Teamspaces — mote.
// See docs/mote-design/05-teamspaces-access.md, section 1.
// Hits the workspace-scoped teamspace CRUD + member/project link + work-item
// aggregation endpoints registered in apps/api/plane/app/urls/team.py.

import { API_BASE_URL } from "@plane/constants";
// plane web types
import type { TTeam, TTeamMember, TTeamProject } from "@/plane-web/types/teamspaces";
// services
import { APIService } from "@/services/api.service";

export class TeamService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  // Team CRUD ---------------------------------------------------------------

  async getTeams(workspaceSlug: string, projectId?: string): Promise<TTeam[] | undefined> {
    try {
      const url = `/api/workspaces/${workspaceSlug}/teamspaces/`;
      const { data } = await this.get(projectId ? `${url}?project_id=${projectId}` : url);
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async createTeam(workspaceSlug: string, payload: Partial<TTeam>): Promise<TTeam | undefined> {
    try {
      const { data } = await this.post(`/api/workspaces/${workspaceSlug}/teamspaces/`, payload);
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async getTeam(workspaceSlug: string, teamId: string): Promise<TTeam | undefined> {
    try {
      const { data } = await this.get(`/api/workspaces/${workspaceSlug}/teamspaces/${teamId}/`);
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async updateTeam(workspaceSlug: string, teamId: string, payload: Partial<TTeam>): Promise<TTeam | undefined> {
    try {
      const { data } = await this.patch(`/api/workspaces/${workspaceSlug}/teamspaces/${teamId}/`, payload);
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async deleteTeam(workspaceSlug: string, teamId: string): Promise<void> {
    try {
      await this.delete(`/api/workspaces/${workspaceSlug}/teamspaces/${teamId}/`);
    } catch (error) {
      throw error;
    }
  }

  // Members -----------------------------------------------------------------

  async getTeamMembers(workspaceSlug: string, teamId: string): Promise<TTeamMember[] | undefined> {
    try {
      const { data } = await this.get(`/api/workspaces/${workspaceSlug}/teamspaces/${teamId}/members/`);
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async addTeamMembers(
    workspaceSlug: string,
    teamId: string,
    memberIds: string[]
  ): Promise<TTeamMember[] | undefined> {
    try {
      const { data } = await this.post(`/api/workspaces/${workspaceSlug}/teamspaces/${teamId}/members/`, {
        member_ids: memberIds,
      });
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async removeTeamMember(workspaceSlug: string, teamId: string, memberId: string): Promise<void> {
    try {
      await this.delete(`/api/workspaces/${workspaceSlug}/teamspaces/${teamId}/members/${memberId}/`);
    } catch (error) {
      throw error;
    }
  }

  // Projects ----------------------------------------------------------------

  async getTeamProjects(workspaceSlug: string, teamId: string): Promise<TTeamProject[] | undefined> {
    try {
      const { data } = await this.get(`/api/workspaces/${workspaceSlug}/teamspaces/${teamId}/projects/`);
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async addTeamProjects(
    workspaceSlug: string,
    teamId: string,
    projectIds: string[]
  ): Promise<TTeamProject[] | undefined> {
    try {
      const { data } = await this.post(`/api/workspaces/${workspaceSlug}/teamspaces/${teamId}/projects/`, {
        project_ids: projectIds,
      });
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async removeTeamProject(workspaceSlug: string, teamId: string, projectId: string): Promise<void> {
    try {
      await this.delete(`/api/workspaces/${workspaceSlug}/teamspaces/${teamId}/projects/${projectId}/`);
    } catch (error) {
      throw error;
    }
  }

  // Work items (team-scoped feed) -------------------------------------------

  async getTeamWorkItems(workspaceSlug: string, teamId: string): Promise<unknown[] | undefined> {
    try {
      const { data } = await this.get(`/api/workspaces/${workspaceSlug}/teamspaces/${teamId}/work-items/`);
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }
}

const teamService = new TeamService();

export default teamService;
