/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssueActivityUserDetail } from "./activity/base";

export type TIssueWorklog = {
  id: string;
  issue: string;
  project: string;
  workspace: string;
  logged_by: string;
  logged_by_detail?: TIssueActivityUserDetail;
  duration: number; // canonical unit: minutes
  description: string;
  logged_at: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type TIssueWorklogMap = {
  [worklog_id: string]: TIssueWorklog;
};

export type TIssueWorklogIdMap = {
  [issue_id: string]: string[];
};

export type TIssueTimer = {
  id: string;
  issue: string;
  project: string;
  workspace: string;
  user: string;
  started_at: string;
  is_running: boolean;
};

export type TIssueTimerMap = {
  [issue_id: string]: TIssueTimer | undefined;
};

export type TWorklogSummary = {
  total_duration: number;
  by_user: { logged_by_id: string; duration: number }[];
  by_issue: { issue_id: string; duration: number }[];
};
