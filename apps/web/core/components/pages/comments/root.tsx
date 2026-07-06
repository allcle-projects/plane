/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
// components
import { CommentCreate } from "@/components/comments/comment-create";
import { CommentsWrapper } from "@/components/comments/comments";
// hooks
import { usePageComment } from "@/hooks/store/use-page-comment";
// plane web imports
import { PageNavigationPaneCommentsTabEmptyState } from "@/plane-web/components/pages/navigation-pane/tab-panels/empty-states/comments";
// store
import type { TPageInstance } from "@/store/pages/base-page";
// local imports
import { usePageCommentOperations } from "./use-page-comment-operations";

type Props = {
  page: TPageInstance;
};

export const PageCommentsRoot = observer(function PageCommentsRoot(props: Props) {
  const { page } = props;
  // navigation
  const { workspaceSlug: routerWorkspaceSlug } = useParams();
  const workspaceSlug = routerWorkspaceSlug?.toString();
  // derived values
  const pageId = page.id;
  const projectId = page.project_ids?.[0];
  const isEditingAllowed = page.canCurrentUserEditPage;
  // store hooks
  const { getCommentsByPageId, getCommentById, fetchComments } = usePageComment();
  // operations
  const activityOperations = usePageCommentOperations(workspaceSlug, pageId, projectId);
  // fetch comments
  useSWR(
    workspaceSlug && pageId ? `PAGE_COMMENTS_${workspaceSlug}_${pageId}` : null,
    workspaceSlug && pageId ? () => fetchComments(workspaceSlug, pageId) : null
  );
  // derived values
  const commentIds = pageId ? getCommentsByPageId(pageId) : undefined;

  if (!pageId || !workspaceSlug) return null;

  if (!commentIds || commentIds.length === 0)
    return (
      <div className="flex h-full flex-col px-2">
        {isEditingAllowed && (
          <CommentCreate
            workspaceSlug={workspaceSlug}
            entityId={pageId}
            activityOperations={activityOperations}
            projectId={projectId}
          />
        )}
        <div className="flex-grow">
          <PageNavigationPaneCommentsTabEmptyState />
        </div>
      </div>
    );

  return (
    <div className="h-full px-2">
      <CommentsWrapper
        entityId={pageId}
        activityOperations={activityOperations}
        comments={commentIds}
        getCommentById={getCommentById}
        projectId={projectId}
        isEditingAllowed={isEditingAllowed}
        enableReplies={false}
      />
    </div>
  );
});
