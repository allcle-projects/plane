/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Custom Fields / Work Item Properties — mote (Phase 1).

import { useContext } from "react";
// context
import { StoreContext } from "@/lib/store-context";
// mobx store
import type { IWorkItemTypeStore } from "@/store/issue-types/work-item-type.store";

export const useWorkItemTypes = (): IWorkItemTypeStore => {
  const context = useContext(StoreContext);
  if (context === undefined) throw new Error("useWorkItemTypes must be used within StoreProvider");

  return context.workItemType;
};
