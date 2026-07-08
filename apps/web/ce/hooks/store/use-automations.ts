/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Automations rule engine — mote.
// See docs/mote-design/06-integrations-importers-automations.md, Feature 3.

import { useContext } from "react";
// context
import { StoreContext } from "@/lib/store-context";
// mobx store
import type { IAutomationStore } from "@/plane-web/store/automation/automation.store";

export const useAutomations = (): IAutomationStore => {
  const context = useContext(StoreContext);
  if (context === undefined) throw new Error("useAutomations must be used within StoreProvider");
  return context.automationStore;
};
