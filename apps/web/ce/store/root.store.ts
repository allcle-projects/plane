/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// store
import { CoreRootStore } from "@/store/root.store";
import type { IAutomationStore } from "./automation/automation.store";
import { AutomationStore } from "./automation/automation.store";
import type { IInitiativeStore } from "./initiative/initiative.store";
import { InitiativeStore } from "./initiative/initiative.store";
import type { IMilestoneStore } from "./milestone/milestone.store";
import { MilestoneStore } from "./milestone/milestone.store";
import type { IPageCollectionStore } from "./page-collection/page-collection.store";
import { PageCollectionStore } from "./page-collection/page-collection.store";
import type { ITeamspaceStore } from "./teamspace/teamspace.store";
import { TeamspaceStore } from "./teamspace/teamspace.store";
import type { IRecurringIssueStore } from "./recurring/recurring-issue.store";
import { RecurringIssueStore } from "./recurring/recurring-issue.store";
import type { ITemplateStore } from "./templates/template.store";
import { TemplateStore } from "./templates/template.store";
import type { ITimelineStore } from "./timeline";
import { TimeLineStore } from "./timeline";
import type { IUpdateStore } from "./update/update.store";
import { UpdateStore } from "./update/update.store";
import type { IWorkspaceProjectStateStore } from "./workspace-project-state/project-state.store";
import { WorkspaceProjectStateStore } from "./workspace-project-state/project-state.store";

export class RootStore extends CoreRootStore {
  automationStore: IAutomationStore;
  timelineStore: ITimelineStore;
  templateStore: ITemplateStore;
  recurringIssueStore: IRecurringIssueStore;
  initiativeStore: IInitiativeStore;
  milestoneStore: IMilestoneStore;
  updateStore: IUpdateStore;
  workspaceProjectStateStore: IWorkspaceProjectStateStore;
  pageCollectionStore: IPageCollectionStore;
  teamspaceStore: ITeamspaceStore;

  constructor() {
    super();

    this.automationStore = new AutomationStore(this);
    this.timelineStore = new TimeLineStore(this);
    this.templateStore = new TemplateStore(this);
    this.recurringIssueStore = new RecurringIssueStore(this);
    this.initiativeStore = new InitiativeStore(this);
    this.milestoneStore = new MilestoneStore(this);
    this.updateStore = new UpdateStore(this);
    this.workspaceProjectStateStore = new WorkspaceProjectStateStore(this);
    this.pageCollectionStore = new PageCollectionStore(this);
    this.teamspaceStore = new TeamspaceStore(this);
  }
}
