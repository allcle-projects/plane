/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { GlobeIcon, NewTabIcon, CheckIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IProjectView, TProjectPublishLayouts, TViewPublishSettings } from "@plane/types";
import { Loader, ToggleSwitch, CustomSelect, ModalCore, EModalWidth } from "@plane/ui";
import { copyTextToClipboard, getPublishViewLink } from "@plane/utils";
// hooks
import { useProjectView } from "@/hooks/store/use-project-view";

/**
 * Publish-view modal — mote (docs/mote-design/02-wiki-publishing.md, Feature 5). Adapted from
 * `core/components/project/publish-project/modal.tsx` (PublishProjectModal), targeting the
 * view-scoped `view-deploy-boards` endpoints instead of `project-deploy-boards`.
 *
 * NOTE: unlike the project publish flow, the backend exposes no PATCH on the view deploy board —
 * `create` upserts (`get_or_create` + save) by [entity_name, entity_identifier] — so both the
 * initial publish and later settings updates go through the same `publishView` call.
 */
type Props = {
  isOpen: boolean;
  view: IProjectView;
  onClose: () => void;
};

const defaultValues: Partial<TViewPublishSettings> = {
  is_comments_enabled: false,
  is_reactions_enabled: false,
  is_votes_enabled: false,
  inbox: null,
  view_props: {
    list: true,
    kanban: true,
  },
};

const VIEW_OPTIONS: {
  key: TProjectPublishLayouts;
  label: string;
}[] = [
  { key: "list", label: "List" },
  { key: "kanban", label: "Kanban" },
];

