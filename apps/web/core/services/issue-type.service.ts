/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/* eslint-disable no-useless-catch */

// Custom Fields / Work Item Properties — mote (Phase 1).
// Workspace-scoped definition CRUD (work item type -> property -> option).
// Mirrors core/services/estimate.service.ts and the backend routes in
// apps/api/plane/app/urls/issue_type.py.

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type { TIssueType, TIssueProperty, TIssuePropertyOption } from "@/plane-web/types/issue-types";
// services
import { APIService } from "@/services/api.service";

export class IssueTypeService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  // ------------------------------------------------------------------ types

  async fetchIssueTypes(workspaceSlug: string): Promise<TIssueType[] | undefined> {
    try {
      const { data } = await this.get(`/api/workspaces/${workspaceSlug}/issue-types/`);
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async createIssueType(workspaceSlug: string, payload: Partial<TIssueType>): Promise<TIssueType | undefined> {
    try {
      const { data } = await this.post(`/api/workspaces/${workspaceSlug}/issue-types/`, payload);
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async updateIssueType(
    workspaceSlug: string,
    issueTypeId: string,
    payload: Partial<TIssueType>
  ): Promise<TIssueType | undefined> {
    try {
      const { data } = await this.patch(`/api/workspaces/${workspaceSlug}/issue-types/${issueTypeId}/`, payload);
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async deleteIssueType(workspaceSlug: string, issueTypeId: string): Promise<void> {
    try {
      await this.delete(`/api/workspaces/${workspaceSlug}/issue-types/${issueTypeId}/`);
    } catch (error) {
      throw error;
    }
  }

  // ------------------------------------------------------------- properties

  async fetchIssueProperties(workspaceSlug: string, issueTypeId: string): Promise<TIssueProperty[] | undefined> {
    try {
      const { data } = await this.get(`/api/workspaces/${workspaceSlug}/issue-types/${issueTypeId}/properties/`);
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async createIssueProperty(
    workspaceSlug: string,
    issueTypeId: string,
    payload: Partial<TIssueProperty>
  ): Promise<TIssueProperty | undefined> {
    try {
      const { data } = await this.post(
        `/api/workspaces/${workspaceSlug}/issue-types/${issueTypeId}/properties/`,
        payload
      );
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async updateIssueProperty(
    workspaceSlug: string,
    issueTypeId: string,
    propertyId: string,
    payload: Partial<TIssueProperty>
  ): Promise<TIssueProperty | undefined> {
    try {
      const { data } = await this.patch(
        `/api/workspaces/${workspaceSlug}/issue-types/${issueTypeId}/properties/${propertyId}/`,
        payload
      );
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async deleteIssueProperty(workspaceSlug: string, issueTypeId: string, propertyId: string): Promise<void> {
    try {
      await this.delete(`/api/workspaces/${workspaceSlug}/issue-types/${issueTypeId}/properties/${propertyId}/`);
    } catch (error) {
      throw error;
    }
  }

  // ---------------------------------------------------------------- options

  async fetchPropertyOptions(
    workspaceSlug: string,
    issueTypeId: string,
    propertyId: string
  ): Promise<TIssuePropertyOption[] | undefined> {
    try {
      const { data } = await this.get(
        `/api/workspaces/${workspaceSlug}/issue-types/${issueTypeId}/properties/${propertyId}/options/`
      );
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async createPropertyOption(
    workspaceSlug: string,
    issueTypeId: string,
    propertyId: string,
    payload: Partial<TIssuePropertyOption>
  ): Promise<TIssuePropertyOption | undefined> {
    try {
      const { data } = await this.post(
        `/api/workspaces/${workspaceSlug}/issue-types/${issueTypeId}/properties/${propertyId}/options/`,
        payload
      );
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async updatePropertyOption(
    workspaceSlug: string,
    issueTypeId: string,
    propertyId: string,
    optionId: string,
    payload: Partial<TIssuePropertyOption>
  ): Promise<TIssuePropertyOption | undefined> {
    try {
      const { data } = await this.patch(
        `/api/workspaces/${workspaceSlug}/issue-types/${issueTypeId}/properties/${propertyId}/options/${optionId}/`,
        payload
      );
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async deletePropertyOption(
    workspaceSlug: string,
    issueTypeId: string,
    propertyId: string,
    optionId: string
  ): Promise<void> {
    try {
      await this.delete(
        `/api/workspaces/${workspaceSlug}/issue-types/${issueTypeId}/properties/${propertyId}/options/${optionId}/`
      );
    } catch (error) {
      throw error;
    }
  }
}

const issueTypeService = new IssueTypeService();

export default issueTypeService;
