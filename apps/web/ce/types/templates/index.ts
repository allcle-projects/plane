/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Templates (work item + project templates) — mote.
// See docs/mote-design/03-work-item-power.md, section 2.
//
// Frontend mirror of the backend ``Template`` model
// (apps/api/plane/db/models/template.py). ``template_data`` is a plain JSON
// snapshot discriminated by ``template_type``; for a work item it captures the
// create-form shape plus custom-field ``property_values`` (reusing the CF
// Phase-2 ``{property_id: [values]}`` map).

import type { TIssuePropertyValues } from "@/plane-web/types/issue-types";

export type TTemplateType = "work_item" | "project";

// Snapshot captured for a work item template. Field names mirror the backend
// serializer output (state_id / estimate_point_id) and are resolved-or-dropped
// against the target project at apply time.
export type TWorkItemTemplateData = {
  name?: string;
  description_html?: string;
  priority?: string;
  state_id?: string | null;
  label_ids?: string[];
  assignee_ids?: string[];
  estimate_point_id?: string | null;
  type_id?: string | null;
  property_values?: TIssuePropertyValues;
};

// Snapshot captured for a project template. Instantiation of the full project
// scaffold is a later phase; the picker currently pre-fills the create form
// from the ``project`` sub-shape (a partial set of project fields).
export type TProjectTemplateData = {
  project?: Record<string, unknown>;
  [key: string]: unknown;
};

export type TTemplateData = TWorkItemTemplateData & TProjectTemplateData;

export type TTemplate = {
  id: string;
  name: string;
  description?: string;
  template_type: TTemplateType;
  template_data: TTemplateData;
  is_active: boolean;
  workspace?: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
};
