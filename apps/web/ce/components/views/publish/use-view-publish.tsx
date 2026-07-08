/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Globe } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TContextMenuItem } from "@plane/ui";

/**
 * Publish-view context menu entry + modal-open state — mote
 * (docs/mote-design/02-wiki-publishing.md, Feature 5). Consumed by
 * `core/components/views/quick-actions.tsx` (context menu item) and
 * `core/components/views/view-list-item-action.tsx` (the "Live" badge click target).
 */
export const useViewPublish = (isPublished: boolean, isAuthorized: boolean) => {
  const [isPublishModalOpen, setPublishModalOpen] = useState(false);
  const { t } = useTranslation();

  const publishContextMenu: TContextMenuItem | undefined = isAuthorized
    ? {
        key: "publish",
        title: isPublished ? t("publish_view.menu_update_label") : t("publish_view.menu_label"),
        icon: Globe,
        action: () => setPublishModalOpen(true),
      }
    : undefined;

  return {
    isPublishModalOpen,
    setPublishModalOpen,
    publishContextMenu,
  };
};
