/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Teamspaces — mote.
// See docs/mote-design/05-teamspaces-access.md, section 1.

"use client";

import { useParams } from "next/navigation";
import { TeamspaceDetailRoot } from "@/plane-web/components/teamspaces";

function TeamspaceDetailPage() {
  const { teamId } = useParams();
  return <TeamspaceDetailRoot teamId={teamId?.toString() ?? ""} />;
}

export default TeamspaceDetailPage;
