/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Clock } from "lucide-react";
// plane imports
import { Popover } from "@plane/propel/popover";
// local imports
import { WorklogEntryForm } from "../form";

type TIssueActivityWorklogCreateButton = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
};

export function IssueActivityWorklogCreateButton(props: TIssueActivityWorklogCreateButton) {
  const { workspaceSlug, projectId, issueId, disabled } = props;
  // states
  const [isOpen, setIsOpen] = useState(false);

  if (disabled) return null;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Button
        className="flex items-center gap-1 rounded-md px-2 py-1 text-caption-sm-medium text-secondary outline-none hover:bg-layer-1"
        title="Log time"
      >
        <Clock className="size-3.5" />
        <span>Log time</span>
      </Popover.Button>
      <Popover.Panel side="bottom" align="end">
        <div className="w-64 rounded-lg border-[0.5px] border-strong bg-surface-1 p-3 shadow-raised-200">
          <WorklogEntryForm
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            issueId={issueId}
            onClose={() => setIsOpen(false)}
          />
        </div>
      </Popover.Panel>
    </Popover>
  );
}
