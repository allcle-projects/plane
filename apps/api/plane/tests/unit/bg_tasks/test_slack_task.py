# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Slack outbound delivery scope (mote, TEAMDEV-745).

The regression these guard against is not "the POST failed" — it is the two silent
modes this task has:

  1. no SlackProjectSync row  -> returns before doing anything (how the integration
     sat dead in production: the code shipped, the row never did)
  2. an activity that is not addressed to anyone -> must not reach the channel, or
     the channel fills with noise and stops being read

Both look identical from outside: nothing arrives.
"""

import json

import pytest
from unittest.mock import patch

from plane.bgtasks.slack_task import slack_activity_notify
from plane.db.models import Issue, Project, ProjectMember, SlackProjectSync, User

WEBHOOK = "https://hooks.slack.example/T000/B000/xxx"


def _activity(field, new_value, old_value=None):
    return json.dumps([{"field": field, "new_value": new_value, "old_value": old_value}])


def _mention(user_id):
    return f'<p><mention-component entity_identifier="{user_id}" entity_name="user_mention"></mention-component> 확인 부탁드립니다</p>'  # noqa: E501


@pytest.mark.unit
@pytest.mark.django_db
class TestSlackActivityNotify:
    @pytest.fixture
    def project(self, create_user, workspace):
        project = Project.objects.create(name="Slack Test", identifier="SLK", workspace=workspace)
        ProjectMember.objects.create(project=project, member=create_user)
        return project

    @pytest.fixture
    def issue(self, workspace, project):
        return Issue.objects.create(name="Test Issue", workspace=workspace, project_id=project.id, sequence_id=1)

    @pytest.fixture
    def sync(self, workspace, project):
        return SlackProjectSync.objects.create(project=project, workspace=workspace, webhook_url=WEBHOOK)

    @pytest.fixture
    def mentioned(self, workspace):
        # `username` is unique and the conftest `create_user` fixture (our actor)
        # leaves it "", so a second user built the same way collides on
        # users_username_key. Set it explicitly.
        return User.objects.create(email="dot@motemote.kr", username="dot", display_name="dot")

    def _run(self, project, actor, issue, payload):
        with patch("plane.bgtasks.slack_task.requests.post") as post:
            slack_activity_notify(str(project.id), str(actor.id), str(issue.id), payload)
        return post

    # --- silent mode 1: not configured -------------------------------------
    def test_no_sync_row_posts_nothing(self, project, create_user, issue, mentioned):
        """The production failure: task runs, finds no row, returns. No exception,
        no log, no message — indistinguishable from 'nobody was mentioned'."""
        post = self._run(project, create_user, issue, _activity("comment", _mention(mentioned.id)))
        post.assert_not_called()

    def test_blank_webhook_url_is_not_configured(self, project, create_user, issue, mentioned, workspace):
        SlackProjectSync.objects.create(project=project, workspace=workspace, webhook_url="")
        post = self._run(project, create_user, issue, _activity("comment", _mention(mentioned.id)))
        post.assert_not_called()

    # --- silent mode 2: undirected activity --------------------------------
    @pytest.mark.parametrize(
        "field,new_value",
        [
            ("comment", "<p>메모만 남깁니다</p>"),  # comment without a mention
            ("state", "In Progress"),
            ("priority", "urgent"),
            ("target_date", "2026-08-20"),
            (None, "Test Issue"),  # issue created
            ("assignees", ""),  # unassigned — nobody to ping
        ],
    )
    def test_undirected_activity_is_not_announced(self, sync, project, create_user, issue, field, new_value):
        post = self._run(project, create_user, issue, _activity(field, new_value))
        post.assert_not_called()

    # --- what does get through ---------------------------------------------
    def test_mention_in_comment_names_the_mentioned_user(self, sync, project, create_user, issue, mentioned):
        post = self._run(project, create_user, issue, _activity("comment", _mention(mentioned.id)))
        post.assert_called_once()
        text = post.call_args.kwargs["json"]["text"]
        assert "dot" in text
        assert "SLK-1" in text
        assert "확인 부탁드립니다" in text  # HTML stripped, body kept
        assert "mention-component" not in text  # markup never leaks into Slack

    def test_mention_in_description_is_announced(self, sync, project, create_user, issue, mentioned):
        post = self._run(project, create_user, issue, _activity("description", _mention(mentioned.id)))
        post.assert_called_once()
        assert "dot" in post.call_args.kwargs["json"]["text"]

    def test_assignment_is_announced(self, sync, project, create_user, issue):
        post = self._run(project, create_user, issue, _activity("assignees", "dot"))
        post.assert_called_once()
        assert "dot" in post.call_args.kwargs["json"]["text"]

    def test_posts_to_every_configured_channel(self, sync, project, create_user, issue, mentioned, workspace):
        """Two channels for one project require distinct team_id values.

        `SlackProjectSync.Meta.unique_together = ["team_id", "project"]`, and the
        paste-a-webhook-URL flow leaves team_id "" — so **a project gets exactly one
        channel** unless someone fills team_id in. The fan-out loop is real but only
        reachable that way; second-channel-per-project is not a configuration the
        admin flow can produce today.
        """
        SlackProjectSync.objects.create(
            project=project, workspace=workspace, webhook_url=WEBHOOK + "2", team_id="T2"
        )
        post = self._run(project, create_user, issue, _activity("comment", _mention(mentioned.id)))
        assert post.call_count == 2

    def test_one_channel_per_project_unless_team_id_differs(self, sync, project, workspace):
        """Guard the constraint itself — if it is ever relaxed, the note above
        (and the admin flow's assumptions) need revisiting."""
        from django.db.utils import IntegrityError

        with pytest.raises(IntegrityError):
            SlackProjectSync.objects.create(project=project, workspace=workspace, webhook_url=WEBHOOK + "2")

    # --- failures must never touch the activity pipeline --------------------
    def test_slack_outage_does_not_raise(self, sync, project, create_user, issue, mentioned):
        with patch("plane.bgtasks.slack_task.requests.post", side_effect=OSError("connection refused")):
            slack_activity_notify(
                str(project.id), str(create_user.id), str(issue.id), _activity("comment", _mention(mentioned.id))
            )

    def test_malformed_payload_does_not_raise(self, sync, project, create_user, issue):
        with patch("plane.bgtasks.slack_task.requests.post") as post:
            slack_activity_notify(str(project.id), str(create_user.id), str(issue.id), "not json")
        post.assert_not_called()
