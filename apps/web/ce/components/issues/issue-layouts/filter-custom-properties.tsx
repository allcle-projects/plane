/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Custom Fields / Work Item Properties — mote (Phase 3).
// Extends the list/spreadsheet "Display properties" dropdown with a toggle per
// active custom property. Toggling adds/removes the property id in
// ``display_properties.custom_properties``, persisted through the same
// display-properties update path as the built-in column toggles (see
// core/components/issues/issue-layouts/filters/header/display-filters/display-properties.tsx).

import { xor } from "lodash-es";
import { observer } from "mobx-react";
// types
import type { IIssueDisplayProperties } from "@plane/types";
// local
import { useCustomPropertyColumns } from "./use-custom-property-columns";

type Props = {
  displayProperties: IIssueDisplayProperties;
  handleUpdate: (updatedDisplayProperties: Partial<IIssueDisplayProperties>) => void;
};

export const FilterCustomProperties = observer(function FilterCustomProperties(props: Props) {
  const { displayProperties, handleUpdate } = props;
  const { activeProperties } = useCustomPropertyColumns();

  if (activeProperties.length === 0) return null;

  const selectedIds = displayProperties?.custom_properties ?? [];

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      {activeProperties.map((property) => {
        const isSelected = selectedIds.includes(property.id);
        return (
          <button
            key={property.id}
            type="button"
            className={`rounded-sm border px-2 py-0.5 text-11 transition-all ${
              isSelected ? "border-accent-strong bg-accent-primary text-on-color" : "border-subtle hover:bg-layer-1"
            }`}
            onClick={() => handleUpdate({ custom_properties: xor(selectedIds, [property.id]) })}
          >
            {property.display_name}
          </button>
        );
      })}
    </div>
  );
});
