/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Project States — mote (Phase 2).
// See docs/mote-design/04-planning-hierarchy.md, section 3.
//
// Settings editor root for workspace project states. Fetches the states on
// mount, renders them ordered by sequence, and exposes an inline "Add state"
// create form plus per-row edit/delete. Mirrors the issue-state editor root
// (core/components/project-states/root.tsx). Drag-and-drop reordering is a v2
// follow-up.

import { useState } from "react";
import { observer } from "mobx-react";
import { Plus } from "lucide-react";
import useSWR from "swr";
// plane imports
import { Button } from "@plane/propel/button";
import { Loader } from "@plane/ui";
// plane web hooks
import { useWorkspaceProjectStates } from "@/plane-web/hooks/store/use-workspace-project-states";
// plane web types
import type { TProjectState } from "@/plane-web/types/workspace-project-states";
// local imports
import { ProjectStateForm } from "./project-state-form";
import { ProjectStateItem } from "./project-state-item";

type TProjectStateRoot = {
  workspaceSlug: string;
  isEditable: boolean;
};

export const WorkspaceProjectStateRoot = observer(function WorkspaceProjectStateRoot(props: TProjectStateRoot) {
  const { workspaceSlug, isEditable } = props;
  // states
  const [isCreating, setIsCreating] = useState(false);
  // store
  const { getProjectStatesForWorkspace, fetchedMap, fetchProjectStates, createProjectState } =
    useWorkspaceProjectStates();

  // fetch project states
  useSWR(
    workspaceSlug ? `WORKSPACE_PROJECT_STATES_${workspaceSlug}` : null,
    workspaceSlug ? () => fetchProjectStates(workspaceSlug) : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  const states = getProjectStatesForWorkspace(workspaceSlug);
  const isFetched = !!fetchedMap?.[workspaceSlug];

  const handleCreate = async (formData: Partial<TProjectState>) => {
    await createProjectState(workspaceSlug, formData);
    setIsCreating(false);
  };

  if (!isFetched)
    return (
      <Loader className="space-y-3">
        <Loader.Item height="52px" />
        <Loader.Item height="52px" />
        <Loader.Item height="52px" />
      </Loader>
    );

  return (
    <div className="space-y-3">
      {states.map((state) => (
        <ProjectStateItem key={state.id} workspaceSlug={workspaceSlug} state={state} isEditable={isEditable} />
      ))}

      {isEditable && isCreating && (
        <ProjectStateForm
          data={{ group: "backlog", color: "#60646C" }}
          onSubmit={handleCreate}
          onCancel={() => setIsCreating(false)}
          buttonDisabled={false}
          buttonTitle="Create"
        />
      )}

      {isEditable && !isCreating && (
        <Button variant="secondary" size="lg" prependIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setIsCreating(true)}>
          Add state
        </Button>
      )}
    </div>
  );
});
