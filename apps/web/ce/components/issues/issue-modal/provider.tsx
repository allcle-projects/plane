/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Custom Fields / Work Item Properties — mote (Phase 2).
// Supplies the issue-modal context that the core create modal (form.tsx /
// base.tsx) already consumes. Phase 2 wires the custom-field surface: it holds
// the in-progress ``{property_id: [values]}`` map, computes how many active
// properties the selected work item type has, validates required/typed values
// before submit, and bulk-upserts the values to the property-values endpoint
// once the work item is created. Template / convert / sub-work-item hooks remain
// no-ops (later phases).

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { observer } from "mobx-react";
// plane imports
import type { ISearchIssueResponse, TIssue } from "@plane/types";
// components
import { IssueModalContext } from "@/components/issues/issue-modal/context";
import type {
  TActiveAdditionalPropertiesProps,
  TCreateUpdatePropertyValuesProps,
  THandleProjectEntitiesFetchProps,
  THandleTemplateChangeProps,
  TPropertyValuesValidationProps,
} from "@/components/issues/issue-modal/context";
// hooks
import { useUser } from "@/hooks/store/user/user-user";
import { useWorkItemTypes } from "@/hooks/store/use-work-item-types";
// services
import { IssuePropertyValueService } from "@/services/issue";
// plane web imports
import { validatePropertyValue } from "@/plane-web/components/issues/issue-properties";
import { useTemplates } from "@/plane-web/hooks/store/use-templates";
import type { IIssueProperty } from "@/plane-web/store/issue-types/issue-property";
import type { TIssuePropertyValues, TIssuePropertyValueErrors } from "@/plane-web/types/issue-types";
import type { TWorkItemTemplateData } from "@/plane-web/types/templates";

export type TIssueModalProviderProps = {
  templateId?: string;
  dataForPreload?: Partial<TIssue>;
  allowedProjectIds?: string[];
  children: React.ReactNode;
};

