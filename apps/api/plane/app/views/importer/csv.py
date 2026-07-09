# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# CSV work-item importer (mote). See docs/mote-design/06-integrations-importers-automations.md.
#
# A lightweight importer that turns a CSV into work items in a project. Each row
# becomes an Issue created through IssueCreateSerializer, so sequence numbering,
# sort order and state/priority validation are identical to the normal create
# path. Reuses the additive issue.create RBAC gate. Rows that fail validation are
# reported per-row without aborting the whole import (best-effort, partial ok).

import csv
import io

from rest_framework.response import Response
from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from ..base import BaseAPIView
from plane.app.permissions import allow_permission, ROLE
from plane.app.serializers import IssueCreateSerializer
from plane.db.models import Project, State


# CSV header aliases -> canonical field. Case-insensitive; whitespace trimmed.
# Covers plain CSV plus Jira and Notion exports:
#   Jira    -> "Summary"/"Description"/"Priority"/"Status" (+ "Issue key" ignored)
#   Notion  -> "Name"/"Status"/"Priority" (+ arbitrary property columns ignored)
_NAME_KEYS = ("name", "title", "summary", "task name", "work item")
_DESC_KEYS = ("description", "desc", "details", "body")
_PRIORITY_KEYS = ("priority",)
_STATE_KEYS = ("state", "status")
_VALID_PRIORITIES = {"urgent", "high", "medium", "low", "none"}
# Vendor priority vocab -> Plane priority. Jira uses Highest/High/Medium/Low/Lowest;
# Notion commonly uses High/Medium/Low. Anything unknown falls through to "none".
_PRIORITY_ALIASES = {
    "highest": "urgent",
    "critical": "urgent",
    "blocker": "urgent",
    "urgent": "urgent",
    "high": "high",
    "medium": "medium",
    "normal": "medium",
    "low": "low",
    "lowest": "low",
    "minor": "low",
    "trivial": "low",
    "none": "none",
    "no priority": "none",
}
MAX_ROWS = 5000


def _pick(row_lower, keys):
    for k in keys:
        if k in row_lower and row_lower[k] is not None:
            v = str(row_lower[k]).strip()
            if v:
                return v
    return ""


def _normalize_priority(raw):
    """Map a vendor priority label to a Plane priority, or "" if unknown."""
    key = raw.strip().lower()
    if key in _VALID_PRIORITIES:
        return key
    return _PRIORITY_ALIASES.get(key, "")


class ProjectIssueCSVImportEndpoint(BaseAPIView):
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], permission_key="issue.create")
    def post(self, request, slug, project_id):
        project = Project.objects.get(pk=project_id)

        # Source: multipart "file", or raw CSV text in "csv".
        raw = None
        upload = request.FILES.get("file")
        if upload is not None:
            raw = upload.read().decode("utf-8-sig", errors="replace")
        else:
            raw = request.data.get("csv")

        if not raw or not str(raw).strip():
            return Response(
                {"error": "Provide a CSV file (field 'file') or CSV text (field 'csv')."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reader = csv.DictReader(io.StringIO(raw))
        if not reader.fieldnames or not any(
            (fn or "").strip().lower() in _NAME_KEYS for fn in reader.fieldnames
        ):
            return Response(
                {"error": "CSV must have a 'name' (or 'title'/'summary') column."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # State name -> id map for this project (case-insensitive).
        states = {
            s.name.strip().lower(): s.id
            for s in State.objects.filter(project_id=project_id)
        }

        ctx = {
            "project_id": str(project_id),
            "workspace_id": str(project.workspace_id),
            "default_assignee_id": project.default_assignee_id,
        }

        created = []
        errors = []
        count = 0
        for idx, row in enumerate(reader, start=2):  # row 1 = header
            count += 1
            if count > MAX_ROWS:
                errors.append({"row": idx, "error": f"row limit {MAX_ROWS} exceeded; remaining rows skipped"})
                break

            row_lower = {(k or "").strip().lower(): v for k, v in row.items()}
            name = _pick(row_lower, _NAME_KEYS)
            if not name:
                errors.append({"row": idx, "error": "missing name"})
                continue

            data = {"name": name[:255]}
            desc = _pick(row_lower, _DESC_KEYS)
            if desc:
                # Plain text -> minimal HTML; IssueCreateSerializer sanitizes it.
                data["description_html"] = "<p>{}</p>".format(
                    desc.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                )
            pr = _normalize_priority(_pick(row_lower, _PRIORITY_KEYS))
            if pr:
                data["priority"] = pr
            st = _pick(row_lower, _STATE_KEYS).lower()
            if st and st in states:
                data["state_id"] = states[st]

            serializer = IssueCreateSerializer(data=data, context=ctx)
            if serializer.is_valid():
                serializer.save()
                created.append(serializer.data.get("id"))
            else:
                errors.append({"row": idx, "error": serializer.errors})

        return Response(
            {
                "created_count": len(created),
                "error_count": len(errors),
                "created": created,
                "errors": errors[:100],  # cap the echo
            },
            status=status.HTTP_200_OK,
        )
