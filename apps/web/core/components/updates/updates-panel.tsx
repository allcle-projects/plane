/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Updates — mote.
// See docs/mote-design/04-planning-hierarchy.md, section 4.
//
// The one reusable Updates surface, wired into the project overview, cycle
// sidebar and initiative detail. Derives the store key from the parent entity,
// fetches on mount via SWR, and renders the composer + reverse-chronological
// timeline (the API already orders ``-created_at``).

import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Loader } from "@plane/ui";
// plane web imports
import { useUpdates } from "@/plane-web/hooks/store/use-updates";
import type { TUpdateEntityType, TUpdateFormData } from "@/plane-web/types/updates";
import type { TUpdatePathParams } from "@/services/update.service";
// local imports
import { UpdateCard } from "./update-card";
import { UpdateComposer } from "./update-composer";

type TUpdatesPanelProps = {
  entityType: TUpdateEntityType;
  workspaceSlug: string;
  projectId?: string;
  cycleId?: string;
  initiativeId?: string;
};

export const UpdatesPanel = observer(function UpdatesPanel(props: TUpdatesPanelProps) {
  const { entityType, workspaceSlug, projectId, cycleId, initiativeId } = props;
  // store hooks
  const { getUpdatesByKey, getIsLoading, fetchUpdates, createUpdate, deleteUpdate } = useUpdates();

  // leaf id for the parent entity
  const entityId =
    entityType === "project" ? projectId : entityType === "cycle" ? cycleId : initiativeId;
  const storeKey = `${entityType}:${entityId ?? ""}`;
  const params: TUpdatePathParams = { entityType, projectId, cycleId, initiativeId };

  const canFetch = Boolean(workspaceSlug && entityId);

  useSWR(
    canFetch ? `UPDATES_${workspaceSlug}_${storeKey}` : null,
    canFetch ? () => fetchUpdates(workspaceSlug, storeKey, params) : null,
    { revalidateOnFocus: false }
  );

  const updates = getUpdatesByKey(storeKey);
  const isLoading = getIsLoading(storeKey);

  const handleCreate = async (data: TUpdateFormData) => {
    await createUpdate(workspaceSlug, storeKey, params, data);
  };

  const handleDelete = async (updateId: string) => {
    try {
      await deleteUpdate(workspaceSlug, storeKey, params, updateId);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: "Update deleted." });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Could not delete the update." });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-medium text-primary">Updates</h3>

      <UpdateComposer onSubmit={handleCreate} />

      {isLoading && updates.length === 0 ? (
        <Loader className="flex flex-col gap-3">
          <Loader.Item height="80px" />
          <Loader.Item height="80px" />
        </Loader>
      ) : updates.length === 0 ? (
        <div className="rounded-lg border border-subtle px-4 py-8 text-center text-sm text-tertiary">
          No updates yet — post the first status.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {updates.map((update) => (
            <UpdateCard key={update.id} update={update} onDelete={(id) => void handleDelete(id)} />
          ))}
        </div>
      )}
    </div>
  );
});
