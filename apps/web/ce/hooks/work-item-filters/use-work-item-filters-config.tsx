/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo } from "react";
import { AtSign, Briefcase, SlidersHorizontal } from "lucide-react";
// plane imports
import { Logo } from "@plane/propel/emoji-icon-picker";
import {
  CalendarLayoutIcon,
  CycleGroupIcon,
  CycleIcon,
  ModuleIcon,
  StatePropertyIcon,
  PriorityIcon,
  StateGroupIcon,
  MembersPropertyIcon,
  LabelPropertyIcon,
  StartDatePropertyIcon,
  DueDatePropertyIcon,
  UserCirclePropertyIcon,
  PriorityPropertyIcon,
} from "@plane/propel/icons";
import type {
  ICycle,
  IState,
  IUserLite,
  TFilterConfig,
  IIssueLabel,
  IModule,
  IProject,
  TWorkItemFilterExpression,
  TWorkItemFilterProperty,
} from "@plane/types";
import { Avatar } from "@plane/ui";
import {
  getActiveCustomPropertyFilterIds,
  getAssigneeFilterConfig,
  getCreatedAtFilterConfig,
  getCreatedByFilterConfig,
  getCycleFilterConfig,
  getDatePropertyFilterConfig,
  getFileURL,
  getLabelFilterConfig,
  getMemberPickerPropertyFilterConfig,
  getMentionFilterConfig,
  getModuleFilterConfig,
  getOptionPickerPropertyFilterConfig,
  getPriorityFilterConfig,
  getProjectFilterConfig,
  getStartDateFilterConfig,
  getStateFilterConfig,
  getStateGroupFilterConfig,
  getSubscriberFilterConfig,
  getTargetDateFilterConfig,
  getTextInputPropertyFilterConfig,
  getUpdatedAtFilterConfig,
  isLoaderReady,
  MAX_CUSTOM_PROPERTY_FILTERS,
} from "@plane/utils";
// store hooks
import { useCycle } from "@/hooks/store/use-cycle";
import { useLabel } from "@/hooks/store/use-label";
import { useMember } from "@/hooks/store/use-member";
import { useModule } from "@/hooks/store/use-module";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
// plane web imports
import { useCustomPropertyColumns } from "@/plane-web/components/issues/issue-layouts/use-custom-property-columns";
import { useFiltersOperatorConfigs } from "@/plane-web/hooks/rich-filters/use-filters-operator-configs";
import type { IIssueProperty } from "@/plane-web/store/issue-types/issue-property";
import { EIssuePropertyType } from "@/plane-web/types/issue-types";

// Custom Fields — Phase 4 (mote.13): prefix for the dynamic filter keys carrying
// custom-property conditions inside the rich-filter expression (see
// packages/types/src/view-props.ts TWorkItemFilterProperty and the matching
// allowance in packages/shared-state/src/store/work-item-filters/adapter.ts).
const CUSTOM_PROPERTY_FILTER_KEY_PREFIX = "customproperty_";

export type TWorkItemFiltersEntityProps = {
  workspaceSlug: string;
  cycleIds?: string[];
  labelIds?: string[];
  memberIds?: string[];
  moduleIds?: string[];
  projectId?: string;
  projectIds?: string[];
  stateIds?: string[];
  // Custom Fields — Phase 4: the currently-active rich-filter expression, used
  // only to count how many distinct custom-property filters are already applied
  // so the 5-filter cap can disable adding a 6th. Forwarded from
  // core/components/work-item-filters/filters-hoc/base.tsx.
  activeRichFilters?: TWorkItemFilterExpression;
};

export type TUseWorkItemFiltersConfigProps = {
  allowedFilters: TWorkItemFilterProperty[];
} & TWorkItemFiltersEntityProps;

export type TWorkItemFiltersConfig = {
  areAllConfigsInitialized: boolean;
  configs: TFilterConfig<TWorkItemFilterProperty>[];
  configMap: {
    [key in TWorkItemFilterProperty]?: TFilterConfig<TWorkItemFilterProperty>;
  };
  isFilterEnabled: (key: TWorkItemFilterProperty) => boolean;
  members: IUserLite[];
};

