#!/usr/bin/env python3
# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
"""
11 - ALTERNATIVE PATH: direct DB-write issue migration via Django ORM.

Preserves what the public API (10_migrate_issues.py) cannot:
  * exact cloud issue sequence_id numbers, WHERE POSSIBLE (see "MERGE
    ALGORITHM" below — this is now project-dependent, not universal)
  * author/timestamp fidelity is the same either way; this path exists for
    sequence_id preservation (and, for pages, the Yjs binary — see
    21_dbwrite_pages.py)

THIS IS A SCAFFOLD. Dry-run is the hard default; --execute is required for
any write. Nothing runs automatically. Read docs/mote-design/11-cloud-to-
selfhost-migration-plan.md §7/§8 and take a DB backup + do a recovery drill
BEFORE the first --execute, because `issues` has NO db-level unique
constraint on (project_id, sequence_id) — only Issue.save()'s advisory lock
enforces it, and bulk_create() bypasses save() entirely, so there is no
safety net against a bad run creating duplicate sequence numbers.

STANDALONE BY DESIGN: this file does not import common.py (the api
container has no bind mount for the local repo — see run command below —
so only this single file is guaranteed to be present). It has its own
minimal urllib-based cloud client.

=============================================================================
REVISION 2026-07-11 — the external_id-only dedup premise was WRONG and has
been replaced. A dry-run against real data showed it would create 902
duplicate issues. Root causes, confirmed against cloud + self-host DB:
=============================================================================
1. NO existing self-host issue has external_id set, on any project (the
   7/2 migration never set it). An external_id-only pre-filter therefore
   matches nothing — every cloud issue looks "new", including the ~700
   issues already migrated on 7/2. Fixed by adding a second recognition
   path: (sequence_id, name) equality against every existing self-host
   issue identifies the 7/2-migrated ones without needing external_id.
2. Post-7/2, cloud and self-host diverged independently and in some
   projects BOTH sides created new issues, re-using the same sequence
   numbers for genuinely different content:
     - ALLCL: aligned (cloud seq N == self-host seq N, same name) through
       seq 178. Self-host 179-182 are its OWN new issues (unrelated to
       cloud). Cloud 179-197 are different drift issues. Same numbers,
       different content -> a collision if we tried to preserve cloud's
       numbers.
     - TEAMDEV: self-host has 3 own new issues at seq 386-388; cloud's
       tail differs from those -> same collision shape.
     - GROWTH, STORE, MOTEERP: self-host has ZERO post-cutover issues of
       its own (stopped exactly where cloud diverged) -> the cloud drift
       sequence numbers are genuinely free on self-host -> safe to
       preserve verbatim.
   See "MERGE ALGORITHM" below for how this is now handled per project.

=============================================================================
MERGE ALGORITHM (per in-scope project, otro-approved 2026-07-11)
=============================================================================
Preload (read-only ORM queries against the self-host project):
  by_ext        = {external_id: Issue} for rows with external_source=
                  'plane-cloud' (re-run idempotency for issues WE created
                  in a prior run of this script)
  by_seq_name   = {(sequence_id, name): Issue} for every existing issue in
                  the project (identifies the 7/2-aligned rows without
                  needing external_id)
  occupied_seqs = set of every existing sequence_id in the project
  sh_max_seq    = max(occupied_seqs), or 0

Classify each cloud issue C, in ascending cloud sequence_id order:
  1. C.id in by_ext                       -> SKIP_EXT (we already imported
                                              this drift issue in a prior
                                              run; still needed for parent-
                                              linkage resolution, but its
                                              comments are not re-synced —
                                              see "comments scope" below)
  2. (C.sequence_id, C.name) in by_seq_name -> SKIP_ALIGNED (this IS the
                                              7/2-migrated issue; never
                                              touched, no comments)
  3. otherwise                            -> DRIFT (needs importing this
                                              run)

Decide the project's mode from the DRIFT set only:
  append_mode = any(d.sequence_id in occupied_seqs for d in drift)
  # True exactly when a drift issue's own cloud sequence number is already
  # taken by something on self-host (aligned or not) -> whole-project
  # switch, not per-issue, because interleaving preserved-and-appended
  # numbers within one project would be confusing and isn't what otro
  # approved. Confirmed: True for ALLCL/TEAMDEV, False for GROWTH/STORE/
  # MOTEERP (and trivially False for MOTEDIGITA, which has no delta).

Assign each DRIFT issue a target sequence_id, in ascending cloud-seq order:
  preserve mode (append_mode is False): target = C.sequence_id (verbatim —
    every drift seq in this project is confirmed free)
  append mode (append_mode is True): target = counter, counter starting at
    sh_max_seq + 1 and incremented per drift issue. Cloud's own numbers are
    NOT preserved for these two projects — physically impossible without
    evicting an unrelated self-host-native issue that already owns that
    number.

Comments/links/parent-linkage scope: only run for the DRIFT issues actually
bulk_created THIS run (i.e. NOT for SKIP_ALIGNED, and NOT for SKIP_EXT
either — those were already synced when they were first created in an
earlier run). Parent resolution still needs to reach into SKIP_EXT and
SKIP_ALIGNED issues, though: a drift issue's cloud `parent` may point at an
already-aligned or already-imported issue, so `resolve_sh_issue_id()`
checks, in order: this run's freshly created issues, then by_ext, then
by_seq_name (via a cloud_id -> (seq, name) map built from the full cloud
issue list, not just drift).

=============================================================================
MECHANISM — why bulk_create() requires all this manual bookkeeping
(confirmed by reading the fork source on server3, 2026-07-10)
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
      Issue.save()'s transaction), using the ASSIGNED target sequence, not
      necessarily cloud's own sequence_id
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
  -> IssueVersion is unused on this deployment. Skipping its sync signal by
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
  bulk_create bypasses. See "REVISION 2026-07-11" and "MERGE ALGORITHM"
  above for how real per-project collisions (ALLCL, TEAMDEV) are now
  handled — this script's own classification (by_ext + by_seq_name) plus
  the whole-project append-mode switch is the guard, NOT a bare external_id
  pre-filter (that premise was disproven).

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

  # 3. execute for real (same command + --execute) — DO NOT RUN until the
  #    dry-run output (mode/skip_aligned/skip_ext/create counts per project)
  #    has been reviewed:
  ssh server3 'docker exec -e PLANE_API_TOKEN="$(grep -m1 PLANE_API_TOKEN /srv/shared/app-src/task-bot/.env | cut -d= -f2-)" plane-api-1 python /code/11_dbwrite_issues.py --execute'

Flags: --execute (default dry-run), --project IDENTIFIER (repeatable),
--limit N (cap issues per project, for a smoke test).
"""

