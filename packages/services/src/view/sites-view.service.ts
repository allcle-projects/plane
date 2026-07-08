/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type { TPublicIssuesResponse, TViewPublishSettings } from "@plane/types";
// api service
import { APIService } from "../api.service";

/**
 * Lite project + view details for a published View anchor — mirrors the backend's
 * `ProjectLiteSerializer` / `ViewLiteSerializer` pair returned by `ViewMetaDataEndpoint`
 * (`apps/api/plane/space/views/view.py`).
 */
export type TPublicViewMeta = {
  project: {
    id: string;
    name: string;
    identifier: string;
    cover_image: string | null;
    icon_prop: Record<string, unknown> | null;
    emoji: string | null;
    description: string;
  };
  view: {
    id: string;
    name: string;
    description: string;
    logo_props: Record<string, unknown> | null;
  };
};

/**
 * Service class for the anon (published) View endpoints within plane sites application — mote
 * (docs/mote-design/02-wiki-publishing.md, Feature 5). Mirrors SitesIssueService /
 * SitesProjectPublishService but scoped to a published View's anchor (`entity_name="view"`)
 * instead of `entity_name="project"`.
 * @extends {APIService}
 * @remarks This service is only available for plane sites
 */
export class SitesViewService extends APIService {
  constructor(BASE_URL?: string) {
    super(BASE_URL || API_BASE_URL);
  }

  /**
   * Retrieves the project + view lite details for a published View anchor.
   * @param {string} anchor - The anchor identifier
   * @returns {Promise<TPublicViewMeta>} Promise resolving to the project + view lite details
   * @throws {Error} If the API request fails
   */
  async retrieveMetaByAnchor(anchor: string): Promise<TPublicViewMeta> {
    return this.get(`/api/public/anchor/${anchor}/view-meta/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  /**
   * Retrieves the DeployBoard publish settings for a published View anchor.
   * @param {string} anchor - The anchor identifier
   * @returns {Promise<TViewPublishSettings>} Promise resolving to the publish settings
   * @throws {Error} If the API request fails
   */
  async retrieveSettingsByAnchor(anchor: string): Promise<TViewPublishSettings> {
    return this.get(`/api/public/anchor/${anchor}/view-settings/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  /**
   * Retrieves the view's own issue feed. The issues are filtered server-side by the view's
   * saved filters — only presentation params (order_by/group_by/sub_group_by) are honored.
   * @param {string} anchor - The anchor identifier
   * @param {any} params - Optional presentation query parameters
   * @returns {Promise<TPublicIssuesResponse>} Promise resolving to the paginated issue feed
   * @throws {Error} If the API request fails
   */
  async listIssues(anchor: string, params?: any): Promise<TPublicIssuesResponse> {
    return this.get(`/api/public/anchor/${anchor}/view-issues/`, { params })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }
}
