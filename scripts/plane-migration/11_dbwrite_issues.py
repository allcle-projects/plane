#!/usr/bin/env python3
# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
"""
11 - ALTERNATIVE PATH: direct DB-write issue migration via Django ORM.

Preserves what the public API (10_migrate_issues.py) cannot:
  * exact cloud issue sequence_id numbers (even across TEAMDEV's gaps)
  * author/timestamp fidelity is the same either way; this path is only
    needed for sequence_id (and, for pages, the Yjs binary — see
    21_dbwrite_pages.py)

THIS IS A SCAFFOLD. Dry-run is the hard default; --execute is required for
any write. Nothing runs automatically. Read docs/mote-design/11-cloud-to-
selfhost-migration-plan.md §7/§8 and take a DB backup + do a recovery drill
BEFORE the first --execute, because `issues` has NO db-level unique
constraint on (project_id, sequence_id) — only Issue.save()'s advisory lock
enforces it, and bulk_create() bypasses save() entirely, so there is no
safety net against a bad run creating duplicate sequence numbers. This
script's own external_id pre-filter is the only de-dup guard.

STANDALONE BY DESIGN: this file does not import common.py (the api
container has no bind mount for the local repo — see run command below —
so only this single file is guaranteed to be present). It has its own
minimal urllib-based cloud client.

=============================================================================
MECHANISM (confirmed by reading the fork source on server3, 2026-07-10)
=============================================================================
- apps/api/plane/db/models/issue.py Issue.save(): on create, takes a
  per-project Postgres advisory lock, then sets
  self.sequence_id = IssueSequence.objects.filter(project=..).aggregate(Max)
  + 1, then creates the Issue row, then creates the matching IssueSequence
  row. This is why neither plain ORM .save() nor the public API (which also
  calls .save() under the hood) can preserve an arbitrary sequence_id.
- Django QuerySet.bulk_create() builds the INSERT directly from each
  instance's already-set attribute values. It does NOT call Model.save() and
  does NOT call Field.pre_save() (that's where auto_now_add/auto_now and any
  custom save() logic normally fire), and it does NOT dispatch pre_save/
  post_save signals. So a sequence_id (or created_at/updated_at, which are
  auto_now_add=True/auto_now=True on TimeAuditModel — see
  apps/api/plane/db/mixins.py) that we set explicitly on the instance is
  inserted VERBATIM. Nothing else auto-populates it, so we MUST set it.
- Because Issue.save() is skipped, we must ALSO manually:
    * create the matching IssueSequence row ourselves (normally done inside
      Issue.save()'s transaction)
    * set description_stripped ourselves (normally stripped in save())
    * set workspace_id on every ProjectBaseModel-derived row we build
      (IssueAssignee, IssueLabel, IssueSequence, IssueComment) — their
      save() does `self.workspace = self.project.workspace`, also skipped
    * set created_at/updated_at ourselves (auto_now_add/auto_now do not
      fire under bulk_create — see mixins.py TimeAuditModel)
- IssueComment.save() normally also creates/updates a linked `Description`
  row (apps/api/plane/db/models/description.py) for the newer collaborative-
  editing sync. bulk_create() skips this too. comment_html/comment_json/
  comment_stripped are still stored directly on IssueComment (readable via
  the API/UI), but the separate Description sync row is NOT created. Noted
  as a limitation; harmless for read/display, matters only for the live
  collaborative editor's version history on that comment.
- issue_versions has 0 rows for 822 existing issues (confirmed via DB query)
  → IssueVersion is unused on this deployment. Skipping its sync signal by
  using bulk_create is harmless and, if anything, avoids notification/
  activity-log noise from a synthetic import.
- IssueLink is intentionally NOT migrated by this script (not requested;
  10_migrate_issues.py already covers links via the public API path).

=============================================================================
CONFIRMED IMPORTS / SCHEMA (apps/api/plane/db/models/, 2026-07-10)
=============================================================================
  from plane.db.models import (
      Issue, IssueSequence, IssueAssignee, IssueLabel, IssueComment,
      Label, State, Project, User, WorkspaceMember,
  )
  from plane.utils.html_processor import strip_tags   # same helper Issue/
                                                        # IssueComment .save()
                                                        # use internally

  issues:  id(uuid), name, description_json(jsonb NOT NULL),
    description_html(text NOT NULL), description_stripped(text null),
    description_binary(bytea null), priority(varchar NOT NULL),
    sequence_id(int NOT NULL), sort_order(float NOT NULL),
    is_draft(bool NOT NULL), point(int null), start_date/target_date(date
    null), completed_at(tz null), state_id(uuid null), parent_id(uuid null),
    created_by_id/updated_by_id(uuid null), project_id/workspace_id(uuid NOT
    NULL), created_at/updated_at(tz NOT NULL, auto_now_add/auto_now — see
    above), external_id/external_source(varchar null),
    estimate_point_id/type_id(uuid null), archived_at(date null),
    deleted_at(tz null).
  issue_sequences: id, sequence(bigint NOT NULL), deleted(bool NOT NULL),
    issue_id(uuid null — SET_NULL on issue delete, kept for history),
    project_id/workspace_id(NOT NULL), created_by_id/updated_by_id(null),
    created_at/updated_at(NOT NULL).
  `issues` unique constraint = PK(id) ONLY. No db unique on
  (project_id, sequence_id) — application-level advisory lock only, which
  bulk_create bypasses. The delta is entirely ABOVE current self-host max
  seq per project (GROWTH 68→69-136, ALLCL 182→183-197, STORE 62→63-67,
  MOTEERP 71→72-73, TEAMDEV 388→389-410), so no real collision is expected
  — but nothing in the schema enforces that; this script's external_id
  pre-filter is the guard.

=============================================================================
RUN COMMAND (verified 2026-07-10 — plane-api-1 has NO bind mount for the
repo, only the `plane_logs_api` volume; python is /usr/local/bin/python;
workdir /code; DJANGO_SETTINGS_MODULE defaults to "plane.settings.production"
via manage.py's os.environ.setdefault, not overridden in the compose env)
=============================================================================

  # 1. copy this file to server3, then into the container (docker cp needs a
  #    host-local source; there is no bind mount so `docker cp` from the repo
  #    checkout on server3, or scp from your laptop first, both work):
  scp scripts/plane-migration/11_dbwrite_issues.py server3:/tmp/
  ssh server3 'docker cp /tmp/11_dbwrite_issues.py plane-api-1:/code/11_dbwrite_issues.py'

  # 2. run it (dry-run; cloud token from task-bot/.env, no self-host API
  #    token needed — this runs as the Django process itself, no
  #    APIKeyAuthentication involved):
  ssh server3 'docker exec -e PLANE_API_TOKEN="$(grep -m1 PLANE_API_TOKEN /srv/shared/app-src/task-bot/.env | cut -d= -f2-)" plane-api-1 python /code/11_dbwrite_issues.py'

  # 3. execute for real (same command + --execute):
  ssh server3 'docker exec -e PLANE_API_TOKEN="$(grep -m1 PLANE_API_TOKEN /srv/shared/app-src/task-bot/.env | cut -d= -f2-)" plane-api-1 python /code/11_dbwrite_issues.py --execute'

Flags: --execute (default dry-run), --project IDENTIFIER (repeatable),
--limit N (cap issues per project, for a smoke test).
"""

