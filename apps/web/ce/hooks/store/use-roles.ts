/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Custom RBAC — mote.
// See docs/mote-design/05-teamspaces-access.md, section 2.

import { useContext } from "react";
// context
import { StoreContext } from "@/lib/store-context";
// mobx store
import type { IRoleStore } from "@/plane-web/store/role/role.store";

export const useRoles = (): IRoleStore => {
  const context = useContext(StoreContext);
  if (context === undefined) throw new Error("useRoles must be used within StoreProvider");
  return context.roleStore;
};