import argparse
import base64
import json
import os
import sys
import time
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
        # Baseline throttle + exponential backoff: cloud SaaS enforces a rate
        # limit (429 RATE_LIMIT_EXCEEDED) and the per-issue comment/link fan-out
        # trips it easily. Honor Retry-After when present.
        for attempt in range(7):
            time.sleep(0.6)
            try:
                with urllib.request.urlopen(req, timeout=60) as resp:
                    return resp.status, json.loads(resp.read().decode("utf-8") or "{}")
            except urllib.error.HTTPError as exc:
                if exc.code == 429 or exc.code >= 500:
                    retry_after = (exc.headers.get("Retry-After") if exc.headers else None) or ""
                    delay = float(retry_after) if retry_after.isdigit() else min(60.0, 2 ** attempt)
                    time.sleep(delay)
                    continue
                body = exc.read().decode("utf-8", errors="replace")
                return exc.code, _maybe_json(body)
            except urllib.error.URLError:
                time.sleep(min(60.0, 2 ** attempt))
                continue
        raise RuntimeError(f"cloud GET {path} failed after 7 retries (rate limit/network)")

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
# Classification (the fixed dedup/merge algorithm — see module docstring)
# --------------------------------------------------------------------------- #
def classify_issues(cloud_issues, sh_project):
    """Return (by_ext, by_seq_name, occupied_seqs, sh_max_seq, skip_ext,
    skip_aligned, drift, cloud_id_to_seqname).

    cloud_issues must already be sorted ascending by sequence_id.
    """
    by_ext = {
        i.external_id: i
        for i in Issue.objects.filter(project=sh_project, external_source=EXTERNAL_SOURCE).exclude(
            external_id__isnull=True
        )
    }
    by_seq_name = {
        (i.sequence_id, i.name): i for i in Issue.objects.filter(project=sh_project).only("id", "sequence_id", "name")
    }
    occupied_seqs = {i.sequence_id for i in Issue.objects.filter(project=sh_project).only("sequence_id")}
    sh_max_seq = max(occupied_seqs) if occupied_seqs else 0

    skip_ext, skip_aligned, drift = [], [], []
    cloud_id_to_seqname = {}
    for issue in cloud_issues:
        seq = issue.get("sequence_id")
        name = issue.get("name") or ""
        cloud_id_to_seqname[issue["id"]] = (seq, name)
        if issue["id"] in by_ext:
            skip_ext.append(issue)
        elif (seq, name) in by_seq_name:
            skip_aligned.append(issue)
        else:
            drift.append(issue)

    return by_ext, by_seq_name, occupied_seqs, sh_max_seq, skip_ext, skip_aligned, drift, cloud_id_to_seqname


