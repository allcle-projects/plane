# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Custom RBAC — permission catalog + system-role mapping (mote).
# See docs/mote-design/05-teamspaces-access.md, section 2.
#
# Single source of truth for the granular permission keys and which of them each
# seeded system role (Admin/Member/Guest) grants. Referenced by the seed data
# migration (0142) and the resolver (app/permissions/resolver.py) so the two can
# never drift.

# (key, category, description)
PERMISSION_CATALOG = [
    # workspace
    ("workspace.manage", "workspace", "Edit workspace settings"),
    ("workspace.member.manage", "workspace", "Invite / remove / re-role members"),
    ("workspace.delete", "workspace", "Delete the workspace"),
    ("workspace.analytics.view", "workspace", "View workspace analytics"),
    ("workspace.role.manage", "workspace", "Create and assign custom roles"),
    # project
    ("project.create", "project", "Create projects"),
    ("project.manage", "project", "Edit project settings"),
    ("project.member.manage", "project", "Manage project members"),
    ("project.delete", "project", "Delete a project"),
    # issue / work item
    ("issue.create", "issue", "Create work items"),
    ("issue.update", "issue", "Edit work items"),
    ("issue.delete", "issue", "Delete work items"),
    ("issue.comment", "issue", "Comment on work items"),
    ("issue.state.manage", "issue", "Manage states / workflow"),
    # page
    ("page.create", "page", "Create pages"),
    ("page.manage", "page", "Edit / delete pages"),
]

ALL_PERMISSION_KEYS = [key for (key, _cat, _desc) in PERMISSION_CATALOG]

# Guest (base_role 5): read-heavy, may comment and create issues only.
GUEST_PERMISSION_KEYS = [
    "issue.comment",
]

# Member (base_role 15): the everyday contributor set — create/edit content,
# not destructive / governance actions.
MEMBER_PERMISSION_KEYS = [
    "project.create",
    "issue.create",
    "issue.update",
    "issue.comment",
    "page.create",
    "workspace.analytics.view",
]

# Admin (base_role 20): everything.
ADMIN_PERMISSION_KEYS = list(ALL_PERMISSION_KEYS)

# System role definitions: (name, base_role, permission_keys).
SYSTEM_ROLES = [
    ("Admin", 20, ADMIN_PERMISSION_KEYS),
    ("Member", 15, MEMBER_PERMISSION_KEYS),
    ("Guest", 5, GUEST_PERMISSION_KEYS),
]


def permissions_for_base_role(base_role):
    """The permission-key set granted to a legacy int role (20/15/5). Used by the
    resolver's fallback so users with only a system int role behave identically
    to their seeded system Role."""
    if base_role is None:
        return set()
    if base_role >= 20:
        return set(ADMIN_PERMISSION_KEYS)
    if base_role >= 15:
        return set(MEMBER_PERMISSION_KEYS)
    if base_role >= 5:
        return set(GUEST_PERMISSION_KEYS)
    return set()
