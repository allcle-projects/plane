/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Shared Pages — mote.
// See docs/mote-design/02-wiki-publishing.md, Feature 3.

import { useEffect } from "react";
import { observer } from "mobx-react";
// plane imports
import { Avatar, AvatarGroup } from "@plane/ui";
import { getFileURL } from "@plane/utils";
// hooks
import { useMember } from "@/hooks/store/use-member";
// store
import type { TPageInstance } from "@/store/pages/base-page";
// plane web store
import type { TExtendedPageInstance } from "@/plane-web/store/pages/extended-base-page";

export type TPageCollaboratorsListProps = {
  page: TPageInstance;
};

export const PageCollaboratorsList = observer(function PageCollaboratorsList({ page }: TPageCollaboratorsListProps) {
  // the collaborators silo lives on `ExtendedBasePage` (ce/store/pages/extended-base-page.ts),
  // which every `BasePage` instance extends at runtime, but isn't part of the
  // exported `TPageInstance` type — bridge the two here.
  const extendedPage = page as unknown as TPageInstance & TExtendedPageInstance;
  const { collaborators, fetchCollaborators } = extendedPage;
  // store hooks
  const { getUserDetails } = useMember();

  useEffect(() => {
    fetchCollaborators();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id]);

  if (!collaborators || collaborators.length === 0) return null;

  return (
    <AvatarGroup size="sm" showTooltip>
      {collaborators.map((collaborator) => {
        const member = getUserDetails(collaborator.member);
        return (
          <Avatar
            key={collaborator.id}
            name={member?.display_name}
            src={getFileURL(member?.avatar_url ?? "")}
          />
        );
      })}
    </AvatarGroup>
  );
});
