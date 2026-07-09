# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Slack delivery (mote). See docs/mote-design/06-integrations-importers-automations.md.
#
# When a project has a SlackProjectSync with an incoming-webhook URL, push a short
# summary of each issue activity (comment / state / priority / assignee change) to
# the Slack channel bound to that webhook. Self-contained: no OAuth, no external
# task-bot, no inbound receiver — just an outbound POST. A no-op when the project
# has no webhook configured. All failures are swallowed (logged) so Slack outages
# never affect the activity pipeline.

import json

import requests
from celery import shared_task
from django.conf import settings

from plane.db.models import SlackProjectSync, Issue, User
from plane.utils.exception_logger import log_exception


# Which activity fields are worth announcing, and how to phrase them.
_FIELD_VERB = {
    "comment": "commented on",
    "state": "changed the state of",
    "priority": "changed the priority of",
    "assignees": "reassigned",
    "assignee": "reassigned",
    "target_date": "rescheduled",
    None: "created",
}


def _issue_url(slug, project_id, issue_id):
    base = (settings.WEB_URL or "").rstrip("/")
    if not base:
        return None
    return f"{base}/{slug}/projects/{project_id}/issues/{issue_id}"


@shared_task
def slack_activity_notify(project_id, actor_id, issue_id, issue_activities_created):
    try:
        syncs = list(
            SlackProjectSync.objects.filter(project_id=project_id).exclude(webhook_url="")
        )
        if not syncs:
            return

        issue = (
            Issue.objects.filter(pk=issue_id)
            .select_related("project", "workspace")
            .first()
        )
        if issue is None:
            return

        actor = User.objects.filter(pk=actor_id).first()
        actor_name = (actor.display_name or actor.email) if actor else "Someone"

        try:
            activities = json.loads(issue_activities_created)
        except (TypeError, ValueError):
            activities = []

        identifier = f"{issue.project.identifier}-{issue.sequence_id}"
        url = _issue_url(issue.workspace.slug, str(project_id), str(issue_id))

        # Build one line per meaningful activity.
        lines = []
        for activity in activities:
            field = activity.get("field")
            if field not in _FIELD_VERB:
                continue
            verb = _FIELD_VERB[field]
            if field == "comment":
                snippet = (activity.get("new_value") or "").strip()
                # comment_stripped is not on the activity; use the comment text field.
                detail = f": {snippet[:280]}" if snippet else ""
                lines.append(f"💬 {actor_name} {verb} *{identifier}*{detail}")
            elif field is None:
                lines.append(f"✨ {actor_name} {verb} *{identifier}* — {issue.name}")
            else:
                new_value = (activity.get("new_value") or "").strip()
                to = f" → *{new_value}*" if new_value else ""
                lines.append(f"🔔 {actor_name} {verb} *{identifier}*{to}")

        if not lines:
            return

        text = "\n".join(lines)
        if url:
            text += f"\n<{url}|{identifier} · {issue.name}>"

        payload = {"text": text}
        for sync in syncs:
            try:
                requests.post(sync.webhook_url, json=payload, timeout=5)
            except Exception as exc:  # noqa: BLE001 — never let Slack break the pipeline
                log_exception(exc)
    except Exception as exc:  # noqa: BLE001
        log_exception(exc)
        return
