/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Automations rule engine — mote.
// See docs/mote-design/06-integrations-importers-automations.md, Feature 3.
//
// Project-settings list of custom automation rules: each row shows the
// trigger, a condition/action count summary, an active toggle, and edit /
// delete. Mirrors ce/components/issues/recurring/list.tsx.

import { observer } from "mobx-react";
import { Pencil, Trash2 } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { ToggleSwitch } from "@plane/ui";
import { cn } from "@plane/utils";
// plane web imports
import { useAutomations } from "@/plane-web/hooks/store/use-automations";
import type { TAutomationRule } from "@/plane-web/types/automations";

type TListProps = {
  workspaceSlug: string;
  projectId: string;
  isEditable: boolean;
  onEdit: (ruleId: string) => void;
};

const TRIGGER_LABEL_KEYS: Record<string, string> = {
  "issue.created": "project_settings.automations.custom.triggers.issue_created",
  "issue.state.changed": "project_settings.automations.custom.triggers.state_changed",
  "issue.priority.changed": "project_settings.automations.custom.triggers.priority_changed",
  "issue.assignee.changed": "project_settings.automations.custom.triggers.assignee_changed",
  "issue.label.added": "project_settings.automations.custom.triggers.label_added",
};

export const RuleList = observer(function RuleList(props: TListProps) {
  const { workspaceSlug, projectId, isEditable, onEdit } = props;
  const { t } = useTranslation();
  // store hooks
  const { getProjectAutomationRules, toggleAutomationRule, deleteAutomationRule } = useAutomations();

  const rules = getProjectAutomationRules(projectId);

  if (rules.length === 0) {
    return (
      <div className="rounded border border-subtle px-4 py-8 text-center text-sm text-tertiary">
        {t("project_settings.automations.custom.empty_state")}
      </div>
    );
  }

  const handleToggleActive = async (rule: TAutomationRule) => {
    try {
      await toggleAutomationRule(workspaceSlug, projectId, rule.id, !rule.is_active);
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: t("project_settings.automations.custom.toasts.toggle_failed"),
      });
    }
  };

  const handleDelete = async (rule: TAutomationRule) => {
    try {
      await deleteAutomationRule(workspaceSlug, projectId, rule.id);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: t("project_settings.automations.custom.toasts.deleted"),
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: t("project_settings.automations.custom.toasts.delete_failed"),
      });
    }
  };

  return (
    <div className="flex flex-col divide-y divide-subtle rounded border border-subtle">
      {rules.map((rule) => (
        <div key={rule.id} className="flex items-center gap-3 px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium text-primary">{rule.name}</span>
            <span className="truncate text-xs text-tertiary">
              {t(TRIGGER_LABEL_KEYS[rule.trigger] ?? "") || rule.trigger}
              {" · "}
              {t("project_settings.automations.custom.conditions_count", { count: rule.conditions?.length ?? 0 })}
              {" · "}
              {t("project_settings.automations.custom.actions_count", { count: rule.actions?.length ?? 0 })}
            </span>
          </div>
          <ToggleSwitch
            value={rule.is_active}
            onChange={() => void handleToggleActive(rule)}
            disabled={!isEditable}
          />
          <div className={cn("flex items-center gap-2", !isEditable && "pointer-events-none opacity-50")}>
            <button
              type="button"
              onClick={() => onEdit(rule.id)}
              className="text-tertiary hover:text-secondary"
              aria-label="Edit rule"
            >
              <Pencil className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => void handleDelete(rule)}
              className="text-tertiary hover:text-red-500"
              aria-label="Delete rule"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
});
