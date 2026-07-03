/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { EIssuesStoreType } from "@plane/types";
import { Button } from "@plane/propel/button";
import { ArchiveIcon, CloseIcon, TrashIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { AlertModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
// hooks
import { useMultipleSelectStore } from "@/hooks/store/use-multiple-select-store";
import { useIssues } from "@/hooks/store/use-issues";
import { useIssueStoreType } from "@/hooks/use-issue-layout-store";
import type { TSelectionHelper } from "@/hooks/use-multiple-select";

type Props = {
  className?: string;
  selectionHelpers: TSelectionHelper;
};

// bulk archive/delete act on a single project's issues, so only store types that are
// scoped to a project route (which always has a `projectId` param) are supported here.
const BULK_OPERATIONS_SUPPORTED_STORE_TYPES = [
  EIssuesStoreType.PROJECT,
  EIssuesStoreType.CYCLE,
  EIssuesStoreType.MODULE,
  EIssuesStoreType.PROJECT_VIEW,
] as const;

type TBulkOperationsStoreType = (typeof BULK_OPERATIONS_SUPPORTED_STORE_TYPES)[number];

const isBulkOperationsSupportedStoreType = (storeType: EIssuesStoreType): storeType is TBulkOperationsStoreType =>
  (BULK_OPERATIONS_SUPPORTED_STORE_TYPES as readonly EIssuesStoreType[]).includes(storeType);

export const IssueBulkOperationsRoot = observer(function IssueBulkOperationsRoot(props: Props) {
  const { className, selectionHelpers } = props;
  // states
  const [isArchiving, setIsArchiving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  // router params
  const { workspaceSlug, projectId } = useParams();
  // store hooks
  const { isSelectionActive, selectedEntityIds, clearSelection } = useMultipleSelectStore();
  const storeType = useIssueStoreType();
  const isSupportedStoreType = isBulkOperationsSupportedStoreType(storeType);
  const {
    issues: { removeBulkIssues, archiveBulkIssues },
  } = useIssues(isBulkOperationsSupportedStoreType(storeType) ? storeType : EIssuesStoreType.PROJECT);

  if (!isSelectionActive || selectionHelpers.isSelectionDisabled) return null;
  // bulk archive/delete requires a single project in scope, which isn't available for
  // workspace-level views (e.g. All Issues) or unsupported store types.
  if (!isSupportedStoreType || !workspaceSlug || !projectId) return null;

  const handleArchive = async () => {
    setIsArchiving(true);
    try {
      await archiveBulkIssues(workspaceSlug, projectId, selectedEntityIds);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: "Work items archived successfully.",
      });
      clearSelection();
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: "Something went wrong. Please try again.",
      });
    } finally {
      setIsArchiving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await removeBulkIssues(workspaceSlug, projectId, selectedEntityIds);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: "Work items deleted successfully.",
      });
      clearSelection();
      setIsDeleteModalOpen(false);
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: "Something went wrong. Please try again.",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <AlertModalCore
        isOpen={isDeleteModalOpen}
        handleClose={() => setIsDeleteModalOpen(false)}
        handleSubmit={handleDelete}
        isSubmitting={isDeleting}
        title="Delete work items"
        content={`Are you sure you want to delete ${selectedEntityIds.length} selected work item${
          selectedEntityIds.length > 1 ? "s" : ""
        }? This action cannot be undone.`}
      />
      <div className={cn("sticky bottom-0 left-0 z-[2] grid h-20 place-items-center px-3.5", className)}>
        <div className="flex h-14 w-full items-center justify-between gap-2 rounded-md border-[0.5px] border-subtle bg-surface-2 px-3.5 py-4 shadow-raised-100">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => selectionHelpers.handleClearSelection()}
              className="grid place-items-center rounded-sm p-1 text-secondary hover:bg-layer-1"
            >
              <CloseIcon className="size-3.5" />
            </button>
            <span className="text-13 font-medium text-primary">{selectedEntityIds.length} selected</span>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              prependIcon={<ArchiveIcon className="size-3.5" />}
              onClick={handleArchive}
              loading={isArchiving}
            >
              {isArchiving ? "Archiving..." : "Archive"}
            </Button>
            <Button
              variant="error-fill"
              size="sm"
              prependIcon={<TrashIcon className="size-3.5" />}
              onClick={() => setIsDeleteModalOpen(true)}
            >
              Delete
            </Button>
          </div>
        </div>
      </div>
    </>
  );
});
