/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/* eslint-disable no-useless-catch */

// Milestones — mote (Phase 2).
// See docs/mote-design/04-planning-hierarchy.md, section 2.
// Hits the project-scoped milestone CRUD + milestone-issues attach/detach +
// rollup analytics endpoints registered in apps/api/plane/app/urls/milestone.py.

import { API_BASE_URL } from "@plane/constants";
import type { TIssue } from "@plane/types";
// plane web types
import type { TMilestone, TMilestoneIssue, TMilestoneProgressSnapshot } from "@/plane-web/types/milestones";
// services
import { APIService } from "@/services/api.service";

export class MilestoneService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getMilestones(workspaceSlug: string, projectId: string): Promise<TMilestone[] | undefined> {
    try {
      const { data } = await this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/milestones/`);
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async createMilestone(
    workspaceSlug: string,
    projectId: string,
    payload: Partial<TMilestone>
  ): Promise<TMilestone | undefined> {
    try {
      const { data } = await this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/milestones/`, payload);
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async getMilestone(
    workspaceSlug: string,
    projectId: string,
    milestoneId: string
  ): Promise<TMilestone | undefined> {
    try {
      const { data } = await this.get(
        `/api/workspaces/${workspaceSlug}/projects/${projectId}/milestones/${milestoneId}/`
      );
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async updateMilestone(
    workspaceSlug: string,
    projectId: string,
    milestoneId: string,
    payload: Partial<TMilestone>
  ): Promise<TMilestone | undefined> {
    try {
      const { data } = await this.patch(
        `/api/workspaces/${workspaceSlug}/projects/${projectId}/milestones/${milestoneId}/`,
        payload
      );
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async deleteMilestone(workspaceSlug: string, projectId: string, milestoneId: string): Promise<void> {
    try {
      await this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/milestones/${milestoneId}/`);
    } catch (error) {
      throw error;
    }
  }

  // Attached work items -----------------------------------------------------

  async getMilestoneIssues(
    workspaceSlug: string,
    projectId: string,
    milestoneId: string
  ): Promise<TMilestoneIssue[] | undefined> {
    try {
      const { data } = await this.get(
        `/api/workspaces/${workspaceSlug}/projects/${projectId}/milestones/${milestoneId}/milestone-issues/`
      );
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async addMilestoneIssues(
    workspaceSlug: string,
    projectId: string,
    milestoneId: string,
    issueIds: string[]
  ): Promise<TMilestoneIssue[] | undefined> {
    try {
      const { data } = await this.post(
        `/api/workspaces/${workspaceSlug}/projects/${projectId}/milestones/${milestoneId}/milestone-issues/`,
        { issues: issueIds }
      );
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async removeMilestoneIssue(
    workspaceSlug: string,
    projectId: string,
    milestoneId: string,
    issueId: string
  ): Promise<void> {
    try {
      await this.delete(
        `/api/workspaces/${workspaceSlug}/projects/${projectId}/milestones/${milestoneId}/milestone-issues/${issueId}/`
      );
    } catch (error) {
      throw error;
    }
  }

  // Rollup snapshot ---------------------------------------------------------

  async getMilestoneAnalytics(
    workspaceSlug: string,
    projectId: string,
    milestoneId: string
  ): Promise<TMilestoneProgressSnapshot | undefined> {
    try {
      const { data } = await this.get(
        `/api/workspaces/${workspaceSlug}/projects/${projectId}/milestones/${milestoneId}/analytics/`
      );
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  // Candidate work items for the attach picker. Fetches the project's work items
  // as a flat list (ungrouped => ``results`` is a plain array of issues).
  async getProjectWorkItems(workspaceSlug: string, projectId: string): Promise<TIssue[]> {
    try {
      const { data } = await this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/`, {
        params: { per_page: 100 },
      });
      const results = data?.results;
      return Array.isArray(results) ? (results as TIssue[]) : [];
    } catch (error) {
      throw error;
    }
  }
}

const milestoneService = new MilestoneService();

export default milestoneService;
