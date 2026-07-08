/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Initiatives — mote.
// See docs/mote-design/04-planning-hierarchy.md, section 1.

import { useContext } from "react";
// context
import { StoreContext } from "@/lib/store-context";
// mobx store
import type { IInitiativeStore } from "@/plane-web/store/initiative/initiative.store";

export const useInitiatives = (): IInitiativeStore => {
  const context = useContext(StoreContext);
  if (context === undefined) throw new Error("useInitiatives must be used within StoreProvider");
  return context.initiativeStore;
};