def assign_targets(drift, occupied_seqs, sh_max_seq):
    """Return (append_mode, {cloud_issue_id: target_sequence_id})."""
    append_mode = any(d.get("sequence_id") in occupied_seqs for d in drift)
    targets = {}
    counter = sh_max_seq + 1
    for d in drift:  # already ascending cloud-seq order
        if append_mode:
            targets[d["id"]] = counter
            counter += 1
        else:
            targets[d["id"]] = d["sequence_id"]
    return append_mode, targets


def make_resolver(cloud_to_new, by_ext, by_seq_name, cloud_id_to_seqname):
    """cloud issue id -> self-host issue id, across all three buckets
    (freshly created this run / previously-imported drift / 7/2-aligned)."""

    def resolve(cloud_id):
        if cloud_id in cloud_to_new:
            return cloud_to_new[cloud_id]
        existing = by_ext.get(cloud_id)
        if existing:
            return existing.id
        seqname = cloud_id_to_seqname.get(cloud_id)
        if seqname and seqname in by_seq_name:
            return by_seq_name[seqname].id
        return None

    return resolve


# --------------------------------------------------------------------------- #
# Migration
# --------------------------------------------------------------------------- #
def migrate_project(cloud, ident, cloud_project, sh_project, execute, limit):
    log(f"\n=== {ident} (cloud {cloud_project['id']} -> self-host {sh_project.id}) ===")
    workspace = sh_project.workspace
    stats = {
        "mode": None, "skip_aligned": 0, "skip_ext": 0,
        "issues_create": 0, "target_seq_range": None,
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

    cloud_issues = sorted(cloud.paginated(f"projects/{cloud_pid}/issues/"), key=lambda i: i.get("sequence_id") or 0)
    if limit:
        cloud_issues = cloud_issues[:limit]

    (by_ext, by_seq_name, occupied_seqs, sh_max_seq,
     skip_ext, skip_aligned, drift, cloud_id_to_seqname) = classify_issues(cloud_issues, sh_project)

    stats["skip_ext"] = len(skip_ext)
    stats["skip_aligned"] = len(skip_aligned)

    append_mode, targets = assign_targets(drift, occupied_seqs, sh_max_seq)
    stats["mode"] = "append" if append_mode else "preserve"
    if targets:
        stats["target_seq_range"] = f"{min(targets.values())}-{max(targets.values())}"

    log(f"  classify: {len(cloud_issues)} cloud issues -> "
        f"skip_ext={len(skip_ext)} skip_aligned={len(skip_aligned)} drift={len(drift)}")
    log(f"  mode={stats['mode']} sh_max_seq={sh_max_seq} "
        f"target_seq_range={stats['target_seq_range']}")

    default_state_id = None
    default_state = State.objects.filter(project=sh_project, default=True).first()
    if default_state:
        default_state_id = default_state.id
    elif sh_states:
        default_state_id = next(iter(sh_states.values()))

    new_issues = []          # Issue instances to bulk_create (drift only)
    new_sequences = []       # IssueSequence instances (parallel to new_issues)
    new_assignee_rows = []   # IssueAssignee instances
    new_label_rows = []      # IssueLabel instances
    parents = {}             # cloud_issue_id -> cloud_parent_id (drift only —
                              # see module docstring "comments scope")
    cloud_to_new = {}        # cloud_issue_id -> new Issue.id (this run, drift only)

    now = timezone.now()
    for issue in drift:
        cid = issue["id"]
        if issue.get("parent"):
            parents[cid] = issue["parent"]

        cloud_state_name = cloud_states.get(issue.get("state"), "").strip().lower()
        state_id = sh_states.get(cloud_state_name, default_state_id)

        new_id = uuid.uuid4()
        cloud_to_new[cid] = new_id
        html = issue.get("description_html") or "<p></p>"
        binary = issue.get("description_binary")
        target_seq = targets[cid]

        if not execute:
            stats["issues_create"] += 1
            if cloud_state_name and cloud_state_name not in sh_states:
                warnings.append(f"issue {ident}#{issue.get('sequence_id')}->target#{target_seq}: state "
                                 f"'{cloud_state_name}' not found on self-host, "
                                 "would fall back to project default")
            continue

        obj = Issue(
            id=new_id,
            name=issue.get("name") or "(untitled)",
            description_json=issue.get("description") or issue.get("description_json") or {},
            description_html=html,
            description_stripped=strip_tags(html) if html else None,
            description_binary=base64.b64decode(binary) if binary else None,
            priority=issue.get("priority") or "none",
            sequence_id=target_seq,
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
                sequence=target_seq,
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
                warnings.append(f"issue {ident}#{issue.get('sequence_id')}->target#{target_seq}: assignee "
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

    if execute and new_issues:
        with transaction.atomic():
            Issue.objects.bulk_create(new_issues)
            IssueSequence.objects.bulk_create(new_sequences)
            if new_assignee_rows:
                IssueAssignee.objects.bulk_create(new_assignee_rows)
                stats["assignees_create"] = len(new_assignee_rows)
            if new_label_rows:
                IssueLabel.objects.bulk_create(new_label_rows)

    # Comments/parent-linkage: ONLY for issues created THIS run (drift, not
    # skip_ext/skip_aligned — see module docstring "comments scope").
    resolve = make_resolver(cloud_to_new, by_ext, by_seq_name, cloud_id_to_seqname)
    _migrate_comments(cloud, cloud_pid, sh_project, workspace, drift, cloud_to_new, execute, now, stats)
    _link_parents(parents, resolve, execute, stats)

    log(f"  summary {ident}: {stats}")
    if warnings:
        log(f"  warnings ({len(warnings)}):")
        for w in warnings[:20]:
            log(f"    - {w}")
        if len(warnings) > 20:
            log(f"    ... and {len(warnings) - 20} more")
    return stats


def _migrate_comments(cloud, cloud_pid, sh_project, workspace, drift, cloud_to_new, execute, now, stats):
    """Sync comments only for issues created THIS run (drift)."""
    existing_comment_ext = set(
        IssueComment.objects.filter(project=sh_project, external_source=EXTERNAL_SOURCE)
        .exclude(external_id__isnull=True)
        .values_list("external_id", flat=True)
    )
    new_comments = []
    for issue in drift:
        cid = issue["id"]
        sh_iid = cloud_to_new.get(cid)
        if not sh_iid:
            continue  # dry-run: no id was persisted, nothing to attach to
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


def _link_parents(parents, resolve, execute, stats):
    """Parent linkage only for drift issues (the `parents` dict is only
    populated from the drift loop in migrate_project). The parent itself
    may be a drift/skip_ext/skip_aligned issue — resolve() covers all
    three."""
    for cid, cloud_parent in parents.items():
        child_id = resolve(cid)
        parent_id = resolve(cloud_parent)
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
            if isinstance(v, (int, float)):
                totals[k] = totals.get(k, 0) + v

    log(f"\n{'=' * 60}\nGRAND TOTAL (numeric fields only; see per-project lines above for mode/range): {totals}")
    if not execute:
        log("DRY-RUN only. Re-run with --execute to perform DB writes.")


if __name__ == "__main__":
    main()
