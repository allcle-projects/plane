/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { pull, find, concat, update, uniq, set } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
// plane imports
import type {
  TIssueComment,
  TIssueCommentMap,
  TIssueCommentIdMap,
  TIssueCommentReaction,
  TIssueCommentReactionIdMap,
  TIssueCommentReactionMap,
} from "@plane/types";
import { groupReactions } from "@plane/utils";
// services
import { PageCommentService } from "@/services/page";

export type TPageCommentLoader = "fetch" | "create" | "update" | "delete" | "mutate" | undefined;

export interface IPageCommentStoreActions {
  fetchComments: (workspaceSlug: string, pageId: string, loaderType?: TPageCommentLoader) => Promise<TIssueComment[]>;
  createComment: (workspaceSlug: string, pageId: string, data: Partial<TIssueComment>) => Promise<TIssueComment>;
  updateComment: (
    workspaceSlug: string,
    pageId: string,
    commentId: string,
    data: Partial<TIssueComment>
  ) => Promise<void>;
  removeComment: (workspaceSlug: string, pageId: string, commentId: string) => Promise<void>;
  createCommentReaction: (
    workspaceSlug: string,
    pageId: string,
    commentId: string,
    reaction: string
  ) => Promise<TIssueCommentReaction>;
  removeCommentReaction: (
    workspaceSlug: string,
    pageId: string,
    commentId: string,
    reaction: string,
    userId: string
  ) => Promise<void>;
}

export interface IPageCommentStore extends IPageCommentStoreActions {
  // observables
  loader: TPageCommentLoader;
  comments: TIssueCommentIdMap;
  commentMap: TIssueCommentMap;
  commentReactions: TIssueCommentReactionIdMap;
  commentReactionMap: TIssueCommentReactionMap;
  // comment helpers
  getCommentsByPageId: (pageId: string) => string[] | undefined;
  getCommentById: (commentId: string) => TIssueComment | undefined;
  // reaction helpers
  getCommentReactionsByCommentId: (commentId: string) => { [reaction_id: string]: string[] } | undefined;
  getCommentReactionById: (reactionId: string) => TIssueCommentReaction | undefined;
  commentReactionsByUser: (commentId: string, userId: string) => TIssueCommentReaction[];
}

export class PageCommentStore implements IPageCommentStore {
  // observables
  loader: TPageCommentLoader = "fetch";
  comments: TIssueCommentIdMap = {};
  commentMap: TIssueCommentMap = {};
  commentReactions: TIssueCommentReactionIdMap = {};
  commentReactionMap: TIssueCommentReactionMap = {};
  // services
  pageCommentService;

  constructor() {
    makeObservable(this, {
      // observables
      loader: observable.ref,
      comments: observable,
      commentMap: observable,
      commentReactions: observable,
      commentReactionMap: observable,
      // actions
      fetchComments: action,
      createComment: action,
      updateComment: action,
      removeComment: action,
      applyCommentReactions: action,
      createCommentReaction: action,
      removeCommentReaction: action,
    });
    // services
    this.pageCommentService = new PageCommentService();
  }

  // comment helpers
  getCommentsByPageId = (pageId: string) => {
    if (!pageId) return undefined;
    return this.comments[pageId] ?? undefined;
  };

  getCommentById = (commentId: string) => {
    if (!commentId) return undefined;
    return this.commentMap[commentId] ?? undefined;
  };

  // reaction helpers
  getCommentReactionsByCommentId = (commentId: string) => {
    if (!commentId) return undefined;
    return this.commentReactions[commentId] ?? undefined;
  };

  getCommentReactionById = (reactionId: string) => {
    if (!reactionId) return undefined;
    return this.commentReactionMap[reactionId] ?? undefined;
  };

  commentReactionsByUser = (commentId: string, userId: string) => {
    if (!commentId || !userId) return [];

    const reactions = this.getCommentReactionsByCommentId(commentId);
    if (!reactions) return [];

    const _userReactions: TIssueCommentReaction[] = [];
    Object.keys(reactions).forEach((reaction) => {
      if (reactions?.[reaction])
        reactions?.[reaction].map((reactionId) => {
          const currentReaction = this.getCommentReactionById(reactionId);
          if (currentReaction && currentReaction.actor === userId) _userReactions.push(currentReaction);
        });
    });

    return _userReactions;
  };

