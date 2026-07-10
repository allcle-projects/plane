#!/usr/bin/env python3
# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
"""
21 - ALTERNATIVE PATH: direct DB-write page migration via Django ORM.

Preserves what the public API (20_migrate_pages.py) cannot:
  * the Yjs collaborative `description_binary` (the public PageCreateSerializer
    only accepts name/description_html/access — no binary, no external_id)
  * TRUE idempotency: the `pages` table HAS external_id/external_source
    columns (apps/api/plane/db/models/page.py), even though the public API
    serializer doesn't expose them. Dedup here is by external_id = cloud
    page UUID, not by name (fixes the rename-collision weakness of the
    public-API script).
  * workspace-level ("orphan") pages with no project link — the public API
    has no workspace-level page-create endpoint at all; here we set
    `is_global=True` and skip the ProjectPage link for those.

THIS IS A SCAFFOLD. Dry-run is the hard default; --execute is required for
any write. Nothing runs automatically. Take a DB backup + do a recovery
drill BEFORE the first --execute — same caveat as 11_dbwrite_issues.py:
bulk_create() bypasses Page.save() and any related signals, so this
script's own external_id pre-filter is the only de-dup guard (though pages
are lower-risk than issues: there is no cross-row sequence invariant here).

STANDALONE BY DESIGN: does not import common.py (no bind mount for the repo
into plane-api-1 — see run command below). Has its own minimal urllib-based
cloud client (duplicated from 11_dbwrite_issues.py on purpose, kept small).

=============================================================================
KNOWN GAP — page parent/child hierarchy CANNOT be reconstructed via the
public API. The confirmed read-only PageSerializer field list is:
  id, name, description_html, access, archived_at, is_locked, owned_by,
  created_at, updated_at, project_ids
There is no "parent" field exposed anywhere in the public API response, so
even this DB-write path (which pulls its source data from the same public
cloud API — see below) has no way to know a cloud page's parent. Pages are
imported FLAT (parent_id always None). If nesting must be preserved, that
requires direct read access to the CLOUD database, which is out of scope.

=============================================================================
CONFIRMED SCHEMA (apps/api/plane/db/models/page.py, 2026-07-10)
=============================================================================
  pages: id(uuid), name(text NOT NULL), description_json(jsonb NOT NULL),
    description_html(text NOT NULL), description_stripped(text null),
    description_binary(bytea null), access(smallint NOT NULL),
    owned_by_id(uuid NOT NULL — !! no default, must always resolve to a
    real self-host user), created_by_id(uuid null), workspace_id(uuid NOT
    NULL), color(varchar NOT NULL, default ""), is_locked(bool NOT NULL),
    parent_id(uuid null — see gap above, always None here),
    view_props(jsonb NOT NULL, model default {"full_width": False}),
    logo_props(jsonb NOT NULL, model default {}), is_global(bool NOT NULL),
    sort_order(float NOT NULL), external_id/external_source(varchar null),
    team_id(uuid null — mote's Teamspaces field, no cloud equivalent, left
    None).
  project_pages (ProjectPage, plain BaseModel — NOT ProjectBaseModel/
    WorkspaceBaseModel, so no auto workspace-from-project save() logic even
    normally): id, page_id(NOT NULL), project_id(NOT NULL), workspace_id
    (NOT NULL), created_by_id(null). Unique constraint on (project, page)
    where deleted_at is null — bulk_create's external_id pre-filter on Page
    keeps this from ever being hit twice for the same page+project pair in
    practice, but nothing in the DB stops a bug from doing so beyond that.
  created_at/updated_at are auto_now_add=True/auto_now=True (TimeAuditModel,
    apps/api/plane/db/mixins.py) → bulk_create() does NOT call pre_save(),
    so these do NOT auto-populate; they must be set explicitly on every
    instance we build (same gotcha as the issues script).

Confirmed imports:
  from plane.db.models import Page, ProjectPage, Project, Workspace, User,
      WorkspaceMember
  from plane.utils.html_processor import strip_tags   # same helper
                                                        # Page.save() uses

=============================================================================
RUN COMMAND (verified 2026-07-10 — see 11_dbwrite_issues.py header for the
full explanation of why: no bind mount, python at /usr/local/bin/python,
workdir /code, DJANGO_SETTINGS_MODULE defaults to "plane.settings.production")
=============================================================================

  scp scripts/plane-migration/21_dbwrite_pages.py server3:/tmp/
  ssh server3 'docker cp /tmp/21_dbwrite_pages.py plane-api-1:/code/21_dbwrite_pages.py'

  # dry-run (also requires --owner-email — see below):
  ssh server3 'docker exec -e PLANE_API_TOKEN="$(grep -m1 PLANE_API_TOKEN /srv/shared/app-src/task-bot/.env | cut -d= -f2-)" plane-api-1 python /code/21_dbwrite_pages.py --owner-email you@motemote.com'

  # execute for real:
  ssh server3 'docker exec -e PLANE_API_TOKEN="$(grep -m1 PLANE_API_TOKEN /srv/shared/app-src/task-bot/.env | cut -d= -f2-)" plane-api-1 python /code/21_dbwrite_pages.py --owner-email you@motemote.com --execute'

--owner-email is REQUIRED: pages.owned_by_id is NOT NULL. Each cloud page's
original owner is mapped to a self-host user by email when possible; when
that mapping fails (owner not a self-host member), the page falls back to
--owner-email so the row can still be created (do not skip the whole page
over an unmappable owner — flagged as a warning either way).

Flags: --execute (default dry-run), --owner-email (required), --project
IDENTIFIER (repeatable), --limit N (cap pages per project, smoke test).
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

from plane.db.models import Page, Project, ProjectPage, User, WorkspaceMember  # noqa: E402
from plane.utils.html_processor import strip_tags  # noqa: E402

WORKSPACE_SLUG = "motemote"
EXTERNAL_SOURCE = "plane-cloud"
EXCLUDE_IDENTIFIERS = {"PLANE", "IDEA", "MOTEM", "TEST"}

CLOUD_BASE = "https://api.plane.so/api/v1"
USER_AGENT = "mote-migration-dbwrite/1.0 (+https://plane.motemote.co.kr)"
TASKBOT_ENV = "/srv/shared/app-src/task-bot/.env"

DEFAULT_VIEW_PROPS = {"full_width": False}


# --------------------------------------------------------------------------- #
# Minimal standalone cloud client (duplicated from 11_dbwrite_issues.py on
# purpose — this file must work if copied into the container alone).
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
# Self-host reference data
# --------------------------------------------------------------------------- #
def selfhost_projects():
    out = {}
    for p in Project.objects.filter(workspace__slug=WORKSPACE_SLUG).select_related("workspace"):
        if p.identifier:
            out[p.identifier.upper()] = p
    return out


def member_email_map(workspace):
    out = {}
    for wm in WorkspaceMember.objects.filter(workspace=workspace).select_related("member"):
        email = (wm.member.email or "").strip().lower()
        if email:
            out[email] = wm.member_id
    return out


def resolve_fallback_owner(email):
    try:
        return User.objects.get(email=email).id
    except User.DoesNotExist:
        raise SystemExit(f"ERROR: --owner-email '{email}' does not match any self-host user.")


# --------------------------------------------------------------------------- #
# Migration
# --------------------------------------------------------------------------- #
def cloud_page_binary(cloud, cloud_pid, page_id):
    """description_binary is only present on the page DETAIL response
    (confirmed: cloud page DETAIL returns description_html +
    description_binary (base64, Yjs) + description_json); list responses
    omit it."""
    detail = cloud.get(f"projects/{cloud_pid}/pages/{page_id}/")
    return detail


def build_page(cloud_page, cloud_pid, cloud, sh_project, workspace, member_map,
                fallback_owner_id, fetch_detail, now, warnings):
    """fetch_detail: call the project-scoped page DETAIL endpoint to get
    description_binary (only available there, and only project-scoped — see
    module docstring). Callers pass False for dry-run (skip the extra HTTP
    round trip) and for orphan/workspace-level pages (no project context to
    call the detail endpoint with)."""
    detail = cloud_page_binary(cloud, cloud_pid, cloud_page["id"]) if fetch_detail else cloud_page
    html = detail.get("description_html") or "<p></p>"
    binary = detail.get("description_binary")
    owner_cloud = cloud_page.get("owned_by")
    owner_id = member_map.get((owner_cloud or "").strip().lower()) if isinstance(owner_cloud, str) else None
    if not owner_id:
        # owned_by may be a user id (cloud) rather than email; either way we
        # cannot resolve it on self-host, so fall back and warn.
        owner_id = fallback_owner_id
        warnings.append(f"page '{cloud_page.get('name', '')[:40]}': owner not mappable, "
                         f"used --owner-email fallback")

    return Page(
        id=uuid.uuid4(),
        name=cloud_page.get("name") or "",
        description_json=detail.get("description") or detail.get("description_json") or {},
        description_html=html,
        description_stripped=strip_tags(html) if html else None,
        description_binary=base64.b64decode(binary) if binary else None,
        access=cloud_page.get("access") or 0,
        owned_by_id=owner_id,
        created_by_id=owner_id,
        workspace_id=workspace.id,
        color="",
        is_locked=bool(cloud_page.get("is_locked", False)),
        parent_id=None,  # not reconstructable via the public API — see docstring
        view_props=DEFAULT_VIEW_PROPS,
        logo_props={},
        is_global=not bool(cloud_page.get("project_ids")),
        sort_order=Page.DEFAULT_SORT_ORDER,
        external_id=cloud_page["id"],
        external_source=EXTERNAL_SOURCE,
        team_id=None,
        created_at=cloud_page.get("created_at") or now,
        updated_at=cloud_page.get("updated_at") or cloud_page.get("created_at") or now,
    )


def migrate_project_pages(cloud, ident, cloud_project, sh_project, member_map,
                           fallback_owner_id, execute, limit, now):
    workspace = sh_project.workspace
    stats = {"create": 0, "skip": 0}
    warnings = []

    already = set(
        Page.objects.filter(project_pages__project=sh_project, external_source=EXTERNAL_SOURCE)
        .exclude(external_id__isnull=True)
        .values_list("external_id", flat=True)
    )

    new_pages = []
    new_links = []
    count = 0
    for cloud_page in cloud.paginated(f"projects/{cloud_project['id']}/pages/"):
        if limit and count >= limit:
            break
        count += 1
        if cloud_page["id"] in already:
            stats["skip"] += 1
            continue
        if not execute:
            stats["create"] += 1
            continue
        page = build_page(
            cloud_page, cloud_project["id"], cloud, sh_project, workspace,
            member_map, fallback_owner_id, fetch_detail=True, now=now, warnings=warnings,
        )
        new_pages.append(page)
        new_links.append(
            ProjectPage(
                id=uuid.uuid4(),
                project_id=sh_project.id,
                page_id=page.id,
                workspace_id=workspace.id,
                created_by_id=page.owned_by_id,
                created_at=now,
                updated_at=now,
            )
        )
        stats["create"] += 1

    if execute and new_pages:
        with transaction.atomic():
            Page.objects.bulk_create(new_pages)
            ProjectPage.objects.bulk_create(new_links)

    log(f"  {ident} pages: {stats}")
    if warnings:
        for w in warnings[:10]:
            log(f"    - {w}")
        if len(warnings) > 10:
            log(f"    ... and {len(warnings) - 10} more")
    return stats


def migrate_orphan_pages(cloud, workspace, sh_projects_by_cloud_id, member_map,
                          fallback_owner_id, execute, limit, now):
    """Workspace-level cloud pages with no project link — the public API
    can't create these at all (no workspace-level page-create endpoint);
    the ORM can, via is_global=True and no ProjectPage row."""
    stats = {"create": 0, "skip": 0}
    warnings = []
    already = set(
        Page.objects.filter(workspace=workspace, is_global=True, external_source=EXTERNAL_SOURCE)
        .exclude(external_id__isnull=True)
        .values_list("external_id", flat=True)
    )

    new_pages = []
    count = 0
    for cloud_page in cloud.paginated("pages/"):
        if cloud_page.get("project_ids"):
            continue  # handled by migrate_project_pages
        if limit and count >= limit:
            break
        count += 1
        if cloud_page["id"] in already:
            stats["skip"] += 1
            continue
        if not execute:
            stats["create"] += 1
            continue
        page = build_page(
            cloud_page, None, cloud, None, workspace, member_map,
            fallback_owner_id, fetch_detail=False, now=now, warnings=warnings,
        )
        # orphan pages have no project, so we cannot call the detail
        # endpoint (which is project-scoped); binary fidelity is best-effort
        # from the list payload only for these.
        new_pages.append(page)
        stats["create"] += 1

    if execute and new_pages:
        with transaction.atomic():
            Page.objects.bulk_create(new_pages)

    log(f"  workspace orphan pages: {stats}")
    if warnings:
        for w in warnings[:10]:
            log(f"    - {w}")
    return stats


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--execute", action="store_true", help="Perform writes. Default is dry-run.")
    parser.add_argument("--owner-email", required=True,
                         help="Self-host user email used when a cloud page's owner can't be mapped "
                              "(pages.owned_by_id is NOT NULL).")
    parser.add_argument("--project", action="append", default=None, metavar="IDENTIFIER")
    parser.add_argument("--limit", type=int, default=0, help="Cap pages processed per project (smoke test).")
    args = parser.parse_args()

    execute = args.execute
    only = {p.upper() for p in args.project} if args.project else None
    now = timezone.now()

    line = "=" * 60
    log(f"{line}\nMODE: {'EXECUTE (DB writes enabled)' if execute else 'DRY-RUN (no writes)'}\n{line}")
    if execute:
        log("!! Confirm a fresh DB backup + recovery drill happened before this run !!\n")

    fallback_owner_id = resolve_fallback_owner(args.owner_email)

    cloud = CloudClient(load_cloud_token())
    cloud_projects = {}
    for p in cloud.paginated("projects/"):
        ident = (p.get("identifier") or "").upper()
        if ident and ident not in EXCLUDE_IDENTIFIERS:
            cloud_projects[ident] = p

    sh_projects = selfhost_projects()

    totals = {"create": 0, "skip": 0}
    for ident in sorted(cloud_projects):
        if only and ident not in only:
            continue
        if ident not in sh_projects:
            log(f"!!! {ident}: no matching self-host project - SKIPPED")
            continue
        sh_project = sh_projects[ident]
        member_map = member_email_map(sh_project.workspace)
        stats = migrate_project_pages(
            cloud, ident, cloud_projects[ident], sh_project, member_map,
            fallback_owner_id, execute, args.limit, now,
        )
        for k in totals:
            totals[k] += stats[k]

    if not only:
        # Orphan pass only makes sense for a full run.
        any_project = next(iter(sh_projects.values()), None)
        if any_project:
            member_map = member_email_map(any_project.workspace)
            orphan_stats = migrate_orphan_pages(
                cloud, any_project.workspace, None, member_map,
                fallback_owner_id, execute, args.limit, now,
            )
            for k in totals:
                totals[k] += orphan_stats[k]

    log(f"\n{'=' * 60}\nGRAND TOTAL pages: {totals}")
    if not execute:
        log("DRY-RUN only. Re-run with --execute to perform DB writes.")


if __name__ == "__main__":
    main()
