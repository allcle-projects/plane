/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { PointerEvent as ReactPointerEvent } from "react";
import { EIssueServiceType } from "@plane/types";
import type { IGanttBlock } from "@plane/types";
import { BLOCK_HEIGHT } from "@/components/gantt-chart/constants";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useTimeLineChartStore } from "@/hooks/use-timeline-chart";
import type { TDependencyDragSide } from "@/plane-web/store/timeline/base-timeline.store";
import type { TIssueRelationTypes } from "@/plane-web/types";

/**
 * Shared pointer logic for the left/right dependency grab handles.
 *
 * Owns the whole drag lifecycle from a single pointer capture on the handle:
 * pointer-down starts the drag, pointer-move translates the cursor into chart-content
 * coordinates + hit-tests a drop target, and pointer-up creates the relation optimistically
 * via the existing issue-detail relation store (`createCurrentRelation`).
 */
export function useDependencyDraggable(block: IGanttBlock, side: TDependencyDragSide) {
  const { blockIds, getBlockById, startDependencyDrag, updateDependencyDrag, endDependencyDrag } =
    useTimeLineChartStore();
  const {
    relation: { createCurrentRelation, getRelationByIssueIdRelationType },
  } = useIssueDetail(EIssueServiceType.ISSUES);

  /**
   * bounding rect of the chart-content div (the positioned ancestor that also hosts the SVG
   * dependency layers). Read live off the DOM so it stays correct across horizontal/vertical
   * scroll and resize — never cache screen coordinates.
   */
  const getContentRect = (): DOMRect | null => {
    const blockEl = document.getElementById(`gantt-block-${block.id}`);
    const contentEl = blockEl?.offsetParent as HTMLElement | null;
    return contentEl?.getBoundingClientRect() ?? null;
  };

  /** find a valid drop target block at the given chart-content coordinates */
  const hitTest = (chartX: number, chartY: number): string | null => {
    if (!blockIds) return null;

    const rowIndex = Math.floor(chartY / BLOCK_HEIGHT);
    if (rowIndex < 0 || rowIndex >= blockIds.length) return null;

    const targetId = blockIds[rowIndex];
    // reject self-drops
    if (!targetId || targetId === block.id) return null;

    const targetBlock = getBlockById(targetId);
    if (!targetBlock?.position) return null;

    // require the cursor to sit within the target block's horizontal extent
    const { marginLeft, width } = targetBlock.position;
    if (chartX < marginLeft || chartX > marginLeft + width) return null;

    return targetId;
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // only respond to primary button / touch / pen
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const handleEl = e.currentTarget;
    const pointerId = e.pointerId;
    // capture so every subsequent pointer event is delivered to the handle regardless of
    // what block sits under the cursor
    handleEl.setPointerCapture(pointerId);
    startDependencyDrag(block.id, side);

    // function declarations (hoisted) so the mutually-referencing handlers can be
    // registered/removed without use-before-define concerns
    function resolveTarget(clientX: number, clientY: number): string | null {
      const rect = getContentRect();
      if (!rect) return null;
      return hitTest(clientX - rect.left, clientY - rect.top);
    }

    function cleanup() {
      handleEl.removeEventListener("pointermove", onMove);
      handleEl.removeEventListener("pointerup", onUp);
      handleEl.removeEventListener("pointercancel", onCancel);
      if (handleEl.hasPointerCapture(pointerId)) handleEl.releasePointerCapture(pointerId);
    }

    function onMove(ev: PointerEvent) {
      const rect = getContentRect();
      if (!rect) return;
      const chartX = ev.clientX - rect.left;
      const chartY = ev.clientY - rect.top;
      updateDependencyDrag({ x: chartX, y: chartY }, hitTest(chartX, chartY));
    }

    function onUp(ev: PointerEvent) {
      cleanup();
      const targetId = resolveTarget(ev.clientX, ev.clientY);
      if (targetId) {
        // right handle => source blocks target; left handle => source is blocked_by target
        const relationType: TIssueRelationTypes = side === "right" ? "blocking" : "blocked_by";
        const existing = getRelationByIssueIdRelationType(block.id, relationType);
        // skip obvious duplicates for UX (endpoint also ignores conflicts)
        if (!existing?.includes(targetId)) {
          void createCurrentRelation(block.id, relationType, targetId).catch(() => {
            // createCurrentRelation already rolls back its optimistic update on failure
          });
        }
      }
      endDependencyDrag();
    }

    function onCancel() {
      cleanup();
      endDependencyDrag();
    }

    handleEl.addEventListener("pointermove", onMove);
    handleEl.addEventListener("pointerup", onUp);
    handleEl.addEventListener("pointercancel", onCancel);
  };

  return { onPointerDown };
}
