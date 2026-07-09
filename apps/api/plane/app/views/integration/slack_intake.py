# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Slack → Plane inbound intake (mote) — see
# docs/mote-design/06-integrations-importers-automations.md.
#
# A public, unauthenticated endpoint that turns a Slack suggestion into a Plane
# work item. Meant to back a Slack slash command (e.g. `/plane-task <title>`) or
# a Slack Workflow-Builder webhook step, one per project:
#
#     POST /api/slack/intake/<workspace_slug>/<project_id>/
#
# The target project is fixed by the URL, so no channel↔project mapping is
# needed. Requests are authenticated by Slack's request signature when
# SLACK_SIGNING_SECRET is set, or by a shared token (SLACK_INTAKE_TOKEN) for the
# Workflow-Builder path which cannot sign. With neither configured the endpoint
# refuses to run, so it is never open-by-accident in production.

import hashlib
import hmac
import json
import time
from urllib.parse import parse_qs

from django.conf import settings
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from ..base import BaseAPIView
from plane.db.models import Project, Issue, WorkspaceMember
from plane.utils.exception_logger import log_exception


def _slack_response(text):
    # Slash-command / interactive responses render this inline in the channel.
    return Response(
        {"response_type": "ephemeral", "text": text}, status=status.HTTP_200_OK
    )


def _verify_signature(request, raw_body):
    """Validate Slack's v0 request signature. Returns True/False."""
    secret = getattr(settings, "SLACK_SIGNING_SECRET", "") or ""
    if not secret:
        return None  # not configured — caller falls back to token auth
    timestamp = request.META.get("HTTP_X_SLACK_REQUEST_TIMESTAMP", "")
    sig = request.META.get("HTTP_X_SLACK_SIGNATURE", "")
    if not timestamp or not sig:
        return False
    try:
        # Reject replays older than 5 minutes.
        if abs(time.time() - int(timestamp)) > 60 * 5:
            return False
    except (TypeError, ValueError):
        return False
    basestring = f"v0:{timestamp}:{raw_body.decode('utf-8', 'replace')}".encode("utf-8")
    expected = "v0=" + hmac.new(secret.encode("utf-8"), basestring, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, sig)


def _verify_token(payload, request):
    """Validate a shared token (Slack legacy verification token or a
    Workflow-Builder secret) against SLACK_INTAKE_TOKEN."""
    expected = getattr(settings, "SLACK_INTAKE_TOKEN", "") or ""
    if not expected:
        return None  # not configured
    supplied = (
        payload.get("token")
        or request.META.get("HTTP_X_INTAKE_TOKEN", "")
        or request.GET.get("token", "")
    )
    return bool(supplied) and hmac.compare_digest(str(supplied), expected)


class SlackTaskIntakeEndpoint(BaseAPIView):
    """Create a Plane work item from a Slack slash command / workflow webhook."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request, slug, project_id):
        # Read the raw body once (signature is computed over it; also lets us
        # parse form/JSON without fighting DRF's stream).
        raw = request.body or b""

        content_type = request.META.get("CONTENT_TYPE", "") or ""
        payload = {}
        if "application/json" in content_type:
            try:
                payload = json.loads(raw.decode("utf-8", "replace") or "{}")
            except ValueError:
                payload = {}
        else:
            # Slack slash commands post application/x-www-form-urlencoded.
            parsed = parse_qs(raw.decode("utf-8", "replace"))
            payload = {k: v[0] if v else "" for k, v in parsed.items()}

        # --- Authenticate the caller -------------------------------------
        sig_ok = _verify_signature(request, raw)
        token_ok = _verify_token(payload, request)
        if sig_ok is None and token_ok is None:
            # Neither secret configured — refuse rather than run open.
            return _slack_response(
                "⚠️ Slack intake is not configured on the server "
                "(set SLACK_SIGNING_SECRET or SLACK_INTAKE_TOKEN)."
            )
        if not (sig_ok or token_ok):
            return Response(
                {"error": "invalid signature"}, status=status.HTTP_401_UNAUTHORIZED
            )

        # --- Resolve the target project ----------------------------------
        project = (
            Project.objects.filter(pk=project_id, workspace__slug=slug)
            .select_related("workspace")
            .first()
        )
        if project is None:
            return _slack_response("⚠️ This Slack command points to an unknown project.")

        # --- Extract the suggestion --------------------------------------
        text = (
            payload.get("text")
            or payload.get("title")
            or payload.get("name")
            or ""
        ).strip()
        if not text:
            return _slack_response(
                "사용법: `/plane-task <제목>` — 만들 태스크의 제목을 입력해주세요."
            )

        lines = text.split("\n", 1)
        title = lines[0].strip()[:250]
        body_rest = lines[1].strip() if len(lines) > 1 else ""
        extra_desc = (payload.get("description") or "").strip()

        submitter = (
            payload.get("user_name")
            or payload.get("user_id")
            or "Slack"
        )
        channel = payload.get("channel_name") or payload.get("channel_id") or ""
        attribution = f"Slack #{channel} · {submitter}".strip(" ·")
        desc_parts = [p for p in (body_rest, extra_desc) if p]
        desc_parts.append(f"_via {attribution}_")
        description_html = "".join(f"<p>{p}</p>" for p in desc_parts)

        # created_by must be a real workspace member; pick the highest-role
        # active member (admin) so the item is owned by a person, not anon.
        actor = None
        member = (
            WorkspaceMember.objects.filter(
                workspace=project.workspace, is_active=True
            )
            .select_related("member")
            .order_by("-role")
            .first()
        )
        if member:
            actor = member.member
        actor = actor or project.created_by

        try:
            issue = Issue.objects.create(
                name=title,
                description_html=description_html,
                project=project,
                workspace=project.workspace,
                created_by=actor,
            )
        except Exception as exc:  # noqa: BLE001
            log_exception(exc)
            return _slack_response("⚠️ Failed to create the work item. Please try again.")

        identifier = f"{project.identifier}-{issue.sequence_id}"
        base = (settings.WEB_URL or "").rstrip("/")
        url = (
            f"{base}/{slug}/projects/{project.id}/issues/{issue.id}" if base else ""
        )
        text_out = f"✅ Created *{identifier}*: {title}"
        if url:
            text_out += f"\n<{url}|{identifier} · {project.name}>"
        return _slack_response(text_out)