import argparse
import base64
import json
import os
import sys
import uuid
import urllib.error
import urllib.parse
import urllib.request

# --------------------------------------------------------------------------- #
# Django bootstrap — must happen before any `plane.db.models` import.
# --------------------------------------------------------------------------- #
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "plane.settings.production")
import django  # noqa: E402

django.setup()

from django.db import transaction  # noqa: E402
from django.utils import timezone  # noqa: E402

from plane.db.models import (  # noqa: E402
    Issue,
    IssueAssignee,
    IssueComment,
    IssueLabel,
    IssueSequence,
    Label,
    Project,
    State,
    WorkspaceMember,
)
from plane.utils.html_processor import strip_tags  # noqa: E402

WORKSPACE_SLUG = "motemote"
EXTERNAL_SOURCE = "plane-cloud"
EXCLUDE_IDENTIFIERS = {"PLANE", "IDEA", "MOTEM", "TEST"}

CLOUD_BASE = "https://api.plane.so/api/v1"
USER_AGENT = "mote-migration-dbwrite/1.0 (+https://plane.motemote.co.kr)"
TASKBOT_ENV = "/srv/shared/app-src/task-bot/.env"


# --------------------------------------------------------------------------- #
# Minimal standalone cloud client (no common.py dependency in-container)
# --------------------------------------------------------------------------- #
def load_cloud_token():
    token = os.environ.get("PLANE_API_TOKEN")
    if token:
        return token.strip()
    try:
        with open(TASKBOT_ENV, "r", encoding="utf-8") as handle:
            for line in handle:
                if line.strip().startswith("PLANE_API_TOKEN="):
                    return line.strip().split("=", 1)[1].strip().strip('"').strip("'")
    except OSError:
        pass
    raise SystemExit("ERROR: PLANE_API_TOKEN not set and not found in task-bot/.env")


