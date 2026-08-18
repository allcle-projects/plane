/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, it, expect } from "vitest";
import {
  MAX_PAGE_TITLE_LENGTH,
  extractTextFromHTML,
  extractTitleFromFragmentHTML,
} from "@/extensions/title-update/title-utils";

describe("title-utils", () => {
  describe("extractTitleFromFragmentHTML", () => {
    it("extracts the text of a single heading", () => {
      expect(extractTitleFromFragmentHTML("<h1>My page</h1>")).toBe("My page");
    });

    it("reads only the first heading when the fragment holds duplicates", () => {
      // Regression: an additive Y.applyUpdate merge can leave two heading nodes in
      // the title fragment. Flattening both persisted `title + title` to pages.name.
      const doubled = "<h1>My page</h1><h1>My page</h1>";

      expect(extractTitleFromFragmentHTML(doubled)).toBe("My page");
    });

    it("stays idempotent no matter how many duplicate headings accumulated", () => {
      const title = "개발2팀 Plane 룰 — 현재 정본 (2026-06-19)";
      const many = `<h1>${title}</h1>`.repeat(64);

      expect(extractTitleFromFragmentHTML(many)).toBe(title);
    });

    it("does not grow when its own output is fed back in as a title", () => {
      // Models the load -> extract -> persist -> regenerate cycle that produced the
      // observed powers-of-two growth (3 x 2^20 repetitions, 99MB).
      let name = "Screen Spec";

      for (let i = 0; i < 25; i++) {
        // Regeneration embeds the current name as a heading, and a stray merge adds
        // a second copy of it to the same fragment.
        const fragment = `<h1>${name}</h1><h1>${name}</h1>`;
        name = extractTitleFromFragmentHTML(fragment);
      }

      expect(name).toBe("Screen Spec");
    });

    it("handles headings of any level", () => {
      expect(extractTitleFromFragmentHTML('<h2 class="x">Nested</h2><h2>Nested</h2>')).toBe("Nested");
    });

    it("handles the <heading> node name that Y.XmlFragment.toJSON() emits", () => {
      // Y serializes the title node under its Yjs node name, not as <h1>. Matching
      // only <h1>-<h6> would silently fall through to flattening the whole fragment.
      expect(extractTitleFromFragmentHTML("<heading>My page</heading><heading>My page</heading>")).toBe("My page");
    });

    it("falls back to the whole fragment when there is no heading node", () => {
      expect(extractTitleFromFragmentHTML("<p>Plain text</p>")).toBe("Plain text");
    });

    it("returns an empty string for an empty fragment", () => {
      expect(extractTitleFromFragmentHTML("")).toBe("");
      expect(extractTitleFromFragmentHTML("<h1></h1>")).toBe("");
    });

    it("caps the extracted title at MAX_PAGE_TITLE_LENGTH", () => {
      const long = "a".repeat(MAX_PAGE_TITLE_LENGTH + 500);

      expect(extractTitleFromFragmentHTML(`<h1>${long}</h1>`)).toHaveLength(MAX_PAGE_TITLE_LENGTH);
    });

    it("strips markup inside the heading", () => {
      expect(extractTitleFromFragmentHTML("<h1>Bold <strong>title</strong></h1>")).toBe("Bold title");
    });
  });

  describe("extractTextFromHTML", () => {
    it("still flattens the entire input, unchanged behaviour", () => {
      expect(extractTextFromHTML("<h1>a</h1><h1>b</h1>")).toBe("ab");
    });
  });
});
