/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Milestones — mote (Phase 2).
// See docs/mote-design/04-planning-hierarchy.md, section 2.
// Thin route wrapper: renders the project-scoped milestones list surface.

import { observer } from "mobx-react";
import { MilestonesListRoot } from "@/plane-web/components/milestones";

const MilestonesListPage = observer(function MilestonesListPage() {
  return <MilestonesListRoot />;
});

export default MilestonesListPage;
