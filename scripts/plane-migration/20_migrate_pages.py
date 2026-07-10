#!/usr/bin/env python3
# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
"""
20 - Migrate pages cloud -> self-host. DRY-RUN by default.

CONTRACT REALITY (confirmed in apps/api/.../serializers/page.py):
  PageCreateSerializer accepts ONLY: name, description_html, access.
    * NO external_id  -> cannot dedup by cloud UUID; we dedup by NAME per project
      (imperfect: pages renamed on cloud or duplicate-named pages can double up).
    * NO description_binary -> the Yjs collaborative binary is dropped. Only the
      rendered description_html is carried over (adequate for text, loses
      real-time-edit fidelity / embeds that live only in the binary).
    * create is PROJECT-scoped only: POST /projects/<id>/pages/. There is NO
      workspace-level page create in the public API, so cloud pages not linked
      to any project cannot be migrated here (reported as SKIPPED-orphan).

Because there is no external_id dedup, this script is idempotent ONLY by name.
Re-running is safe for same-named pages but will not detect renames.

Usage:
    python3 20_migrate_pages.py               # dry-run
    python3 20_migrate_pages.py --execute     # perform writes
"""

import common as c

EXTERNAL_SOURCE = "plane-cloud"


def selfhost_page_names(sh, sh_pid):
    """Lowercased set of existing page names in a self-host project."""
    names = set()
    for page in sh.get_paginated(f"projects/{sh_pid}/pages/"):
        name = (page.get("name") or "").strip().lower()
        if name:
            names.add(name)
    return names


def cloud_page_html(cloud, pid, page_id, listed):
    """Prefer description_html from list; fall back to page detail."""
    if listed.get("description_html"):
        return listed["description_html"]
    status, detail = cloud.get_raw(f"projects/{pid}/pages/{page_id}/")
    if status == 200 and isinstance(detail, dict):
        return detail.get("description_html") or ""
    return ""


def migrate_project_pages(cloud, sh, ident, cloud_proj, sh_proj, execute, limit):
    pid = cloud_proj["id"]
    sh_pid = sh_proj["id"]
    existing = selfhost_page_names(sh, sh_pid)
    stats = {"create": 0, "skip": 0, "fail": 0}

    count = 0
    for page in cloud.get_paginated(f"projects/{pid}/pages/"):
        if limit and count >= limit:
            break
        count += 1
        name = (page.get("name") or "").strip()
        if not name:
            continue
        if name.lower() in existing:
            stats["skip"] += 1
            continue
        html = cloud_page_html(cloud, pid, page["id"], page)
        payload = {
            "name": name,
            "description_html": html or "<p></p>",
            "access": page.get("access", 0),
        }
        if not execute:
            stats["create"] += 1
            c.log(f"    WOULD create page [{ident}] '{name[:60]}'")
            continue
        status, body = sh.post(f"projects/{sh_pid}/pages/", payload)
        if status in (200, 201):
            stats["create"] += 1
            existing.add(name.lower())
        else:
            stats["fail"] += 1
            c.log(f"    page create failed ({status}): {body}")

    c.log(f"  {ident} pages: {stats}")
    return stats


def report_orphan_pages(cloud):
    """Workspace pages with no project linkage cannot be migrated via API."""
    orphans = 0
    for page in cloud.get_paginated("pages/"):
        if not page.get("project_ids"):
            orphans += 1
    if orphans:
        c.log(f"\nNOTE: {orphans} workspace-level cloud page(s) have no project "
              "linkage and CANNOT be created via the public API (no workspace "
              "page-create endpoint). Migrate these by hand if needed.")


def main():
    parser = c.base_parser(__doc__)
    args = parser.parse_args()
    execute = c.resolve_execute(args)
    only = c.project_filter(args)
    c.mode_banner(execute)

    cloud = c.cloud_client()
    sh = c.selfhost_client(require_token=execute)
    cloud_projs = c.cloud_projects(cloud)
    sh_projs = c.selfhost_projects(sh)

    totals = {"create": 0, "skip": 0, "fail": 0}
    for ident in sorted(cloud_projs):
        if only and ident not in only:
            continue
        if ident not in sh_projs:
            c.log(f"!!! {ident}: no matching self-host project - SKIPPED")
            continue
        stats = migrate_project_pages(
            cloud, sh, ident, cloud_projs[ident], sh_projs[ident], execute, args.limit
        )
        for k in totals:
            totals[k] += stats[k]

    report_orphan_pages(cloud)
    c.log(f"\n{'=' * 60}\nGRAND TOTAL pages: {totals}")
    if not execute:
        c.log("DRY-RUN only. Re-run with --execute to perform writes.")


if __name__ == "__main__":
    main()
