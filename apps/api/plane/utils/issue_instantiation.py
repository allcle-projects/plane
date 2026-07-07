# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Shared work-item instantiation from a snapshot (mote).
# See docs/mote-design/03-work-item-power.md, sections 2 & 3.
#
# A ``template_data`` / ``issue_data`` snapshot (name/description/priority + FK
# ids for state/type/estimate/labels/assignees + ``property_values``) is turned
# into a fresh Issue in a target project. Stale FK ids are resolved against the
# target project and silently dropped (never hard-fail) so a snapshot referencing
# since-deleted or foreign entities still applies. Custom property values are
# written via the Custom Fields Phase-2 upsert util so validation lives in one
# place. Used by the Template instantiate endpoint (mote.14) and the recurring
# work-item dispatcher (mote.15).

# Django imports
from django.db import transaction

# Module imports
from plane.app.serializers import IssueCreateSerializer
from plane.db.models import (
    EstimatePoint,
    Issue,
    IssueType,
    Label,
    ProjectMember,
    State,
)
from plane.utils.issue_property_values import (
    PropertyValueError,
    upsert_property_values,
)


def resolve_issue_payload(issue_data, project_id, workspace_id):
    """Build a validated-shape IssueCreateSerializer payload from a snapshot.

    FK ids are kept only when they still resolve against the target project /
    workspace; everything else is dropped so instantiation never hard-fails on
    stale references.
    """
    data = {}
    if issue_data.get("name"):
        data["name"] = issue_data["name"]
    if issue_data.get("description_html"):
        data["description_html"] = issue_data["description_html"]
    if issue_data.get("priority"):
        data["priority"] = issue_data["priority"]

    state_id = issue_data.get("state_id")
    if state_id and State.objects.filter(project_id=project_id, pk=state_id).exists():
        data["state_id"] = str(state_id)

    # Work item types are workspace-scoped (shared across projects); a valid,
    # active type in the workspace carries its property definitions.
    type_id = issue_data.get("type_id")
    if type_id and IssueType.objects.filter(
        workspace_id=workspace_id, pk=type_id, is_active=True
    ).exists():
        data["type"] = str(type_id)

    estimate_point_id = issue_data.get("estimate_point_id")
    if estimate_point_id and EstimatePoint.objects.filter(
        project_id=project_id, pk=estimate_point_id
    ).exists():
        data["estimate_point"] = str(estimate_point_id)

    label_ids = issue_data.get("label_ids") or []
    if label_ids:
        valid_labels = list(
            Label.objects.filter(
                project_id=project_id, id__in=label_ids
            ).values_list("id", flat=True)
        )
        if valid_labels:
            data["label_ids"] = [str(x) for x in valid_labels]

    assignee_ids = issue_data.get("assignee_ids") or []
    if assignee_ids:
        valid_assignees = list(
            ProjectMember.objects.filter(
                project_id=project_id,
                member_id__in=assignee_ids,
                is_active=True,
            ).values_list("member_id", flat=True)
        )
        if valid_assignees:
            data["assignee_ids"] = [str(x) for x in valid_assignees]

    return data


def instantiate_issue_from_data(issue_data, project, actor_id=None):
    """Create a fresh Issue from an ``issue_data`` snapshot in ``project``.

    Returns ``(issue, payload, property_changes)``. ``property_changes`` is the
    list of upsert descriptors the caller can emit as IssueActivity. This helper
    does NOT emit activity itself (the caller owns actor attribution). Raises
    ``rest_framework.exceptions.ValidationError`` (via ``is_valid``) if the
    resolved payload is invalid. Runs the create + property write in one atomic
    block. ``actor_id`` (may be ``None`` for a system/recurring create) sets the
    created_by / updated_by audit columns.
    """
    issue_data = issue_data or {}
    payload = resolve_issue_payload(issue_data, project.id, project.workspace_id)

    serializer = IssueCreateSerializer(
        data=payload,
        context={
            "project_id": str(project.id),
            "workspace_id": str(project.workspace_id),
            "default_assignee_id": project.default_assignee_id,
        },
    )
    serializer.is_valid(raise_exception=True)

    property_changes = []
    with transaction.atomic():
        serializer.save(created_by_id=actor_id, updated_by_id=actor_id)
        issue = Issue.objects.get(pk=serializer.data["id"])
        property_values = issue_data.get("property_values")
        if issue.type_id is not None and property_values:
            try:
                _, property_changes = upsert_property_values(issue, property_values)
            except PropertyValueError:
                # Stale property/option references — drop, do not hard-fail.
                property_changes = []

    return issue, payload, property_changes
