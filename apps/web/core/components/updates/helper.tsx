/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Updates — mote.
// See docs/mote-design/04-planning-hierarchy.md, section 4.
//
// Shared health vocabulary + self-contained badge for EntityUpdate status.
// Mirrors the initiative status badge (no external badge dependency).

import { cn } from "@plane/utils";
import type { TUpdateStatus } from "@/plane-web/types/updates";

export const UPDATE_STATUS_META: Record<TUpdateStatus, { label: string; badgeClassName: string }> = {
  "on-track": { label: "On track", badgeClassName: "bg-green-500/10 text-green-500" },
  "at-risk": { label: "At risk", badgeClassName: "bg-amber-500/10 text-amber-500" },
  "off-track": { label: "Off track", badgeClassName: "bg-red-500/10 text-red-500" },
};

export const UPDATE_STATUS_OPTIONS: { value: TUpdateStatus; label: string }[] = (
  Object.keys(UPDATE_STATUS_META) as TUpdateStatus[]
).map((value) => ({ value, label: UPDATE_STATUS_META[value].label }));

export function getUpdateStatusLabel(status: TUpdateStatus): string {
  return UPDATE_STATUS_META[status]?.label ?? status;
}

type TUpdateHealthBadgeProps = {
  status: TUpdateStatus;
  className?: string;
};

export function UpdateHealthBadge({ status, className }: TUpdateHealthBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex flex-shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium",
        UPDATE_STATUS_META[status]?.badgeClassName ?? "bg-surface-3 text-secondary",
        className
      )}
    >
      {getUpdateStatusLabel(status)}
    </span>
  );
}
