/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Automations rule engine — mote.
// See docs/mote-design/06-integrations-importers-automations.md, Feature 3.
//
// Create/edit form for a project automation rule: name + description,
// trigger picker, a conditions builder (field/operator/value rows) and an
// actions builder (type/params rows), plus the is_active toggle. Mirrors the
// shape of ce/components/issues/recurring/recurrence-modal.tsx.
//
// Action params reuse the real StateDropdown / PriorityDropdown / LabelDropdown
// components so set_state / set_priority / add_label / remove_label always
// carry valid ids. Condition values are a plain, clearly-labelled text input
// (raw id / comma-separated ids) — building a per-field typed value editor
// (member picker, label picker, date picker, all crossed with 6 operators)
// was out of scope for this pass; see root.tsx callers for the note.

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { Plus, Trash2 } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssuePriorities } from "@plane/types";
import { Button, CustomSelect, EModalWidth, Input, ModalCore, ToggleSwitch } from "@plane/ui";
// components
import { StateDropdown } from "@/components/dropdowns/state/dropdown";
import { PriorityDropdown } from "@/components/dropdowns/priority";
import { LabelDropdown } from "@/components/issues/issue-layouts/properties/label-dropdown";
// hooks
import { useLabel } from "@/hooks/store/use-label";
// plane web imports
import { useAutomations } from "@/plane-web/hooks/store/use-automations";
import type {
  TAutomationAction,
  TAutomationActionParams,
  TAutomationActionType,
  TAutomationCondition,
  TAutomationConditionField,
  TAutomationConditionOperator,
  TAutomationRule,
  TAutomationTrigger,
} from "@/plane-web/types/automations";

type TRuleModalProps = {
  isOpen: boolean;
  workspaceSlug: string;
  projectId: string;
  ruleId?: string | null;
  handleClose: () => void;
};

const TRIGGER_OPTIONS: { value: TAutomationTrigger; i18n_label: string }[] = [
  { value: "issue.created", i18n_label: "project_settings.automations.custom.triggers.issue_created" },
  { value: "issue.state.changed", i18n_label: "project_settings.automations.custom.triggers.state_changed" },
  { value: "issue.priority.changed", i18n_label: "project_settings.automations.custom.triggers.priority_changed" },
  { value: "issue.assignee.changed", i18n_label: "project_settings.automations.custom.triggers.assignee_changed" },
  { value: "issue.label.added", i18n_label: "project_settings.automations.custom.triggers.label_added" },
];

const CONDITION_FIELD_OPTIONS: { value: TAutomationConditionField; i18n_label: string }[] = [
  { value: "state", i18n_label: "project_settings.automations.custom.fields.state" },
  { value: "state_group", i18n_label: "project_settings.automations.custom.fields.state_group" },
  { value: "priority", i18n_label: "project_settings.automations.custom.fields.priority" },
  { value: "assignees", i18n_label: "project_settings.automations.custom.fields.assignees" },
  { value: "labels", i18n_label: "project_settings.automations.custom.fields.labels" },
  { value: "target_date", i18n_label: "project_settings.automations.custom.fields.target_date" },
  { value: "created_by", i18n_label: "project_settings.automations.custom.fields.created_by" },
];

const CONDITION_OPERATOR_OPTIONS: { value: TAutomationConditionOperator; i18n_label: string }[] = [
  { value: "eq", i18n_label: "project_settings.automations.custom.operators.eq" },
  { value: "neq", i18n_label: "project_settings.automations.custom.operators.neq" },
  { value: "in", i18n_label: "project_settings.automations.custom.operators.in" },
  { value: "contains", i18n_label: "project_settings.automations.custom.operators.contains" },
  { value: "is_empty", i18n_label: "project_settings.automations.custom.operators.is_empty" },
  { value: "is_not_empty", i18n_label: "project_settings.automations.custom.operators.is_not_empty" },
];

// Only the 5 action types the v1 evaluator (bgtasks/automation_task.py) actually
// executes are offered for authoring — the serializer also accepts
// notify_slack/create_subtask/move_project as unimplemented placeholders, but
// creating those from this UI would silently no-op.
const ACTION_TYPE_OPTIONS: { value: TAutomationActionType; i18n_label: string }[] = [
  { value: "set_state", i18n_label: "project_settings.automations.custom.actions.set_state" },
  { value: "set_priority", i18n_label: "project_settings.automations.custom.actions.set_priority" },
  { value: "add_label", i18n_label: "project_settings.automations.custom.actions.add_label" },
  { value: "remove_label", i18n_label: "project_settings.automations.custom.actions.remove_label" },
  { value: "set_completed_at", i18n_label: "project_settings.automations.custom.actions.set_completed_at" },
];