export const PublishViewModal = observer(function PublishViewModal(props: Props) {
  const { isOpen, onClose, view } = props;
  // states
  const [isUnPublishing, setIsUnPublishing] = useState(false);
  // router
  const { workspaceSlug } = useParams();
  // i18n
  const { t } = useTranslation();
  // store hooks
  const {
    fetchViewPublishSettings,
    getViewPublishSettings,
    publishView,
    unpublishView,
    viewPublishFetchLoader,
  } = useProjectView();
  // derived values
  const viewId = view.id;
  const projectId = view.project;
  const viewPublishSettings = getViewPublishSettings(viewId);
  const isViewPublished = !!viewPublishSettings?.anchor;
  // form info
  const {
    control,
    formState: { isDirty, isSubmitting },
    handleSubmit,
    reset,
    watch,
  } = useForm({
    defaultValues,
  });

  const handleClose = () => {
    onClose();
  };

  // fetch publish settings
  useEffect(() => {
    if (!workspaceSlug || !isOpen) return;

    if (!viewPublishSettings) {
      fetchViewPublishSettings(workspaceSlug.toString(), projectId, viewId);
    }
  }, [fetchViewPublishSettings, isOpen, projectId, viewId, viewPublishSettings, workspaceSlug]);

  const handlePublishView = async (payload: Partial<TViewPublishSettings>) => {
    if (!workspaceSlug) return;
    await publishView(workspaceSlug.toString(), projectId, viewId, payload);
  };

  const handleUnPublishView = async (publishId: string) => {
    if (!workspaceSlug || !publishId) return;

    setIsUnPublishing(true);

    await unpublishView(workspaceSlug.toString(), projectId, viewId, publishId)
      .catch(() =>
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Error!",
          message: t("publish_view.toast.unpublish_error"),
        })
      )
      .finally(() => setIsUnPublishing(false));
  };

  const selectedLayouts = Object.entries(watch("view_props") ?? {})
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .filter(([key, value]) => value)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .map(([key, value]) => key)
    .filter((l) => VIEW_OPTIONS.find((o) => o.key === l));

  const handleFormSubmit = async (formData: Partial<TViewPublishSettings>) => {
    if (!selectedLayouts || selectedLayouts.length === 0) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: t("publish_view.toast.layout_required"),
      });
      return;
    }

    const payload: Partial<TViewPublishSettings> = {
      is_comments_enabled: formData.is_comments_enabled,
      is_reactions_enabled: formData.is_reactions_enabled,
      is_votes_enabled: formData.is_votes_enabled,
      view_props: formData.view_props,
    };

    await handlePublishView(payload);
    if (isViewPublished) {
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: t("publish_view.toast.update_success"),
      });
      handleClose();
    }
  };

  // prefill form values for already published views
  useEffect(() => {
    if (!viewPublishSettings?.anchor) return;

    reset({
      ...defaultValues,
      ...viewPublishSettings,
    });
  }, [viewPublishSettings, reset]);

  const publishLink = getPublishViewLink(viewPublishSettings?.anchor);

  const handleCopyLink = () => {
    if (!publishLink) return;
    copyTextToClipboard(publishLink).then(() =>
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "",
        message: t("publish_view.toast.link_copied"),
      })
    );
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} width={EModalWidth.XXL}>
      <form onSubmit={handleSubmit(handleFormSubmit)}>
        <div className="flex items-center justify-between gap-2 p-5">
          <h5 className="text-18 font-medium text-secondary">{t("publish_view.modal_title")}</h5>
          {isViewPublished && (
            <Button
              variant="error-fill"
              size="lg"
              onClick={() => handleUnPublishView(viewPublishSettings?.id ?? "")}
              loading={isUnPublishing}
            >
              {isUnPublishing ? t("publish_view.unpublishing") : t("publish_view.unpublish")}
            </Button>
          )}
        </div>

        {/* content */}
        {viewPublishFetchLoader ? (
          <Loader className="space-y-4 px-5">
            <Loader.Item height="30px" />
            <Loader.Item height="30px" />
            <Loader.Item height="30px" />
            <Loader.Item height="30px" />
          </Loader>
        ) : (
          <div className="space-y-4 px-5">
            {isViewPublished && publishLink && (
              <>
                <div className="flex items-center justify-between gap-2 rounded-md border border-strong py-1.5 pr-1 pl-4">
                  <a
                    href={publishLink}
                    className="truncate text-13 text-secondary"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {publishLink}
                  </a>
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <a
                      href={publishLink}
                      className="grid size-8 place-items-center rounded-sm bg-layer-3 hover:bg-layer-3-hover"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <NewTabIcon className="size-4" />
                    </a>
                    <button
                      type="button"
                      className="h-8 rounded-sm bg-layer-3 px-3 py-2 text-11 font-medium hover:bg-layer-3-hover"
                      onClick={handleCopyLink}
                    >
                      {t("publish_view.copy_link")}
                    </button>
                  </div>
                </div>
                <p className="mt-3 flex items-center gap-1 text-13 font-medium text-accent-primary">
                  <span className="relative grid size-2.5 place-items-center">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent-primary opacity-75" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-accent-primary" />
                  </span>
                  {t("publish_view.live_message")}
                </p>
              </>
            )}
            <div className="space-y-4">
              <div className="relative flex items-center justify-between gap-2">
                <div className="text-13">{t("publish_view.layouts_label")}</div>
                <Controller
                  control={control}
                  name="view_props"
                  render={({ field: { onChange, value } }) => (
                    <CustomSelect
                      value={value}
                      label={VIEW_OPTIONS.filter((o) => selectedLayouts.includes(o.key))
                        .map((o) => o.label)
                        .join(", ")}
                      onChange={(val: TProjectPublishLayouts) => {
                        if (selectedLayouts.length === 1 && selectedLayouts[0] === val) return;
                        onChange({
                          ...value,
                          [val]: !value?.[val],
                        });
                      }}
                      buttonClassName="border-none"
                      placement="bottom-end"
                    >
                      {VIEW_OPTIONS.map((option) => (
                        <CustomSelect.Option
                          key={option.key}
                          value={option.key}
                          className="flex items-center justify-between gap-2"
                        >
                          {option.label}
                          {selectedLayouts.includes(option.key) && <CheckIcon className="size-3.5 flex-shrink-0" />}
                        </CustomSelect.Option>
                      ))}
                    </CustomSelect>
                  )}
                />
              </div>
              <div className="relative flex items-center justify-between gap-2">
                <div className="text-13">{t("publish_view.comments_label")}</div>
                <Controller
                  control={control}
                  name="is_comments_enabled"
                  render={({ field: { onChange, value } }) => (
                    <ToggleSwitch value={!!value} onChange={onChange} size="sm" />
                  )}
                />
              </div>
              <div className="relative flex items-center justify-between gap-2">
                <div className="text-13">{t("publish_view.reactions_label")}</div>
                <Controller
                  control={control}
                  name="is_reactions_enabled"
                  render={({ field: { onChange, value } }) => (
                    <ToggleSwitch value={!!value} onChange={onChange} size="sm" />
                  )}
                />
              </div>
              <div className="relative flex items-center justify-between gap-2">
                <div className="text-13">{t("publish_view.votes_label")}</div>
                <Controller
                  control={control}
                  name="is_votes_enabled"
                  render={({ field: { onChange, value } }) => (
                    <ToggleSwitch value={!!value} onChange={onChange} size="sm" />
                  )}
                />
              </div>
            </div>
          </div>
        )}

        {/* modal handlers */}
        <div className="relative mt-4 flex items-center justify-between border-t border-subtle px-5 py-4">
          <div className="flex items-center gap-1 text-13 text-placeholder">
            <GlobeIcon className="size-3.5" />
            <div className="text-13">{t("publish_view.anyone_with_link")}</div>
          </div>
          {!viewPublishFetchLoader && (
            <div className="relative flex items-center gap-2">
              <Button variant="secondary" size="lg" onClick={handleClose}>
                Cancel
              </Button>
              {isViewPublished ? (
                isDirty && (
                  <Button variant="primary" size="lg" type="submit" loading={isSubmitting}>
                    {isSubmitting ? t("publish_view.updating") : t("publish_view.update")}
                  </Button>
                )
              ) : (
                <Button variant="primary" size="lg" type="submit" loading={isSubmitting}>
                  {isSubmitting ? t("publish_view.publishing") : t("publish_view.publish")}
                </Button>
              )}
            </div>
          )}
        </div>
      </form>
    </ModalCore>
  );
});
