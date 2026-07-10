#!/usr/bin/env python3
# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
"""
10 - Migrate issues (+ comments, links, parent linkage) cloud -> self-host.

Idempotent: every issue/comment is keyed by external_id = cloud UUID and
skipped if already present. DRY-RUN by default; pass --execute to POST.

Per in-scope project:
  1. match self-host project by identifier (skip + warn if missing)
  2. build maps: state name->id, label name->id, member email->id
  3. ensure cloud labels exist on self-host (create missing, external_id-keyed)
  4. upsert each cloud issue (skip if external_id already imported)
  5. pull + post comments (external_id-keyed) and links (url-dedup) per issue
  6. SECOND PASS: set parent/sub-issue linkage once all issues exist

Field mapping into the self-host IssueSerializer (confirmed writable):
  name, description_html, priority (same enum), state (self-host state id by
  NAME), assignees (self-host user ids by email), labels (self-host label ids),
  start_date, target_date, external_id, external_source, created_at.
Not preserved: sequence_id (server overwrites), see 00_preflight limitations.

Usage:
    python3 10_migrate_issues.py                 # dry-run, all in-scope
    python3 10_migrate_issues.py --project STORE # dry-run, one project
    python3 10_migrate_issues.py --execute       # perform writes
"""

import common as c

EXTERNAL_SOURCE = "plane-cloud"


def cloud_ref_maps(cloud, pid):
    """Return cloud lookups: state id->name, label id->dict, member id->email."""
    states = {s["id"]: s.get("name", "") for s in cloud.get_paginated(f"projects/{pid}/states/")}
    labels = {l["id"]: l for l in cloud.get_paginated(f"projects/{pid}/labels/")}
    try:
        members = {m["id"]: (m.get("email") or "") for m in cloud.get_paginated("members/")}
    except c.PlaneError:
        members = {}  # cloud token not workspace-admin: authorship degrades
    return states, labels, members


def ensure_labels(sh, sh_pid, cloud_labels, execute, stats):
    """Ensure each cloud label exists on self-host. Return {cloud_label_id: sh_label_id}."""
    sh_by_name, sh_by_ext = c.label_maps(sh, sh_pid)
    mapping = {}
    for cid, label in cloud_labels.items():
        name = (label.get("name") or "").strip()
        key = name.lower()
        if cid in sh_by_ext:
            mapping[cid] = sh_by_ext[cid]
            continue
        if key in sh_by_name:
            mapping[cid] = sh_by_name[key]
            continue
        # Needs creating.
        if not execute:
            stats["labels_would_create"] += 1
            continue
        status, body = sh.post(
            f"projects/{sh_pid}/labels/",
            {
                "name": name,
                "color": label.get("color") or "#000000",
                "external_id": cid,
                "external_source": EXTERNAL_SOURCE,
            },
        )
        if status in (200, 201):
            mapping[cid] = body["id"]
            stats["labels_created"] += 1
        elif status == 409:
            mapping[cid] = body.get("id")
        else:
            c.log(f"    label create failed ({status}): {name} -> {body}")
    return mapping


def build_issue_payload(issue, cloud_states, sh_state_map, label_map, member_map, cloud_members):
    payload = {
        "name": issue.get("name") or "(untitled)",
        "external_id": issue["id"],
        "external_source": EXTERNAL_SOURCE,
    }
    if issue.get("description_html"):
        payload["description_html"] = issue["description_html"]
    if issue.get("priority"):
        payload["priority"] = issue["priority"]
    if issue.get("start_date"):
        payload["start_date"] = issue["start_date"]
    if issue.get("target_date"):
        payload["target_date"] = issue["target_date"]
    if issue.get("created_at"):
        payload["created_at"] = issue["created_at"]

    # State: map by name.
    cloud_state_name = cloud_states.get(issue.get("state"), "").strip().lower()
    if cloud_state_name and cloud_state_name in sh_state_map:
        payload["state"] = sh_state_map[cloud_state_name]

    # Labels: map cloud label ids -> self-host label ids.
    sh_labels = [label_map[lid] for lid in (issue.get("labels") or []) if lid in label_map]
    if sh_labels:
        payload["labels"] = sh_labels

    # Assignees: cloud user id -> email -> self-host user id.
    sh_assignees = []
    for aid in issue.get("assignees") or []:
        email = (cloud_members.get(aid) or "").strip().lower()
        if email and email in member_map:
            sh_assignees.append(member_map[email])
    if sh_assignees:
        payload["assignees"] = sh_assignees
    return payload


