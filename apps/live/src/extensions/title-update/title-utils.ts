/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { sanitizeHTML } from "@plane/utils";

/**
 * Maximum length of a page title, mirroring the 255-char cap that every other
 * title column (issues, projects, cycles, modules) already enforces at the DB
 * level. `pages.name` is an unbounded TextField, so this is the only guard.
 */
export const MAX_PAGE_TITLE_LENGTH = 255;

/**
 * Utility function to extract text from HTML content
 */
export const extractTextFromHTML = (html: string): string => {
  // Use sanitizeHTML to safely extract text and remove all HTML tags
  // This is more secure than regex as it handles edge cases and prevents injection
  // Note: sanitizeHTML trims whitespace, which is acceptable for title extraction
  return sanitizeHTML(html) || "";
};

/**
 * Extracts the page title from a serialized title XmlFragment.
 *
 * The title fragment is expected to hold exactly one heading node. It can end up
 * holding more than one, because every write path into it merges additively
 * (`Y.applyUpdate`) and none of them replace: `getBinaryDataFromDocumentEditorHTMLString`
 * embeds a title heading when regenerating a document from HTML, and
 * `TitleSyncExtension.onLoadDocument` merges another one when it believes the
 * field is empty.
 *
 * Flattening the *whole* fragment in that state yields `title + title`, which is
 * then persisted to `pages.name` and used to seed the next regeneration — so the
 * title doubles on every document load, growing in exact powers of two. Two pages
 * reached 78MB and 99MB this way and stalled the workspace dashboard for every
 * user who had visited them.
 *
 * Reading only the first heading makes the extraction idempotent regardless of
 * how many duplicate nodes the fragment accumulated.
 */
export const extractTitleFromFragmentHTML = (html: string): string => {
  // Isolate the first heading node. Y.XmlFragment.toJSON() serializes the title
  // node under its Yjs node name (`<heading>`); `<h1>`-`<h6>` are accepted too so
  // the helper also holds for fragments produced by the HTML editor schema.
  const firstHeading = /<(heading|h[1-6])(?:\s[^>]*)?>([\s\S]*?)<\/\1>/i.exec(html);
  const source = firstHeading ? firstHeading[2] : html;

  return extractTextFromHTML(source).slice(0, MAX_PAGE_TITLE_LENGTH);
};
