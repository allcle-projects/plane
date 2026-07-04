/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Integrations — Option B (webhooks + task-bot) mapping service (mote) — see
// docs/mote-design/06-integrations-importers-automations.md, Feature 1, §1.3.
// Project-scoped, admin-managed maps consumed by the task-bot bridge.

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export type TSlackProjectSync = {
  id: string;
  project: string;
  workspace: string;
  webhook_url: string;
  channel: string;
  team_id: string;
  created_at: string;
  updated_at: string;
};

export type TGithubRepositorySync = {
  id: string;
  project: string;
  workspace: string;
  owner: string;
  name: string;
  url: string | null;
  created_at: string;
  updated_at: string;
};

export class IntegrationMappingService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  // --- Slack channel maps ---
  async listSlackSyncs(workspaceSlug: string, projectId: string): Promise<TSlackProjectSync[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/slack-syncs/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createSlackSync(
    workspaceSlug: string,
    projectId: string,
    data: Partial<TSlackProjectSync>
  ): Promise<TSlackProjectSync> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/slack-syncs/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteSlackSync(workspaceSlug: string, projectId: string, syncId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/slack-syncs/${syncId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // --- GitHub repository maps ---
  async listGithubSyncs(workspaceSlug: string, projectId: string): Promise<TGithubRepositorySync[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/github-repository-syncs/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createGithubSync(
    workspaceSlug: string,
    projectId: string,
    data: Partial<TGithubRepositorySync>
  ): Promise<TGithubRepositorySync> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/github-repository-syncs/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteGithubSync(workspaceSlug: string, projectId: string, syncId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/github-repository-syncs/${syncId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
