/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Custom RBAC — mote.
// See docs/mote-design/05-teamspaces-access.md, section 2.
//
// Workspace settings surface for roles: the list of roles (built-in system
// roles + custom ones) with a permission-count and edit/delete for custom
// roles, plus a "New role" action.

import { useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Button } from "@plane/ui";
// plane web imports
import { useRoles } from "@/plane-web/hooks/store/use-roles";
// local imports
import { RoleModal } from "./role-modal";

type TRolesRootProps = {
  workspaceSlug: string;
  isEditable: boolean;
};

export const RolesRoot = observer(function RolesRoot(props: TRolesRootProps) {
  const { workspaceSlug, isEditable } = props;
  // store hooks
  const { getWorkspaceRoles, fetchRoles, fetchPermissions, deleteRole } = useRoles();
  // state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useSWR(workspaceSlug ? `WORKSPACE_ROLES_${workspaceSlug}` : null, workspaceSlug ? () => fetchRoles(workspaceSlug) : null, {
    revalidateOnFocus: false,
  });
  useSWR(
    workspaceSlug ? `WORKSPACE_PERMISSIONS_${workspaceSlug}` : null,
    workspaceSlug ? () => fetchPermissions(workspaceSlug) : null,
    { revalidateOnFocus: false }
  );

  const roles = getWorkspaceRoles();

  const openCreate = () => {
    setEditingId(null);
    setModalOpen(true);
  };
  const openEdit = (id: string) => {
    setEditingId(id);
    setModalOpen(true);
  };
  const onDelete = async (id: string) => {
    try {
      await deleteRole(workspaceSlug, id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: "Role deleted." });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Could not delete role." });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {isEditable && (
        <div className="flex justify-end">
          <Button variant="primary" size="sm" prependIcon={<Plus className="size-3.5" />} onClick={openCreate}>
            New role
          </Button>
        </div>
      )}

      <div className="flex flex-col divide-y divide-subtle rounded-md border border-subtle">
        {roles.length === 0 ? (
          <span className="px-4 py-3 text-sm text-tertiary">No roles yet.</span>
        ) : (
          roles.map((role) => (
            <div key={role.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <ShieldCheck className="size-4 text-tertiary" />
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-primary">{role.name}</span>
                    {role.is_system ? (
                      <span className="rounded-full bg-layer-1 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-tertiary">
                        Built-in
                      </span>
                    ) : null}
                  </div>
                  <span className="text-xs text-tertiary">
                    {role.permission_keys?.length ?? 0} permission
                    {(role.permission_keys?.length ?? 0) === 1 ? "" : "s"}
                    {role.description ? ` · ${role.description}` : ""}
                  </span>
                </div>
              </div>
              {isEditable && !role.is_system ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="rounded-sm p-1.5 text-tertiary hover:bg-layer-1 hover:text-primary"
                    onClick={() => openEdit(role.id)}
                    aria-label="Edit role"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    className="rounded-sm p-1.5 text-tertiary hover:bg-layer-1 hover:text-danger"
                    onClick={() => void onDelete(role.id)}
                    aria-label="Delete role"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>

      <RoleModal
        isOpen={modalOpen}
        workspaceSlug={workspaceSlug}
        roleId={editingId}
        handleClose={() => setModalOpen(false)}
      />
    </div>
  );
});
