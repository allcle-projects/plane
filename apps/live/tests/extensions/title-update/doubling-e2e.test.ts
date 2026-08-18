/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, it, expect } from "vitest";
import * as Y from "yjs";
import { extractTitleFromFragmentHTML } from "@/extensions/title-update/title-utils";

/** Builds a Y.Doc whose "title" fragment holds one heading, as the editor does. */
const makeTitleDoc = (text: string): Y.Doc => {
  const doc = new Y.Doc();
  const heading = new Y.XmlElement("heading");
  heading.insert(0, [new Y.XmlText(text)]);
  doc.getXmlFragment("title").insert(0, [heading]);
  return doc;
};

describe("title doubling (end-to-end over real Y.Doc)", () => {
  it("survives repeated additive merges without growing the persisted title", () => {
    const original = "[Screen Spec] Mission 도메인 화면 기획서 (2026-07-07)";
    let persistedName = original;

    // Replay the load -> merge -> flatten -> persist cycle that grew two real
    // pages to 78MB and 99MB (3 x 2^20 repetitions of their titles).
    for (let cycle = 0; cycle < 21; cycle++) {
      const doc = makeTitleDoc(persistedName);
      // A second title heading gets merged in additively (Y.applyUpdate).
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(makeTitleDoc(persistedName)));

      persistedName = extractTitleFromFragmentHTML(doc.getXmlFragment("title").toJSON());
    }

    expect(persistedName).toBe(original);
    expect(persistedName.length).toBeLessThanOrEqual(255);
  });
});
