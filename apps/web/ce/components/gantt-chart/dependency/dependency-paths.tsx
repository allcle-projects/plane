/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { EIssueServiceType } from "@plane/types";
import { BLOCK_HEIGHT } from "@/components/gantt-chart/constants";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useTimeLineChartStore } from "@/hooks/use-timeline-chart";

type Props = {
  isEpic?: boolean;
};

// horizontal distance (px) the path travels before it is allowed to turn towards the target row
const BEND_OFFSET = 20;
// radius (px) used to round off the elbow corners
const CORNER_RADIUS = 6;

/**
 * builds an elbow-shaped (Manhattan style) path between a predecessor's end
 * and a successor's start, regardless of their relative row/column position.
 */
function getDependencyPath(x1: number, y1: number, x2: number, y2: number): string {
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

export const TimelineDependencyPaths = observer(function TimelineDependencyPaths(props: Props) {
  const { isEpic = false } = props;
  // store hooks
  const { blockIds, getBlockById } = useTimeLineChartStore();
  const {
    relation: { getRelationByIssueIdRelationType },
  } = useIssueDetail(isEpic ? EIssueServiceType.EPICS : EIssueServiceType.ISSUES);

  if (!blockIds || blockIds.length === 0) return <></>;

  const blockIndexById = new Map(blockIds.map((blockId, index) => [blockId, index]));

  const paths: { key: string; d: string }[] = [];

  for (const predecessorId of blockIds) {
    const predecessorBlock = getBlockById(predecessorId);
    const predecessorIndex = blockIndexById.get(predecessorId);
    if (!predecessorBlock?.position || predecessorIndex === undefined) continue;

    const successorIds = getRelationByIssueIdRelationType(predecessorId, "blocking");
    if (!successorIds || successorIds.length === 0) continue;

    const x1 = predecessorBlock.position.marginLeft + predecessorBlock.position.width;
    const y1 = predecessorIndex * BLOCK_HEIGHT + BLOCK_HEIGHT / 2;

    for (const successorId of successorIds) {
      const successorBlock = getBlockById(successorId);
      const successorIndex = blockIndexById.get(successorId);
      // skip if the successor isn't currently loaded/visible on the chart
      if (!successorBlock?.position || successorIndex === undefined) continue;

      const x2 = successorBlock.position.marginLeft;
      const y2 = successorIndex * BLOCK_HEIGHT + BLOCK_HEIGHT / 2;

      paths.push({
        key: `${predecessorId}-${successorId}`,
        d: getDependencyPath(x1, y1, x2, y2),
      });
    }
  }

  if (paths.length === 0) return <></>;

  return (
    <svg className="pointer-events-none absolute top-0 left-0 h-full w-full overflow-visible">
      <defs>
        <marker
          id="gantt-dependency-arrow-head"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 Z" className="fill-current text-tertiary" />
        </marker>
      </defs>
      {paths.map((path) => (
        <path
          key={path.key}
          d={path.d}
          className="stroke-current text-tertiary"
          strokeWidth={1.5}
          fill="none"
          markerEnd="url(#gantt-dependency-arrow-head)"
        />
      ))}
    </svg>
  );
});
