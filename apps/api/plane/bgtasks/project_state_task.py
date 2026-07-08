# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Project States — default seeding (mote).
# See docs/mote-design/04-planning-hierarchy.md, section 3 ("Project States").
#
# Seeds the 6 DEFAULT_PROJECT_STATES for a workspace. Mirrors the issue-state
# seeding that runs inline on project creation (app/views/project/base.py:277 /
# api/views/project.py:240 ``State.objects.bulk_create(... for DEFAULT_STATES)``)
# but at workspace scope. Importable so the data migration can reuse it to
# backfill existing workspaces. Idempotent: no-op if the workspace already has
# any project states.

# Module imports
from plane.db.models import (
    ProjectState,
    DEFAULT_PROJECT_STATES,
    Workspace,
)


def create_default_project_states(workspace_id, created_by_id=None):
    """Bulk-create the default project states for a workspace.

    Idempotent — if the workspace already has any ProjectState rows this is a
    no-op (so it is safe to call from both the workspace-create path and the
    data migration backfill).

    Args:
        workspace_id: ID of the workspace to seed.
        created_by_id: Optional user id to stamp as ``created_by``.

    Returns:
        The list of created ProjectState instances (empty if skipped).
    """
    # Idempotency guard — skip if any project state already exists.
    if ProjectState.objects.filter(workspace_id=workspace_id).exists():
        return []

    workspace = Workspace.objects.get(id=workspace_id)

    return ProjectState.objects.bulk_create(
        [
            ProjectState(
                name=state["name"],
                color=state["color"],
                sequence=state["sequence"],
                group=state["group"],
                default=state.get("default", False),
                workspace=workspace,
                created_by_id=created_by_id,
            )
            for state in DEFAULT_PROJECT_STATES
        ]
    )
