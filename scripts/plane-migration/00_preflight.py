#!/usr/bin/env python3
# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
"""
00 - Preflight. READ-ONLY. No writes ever.

Inventories cloud vs self-host and prints the full migration plan:
  * in-scope cloud projects (EXCLUDE set removed) and their issue/page counts
  * self-host sequence coverage per project (from the DB)
  * per-project delta: how many issues WOULD be created (external_id missing)
  * verifies SELFHOST_API_TOKEN works with a GET (if set)
  * prints the confirmed create-contract limitations

Usage:
    export SELFHOST_API_TOKEN=plane_api_...   # optional but recommended
    python3 00_preflight.py
    python3 00_preflight.py --project GROWTH --project TEAMDEV
"""

import common as c


LIMITATIONS = [
    "sequence_id is NOT honored on create: Issue.save() overwrites it with "
    "last_sequence+1 (apps/api/.../db/models/issue.py). Self-host assigns fresh "
    "consecutive numbers. Exact cloud seq numbers are only reproduced when the "
    "cloud gap is contiguous AND self-host max == first-missing-1 (GROWTH/ALLCL/"
    "STORE/MOTEERP). Cloud gaps (TEAMDEV) will NOT reproduce the same numbers.",
    "created_at / created_by ARE honored on issues and comments (the view sets "
    "them post-save). But created_by must be a self-host user id; cloud user "
    "UUIDs differ, so authorship maps by email or falls back to the token user.",
    "Pages: create serializer accepts ONLY name, description_html, access. "
    "No external_id (so page dedup is by NAME, imperfect) and no "
    "description_binary (Yjs collaborative state is dropped; HTML only).",
    "Issue links have no external_id; dedup is by URL (server 409s on dup).",
    "assignees must already be project members with a writing role or they are "
    "silently dropped by the serializer.",
]


def verify_selfhost_token():
    import os

    if not os.environ.get("SELFHOST_API_TOKEN"):
        c.log("SELFHOST_API_TOKEN not set -> skipping self-host API check "
              "(mint it with 01_mint_selfhost_token.py).")
        return
    sh = c.selfhost_client()
    try:
        projects = list(sh.get_paginated("projects/"))
        c.log(f"self-host API OK: token works, {len(projects)} projects visible.")
    except c.PlaneError as exc:
        c.log(f"self-host API CHECK FAILED: {exc}")


def main():
    parser = c.base_parser(__doc__)
    args = parser.parse_args()
    only = c.project_filter(args)

    c.mode_banner(execute=False)
    c.log("PREFLIGHT is always read-only regardless of flags.\n")

    cloud = c.cloud_client()
    cloud_projs = c.cloud_projects(cloud)

    c.log("Fetching self-host sequence coverage from DB ...")
    grand_create = 0
    header = f"{'PROJ':<10}{'cloud#':>8}{'sh_have':>9}{'missing':>9}{'pages':>7}"
    c.log(header)
    c.log("-" * len(header))

    for ident in sorted(cloud_projs):
        if only and ident not in only:
            continue
        proj = cloud_projs[ident]
        pid = proj["id"]

        cloud_issue_ids = {
            i["id"] for i in cloud.get_paginated(f"projects/{pid}/issues/")
        }
        try:
            sh_have = c.selfhost_external_ids(ident)
        except RuntimeError as exc:
            c.log(f"{ident:<10} DB read failed: {exc}")
            continue
        missing = cloud_issue_ids - sh_have
        grand_create += len(missing)

        page_count = sum(
            1 for _ in cloud.get_paginated(f"projects/{pid}/pages/")
        )
        c.log(
            f"{ident:<10}{len(cloud_issue_ids):>8}{len(sh_have):>9}"
            f"{len(missing):>9}{page_count:>7}"
        )

    c.log("-" * len(header))
    c.log(f"TOTAL issues that WOULD be created: {grand_create}\n")

    verify_selfhost_token()

    c.log("\nCONTRACT LIMITATIONS (must be acknowledged before the run):")
    for i, item in enumerate(LIMITATIONS, 1):
        c.log(f"  {i}. {item}")

    c.log("\nExcluded (never touched): " + ", ".join(sorted(c.EXCLUDE_IDENTIFIERS)))
    c.log("No writes were performed.")


if __name__ == "__main__":
    main()
