# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Slack delivery (mote). See docs/mote-design/06-integrations-importers-automations.md.
#
# When a project has a SlackProjectSync with an incoming-webhook URL, push a short
# summary to the Slack channel bound to that webhook. Self-contained: no OAuth, no
# external task-bot, no inbound receiver — just an outbound POST. A no-op when the
# project has no webhook configured. All failures are swallowed (logged) so Slack
# outages never affect the activity pipeline.
#
# Scope: **directed activity only** — a mention (comment or description) or an
# assignment. TEAMDEV-745.
#
# The first cut announced every activity in _FIELD_VERB (state / priority /
# target_date / creation). On a project as busy as team-dev that buries the channel
# within a day, and a channel nobody reads is the same as no notification at all —
# which is the failure this task exists to fix. In-app notifications still cover the
# full activity set; Slack carries only what is addressed to a person.

import json
import re

import requests
from celery import shared_task
from django.conf import settings

from plane.db.models import SlackProjectSync, Issue, User
from plane.utils.exception_logger import log_exception


_TAG_RE = re.compile(r"<[^>]+>")


def _plain(html):
    """Strip HTML tags so the Slack snippet reads as plain text (Slack renders
    no HTML). Collapses whitespace and unescapes the few entities the editor emits."""
    if not html:
        return ""
    text = _TAG_RE.sub(" ", html)
    for entity, char in (("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"), ("&nbsp;", " "), ("&quot;", '"'), ("&#39;", "'")):
        text = text.replace(entity, char)
    return re.sub(r"\s+", " ", text).strip()


# Activity fields that can carry a mention. `comment` -> comment_html,
# `description` -> description_html; both are parsed with the same mention parser
# the in-app notification pipeline uses.
_MENTION_FIELDS = ("comment", "description")

# Assignment. Plane emits one activity per added/removed assignee; a removal leaves
# new_value empty, and "X unassigned Y" is not something anyone needs pinged for.
_ASSIGNEE_FIELDS = ("assignees", "assignee")


def _mentioned_names(html):
    """Display names of users mentioned in `html`, in a stable order.

    Reuses the notification pipeline's parser rather than a second regex — the
    mention markup (`<mention-component entity_name="user_mention">`) then has a
    single reader, so a future editor change cannot make Slack and in-app
    notifications disagree about what counts as a mention.
    Imported lazily: notification_task pulls in a wide slice of the model layer and
    this task is loaded by the Celery worker at import time.
    """
    from plane.bgtasks.notification_task import extract_comment_mentions

    user_ids = extract_comment_mentions(html or "")
    if not user_ids:
        return []
    users = User.objects.filter(pk__in=user_ids).values_list("display_name", "email")
    return sorted({(name or email) for name, email in users})


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

        # Build one line per *directed* activity — a mention or an assignment.
        # Anything else is deliberately silent here (see the scope note at the top).
        lines = []
        for activity in activities:
            field = activity.get("field")
            if field in _MENTION_FIELDS:
                raw = activity.get("new_value") or ""
                names = _mentioned_names(raw)
                if not names:
                    # A comment with no mention is not addressed to anyone.
                    continue
                who = ", ".join(names)
                where = "a comment on" if field == "comment" else "the description of"
                snippet = _plain(raw)
                detail = f": {snippet[:280]}" if snippet else ""
                lines.append(f"💬 {actor_name} mentioned *{who}* in {where} *{identifier}*{detail}")
            elif field in _ASSIGNEE_FIELDS:
                new_value = (activity.get("new_value") or "").strip()
                if not new_value:
                    continue
                lines.append(f"🙋 {actor_name} assigned *{identifier}* to *{new_value}*")

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
