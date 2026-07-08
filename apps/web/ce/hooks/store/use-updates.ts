/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Updates — mote.
// See docs/mote-design/04-planning-hierarchy.md, section 4.

import { useContext } from "react";
// context
import { StoreContext } from "@/lib/store-context";
// mobx store
import type { IUpdateStore } from "@/plane-web/store/update/update.store";

export const useUpdates = (): IUpdateStore => {
  const context = useContext(StoreContext);
  if (context === undefined) throw new Error("useUpdates must be used within StoreProvider");
  return context.updateStore;
};