export const useWorkItemFiltersConfig = (props: TUseWorkItemFiltersConfigProps): TWorkItemFiltersConfig => {
  const {
    allowedFilters,
    activeRichFilters,
    cycleIds,
    labelIds,
    memberIds,
    moduleIds,
    projectId,
    projectIds,
    stateIds,
    workspaceSlug,
  } = props;
  // store hooks
  const { loader: projectLoader, getProjectById } = useProject();
  const { getCycleById } = useCycle();
  const { getLabelById } = useLabel();
  const { getModuleById } = useModule();
  const { getStateById } = useProjectState();
  const { getUserDetails } = useMember();
  // Custom Fields — Phase 4: active custom-property definitions (all P1-3 stores/hooks)
  const { activeProperties } = useCustomPropertyColumns();
  // derived values
  const operatorConfigs = useFiltersOperatorConfigs({ workspaceSlug });
  const filtersToShow = useMemo(() => new Set(allowedFilters), [allowedFilters]);
  const project = useMemo(() => getProjectById(projectId), [projectId, getProjectById]);
  const members: IUserLite[] | undefined = useMemo(
    () =>
      memberIds
        ? (memberIds.map((memberId) => getUserDetails(memberId)).filter((member) => member) as IUserLite[])
        : undefined,
    [memberIds, getUserDetails]
  );
  const workItemStates: IState[] | undefined = useMemo(
    () =>
      stateIds ? (stateIds.map((stateId) => getStateById(stateId)).filter((state) => state) as IState[]) : undefined,
    [stateIds, getStateById]
  );
  const workItemLabels: IIssueLabel[] | undefined = useMemo(
    () =>
      labelIds
        ? (labelIds.map((labelId) => getLabelById(labelId)).filter((label) => label) as IIssueLabel[])
        : undefined,
    [labelIds, getLabelById]
  );
  const cycles = useMemo(
    () => (cycleIds ? (cycleIds.map((cycleId) => getCycleById(cycleId)).filter((cycle) => cycle) as ICycle[]) : []),
    [cycleIds, getCycleById]
  );
  const modules = useMemo(
    () =>
      moduleIds ? (moduleIds.map((moduleId) => getModuleById(moduleId)).filter((module) => module) as IModule[]) : [],
    [moduleIds, getModuleById]
  );
  const projects = useMemo(
    () =>
      projectIds
        ? (projectIds.map((projectId) => getProjectById(projectId)).filter((project) => project) as IProject[])
        : [],
    [projectIds, getProjectById]
  );
  const areAllConfigsInitialized = useMemo(() => isLoaderReady(projectLoader), [projectLoader]);

  /**
   * Checks if a filter is enabled based on the filters to show.
   * @param key - The filter key.
   * @param level - The level of the filter.
   * @returns True if the filter is enabled, false otherwise.
   */
  const isFilterEnabled = useCallback((key: TWorkItemFilterProperty) => filtersToShow.has(key), [filtersToShow]);

  // state group filter config
  const stateGroupFilterConfig = useMemo(
    () =>
      getStateGroupFilterConfig<TWorkItemFilterProperty>("state_group")({
        isEnabled: isFilterEnabled("state_group"),
        filterIcon: StatePropertyIcon,
        getOptionIcon: (stateGroupKey) => <StateGroupIcon stateGroup={stateGroupKey} />,
        ...operatorConfigs,
      }),
    [isFilterEnabled, operatorConfigs]
  );

  // state filter config
  const stateFilterConfig = useMemo(
    () =>
      getStateFilterConfig<TWorkItemFilterProperty>("state_id")({
        isEnabled: isFilterEnabled("state_id") && workItemStates !== undefined,
        filterIcon: StatePropertyIcon,
        getOptionIcon: (state) => <StateGroupIcon stateGroup={state.group} color={state.color} />,
        states: workItemStates ?? [],
        ...operatorConfigs,
      }),
    [isFilterEnabled, workItemStates, operatorConfigs]
  );

  // label filter config
  const labelFilterConfig = useMemo(
    () =>
      getLabelFilterConfig<TWorkItemFilterProperty>("label_id")({
        isEnabled: isFilterEnabled("label_id") && workItemLabels !== undefined,
        filterIcon: LabelPropertyIcon,
        labels: workItemLabels ?? [],
        getOptionIcon: (color) => (
          <span className="flex size-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: color }} />
        ),
        ...operatorConfigs,
      }),
    [isFilterEnabled, workItemLabels, operatorConfigs]
  );

  // cycle filter config
  const cycleFilterConfig = useMemo(
    () =>
      getCycleFilterConfig<TWorkItemFilterProperty>("cycle_id")({
        isEnabled: isFilterEnabled("cycle_id") && project?.cycle_view === true && cycles !== undefined,
        filterIcon: CycleIcon,
        getOptionIcon: (cycleGroup) => <CycleGroupIcon cycleGroup={cycleGroup} className="h-3.5 w-3.5 flex-shrink-0" />,
        cycles: cycles ?? [],
        ...operatorConfigs,
      }),
    [isFilterEnabled, project?.cycle_view, cycles, operatorConfigs]
  );

  // module filter config
  const moduleFilterConfig = useMemo(
    () =>
      getModuleFilterConfig<TWorkItemFilterProperty>("module_id")({
        isEnabled: isFilterEnabled("module_id") && project?.module_view === true && modules !== undefined,
        filterIcon: ModuleIcon,
        getOptionIcon: () => <ModuleIcon className="h-3 w-3 flex-shrink-0" />,
        modules: modules ?? [],
        ...operatorConfigs,
      }),
    [isFilterEnabled, project?.module_view, modules, operatorConfigs]
  );

  // assignee filter config
  const assigneeFilterConfig = useMemo(
    () =>
      getAssigneeFilterConfig<TWorkItemFilterProperty>("assignee_id")({
        isEnabled: isFilterEnabled("assignee_id") && members !== undefined,
        filterIcon: MembersPropertyIcon,
        members: members ?? [],
        getOptionIcon: (memberDetails) => (
          <Avatar
            name={memberDetails.display_name}
            src={getFileURL(memberDetails.avatar_url)}
            showTooltip={false}
            size="sm"
          />
        ),
        ...operatorConfigs,
      }),
    [isFilterEnabled, members, operatorConfigs]
  );

  // mention filter config
  const mentionFilterConfig = useMemo(
    () =>
      getMentionFilterConfig<TWorkItemFilterProperty>("mention_id")({
        isEnabled: isFilterEnabled("mention_id") && members !== undefined,
        filterIcon: AtSign,
        members: members ?? [],
        getOptionIcon: (memberDetails) => (
          <Avatar
            name={memberDetails.display_name}
            src={getFileURL(memberDetails.avatar_url)}
            showTooltip={false}
            size="sm"
          />
        ),
        ...operatorConfigs,
      }),
    [isFilterEnabled, members, operatorConfigs]
  );

  // created by filter config
  const createdByFilterConfig = useMemo(
    () =>
      getCreatedByFilterConfig<TWorkItemFilterProperty>("created_by_id")({
        isEnabled: isFilterEnabled("created_by_id") && members !== undefined,
        filterIcon: UserCirclePropertyIcon,
        members: members ?? [],
        getOptionIcon: (memberDetails) => (
          <Avatar
            name={memberDetails.display_name}
            src={getFileURL(memberDetails.avatar_url)}
            showTooltip={false}
            size="sm"
          />
        ),
        ...operatorConfigs,
      }),
    [isFilterEnabled, members, operatorConfigs]
  );

  // subscriber filter config
  const subscriberFilterConfig = useMemo(
    () =>
      getSubscriberFilterConfig<TWorkItemFilterProperty>("subscriber_id")({
        isEnabled: isFilterEnabled("subscriber_id") && members !== undefined,
        filterIcon: MembersPropertyIcon,
        members: members ?? [],
        getOptionIcon: (memberDetails) => (
          <Avatar
            name={memberDetails.display_name}
            src={getFileURL(memberDetails.avatar_url)}
            showTooltip={false}
            size="sm"
          />
        ),
        ...operatorConfigs,
      }),
    [isFilterEnabled, members, operatorConfigs]
  );

  // priority filter config
  const priorityFilterConfig = useMemo(
    () =>
      getPriorityFilterConfig<TWorkItemFilterProperty>("priority")({
        isEnabled: isFilterEnabled("priority"),
        filterIcon: PriorityPropertyIcon,
        getOptionIcon: (priority) => <PriorityIcon priority={priority} />,
        ...operatorConfigs,
      }),
    [isFilterEnabled, operatorConfigs]
  );

  // start date filter config
  const startDateFilterConfig = useMemo(
    () =>
      getStartDateFilterConfig<TWorkItemFilterProperty>("start_date")({
        isEnabled: true,
        filterIcon: StartDatePropertyIcon,
        ...operatorConfigs,
      }),
    [operatorConfigs]
  );

  // target date filter config
  const targetDateFilterConfig = useMemo(
    () =>
      getTargetDateFilterConfig<TWorkItemFilterProperty>("target_date")({
        isEnabled: true,
        filterIcon: DueDatePropertyIcon,
        ...operatorConfigs,
      }),
    [operatorConfigs]
  );

  // created at filter config
  const createdAtFilterConfig = useMemo(
    () =>
      getCreatedAtFilterConfig<TWorkItemFilterProperty>("created_at")({
        isEnabled: true,
        filterIcon: CalendarLayoutIcon,
        ...operatorConfigs,
      }),
    [operatorConfigs]
  );

  // updated at filter config
  const updatedAtFilterConfig = useMemo(
    () =>
      getUpdatedAtFilterConfig<TWorkItemFilterProperty>("updated_at")({
        isEnabled: true,
        filterIcon: CalendarLayoutIcon,
        ...operatorConfigs,
      }),
    [operatorConfigs]
  );

  // project filter config
  const projectFilterConfig = useMemo(
    () =>
      getProjectFilterConfig<TWorkItemFilterProperty>("project_id")({
        isEnabled: isFilterEnabled("project_id") && projects !== undefined,
        filterIcon: Briefcase,
        projects: projects,
        getOptionIcon: (project) => <Logo logo={project.logo_props} size={12} />,
        ...operatorConfigs,
      }),
    [isFilterEnabled, projects, operatorConfigs]
  );

  // Custom Fields — Phase 4 (mote.13): one filter config per active custom
  // property, keyed as `customproperty_<property_id>` (see the module-level
  // CUSTOM_PROPERTY_FILTER_KEY_PREFIX comment above). Distinct active property
  // ids already applied as filters count toward the 5-filter cap; properties
  // not yet added are disabled once the cap is reached (mirrors the backend's
  // MAX_CUSTOM_PROPERTY_FILTERS in apps/api/plane/utils/issue_filters.py).
  const activeCustomPropertyFilterIds = useMemo(
    () => getActiveCustomPropertyFilterIds(activeRichFilters),
    [activeRichFilters]
  );

  const buildCustomPropertyFilterConfig = useCallback(
    (property: IIssueProperty): TFilterConfig<TWorkItemFilterProperty> | undefined => {
      const key = `${CUSTOM_PROPERTY_FILTER_KEY_PREFIX}${property.id}` as TWorkItemFilterProperty;
      const isUnderCap =
        activeCustomPropertyFilterIds.has(property.id) || activeCustomPropertyFilterIds.size < MAX_CUSTOM_PROPERTY_FILTERS;
      const isEnabled = isUnderCap;

      switch (property.property_type) {
        case EIssuePropertyType.SELECT:
        case EIssuePropertyType.MULTI_SELECT:
          return getOptionPickerPropertyFilterConfig<TWorkItemFilterProperty, string>(key)({
            isEnabled,
            propertyDisplayName: property.display_name,
            filterIcon: SlidersHorizontal,
            options: property.optionIds
              .map((optionId) => property.optionById(optionId))
              .filter((option): option is NonNullable<typeof option> => !!option && option.is_active)
              .map((option) => ({ id: option.id, label: option.name, value: option.id })),
            ...operatorConfigs,
          });
        case EIssuePropertyType.MEMBER:
          return getMemberPickerPropertyFilterConfig<TWorkItemFilterProperty>(key)({
            isEnabled,
            propertyDisplayName: property.display_name,
            filterIcon: SlidersHorizontal,
            members: members ?? [],
            getOptionIcon: (memberDetails) => (
              <Avatar
                name={memberDetails.display_name}
                src={getFileURL(memberDetails.avatar_url)}
                showTooltip={false}
                size="sm"
              />
            ),
            ...operatorConfigs,
          });
        case EIssuePropertyType.BOOLEAN:
          return getOptionPickerPropertyFilterConfig<TWorkItemFilterProperty, string>(key)({
            isEnabled,
            propertyDisplayName: property.display_name,
            filterIcon: SlidersHorizontal,
            options: [
              { id: "true", label: "Yes", value: "true" },
              { id: "false", label: "No", value: "false" },
            ],
            ...operatorConfigs,
          });
        case EIssuePropertyType.DATE:
          return getDatePropertyFilterConfig<TWorkItemFilterProperty>(key)({
            isEnabled,
            propertyDisplayName: property.display_name,
            filterIcon: SlidersHorizontal,
            ...operatorConfigs,
          });
        case EIssuePropertyType.TEXT:
        case EIssuePropertyType.NUMBER:
        case EIssuePropertyType.URL:
          return getTextInputPropertyFilterConfig<TWorkItemFilterProperty>(key)({
            isEnabled,
            propertyDisplayName: property.display_name,
            filterIcon: SlidersHorizontal,
            inputMode:
              property.property_type === EIssuePropertyType.NUMBER
                ? "number"
                : property.property_type === EIssuePropertyType.URL
                  ? "url"
                  : "text",
            ...operatorConfigs,
          });
        default:
          return undefined;
      }
    },
    [activeCustomPropertyFilterIds, members, operatorConfigs]
  );

  const customPropertyFilterConfigs = useMemo(
    () =>
      activeProperties
        .map((property) => buildCustomPropertyFilterConfig(property))
        .filter((config): config is TFilterConfig<TWorkItemFilterProperty> => !!config),
    [activeProperties, buildCustomPropertyFilterConfig]
  );

  return {
    areAllConfigsInitialized,
    configs: [
      stateFilterConfig,
      stateGroupFilterConfig,
      assigneeFilterConfig,
      priorityFilterConfig,
      projectFilterConfig,
      mentionFilterConfig,
      labelFilterConfig,
      cycleFilterConfig,
      moduleFilterConfig,
      startDateFilterConfig,
      targetDateFilterConfig,
      createdAtFilterConfig,
      updatedAtFilterConfig,
      createdByFilterConfig,
      subscriberFilterConfig,
      ...customPropertyFilterConfigs,
    ],
    configMap: {
      project_id: projectFilterConfig,
      state_group: stateGroupFilterConfig,
      state_id: stateFilterConfig,
      label_id: labelFilterConfig,
      cycle_id: cycleFilterConfig,
      module_id: moduleFilterConfig,
      assignee_id: assigneeFilterConfig,
      mention_id: mentionFilterConfig,
      created_by_id: createdByFilterConfig,
      subscriber_id: subscriberFilterConfig,
      priority: priorityFilterConfig,
      start_date: startDateFilterConfig,
      target_date: targetDateFilterConfig,
      created_at: createdAtFilterConfig,
      updated_at: updatedAtFilterConfig,
      ...Object.fromEntries(customPropertyFilterConfigs.map((config) => [config.id, config])),
    },
    isFilterEnabled,
    members: members ?? [],
  };
};
