/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { usePathname } from "next/navigation";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EFileAssetType } from "@plane/types";
import type { TCommentsOperations } from "@plane/types";
import { copyUrlToClipboard, formatTextList } from "@plane/utils";
// hooks
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import { useMember } from "@/hooks/store/use-member";
import { usePageComment } from "@/hooks/store/use-page-comment";
import { useUser } from "@/hooks/store/user";

export const usePageCommentOperations = (
  workspaceSlug: string | undefined,
  pageId: string | undefined,
  projectId: string | undefined
): TCommentsOperations => {
  // store hooks
  const {
    createComment,
    updateComment,
    removeComment,
    createCommentReaction,
    removeCommentReaction,
    getCommentReactionsByCommentId,
    commentReactionsByUser,
    getCommentReactionById,
  } = usePageComment();
  const { getUserDetails } = useMember();
  const { uploadEditorAsset, duplicateEditorAsset } = useEditorAsset();
  const { data: currentUser } = useUser();
  // navigation
  const pathname = usePathname();
  // translation
  const { t } = useTranslation();

  const operations: TCommentsOperations = useMemo(() => {
    const ops: TCommentsOperations = {
      copyCommentLink: (id) => {
        if (!pathname) return;
        try {
          const commentLink = `${window.location.origin}${pathname}#comment-${id}`;
          copyUrlToClipboard(commentLink).then(() => {
            setToast({
              title: t("common.success"),
              type: TOAST_TYPE.SUCCESS,
              message: t("issue.comments.copy_link.success"),
            });
          });
        } catch (error) {
          console.error("Error in copying comment link:", error);
          setToast({
            title: t("common.error.label"),
            type: TOAST_TYPE.ERROR,
            message: t("issue.comments.copy_link.error"),
          });
        }
      },
      createComment: async (data) => {
        try {
          if (!workspaceSlug || !pageId) throw new Error("Missing fields");
          const comment = await createComment(workspaceSlug, pageId, data);
          setToast({
            title: t("common.success"),
            type: TOAST_TYPE.SUCCESS,
            message: t("issue.comments.create.success"),
          });
          return comment;
        } catch {
          setToast({
            title: t("common.error.label"),
            type: TOAST_TYPE.ERROR,
            message: t("issue.comments.create.error"),
          });
        }
      },
      updateComment: async (commentId, data) => {
        try {
          if (!workspaceSlug || !pageId) throw new Error("Missing fields");
          await updateComment(workspaceSlug, pageId, commentId, data);
          setToast({
            title: t("common.success"),
            type: TOAST_TYPE.SUCCESS,
            message: t("issue.comments.update.success"),
          });
        } catch {
          setToast({
            title: t("common.error.label"),
            type: TOAST_TYPE.ERROR,
            message: t("issue.comments.update.error"),
          });
        }
      },
      removeComment: async (commentId) => {
        try {
          if (!workspaceSlug || !pageId) throw new Error("Missing fields");
          await removeComment(workspaceSlug, pageId, commentId);
          setToast({
            title: t("common.success"),
            type: TOAST_TYPE.SUCCESS,
            message: t("issue.comments.remove.success"),
          });
        } catch {
          setToast({
            title: t("common.error.label"),
            type: TOAST_TYPE.ERROR,
            message: t("issue.comments.remove.error"),
          });
        }
      },
      uploadCommentAsset: async (blockId, file, commentId) => {
        try {
          if (!workspaceSlug) throw new Error("Missing fields");
          const res = await uploadEditorAsset({
            blockId,
            data: {
              entity_identifier: commentId ?? "",
              entity_type: EFileAssetType.COMMENT_DESCRIPTION,
            },
            file,
            projectId,
            workspaceSlug,
          });
          return res;
        } catch (error) {
          console.log("Error in uploading comment asset:", error);
          throw new Error(t("issue.comments.upload.error"));
        }
      },
      duplicateCommentAsset: async (assetId, commentId) => {
        try {
          if (!workspaceSlug) throw new Error("Missing fields");
          const res = await duplicateEditorAsset({
            assetId,
            entityId: commentId || undefined,
            entityType: EFileAssetType.COMMENT_DESCRIPTION,
            projectId,
            workspaceSlug,
          });
          return res;
        } catch {
          throw new Error("Asset duplication failed. Please try again later.");
        }
      },
      addCommentReaction: async (commentId, reaction) => {
        try {
          if (!workspaceSlug || !pageId || !commentId) throw new Error("Missing fields");
          await createCommentReaction(workspaceSlug, pageId, commentId, reaction);
        } catch {
          setToast({
            title: t("common.error.label"),
            type: TOAST_TYPE.ERROR,
            message: t("common.something_went_wrong"),
          });
        }
      },
      deleteCommentReaction: async (commentId, reaction) => {
        try {
          if (!workspaceSlug || !pageId || !commentId || !currentUser?.id) throw new Error("Missing fields");
          await removeCommentReaction(workspaceSlug, pageId, commentId, reaction, currentUser.id);
        } catch {
          setToast({
            title: t("common.error.label"),
            type: TOAST_TYPE.ERROR,
            message: t("common.something_went_wrong"),
          });
        }
      },
      react: async (commentId, reactionEmoji, userReactions) => {
        if (userReactions.includes(reactionEmoji)) await ops.deleteCommentReaction(commentId, reactionEmoji);
        else await ops.addCommentReaction(commentId, reactionEmoji);
      },
      reactionIds: (commentId) => getCommentReactionsByCommentId(commentId),
      userReactions: (commentId) =>
        currentUser ? commentReactionsByUser(commentId, currentUser?.id).map((r) => r.reaction) : [],
      getReactionUsers: (reaction, reactionIds) => {
        const reactionUsers = (reactionIds?.[reaction] || [])
          .map((reactionId) => {
            const reactionDetails = getCommentReactionById(reactionId);
            return reactionDetails ? getUserDetails(reactionDetails.actor)?.display_name : null;
          })
          .filter((displayName): displayName is string => !!displayName);
        return formatTextList(reactionUsers);
      },
    };
    return ops;
  }, [
    workspaceSlug,
    pageId,
    projectId,
    pathname,
    currentUser,
    createComment,
    updateComment,
    removeComment,
    createCommentReaction,
    removeCommentReaction,
    uploadEditorAsset,
    duplicateEditorAsset,
    getCommentReactionsByCommentId,
    commentReactionsByUser,
    getCommentReactionById,
    getUserDetails,
    t,
  ]);

  return operations;
};
