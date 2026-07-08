/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/* eslint-disable no-useless-catch */

// Project States — mote (Phase 2).
// See docs/mote-design/04-planning-hierarchy.md, section 3.
// Hits the workspace-scoped ProjectState CRUD endpoints registered in
// apps/api/plane/app/urls/ (project-states). States are seeded per workspace.

import { API_BASE_URL } from "@plane/constants";
// plane web types
import type { TProjectState } from "@/plane-web/types/workspace-project-states";
// services
import { APIService } from "@/services/api.service";

export class WorkspaceProjectStateService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getProjectStates(workspaceSlug: string): Promise<TProjectState[] | undefined> {
    try {
      const { data } = await this.get(`/api/workspaces/${workspaceSlug}/project-states/`);
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async createProjectState(
    workspaceSlug: string,
    payload: Partial<TProjectState>
  ): Promise<TProjectState | undefined> {
    try {
      const { data } = await this.post(`/api/workspaces/${workspaceSlug}/project-states/`, payload);
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async updateProjectState(
    workspaceSlug: string,
    projectStateId: string,
    payload: Partial<TProjectState>
  ): Promise<TProjectState | undefined> {
    try {
      const { data } = await this.patch(
        `/api/workspaces/${workspaceSlug}/project-states/${projectStateId}/`,
        payload
      );
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async deleteProjectState(workspaceSlug: string, projectStateId: string): Promise<void> {
    try {
      await this.delete(`/api/workspaces/${workspaceSlug}/project-states/${projectStateId}/`);
    } catch (error) {
      throw error;
    }
  }
}

const workspaceProjectStateService = new WorkspaceProjectStateService();

export default workspaceProjectStateService;
