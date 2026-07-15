# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Contract tests for IssueView.column_order (mote — Table/DB view, docs/mote-design/12
Phase 2). Covers project-scoped views and workspace-scoped ("global") views, since both
route through the same IssueView model (project__isnull=True distinguishes global views).

These tests reconstruct, as pytest cases, the manual verification suite that was run
against the live server3 deployment (mote.43/46/47/48) during initial rollout — see
docs/mote-design/12 for the deployment history and the commit trail (ef3d154, 0b72ee9,
dfd46d2). Re-running this suite is the regression check for any future change that
touches IssueView, IssueViewSerializer, or the display_properties/column_order pair.
"""

import pytest
from rest_framework import status

from plane.db.models import IssueView, ProjectMember
from plane.tests.factories import ProjectFactory


@pytest.fixture
def project(workspace, create_user):
    """A project in `workspace`, with `create_user` as an active admin member.

    Project-scoped view endpoints are gated at the PROJECT permission level, which
    is separate from the WorkspaceMember role the `workspace` fixture already grants.
    """
    proj = ProjectFactory(workspace=workspace, created_by=workspace.owner, updated_by=workspace.owner)
    ProjectMember.objects.create(project=proj, member=create_user, role=20, is_active=True)
    return proj


def project_views_url(workspace_slug, project_id, view_id=None):
    base = f"/api/workspaces/{workspace_slug}/projects/{project_id}/views/"
    return f"{base}{view_id}/" if view_id else base


def global_views_url(workspace_slug, view_id=None):
    base = f"/api/workspaces/{workspace_slug}/views/"
    return f"{base}{view_id}/" if view_id else base


@pytest.mark.contract
@pytest.mark.django_db
class TestProjectViewColumnOrder:
    """column_order on a project-scoped IssueView."""

    def test_new_view_defaults_to_empty_column_order(self, session_client, workspace, project):
        resp = session_client.post(
            project_views_url(workspace.slug, project.id),
            {"name": "table-view", "filters": {}},
            format="json",
        )
        assert resp.status_code == status.HTTP_201_CREATED
        assert resp.data["column_order"] == []

    def test_patch_column_order_persists_across_refetch(self, session_client, workspace, project):
        create_resp = session_client.post(
            project_views_url(workspace.slug, project.id),
            {"name": "table-view", "filters": {}},
            format="json",
        )
        view_id = create_resp.data["id"]

        patch_resp = session_client.patch(
            project_views_url(workspace.slug, project.id, view_id),
            {"column_order": ["priority", "state", "assignee"]},
            format="json",
        )
        assert patch_resp.status_code == status.HTTP_200_OK

        get_resp = session_client.get(project_views_url(workspace.slug, project.id, view_id))
        assert get_resp.data["column_order"] == ["priority", "state", "assignee"]

    def test_column_order_write_does_not_affect_display_properties(self, session_client, workspace, project):
        create_resp = session_client.post(
            project_views_url(workspace.slug, project.id),
            {"name": "table-view", "filters": {}},
            format="json",
        )
        view_id = create_resp.data["id"]
        original_display_properties = dict(create_resp.data["display_properties"])

        session_client.patch(
            project_views_url(workspace.slug, project.id, view_id),
            {"column_order": ["priority", "state"]},
            format="json",
        )

        get_resp = session_client.get(project_views_url(workspace.slug, project.id, view_id))
        assert get_resp.data["display_properties"] == original_display_properties

    def test_empty_list_resets_order(self, session_client, workspace, project):
        create_resp = session_client.post(
            project_views_url(workspace.slug, project.id),
            {"name": "table-view", "filters": {}, "column_order": ["state"]},
            format="json",
        )
        view_id = create_resp.data["id"]

        resp = session_client.patch(
            project_views_url(workspace.slug, project.id, view_id),
            {"column_order": []},
            format="json",
        )
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["column_order"] == []

    def test_unknown_property_names_are_stored_as_is(self, session_client, workspace, project):
        """The backend does not validate column_order contents (matches the
        pre-existing display_properties field's behavior). Filtering unknown/stale
        property names (e.g. from a removed custom field) is the frontend's job at
        render time, not the API's."""
        create_resp = session_client.post(
            project_views_url(workspace.slug, project.id),
            {"name": "table-view", "filters": {}},
            format="json",
        )
        view_id = create_resp.data["id"]

        resp = session_client.patch(
            project_views_url(workspace.slug, project.id, view_id),
            {"column_order": ["state", "not_a_real_property", "priority"]},
            format="json",
        )
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["column_order"] == ["state", "not_a_real_property", "priority"]

    def test_non_array_value_is_accepted_by_backend(self, session_client, workspace, project):
        """Documents a deliberate trade-off, not a desired behavior: column_order is
        an unvalidated JSONField, same as display_properties, so a malformed type
        (e.g. a raw string) is accepted rather than rejected with 400. The actual
        defense against this is a frontend Array.isArray() guard in
        spreadsheet-view.tsx (dfd46d2) — this test exists so that if backend
        validation is ever added, this assertion is the one to flip to 400."""
        create_resp = session_client.post(
            project_views_url(workspace.slug, project.id),
            {"name": "table-view", "filters": {}},
            format="json",
        )
        view_id = create_resp.data["id"]

        resp = session_client.patch(
            project_views_url(workspace.slug, project.id, view_id),
            {"column_order": "not-an-array"},
            format="json",
        )
        assert resp.status_code == status.HTTP_200_OK

    def test_anonymous_request_is_rejected(self, api_client, workspace, project):
        view = IssueView.objects.create(
            name="table-view", project=project, workspace=workspace, owned_by=workspace.owner
        )
        resp = api_client.patch(
            project_views_url(workspace.slug, project.id, view.id),
            {"column_order": ["state"]},
            format="json",
        )
        assert resp.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)

    def test_rapid_sequential_writes_last_write_wins(self, session_client, workspace, project):
        create_resp = session_client.post(
            project_views_url(workspace.slug, project.id),
            {"name": "table-view", "filters": {}},
            format="json",
        )
        view_id = create_resp.data["id"]

        orders = [["state", "priority"], ["priority", "state"], ["assignee", "state", "priority"], ["labels"]]
        for order in orders:
            resp = session_client.patch(
                project_views_url(workspace.slug, project.id, view_id),
                {"column_order": order},
                format="json",
            )
            assert resp.status_code == status.HTTP_200_OK

        final = session_client.get(project_views_url(workspace.slug, project.id, view_id))
        assert final.data["column_order"] == orders[-1]


