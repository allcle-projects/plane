/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Initiatives — mote.
// See docs/mote-design/04-planning-hierarchy.md, section 1.
//
// Rollup progress bar driven by the initiative ``progress_snapshot`` /
// analytics dict (completed_issues over total_issues).

import { cn } from "@plane/utils";
import type { TInitiativeProgressSnapshot } from "@/plane-web/types/initiatives";

type TProgressBarProps = {
  snapshot?: Partial<TInitiativeProgressSnapshot>;
  className?: string;
  showLabel?: boolean;
};

export function InitiativeProgressBar(props: TProgressBarProps) {
  const { snapshot, className, showLabel = true } = props;

  const total = snapshot?.total_issues ?? 0;
  const completed = snapshot?.completed_issues ?? 0;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${percentage}%` }} />
      </div>
      {showLabel && (
        <span className="flex-shrink-0 text-xs text-tertiary">
          {completed}/{total} ({percentage}%)
        </span>
      )}
    </div>
  );
}
