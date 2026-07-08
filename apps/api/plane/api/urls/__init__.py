# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from .asset import urlpatterns as asset_patterns
from .cycle import urlpatterns as cycle_patterns
from .initiative import urlpatterns as initiative_patterns
from .update import urlpatterns as update_patterns
from .intake import urlpatterns as intake_patterns
from .label import urlpatterns as label_patterns
from .member import urlpatterns as member_patterns
from .module import urlpatterns as module_patterns
from .milestone import urlpatterns as milestone_patterns
from .page import urlpatterns as page_patterns
from .project import urlpatterns as project_patterns
from .state import urlpatterns as state_patterns
from .user import urlpatterns as user_patterns
from .work_item import urlpatterns as work_item_patterns
from .invite import urlpatterns as invite_patterns
from .sticky import urlpatterns as sticky_patterns
from .reaction import urlpatterns as reaction_patterns
from .subscriber import urlpatterns as subscriber_patterns
from .archive import urlpatterns as archive_patterns
from .version import urlpatterns as version_patterns
from .workspace import urlpatterns as workspace_patterns
from .view import urlpatterns as view_patterns
from .favorite import urlpatterns as favorite_patterns
from .notification import urlpatterns as notification_patterns
from .search import urlpatterns as search_patterns
from .draft import urlpatterns as draft_patterns

urlpatterns = [
    *asset_patterns,
    *cycle_patterns,
    *initiative_patterns,
    *update_patterns,
    *intake_patterns,
    *label_patterns,
    *member_patterns,
    *module_patterns,
    *milestone_patterns,
    *page_patterns,
    *project_patterns,
    *state_patterns,
    *user_patterns,
    *work_item_patterns,
    *invite_patterns,
    *sticky_patterns,
    *reaction_patterns,
    *subscriber_patterns,
    *archive_patterns,
    *version_patterns,
    *workspace_patterns,
    *view_patterns,
    *favorite_patterns,
    *notification_patterns,
    *search_patterns,
    *draft_patterns,
]
