/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/* eslint-disable no-useless-catch */

// Updates — mote.
// See docs/mote-design/04-planning-hierarchy.md, section 4.
//
// EntityUpdate CRUD for the three parent surfaces (project / cycle / initiative).
// The nested URL encodes the parent, so create/patch send only the writable
// fields; the backend fills in the parent + workspace from the path.

import { API_BASE_URL } from "@plane/constants";
// plane web types
import type { TEntityUpdate, TUpdateEntityType, TUpdateFormData } from "@/plane-web/types/updates";
// services
import { APIService } from "@/services/api.service";

export type TUpdatePathParams = {
  entityType: TUpdateEntityType;
  projectId?: string;
  cycleId?: string;
  initiativeId?: string;
};

export class UpdateService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  /**
   * @description resolves the nested collection URL for the parent entity
   */
  private _basePath(workspaceSlug: string, params: TUpdatePathParams): string {
    const { entityType, projectId, cycleId, initiativeId } = params;
    switch (entityType) {
      case "project":
        return `/api/workspaces/${workspaceSlug}/projects/${projectId}/updates`;
      case "cycle":
        return `/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/updates`;
      case "initiative":
        return `/api/workspaces/${workspaceSlug}/initiatives/${initiativeId}/updates`;
      default:
        throw new Error(`Unknown update entity type: ${entityType}`);
    }
  }

  async getUpdates(workspaceSlug: string, params: TUpdatePathParams): Promise<TEntityUpdate[]> {
    return this.get(`${this._basePath(workspaceSlug, params)}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createUpdate(
    workspaceSlug: string,
    params: TUpdatePathParams,
    data: TUpdateFormData
  ): Promise<TEntityUpdate> {
    return this.post(`${this._basePath(workspaceSlug, params)}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateUpdate(
    workspaceSlug: string,
    params: TUpdatePathParams,
    updateId: string,
    data: Partial<TUpdateFormData>
  ): Promise<TEntityUpdate> {
    return this.patch(`${this._basePath(workspaceSlug, params)}/${updateId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteUpdate(workspaceSlug: string, params: TUpdatePathParams, updateId: string): Promise<void> {
    return this.delete(`${this._basePath(workspaceSlug, params)}/${updateId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

const updateService = new UpdateService();

export default updateService;
