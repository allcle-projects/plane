/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Page Collections — mote.
// See docs/mote-design/02-wiki-publishing.md, Feature 4.
//
// One collection row inside the wiki Collections rail: a disclosure that
// expands to list the collection's pages (resolved via the workspace page
// store), with an overflow menu for rename/delete.

import { useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Disclosure, Transition } from "@headlessui/react";
import { FolderClosed } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { ChevronRightIcon, PageIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { CustomMenu } from "@plane/ui";
import { cn, getPageName } from "@plane/utils";
// plane web hooks
import { EPageStoreType, usePageStore } from "@/plane-web/hooks/store";
import { usePageCollections } from "@/plane-web/hooks/store/use-page-collections";
// plane web types
import type { TPageCollection } from "@/plane-web/types/page-collections";

type Props = {
  collection: TPageCollection;
};

export const PageCollectionItem = observer(function PageCollectionItem(props: Props) {
  const { collection } = props;
  // states
  const [isOpen, setIsOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [name, setName] = useState(collection.name);
  // router
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  // store hooks
  const { updateCollection, deleteCollection } = usePageCollections();
  const { getPageById } = usePageStore(EPageStoreType.WORKSPACE);
  // translation
  const { t } = useTranslation();

  const handleRename = async () => {
    const trimmedName = name.trim();
    setIsRenaming(false);
    if (!trimmedName || trimmedName === collection.name) {
      setName(collection.name);
      return;
    }
    try {
      await updateCollection(slug, collection.id, { name: trimmedName });
    } catch {
      setName(collection.name);
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t("page_collections.toast.rename_error"),
      });
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(t("page_collections.delete_confirmation"))) return;
    try {
      await deleteCollection(slug, collection.id);
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t("page_collections.toast.delete_error"),
      });
    }
  };

  return (
    <Disclosure as="div" className="flex flex-col" defaultOpen={false}>
      <div className="group flex w-full items-center justify-between rounded-sm px-2 py-1 hover:bg-layer-transparent-hover">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <Disclosure.Button
            as="button"
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className="flex flex-shrink-0 items-center gap-1.5"
          >
            <ChevronRightIcon
              className={cn("size-3 flex-shrink-0 text-tertiary transition-all", {
                "rotate-90": isOpen,
              })}
            />
            {collection.logo_props?.in_use ? (
              <Logo logo={collection.logo_props} size={14} type="lucide" />
            ) : (
              <FolderClosed className="size-3.5 flex-shrink-0 text-tertiary" />
            )}
          </Disclosure.Button>
          {isRenaming ? (
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleRename();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setName(collection.name);
                  setIsRenaming(false);
                }
              }}
              className="w-full min-w-0 rounded-sm bg-layer-transparent-hover px-1 text-13 text-primary outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setIsOpen((prev) => !prev)}
              className="min-w-0 flex-1 truncate text-left text-13 font-medium text-secondary"
            >
              {collection.name}
            </button>
          )}
        </div>
        <div className="pointer-events-none flex items-center opacity-0 group-hover:pointer-events-auto group-hover:opacity-100">
          <CustomMenu ellipsis placement="bottom-end" closeOnSelect buttonClassName="flex-shrink-0 p-0.5 rounded-sm hover:bg-layer-1">
            <CustomMenu.MenuItem
              onClick={() => {
                setIsRenaming(true);
                setIsOpen(true);
              }}
            >
              {t("page_collections.rename")}
            </CustomMenu.MenuItem>
            <CustomMenu.MenuItem onClick={handleDelete} className="text-danger-primary">
              {t("page_collections.delete")}
            </CustomMenu.MenuItem>
          </CustomMenu>
        </div>
      </div>
      <Transition
        show={isOpen}
        enter="transition duration-100 ease-out"
        enterFrom="transform scale-95 opacity-0"
        enterTo="transform scale-100 opacity-100"
        leave="transition duration-75 ease-out"
        leaveFrom="transform scale-100 opacity-100"
        leaveTo="transform scale-95 opacity-0"
      >
        {isOpen && (
          <Disclosure.Panel as="div" className="ml-4 flex flex-col gap-0.5" static>
            {collection.page_ids.length === 0 && (
              <span className="px-2 py-1 text-13 text-placeholder">{t("page_collections.no_pages")}</span>
            )}
            {collection.page_ids.map((pageId) => {
              const page = getPageById(pageId);
              if (!page) return null;
              return (
                <Link
                  key={pageId}
                  href={page.getRedirectionLink()}
                  className="flex items-center gap-1.5 truncate rounded-sm px-2 py-1 text-13 text-secondary hover:bg-layer-transparent-hover"
                >
                  {page.logo_props?.in_use ? (
                    <Logo logo={page.logo_props} size={14} type="lucide" />
                  ) : (
                    <PageIcon className="size-3.5 flex-shrink-0 text-tertiary" />
                  )}
                  <span className="truncate">{getPageName(page.name)}</span>
                </Link>
              );
            })}
          </Disclosure.Panel>
        )}
      </Transition>
    </Disclosure>
  );
});
