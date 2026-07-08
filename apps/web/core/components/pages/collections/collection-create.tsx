/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Page Collections — mote.
// See docs/mote-design/02-wiki-publishing.md, Feature 4.
//
// Inline "+ New collection" affordance. Clicking it reveals a text input;
// Enter creates the collection, Escape/blur-without-value cancels. Deliberately
// kept as a plain inline input (no modal) per the MVP scope of Feature 4.

import { useState } from "react";
import { observer } from "mobx-react";
import { Plus } from "lucide-react";
import { useParams } from "next/navigation";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { cn } from "@plane/utils";
// hooks
import { usePageCollections } from "@/plane-web/hooks/store/use-page-collections";

export const PageCollectionCreate = observer(function PageCollectionCreate() {
  // states
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // router
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  // store hooks
  const { createCollection } = usePageCollections();
  // translation
  const { t } = useTranslation();

  const resetState = () => {
    setIsCreating(false);
    setName("");
  };

  const handleCreate = async () => {
    const trimmedName = name.trim();
    if (!trimmedName || !slug) {
      resetState();
      return;
    }
    setIsSubmitting(true);
    try {
      await createCollection(slug, { name: trimmedName, page_ids: [] });
      resetState();
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t("page_collections.toast.create_error"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isCreating) {
    return (
      <input
        autoFocus
        type="text"
        value={name}
        placeholder={t("page_collections.create_placeholder")}
        disabled={isSubmitting}
        onChange={(e) => setName(e.target.value)}
        onBlur={handleCreate}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleCreate();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            resetState();
          }
        }}
        className="w-full rounded-sm bg-layer-transparent-hover px-2 py-1 text-13 text-primary outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setIsCreating(true)}
      className={cn(
        "flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-left text-13 font-medium text-tertiary hover:bg-layer-transparent-hover"
      )}
    >
      <Plus className="size-3.5 flex-shrink-0" />
      <span>{t("page_collections.new_collection")}</span>
    </button>
  );
});
