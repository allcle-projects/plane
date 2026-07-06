/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
// plane imports
import { Button } from "@plane/propel/button";
import { Input } from "@plane/propel/input";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { convertHoursMinutesToMinutes } from "@plane/utils";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";

type TWorklogEntryFormProps = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  onClose: () => void;
};

export function WorklogEntryForm(props: TWorklogEntryFormProps) {
  const { workspaceSlug, projectId, issueId, onClose } = props;
  // states
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [loggedAt, setLoggedAt] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // store hooks
  const { createWorklog } = useIssueDetail();

  const handleSubmit = async () => {
    const duration = convertHoursMinutesToMinutes(Number(hours) || 0, Number(minutes) || 0);
    if (duration <= 0) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: "Please enter a duration greater than zero.",
      });
      return;
    }
    setIsSubmitting(true);
    try {
      await createWorklog(workspaceSlug, projectId, issueId, {
        duration,
        description: description.trim(),
        ...(loggedAt ? { logged_at: new Date(loggedAt).toISOString() } : {}),
      });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: "Time logged successfully.",
      });
      onClose();
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: "Time could not be logged. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min={0}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder="0"
            className="w-14"
            inputSize="xs"
          />
          <span className="text-caption-sm-regular text-tertiary">h</span>
        </div>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min={0}
            max={59}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            placeholder="0"
            className="w-14"
            inputSize="xs"
          />
          <span className="text-caption-sm-regular text-tertiary">m</span>
        </div>
      </div>
      <Input
        type="date"
        value={loggedAt}
        onChange={(e) => setLoggedAt(e.target.value)}
        className="w-full"
        inputSize="xs"
      />
      <Input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        className="w-full"
        inputSize="xs"
      />
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={handleSubmit} loading={isSubmitting}>
          Log time
        </Button>
      </div>
    </div>
  );
}
