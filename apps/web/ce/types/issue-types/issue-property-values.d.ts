/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Custom Fields / Work Item Properties — mote (Phase 2).
// Value-shape types for custom-field values on a work item. Mirrors the backend
// wire format produced by apps/api/plane/utils/issue_property_values.py:
// a ``{property_id: [values]}`` map where every value is a string (numbers as
// decimal strings, dates as ISO strings, booleans as "true"/"false", member and
// option references as uuid strings, multi-select = N entries).

// Map of property id -> list of stringified values for a single work item.
export type TIssuePropertyValues = Record<string, string[]>;

// Map of property id -> client-side validation error message (empty/undefined
// when the value is valid). Consumed by the create modal context.
export type TIssuePropertyValueErrors = Record<string, string | undefined>;
