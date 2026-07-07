/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Recurring work items — mote.
// See docs/mote-design/03-work-item-power.md, section 3.

import { useContext } from "react";
// context
import { StoreContext } from "@/lib/store-context";
// mobx store
import type { IRecurringIssueStore } from "@/plane-web/store/recurring/recurring-issue.store";

export const useRecurringIssues = (): IRecurringIssueStore => {
  const context = useContext(StoreContext);
  if (context === undefined) throw new Error("useRecurringIssues must be used within StoreProvider");
  return context.recurringIssueStore;
};
