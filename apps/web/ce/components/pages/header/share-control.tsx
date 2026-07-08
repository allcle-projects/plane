/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Shared Pages — mote.
// See docs/mote-design/02-wiki-publishing.md, Feature 3.

import { useState } from "react";
import { observer } from "mobx-react";
import { Share2, X } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { setToast, TOAST_TYPE } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import { Avatar, CustomSelect, EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { getFileURL } from "@plane/utils";
// components
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
// hooks
import { useMember } from "@/hooks/store/use-member";
// plane web hooks
import type { EPageStoreType } from "@/plane-web/hooks/store";
// plane web store
import type { TExtendedPageInstance } from "@/plane-web/store/pages/extended-base-page";
// plane web types
import { PAGE_COLLABORATOR_ROLE, type TPageCollaboratorRole } from "@/plane-web/types/page-collaborators";
// store
import type { TPageInstance } from "@/store/pages/base-page";

export type TPageShareControlProps = {
  page: TPageInstance;
  storeType: EPageStoreType;
};

export const PageShareControl = observer(function PageShareControl({ page }: TPageShareControlProps) {
  // states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<TPageCollaboratorRole>(PAGE_COLLABORATOR_ROLE.VIEWER);
  const [isAdding, setIsAdding] = useState(false);
  // translation
  const { t } = useTranslation();
  // store hooks
  const {
    getUserDetails,
    workspace: { workspaceMemberIds },
  } = useMember();
  // the collaborators silo lives on `ExtendedBasePage` (ce/store/pages/extended-base-page.ts),
  // which every `BasePage` instance extends at runtime, but isn't part of the
  // exported `TPageInstance` type — bridge the two here.
  const extendedPage = page as unknown as TPageInstance & TExtendedPageInstance;
  const { collaborators, addCollaborator, updateCollaboratorRole, removeCollaborator } = extendedPage;

  // only the page owner may manage sharing (mirrors the backend's owner-only check)
  if (!page.isCurrentUserOwner) return null;

  const roleOptions: { value: TPageCollaboratorRole; label: string }[] = [
    { value: PAGE_COLLABORATOR_ROLE.VIEWER, label: t("page_share.role.viewer") },
    { value: PAGE_COLLABORATOR_ROLE.MEMBER, label: t("page_share.role.member") },
  ];
  const getRoleLabel = (role: TPageCollaboratorRole) =>
    roleOptions.find((option) => option.value === role)?.label ?? t("page_share.role.viewer");

  const availableMemberIds = (workspaceMemberIds ?? []).filter(
    (memberId) =>
      memberId !== page.owned_by && !collaborators.some((collaborator) => collaborator.member === memberId)
  );

  const handleOpen = () => {
    setIsModalOpen(true);
    extendedPage.fetchCollaborators();
  };

  const handleClose = () => {
    setIsModalOpen(false);
    setSelectedMemberId(null);
    setSelectedRole(PAGE_COLLABORATOR_ROLE.VIEWER);
  };

  const handleAdd = async () => {
    if (!selectedMemberId) return;
    setIsAdding(true);
    try {
      await addCollaborator(selectedMemberId, selectedRole);
      setSelectedMemberId(null);
      setSelectedRole(PAGE_COLLABORATOR_ROLE.VIEWER);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: t("page_share.toast.add_error") });
    } finally {
      setIsAdding(false);
    }
  };

  const handleRoleChange = async (memberId: string, role: TPageCollaboratorRole) => {
    try {
      await updateCollaboratorRole(memberId, role);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: t("page_share.toast.update_role_error") });
    }
  };

  const handleRemove = async (memberId: string) => {
    try {
      await removeCollaborator(memberId);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: t("page_share.toast.remove_error") });
    }
  };

  return (
    <>
      <Tooltip tooltipContent={t("page_share.button_label")} position="bottom">
        <button
          type="button"
          onClick={handleOpen}
          className="grid size-6 shrink-0 place-items-center rounded-sm text-secondary transition-colors hover:bg-layer-transparent-hover hover:text-primary"
          aria-label={t("page_share.button_label")}
        >
          <Share2 className="size-3.5" />
        </button>
      </Tooltip>
      <ModalCore
        isOpen={isModalOpen}
        handleClose={handleClose}
        position={EModalPosition.CENTER}
        width={EModalWidth.XL}
      >
        <div className="space-y-4 p-5">
          <h3 className="text-h5-medium text-primary">{t("page_share.modal_title")}</h3>

          <div className="flex items-center gap-2">
            <div className="flex-1">
              <MemberDropdown
                value={selectedMemberId}
                onChange={setSelectedMemberId}
                multiple={false}
                memberIds={availableMemberIds}
                placeholder={t("page_share.add_member_placeholder")}
                buttonVariant="border-with-text"
              />
            </div>
            <CustomSelect
              value={selectedRole}
              onChange={(value: TPageCollaboratorRole) => setSelectedRole(value)}
              label={getRoleLabel(selectedRole)}
              buttonClassName="border border-strong"
            >
              {roleOptions.map((option) => (
                <CustomSelect.Option key={option.value} value={option.value}>
                  {option.label}
                </CustomSelect.Option>
              ))}
            </CustomSelect>
            <Button variant="primary" size="sm" onClick={handleAdd} disabled={!selectedMemberId} loading={isAdding}>
              {t("page_share.add")}
            </Button>
          </div>

          <div className="space-y-2">
            <h4 className="text-body-xs-medium text-secondary">{t("page_share.current_collaborators")}</h4>
            {collaborators.length === 0 && (
              <p className="text-body-xs-regular text-placeholder">{t("page_share.empty")}</p>
            )}
            {collaborators.map((collaborator) => {
              const member = getUserDetails(collaborator.member);
              return (
                <div key={collaborator.id} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Avatar name={member?.display_name} src={getFileURL(member?.avatar_url ?? "")} />
                    <span className="text-body-xs-regular text-primary">{member?.display_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CustomSelect
                      value={collaborator.role}
                      onChange={(value: TPageCollaboratorRole) => handleRoleChange(collaborator.member, value)}
                      label={getRoleLabel(collaborator.role)}
                      buttonClassName="border border-strong"
                    >
                      {roleOptions.map((option) => (
                        <CustomSelect.Option key={option.value} value={option.value}>
                          {option.label}
                        </CustomSelect.Option>
                      ))}
                    </CustomSelect>
                    <button
                      type="button"
                      onClick={() => handleRemove(collaborator.member)}
                      className="grid size-6 shrink-0 place-items-center rounded-sm text-secondary transition-colors hover:bg-layer-transparent-hover hover:text-danger-primary"
                      aria-label={t("page_share.remove")}
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </ModalCore>
    </>
  );
});
