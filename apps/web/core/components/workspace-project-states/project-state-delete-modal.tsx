/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Project States — mote (Phase 2).
// See docs/mote-design/04-planning-hierarchy.md, section 3.
//
// Confirmation modal for deleting a workspace project state. Mirrors the
// issue-state delete modal (core/components/project-states/state-delete-modal.tsx).

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { AlertModalCore } from "@plane/ui";
// plane web hooks
import { useWorkspaceProjectStates } from "@/plane-web/hooks/store/use-workspace-project-states";
// plane web types
import type { TProjectState } from "@/plane-web/types/workspace-project-states";

type TProjectStateDeleteModal = {
  isOpen: boolean;
  onClose: () => void;
  data: TProjectState | null;
};

export const ProjectStateDeleteModal = observer(function ProjectStateDeleteModal(props: TProjectStateDeleteModal) {
  const { isOpen, onClose, data } = props;
  // states
  const [isDeleteLoading, setIsDeleteLoading] = useState(false);
  // router
  const { workspaceSlug } = useParams();
  // store
  const { deleteProjectState } = useWorkspaceProjectStates();

  const handleClose = () => {
    onClose();
    setIsDeleteLoading(false);
  };

  const handleDeletion = async () => {
    if (!workspaceSlug || !data) return;

    setIsDeleteLoading(true);

    await deleteProjectState(workspaceSlug.toString(), data.id)
      .then(() => {
        handleClose();
      })
      .catch((err) => {
        if (err?.status === 400)
          setToast({
            type: TOAST_TYPE.ERROR,
            title: "Error!",
            message: "Some projects are still in this state. Move them to another state before deleting it.",
          });
        else
          setToast({
            type: TOAST_TYPE.ERROR,
            title: "Error!",
            message: "State could not be deleted. Please try again.",
          });
      })
      .finally(() => {
        setIsDeleteLoading(false);
      });
  };

  return (
    <AlertModalCore
      handleClose={handleClose}
      handleSubmit={handleDeletion}
      isSubmitting={isDeleteLoading}
      isOpen={isOpen}
      title="Delete Project State"
      content={
        <>
          Are you sure you want to delete state- <span className="font-medium text-primary">{data?.name}</span>? All of
          the data related to the state will be permanently removed. This action cannot be undone.
        </>
      }
    />
  );
});
