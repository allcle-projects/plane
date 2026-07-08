/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Custom RBAC — mote.
// See docs/mote-design/05-teamspaces-access.md, section 2.
//
// Create / edit editor for a custom Role: name, description, and a permission
// matrix (checkboxes grouped by category) sourced from the permission catalog.

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Button, EModalWidth, Input, ModalCore } from "@plane/ui";
// plane web imports
import { useRoles } from "@/plane-web/hooks/store/use-roles";
import type { TRole } from "@/plane-web/types/roles";

type TRoleModalProps = {
  isOpen: boolean;
  workspaceSlug: string;
  roleId?: string | null;
  handleClose: () => void;
};

export const RoleModal = observer(function RoleModal(props: TRoleModalProps) {
  const { isOpen, workspaceSlug, roleId, handleClose } = props;
  // store hooks
  const { getRoleById, getPermissions, createRole, updateRole } = useRoles();
  // state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const permissions = getPermissions();
  const existing = roleId ? getRoleById(roleId) : undefined;

  // group the catalog by category for the matrix
  const grouped = useMemo(() => {
    const map: Record<string, typeof permissions> = {};
    permissions.forEach((p) => {
      (map[p.category] ??= []).push(p);
    });
    return map;
  }, [permissions]);

  useEffect(() => {
    if (!isOpen) return;
    if (existing) {
      setName(existing.name ?? "");
      setDescription(existing.description ?? "");
      setSelected(new Set(existing.permissions ?? []));
    } else {
      setName("");
      setDescription("");
      setSelected(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, roleId]);

  const togglePerm = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onSubmit = async () => {
    if (!name.trim()) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Name is required." });
      return;
    }
    const payload: Partial<TRole> & { permission_ids?: string[] } = {
      name: name.trim(),
      description: description.trim(),
      permission_ids: Array.from(selected),
    };
    try {
      setIsSubmitting(true);
      if (roleId) {
        await updateRole(workspaceSlug, roleId, payload);
        setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: "Role updated." });
      } else {
        await createRole(workspaceSlug, payload);
        setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: "Role created." });
      }
      handleClose();
    } catch (error) {
      const err = error as { data?: { error?: string } };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: err?.data?.error ?? "Role could not be saved.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} width={EModalWidth.XXL}>
      <div className="flex max-h-[80vh] flex-col gap-4 p-5">
        <h3 className="text-lg font-medium text-primary">{roleId ? "Edit role" : "New role"}</h3>

        <div className="flex flex-col gap-1">
          <label className="text-sm text-secondary">Name</label>
          <Input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Reviewer" className="w-full" />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm text-secondary">Description (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this role can do"
            rows={2}
            className="w-full resize-none rounded-md border border-subtle bg-transparent px-3 py-2 text-sm text-primary outline-none focus:border-accent-primary"
          />
        </div>

        <div className="flex flex-col gap-3 overflow-y-auto">
          <label className="text-sm font-medium text-secondary">Permissions</label>
          {Object.entries(grouped).map(([category, perms]) => (
            <div key={category} className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-tertiary">{category}</span>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {perms.map((perm) => (
                  <label key={perm.id} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1 hover:bg-layer-1">
                    <input
                      type="checkbox"
                      checked={selected.has(perm.id)}
                      onChange={() => togglePerm(perm.id)}
                      className="mt-0.5"
                    />
                    <span className="flex flex-col">
                      <span className="text-sm text-primary">{perm.key}</span>
                      {perm.description ? <span className="text-xs text-tertiary">{perm.description}</span> : null}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-2 flex items-center justify-end gap-2">
          <Button variant="neutral-primary" size="sm" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={() => void onSubmit()} loading={isSubmitting}>
            {roleId ? "Update" : "Create"}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
