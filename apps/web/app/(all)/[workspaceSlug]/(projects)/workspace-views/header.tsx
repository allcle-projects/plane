/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Download, Star } from "lucide-react";
// plane imports
import {
  EIssueFilterType,
  ISSUE_DISPLAY_FILTERS_BY_PAGE,
  GLOBAL_VIEW_TRACKER_ELEMENTS,
  DEFAULT_GLOBAL_VIEWS_LIST,
} from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { ViewsIcon } from "@plane/propel/icons";
import { setToast, TOAST_TYPE } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { IIssueDisplayFilterOptions, IIssueDisplayProperties, ICustomSearchSelectOption } from "@plane/types";
import { EIssuesStoreType, EIssueLayoutTypes } from "@plane/types";
import { Breadcrumbs, Header, BreadcrumbNavigationSearchDropdown } from "@plane/ui";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { SwitcherLabel } from "@/components/common/switcher-label";
import { DisplayFiltersSelection, FiltersDropdown } from "@/components/issues/issue-layouts/filters";
import { WorkItemFiltersToggle } from "@/components/work-item-filters/filters-toggle";
import { DefaultWorkspaceViewQuickActions } from "@/components/workspace/views/default-view-quick-action";
import { CreateUpdateWorkspaceViewModal } from "@/components/workspace/views/modal";
import { WorkspaceViewQuickActions } from "@/components/workspace/views/quick-action";
// hooks
import { useGlobalView } from "@/hooks/store/use-global-view";
import { useIssues } from "@/hooks/store/use-issues";
import { useAppRouter } from "@/hooks/use-app-router";
import { GlobalViewLayoutSelection } from "@/plane-web/components/views/helper";
// services (mote — Table/DB view export, docs/mote-design/12 Phase 2)
import { ProjectExportService } from "@/services/project/project-export.service";

const projectExportService = new ProjectExportService();

