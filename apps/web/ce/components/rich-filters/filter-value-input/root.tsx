/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { EXTENDED_FILTER_FIELD_TYPE } from "@plane/types";
import type { TFilterValue, TFilterProperty, TTextInputFilterFieldConfig } from "@plane/types";
// local imports
import type { TFilterValueInputProps } from "@/components/rich-filters/shared";

// Custom Fields — Phase 4 (mote.13): free-input control for TEXT / NUMBER / URL
// custom-property filters. Core's FilterValueInput
// (core/components/rich-filters/filter-value-input/root.tsx) only handles the
// core SINGLE_SELECT / MULTI_SELECT / DATE / DATE_RANGE field types and falls
// through to this component for anything else — the extended TEXT_INPUT type
// (see packages/types/src/rich-filters/field-types/extended.ts, built by
// packages/utils/src/rich-filters/factories/configs/properties/text-input.ts)
// is handled here.
export const AdditionalFilterValueInput = observer(function AdditionalFilterValueInput<
  P extends TFilterProperty,
  V extends TFilterValue,
>(props: TFilterValueInputProps<P, V>) {
  const { condition, filterFieldConfig, isDisabled = false, onChange } = props;

  const initialValue = Array.isArray(condition.value) ? (condition.value[0] ?? "") : (condition.value ?? "");
  const [value, setValue] = useState<string>(
    initialValue !== undefined && initialValue !== null ? String(initialValue) : ""
  );

  if (filterFieldConfig?.type !== EXTENDED_FILTER_FIELD_TYPE.TEXT_INPUT) {
    return (
      <div className="flex h-full cursor-not-allowed items-center px-4 text-11 text-placeholder transition-opacity duration-200">
        Filter type not supported
      </div>
    );
  }

  const textInputFieldConfig = filterFieldConfig as TTextInputFilterFieldConfig<V>;
  const inputMode = textInputFieldConfig.inputMode ?? "text";
  const commitValue = () => onChange(value as unknown as V);

  return (
    <input
      type={inputMode === "number" ? "number" : "text"}
      className="h-full w-full min-w-[8rem] bg-transparent px-2 text-11 outline-none placeholder:text-placeholder"
      placeholder={inputMode === "url" ? "https://..." : "Enter a value"}
      value={value}
      disabled={isDisabled}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commitValue}
      onKeyDown={(event) => {
        if (event.key === "Enter") commitValue();
      }}
    />
  );
});
