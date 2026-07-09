/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/* eslint-disable no-useless-catch */

// CSV work-item importer — mote.
// See docs/mote-design/06-integrations-importers-automations.md.
// Hits POST /workspaces/<slug>/projects/<project_id>/import-csv/.

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export type TCSVImportResult = {
  created_count: number;
  error_count: number;
  created: string[];
  errors: { row: number; error: unknown }[];
};

export class ImporterService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async importIssuesCSV(
    workspaceSlug: string,
    projectId: string,
    csv: string
  ): Promise<TCSVImportResult | undefined> {
    try {
      const { data } = await this.post(
        `/api/workspaces/${workspaceSlug}/projects/${projectId}/import-csv/`,
        { csv }
      );
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }
}

const importerService = new ImporterService();

export default importerService;
