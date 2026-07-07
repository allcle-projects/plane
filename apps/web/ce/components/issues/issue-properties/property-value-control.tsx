/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Custom Fields / Work Item Properties — mote (Phase 2).
// One reusable input per property type, shared by the issue-detail sidebar and
// the create modal. Reuses the same Plane UI / dropdown components the built-in
// sidebar fields use (MemberDropdown, DateDropdown, CustomSearchSelect, Input,
// ToggleSwitch). Values are the stringified ``string[]`` wire form.
//
// ``onChange`` fires on every edit (keystroke / selection) — the create modal
// tracks these directly in its context state. ``onCommit`` fires at a natural
// commit point (blur for free-text inputs, immediately for discrete pickers) —
// the sidebar uses it to trigger a bulk-upsert without a request per keystroke.

import React from "react";
import { observer } from "mobx-react";
// plane imports
import type { ICustomSearchSelectOption } from "@plane/types";
import { CustomSearchSelect, Input, ToggleSwitch } from "@plane/ui";
import { renderFormattedPayloadDate } from "@plane/utils";
// components
import { DateDropdown } from "@/components/dropdowns/date";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
// plane web imports
import { EIssuePropertyType } from "@/plane-web/types/issue-types";
import type { IIssueProperty } from "@/plane-web/store/issue-types/issue-property";

export type TPropertyValueControlProps = {
  property: IIssueProperty;
  value: string[];
  onChange: (value: string[]) => void;
  onCommit?: (value: string[]) => void;
  workspaceSlug: string;
  projectId: string;
  disabled?: boolean;
};

export const PropertyValueControl = observer(function PropertyValueControl(props: TPropertyValueControlProps) {
  const { property, value, onChange, onCommit, projectId, disabled } = props;
  const first = value?.[0] ?? "";

  const isMultiSelect = property.property_type === EIssuePropertyType.MULTI_SELECT;
  const isMultiMember = property.property_type === EIssuePropertyType.MEMBER && property.is_multi;

  // fire both the live-edit and the commit callbacks for discrete pickers
  const change = (next: string[]) => {
    onChange(next);
    onCommit?.(next);
  };

  const optionItems: ICustomSearchSelectOption[] = property.optionIds
    .map((optionId) => property.optionById(optionId))
    .filter((option): option is NonNullable<typeof option> => !!option && option.is_active)
    .map((option) => ({ value: option.id, query: option.name, content: option.name }));

  const selectedOptionLabel = (selected: string[]) => {
    const names = selected
      .map((optionId) => property.optionById(optionId)?.name)
      .filter((name): name is string => !!name);
    return names.length > 0 ? names.join(", ") : property.display_name;
  };

  switch (property.property_type) {
    case EIssuePropertyType.TEXT:
    case EIssuePropertyType.URL:
      return (
        <Input
          type={property.property_type === EIssuePropertyType.URL ? "url" : "text"}
          value={first}
          onChange={(e) => onChange(e.target.value === "" ? [] : [e.target.value])}
          onBlur={() => onCommit?.(value ?? [])}
          placeholder={property.display_name}
          disabled={disabled}
          className="w-full text-body-xs-regular"
          mode="transparent"
        />
      );

    case EIssuePropertyType.NUMBER: {
      const min = property.settings?.min as number | undefined;
      const max = property.settings?.max as number | undefined;
      return (
        <Input
          type="number"
          value={first}
          min={min}
          max={max}
          onChange={(e) => onChange(e.target.value === "" ? [] : [e.target.value])}
          onBlur={() => onCommit?.(value ?? [])}
          placeholder={property.display_name}
          disabled={disabled}
          className="w-full text-body-xs-regular"
          mode="transparent"
        />
      );
    }

    case EIssuePropertyType.BOOLEAN:
      return (
        <ToggleSwitch
          value={first === "true"}
          onChange={(val: boolean) => change([val ? "true" : "false"])}
          disabled={disabled}
          size="sm"
        />
      );

    case EIssuePropertyType.DATE:
      return (
        <DateDropdown
          value={first || null}
          onChange={(date) => change(date ? [renderFormattedPayloadDate(date) ?? ""] : [])}
          placeholder={property.display_name}
          disabled={disabled}
          buttonVariant="border-with-text"
          className="w-full"
          buttonContainerClassName="w-full text-left"
        />
      );

    case EIssuePropertyType.MEMBER:
      return isMultiMember ? (
        <MemberDropdown
          value={value}
          onChange={(val: string[]) => change(val)}
          projectId={projectId}
          multiple
          disabled={disabled}
          placeholder={property.display_name}
          buttonVariant="border-with-text"
          className="w-full"
          buttonContainerClassName="w-full text-left"
        />
      ) : (
        <MemberDropdown
          value={first || null}
          onChange={(val: string | null) => change(val ? [val] : [])}
          projectId={projectId}
          multiple={false}
          disabled={disabled}
          placeholder={property.display_name}
          buttonVariant="border-with-text"
          className="w-full"
          buttonContainerClassName="w-full text-left"
        />
      );

    case EIssuePropertyType.SELECT:
    case EIssuePropertyType.MULTI_SELECT:
      return isMultiSelect ? (
        <CustomSearchSelect
          value={value}
          onChange={(val: string[]) => change(val ?? [])}
          options={optionItems}
          multiple
          disabled={disabled}
          label={selectedOptionLabel(value)}
          buttonClassName="w-full text-body-xs-regular"
          className="w-full"
        />
      ) : (
        <CustomSearchSelect
          value={first}
          onChange={(val: string) => change(val ? [val] : [])}
          options={optionItems}
          disabled={disabled}
          label={selectedOptionLabel(first ? [first] : [])}
          buttonClassName="w-full text-body-xs-regular"
          className="w-full"
        />
      );

    default:
      return null;
  }
});
