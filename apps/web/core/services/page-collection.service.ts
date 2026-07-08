/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/* eslint-disable no-useless-catch */

// Page Collections — mote.
// See docs/mote-design/02-wiki-publishing.md, Feature 4.
// Hits the workspace-scoped PageCollection CRUD endpoints registered in
// apps/api/plane/app/urls/ (page-collections).

import { API_BASE_URL } from "@plane/constants";
// plane web types
import type {
  TPageCollection,
  TPageCollectionCreatePayload,
  TPageCollectionUpdatePayload,
} from "@/plane-web/types/page-collections";
// services
import { APIService } from "@/services/api.service";

export class PageCollectionService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string): Promise<TPageCollection[] | undefined> {
    try {
      const { data } = await this.get(`/api/workspaces/${workspaceSlug}/page-collections/`);
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async create(workspaceSlug: string, payload: TPageCollectionCreatePayload): Promise<TPageCollection | undefined> {
    try {
      const { data } = await this.post(`/api/workspaces/${workspaceSlug}/page-collections/`, payload);
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async update(
    workspaceSlug: string,
    collectionId: string,
    payload: TPageCollectionUpdatePayload
  ): Promise<TPageCollection | undefined> {
    try {
      const { data } = await this.patch(
        `/api/workspaces/${workspaceSlug}/page-collections/${collectionId}/`,
        payload
      );
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async destroy(workspaceSlug: string, collectionId: string): Promise<void> {
    try {
      await this.delete(`/api/workspaces/${workspaceSlug}/page-collections/${collectionId}/`);
    } catch (error) {
      throw error;
    }
  }

  async addPages(
    workspaceSlug: string,
    collectionId: string,
    pageIds: string[]
  ): Promise<TPageCollection | undefined> {
    try {
      const { data } = await this.post(`/api/workspaces/${workspaceSlug}/page-collections/${collectionId}/pages/`, {
        page_ids: pageIds,
      });
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async removePage(workspaceSlug: string, collectionId: string, pageId: string): Promise<void> {
    try {
      await this.delete(`/api/workspaces/${workspaceSlug}/page-collections/${collectionId}/pages/${pageId}/`);
    } catch (error) {
      throw error;
    }
  }
}

const pageCollectionService = new PageCollectionService();

export default pageCollectionService;
