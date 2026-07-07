/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// store
import { CoreRootStore } from "@/store/root.store";
import type { ITemplateStore } from "./templates/template.store";
import { TemplateStore } from "./templates/template.store";
import type { ITimelineStore } from "./timeline";
import { TimeLineStore } from "./timeline";

export class RootStore extends CoreRootStore {
  timelineStore: ITimelineStore;
  templateStore: ITemplateStore;

  constructor() {
    super();

    this.timelineStore = new TimeLineStore(this);
    this.templateStore = new TemplateStore(this);
  }
}
