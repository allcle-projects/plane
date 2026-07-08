/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Updates — mote.
// See docs/mote-design/04-planning-hierarchy.md, section 4.
//
// One timeline entry: health badge, author, relative timestamp, completion and
// the plain-text ``description`` (whitespace-pre-wrap). Delete is always shown;
// the backend enforces author/admin permission.

import { Trash2 } from "lucide-react";
// plane imports
import { Avatar } from "@plane/ui";
import { getFileURL, renderFormattedDate } from "@plane/utils";
// hooks
import { useMember } from "@/hooks/store/use-member";
// plane web imports
import type { TEntityUpdate } from "@/plane-web/types/updates";
// local imports
import { UpdateHealthBadge } from "./helper";

type TUpdateCardProps = {
  update: TEntityUpdate;
  onDelete: (updateId: string) => void;
};

export function UpdateCard({ update, onDelete }: TUpdateCardProps) {
  const { getUserDetails } = useMember();
  const author = update.created_by ? getUserDetails(update.created_by) : undefined;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-subtle bg-surface-1 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <UpdateHealthBadge status={update.status} />
          {author && (
            <span className="flex items-center gap-1.5 text-xs text-secondary">
              <Avatar name={author.display_name} src={getFileURL(author.avatar_url ?? "")} size="sm" />
              {author.display_name}
            </span>
          )}
          {update.created_at && (
            <span className="text-xs text-tertiary">{renderFormattedDate(update.created_at)}</span>
          )}
          {update.completed_percentage > 0 && (
            <span className="text-xs text-tertiary">{update.completed_percentage}% complete</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => onDelete(update.id)}
          className="text-tertiary hover:text-red-500"
          aria-label="Delete update"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      {update.description && (
        <p className="whitespace-pre-wrap text-sm text-primary">{update.description}</p>
      )}
    </div>
  );
}
