/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Templates (work item + project templates) — mote.
// See docs/mote-design/03-work-item-power.md, section 2.

import { useContext } from "react";
// context
import { StoreContext } from "@/lib/store-context";
// mobx store
import type { ITemplateStore } from "@/plane-web/store/templates/template.store";

export const useTemplates = (): ITemplateStore => {
  const context = useContext(StoreContext);
  if (context === undefined) throw new Error("useTemplates must be used within StoreProvider");
  return context.templateStore;
};
