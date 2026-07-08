/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Milestones — mote (Phase 2).
// See docs/mote-design/04-planning-hierarchy.md, section 2.

import { useContext } from "react";
// context
import { StoreContext } from "@/lib/store-context";
// mobx store
import type { IMilestoneStore } from "@/plane-web/store/milestone/milestone.store";

export const useMilestones = (): IMilestoneStore => {
  const context = useContext(StoreContext);
  if (context === undefined) throw new Error("useMilestones must be used within StoreProvider");
  return context.milestoneStore;
};
