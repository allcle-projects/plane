/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Project States — mote (Phase 2).
// See docs/mote-design/04-planning-hierarchy.md, section 3.
//
// A single project-state row for the settings editor: color swatch + name +
// group badge, with inline edit (swaps in the form) and delete. Mirrors the
// issue-state item (core/components/project-states/state-item.tsx) without the
// drag-and-drop reordering (noted as a v2 follow-up).

import { useState } from "react";
import { observer } from "mobx-react";
import { Trash2 } from "lucide-react";
// plane imports
import { EditIcon } from "@plane/propel/icons";
// plane web hooks
import { useWorkspaceProjectStates } from "@/plane-web/hooks/store/use-workspace-project-states";
// plane web types
import type { TProjectState } from "@/plane-web/types/workspace-project-states";
// local imports
import { ProjectStateDeleteModal } from "./project-state-delete-modal";
import { ProjectStateForm } from "./project-state-form";

type TProjectStateItem = {
  workspaceSlug: string;
  state: TProjectState;
  isEditable: boolean;
};

export const ProjectStateItem = observer(function ProjectStateItem(props: TProjectStateItem) {
  const { workspaceSlug, state, isEditable } = props;
  // states
  const [isEditing, setIsEditing] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  // store
  const { updateProjectState } = useWorkspaceProjectStates();

  const handleUpdate = async (formData: Partial<TProjectState>) => {
    await updateProjectState(workspaceSlug, state.id, formData);
    setIsEditing(false);
  };

  if (isEditing)
    return (
      <ProjectStateForm
        data={state}
        onSubmit={handleUpdate}
        onCancel={() => setIsEditing(false)}
        buttonDisabled={false}
        buttonTitle="Update"
      />
    );

  return (
    <>
      <ProjectStateDeleteModal isOpen={deleteModal} onClose={() => setDeleteModal(false)} data={state} />
      <div className="group relative flex items-center justify-between rounded-sm border border-subtle bg-surface-1 px-3.5 py-3">
        <div className="flex items-center gap-2">
          <span
            className="h-3.5 w-3.5 flex-shrink-0 rounded-full"
            style={{ backgroundColor: state.color ?? "#60646C" }}
          />
          <div className="text-13">
            <h6 className="font-medium">{state.name}</h6>
            {state.description ? <p className="text-11 text-secondary">{state.description}</p> : null}
          </div>
          <span className="rounded-sm bg-surface-2 px-1.5 py-0.5 text-11 text-secondary capitalize">{state.group}</span>
        </div>
        {isEditable && (
          <div className="hidden items-center gap-1 group-hover:flex">
            <button
              className="flex h-5 w-5 flex-shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-sm text-secondary transition-colors hover:bg-layer-1 hover:text-primary"
              onClick={() => setIsEditing(true)}
            >
              <EditIcon className="h-3 w-3" />
            </button>
            <button
              className="flex h-5 w-5 flex-shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-sm text-secondary transition-colors hover:bg-layer-1 hover:text-danger"
              onClick={() => setDeleteModal(true)}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    </>
  );
});
