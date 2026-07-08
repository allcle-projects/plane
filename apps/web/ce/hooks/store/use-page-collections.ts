/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Page Collections — mote.
// See docs/mote-design/02-wiki-publishing.md, Feature 4.

import { useContext } from "react";
// context
import { StoreContext } from "@/lib/store-context";
// mobx store
import type { IPageCollectionStore } from "@/plane-web/store/page-collection/page-collection.store";

export const usePageCollections = (): IPageCollectionStore => {
  const context = useContext(StoreContext);
  if (context === undefined) throw new Error("usePageCollections must be used within StoreProvider");
  return context.pageCollectionStore;
};
