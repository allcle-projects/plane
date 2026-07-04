/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// horizontal distance (px) the path travels before it is allowed to turn towards the target row
export const BEND_OFFSET = 20;
// radius (px) used to round off the elbow corners
export const CORNER_RADIUS = 6;

/**
 * builds an elbow-shaped (Manhattan style) path between a predecessor's end
 * and a successor's start, regardless of their relative row/column position.
 *
 * shared by the finished dependency arrows (`dependency-paths.tsx`) and the live
 * drag preview (`draggable-dependency-path.tsx`) so both line up exactly.
 */
export function getDependencyPath(x1: number, y1: number, x2: number, y2: number): string {
  if (y1 === y2) return `M${x1},${y1} L${x2},${y2}`;

  const bendX = x1 + BEND_OFFSET;
  const verticalSign = y2 > y1 ? 1 : -1;
  const radius = Math.min(CORNER_RADIUS, Math.abs(y2 - y1) / 2);

  return [
    `M${x1},${y1}`,
    `L${bendX - radius},${y1}`,
    `Q${bendX},${y1} ${bendX},${y1 + radius * verticalSign}`,
    `L${bendX},${y2 - radius * verticalSign}`,
    `Q${bendX},${y2} ${bendX + radius},${y2}`,
    `L${x2},${y2}`,
  ].join(" ");
}