@pytest.mark.contract
@pytest.mark.django_db
class TestWorkspaceViewColumnOrder:
    """column_order on a workspace-scoped ("global") IssueView — same model
    (project__isnull=True), reached through a different URL/viewset."""

    def test_create_and_persist_column_order(self, session_client, workspace):
        create_resp = session_client.post(
            global_views_url(workspace.slug),
            {"name": "global-table-view", "filters": {}},
            format="json",
        )
        assert create_resp.status_code == status.HTTP_201_CREATED
        view_id = create_resp.data["id"]

        patch_resp = session_client.patch(
            global_views_url(workspace.slug, view_id),
            {"column_order": ["assignee", "labels"]},
            format="json",
        )
        assert patch_resp.status_code == status.HTTP_200_OK

        get_resp = session_client.get(global_views_url(workspace.slug, view_id))
        assert get_resp.data["column_order"] == ["assignee", "labels"]

    def test_project_and_global_view_column_order_are_independent(self, session_client, workspace, project):
        proj_resp = session_client.post(
            project_views_url(workspace.slug, project.id),
            {"name": "proj-view", "filters": {}},
            format="json",
        )
        proj_view_id = proj_resp.data["id"]
        session_client.patch(
            project_views_url(workspace.slug, project.id, proj_view_id),
            {"column_order": ["state"]},
            format="json",
        )

        glob_resp = session_client.post(
            global_views_url(workspace.slug),
            {"name": "glob-view", "filters": {}},
            format="json",
        )
        glob_view_id = glob_resp.data["id"]
        session_client.patch(
            global_views_url(workspace.slug, glob_view_id),
            {"column_order": ["assignee", "labels"]},
            format="json",
        )

        proj_final = session_client.get(project_views_url(workspace.slug, project.id, proj_view_id))
        glob_final = session_client.get(global_views_url(workspace.slug, glob_view_id))
        assert proj_final.data["column_order"] == ["state"]
        assert glob_final.data["column_order"] == ["assignee", "labels"]
        assert proj_final.data["column_order"] != glob_final.data["column_order"]


@pytest.mark.django_db
class TestIssueViewColumnOrderModel:
    """Unit-level checks on the model field itself, independent of the API layer."""

    def test_default_is_empty_list(self, workspace, project):
        view = IssueView(name="unit-test-view", project=project, workspace=workspace, owned_by=workspace.owner)
        assert view.column_order == []

    def test_accepts_list_assignment(self, workspace, project):
        view = IssueView(name="unit-test-view", project=project, workspace=workspace, owned_by=workspace.owner)
        view.column_order = ["state", "priority"]
        assert view.column_order == ["state", "priority"]

    def test_persists_through_save_and_reload(self, workspace, project):
        view = IssueView.objects.create(
            name="unit-test-view",
            project=project,
            workspace=workspace,
            owned_by=workspace.owner,
            column_order=["labels", "assignee"],
        )
        reloaded = IssueView.objects.get(id=view.id)
        assert reloaded.column_order == ["labels", "assignee"]
