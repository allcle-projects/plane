# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Automations rule engine — evaluator/executor. mote.
# See docs/mote-design/06-integrations-importers-automations.md, Feature 3.
#
# Dispatched from plane.bgtasks.issue_activities_task.issue_activity right after
# an issue's activities are persisted for the batch. Evaluates active
# AutomationRule rows for the fired triggers against the issue, runs the safe
# v1 action subset for matched rules, and writes an AutomationRuleLog per rule
# (matched or not). State-mutating actions re-emit issue_activity with
# requested_data={"automation": True, ...} so downstream consumers (e.g.
# notifications) still fire, while the LOOP GUARD below stops the re-emitted
# activity from re-triggering automations.

# Python imports
import json

# Third party imports
from celery import shared_task

# Django imports
from django.utils import timezone

# Module imports
from plane.db.models import AutomationRule, AutomationRuleLog, Issue, IssueLabel
from plane.utils.exception_logger import log_exception


def _field_value(issue, field):
    """Comparable value for `field` on `issue`.

    Scalar fields return a single value (or None). Membership fields
    (assignees/labels) return a list of str ids.
    """
    if field == "state":
        return str(issue.state_id) if issue.state_id else None
    if field == "state_group":
        return issue.state.group if issue.state_id and issue.state else None
    if field == "priority":
        return issue.priority
    if field == "assignees":
        return [str(a_id) for a_id in issue.assignees.values_list("id", flat=True)]
    if field == "labels":
        return [str(l_id) for l_id in issue.labels.values_list("id", flat=True)]
    if field == "target_date":
        return issue.target_date.isoformat() if issue.target_date else None
    if field == "created_by":
        return str(issue.created_by_id) if issue.created_by_id else None
    return None


def _matches(issue, condition):
    field = condition.get("field")
    operator = condition.get("operator")
    expected = condition.get("value")
    value = _field_value(issue, field)
    is_list_field = isinstance(value, list)

    if operator == "eq":
        return (expected in value) if is_list_field else (value == expected)
    if operator == "neq":
        return (expected not in value) if is_list_field else (value != expected)
    if operator == "in":
        expected_list = expected if isinstance(expected, (list, tuple, set)) else [expected]
        if is_list_field:
            return any(v in expected_list for v in value)
        return value in expected_list
    if operator == "contains":
        if is_list_field:
            return expected in value
        return expected is not None and value is not None and str(expected) in str(value)
    if operator == "is_empty":
        return value is None or value == [] or value == ""
    if operator == "is_not_empty":
        return not (value is None or value == [] or value == "")
    # Unknown operator: never matches (safe default).
    return False


def _rule_matches(issue, conditions):
    # AND-joined; no conditions means the trigger alone is sufficient.
    return all(_matches(issue, condition) for condition in conditions or [])


def _reemit_issue_activity(issue_id, project_id, actor_id, requested_data, current_instance):
    # Local import: issue_activities_task imports this module lazily to dodge a
    # circular import, so keep this side lazy too rather than relying on
    # import order between the two modules.
    from plane.bgtasks.issue_activities_task import issue_activity

    requested_data = dict(requested_data)
    requested_data["automation"] = True
    issue_activity.delay(
        type="issue.activity.updated",
        requested_data=json.dumps(requested_data),
        current_instance=json.dumps(current_instance),
        issue_id=str(issue_id),
        actor_id=str(actor_id) if actor_id else None,
        project_id=str(project_id),
        epoch=int(timezone.now().timestamp()),
        notification=True,
    )


def _run_set_state(issue, params, actor_id, project_id):
    state_id = params.get("state_id")
    if not state_id or str(issue.state_id) == str(state_id):
        return False
    old_state_id = issue.state_id
    issue.state_id = state_id
    issue.save(update_fields=["state", "updated_at"])
    _reemit_issue_activity(
        issue_id=issue.id,
        project_id=project_id,
        actor_id=actor_id,
        requested_data={"state": str(state_id)},
        current_instance={"state": str(old_state_id) if old_state_id else None},
    )
    return True


def _run_set_priority(issue, params, actor_id, project_id):
    priority = params.get("priority")
    if not priority or issue.priority == priority:
        return False
    old_priority = issue.priority
    issue.priority = priority
    issue.save(update_fields=["priority", "updated_at"])
    _reemit_issue_activity(
        issue_id=issue.id,
        project_id=project_id,
        actor_id=actor_id,
        requested_data={"priority": priority},
        current_instance={"priority": old_priority},
    )
    return True


