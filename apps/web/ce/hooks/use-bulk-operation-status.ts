/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { EIssuesStoreType } from "@plane/types";
import { useIssueStoreType } from "@/hooks/use-issue-layout-store";

// bulk archive/delete act on a single project's issues, so selection (and therefore bulk
// operations) is only enabled for store types scoped to a project route. Keep this list in
// sync with BULK_OPERATIONS_SUPPORTED_STORE_TYPES in
// ce/components/issues/bulk-operations/root.tsx.
const BULK_OPERATIONS_SUPPORTED_STORE_TYPES: EIssuesStoreType[] = [
  EIssuesStoreType.PROJECT,
  EIssuesStoreType.CYCLE,
  EIssuesStoreType.MODULE,
  EIssuesStoreType.PROJECT_VIEW,
];

export const useBulkOperationStatus = () => {
  const storeType = useIssueStoreType();
  return BULK_OPERATIONS_SUPPORTED_STORE_TYPES.includes(storeType);
};
