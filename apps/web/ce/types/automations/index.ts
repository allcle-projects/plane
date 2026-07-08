/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Automations rule engine — mote.
// See docs/mote-design/06-integrations-importers-automations.md, Feature 3.
//
// Frontend mirror of the backend ``AutomationRule`` / ``AutomationRuleLog``
// models (apps/api/plane/db/models/automation.py) and their serializers
// (apps/api/plane/app/serializers/automation.py). The serializers use
// ``fields = "__all__"`` so every model column is surfaced; field names
// below match the model/serializer EXACTLY.

// "issue.created" | "issue.state.changed" | "issue.priority.changed" |
// "issue.assignee.changed" | "issue.label.added" — matches the 5 triggers
// the backend evaluator (bgtasks/automation_task.py) currently dispatches.
export type TAutomationTrigger =
  | "issue.created"
  | "issue.state.changed"
  | "issue.priority.changed"
  | "issue.assignee.changed"
  | "issue.label.added";

// Matches VALID_OPERATORS in app/serializers/automation.py.
export type TAutomationConditionOperator = "eq" | "neq" | "in" | "contains" | "is_empty" | "is_not_empty";

// Supported condition fields per the design doc (§3.2) — validated by the
// serializer as free-form strings, but the UI only offers these.
export type TAutomationConditionField =
  | "state"
  | "state_group"
  | "priority"
  | "assignees"
  | "labels"
  | "target_date"
  | "created_by";

export type TAutomationCondition = {
  field: TAutomationConditionField | string;
  operator: TAutomationConditionOperator | string;
  value: unknown;
};

// Matches VALID_ACTION_TYPES in app/serializers/automation.py. Only the
// first 5 are executed by the v1 evaluator; the remaining 3 are accepted by
// the backend so rules can be authored ahead of support (logged as
// unsupported when a rule matches) — the rule-builder UI only lets you
// *create* the first 5, but will not choke on existing rules using the rest.
export type TAutomationActionType =
  | "set_state"
  | "set_priority"
  | "add_label"
  | "remove_label"
  | "set_completed_at"
  | "notify_slack"
  | "create_subtask"
  | "move_project";

export type TAutomationActionParams = {
  state_id?: string;
  priority?: string;
  label_id?: string;
  [key: string]: unknown;
};

export type TAutomationAction = {
  type: TAutomationActionType | string;
  params?: TAutomationActionParams;
};

export type TAutomationRule = {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  trigger: TAutomationTrigger | string;
  conditions: TAutomationCondition[];
  actions: TAutomationAction[];
  run_order: number;
  // ProjectBaseModel fields.
  project?: string;
  workspace?: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
};

export type TAutomationRuleLog = {
  id: string;
  rule: string;
  issue: string | null;
  matched: boolean;
  actions_run: unknown[];
  error: string | null;
  project?: string;
  workspace?: string;
  created_at?: string;
  updated_at?: string;
};
