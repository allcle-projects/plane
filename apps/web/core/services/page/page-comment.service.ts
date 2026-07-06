/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane types
import { API_BASE_URL } from "@plane/constants";
import type { TIssueComment, TIssueCommentReaction } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export class PageCommentService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getPageComments(
    workspaceSlug: string,
    pageId: string,
    params:
      | {
          created_at__gt: string;
        }
      | object = {}
  ): Promise<TIssueComment[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/pages/${pageId}/comments/`, {
      params,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createPageComment(
    workspaceSlug: string,
    pageId: string,
    data: Partial<TIssueComment>
  ): Promise<TIssueComment> {
    return this.post(`/api/workspaces/${workspaceSlug}/pages/${pageId}/comments/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async patchPageComment(
    workspaceSlug: string,
    pageId: string,
    commentId: string,
    data: Partial<TIssueComment>
  ): Promise<TIssueComment> {
    return this.patch(`/api/workspaces/${workspaceSlug}/pages/${pageId}/comments/${commentId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deletePageComment(workspaceSlug: string, pageId: string, commentId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/pages/${pageId}/comments/${commentId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createPageCommentReaction(
    workspaceSlug: string,
    pageId: string,
    commentId: string,
    data: Partial<TIssueCommentReaction>
  ): Promise<TIssueCommentReaction> {
    return this.post(`/api/workspaces/${workspaceSlug}/pages/${pageId}/comments/${commentId}/reactions/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deletePageCommentReaction(
    workspaceSlug: string,
    pageId: string,
    commentId: string,
    reactionCode: string
  ): Promise<void> {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/pages/${pageId}/comments/${commentId}/reactions/${reactionCode}/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
