/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Shared Pages — mote.
// See docs/mote-design/02-wiki-publishing.md, Feature 3.
//
// Frontend mirror of the backend ``PageCollaborator`` model
// (apps/api/plane/db/models/page.py, PageCollaboratorSerializer in
// apps/api/plane/app/serializers/page.py). Grants a named workspace member
// explicit view/edit access to an otherwise-private page. Field names match
// the serializer EXACTLY.

export const PAGE_COLLABORATOR_ROLE = {
  VIEWER: 5,
  MEMBER: 15,
  ADMIN: 20,
} as const;

export type TPageCollaboratorRole = (typeof PAGE_COLLABORATOR_ROLE)[keyof typeof PAGE_COLLABORATOR_ROLE];

export type TPageCollaboratorMemberDetail = {
  id: string;
  first_name?: string;
  last_name?: string;
  avatar?: string;
  avatar_url?: string;
  is_bot?: boolean;
  display_name?: string;
};

export type TPageCollaborator = {
  id: string;
  page: string;
  member: string;
  member_detail?: TPageCollaboratorMemberDetail;
  role: TPageCollaboratorRole;
  workspace: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
};

export type TPageCollaboratorCreatePayload = {
  member: string;
  role: TPageCollaboratorRole;
};

export type TPageCollaboratorUpdatePayload = {
  role: TPageCollaboratorRole;
};