def migrate_project(cloud, sh, ident, cloud_proj, sh_proj, execute, limit):
    sh_pid = sh_proj["id"]
    pid = cloud_proj["id"]
    c.log(f"\n=== {ident} (cloud {pid} -> self-host {sh_pid}) ===")

    stats = {
        "issues_create": 0, "issues_skip": 0, "issues_fail": 0,
        "comments_create": 0, "comments_skip": 0,
        "links_create": 0, "links_skip": 0,
        "labels_created": 0, "labels_would_create": 0,
        "parents_link": 0,
    }

    cloud_states, cloud_labels, cloud_members = cloud_ref_maps(cloud, pid)
    sh_state_map = c.state_name_map(sh, sh_pid)
    label_map = ensure_labels(sh, sh_pid, cloud_labels, execute, stats)
    try:
        member_map = c.member_email_map(sh)
    except c.PlaneError:
        member_map = {}

    already = c.selfhost_external_ids(ident)  # cloud UUIDs already imported
    cloud_to_sh = {}   # cloud issue id -> self-host issue id (for linkage)
    parents = {}       # cloud issue id -> cloud parent id

    count = 0
    for issue in cloud.get_paginated(f"projects/{pid}/issues/"):
        if limit and count >= limit:
            break
        count += 1
        cid = issue["id"]
        if issue.get("parent"):
            parents[cid] = issue["parent"]

        if cid in already:
            stats["issues_skip"] += 1
            sh_id = _lookup_sh_issue(sh, sh_pid, cid)
            if sh_id:
                cloud_to_sh[cid] = sh_id
        else:
            payload = build_issue_payload(
                issue, cloud_states, sh_state_map, label_map, member_map, cloud_members
            )
            if not execute:
                stats["issues_create"] += 1
                c.log(f"    WOULD create {ident}-cloud#{issue.get('sequence_id')} "
                      f"'{payload['name'][:50]}'")
                continue
            status, body = sh.post(f"projects/{sh_pid}/work-items/", payload)
            if status in (200, 201):
                stats["issues_create"] += 1
                cloud_to_sh[cid] = body["id"]
            elif status == 409:
                stats["issues_skip"] += 1
                if body.get("id"):
                    cloud_to_sh[cid] = body["id"]
            else:
                stats["issues_fail"] += 1
                c.log(f"    issue create FAILED ({status}): {body}")
                continue

        # Comments + links only make sense once the issue exists on self-host.
        sh_id = cloud_to_sh.get(cid)
        if sh_id:
            _migrate_comments(cloud, sh, pid, sh_pid, cid, sh_id, execute, stats)
            _migrate_links(cloud, sh, pid, sh_pid, cid, sh_id, execute, stats)

    _link_parents(sh, sh_pid, parents, cloud_to_sh, execute, stats)

    c.log(f"  summary {ident}: {stats}")
    return stats


def _lookup_sh_issue(sh, sh_pid, external_id):
    status, data = sh.get_raw(
        f"projects/{sh_pid}/issues/",
        {"external_id": external_id, "external_source": EXTERNAL_SOURCE},
    )
    if status == 200 and isinstance(data, dict) and data.get("id"):
        return data["id"]
    return None


def _migrate_comments(cloud, sh, pid, sh_pid, cid, sh_id, execute, stats):
    for comment in cloud.get_paginated(f"projects/{pid}/issues/{cid}/comments/"):
        payload = {
            "comment_html": comment.get("comment_html") or "<p></p>",
            "external_id": comment["id"],
            "external_source": EXTERNAL_SOURCE,
        }
        if comment.get("created_at"):
            payload["created_at"] = comment["created_at"]
        if not execute:
            stats["comments_create"] += 1
            continue
        status, body = sh.post(
            f"projects/{sh_pid}/work-items/{sh_id}/comments/", payload
        )
        if status in (200, 201):
            stats["comments_create"] += 1
        elif status == 409:
            stats["comments_skip"] += 1
        else:
            c.log(f"    comment failed ({status}): {body}")


def _migrate_links(cloud, sh, pid, sh_pid, cid, sh_id, execute, stats):
    for link in cloud.get_paginated(f"projects/{pid}/issues/{cid}/links/"):
        url = link.get("url")
        if not url:
            continue
        payload = {"url": url, "title": link.get("title") or url}
        if not execute:
            stats["links_create"] += 1
            continue
        status, body = sh.post(
            f"projects/{sh_pid}/work-items/{sh_id}/links/", payload
        )
        if status in (200, 201):
            stats["links_create"] += 1
        else:
            # 400 "URL already exists" is the idempotent skip path.
            stats["links_skip"] += 1


def _link_parents(sh, sh_pid, parents, cloud_to_sh, execute, stats):
    for cid, cloud_parent in parents.items():
        sh_child = cloud_to_sh.get(cid)
        sh_parent = cloud_to_sh.get(cloud_parent)
        if not sh_child or not sh_parent:
            continue
        if not execute:
            stats["parents_link"] += 1
            continue
        status, body = sh.patch(
            f"projects/{sh_pid}/work-items/{sh_child}/", {"parent": sh_parent}
        )
        if status in (200, 201):
            stats["parents_link"] += 1
        else:
            c.log(f"    parent link failed ({status}): {body}")


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

    totals = {}
    for ident in sorted(cloud_projs):
        if only and ident not in only:
            continue
        if ident not in sh_projs:
            c.log(f"\n!!! {ident}: no matching self-host project - SKIPPED")
            continue
        stats = migrate_project(
            cloud, sh, ident, cloud_projs[ident], sh_projs[ident], execute, args.limit
        )
        for k, v in stats.items():
            totals[k] = totals.get(k, 0) + v

    c.log(f"\n{'=' * 60}\nGRAND TOTAL: {totals}")
    if not execute:
        c.log("DRY-RUN only. Re-run with --execute to perform writes.")


if __name__ == "__main__":
    main()