type TFormState = {
  name: string;
  description: string;
  trigger: TAutomationTrigger;
  is_active: boolean;
  conditions: TAutomationCondition[];
  actions: TAutomationAction[];
};

const DEFAULT_FORM: TFormState = {
  name: "",
  description: "",
  trigger: "issue.created",
  is_active: true,
  conditions: [],
  actions: [],
};

export const RuleModal = observer(function RuleModal(props: TRuleModalProps) {
  const { isOpen, workspaceSlug, projectId, ruleId, handleClose } = props;
  const { t } = useTranslation();
  // store hooks
  const { getRuleById, createAutomationRule, updateAutomationRule } = useAutomations();
  const { getLabelById } = useLabel();
  // state
  const [form, setForm] = useState<TFormState>(DEFAULT_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const existing = ruleId ? getRuleById(ruleId) : undefined;

  // seed the form when opening (edit -> hydrate, create -> defaults)
  useEffect(() => {
    if (!isOpen) return;
    if (existing) {
      setForm({
        name: existing.name ?? "",
        description: existing.description ?? "",
        trigger: (existing.trigger as TAutomationTrigger) ?? "issue.created",
        is_active: existing.is_active ?? true,
        conditions: existing.conditions ?? [],
        actions: existing.actions ?? [],
      });
    } else {
      setForm(DEFAULT_FORM);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, ruleId]);

  const setField = <K extends keyof TFormState>(key: K, value: TFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // --- conditions ---
  const addCondition = () =>
    setField("conditions", [...form.conditions, { field: "state", operator: "eq", value: "" }]);

  const updateCondition = (index: number, patch: Partial<TAutomationCondition>) =>
    setField(
      "conditions",
      form.conditions.map((condition, i) => (i === index ? { ...condition, ...patch } : condition))
    );

  const removeCondition = (index: number) =>
    setField(
      "conditions",
      form.conditions.filter((_, i) => i !== index)
    );

  // --- actions ---
  const addAction = () => setField("actions", [...form.actions, { type: "set_state", params: {} }]);

  const updateAction = (index: number, patch: Partial<TAutomationAction>) =>
    setField(
      "actions",
      form.actions.map((action, i) => (i === index ? { ...action, ...patch } : action))
    );

  const removeAction = (index: number) =>
    setField(
      "actions",
      form.actions.filter((_, i) => i !== index)
    );

  const onSubmit = async () => {
    if (!form.name.trim()) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: t("project_settings.automations.custom.toasts.name_required"),
      });
      return;
    }
    for (const condition of form.conditions) {
      if (!condition.field || !condition.operator) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Error!",
          message: t("project_settings.automations.custom.toasts.condition_incomplete"),
        });
        return;
      }
    }
    for (const action of form.actions) {
      if (!action.type) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Error!",
          message: t("project_settings.automations.custom.toasts.action_incomplete"),
        });
        return;
      }
    }

    const payload: Partial<TAutomationRule> = {
      name: form.name.trim(),
      description: form.description,
      trigger: form.trigger,
      is_active: form.is_active,
      conditions: form.conditions,
      actions: form.actions,
    };

    try {
      setIsSubmitting(true);
      if (ruleId) {
        await updateAutomationRule(workspaceSlug, projectId, ruleId, payload);
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "Success!",
          message: t("project_settings.automations.custom.toasts.updated"),
        });
      } else {
        await createAutomationRule(workspaceSlug, projectId, payload);
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "Success!",
          message: t("project_settings.automations.custom.toasts.created"),
        });
      }
      handleClose();
    } catch (error) {
      const err = error as { data?: { error?: string } };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: err?.data?.error ?? t("project_settings.automations.custom.toasts.save_failed"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} width={EModalWidth.XXL}>
      <div className="flex max-h-[80vh] flex-col gap-4 overflow-y-auto p-5">
        <h3 className="text-lg font-medium text-primary">
          {ruleId
            ? t("project_settings.automations.custom.edit_rule")
            : t("project_settings.automations.custom.create_rule")}
        </h3>

        {/* Name */}
        <div className="flex flex-col gap-1">
          <label className="text-sm text-secondary">{t("project_settings.automations.custom.name")}</label>
          <Input
            type="text"
            value={form.name}
            onChange={(e) => setField("name", e.target.value)}
            placeholder={t("project_settings.automations.custom.name_placeholder")}
            className="w-full"
          />
        </div>

        {/* Description */}
        <div className="flex flex-col gap-1">
          <label className="text-sm text-secondary">
            {t("project_settings.automations.custom.description_field")}
          </label>
          <textarea
            value={form.description}
            onChange={(e) => setField("description", e.target.value)}
            rows={2}
            className="placeholder-tertiary w-full rounded-md border-[0.5px] border-subtle-1 bg-layer-2 px-3 py-2 text-13 focus:outline-none"
          />
        </div>

        {/* Trigger */}
        <div className="flex flex-col gap-1">
          <label className="text-sm text-secondary">{t("project_settings.automations.custom.trigger")}</label>
          <CustomSelect
            value={form.trigger}
            onChange={(value: TAutomationTrigger) => setField("trigger", value)}
            label={t(TRIGGER_OPTIONS.find((option) => option.value === form.trigger)?.i18n_label ?? "")}
            buttonClassName="w-full justify-between"
          >
            {TRIGGER_OPTIONS.map((option) => (
              <CustomSelect.Option key={option.value} value={option.value}>
                {t(option.i18n_label)}
              </CustomSelect.Option>
            ))}
          </CustomSelect>
        </div>

        {/* Conditions */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-primary">
              {t("project_settings.automations.custom.conditions")}
            </label>
            <Button variant="neutral-primary" size="sm" prependIcon={<Plus className="size-3.5" />} onClick={addCondition}>
              {t("project_settings.automations.custom.add_condition")}
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            {form.conditions.map((condition, index) => (
              <ConditionRow
                // eslint-disable-next-line react/no-array-index-key
                key={index}
                condition={condition}
                projectId={projectId}
                onChange={(patch) => updateCondition(index, patch)}
                onRemove={() => removeCondition(index)}
              />
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-primary">
              {t("project_settings.automations.custom.actions_label")}
            </label>
            <Button variant="neutral-primary" size="sm" prependIcon={<Plus className="size-3.5" />} onClick={addAction}>
              {t("project_settings.automations.custom.add_action")}
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            {form.actions.map((action, index) => (
              <ActionRow
                // eslint-disable-next-line react/no-array-index-key
                key={index}
                action={action}
                projectId={projectId}
                getLabelById={getLabelById}
                onChange={(patch) => updateAction(index, patch)}
                onRemove={() => removeAction(index)}
              />
            ))}
          </div>
        </div>

        {/* Active */}
        <div className="flex items-center gap-2">
          <ToggleSwitch value={form.is_active} onChange={(value) => setField("is_active", value)} />
          <span className="text-sm text-secondary">{t("project_settings.automations.custom.active")}</span>
        </div>

        {/* Footer actions */}
        <div className="mt-2 flex items-center justify-end gap-2">
          <Button variant="neutral-primary" size="sm" onClick={handleClose} disabled={isSubmitting}>
            {t("project_settings.automations.custom.cancel")}
          </Button>
          <Button variant="primary" size="sm" onClick={() => void onSubmit()} loading={isSubmitting}>
            {ruleId ? t("project_settings.automations.custom.save") : t("project_settings.automations.custom.create")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});

// --- Condition row -----------------------------------------------------

type TConditionRowProps = {
  condition: TAutomationCondition;
  projectId: string;
  onChange: (patch: Partial<TAutomationCondition>) => void;
  onRemove: () => void;
};

function ConditionRow(props: TConditionRowProps) {
  const { condition, projectId, onChange, onRemove } = props;
  const { t } = useTranslation();

  const needsValue = condition.operator !== "is_empty" && condition.operator !== "is_not_empty";

  return (
    <div className="flex items-center gap-2 rounded border border-subtle p-2">
      <CustomSelect
        value={condition.field}
        onChange={(value: TAutomationConditionField) => onChange({ field: value })}
        label={t(CONDITION_FIELD_OPTIONS.find((option) => option.value === condition.field)?.i18n_label ?? "")}
        buttonClassName="w-36 justify-between shrink-0"
      >
        {CONDITION_FIELD_OPTIONS.map((option) => (
          <CustomSelect.Option key={option.value} value={option.value}>
            {t(option.i18n_label)}
          </CustomSelect.Option>
        ))}
      </CustomSelect>

      <CustomSelect
        value={condition.operator}
        onChange={(newOperator: TAutomationConditionOperator) =>
          onChange({
            operator: newOperator,
            value: newOperator === "is_empty" || newOperator === "is_not_empty" ? null : condition.value,
          })
        }
        label={t(CONDITION_OPERATOR_OPTIONS.find((option) => option.value === condition.operator)?.i18n_label ?? "")}
        buttonClassName="w-36 justify-between shrink-0"
      >
        {CONDITION_OPERATOR_OPTIONS.map((option) => (
          <CustomSelect.Option key={option.value} value={option.value}>
            {t(option.i18n_label)}
          </CustomSelect.Option>
        ))}
      </CustomSelect>

      {needsValue &&
        (condition.field === "priority" ? (
          <PriorityDropdown
            value={(condition.value as TIssuePriorities) || "none"}
            onChange={(value) => onChange({ value })}
            buttonVariant="border-with-text"
          />
        ) : condition.field === "state" ? (
          <StateDropdown
            value={(condition.value as string) ?? null}
            onChange={(value) => onChange({ value })}
            projectId={projectId}
            buttonVariant="border-with-text"
          />
        ) : (
          <Input
            type="text"
            value={(condition.value as string) ?? ""}
            onChange={(e) => onChange({ value: e.target.value })}
            placeholder={t("project_settings.automations.custom.value_placeholder")}
            className="w-full"
          />
        ))}

      <button
        type="button"
        onClick={onRemove}
        className="ml-auto shrink-0 text-tertiary hover:text-red-500"
        aria-label="Remove condition"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}

// --- Action row ----------------------------------------------------------

type TActionRowProps = {
  action: TAutomationAction;
  projectId: string;
  getLabelById: (labelId: string) => { id: string; name: string; color: string } | null;
  onChange: (patch: Partial<TAutomationAction>) => void;
  onRemove: () => void;
};

function ActionRow(props: TActionRowProps) {
  const { action, projectId, getLabelById, onChange, onRemove } = props;
  const { t } = useTranslation();

  const params: TAutomationActionParams = action.params ?? {};
  const setParams = (patch: Record<string, unknown>) => onChange({ params: { ...params, ...patch } });

  const currentLabel = params.label_id ? getLabelById(params.label_id as string) : null;

  return (
    <div className="flex items-center gap-2 rounded border border-subtle p-2">
      <CustomSelect
        value={action.type}
        onChange={(value: TAutomationActionType) => onChange({ type: value, params: {} })}
        label={t(ACTION_TYPE_OPTIONS.find((option) => option.value === action.type)?.i18n_label ?? "")}
        buttonClassName="w-40 justify-between shrink-0"
      >
        {ACTION_TYPE_OPTIONS.map((option) => (
          <CustomSelect.Option key={option.value} value={option.value}>
            {t(option.i18n_label)}
          </CustomSelect.Option>
        ))}
      </CustomSelect>

      {action.type === "set_state" && (
        <StateDropdown
          value={(params.state_id as string) ?? null}
          onChange={(value) => setParams({ state_id: value })}
          projectId={projectId}
          buttonVariant="border-with-text"
        />
      )}

      {action.type === "set_priority" && (
        <PriorityDropdown
          value={(params.priority as TIssuePriorities) || "none"}
          onChange={(value) => setParams({ priority: value })}
          buttonVariant="border-with-text"
        />
      )}

      {(action.type === "add_label" || action.type === "remove_label") && (
        <LabelDropdown
          projectId={projectId}
          value={params.label_id ? [params.label_id as string] : []}
          onChange={(ids) => setParams({ label_id: ids[ids.length - 1] })}
          label={
            <span className="flex items-center gap-1.5 rounded border border-subtle px-2 py-1 text-13">
              {currentLabel && (
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: currentLabel.color }} />
              )}
              {currentLabel?.name ?? t("project_settings.automations.custom.actions.pick_label")}
            </span>
          }
        />
      )}

      {action.type === "set_completed_at" && (
        <span className="text-sm text-tertiary">{t("project_settings.automations.custom.no_params")}</span>
      )}

      <button
        type="button"
        onClick={onRemove}
        className="ml-auto shrink-0 text-tertiary hover:text-red-500"
        aria-label="Remove action"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}