export const IssueModalProvider = observer(function IssueModalProvider(props: TIssueModalProviderProps) {
  const { children, allowedProjectIds } = props;
  // states
  const [selectedParentIssue, setSelectedParentIssue] = useState<ISearchIssueResponse | null>(null);
  const [issuePropertyValues, setIssuePropertyValues] = useState<TIssuePropertyValues>({});
  const [issuePropertyValueErrors, setIssuePropertyValueErrors] = useState<TIssuePropertyValueErrors>({});
  const [workItemTemplateId, setWorkItemTemplateId] = useState<string | null>(null);
  const [isApplyingTemplate, setIsApplyingTemplate] = useState<boolean>(false);
  // router params
  const { workspaceSlug } = useParams();
  // store hooks
  const { projectsWithCreatePermissions } = useUser();
  const { getWorkItemTypeById, workItemTypeIds, fetchWorkItemTypes, fetchProperties } = useWorkItemTypes();
  const { getTemplateById, fetchTemplateById } = useTemplates();
  // services
  const propertyValueService = useMemo(() => new IssuePropertyValueService(), []);
  // derived values
  const projectIdsWithCreatePermissions = Object.keys(projectsWithCreatePermissions ?? {});

  // ensure work item type definitions are available for the modal
  useEffect(() => {
    if (workspaceSlug) void fetchWorkItemTypes(workspaceSlug.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug]);

  // active properties for a given work item type
  const getActiveProperties = (workItemTypeId: string | null | undefined): IIssueProperty[] => {
    const workItemType = workItemTypeId ? getWorkItemTypeById(workItemTypeId) : undefined;
    if (!workItemType) return [];
    return workItemType.propertyIds
      .map((propertyId) => workItemType.propertyById(propertyId))
      .filter((property): property is IIssueProperty => !!property && property.is_active);
  };

  // default (non-epic) work item type for the workspace, if one is configured
  const getIssueTypeIdOnProjectChange = (): string | null => {
    const defaultType = workItemTypeIds
      .map((workItemTypeId) => getWorkItemTypeById(workItemTypeId))
      .find((workItemType) => workItemType?.is_default && !workItemType?.is_epic);
    return defaultType?.id ?? null;
  };

  const getActiveAdditionalPropertiesLength = (propertyProps: TActiveAdditionalPropertiesProps): number => {
    const workItemTypeId = propertyProps.watch("type_id");
    return getActiveProperties(workItemTypeId).length;
  };

  const handlePropertyValuesValidation = (propertyProps: TPropertyValuesValidationProps): boolean => {
    const workItemTypeId = propertyProps.watch("type_id");
    const activeProperties = getActiveProperties(workItemTypeId);
    const errors: TIssuePropertyValueErrors = {};
    activeProperties.forEach((property) => {
      const error = validatePropertyValue(property, issuePropertyValues[property.id] ?? []);
      if (error) errors[property.id] = error;
    });
    setIssuePropertyValueErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleProjectEntitiesFetch = async (fetchProps: THandleProjectEntitiesFetchProps): Promise<void> => {
    const { workspaceSlug, workItemTypeId } = fetchProps;
    if (!workspaceSlug) return;
    await fetchWorkItemTypes(workspaceSlug);
    if (workItemTypeId) await fetchProperties(workspaceSlug, workItemTypeId);
  };

  const handleCreateUpdatePropertyValues = async (
    valueProps: TCreateUpdatePropertyValuesProps
  ): Promise<void> => {
    const { issueId, projectId, workspaceSlug, issueTypeId } = valueProps;
    if (!issueId || !projectId || !workspaceSlug || !issueTypeId) return;
    const activeProperties = getActiveProperties(issueTypeId);
    if (activeProperties.length === 0) return;
    const payload: TIssuePropertyValues = {};
    activeProperties.forEach((property) => {
      payload[property.id] = issuePropertyValues[property.id] ?? [];
    });
    if (Object.keys(payload).length === 0) return;
    await propertyValueService.updatePropertyValues(workspaceSlug, projectId, issueId, payload);
    setIssuePropertyValues({});
    setIssuePropertyValueErrors({});
  };

  // Syncs the description editor to the selected template. Field values +
  // property values are applied by WorkItemTemplateSelect (which lives inside
  // the form provider); this handler owns only the editor because the create
  // modal passes the editor ref down through this context.
  const handleTemplateChange = async (templateProps: THandleTemplateChangeProps): Promise<void> => {
    const { workspaceSlug: slug, editorRef } = templateProps;
    if (!workItemTemplateId || !slug) return;
    setIsApplyingTemplate(true);
    try {
      const template = getTemplateById(workItemTemplateId) ?? (await fetchTemplateById(slug, workItemTemplateId));
      const descriptionHtml = (template?.template_data as TWorkItemTemplateData | undefined)?.description_html;
      editorRef.current?.setEditorValue(descriptionHtml ?? "<p></p>");
    } finally {
      setIsApplyingTemplate(false);
    }
  };

  return (
    <IssueModalContext.Provider
      value={{
        allowedProjectIds: allowedProjectIds ?? projectIdsWithCreatePermissions,
        workItemTemplateId,
        setWorkItemTemplateId,
        isApplyingTemplate,
        setIsApplyingTemplate,
        selectedParentIssue,
        setSelectedParentIssue,
        issuePropertyValues,
        setIssuePropertyValues,
        issuePropertyValueErrors,
        setIssuePropertyValueErrors,
        getIssueTypeIdOnProjectChange,
        getActiveAdditionalPropertiesLength,
        handlePropertyValuesValidation,
        handleCreateUpdatePropertyValues,
        handleProjectEntitiesFetch,
        handleTemplateChange,
        handleConvert: () => Promise.resolve(),
        handleCreateSubWorkItem: () => Promise.resolve(),
      }}
    >
      {children}
    </IssueModalContext.Provider>
  );
});
