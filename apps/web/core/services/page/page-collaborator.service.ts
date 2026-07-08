/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Shared Pages — mote.
// See docs/mote-design/02-wiki-publishing.md, Feature 3.
// Hits the workspace-scoped PageCollaborator CRUD endpoints registered in
// apps/api/plane/app/urls/page.py (page-collaborators). Detail routes key on
// the MEMBER id, not the collaborator id.

/* eslint-disable no-useless-catch */

import { API_BASE_URL } from "@plane/constants";
// plane web types
import type {
  TPageCollaborator,
  TPageCollaboratorCreatePayload,
  TPageCollaboratorUpdatePayload,
} from "@/plane-web/types/page-collaborators";
// services
import { APIService } from "@/services/api.service";

export class PageCollaboratorService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string, pageId: string): Promise<TPageCollaborator[]> {
    try {
      const { data } = await this.get(`/api/workspaces/${workspaceSlug}/pages/${pageId}/collaborators/`);
      return data;
    } catch (error) {
      throw error;
    }
  }

  async create(
    workspaceSlug: string,
    pageId: string,
    payload: TPageCollaboratorCreatePayload
  ): Promise<TPageCollaborator> {
    try {
      const { data } = await this.post(`/api/workspaces/${workspaceSlug}/pages/${pageId}/collaborators/`, payload);
      return data;
    } catch (error) {
      throw error;
    }
  }

  async updateRole(
    workspaceSlug: string,
    pageId: string,
    memberId: string,
    payload: TPageCollaboratorUpdatePayload
  ): Promise<TPageCollaborator> {
    try {
      const { data } = await this.patch(
        `/api/workspaces/${workspaceSlug}/pages/${pageId}/collaborators/${memberId}/`,
        payload
      );
      return data;
    } catch (error) {
      throw error;
    }
  }

  async remove(workspaceSlug: string, pageId: string, memberId: string): Promise<void> {
    try {
      await this.delete(`/api/workspaces/${workspaceSlug}/pages/${pageId}/collaborators/${memberId}/`);
    } catch (error) {
      throw error;
    }
  }
}
