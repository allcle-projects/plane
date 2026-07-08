/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Page Collections — mote.
// See docs/mote-design/02-wiki-publishing.md, Feature 4.
//
// Frontend mirror of the backend ``PageCollection`` model. A collection is a
// named, ordered bundle of workspace pages (bookmark folder style), scoped to
// a workspace. Field names match the serializer EXACTLY.

import type { TLogoProps } from "@plane/types";

export type TPageCollection = {
  id: string;
  name: string;
  owned_by: string;
  logo_props: TLogoProps | undefined;
  sort_order: number;
  is_shared: boolean;
  page_ids: string[];
  // Workspace scope fields.
  workspace: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
};

export type TPageCollectionCreatePayload = Partial<
  Pick<TPageCollection, "name" | "logo_props" | "sort_order" | "is_shared" | "page_ids">
>;

export type TPageCollectionUpdatePayload = Partial<
  Pick<TPageCollection, "name" | "logo_props" | "sort_order" | "is_shared">
>;
