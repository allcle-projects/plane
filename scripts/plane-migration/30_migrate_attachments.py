#!/usr/bin/env python3
# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
"""
30 - Migrate issue attachments cloud -> self-host. OPTIONAL / SLOW.

Run this LAST and only if attachment fidelity matters. It downloads every
cloud attachment through its presigned URL and re-uploads it to the self-host
S3 via the 3-step asset flow. Large binaries + per-file round trips make this
the slowest pass by far. DRY-RUN by default.

Self-host asset flow (confirmed in apps/api/.../views/issue.py):
  1. POST  /work-items/<iid>/attachments/  {name,type,size,external_id,...}
       -> {"upload_data": <s3 presigned POST>, "asset_id": ...}
       (409 if external_id already present -> idempotent skip)
  2. multipart POST the bytes to upload_data.url with upload_data.fields
  3. PATCH /work-items/<iid>/attachments/<asset_id>/  {"is_uploaded": true}

Idempotent by external_id = cloud attachment id.

Usage:
    python3 30_migrate_attachments.py             # dry-run
    python3 30_migrate_attachments.py --execute   # perform uploads
"""

import io
import mimetypes
import urllib.request
import uuid

import common as c

EXTERNAL_SOURCE = "plane-cloud"


def _multipart_body(fields, filename, file_bytes, content_type):
    """Build a multipart/form-data body for an S3 presigned POST."""
    boundary = "----plane-mig-" + uuid.uuid4().hex
    buf = io.BytesIO()

    def w(text):
        buf.write(text.encode("utf-8"))

    for key, value in fields.items():
        w(f"--{boundary}\r\n")
        w(f'Content-Disposition: form-data; name="{key}"\r\n\r\n')
        w(f"{value}\r\n")
    w(f"--{boundary}\r\n")
    w(f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n')
    w(f"Content-Type: {content_type}\r\n\r\n")
    buf.write(file_bytes)
    w(f"\r\n--{boundary}--\r\n")
    return boundary, buf.getvalue()


def _s3_upload(upload_data, filename, file_bytes, content_type):
    """POST file_bytes to the S3 presigned endpoint. Returns True on success."""
    url = upload_data["url"]
    fields = dict(upload_data.get("fields", {}))
    boundary, body = _multipart_body(fields, filename, file_bytes, content_type)
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return 200 <= resp.status < 300
    except Exception as exc:  # noqa: BLE001 - report and continue
        c.log(f"      S3 upload error: {exc}")
        return False


def _cloud_attachments(cloud, pid, iid):
    """Cloud attachments via the legacy issue-attachments listing."""
    return cloud.get_paginated(f"projects/{pid}/issues/{iid}/issue-attachments/")


def migrate_issue_attachments(cloud, sh, pid, sh_pid, cloud_iid, sh_iid, execute, stats):
    for att in _cloud_attachments(cloud, pid, cloud_iid):
        attrs = att.get("attributes") or {}
        name = attrs.get("name") or att.get("asset") or "attachment"
        size = attrs.get("size") or att.get("size") or 0
        ctype = attrs.get("type") or mimetypes.guess_type(name)[0] or "application/octet-stream"
        ext_id = att["id"]

        if not execute:
            stats["would_upload"] += 1
            continue

        # 1. reserve the asset (idempotent by external_id)
        status, body = sh.post(
            f"projects/{sh_pid}/work-items/{sh_iid}/attachments/",
            {
                "name": name,
                "type": ctype,
                "size": size,
                "external_id": ext_id,
                "external_source": EXTERNAL_SOURCE,
            },
        )
        if status == 409:
            stats["skip"] += 1
            continue
        if status not in (200, 201) or not isinstance(body, dict):
            stats["fail"] += 1
            c.log(f"      reserve failed ({status}): {body}")
            continue

        upload_data = body.get("upload_data")
        asset_id = body.get("asset_id")
        if not upload_data or not asset_id:
            stats["fail"] += 1
            continue

        # 2. download from cloud then upload to self-host S3
        dl_status, file_bytes = cloud.download(
            f"projects/{pid}/issues/{cloud_iid}/issue-attachments/{ext_id}/"
        )
        if dl_status not in (200, 302) or not file_bytes:
            stats["fail"] += 1
            c.log(f"      cloud download failed ({dl_status}) for {name}")
            continue
        if not _s3_upload(upload_data, name, file_bytes, ctype):
            stats["fail"] += 1
            continue

        # 3. mark uploaded
        pstatus, pbody = sh.patch(
            f"projects/{sh_pid}/work-items/{sh_iid}/attachments/{asset_id}/",
            {"is_uploaded": True},
        )
        if pstatus in (200, 201, 204):
            stats["upload"] += 1
        else:
            stats["fail"] += 1
            c.log(f"      mark-uploaded failed ({pstatus}): {pbody}")


def main():
    parser = c.base_parser(__doc__)
    args = parser.parse_args()
    execute = c.resolve_execute(args)
    only = c.project_filter(args)
    c.mode_banner(execute)
    c.log("NOTE: attachments is the OPTIONAL, SLOW pass. Run it last.\n")

    cloud = c.cloud_client()
    sh = c.selfhost_client(require_token=execute)
    cloud_projs = c.cloud_projects(cloud)
    sh_projs = c.selfhost_projects(sh)

    totals = {"would_upload": 0, "upload": 0, "skip": 0, "fail": 0}
    for ident in sorted(cloud_projs):
        if only and ident not in only:
            continue
        if ident not in sh_projs:
            c.log(f"!!! {ident}: no matching self-host project - SKIPPED")
            continue
        pid = cloud_projs[ident]["id"]
        sh_pid = sh_projs[ident]["id"]
        c.log(f"=== {ident} attachments ===")
        by_ext, by_seqname = _build_sh_index(sh, sh_pid)
        count = 0
        for issue in cloud.get_paginated(f"projects/{pid}/issues/"):
            if args.limit and count >= args.limit:
                break
            count += 1
            # drift issues -> external_id; 7/2-aligned issues have no
            # external_id, so fall back to (sequence_id, name) equality.
            sh_iid = by_ext.get(issue["id"]) or by_seqname.get(
                (issue.get("sequence_id"), issue.get("name"))
            )
            if not sh_iid:
                continue  # issue not migrated yet; run 10 first
            migrate_issue_attachments(
                cloud, sh, pid, sh_pid, issue["id"], sh_iid, execute, totals
            )

    c.log(f"\n{'=' * 60}\nGRAND TOTAL attachments: {totals}")
    if not execute:
        c.log("DRY-RUN only. Re-run with --execute to perform uploads.")


def _build_sh_index(sh, sh_pid):
    """Map cloud issue -> self-host issue id two ways: by external_id (drift
    issues we imported) and by (sequence_id, name) (the 7/2-aligned issues,
    which carry no external_id). Same matching the issue migration used."""
    by_ext, by_seqname = {}, {}
    for it in sh.get_paginated(f"projects/{sh_pid}/issues/"):
        if it.get("external_id"):
            by_ext[it["external_id"]] = it["id"]
        by_seqname[(it.get("sequence_id"), it.get("name"))] = it["id"]
    return by_ext, by_seqname


if __name__ == "__main__":
    main()
