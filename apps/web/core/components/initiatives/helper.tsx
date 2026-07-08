/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Initiatives — mote.
// See docs/mote-design/04-planning-hierarchy.md, section 1.
//
// Shared status vocabulary + badge styling. The backend ``Initiative.status`` is
// a free-form CharField (default "planned"); these are the curated options the
// editor offers and the colors the badge renders.

import { cn } from "@plane/utils";
import type { TInitiativeStatus } from "@/plane-web/types/initiatives";

export const INITIATIVE_STATUS_OPTIONS: { value: TInitiativeStatus; label: string }[] = [
  { value: "planned", label: "Planned" },
  { value: "active", label: "Active" },
  { value: "on-hold", label: "On hold" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_BADGE_CLASSES: Record<string, string> = {
  planned: "bg-surface-3 text-secondary",
  active: "bg-blue-500/10 text-blue-500",
  "on-hold": "bg-amber-500/10 text-amber-500",
  completed: "bg-green-500/10 text-green-500",
  cancelled: "bg-red-500/10 text-red-500",
};

export function getInitiativeStatusLabel(status: TInitiativeStatus): string {
  return INITIATIVE_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

type TStatusBadgeProps = {
  status: TInitiativeStatus;
  className?: string;
};

export function InitiativeStatusBadge({ status, className }: TStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex flex-shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
        STATUS_BADGE_CLASSES[status] ?? "bg-surface-3 text-secondary",
        className
      )}
    >
      {getInitiativeStatusLabel(status)}
    </span>
  );
}
