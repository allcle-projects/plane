/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { RefObject } from "react";
import { observer } from "mobx-react";
import type { IGanttBlock } from "@plane/types";
import { useDependencyDraggable } from "./use-dependency-draggable";

type RightDependencyDraggableProps = {
  block: IGanttBlock;
  ganttContainerRef: RefObject<HTMLDivElement>;
};

export const RightDependencyDraggable = observer(function RightDependencyDraggable(
  props: RightDependencyDraggableProps
) {
  const { block } = props;
  const { onPointerDown } = useDependencyDraggable(block, "right");

  return (
    <div
      onPointerDown={onPointerDown}
      className="absolute top-1/2 -right-4 z-[7] h-3 w-3 -translate-y-1/2 cursor-crosshair touch-none rounded-full border border-subtle bg-surface-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
    />
  );
});
