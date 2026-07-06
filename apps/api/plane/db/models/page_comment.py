# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.contrib.postgres.fields import ArrayField
from django.db import models

# Module imports
from plane.utils.html_processor import strip_tags

from .workspace import WorkspaceBaseModel


class PageComment(WorkspaceBaseModel):
    """Document-level comment on a page (mirrors IssueComment, keyed to Page).

    Pages are workspace-scoped and can be global (no project), so this subclasses
    WorkspaceBaseModel and keeps the optional `project` FK (inherited) for
    permission scoping.
    """

    comment_stripped = models.TextField(verbose_name="Comment", blank=True)
    comment_json = models.JSONField(blank=True, default=dict)
    comment_html = models.TextField(blank=True, default="<p></p>")
    attachments = ArrayField(models.URLField(), size=10, blank=True, default=list)
    access = models.CharField(
        choices=(("INTERNAL", "INTERNAL"), ("EXTERNAL", "EXTERNAL")),
        default="INTERNAL",
        max_length=100,
    )
    external_source = models.CharField(max_length=255, null=True, blank=True)
    external_id = models.CharField(max_length=255, null=True, blank=True)
    edited_at = models.DateTimeField(null=True, blank=True)
    page = models.ForeignKey("db.Page", on_delete=models.CASCADE, related_name="comments")
    # System can also create comment
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="page_comments",
        null=True,
    )
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="child_comments",
    )

    def save(self, *args, **kwargs):
        self.comment_stripped = strip_tags(self.comment_html) if self.comment_html != "" else ""
        super(PageComment, self).save(*args, **kwargs)

    class Meta:
        verbose_name = "Page Comment"
        verbose_name_plural = "Page Comments"
        db_table = "page_comments"
        ordering = ("created_at",)

    def __str__(self):
        """Return page of the comment"""
        return str(self.page)


class PageCommentReaction(WorkspaceBaseModel):
    """Emoji reaction on a page comment (mirrors CommentReaction)."""

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="page_comment_reactions",
    )
    comment = models.ForeignKey(PageComment, on_delete=models.CASCADE, related_name="reactions")
    reaction = models.TextField()

    class Meta:
        unique_together = ["comment", "actor", "reaction", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["comment", "actor", "reaction"],
                condition=models.Q(deleted_at__isnull=True),
                name="page_comment_reaction_unique_comment_actor_reaction_when_deleted_at_null",
            )
        ]
        verbose_name = "Page Comment Reaction"
        verbose_name_plural = "Page Comment Reactions"
        db_table = "page_comment_reactions"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.comment} {self.actor.email}"
