/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { BLOCK_HEIGHT } from "@/components/gantt-chart/constants";
import { useTimeLineChartStore } from "@/hooks/use-timeline-chart";
import { getDependencyPath } from "./get-dependency-path";

// vertical inset so the drop-target highlight hugs the block bar (32px) rather than the full row
const TARGET_HIGHLIGHT_HEIGHT = 32;

/**
 * live preview drawn while a dependency is being dragged from a block edge handle.
 * Renders a dashed elbow from the source anchor to the current cursor (reusing the same
 * `getDependencyPath` builder as the finished arrows so preview and final arrow line up),
 * plus a highlight around the currently hit-tested drop target.
 */
export const TimelineDraggablePath = observer(function TimelineDraggablePath() {
  const { blockIds, getBlockById, dependencyDrag } = useTimeLineChartStore();

  if (!dependencyDrag || !blockIds || blockIds.length === 0) return <></>;

  const { sourceBlockId, sourceSide, pointer, hoverTargetId } = dependencyDrag;

  const sourceIndex = blockIds.indexOf(sourceBlockId);
  const sourceBlock = getBlockById(sourceBlockId);
  if (sourceIndex < 0 || !sourceBlock?.position) return <></>;

  // anchor on the source block: right edge for a predecessor(blocking) drag, left edge otherwise —
  // matches the anchors used by dependency-paths.tsx
  const x1 =
    sourceSide === "right"
      ? sourceBlock.position.marginLeft + sourceBlock.position.width
      : sourceBlock.position.marginLeft;
  const y1 = sourceIndex * BLOCK_HEIGHT + BLOCK_HEIGHT / 2;

  const d = getDependencyPath(x1, y1, pointer.x, pointer.y);

  // highlight rect around the drop target, if any
  let targetHighlight: React.ReactNode = null;
  if (hoverTargetId) {
    const targetIndex = blockIds.indexOf(hoverTargetId);
    const targetBlock = getBlockById(hoverTargetId);
    if (targetIndex >= 0 && targetBlock?.position) {
      targetHighlight = (
        <rect
          x={targetBlock.position.marginLeft}
          y={targetIndex * BLOCK_HEIGHT + (BLOCK_HEIGHT - TARGET_HIGHLIGHT_HEIGHT) / 2}
          width={targetBlock.position.width}
          height={TARGET_HIGHLIGHT_HEIGHT}
          rx={4}
          className="fill-none stroke-current text-primary"
          strokeWidth={1.5}
        />
      );
    }
  }

  return (
    <svg className="pointer-events-none absolute top-0 left-0 h-full w-full overflow-visible">
      <defs>
        <marker
          id="gantt-dependency-drag-arrow-head"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 Z" className="fill-current text-primary" />
        </marker>
      </defs>
      {targetHighlight}
      <path
        d={d}
        className="stroke-current text-primary"
        strokeWidth={1.5}
        strokeDasharray="4 4"
        fill="none"
        markerEnd="url(#gantt-dependency-drag-arrow-head)"
      />
    </svg>
  );
});
