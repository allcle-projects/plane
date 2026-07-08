/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/* eslint-disable no-useless-catch */

// Automations rule engine — mote.
// See docs/mote-design/06-integrations-importers-automations.md, Feature 3.
// Hits the project-scoped rule CRUD + toggle + logs endpoints registered in
// apps/api/plane/app/urls/automation.py.

import { API_BASE_URL } from "@plane/constants";
// plane web types
import type { TAutomationRule, TAutomationRuleLog } from "@/plane-web/types/automations";
// services
import { APIService } from "@/services/api.service";

export class AutomationService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string, projectId: string): Promise<TAutomationRule[] | undefined> {
    try {
      const { data } = await this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/automations/`);
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async retrieve(workspaceSlug: string, projectId: string, ruleId: string): Promise<TAutomationRule | undefined> {
    try {
      const { data } = await this.get(
        `/api/workspaces/${workspaceSlug}/projects/${projectId}/automations/${ruleId}/`
      );
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async create(
    workspaceSlug: string,
    projectId: string,
    payload: Partial<TAutomationRule>
  ): Promise<TAutomationRule | undefined> {
    try {
      const { data } = await this.post(
        `/api/workspaces/${workspaceSlug}/projects/${projectId}/automations/`,
        payload
      );
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async update(
    workspaceSlug: string,
    projectId: string,
    ruleId: string,
    payload: Partial<TAutomationRule>
  ): Promise<TAutomationRule | undefined> {
    try {
      const { data } = await this.patch(
        `/api/workspaces/${workspaceSlug}/projects/${projectId}/automations/${ruleId}/`,
        payload
      );
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async remove(workspaceSlug: string, projectId: string, ruleId: string): Promise<void> {
    try {
      await this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/automations/${ruleId}/`);
    } catch (error) {
      throw error;
    }
  }

  async toggle(
    workspaceSlug: string,
    projectId: string,
    ruleId: string,
    isActive: boolean
  ): Promise<TAutomationRule | undefined> {
    try {
      const { data } = await this.patch(
        `/api/workspaces/${workspaceSlug}/projects/${projectId}/automations/${ruleId}/toggle/`,
        { is_active: isActive }
      );
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }

  async logs(workspaceSlug: string, projectId: string, ruleId: string): Promise<TAutomationRuleLog[] | undefined> {
    try {
      const { data } = await this.get(
        `/api/workspaces/${workspaceSlug}/projects/${projectId}/automations/${ruleId}/logs/`
      );
      return data || undefined;
    } catch (error) {
      throw error;
    }
  }
}

const automationService = new AutomationService();

export default automationService;
