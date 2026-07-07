# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from .project import (
    ProjectListCreateAPIEndpoint,
    ProjectDetailAPIEndpoint,
    ProjectArchiveUnarchiveAPIEndpoint,
    ProjectSummaryAPIEndpoint,
)

from .state import (
    StateListCreateAPIEndpoint,
    StateDetailAPIEndpoint,
    StateMarkDefaultAPIEndpoint,
)

from .issue import (
    WorkspaceIssueAPIEndpoint,
    IssueListCreateAPIEndpoint,
    IssueDetailAPIEndpoint,
    LabelListCreateAPIEndpoint,
    LabelDetailAPIEndpoint,
    BulkCreateIssueLabelsAPIEndpoint,
    IssueLinkListCreateAPIEndpoint,
    IssueLinkDetailAPIEndpoint,
    IssueCommentListCreateAPIEndpoint,
    IssueCommentDetailAPIEndpoint,
    IssueActivityListAPIEndpoint,
    IssueActivityDetailAPIEndpoint,
    IssueAttachmentListCreateAPIEndpoint,
    IssueAttachmentDetailAPIEndpoint,
    IssueSearchEndpoint,
    IssueRelationListCreateAPIEndpoint,
    IssueRelationRemoveAPIEndpoint,
)

from .worklog import IssueWorklogListCreateAPIEndpoint

from .property_value import IssuePropertyValueAPIEndpoint

from .reaction import (
    IssueReactionListCreateAPIEndpoint,
    IssueReactionDetailAPIEndpoint,
    CommentReactionListCreateAPIEndpoint,
    CommentReactionDetailAPIEndpoint,
)

from .subscriber import (
    IssueSubscriberListCreateAPIEndpoint,
    IssueSubscriberDetailAPIEndpoint,
    IssueSubscriptionStatusAPIEndpoint,
)

from .sub_issue import SubIssuesListAPIEndpoint

from .archive import (
    IssueArchiveAPIEndpoint,
    ArchivedIssueListAPIEndpoint,
    BulkArchiveIssuesAPIEndpoint,
    BulkDeleteIssuesAPIEndpoint,
)

from .version import (
    IssueDescriptionVersionListAPIEndpoint,
    IssueDescriptionVersionDetailAPIEndpoint,
)

from .workspace import (
    WorkspaceLabelsListAPIEndpoint,
    WorkspaceStatesListAPIEndpoint,
)

from .cycle import (
    CycleListCreateAPIEndpoint,
    CycleDetailAPIEndpoint,
    CycleIssueListCreateAPIEndpoint,
    CycleIssueDetailAPIEndpoint,
    TransferCycleIssueAPIEndpoint,
    CycleArchiveUnarchiveAPIEndpoint,
    CycleStartAPIEndpoint,
    CycleCompleteAPIEndpoint,
)

from .module import (
    ModuleListCreateAPIEndpoint,
    ModuleDetailAPIEndpoint,
    ModuleIssueListCreateAPIEndpoint,
    ModuleIssueDetailAPIEndpoint,
    ModuleArchiveUnarchiveAPIEndpoint,
    ModuleLinkListCreateAPIEndpoint,
    ModuleLinkDetailAPIEndpoint,
)

from .page import (
    PageListCreateAPIEndpoint,
    PageDetailAPIEndpoint,
    PageArchiveUnarchiveAPIEndpoint,
)

from .member import ProjectMemberListCreateAPIEndpoint, ProjectMemberDetailAPIEndpoint, WorkspaceMemberAPIEndpoint

from .intake import (
    IntakeIssueListCreateAPIEndpoint,
    IntakeIssueDetailAPIEndpoint,
)

from .asset import UserAssetEndpoint, UserServerAssetEndpoint, GenericAssetEndpoint

from .user import UserEndpoint

from .invite import WorkspaceInvitationsViewset

from .sticky import StickyViewSet

from .view import (
    WorkspaceViewAPIEndpoint,
    WorkspaceViewDetailAPIEndpoint,
    ProjectViewAPIEndpoint,
    ProjectViewDetailAPIEndpoint,
    ProjectViewFavoriteAPIEndpoint,
)

from .favorite import (
    WorkspaceFavoriteAPIEndpoint,
    WorkspaceFavoriteGroupAPIEndpoint,
)

from .notification import (
    NotificationListAPIEndpoint,
    NotificationDetailAPIEndpoint,
    NotificationMarkReadAPIEndpoint,
    NotificationArchiveAPIEndpoint,
    UnreadNotificationAPIEndpoint,
    MarkAllReadNotificationAPIEndpoint,
    UserNotificationPreferenceAPIEndpoint,
)

from .search import (
    GlobalSearchAPIEndpoint,
    EntitySearchAPIEndpoint,
    IssueSearchAPIEndpoint,
)

from .draft import (
    WorkspaceDraftIssueAPIEndpoint,
    WorkspaceDraftIssueDetailAPIEndpoint,
    WorkspaceDraftToIssueAPIEndpoint,
)
