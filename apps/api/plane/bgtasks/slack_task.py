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

import html as html_lib
import json
import re

import requests
from celery import shared_task
from django.conf import settings

from plane.db.models import SlackProjectSync, Issue, ProjectMember, User
from plane.utils.exception_logger import log_exception
from plane.utils.uuid import is_valid_uuid


_TAG_RE = re.compile(r"<[^>]+>")


def _slack_escape(text):
    """Escape the three characters Slack reads as mrkdwn control syntax.

    Everything user-authored that reaches the message body must go through this.
    Slack parses `<...>` as a link/command span: an unescaped `<!channel>` in a
    comment pings the whole channel, and `<https://evil|Reset your password>`
    renders as a plain-looking link to somewhere else. `comment_html` is not
    sanitized on the way in (`validate_html_content` covers description_html
    only), and `display_name` accepts any string — so the escape has to happen
    here, on the way out. Order matters: `&` first, or it re-escapes its own output.
    """
    if not text:
        return ""
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _plain(html):
    """Strip HTML tags so the Slack snippet reads as plain text (Slack renders no
    HTML). Collapses whitespace and resolves entities.

    Returns *unescaped* text — the caller is responsible for `_slack_escape`.
    Doing both here would be tempting and wrong: the message also contains
    deliberate mrkdwn (`*bold*`, `<url|label>`) that must not be escaped."""
    if not html:
        return ""
    text = html_lib.unescape(_TAG_RE.sub(" ", html))
    return re.sub(r"\s+", " ", text).strip()


# Activity fields that can carry a mention. `comment` -> comment_html,
# `description` -> description_html; both are parsed with the same mention parser
# the in-app notification pipeline uses.
#
# ⚠️ Known gaps — both are the same shape: no activity is emitted, so there is
# nothing for this task to read. In-app notifies in both cases because it parses
# `requested_data` directly, which this task is not given. Under-delivery, not over.
#
#  1. Mentions written in the body **while creating an issue**.
#     `create_issue_activity` does not call `track_description`, so the batch has no
#     `field="description"` activity at all.
#  2. Mentions added by a **consecutive body edit from the same author**.
#     `track_description` merges into the previous activity (`created_at` bump only)
#     when the issue's last activity is a description activity by the same actor —
#     that edit's new_value is never recorded. The mention is then present in every
#     later `old_value`, so the diff below can never recover it either.
_MENTION_FIELDS = ("comment", "description")

# Assignment. Plane emits one activity per added/removed assignee; a removal leaves
# new_value empty, and "X unassigned Y" is not something anyone needs pinged for.
_ASSIGNEE_FIELDS = ("assignees", "assignee")


def _mention_ids(html):
    """User ids mentioned in `html`, validated.

    Reuses the notification pipeline's parser rather than a second regex — the
    mention markup (`<mention-component entity_name="user_mention">`) then has a
    single reader, so a future editor change cannot make Slack and in-app
    notifications disagree about what counts as a mention.

    The ids are NOT validated by that parser: it returns `entity_identifier`
    verbatim, and comment_html is client-supplied. One `entity_identifier="abc"`
    would make the `pk__in` query raise, and the outer `except` would swallow the
    whole batch — losing the *other*, well-formed lines with it. So filter first.
    """
    # Function-level import to keep the module-level graph one-directional, not for
    # startup cost: CELERY_IMPORTS loads both this task and notification_task at
    # worker boot, so by the time this runs it is a sys.modules hit.
    from plane.bgtasks.notification_task import extract_comment_mentions

    return {m for m in extract_comment_mentions(html or "") if is_valid_uuid(m)}


def _new_mention_names(project_id, new_html, old_html):
    """Display names of users *newly* mentioned by this edit, in a stable order.

    Two filters, both matching what the in-app pipeline does — a mention that does
    not notify in-app must not notify in Slack either:

    1. **Diff against the previous value.** Activities carry the full body, not a
       patch: fixing a typo in a comment re-emits every mention it contains. Without
       this the same person is pinged on every edit — the exact noise this task was
       narrowed to avoid. (`notification_task.get_new_comment_mentions`)
    2. **Active project members only.** In-app drops mentions of non-members; Slack
       announcing them would leak names into a channel the in-app path deliberately
       stays quiet about. (`notification_task` intersects with `project_members`)
    """
    fresh = _mention_ids(new_html) - _mention_ids(old_html)
    if not fresh:
        return []
    member_ids = ProjectMember.objects.filter(
        project_id=project_id, member_id__in=fresh, is_active=True
    ).values_list("member_id", flat=True)
    if not member_ids:
        return []
    users = User.objects.filter(pk__in=list(member_ids)).values_list("display_name", "email")
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
        actor_name = _slack_escape((actor.display_name or actor.email) if actor else "Someone")

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
                names = _new_mention_names(project_id, raw, activity.get("old_value"))
                if not names:
                    # No mention, or none that this edit newly introduced.
                    continue
                who = _slack_escape(", ".join(names))
                where = "a comment on" if field == "comment" else "the description of"
                snippet = _slack_escape(_plain(raw)[:280])
                detail = f": {snippet}" if snippet else ""
                lines.append(f"💬 {actor_name} mentioned *{who}* in {where} *{identifier}*{detail}")
            elif field in _ASSIGNEE_FIELDS:
                new_value = _slack_escape((activity.get("new_value") or "").strip())
                if not new_value:
                    continue
                lines.append(f"🙋 {actor_name} assigned *{identifier}* to *{new_value}*")

        if not lines:
            return

        text = "\n".join(lines)
        if url:
            # The label is user-authored; `|` and `>` inside it would end the link
            # span early and leak the rest as clickable text.
            text += f"\n<{url}|{identifier} · {_slack_escape(issue.name).replace('|', '｜')}>"

        payload = {"text": text}
        for sync in syncs:
            try:
                requests.post(sync.webhook_url, json=payload, timeout=5)
            except Exception as exc:  # noqa: BLE001 — never let Slack break the pipeline
                log_exception(exc)
    except Exception as exc:  # noqa: BLE001
        log_exception(exc)
        return