class CloudClient:
    def __init__(self, token):
        self.token = token
        self.base = f"{CLOUD_BASE}/workspaces/{WORKSPACE_SLUG}"

    def _get(self, path, params=None):
        url = f"{self.base}/{path.lstrip('/')}"
        if params:
            url = f"{url}?{urllib.parse.urlencode(params)}"
        req = urllib.request.Request(
            url,
            headers={
                "X-API-Key": self.token,
                "User-Agent": USER_AGENT,
                "Accept": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.status, json.loads(resp.read().decode("utf-8") or "{}")
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            return exc.code, _maybe_json(body)

    def paginated(self, path, params=None, page_size=100):
        params = dict(params or {})
        params.setdefault("per_page", page_size)
        cursor = None
        while True:
            call = dict(params)
            if cursor:
                call["cursor"] = cursor
            status, data = self._get(path, call)
            if status >= 400:
                raise RuntimeError(f"cloud GET {path} failed ({status}): {data}")
            if isinstance(data, list):
                yield from data
                return
            yield from data.get("results", [])
            if not data.get("next_page_results"):
                return
            cursor = data.get("next_cursor")
            if not cursor:
                return

    def get(self, path):
        status, data = self._get(path)
        if status >= 400:
            raise RuntimeError(f"cloud GET {path} failed ({status}): {data}")
        return data


def _maybe_json(body):
    try:
        return json.loads(body)
    except (ValueError, TypeError):
        return body


def log(msg):
    sys.stdout.write(msg + "\n")
    sys.stdout.flush()


# --------------------------------------------------------------------------- #
# Self-host reference maps (ORM)
# --------------------------------------------------------------------------- #
def selfhost_projects():
    out = {}
    for p in Project.objects.filter(workspace__slug=WORKSPACE_SLUG):
        if p.identifier:
            out[p.identifier.upper()] = p
    return out


def state_map(project):
    return {s.name.strip().lower(): s.id for s in State.objects.filter(project=project)}


def label_map(project):
    by_name, by_ext = {}, {}
    for label in Label.objects.filter(project=project):
        by_name[label.name.strip().lower()] = label.id
        if label.external_id:
            by_ext[label.external_id] = label.id
    return by_name, by_ext


def member_email_map(workspace):
    out = {}
    for wm in WorkspaceMember.objects.filter(workspace=workspace).select_related("member"):
        email = (wm.member.email or "").strip().lower()
        if email:
            out[email] = wm.member_id
    return out


def get_or_create_label(project, workspace, name, color, execute, cache_by_name, warnings):
    key = name.strip().lower()
    if key in cache_by_name:
        return cache_by_name[key]
    if not execute:
        warnings.append(f"label would be created: '{name}'")
        return None
    label = Label.objects.create(
        project=project,
        workspace=workspace,
        name=name,
        color=color or "",
        external_source=EXTERNAL_SOURCE,
    )
    cache_by_name[key] = label.id
    return label.id


# --------------------------------------------------------------------------- #
# Migration
# --------------------------------------------------------------------------- #
def migrate_project(cloud, ident, cloud_project, sh_project, execute, limit):
    log(f"\n=== {ident} (cloud {cloud_project['id']} -> self-host {sh_project.id}) ===")
    workspace = sh_project.workspace
    stats = {
        "issues_create": 0, "issues_skip": 0,
        "assignees_create": 0, "labels_create": 0,
        "comments_create": 0, "comments_skip": 0,
        "parents_linked": 0,
    }
    warnings = []

    sh_states = state_map(sh_project)
    sh_labels_by_name, sh_labels_by_ext = label_map(sh_project)
    sh_members = member_email_map(workspace)

    cloud_pid = cloud_project["id"]
    cloud_states = {s["id"]: s.get("name", "") for s in cloud.paginated(f"projects/{cloud_pid}/states/")}
    cloud_labels = {l["id"]: l for l in cloud.paginated(f"projects/{cloud_pid}/labels/")}
    try:
        cloud_members = {m["id"]: (m.get("email") or "") for m in cloud.paginated("members/")}
    except RuntimeError:
        cloud_members = {}

    already = set(
        Issue.objects.filter(project=sh_project, external_source=EXTERNAL_SOURCE)
        .exclude(external_id__isnull=True)
        .values_list("external_id", flat=True)
    )
    existing_comment_ext = set(
        IssueComment.objects.filter(project=sh_project, external_source=EXTERNAL_SOURCE)
        .exclude(external_id__isnull=True)
        .values_list("external_id", flat=True)
    )

    default_state_id = None
    default_state = State.objects.filter(project=sh_project, default=True).first()
    if default_state:
        default_state_id = default_state.id
    elif sh_states:
        default_state_id = next(iter(sh_states.values()))

    new_issues = []          # Issue instances to bulk_create
    new_sequences = []       # IssueSequence instances (parallel to new_issues)
    new_assignee_rows = []   # IssueAssignee instances
    new_label_rows = []      # IssueLabel instances
    pending_comments = []    # (cloud_issue_id, cloud_project_id) needing comment sync
    parents = {}             # cloud_issue_id -> cloud_parent_id
    cloud_to_new = {}        # cloud_issue_id -> new Issue.id (this run)

    now = timezone.now()
    count = 0
    for issue in cloud.paginated(f"projects/{cloud_pid}/issues/"):
        if limit and count >= limit:
            break
        count += 1
        cid = issue["id"]
        if issue.get("parent"):
            parents[cid] = issue["parent"]

        if cid in already:
            stats["issues_skip"] += 1
            pending_comments.append(cid)
            continue

        # State by name.
        cloud_state_name = cloud_states.get(issue.get("state"), "").strip().lower()
        state_id = sh_states.get(cloud_state_name, default_state_id)

        new_id = uuid.uuid4()
        cloud_to_new[cid] = new_id
        html = issue.get("description_html") or "<p></p>"
        binary = issue.get("description_binary")

        if not execute:
            stats["issues_create"] += 1
            if cloud_state_name and cloud_state_name not in sh_states:
                warnings.append(f"issue {ident}#{issue.get('sequence_id')}: state "
                                 f"'{cloud_state_name}' not found on self-host, "
                                 "would fall back to project default")
            pending_comments.append(cid)
            continue

        obj = Issue(
            id=new_id,
            name=issue.get("name") or "(untitled)",
            description_json=issue.get("description") or issue.get("description_json") or {},
            description_html=html,
            description_stripped=strip_tags(html) if html else None,
            description_binary=base64.b64decode(binary) if binary else None,
            priority=issue.get("priority") or "none",
            sequence_id=issue["sequence_id"],
            sort_order=issue.get("sort_order") or 65535,
            is_draft=bool(issue.get("is_draft", False)),
            point=issue.get("point"),
            start_date=issue.get("start_date"),
            target_date=issue.get("target_date"),
            completed_at=issue.get("completed_at"),
            state_id=state_id,
            parent_id=None,  # linked in the 2nd pass
            created_by_id=sh_members.get((cloud_members.get(issue.get("created_by")) or "").lower()),
            updated_by_id=None,
            project_id=sh_project.id,
            workspace_id=workspace.id,
            created_at=issue.get("created_at") or now,
            updated_at=issue.get("updated_at") or issue.get("created_at") or now,
            external_id=cid,
            external_source=EXTERNAL_SOURCE,
            estimate_point_id=None,
            type_id=None,
            archived_at=issue.get("archived_at"),
        )
        new_issues.append(obj)
        new_sequences.append(
            IssueSequence(
                id=uuid.uuid4(),
                issue_id=new_id,
                sequence=issue["sequence_id"],
                deleted=False,
                project_id=sh_project.id,
                workspace_id=workspace.id,
                created_at=now,
                updated_at=now,
            )
        )

        for aid in issue.get("assignees") or []:
            email = (cloud_members.get(aid) or "").strip().lower()
            sh_uid = sh_members.get(email)
            if sh_uid:
                new_assignee_rows.append(
                    IssueAssignee(
                        id=uuid.uuid4(), issue_id=new_id, assignee_id=sh_uid,
                        project_id=sh_project.id, workspace_id=workspace.id,
                        created_at=now, updated_at=now,
                    )
                )
            elif aid in cloud_members:
                warnings.append(f"issue {ident}#{issue.get('sequence_id')}: assignee "
                                 f"'{cloud_members[aid]}' not a self-host member, skipped")

        for lid in issue.get("labels") or []:
            sh_label_id = sh_labels_by_ext.get(lid)
            if sh_label_id is None:
                clabel = cloud_labels.get(lid)
                if clabel:
                    sh_label_id = get_or_create_label(
                        sh_project, workspace, clabel.get("name", ""), clabel.get("color"),
                        execute, sh_labels_by_name, warnings,
                    )
                    if sh_label_id:
                        stats["labels_create"] += 1
            if sh_label_id:
                new_label_rows.append(
                    IssueLabel(
                        id=uuid.uuid4(), issue_id=new_id, label_id=sh_label_id,
                        project_id=sh_project.id, workspace_id=workspace.id,
                        created_at=now, updated_at=now,
                    )
                )

        stats["issues_create"] += 1
        pending_comments.append(cid)

    if execute and new_issues:
        with transaction.atomic():
            Issue.objects.bulk_create(new_issues)
            IssueSequence.objects.bulk_create(new_sequences)
            if new_assignee_rows:
                IssueAssignee.objects.bulk_create(new_assignee_rows)
                stats["assignees_create"] = len(new_assignee_rows)
            if new_label_rows:
                IssueLabel.objects.bulk_create(new_label_rows)

    # Comments — for every issue in scope (new or already-present), so a
    # rerun also backfills any comments missed by a prior partial run.
    _migrate_comments(
        cloud, cloud_pid, sh_project, workspace, pending_comments, cloud_to_new,
        existing_comment_ext, execute, now, stats,
    )

    # 2nd pass: parent linkage (needs all issues — new + pre-existing — to
    # already have self-host ids).
    _link_parents(sh_project, parents, cloud_to_new, existing=already, execute=execute, stats=stats)

    log(f"  summary {ident}: {stats}")
    if warnings:
        log(f"  warnings ({len(warnings)}):")
        for w in warnings[:20]:
            log(f"    - {w}")
        if len(warnings) > 20:
            log(f"    ... and {len(warnings) - 20} more")
    return stats


def _resolve_sh_issue_id(sh_project, cloud_id):
    return (
        Issue.objects.filter(project=sh_project, external_id=cloud_id, external_source=EXTERNAL_SOURCE)
        .values_list("id", flat=True)
        .first()
    )


def _migrate_comments(cloud, cloud_pid, sh_project, workspace, cloud_issue_ids, cloud_to_new,
                       existing_comment_ext, execute, now, stats):
    new_comments = []
    for cid in cloud_issue_ids:
        sh_iid = cloud_to_new.get(cid) or _resolve_sh_issue_id(sh_project, cid)
        if not sh_iid:
            continue
        for comment in cloud.paginated(f"projects/{cloud_pid}/issues/{cid}/comments/"):
            if comment["id"] in existing_comment_ext:
                stats["comments_skip"] += 1
                continue
            if not execute:
                stats["comments_create"] += 1
                continue
            html = comment.get("comment_html") or "<p></p>"
            new_comments.append(
                IssueComment(
                    id=uuid.uuid4(),
                    comment_html=html,
                    comment_json=comment.get("comment_json") or {},
                    comment_stripped=strip_tags(html) if html else "",
                    issue_id=sh_iid,
                    actor_id=None,
                    access=comment.get("access") or "INTERNAL",
                    external_source=EXTERNAL_SOURCE,
                    external_id=comment["id"],
                    project_id=sh_project.id,
                    workspace_id=workspace.id,
                    created_at=comment.get("created_at") or now,
                    updated_at=comment.get("updated_at") or comment.get("created_at") or now,
                )
            )
    if execute and new_comments:
        with transaction.atomic():
            IssueComment.objects.bulk_create(new_comments)
            stats["comments_create"] = len(new_comments)


def _link_parents(sh_project, parents, cloud_to_new, existing, execute, stats):
    for cid, cloud_parent in parents.items():
        child_id = cloud_to_new.get(cid) or _resolve_sh_issue_id(sh_project, cid)
        parent_id = cloud_to_new.get(cloud_parent) or _resolve_sh_issue_id(sh_project, cloud_parent)
        if not child_id or not parent_id:
            continue
        if not execute:
            stats["parents_linked"] += 1
            continue
        Issue.objects.filter(pk=child_id).update(parent_id=parent_id)
        stats["parents_linked"] += 1


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--execute", action="store_true", help="Perform writes. Default is dry-run.")
    parser.add_argument("--project", action="append", default=None, metavar="IDENTIFIER")
    parser.add_argument("--limit", type=int, default=0, help="Cap issues processed per project (smoke test).")
    args = parser.parse_args()

    execute = args.execute
    only = {p.upper() for p in args.project} if args.project else None

    line = "=" * 60
    log(f"{line}\nMODE: {'EXECUTE (DB writes enabled)' if execute else 'DRY-RUN (no writes)'}\n{line}")
    if execute:
        log("!! Confirm a fresh DB backup + recovery drill happened before this run !!\n")

    cloud = CloudClient(load_cloud_token())
    cloud_projects = {}
    for p in cloud.paginated("projects/"):
        ident = (p.get("identifier") or "").upper()
        if ident and ident not in EXCLUDE_IDENTIFIERS:
            cloud_projects[ident] = p

    sh_projects = selfhost_projects()

    totals = {}
    for ident in sorted(cloud_projects):
        if only and ident not in only:
            continue
        if ident not in sh_projects:
            log(f"\n!!! {ident}: no matching self-host project - SKIPPED")
            continue
        stats = migrate_project(cloud, ident, cloud_projects[ident], sh_projects[ident], execute, args.limit)
        for k, v in stats.items():
            totals[k] = totals.get(k, 0) + v

    log(f"\n{'=' * 60}\nGRAND TOTAL: {totals}")
    if not execute:
        log("DRY-RUN only. Re-run with --execute to perform DB writes.")


if __name__ == "__main__":
    main()
