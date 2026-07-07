/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/* eslint-disable no-useless-catch */

// Recurring work items — mote.
// See docs/mote-design/03-work-item-power.md, section 3.
// Hits the project-scoped recurrence CRUD + runs endpoints registered in
// apps/api/plane/app/urls/recurring.py.

import { API_BASE_URL } from "@plane/constants";
// plane web types
import type { TRecurringIssue, TRecurringIssueRun } from "@/plane-web/types/recurring";
// services
import { APIService } from "@/services/api.service";

export class RecurringIssueService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async fetchRecurringIssues(workspaceSlug: string, projectId: string): Promise<TRecurringIssue[] | undefined> {
    try {
      const { data } = await this.get(
        `/api/workspaces/${workspaceSlug}/projects/${projectId}/recurring-issues/`
      );
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async fetchRecurringIssueById(
    workspaceSlug: string,
    projectId: string,
    recurringId: string
  ): Promise<TRecurringIssue | undefined> {
    try {
      const { data } = await this.get(
        `/api/workspaces/${workspaceSlug}/projects/${projectId}/recurring-issues/${recurringId}/`
      );
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async createRecurringIssue(
    workspaceSlug: string,
    projectId: string,
    payload: Partial<TRecurringIssue>
  ): Promise<TRecurringIssue | undefined> {
    try {
      const { data } = await this.post(
        `/api/workspaces/${workspaceSlug}/projects/${projectId}/recurring-issues/`,
        payload
      );
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async updateRecurringIssue(
    workspaceSlug: string,
    projectId: string,
    recurringId: string,
    payload: Partial<TRecurringIssue>
  ): Promise<TRecurringIssue | undefined> {
    try {
      const { data } = await this.patch(
        `/api/workspaces/${workspaceSlug}/projects/${projectId}/recurring-issues/${recurringId}/`,
        payload
      );
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async deleteRecurringIssue(workspaceSlug: string, projectId: string, recurringId: string): Promise<void> {
    try {
      await this.delete(
        `/api/workspaces/${workspaceSlug}/projects/${projectId}/recurring-issues/${recurringId}/`
      );
    } catch (error) {
      throw error;
    }
  }

  // Materialization history for a recurrence (audit of each auto-create).
  async fetchRecurringIssueRuns(
    workspaceSlug: string,
    projectId: string,
    recurringId: string
  ): Promise<TRecurringIssueRun[] | undefined> {
    try {
      const { data } = await this.get(
        `/api/workspaces/${workspaceSlug}/projects/${projectId}/recurring-issues/${recurringId}/runs/`
      );
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }
}

const recurringIssueService = new RecurringIssueService();

export default recurringIssueService;
