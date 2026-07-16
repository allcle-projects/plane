# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Regression suite for the public v1 API mention/notification bug (mote,
2026-07-16, commits 9e12bc8/8daa30b).

Two independent, compounding backend bugs meant that a mention (or any
issue/comment activity) created via the public v1 API (X-API-Key auth)
never produced an in-app Notification row, even though the identical
action via the session-authenticated app API worked correctly:

1. Every `issue_activity.delay()` call site in `api/views/issue.py`
   omitted `notification=True`, so `bgtasks/issue_activities_task.py`
   never dispatched `notifications.delay()` at all.
2. `IssueCommentCreateSerializer.Meta.fields` excludes `id` from its
   output, so `create_comment_activity()`'s `requested_data.get("id")`
   always resolved to `None`, leaving the created `IssueActivity`'s
   `issue_comment_id` FK NULL — breaking `extract_comment_mentions()`'s
   lookup even once bug 1 was fixed.

Layers:
- unit: bgtask functions called directly (no Celery broker, no HTTP)
- contract: public API endpoints, asserting on what the view dispatches
  and on the resulting IssueActivity/Notification DB state
- integration: full pipeline (API call -> issue_activity() ->
  notifications()) asserting a real Notification row is created,
  mirroring the manual e2e verification done in production
"""

import json
from uuid import uuid4

import pytest
from django.utils import timezone

from plane.bgtasks.issue_activities_task import create_comment_activity, issue_activity
from plane.bgtasks.notification_task import extract_comment_mentions, extract_mentions, notifications
from plane.db.models import Issue, IssueActivity, IssueComment, Notification, State
from plane.db.models.api import APIToken
from plane.tests.factories import ProjectFactory, ProjectMemberFactory, UserFactory


def mention_html(text, mentioned_user_id):
    return (
        f"<p>{text} "
        f'<mention-component id="{mentioned_user_id}" '
        f'entity_identifier="{mentioned_user_id}" '
        f'entity_name="user_mention"></mention-component></p>'
    )


def create_issue(project, actor, state, name="test issue"):
    """The real API view auto-creates default States on project creation
    (api/views/project.py) and issues always carry a state. ProjectFactory
    bypasses that view, so tests must create + assign a State explicitly —
    notifications()'s email-log path dereferences issue.state.name and
    raises AttributeError (silently caught + logged) on a NULL state,
    which looks exactly like "no notification pipeline ran" if missed."""
    return Issue.objects.create(
        project=project,
        workspace=project.workspace,
        name=name,
        state=state,
        created_by=actor,
        updated_by=actor,
    )


@pytest.fixture
def project_with_members(db):
    """A project with an admin (actor), a second member (mention target),
    and a default State (see create_issue()'s docstring for why this is
    required).

    UserFactory does not set `username` (unique, no default), so distinct
    calls within one test collide on the empty-string default — set it
    explicitly here rather than touch the shared factory."""
    actor = UserFactory(username=f"actor-{uuid4().hex[:8]}")
    mentioned = UserFactory(username=f"mentioned-{uuid4().hex[:8]}")
    project = ProjectFactory(created_by=actor, updated_by=actor)
    ProjectMemberFactory(project=project, member=actor, role=20, is_active=True)
    ProjectMemberFactory(project=project, member=mentioned, role=15, is_active=True)
    state = State.objects.create(
        project=project,
        workspace=project.workspace,
        name="Todo",
        color="#000000",
        group="unstarted",
        default=True,
        created_by=actor,
        updated_by=actor,
    )
    return project, actor, mentioned, state


@pytest.fixture
def project_api_client(api_client, project_with_members):
    """API-key authenticated client scoped to the actor + workspace, mirroring
    real automation callers (task-bot etc.)."""
    project, actor, _mentioned, _state = project_with_members
    token = APIToken.objects.create(user=actor, label="test", workspace=project.workspace)
    api_client.credentials(HTTP_X_API_KEY=token.token)
    return api_client


# ---------------------------------------------------------------------------
# unit: bgtask functions in isolation
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestExtractCommentMentions:
    def test_finds_mention_component_tag(self):
        html = mention_html("hey", "8581aed2-39b7-457a-9843-c2d93df3025c")
        assert extract_comment_mentions(html) == ["8581aed2-39b7-457a-9843-c2d93df3025c"]

    def test_plain_text_at_mention_is_not_parsed(self):
        """A caller sending plain '@username' text (not the mention-component
        tag) must not be silently treated as a mention — this was the
        original (incorrect) hypothesis for the bug; the real bug was
        server-side wiring, not caller-side encoding. This test locks in
        that the encoding requirement itself is real and unchanged."""
        assert extract_comment_mentions("<p>@otro please check</p>") == []

    def test_no_mentions_returns_empty_list(self):
        assert extract_comment_mentions("<p>no mentions here</p>") == []

    def test_malformed_html_does_not_raise(self):
        assert extract_comment_mentions("<mention-component entity_name") == []


@pytest.mark.unit
class TestExtractMentions:
    def test_finds_mention_in_issue_description(self):
        payload = json.dumps({"description_html": mention_html("desc", "abc-123")})
        assert extract_mentions(payload) == ["abc-123"]

    def test_no_description_html_key_returns_empty(self):
        assert extract_mentions(json.dumps({})) == []


@pytest.mark.unit
class TestCreateCommentActivityFKBug:
    """Bug 2, isolated at the bgtask layer: create_comment_activity() must
    receive a requested_data dict containing a real "id", or
    IssueActivity.issue_comment_id stays NULL — this is the exact mechanism
    the fix addresses at the view layer (call this with and without "id" to
    prove the FK linkage depends on it)."""

    def test_with_id_sets_issue_comment_fk(self, db, project_with_members):
        project, actor, mentioned, state = project_with_members
        issue = create_issue(project, actor, state)
        comment = IssueComment.objects.create(
            project=project,
            workspace=project.workspace,
            issue=issue,
            comment_html=mention_html("hi", str(mentioned.id)),
            actor=actor,
            created_by=actor,
        )

        activities = []
        create_comment_activity(
            requested_data=json.dumps({"id": str(comment.id), "comment_html": comment.comment_html}),
            current_instance=None,
            issue_id=str(issue.id),
            project_id=str(project.id),
            workspace_id=str(project.workspace_id),
            actor_id=str(actor.id),
            issue_activities=activities,
            epoch=int(timezone.now().timestamp()),
        )
        assert len(activities) == 1
        assert str(activities[0].issue_comment_id) == str(comment.id)

    def test_without_id_leaves_fk_null(self, db, project_with_members):
        """Reproduces bug 2 directly: requested_data missing "id" (exactly
        what IssueCommentCreateSerializer.Meta.fields produced pre-fix)
        leaves issue_comment_id NULL."""
        project, actor, mentioned, state = project_with_members
        issue = create_issue(project, actor, state)

        activities = []
        create_comment_activity(
            requested_data=json.dumps({"comment_html": mention_html("hi", str(mentioned.id))}),
            current_instance=None,
            issue_id=str(issue.id),
            project_id=str(project.id),
            workspace_id=str(project.workspace_id),
            actor_id=str(actor.id),
            issue_activities=activities,
            epoch=int(timezone.now().timestamp()),
        )
        assert len(activities) == 1
        assert activities[0].issue_comment_id is None


# ---------------------------------------------------------------------------
# contract: public API endpoints, asserting on what the view actually
# dispatches to issue_activity.delay() (mocked — no Celery broker
# dependency, since this repo's test settings do not set
# CELERY_TASK_ALWAYS_EAGER, so .delay() would otherwise just enqueue and
# never run within the test)
# ---------------------------------------------------------------------------


@pytest.mark.contract
class TestPublicAPICommentCreateFKLinkage:
    def test_comment_create_dispatches_notification_true_and_real_id(
        self, project_api_client, project_with_members, mocker
    ):
        project, actor, mentioned, state = project_with_members
        issue = create_issue(project, actor, state, name="api test issue")

        mock_delay = mocker.patch("plane.api.views.issue.issue_activity.delay")

        resp = project_api_client.post(
            f"/api/v1/workspaces/{project.workspace.slug}/projects/{project.id}/issues/{issue.id}/comments/",
            data={"comment_html": mention_html("via api", str(mentioned.id))},
            format="json",
        )
        assert resp.status_code == 201, resp.content
        comment_id = resp.data["id"]

        assert mock_delay.call_count == 1
        call_kwargs = mock_delay.call_args.kwargs

        assert call_kwargs["notification"] is True, (
            "comment-create view did not request notification=True — "
            "bug 1 has regressed"
        )

        dispatched_data = json.loads(call_kwargs["requested_data"])
        assert str(dispatched_data.get("id")) == str(comment_id), (
            "requested_data passed to issue_activity.delay() has no real "
            "'id' — bug 2 (IssueCommentCreateSerializer missing 'id') has "
            "regressed; the view must re-serialize with "
            "IssueCommentSerializer(issue_comment) instead of the "
            "create-serializer's .data"
        )


# ---------------------------------------------------------------------------
# integration: full mention -> notification pipeline, driven synchronously
# ---------------------------------------------------------------------------


@pytest.mark.contract
class TestFullMentionPipeline:
    """These tests call issue_activity() for real (not mocked) to exercise
    its actual `if notification: notifications.delay(...)` gate — the exact
    mechanism bug 1 broke. `notifications.delay` itself is patched to run
    the task body synchronously in-process: this repo's test settings do
    not set CELERY_TASK_ALWAYS_EAGER, so an unpatched `.delay()` would only
    publish to RabbitMQ and return immediately without the task body ever
    executing inside the test process — confirmed by direct reproduction
    while writing this suite (mocking .delay() to call through is the
    correct, deterministic way to test Celery dispatch without a broker)."""

    @pytest.fixture(autouse=True)
    def run_notifications_synchronously(self, mocker):
        mocker.patch(
            "plane.bgtasks.issue_activities_task.notifications.delay",
            side_effect=lambda **kwargs: notifications(**kwargs),
        )

    def test_api_comment_mention_creates_notification(
        self, project_api_client, project_with_members, mocker
    ):
        """End-to-end simulation of the exact production verification done
        manually on 2026-07-16: POST a comment with a mention-component tag
        via API-key auth (issue_activity.delay is mocked to call through
        synchronously, same reasoning as notifications.delay above), and
        assert a real Notification row exists for the mentioned user."""
        project, actor, mentioned, state = project_with_members
        issue = create_issue(project, actor, state, name="pipeline test issue")

        mocker.patch(
            "plane.api.views.issue.issue_activity.delay",
            side_effect=lambda **kwargs: issue_activity(**kwargs),
        )

        resp = project_api_client.post(
            f"/api/v1/workspaces/{project.workspace.slug}/projects/{project.id}/issues/{issue.id}/comments/",
            data={"comment_html": mention_html("please review", str(mentioned.id))},
            format="json",
        )
        assert resp.status_code == 201, resp.content

        notification = Notification.objects.filter(
            entity_identifier=issue.id, receiver_id=mentioned.id
        ).first()
        assert notification is not None, (
            "no Notification row was created for the mentioned user — "
            "the mention/notification pipeline regressed"
        )
        assert "mentioned" in notification.message.lower()

    def test_notification_not_created_when_notification_kwarg_omitted(
        self, project_with_members
    ):
        """Negative control: reproduces bug 1 directly by calling
        issue_activity() with notification=False (the pre-fix default) and
        asserting no notification pipeline runs. Proves the assertion above
        is actually meaningful and not a false positive from some other
        code path."""
        project, actor, mentioned, state = project_with_members
        issue = create_issue(project, actor, state, name="negative control issue")
        comment = IssueComment.objects.create(
            project=project,
            workspace=project.workspace,
            issue=issue,
            comment_html=mention_html("control", str(mentioned.id)),
            actor=actor,
            created_by=actor,
        )

        before_count = Notification.objects.filter(entity_identifier=issue.id).count()

        issue_activity(
            type="comment.activity.created",
            requested_data=json.dumps({"id": str(comment.id), "comment_html": comment.comment_html}),
            actor_id=str(actor.id),
            issue_id=str(issue.id),
            project_id=str(project.id),
            current_instance=None,
            epoch=int(timezone.now().timestamp()),
            notification=False,  # pre-fix behavior
        )

        after_count = Notification.objects.filter(entity_identifier=issue.id).count()
        assert after_count == before_count, (
            "a Notification was created even though notification=False was "
            "passed — the negative control is broken, invalidating the "
            "positive test's meaning"
        )


# ---------------------------------------------------------------------------
# regression: every public API issue_activity.delay() call site must pass
# notification=True (static source check — cheap, catches future omissions
# without needing to exercise all 11 call sites through HTTP)
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestNotificationKwargStaticCoverage:
    def test_all_issue_activity_delay_call_sites_pass_notification_true(self):
        import inspect
        import re

        from plane.api.views import issue as issue_views_module

        source = inspect.getsource(issue_views_module)
        # Find every issue_activity.delay( ... ) call block and check it
        # contains notification=True before its closing paren.
        call_sites = []
        for match in re.finditer(r"issue_activity\.delay\(", source):
            start = match.start()
            depth = 0
            i = match.end() - 1
            while True:
                if source[i] == "(":
                    depth += 1
                elif source[i] == ")":
                    depth -= 1
                    if depth == 0:
                        break
                i += 1
            block = source[start : i + 1]
            call_sites.append(block)

        assert len(call_sites) >= 15, (
            f"expected at least 15 issue_activity.delay() call sites in "
            f"api/views/issue.py, found {len(call_sites)} — file structure "
            f"changed, update this test's expectation"
        )
        missing = [block for block in call_sites if "notification=True" not in block]
        assert not missing, (
            f"{len(missing)} issue_activity.delay() call site(s) in the "
            f"public API are missing notification=True — this is exactly "
            f"bug 1 regressing. First offending block:\n{missing[0]}"
        )


@pytest.mark.unit
class TestCommentCreateSerializerUsesFullSerializerForActivity:
    def test_comment_create_view_reserializes_with_id(self):
        """Static check for bug 2's exact fix: the comment-create view must
        build issue_activity's requested_data from IssueCommentSerializer
        (which includes "id"), not IssueCommentCreateSerializer.data
        (which does not)."""
        import inspect

        from plane.api.views import issue as issue_views_module

        source = inspect.getsource(issue_views_module.IssueCommentListCreateAPIEndpoint.post)
        assert "IssueCommentCreateSerializer(issue_comment).data" not in source
        assert "requested_data=json.dumps(serializer.data" not in source
        assert "IssueCommentSerializer(issue_comment).data" in source, (
            "comment-create view no longer re-serializes with "
            "IssueCommentSerializer(issue_comment) — bug 2 (missing id on "
            "IssueActivity.issue_comment_id) may have regressed"
        )
