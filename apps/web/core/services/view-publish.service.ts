/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// types
import { API_BASE_URL } from "@plane/constants";
import type { TViewPublishSettings } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

/**
 * Publish (deploy) a saved project View to a public anchor URL — mote
 * (docs/mote-design/02-wiki-publishing.md, Feature 5). Mirrors ProjectPublishService but hits
 * the view-scoped `view-deploy-boards` endpoints (`entity_name="view"`).
 *
 * NOTE: the backend only wires GET (list) + POST (create, upserts via get_or_create) on the
 * collection endpoint, and GET (retrieve) + DELETE (destroy) on the detail endpoint — there is
 * no PATCH. Publishing and updating publish settings both go through `publishView`.
 */
export class ViewPublishService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async fetchPublishSettings(workspaceSlug: string, projectId: string, viewId: string): Promise<TViewPublishSettings> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/views/${viewId}/view-deploy-boards/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  async publishView(
    workspaceSlug: string,
    projectId: string,
    viewId: string,
    data: Partial<TViewPublishSettings>
  ): Promise<TViewPublishSettings> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/views/${viewId}/view-deploy-boards/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  async unpublishView(
    workspaceSlug: string,
    projectId: string,
    viewId: string,
    viewPublishId: string
  ): Promise<any> {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/views/${viewId}/view-deploy-boards/${viewPublishId}/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }
}
