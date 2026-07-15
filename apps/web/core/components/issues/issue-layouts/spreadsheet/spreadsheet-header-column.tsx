/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
//types
import { observer } from "mobx-react";
import type { IIssueDisplayFilterOptions, IIssueDisplayProperties } from "@plane/types";
//components
import { shouldRenderColumn } from "@/helpers/issue-filter.helper";
import { WithDisplayPropertiesHOC } from "../properties/with-display-properties-HOC";
import { HeaderColumn } from "./columns/header-column";

interface Props {
  displayProperties: IIssueDisplayProperties;
  property: keyof IIssueDisplayProperties;
  isEstimateEnabled: boolean;
  displayFilters: IIssueDisplayFilterOptions;
  handleDisplayFilterUpdate: (data: Partial<IIssueDisplayFilterOptions>) => void;
  isEpic?: boolean;
  // Table/DB view (mote) — column reorder. See docs/mote-design/12.
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
}
export const SpreadsheetHeaderColumn = observer(function SpreadsheetHeaderColumn(props: Props) {
  const {
    displayProperties,
    displayFilters,
    property,
    handleDisplayFilterUpdate,
    isEpic = false,
    onMoveLeft,
    onMoveRight,
  } = props;

  //hooks
  const tableHeaderCellRef = useRef<HTMLTableCellElement | null>(null);

  const shouldRenderProperty = shouldRenderColumn(property);

  return (
    <WithDisplayPropertiesHOC
      displayProperties={displayProperties}
      displayPropertyKey={property}
      shouldRenderProperty={() => shouldRenderProperty}
    >
      <th
        className="group/spreadsheet-column-header relative h-11 min-w-36 items-center border border-t-0 border-b-0 border-subtle bg-layer-1 py-1 text-13 font-medium"
        ref={tableHeaderCellRef}
        tabIndex={0}
      >
        <div className="flex items-center">
          {(onMoveLeft || onMoveRight) && (
            <div className="flex flex-shrink-0 opacity-0 transition-opacity duration-150 group-hover/spreadsheet-column-header:opacity-100">
              <button
                type="button"
                disabled={!onMoveLeft}
                onClick={onMoveLeft}
                title="Move column left"
                className="flex items-center justify-center rounded-sm p-0.5 text-tertiary hover:bg-layer-2 hover:text-primary disabled:pointer-events-none disabled:opacity-0"
              >
                <ChevronLeft className="size-3" />
              </button>
              <button
                type="button"
                disabled={!onMoveRight}
                onClick={onMoveRight}
                title="Move column right"
                className="flex items-center justify-center rounded-sm p-0.5 text-tertiary hover:bg-layer-2 hover:text-primary disabled:pointer-events-none disabled:opacity-0"
              >
                <ChevronRight className="size-3" />
              </button>
            </div>
          )}
          <HeaderColumn
            displayFilters={displayFilters}
            handleDisplayFilterUpdate={handleDisplayFilterUpdate}
            property={property}
            onClose={() => {
              tableHeaderCellRef?.current?.focus();
            }}
            isEpic={isEpic}
          />
        </div>
      </th>
    </WithDisplayPropertiesHOC>
  );
});
