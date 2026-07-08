/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Project States — mote (Phase 2).
// See docs/mote-design/04-planning-hierarchy.md, section 3.

import { useContext } from "react";
// context
import { StoreContext } from "@/lib/store-context";
// mobx store
import type { IWorkspaceProjectStateStore } from "@/plane-web/store/workspace-project-state/project-state.store";

export const useWorkspaceProjectStates = (): IWorkspaceProjectStateStore => {
  const context = useContext(StoreContext);
  if (context === undefined) throw new Error("useWorkspaceProjectStates must be used within StoreProvider");
  return context.workspaceProjectStateStore;
};
