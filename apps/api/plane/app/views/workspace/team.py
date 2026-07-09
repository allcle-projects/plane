# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Teamspaces — CRUD + member/project membership + work-item aggregation (mote).
# See docs/mote-design/05-teamspaces-access.md, section 1.
#
# A Teamspace (``Team``) is a workspace-scoped sub-grouping that bundles a set of
# members and a set of projects and exposes a team-scoped work-item feed (union
# of issues across the team's projects). Membership is an *organizational
# overlay* — it does NOT grant project access on its own (that stays on
# ProjectMember / WorkspaceMember). This layer manages storage + membership;
# team-scoped views/pages (phase 3) are a later addition.

# Django imports
from django.db import IntegrityError
from django.db.models import Q

# Third party imports
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny

# Module imports
from ..base import BaseViewSet, BaseAPIView
from plane.app.permissions import allow_permission, ROLE
from plane.app.serializers import (
    TeamSerializer,
    TeamMemberSerializer,
    TeamProjectSerializer,
    IssueSerializer,
    IssueViewSerializer,
    PageSerializer,
)
from plane.db.models import (
    Workspace,
    Team,
    TeamMember,
    TeamProject,
    Project,
    Issue,
    IssueView,
    Page,
)


class TeamViewSet(BaseViewSet):
    serializer_class = TeamSerializer
    model = Team

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .select_related("workspace", "lead")
            .prefetch_related("team_member", "team_project")
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug):
        teams = self.get_queryset()
        # Optional ?project_id= filter — powers the project members-settings
        # slot ("which teamspaces does this project belong to").
        project_id = request.query_params.get("project_id")
        if project_id:
            teams = teams.filter(
                team_project__project_id=project_id,
                team_project__deleted_at__isnull=True,
            ).distinct()
        serializer = TeamSerializer(teams, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        team = self.get_queryset().get(pk=pk)
        serializer = TeamSerializer(team)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def create(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        serializer = TeamSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(
                workspace_id=workspace.id,
                created_by_id=request.user.id,
                updated_by_id=request.user.id,
            )
            # Creator is added as a team member by default.
            team_id = serializer.data.get("id")
            if not TeamMember.objects.filter(
                team_id=team_id,
                member_id=request.user.id,
                deleted_at__isnull=True,
            ).exists():
                TeamMember.objects.create(
                    team_id=team_id,
                    member_id=request.user.id,
                    workspace_id=workspace.id,
                    created_by_id=request.user.id,
                    updated_by_id=request.user.id,
                )
            # Re-serialize so member_ids reflects the creator membership.
            team = self.get_queryset().get(pk=team_id)
            return Response(
                TeamSerializer(team).data, status=status.HTTP_201_CREATED
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        team = self.get_queryset().get(pk=pk)
        serializer = TeamSerializer(team, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save(updated_by_id=request.user.id)
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def destroy(self, request, slug, pk):
        team = self.get_queryset().get(pk=pk)
        team.delete()  # soft-delete (deleted_at)
        return Response(status=status.HTTP_204_NO_CONTENT)


class TeamMemberEndpoint(BaseAPIView):
    """Manage the members of a Teamspace."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, team_id):
        team_members = TeamMember.objects.filter(
            workspace__slug=slug, team_id=team_id
        ).select_related("member")
        serializer = TeamMemberSerializer(team_members, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug, team_id):
        team = Team.objects.get(workspace__slug=slug, pk=team_id)
        # Accept a single member_id or a bulk member_ids list.
        member_ids = request.data.get("member_ids", [])
        if not member_ids and request.data.get("member_id"):
            member_ids = [request.data.get("member_id")]

        # Only users who are actually members of this workspace.
        from plane.db.models import WorkspaceMember

        valid_member_ids = WorkspaceMember.objects.filter(
            workspace_id=team.workspace_id,
            member_id__in=member_ids,
            is_active=True,
        ).values_list("member_id", flat=True)

        created = []
        for member_id in valid_member_ids:
            try:
                team_member = TeamMember.objects.create(
                    workspace_id=team.workspace_id,
                    team_id=team.id,
                    member_id=member_id,
                    created_by_id=request.user.id,
                    updated_by_id=request.user.id,
                )
                created.append(team_member)
            except IntegrityError:
                # Already a member (partial unique constraint) — skip.
                continue

        serializer = TeamMemberSerializer(created, many=True)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def delete(self, request, slug, team_id, member_id):
        team_member = TeamMember.objects.get(
            workspace__slug=slug, team_id=team_id, member_id=member_id
        )
        team_member.delete()  # soft-delete (deleted_at)
        return Response(status=status.HTTP_204_NO_CONTENT)


class TeamProjectEndpoint(BaseAPIView):
    """Manage the projects a Teamspace bundles."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, team_id):
        team_projects = TeamProject.objects.filter(
            workspace__slug=slug, team_id=team_id
        ).select_related("project")
        serializer = TeamProjectSerializer(team_projects, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug, team_id):
        team = Team.objects.get(workspace__slug=slug, pk=team_id)
        # Accept a single project_id or a bulk project_ids list.
        project_ids = request.data.get("project_ids", [])
        if not project_ids and request.data.get("project_id"):
            project_ids = [request.data.get("project_id")]

        # Only projects that actually belong to this workspace.
        valid_project_ids = Project.objects.filter(
            workspace_id=team.workspace_id, pk__in=project_ids
        ).values_list("id", flat=True)

        created = []
        for project_id in valid_project_ids:
            try:
                team_project = TeamProject.objects.create(
                    workspace_id=team.workspace_id,
                    team_id=team.id,
                    project_id=project_id,
                    created_by_id=request.user.id,
                    updated_by_id=request.user.id,
                )
                created.append(team_project)
            except IntegrityError:
                # Already linked (partial unique constraint) — skip.
                continue

        serializer = TeamProjectSerializer(created, many=True)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def delete(self, request, slug, team_id, project_id):
        team_project = TeamProject.objects.get(
            workspace__slug=slug, team_id=team_id, project_id=project_id
        )
        team_project.delete()  # soft-delete (deleted_at)
        return Response(status=status.HTTP_204_NO_CONTENT)


class TeamWorkItemsEndpoint(BaseAPIView):
    """Team-scoped work-item feed: the union of issues across the team's
    projects. Read-only aggregation (phase 2 surface). Only projects the
    requesting user can actually see are included, so this overlay never leaks
    issues from projects the user has no access to."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, team_id):
        team = Team.objects.get(workspace__slug=slug, pk=team_id)
        team_project_ids = TeamProject.objects.filter(
            team_id=team.id, deleted_at__isnull=True
        ).values_list("project_id", flat=True)

        # Restrict to projects the user is a member of — a teamspace is an
        # organizational overlay and must not grant cross-project read access.
        from plane.db.models import ProjectMember

        visible_project_ids = ProjectMember.objects.filter(
            workspace__slug=slug,
            project_id__in=team_project_ids,
            member=request.user,
            is_active=True,
        ).values_list("project_id", flat=True)

        issues = (
            Issue.issue_objects.filter(
                workspace__slug=slug, project_id__in=visible_project_ids
            )
            .select_related("workspace", "project", "state", "parent")
            .prefetch_related("assignees", "labels")
        )
        serializer = IssueSerializer(issues, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class TeamViewEndpoint(BaseAPIView):
    """Teamspaces P3 — views owned by a Teamspace. A team view is a
    workspace-level saved view (project null) tagged with the team, so it shows
    up in the teamspace instead of a single project."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, team_id):
        views = IssueView.objects.filter(
            workspace__slug=slug, team_id=team_id
        ).select_related("workspace", "owned_by")
        serializer = IssueViewSerializer(views, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug, team_id):
        team = Team.objects.get(workspace__slug=slug, pk=team_id)
        serializer = IssueViewSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(
                workspace_id=team.workspace_id,
                team_id=team.id,
                owned_by_id=request.user.id,
                created_by_id=request.user.id,
                updated_by_id=request.user.id,
            )
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def delete(self, request, slug, team_id, view_id):
        view = IssueView.objects.get(workspace__slug=slug, team_id=team_id, pk=view_id)
        view.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TeamPageEndpoint(BaseAPIView):
    """Teamspaces P3 — pages owned by a Teamspace. A team page is a workspace
    page (no project link) tagged with the team, giving the teamspace its own
    wiki space."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, team_id):
        pages = Page.objects.filter(
            workspace__slug=slug, team_id=team_id
        ).select_related("workspace", "owned_by")
        serializer = PageSerializer(pages, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug, team_id):
        team = Team.objects.get(workspace__slug=slug, pk=team_id)
        # PageSerializer.create is coupled to the project-page context flow, so
        # create the workspace/team page directly then serialize for the response.
        page = Page.objects.create(
            workspace_id=team.workspace_id,
            team_id=team.id,
            name=request.data.get("name", ""),
            access=request.data.get("access", 0),
            color=request.data.get("color", ""),
            owned_by_id=request.user.id,
            created_by_id=request.user.id,
            updated_by_id=request.user.id,
        )
        serializer = PageSerializer(page)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def delete(self, request, slug, team_id, page_id):
        page = Page.objects.get(workspace__slug=slug, team_id=team_id, pk=page_id)
        page.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PublicTeamspaceEndpoint(BaseAPIView):
    """Teamspaces P4 — anonymous read of a PUBLIC teamspace. Exposes only the
    team name/description and its public pages (access == public). Work items
    stay access-scoped and are never exposed here. 404 unless the team exists
    and is_public is true."""

    permission_classes = [AllowAny]

    def get(self, request, slug, team_id):
        team = Team.objects.filter(
            workspace__slug=slug, pk=team_id, is_public=True
        ).first()
        if team is None:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)

        public_pages = Page.objects.filter(
            workspace__slug=slug, team_id=team.id, access=0
        ).values("id", "name", "description_html")

        return Response(
            {
                "id": str(team.id),
                "name": team.name,
                "description": team.description,
                "logo_props": team.logo_props,
                "pages": list(public_pages),
            },
            status=status.HTTP_200_OK,
        )
