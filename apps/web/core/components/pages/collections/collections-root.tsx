/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Page Collections — mote.
// See docs/mote-design/02-wiki-publishing.md, Feature 4.
//
// Collapsible "Collections" rail for the workspace wiki. Mirrors the
// Disclosure/Transition pattern used by the workspace sidebar's menu section
// (core/components/workspace/sidebar/sidebar-menu-items.tsx).

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { Disclosure, Transition } from "@headlessui/react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { ChevronRightIcon } from "@plane/propel/icons";
import { cn } from "@plane/utils";
// hooks
import useLocalStorage from "@/hooks/use-local-storage";
import { useWorkspace } from "@/hooks/store/use-workspace";
// plane web hooks
import { usePageCollections } from "@/plane-web/hooks/store/use-page-collections";
// local imports
import { PageCollectionCreate } from "./collection-create";
import { PageCollectionItem } from "./collection-item";

export const PageCollectionsRoot = observer(function PageCollectionsRoot() {
  // router
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  // store hooks
  const { fetchCollections, getCollectionsForWorkspace } = usePageCollections();
  const { getWorkspaceBySlug } = useWorkspace();
  // the collection.workspace field is the workspace UUID, so resolve slug -> id
  const workspaceId = getWorkspaceBySlug(slug)?.id ?? "";
  // local storage
  const { setValue: toggleOpen, storedValue: isOpen } = useLocalStorage<boolean>("is_page_collections_open", true);
  // translation
  const { t } = useTranslation();
  // fetch collections for the workspace
  useSWR(slug ? `WORKSPACE_PAGE_COLLECTIONS_${slug}` : null, slug ? () => fetchCollections(slug) : null);

  const collections = getCollectionsForWorkspace(workspaceId);

  return (
    <div className="flex w-64 flex-shrink-0 flex-col gap-1 border-r border-subtle px-2 py-3">
      <Disclosure as="div" className="flex flex-col" defaultOpen={!!isOpen}>
        <div className="group flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-placeholder hover:bg-layer-transparent-hover">
          <Disclosure.Button
            as="button"
            type="button"
            className="flex w-full items-center gap-1 text-left text-13 font-semibold whitespace-nowrap text-placeholder"
            onClick={() => toggleOpen(!isOpen)}
          >
            <ChevronRightIcon
              className={cn("size-3 flex-shrink-0 transition-all", {
                "rotate-90": isOpen,
              })}
            />
            <span>{t("page_collections.title")}</span>
          </Disclosure.Button>
        </div>
        <Transition
          show={!!isOpen}
          enter="transition duration-100 ease-out"
          enterFrom="transform scale-95 opacity-0"
          enterTo="transform scale-100 opacity-100"
          leave="transition duration-75 ease-out"
          leaveFrom="transform scale-100 opacity-100"
          leaveTo="transform scale-95 opacity-0"
        >
          {isOpen && (
            <Disclosure.Panel as="div" className="flex flex-col gap-0.5" static>
              {collections.length === 0 && (
                <span className="px-2 py-1 text-13 text-placeholder">{t("page_collections.empty")}</span>
              )}
              {collections.map((collection) => (
                <PageCollectionItem key={collection.id} collection={collection} />
              ))}
              <PageCollectionCreate />
            </Disclosure.Panel>
          )}
        </Transition>
      </Disclosure>
    </div>
  );
});
