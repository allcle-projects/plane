/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Teamspaces — mote.
// See docs/mote-design/05-teamspaces-access.md, section 1.

import { useContext } from "react";
// context
import { StoreContext } from "@/lib/store-context";
// mobx store
import type { ITeamspaceStore } from "@/plane-web/store/teamspace/teamspace.store";

export const useTeamspaces = (): ITeamspaceStore => {
  const context = useContext(StoreContext);
  if (context === undefined) throw new Error("useTeamspaces must be used within StoreProvider");
  return context.teamspaceStore;
};
