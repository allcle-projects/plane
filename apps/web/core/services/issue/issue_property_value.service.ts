/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Custom Fields / Work Item Properties — mote (Phase 2).
// Bulk read/upsert of a work item's custom-field values. Mirrors
// IssueWorklogService (issue_worklog.service.ts) and the backend endpoint in
// apps/api/plane/app/urls/issue.py ("project-issue-property-values").

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type { TIssuePropertyValues } from "@/plane-web/types/issue-types";
// services
import { APIService } from "@/services/api.service";

export class IssuePropertyValueService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async fetchPropertyValues(
    workspaceSlug: string,
    projectId: string,
    issueId: string
  ): Promise<TIssuePropertyValues> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/property-values/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updatePropertyValues(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: TIssuePropertyValues
  ): Promise<TIssuePropertyValues> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/property-values/`,
      data
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
