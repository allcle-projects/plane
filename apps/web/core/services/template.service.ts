/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/* eslint-disable no-useless-catch */

// Templates (work item + project templates) — mote.
// See docs/mote-design/03-work-item-power.md, section 2.
// Hits the workspace-scoped template CRUD + work-item instantiate endpoints
// registered in apps/api/plane/app/urls/template.py.

import { API_BASE_URL } from "@plane/constants";
import type { TIssue } from "@plane/types";
// plane web types
import type { TTemplate, TTemplateType } from "@/plane-web/types/templates";
// services
import { APIService } from "@/services/api.service";

export class TemplateService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async fetchTemplates(workspaceSlug: string, type?: TTemplateType): Promise<TTemplate[] | undefined> {
    try {
      const { data } = await this.get(`/api/workspaces/${workspaceSlug}/templates/`, {
        params: type ? { type } : {},
      });
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async fetchTemplateById(workspaceSlug: string, templateId: string): Promise<TTemplate | undefined> {
    try {
      const { data } = await this.get(`/api/workspaces/${workspaceSlug}/templates/${templateId}/`);
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async createTemplate(workspaceSlug: string, payload: Partial<TTemplate>): Promise<TTemplate | undefined> {
    try {
      const { data } = await this.post(`/api/workspaces/${workspaceSlug}/templates/`, payload);
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async updateTemplate(
    workspaceSlug: string,
    templateId: string,
    payload: Partial<TTemplate>
  ): Promise<TTemplate | undefined> {
    try {
      const { data } = await this.patch(`/api/workspaces/${workspaceSlug}/templates/${templateId}/`, payload);
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async deleteTemplate(workspaceSlug: string, templateId: string): Promise<void> {
    try {
      await this.delete(`/api/workspaces/${workspaceSlug}/templates/${templateId}/`);
    } catch (error) {
      throw error;
    }
  }

  // Server-side apply: creates a fresh Issue in the target project from a
  // work_item template (writing custom property_values too) and returns it.
  async instantiateTemplate(
    workspaceSlug: string,
    projectId: string,
    templateId: string
  ): Promise<TIssue | undefined> {
    try {
      const { data } = await this.post(
        `/api/workspaces/${workspaceSlug}/projects/${projectId}/templates/${templateId}/instantiate/`,
        {}
      );
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }
}

const templateService = new TemplateService();

export default templateService;