def _run_add_label(issue, params, actor_id, project_id):
    label_id = params.get("label_id")
    if not label_id:
        return False
    current_label_ids = [str(l_id) for l_id in issue.labels.values_list("id", flat=True)]
    if str(label_id) in current_label_ids:
        return False
    # bulk_create bypasses BaseModel.save()'s crum-based auto created_by/
    # updated_by (which would otherwise clobber it to None outside a request
    # context), matching the pattern IssueCreateSerializer uses for labels.
    IssueLabel.objects.bulk_create(
        [
            IssueLabel(
                label_id=label_id,
                issue=issue,
                project_id=project_id,
                workspace_id=issue.workspace_id,
                created_by_id=actor_id,
                updated_by_id=actor_id,
            )
        ]
    )
    _reemit_issue_activity(
        issue_id=issue.id,
        project_id=project_id,
        actor_id=actor_id,
        requested_data={"label_ids": current_label_ids + [str(label_id)]},
        current_instance={"label_ids": current_label_ids},
    )
    return True


def _run_remove_label(issue, params, actor_id, project_id):
    label_id = params.get("label_id")
    if not label_id:
        return False
    current_label_ids = [str(l_id) for l_id in issue.labels.values_list("id", flat=True)]
    if str(label_id) not in current_label_ids:
        return False
    IssueLabel.objects.filter(issue=issue, label_id=label_id).delete()
    _reemit_issue_activity(
        issue_id=issue.id,
        project_id=project_id,
        actor_id=actor_id,
        requested_data={
            "label_ids": [l_id for l_id in current_label_ids if l_id != str(label_id)]
        },
        current_instance={"label_ids": current_label_ids},
    )
    return True


def _run_set_completed_at(issue, params, actor_id, project_id):
    # Only meaningful once the issue is sitting in a completed-group state.
    if not issue.state_id or not issue.state or issue.state.group != "completed":
        return False
    if issue.completed_at is not None:
        return False
    issue.completed_at = timezone.now()
    issue.save(update_fields=["completed_at", "updated_at"])
    # No tracked activity field for completed_at, so nothing to re-emit.
    return True


# Safe v1 action subset. Unknown/unsupported action types (notify_slack,
# create_subtask, move_project, ...) are logged and skipped — see the
# "unsupported" branch in evaluate_automations below.
ACTION_HANDLERS = {
    "set_state": _run_set_state,
    "set_priority": _run_set_priority,
    "add_label": _run_add_label,
    "remove_label": _run_remove_label,
    "set_completed_at": _run_set_completed_at,
}


@shared_task
def evaluate_automations(issue_id, project_id, actor_id, triggers, is_automation=False):
    # LOOP GUARD: never let automation-driven activity re-trigger automations.
    if is_automation:
        return

    if not triggers:
        return

    rules = AutomationRule.objects.filter(
        project_id=project_id,
        is_active=True,
        deleted_at__isnull=True,
        trigger__in=triggers,
    ).order_by("run_order")

    # Short-circuit: no rules configured for these triggers on this project.
    if not rules.exists():
        return

    issue = Issue.objects.filter(pk=issue_id).select_related("state").first()
    if issue is None:
        return

    for rule in rules:
        matched = False
        actions_run = []
        error = None
        try:
            matched = _rule_matches(issue, rule.conditions)
            if matched:
                for action in rule.actions or []:
                    action_type = action.get("type")
                    params = action.get("params") or {}
                    handler = ACTION_HANDLERS.get(action_type)
                    if handler is None:
                        actions_run.append({"type": action_type, "status": "unsupported"})
                        log_exception(
                            Exception(
                                f"automation rule {rule.id}: unsupported action "
                                f"type '{action_type}'"
                            )
                        )
                        continue
                    ran = handler(issue, params, actor_id, project_id)
                    actions_run.append(
                        {"type": action_type, "status": "ran" if ran else "skipped"}
                    )
        except Exception as e:
            error = str(e)
            log_exception(e)

        try:
            # bulk_create for the same created_by/updated_by reason as the
            # label handlers above.
            AutomationRuleLog.objects.bulk_create(
                [
                    AutomationRuleLog(
                        project_id=project_id,
                        workspace_id=rule.workspace_id,
                        rule=rule,
                        issue_id=issue_id,
                        matched=matched,
                        actions_run=actions_run,
                        error=error,
                        created_by_id=actor_id,
                        updated_by_id=actor_id,
                    )
                ]
            )
        except Exception as e:
            log_exception(e)
