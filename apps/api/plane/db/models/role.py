# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Custom RBAC — mote.
# See docs/mote-design/05-teamspaces-access.md, section 2.
#
# User-defined roles with granular permission grants, layered ADDITIVELY on top
# of the fixed int role system (WorkspaceMember.role / ProjectMember.role) which
# remains the source of truth for system roles. ``Role.base_role`` bridges a
# custom role back to the nearest int (20/15/5) for compatibility, and three
# seeded ``is_system`` roles (Admin/Member/Guest) mirror the existing ints so the
# resolver can return identical results for users who have no custom assignment.
#
# This layer is intentionally non-invasive: it stores roles/permissions/
# assignments and exposes a resolver (app/permissions/resolver.py), but does NOT
# rewrite the existing permission classes / allow_permission gates. Converting
# individual gates to consult the resolver is a deliberate, per-gate follow-up.

# Django imports
from django.conf import settings
from django.db import models

# Module imports
from .base import BaseModel


class Permission(BaseModel):
    """A granular permission in the catalog, e.g. ``issue.create``. Global
    (not workspace-scoped) — the catalog is the same for every workspace."""

    key = models.CharField(max_length=100, unique=True)
    category = models.CharField(max_length=50)  # workspace | project | issue | page
    description = models.TextField(blank=True, default="")

    def __str__(self):
        return self.key

    class Meta:
        verbose_name = "Permission"
        verbose_name_plural = "Permissions"
        db_table = "permissions"
        ordering = ("category", "key")


class Role(BaseModel):
    """A named role scoped to a workspace. System roles (Admin/Member/Guest) are
    seeded with ``is_system=True`` and are not deletable; custom roles are
    admin-defined. ``base_role`` maps back to the legacy int for compatibility."""

    LEVEL_CHOICES = (("WORKSPACE", "Workspace"), ("PROJECT", "Project"))

    workspace = models.ForeignKey(
        "db.Workspace", on_delete=models.CASCADE, related_name="roles"
    )
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, default="")
    level = models.CharField(max_length=20, choices=LEVEL_CHOICES, default="WORKSPACE")
    is_system = models.BooleanField(default=False)
    # Bridge to the fixed int role (20/15/5) for the legacy-compat fallback.
    base_role = models.PositiveSmallIntegerField(null=True, blank=True)
    permissions = models.ManyToManyField(Permission, related_name="roles", blank=True)

    def __str__(self):
        return f"{self.name} <{self.workspace.name}>"

    class Meta:
        unique_together = ["name", "workspace", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["name", "workspace"],
                condition=models.Q(deleted_at__isnull=True),
                name="role_unique_name_workspace_when_deleted_at_null",
            )
        ]
        verbose_name = "Role"
        verbose_name_plural = "Roles"
        db_table = "roles"
        ordering = ("-created_at",)


class RoleAssignment(BaseModel):
    """Assigns a custom (or system) Role to a member, optionally scoped to a
    project. Additive to the member's int role — it never removes the base int
    grant, only widens it with the role's permission set."""

    role = models.ForeignKey("db.Role", on_delete=models.CASCADE, related_name="assignments")
    member = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="role_assignments"
    )
    workspace = models.ForeignKey(
        "db.Workspace", on_delete=models.CASCADE, related_name="workspace_role_assignments"
    )
    project = models.ForeignKey(
        "db.Project", on_delete=models.CASCADE, null=True, blank=True, related_name="project_role_assignments"
    )

    def __str__(self):
        return f"{self.member.email} -> {self.role.name}"

    class Meta:
        unique_together = ["role", "member", "project", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["role", "member", "project"],
                condition=models.Q(deleted_at__isnull=True),
                name="role_assignment_unique_role_member_project_when_deleted_at_null",
            )
        ]
        verbose_name = "Role Assignment"
        verbose_name_plural = "Role Assignments"
        db_table = "role_assignments"
        ordering = ("-created_at",)
