/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/* eslint-disable no-useless-catch */

// Initiatives — mote.
// See docs/mote-design/04-planning-hierarchy.md, section 1.
// Hits the workspace-scoped initiative CRUD + project/epic link + rollup
// analytics endpoints registered in apps/api/plane/app/urls/initiative.py.

import { API_BASE_URL } from "@plane/constants";
// plane web types
import type {
  TInitiative,
  TInitiativeEpic,
  TInitiativeProgressSnapshot,
  TInitiativeProject,
} from "@/plane-web/types/initiatives";
// services
import { APIService } from "@/services/api.service";

export class InitiativeService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getInitiatives(workspaceSlug: string): Promise<TInitiative[] | undefined> {
    try {
      const { data } = await this.get(`/api/workspaces/${workspaceSlug}/initiatives/`);
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async createInitiative(workspaceSlug: string, payload: Partial<TInitiative>): Promise<TInitiative | undefined> {
    try {
      const { data } = await this.post(`/api/workspaces/${workspaceSlug}/initiatives/`, payload);
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async getInitiative(workspaceSlug: string, initiativeId: string): Promise<TInitiative | undefined> {
    try {
      const { data } = await this.get(`/api/workspaces/${workspaceSlug}/initiatives/${initiativeId}/`);
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async updateInitiative(
    workspaceSlug: string,
    initiativeId: string,
    payload: Partial<TInitiative>
  ): Promise<TInitiative | undefined> {
    try {
      const { data } = await this.patch(`/api/workspaces/${workspaceSlug}/initiatives/${initiativeId}/`, payload);
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async deleteInitiative(workspaceSlug: string, initiativeId: string): Promise<void> {
    try {
      await this.delete(`/api/workspaces/${workspaceSlug}/initiatives/${initiativeId}/`);
    } catch (error) {
      throw error;
    }
  }

  // Linked projects ---------------------------------------------------------

  async getInitiativeProjects(workspaceSlug: string, initiativeId: string): Promise<TInitiativeProject[] | undefined> {
    try {
      const { data } = await this.get(`/api/workspaces/${workspaceSlug}/initiatives/${initiativeId}/projects/`);
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async addInitiativeProjects(
    workspaceSlug: string,
    initiativeId: string,
    projectIds: string[]
  ): Promise<TInitiativeProject[] | undefined> {
    try {
      const { data } = await this.post(`/api/workspaces/${workspaceSlug}/initiatives/${initiativeId}/projects/`, {
        project_ids: projectIds,
      });
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async removeInitiativeProject(workspaceSlug: string, initiativeId: string, projectId: string): Promise<void> {
    try {
      await this.delete(`/api/workspaces/${workspaceSlug}/initiatives/${initiativeId}/projects/${projectId}/`);
    } catch (error) {
      throw error;
    }
  }

  // Linked epics ------------------------------------------------------------

  async getInitiativeEpics(workspaceSlug: string, initiativeId: string): Promise<TInitiativeEpic[] | undefined> {
    try {
      const { data } = await this.get(`/api/workspaces/${workspaceSlug}/initiatives/${initiativeId}/epics/`);
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async addInitiativeEpics(
    workspaceSlug: string,
    initiativeId: string,
    epicIds: string[]
  ): Promise<TInitiativeEpic[] | undefined> {
    try {
      const { data } = await this.post(`/api/workspaces/${workspaceSlug}/initiatives/${initiativeId}/epics/`, {
        epic_ids: epicIds,
      });
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async removeInitiativeEpic(workspaceSlug: string, initiativeId: string, epicId: string): Promise<void> {
    try {
      await this.delete(`/api/workspaces/${workspaceSlug}/initiatives/${initiativeId}/epics/${epicId}/`);
    } catch (error) {
      throw error;
    }
  }

  // Rollup snapshot ---------------------------------------------------------

  async getInitiativeAnalytics(
    workspaceSlug: string,
    initiativeId: string
  ): Promise<TInitiativeProgressSnapshot | undefined> {
    try {
      const { data } = await this.get(`/api/workspaces/${workspaceSlug}/initiatives/${initiativeId}/analytics/`);
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }
}

const initiativeService = new InitiativeService();

export default initiativeService;