  applyCommentReactions = (commentId: string, commentReactions: TIssueCommentReaction[]) => {
    const groupedReactions = groupReactions(commentReactions || [], "reaction");

    const commentReactionIdsMap: { [reaction: string]: string[] } = {};

    Object.keys(groupedReactions).map((reactionId) => {
      const reactionIds = (groupedReactions[reactionId] || []).map((reaction) => reaction.id);
      commentReactionIdsMap[reactionId] = reactionIds;
    });

    runInAction(() => {
      set(this.commentReactions, commentId, commentReactionIdsMap);
      commentReactions.forEach((reaction) => set(this.commentReactionMap, reaction.id, reaction));
    });
  };

  // comment actions
  fetchComments = async (workspaceSlug: string, pageId: string, loaderType: TPageCommentLoader = "fetch") => {
    this.loader = loaderType;

    let props = {};
    const _commentIds = this.getCommentsByPageId(pageId);
    if (_commentIds && _commentIds.length > 0) {
      const _comment = this.getCommentById(_commentIds[_commentIds.length - 1]);
      if (_comment) props = { created_at__gt: _comment.created_at };
    }

    const comments = await this.pageCommentService.getPageComments(workspaceSlug, pageId, props);

    const commentIds = comments.map((comment) => comment.id);
    runInAction(() => {
      update(this.comments, pageId, (existingIds) => {
        if (!existingIds) return commentIds;
        return uniq(concat(existingIds, commentIds));
      });
      comments.forEach((comment) => {
        this.applyCommentReactions(comment.id, comment?.comment_reactions || []);
        set(this.commentMap, comment.id, comment);
      });
      this.loader = undefined;
    });

    return comments;
  };

  createComment = async (workspaceSlug: string, pageId: string, data: Partial<TIssueComment>) => {
    const response = await this.pageCommentService.createPageComment(workspaceSlug, pageId, data);

    runInAction(() => {
      update(this.comments, pageId, (existingIds) => {
        if (!existingIds) return [response.id];
        return uniq(concat(existingIds, [response.id]));
      });
      set(this.commentMap, response.id, response);
    });

    return response;
  };

  updateComment = async (
    workspaceSlug: string,
    pageId: string,
    commentId: string,
    data: Partial<TIssueComment>
  ) => {
    runInAction(() => {
      Object.keys(data).forEach((key) => {
        set(this.commentMap, [commentId, key], data[key as keyof TIssueComment]);
      });
    });

    const response = await this.pageCommentService.patchPageComment(workspaceSlug, pageId, commentId, data);

    runInAction(() => {
      set(this.commentMap, [commentId, "updated_at"], response.updated_at);
      set(this.commentMap, [commentId, "edited_at"], response.edited_at);
    });
  };

  removeComment = async (workspaceSlug: string, pageId: string, commentId: string) => {
    await this.pageCommentService.deletePageComment(workspaceSlug, pageId, commentId);

    runInAction(() => {
      pull(this.comments[pageId], commentId);
      delete this.commentMap[commentId];
    });
  };

  // reaction actions
  createCommentReaction = async (workspaceSlug: string, pageId: string, commentId: string, reaction: string) => {
    const response = await this.pageCommentService.createPageCommentReaction(workspaceSlug, pageId, commentId, {
      reaction,
    });

    runInAction(() => {
      if (!this.commentReactions[commentId]) set(this.commentReactions, commentId, {});
      update(this.commentReactions, `${commentId}.${reaction}`, (reactionId) => {
        if (!reactionId) return [response.id];
        return concat(reactionId, response.id);
      });
      set(this.commentReactionMap, response.id, response);
    });

    return response;
  };

  removeCommentReaction = async (
    workspaceSlug: string,
    pageId: string,
    commentId: string,
    reaction: string,
    userId: string
  ) => {
    const userReactions = this.commentReactionsByUser(commentId, userId);
    const currentReaction = find(userReactions, { actor: userId, reaction: reaction });

    if (currentReaction && currentReaction.id) {
      runInAction(() => {
        pull(this.commentReactions[commentId][reaction], currentReaction.id);
        delete this.commentReactionMap[currentReaction.id];
      });
    }

    await this.pageCommentService.deletePageCommentReaction(workspaceSlug, pageId, commentId, reaction);
  };
}
