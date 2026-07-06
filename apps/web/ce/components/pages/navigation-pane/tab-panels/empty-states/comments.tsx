/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { MessageSquare } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";

export function PageNavigationPaneCommentsTabEmptyState() {
  // translation
  const { t } = useTranslation();

  return (
    <div className="grid size-full place-items-center">
      <div className="flex flex-col items-center gap-y-6 text-center">
        <MessageSquare className="size-10 text-tertiary" strokeWidth={1.5} />
        <div className="space-y-2.5">
          <h4 className="text-14 font-medium">{t("page_navigation_pane.tabs.comments.empty_state.title")}</h4>
          <p className="text-13 font-medium text-secondary">
            {t("page_navigation_pane.tabs.comments.empty_state.description")}
          </p>
        </div>
      </div>
    </div>
  );
}
