/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Clock } from "lucide-react";
// plane imports
import type { TIssueActivityComment } from "@plane/types";
import { convertMinutesToHoursMinutesString } from "@plane/utils";
// components
import { IssueActivityBlockComponent } from "@/components/issues/issue-detail/issue-activity/activity/actions";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";

type TIssueActivityWorklog = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  activityComment: TIssueActivityComment;
  ends?: "top" | "bottom";
};

const formatDuration = (value: string | undefined) => {
  const minutes = Number(value) || 0;
  return convertMinutesToHoursMinutesString(minutes).trim() || "0m";
};

export const IssueActivityWorklog = observer(function IssueActivityWorklog(props: TIssueActivityWorklog) {
  const { activityComment, ends } = props;
  // store hooks
  const {
    activity: { getActivityById },
  } = useIssueDetail();

  const activity = getActivityById(activityComment.id);
  if (!activity) return <></>;

  return (
    <IssueActivityBlockComponent
      icon={<Clock size={14} className="text-secondary" aria-hidden="true" />}
      activityId={activityComment.id}
      ends={ends}
    >
      <>
        {activity.verb === "created" ? (
          <span>
            logged <span className="font-medium text-primary">{formatDuration(activity.new_value)}</span>
          </span>
        ) : activity.verb === "updated" ? (
          <span>
            updated logged time to{" "}
            <span className="font-medium text-primary">{formatDuration(activity.new_value)}</span>
          </span>
        ) : (
          <span>
            removed <span className="font-medium text-primary">{formatDuration(activity.old_value)}</span> of logged time
          </span>
        )}
      </>
    </IssueActivityBlockComponent>
  );
});
