#!/usr/bin/env python3
# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
"""
90 - Verify the migration. READ-ONLY. Exits non-zero on mismatch.

Two checks per in-scope project:

  A. COVERAGE (the real success gate): every cloud issue UUID must appear as an
     external_id on self-host. missing == 0. This is the assertion that matters,
     because the public API cannot preserve exact sequence numbers.

  B. SEQUENCE (informational / conditional gate): compares the cloud seq-number
     set against the self-host seq-number set. Because Issue.save() re-assigns
     sequence_id on create, exact numbers only line up when the cloud range was
     contiguous. Reported as INFO by default; use --strict-seq to hard-fail on
     any seq difference (only meaningful if the DB-write preservation path was
     chosen instead of the public API).

Usage:
    python3 90_verify.py
    python3 90_verify.py --project TEAMDEV
    python3 90_verify.py --strict-seq      # fail if seq numbers differ too
"""

import sys

import common as c


def main():
    parser = c.base_parser(__doc__)
    parser.add_argument(
        "--strict-seq",
        action="store_true",
        help="Also fail when cloud vs self-host sequence NUMBERS differ.",
    )
    args = parser.parse_args()
    only = c.project_filter(args)

    c.mode_banner(execute=False)
    c.log("VERIFY is read-only.\n")

    cloud = c.cloud_client()
    cloud_projs = c.cloud_projects(cloud)

    failures = []
    header = f"{'PROJ':<10}{'cloud#':>8}{'covered':>9}{'MISSING':>9}{'seqΔ':>7}"
    c.log(header)
    c.log("-" * len(header))

    for ident in sorted(cloud_projs):
        if only and ident not in only:
            continue
        pid = cloud_projs[ident]["id"]

        cloud_issues = list(cloud.get_paginated(f"projects/{pid}/issues/"))
        cloud_ids = {i["id"] for i in cloud_issues}
        cloud_seq = {int(i["sequence_id"]) for i in cloud_issues if i.get("sequence_id")}

        try:
            sh_ext = c.selfhost_external_ids(ident)
            sh_seq = c.selfhost_seq_set(ident)
        except RuntimeError as exc:
            c.log(f"{ident:<10} DB read failed: {exc}")
            failures.append(ident)
            continue

        missing = cloud_ids - sh_ext
        seq_delta = len(cloud_seq - sh_seq)

        c.log(
            f"{ident:<10}{len(cloud_ids):>8}{len(cloud_ids & sh_ext):>9}"
            f"{len(missing):>9}{seq_delta:>7}"
        )

        if missing:
            failures.append(ident)
            c.log(f"    MISSING {len(missing)} cloud issue(s) not imported: "
                  f"{sorted(list(missing))[:5]}...")
        if args.strict_seq and seq_delta:
            failures.append(ident)
            c.log(f"    SEQ MISMATCH: {seq_delta} cloud seq number(s) absent "
                  "on self-host (expected via API path; see limitations).")

    c.log("-" * len(header))
    if failures:
        c.log(f"\nFAIL: {len(set(failures))} project(s) with mismatch: "
              f"{sorted(set(failures))}")
        sys.exit(1)
    c.log("\nPASS: every cloud issue is covered on self-host (missing = 0).")
    sys.exit(0)


if __name__ == "__main__":
    main()