export const GlobalIssuesHeader = observer(function GlobalIssuesHeader() {
  // states
  const [createViewModal, setCreateViewModal] = useState(false);
  // router
  const router = useAppRouter();
  const { workspaceSlug, globalViewId: routerGlobalViewId } = useParams();
  const globalViewId = routerGlobalViewId ? routerGlobalViewId.toString() : undefined;
  // store hooks
  const {
    issuesFilter: { filters, updateFilters },
  } = useIssues(EIssuesStoreType.GLOBAL);
  const { getViewDetailsById, currentWorkspaceViews, defaultGlobalViewMap, setDefaultGlobalView } =
    useGlobalView();
  const { t } = useTranslation();

  const issueFilters = globalViewId ? filters[globalViewId.toString()] : undefined;

  const activeLayout = issueFilters?.displayFilters?.layout;
  const viewDetails = globalViewId ? getViewDetailsById(globalViewId) : undefined;

  const handleDisplayFilters = useCallback(
    (updatedDisplayFilter: Partial<IIssueDisplayFilterOptions>) => {
      if (!workspaceSlug || !globalViewId) return;
      updateFilters(
        workspaceSlug.toString(),
        undefined,
        EIssueFilterType.DISPLAY_FILTERS,
        updatedDisplayFilter,
        globalViewId
      );
    },
    [workspaceSlug, updateFilters, globalViewId]
  );

  const handleDisplayProperties = useCallback(
    (property: Partial<IIssueDisplayProperties>) => {
      if (!workspaceSlug || !globalViewId) return;
      updateFilters(workspaceSlug.toString(), undefined, EIssueFilterType.DISPLAY_PROPERTIES, property, globalViewId);
    },
    [workspaceSlug, updateFilters, globalViewId]
  );

  const handleLayoutChange = useCallback(
    (layout: EIssueLayoutTypes) => {
      if (!workspaceSlug || !globalViewId) return;
      updateFilters(
        workspaceSlug.toString(),
        undefined,
        EIssueFilterType.DISPLAY_FILTERS,
        { layout: layout },
        globalViewId
      );
    },
    [workspaceSlug, updateFilters, globalViewId]
  );

  const isLocked = viewDetails?.is_locked;

  const isDefaultView = DEFAULT_GLOBAL_VIEWS_LIST.find((view) => view.key === globalViewId);

  // Table/DB view (mote) — export this workspace view's filters + column
  // order to CSV. Stock views (isDefaultView) have no backing IssueView row,
  // so export is only offered for saved custom workspace views. See
  // docs/mote-design/12 Phase 2.
  const [isExporting, setIsExporting] = useState(false);
  const handleExportView = useCallback(async () => {
    if (!workspaceSlug || !globalViewId) return;
    setIsExporting(true);
    try {
      await projectExportService.csvExport(workspaceSlug.toString(), {
        provider: "csv",
        project: [],
        view_id: globalViewId,
      });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Export started",
        message: "Once ready, you'll be able to download it from your notifications.",
      });
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Export failed",
        message: (error as { error?: string })?.error ?? "Something went wrong.",
      });
    } finally {
      setIsExporting(false);
    }
  }, [workspaceSlug, globalViewId]);

  const defaultViewDetails = DEFAULT_GLOBAL_VIEWS_LIST.find((view) => view.key === globalViewId);

  const defaultOptions = DEFAULT_GLOBAL_VIEWS_LIST.map((view) => ({
    value: view.key,
    query: view.key,
    content: <SwitcherLabel name={t(view.i18n_label)} LabelIcon={ViewsIcon} />,
  }));

  const workspaceOptions = (currentWorkspaceViews || []).map((view) => {
    const _view = getViewDetailsById(view);
    if (!_view) return;
    return {
      value: _view.id,
      query: _view.name,
      content: <SwitcherLabel name={_view.name} LabelIcon={ViewsIcon} />,
    };
  });

  // mote — 기본 뷰를 목록 맨 위로. 스톡은 [스톡 4개, 커스텀…] 고정이라
  // 내가 만든 뷰가 항상 아래에 깔려 매번 스크롤/검색해야 했다.
  const defaultGlobalView = workspaceSlug ? (defaultGlobalViewMap[workspaceSlug.toString()] ?? null) : null;

  const switcherOptions = ([...defaultOptions, ...workspaceOptions].filter(
    (option) => option !== undefined
  ) as ICustomSearchSelectOption[]).sort((a, b) => {
    if (!defaultGlobalView) return 0;
    if (a.value === defaultGlobalView) return -1;
    if (b.value === defaultGlobalView) return 1;
    return 0;
  });

  // mote — 현재 보고 있는 뷰를 기본으로 지정/해제.
  const isCurrentViewDefault = !!globalViewId && globalViewId === defaultGlobalView;
  const handleToggleDefaultView = useCallback(async () => {
    if (!workspaceSlug || !globalViewId) return;
    try {
      await setDefaultGlobalView(workspaceSlug.toString(), isCurrentViewDefault ? null : globalViewId);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: isCurrentViewDefault ? "기본 뷰 해제" : "기본 뷰로 지정",
        message: isCurrentViewDefault
          ? "이제 Views 를 열면 All work items 로 들어갑니다."
          : "이제 Views 를 열면 이 뷰로 바로 들어갑니다.",
      });
    } catch {
      // 낙관적 반영은 스토어에서 되돌린다. 여기서는 실패를 알리기만 한다 —
      // 조용히 실패하면 "설정됐다"는 착시가 남는다.
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "기본 뷰 저장 실패",
        message: "잠시 후 다시 시도해 주세요.",
      });
    }
  }, [workspaceSlug, globalViewId, isCurrentViewDefault, setDefaultGlobalView]);
  const currentLayoutFilters = useMemo(() => {
    const layout = activeLayout ?? EIssueLayoutTypes.SPREADSHEET;
    return ISSUE_DISPLAY_FILTERS_BY_PAGE.my_issues.layoutOptions[layout];
  }, [activeLayout]);

  return (
    <>
      <CreateUpdateWorkspaceViewModal isOpen={createViewModal} onClose={() => setCreateViewModal(false)} />
      <Header>
        <Header.LeftItem>
          <Breadcrumbs>
            <Breadcrumbs.Item
              component={<BreadcrumbLink label={t("views")} icon={<ViewsIcon className="h-4 w-4 text-tertiary" />} />}
            />
            <Breadcrumbs.Item
              component={
                <BreadcrumbNavigationSearchDropdown
                  selectedItem={globalViewId?.toString() || ""}
                  navigationItems={switcherOptions}
                  onChange={(value: string) => {
                    router.push(`/${workspaceSlug}/workspace-views/${value}`);
                  }}
                  title={viewDetails?.name ?? t(defaultViewDetails?.i18n_label ?? "")}
                  icon={
                    <Breadcrumbs.Icon>
                      <ViewsIcon className="size-4 flex-shrink-0 text-tertiary" />
                    </Breadcrumbs.Icon>
                  }
                  isLast
                />
              }
              isLast
            />
          </Breadcrumbs>
        </Header.LeftItem>

        <Header.RightItem className="items-center">
          {/* mote — 이 뷰를 기본으로 지정/해제. Views 진입 시 열릴 뷰를 정한다.
              사용자 x 워크스페이스로 서버(WorkspaceUserProperties)에 저장되므로
              브라우저/기기를 바꿔도 유지된다. */}
          {globalViewId && (
            <Tooltip
              tooltipContent={
                isCurrentViewDefault
                  ? "기본 뷰 해제 — Views 를 열면 All work items 로 들어갑니다"
                  : "기본 뷰로 지정 — Views 를 열면 이 뷰로 바로 들어갑니다"
              }
            >
              <button
                type="button"
                onClick={handleToggleDefaultView}
                aria-pressed={isCurrentViewDefault}
                aria-label={isCurrentViewDefault ? "기본 뷰 해제" : "기본 뷰로 지정"}
                className="grid h-7 w-7 place-items-center rounded outline-none hover:bg-custom-background-80"
              >
                <Star
                  className={
                    isCurrentViewDefault
                      ? "h-3.5 w-3.5 fill-amber-500 text-amber-500"
                      : "h-3.5 w-3.5 text-custom-text-300"
                  }
                />
              </button>
            </Tooltip>
          )}
          {!isLocked && (
            <GlobalViewLayoutSelection
              onChange={handleLayoutChange}
              selectedLayout={activeLayout ?? EIssueLayoutTypes.SPREADSHEET}
              workspaceSlug={workspaceSlug.toString()}
            />
          )}
          {globalViewId && <WorkItemFiltersToggle entityType={EIssuesStoreType.GLOBAL} entityId={globalViewId} />}
          {!isLocked && (
            <FiltersDropdown title={t("common.display")} placement="bottom-end">
              <DisplayFiltersSelection
                layoutDisplayFiltersOptions={currentLayoutFilters}
                displayFilters={issueFilters?.displayFilters ?? {}}
                handleDisplayFiltersUpdate={handleDisplayFilters}
                displayProperties={issueFilters?.displayProperties ?? {}}
                handleDisplayPropertiesUpdate={handleDisplayProperties}
              />
            </FiltersDropdown>
          )}
          {!isDefaultView && activeLayout === EIssueLayoutTypes.SPREADSHEET && (
            <Tooltip tooltipContent="Export this view to CSV">
              <Button
                variant="neutral-primary"
                size="lg"
                prependIcon={<Download className="size-3.5" />}
                onClick={handleExportView}
                disabled={isExporting}
              >
                <div className="hidden sm:block">{isExporting ? "Exporting..." : "Export"}</div>
              </Button>
            </Tooltip>
          )}
          <Button
            variant="primary"
            size="lg"
            data-ph-element={GLOBAL_VIEW_TRACKER_ELEMENTS.RIGHT_HEADER_ADD_BUTTON}
            onClick={() => setCreateViewModal(true)}
          >
            {t("workspace_views.add_view")}
          </Button>
          <div className="hidden md:block">
            {viewDetails && <WorkspaceViewQuickActions workspaceSlug={workspaceSlug?.toString()} view={viewDetails} />}
            {isDefaultView && defaultViewDetails && (
              <DefaultWorkspaceViewQuickActions workspaceSlug={workspaceSlug?.toString()} view={defaultViewDetails} />
            )}
          </div>
        </Header.RightItem>
      </Header>
    </>
  );
});
