# 04 — Planning Hierarchy (paid Plane features, self-hosted on CE fork)

> **Scope.** Design spec (not implementation) for five paid Plane capabilities we intend to
> reimplement in our CE fork so they run without the external "silo" service:
> **Initiatives**, **Milestones**, **Project States**, **Updates**, and
> **Project/Module Overview analytics**.
>
> **Repo:** `/home/otro/git/plane-fork`, branch `mote`, Plane CE **v1.3.1**.

## 0. Architecture ground truth (verified in this repo)

- Backend is **unified** under `apps/api/plane/`:
  - `app/` = internal (session-cookie) API consumed by `apps/web`.
  - `api/` = **public v1** API, `X-API-Key` auth (see `apps/api/plane/api/urls/cycle.py:7`).
  - `db/models/` = Django ORM. `license/` present but **no license gating in the backend**
    (grepped: no `ee/` dir, no license checks around models/views).
- **Paid gating is FRONTEND-only.** `apps/web/tsconfig.json:9` aliases `@/plane-web/* → ./ce/*`.
  The real paid implementations live in an external **silo** that is **not in this repo**; the
  CE tree ships **stubs** under `apps/web/ce/` that either re-export the OSS base
  (e.g. `apps/web/ce/store/global-view.store.ts` → `export * from "@/store/global-view.store"`)
  or subclass a base with no extra behaviour
  (e.g. `apps/web/ce/store/analytics.store.ts`: `export class AnalyticsStore extends BaseAnalyticsStore {}`).
- **Consequence for us:** because the backend has no gating, our plan is to build **real
  backend models + endpoints** directly in `apps/api/plane/`, and replace the frontend `ce/`
  stubs with real implementations. No silo, no license server. This is strictly additive to CE.

### Reusable base patterns (cite before every model)

| Pattern | Where | Use for |
|---|---|---|
| `BaseModel` — UUID pk, auto `created_by`/`updated_by` | `apps/api/plane/db/models/base.py:17`, save at `:23` | workspace-level models (Initiative) |
| `ProjectBaseModel` — adds `project` + `workspace` FK, auto-sets workspace from project | `apps/api/plane/db/models/project.py:181` | project-scoped models (Milestone, Update-on-project) |
| `StateGroup` TextChoices + `group` char field + auto-sequence `save()` | `apps/api/plane/db/models/state.py:14`, field `:85`, `save` `:117`, Meta `:103` | Project States groups & ordering |
| Custom manager excluding a subset (`StateManager` drops triage) | `apps/api/plane/db/models/state.py:65` | default querysets |
| `progress_snapshot = JSONField(default=dict)` (denormalised rollup cache) | `apps/api/plane/db/models/cycle.py:74` | Milestone/Initiative progress caching |
| Join model pattern (`CycleIssue`: two FKs + unique_together + partial unique constraint on `deleted_at`) | `apps/api/plane/db/models/cycle.py:104` | Initiative↔Project, Milestone↔Issue joins |
| Status TextChoices on an entity (`ModuleStatus`) | `apps/api/plane/db/models/module.py:58`, field `:74` | any lifecycle status |
| `is_epic` boolean on IssueType (epics already exist as a flag, **not a model**) | `apps/api/plane/db/models/issue_type.py:19` | Initiative→epic rollup |
| Analytics base views | `apps/api/plane/app/views/analytic/base.py:37` (`AnalyticsEndpoint`), `project_analytics.py:31` (`ProjectAdvanceAnalyticsBaseView`) | Overview analytics |
| Analytics URL registration | `apps/api/plane/app/urls/analytic.py`, wired in `apps/api/plane/app/urls/__init__.py:5,27` | new URL modules |
| Frontend `ce/` subclass stub | `apps/web/ce/store/analytics.store.ts` | every `ce/` stub we add |

### What already exists vs net-new

- **Exists:** Project, ProjectMember (`project.py:69`), State (issue-state, `state.py:79`),
  Cycle + progress_snapshot (`cycle.py:60/74`), Module + status (`module.py:67/74`),
  epics as `IssueType.is_epic` flag (`issue_type.py:19`), workspace-level and project-level
  analytics endpoints (`app/views/analytic/`), a basic module/project detail page under
  `apps/web/app/(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/`.
- **Absent (net-new, grep-confirmed):** `Initiative`, `Milestone`, `EntityUpdate`,
  any project-level *status* model, and any **overview/analytics overlay page** for a single
  project or module.

---

## 1. Initiatives

Top-level grouping **above** projects: `Initiative → (Projects + Epics)`. Workspace-scoped.

### Behavior
- A workspace admin/member creates an Initiative (name, description, lead, dates, status,
  logo/color). Initiatives live in the left workspace sidebar, above the project list.
- An Initiative aggregates **projects** and optionally **epics** (epics = `IssueType.is_epic`
  issues, `issue_type.py:19`). Its detail page shows a rollup progress bar (completed vs total
  work items across all linked projects/epics), the member project cards, and an Updates tab
  (see §4).
- Grouping/kanban of initiatives by their own status (reuse the Project-State grouping UX, §3).

### Data model
New file `apps/api/plane/db/models/initiative.py`. Workspace-scoped → extends `BaseModel`
(`base.py:17`), **not** `ProjectBaseModel` (an Initiative has no single project).

```python
# initiative.py
class Initiative(BaseModel):                      # BaseModel: base.py:17
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE,
                                  related_name="workspace_initiative")
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    description_html = models.JSONField(blank=True, null=True)
    lead = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                             null=True, related_name="initiative_leads")
    start_date = models.DateField(null=True)
    end_date = models.DateField(null=True)
    # status: reuse a TextChoices like ModuleStatus (module.py:58), or FK to a
    # workspace InitiativeState if we want configurable states (see §3 pattern).
    status = models.CharField(max_length=30, default="planned")
    sort_order = models.FloatField(default=65535)   # save()-assigned, cf. cycle.py:88
    logo_props = models.JSONField(default=dict)     # cf. cycle.py:76
    progress_snapshot = models.JSONField(default=dict)  # rollup cache, cf. cycle.py:74
    external_source = models.CharField(max_length=255, null=True, blank=True)
    external_id = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        db_table = "initiatives"
        ordering = ("sort_order",)

class InitiativeProject(BaseModel):               # join, cf. CycleIssue cycle.py:104
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE,
                                  related_name="workspace_initiative_projects")
    initiative = models.ForeignKey(Initiative, on_delete=models.CASCADE,
                                   related_name="initiative_projects")
    project = models.ForeignKey("db.Project", on_delete=models.CASCADE,
                                related_name="project_initiatives")
    sort_order = models.FloatField(default=65535)
    class Meta:
        db_table = "initiative_projects"
        unique_together = ["initiative", "project", "deleted_at"]
        constraints = [models.UniqueConstraint(
            fields=["initiative", "project"],
            condition=Q(deleted_at__isnull=True),
            name="initiative_project_when_deleted_at_null")]   # cf. cycle.py:114

class InitiativeEpic(BaseModel):                  # optional: link epics directly
    initiative = models.ForeignKey(Initiative, on_delete=models.CASCADE,
                                   related_name="initiative_epics")
    epic = models.ForeignKey("db.Issue", on_delete=models.CASCADE,
                             related_name="epic_initiatives")   # Issue with is_epic type
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE,
                                  related_name="workspace_initiative_epics")
    class Meta:
        db_table = "initiative_epics"
        unique_together = ["initiative", "epic", "deleted_at"]
```

**Rollup progress.** Denormalise into `Initiative.progress_snapshot` exactly like Cycle
(`cycle.py:74`): `{total_issues, completed_issues, backlog, started, unstarted, cancelled,
completed_projects, total_projects}`. Compute in a bgtask (mirror `bgtasks/analytic_plot_export`
pattern referenced at `analytic/base.py:21`) aggregating issues across `InitiativeProject`
projects grouped by `State.group` (`state.py:85`), refreshed on issue state-change signals and
on demand.

**Migration sketch:** one migration creating `initiatives`, `initiative_projects`,
`initiative_epics`; add the three models to `db/models/__init__.py`. No changes to existing tables.

### Backend
Internal `app/`:
- `GET/POST  /api/workspaces/<slug>/initiatives/`
- `GET/PATCH/DELETE /api/workspaces/<slug>/initiatives/<uuid:pk>/`
- `GET/POST  /api/workspaces/<slug>/initiatives/<uuid:initiative_id>/projects/`
- `DELETE    /api/workspaces/<slug>/initiatives/<uuid:initiative_id>/projects/<uuid:project_id>/`
- `POST/DELETE .../initiatives/<id>/epics/...`
- `GET       .../initiatives/<id>/analytics/` (rollup — reuse §5 engine)

Public v1 `api/` (mirror `api/urls/cycle.py:7`): `InitiativeListCreateAPIEndpoint`,
`InitiativeDetailAPIEndpoint` at `/api/v1/workspaces/<slug>/initiatives/...` with `X-API-Key`.
Register new url module in `app/urls/__init__.py` alongside `analytic_urls` (`__init__.py:5,27`).

### Frontend
- Routes: `apps/web/app/(all)/[workspaceSlug]/(projects)/initiatives/(list)/page.tsx` and
  `.../initiatives/(detail)/[initiativeId]/{page,updates,projects}.tsx` — mirror the projects
  list/detail split at `(projects)/projects/(list)/page.tsx` and `(detail)/[projectId]/`.
- Components: `apps/web/core/components/initiatives/` (list, card, detail-header, sidebar,
  progress-bar, project-link modal). Reuse the epic modal scaffold at
  `apps/web/ce/components/epics/epic-modal/`.
- `ce/` stub to add: `apps/web/ce/store/initiative/index.ts` re-exporting the real
  `@/store/initiative` (pattern: `ce/store/analytics.store.ts`), plus
  `ce/components/initiatives/` re-export stubs so `@/plane-web/components/initiatives` resolves.
- Nav: add "Initiatives" entry to the workspace sidebar (`apps/web/ce/components/sidebar/`).
- Store: `InitiativeStore` (mobx) in `apps/web/core/store/initiative/`, registered in root store.

### Effort / deps / risks
- **Effort: XL** (new workspace entity + two joins + rollup + full nav + list/detail UI).
- **Dependencies/order:** depends on nothing structurally; **build first** because Updates (§4)
  and the sidebar nav reference it, and it validates the workspace-scoped model pattern.
- **Risks:** rollup consistency across many projects (denormalise + signal-refresh, don't compute
  live); permission scoping (Initiative is workspace-level but member projects may be private —
  filter linked projects by `ProjectMember`); sidebar IA change is a long-lived branch concern.
- **Silo-required?** **No.** Backend is unbuilt in CE but ungated; we implement it natively.
  Alternative if we defer backend: a purely client-side "saved grouping" over projects — rejected
  (no rollup, no sharing).

---

## 2. Milestones

Time-boxed goals **within a project** (optionally tied to a cycle), with work items attached.

### Behavior
- Inside a project, a user creates a Milestone (name, target_date, optional cycle link, status).
- Work items are attached to a milestone; the milestone shows progress (completed/total) and a
  due-date countdown. Milestones render as a list and as markers on the cycle/timeline.
- Completing all linked items (or manual toggle) marks the milestone done.

### Data model
New `apps/api/plane/db/models/milestone.py`, project-scoped → extends `ProjectBaseModel`
(`project.py:181`, which auto-fills `workspace` from `project`).

```python
class Milestone(ProjectBaseModel):                # ProjectBaseModel: project.py:181
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    start_date = models.DateField(null=True)
    target_date = models.DateField(null=True)
    cycle = models.ForeignKey("db.Cycle", on_delete=models.SET_NULL, null=True, blank=True,
                              related_name="cycle_milestones")   # optional cycle box
    status = models.CharField(max_length=20, default="planned")  # cf. ModuleStatus module.py:58
    owned_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                 null=True, related_name="owned_milestones")
    sort_order = models.FloatField(default=65535)                # cf. cycle.py:88
    progress_snapshot = models.JSONField(default=dict)           # cf. cycle.py:74
    class Meta:
        db_table = "milestones"
        ordering = ("target_date", "sort_order")

class MilestoneIssue(ProjectBaseModel):           # join, exact CycleIssue shape cycle.py:104
    milestone = models.ForeignKey(Milestone, on_delete=models.CASCADE,
                                  related_name="milestone_issues")
    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE,
                              related_name="issue_milestone")
    class Meta:
        db_table = "milestone_issues"
        unique_together = ["milestone", "issue", "deleted_at"]
        constraints = [models.UniqueConstraint(
            fields=["milestone", "issue"], condition=Q(deleted_at__isnull=True),
            name="milestone_issue_when_deleted_at_null")]        # cf. cycle.py:114
```

**Progress:** same denormalised `progress_snapshot` approach as Cycle (`cycle.py:74`),
aggregating `MilestoneIssue` issues by `State.group` (`state.py:85`).

**Migration sketch:** create `milestones`, `milestone_issues`; register in `db/models/__init__.py`.

### Backend
Internal `app/`:
- `GET/POST /api/workspaces/<slug>/projects/<project_id>/milestones/`
- `GET/PATCH/DELETE .../milestones/<uuid:pk>/`
- `GET/POST .../milestones/<milestone_id>/milestone-issues/`
- `DELETE .../milestones/<milestone_id>/milestone-issues/<issue_id>/`

Public v1 `api/`: `MilestoneListCreate/DetailAPIEndpoint`,
`MilestoneIssueListCreate/DetailAPIEndpoint` — clone `api/views/module.py` (Module↔ModuleIssue
mirrors Milestone↔MilestoneIssue) and `api/urls/cycle.py:16` URL layout under
`/api/v1/workspaces/<slug>/projects/<project_id>/milestones/...`.

### Frontend
- Routes: `.../projects/(detail)/[projectId]/milestones/{page.tsx,[milestoneId]/page.tsx}`
  (sibling of the existing `modules/`, `cycles/` folders under
  `(detail)/[projectId]/`).
- Components: `apps/web/core/components/milestones/` (list, card, form-modal, progress, sidebar).
  Clone the existing modules components as the template.
- `ce/` stub: `apps/web/ce/store/milestone/index.ts` and `ce/components/milestones/` re-export
  stubs (pattern: `ce/store/analytics.store.ts`).
- Nav: add "Milestones" to the project navigation tabs (project detail layout at
  `(detail)/[projectId]/layout.tsx`) — gated on a `project.milestone_view` boolean added to
  Project (`project.py:94-98` has `module_view`, `cycle_view` toggles to copy).
- Store: `MilestoneStore` in root store.

### Effort / deps / risks
- **Effort: M** (a near-clone of Module/Cycle; the hardest work — join model, progress snapshot,
  project-nav toggle — already has an exact in-repo template).
- **Dependencies/order:** independent of Initiatives; can proceed in parallel. Updates (§4) may
  attach to a milestone, so land Milestone model before Update polymorphism finalises.
- **Risks:** cycle↔milestone double-boxing semantics (keep cycle link optional/soft); progress
  recompute cost on large projects (signal + bgtask, not live).
- **Silo-required?** **No.** Native clone of the Module pattern.

---

## 3. Project States (group projects by status)

A **project-level status** (analogous to issue `State` at `state.py:79`, but for projects), so the
projects list can be grouped or kanban'd by status.

### Behavior
- Workspace defines a set of Project States (Backlog / Planned / Execution / Monitoring / Completed
  / Cancelled), each with a `group` and color — mirrors issue `StateGroup` (`state.py:14`).
- Every project gets a `state` FK. The projects list page gains **Group by / Kanban by status**.
- Drag a project card between columns → PATCH the project's state.

### Data model
Two changes.

1. New workspace-scoped `ProjectState` in `apps/api/plane/db/models/project.py` (or a new
   `project_state.py`). Model it on `State` (`state.py:79`) but keyed to **workspace**, not project:

```python
class ProjectStateGroup(models.TextChoices):      # mirror StateGroup state.py:14
    BACKLOG = "backlog", "Backlog"
    PLANNED = "planned", "Planned"
    EXECUTION = "execution", "Execution"
    MONITORING = "monitoring", "Monitoring"
    COMPLETED = "completed", "Completed"
    CANCELLED = "cancelled", "Cancelled"

class ProjectState(BaseModel):                    # BaseModel base.py:17 (workspace-level)
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE,
                                  related_name="workspace_project_states")
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    color = models.CharField(max_length=255)
    group = models.CharField(choices=ProjectStateGroup.choices,
                             default=ProjectStateGroup.PLANNED, max_length=20)  # cf. state.py:85
    sequence = models.FloatField(default=65535)   # auto-assign in save(), cf. state.py:117
    default = models.BooleanField(default=False)
    class Meta:
        db_table = "project_states"
        unique_together = ["name", "workspace", "deleted_at"]   # cf. state.py:104
        ordering = ("sequence",)
```

2. Add FK on Project (`project.py:69`), mirroring the existing `default_state` FK at
   `project.py:114`:

```python
# Project model, project.py
state = models.ForeignKey("db.ProjectState", on_delete=models.SET_NULL,
                          null=True, blank=True, related_name="projects")
```

**Migration sketch:** create `project_states` + workspace default-seed (data migration seeding the
6 groups, mirroring `DEFAULT_STATES` at `state.py:24`); `AddField` `Project.state`.

### Backend
Internal `app/`:
- `GET/POST /api/workspaces/<slug>/project-states/`
- `GET/PATCH/DELETE /api/workspaces/<slug>/project-states/<uuid:pk>/`
- Extend the existing Project serializer/view to accept `state` and to support
  `?group_by=state` on the project list (the issue list already does grouped queries — reuse that
  serializer grouping approach).

Public v1 `api/`: extend `api/views/project.py` to expose/accept `state`; add
`ProjectStateListCreate/DetailAPIEndpoint` under `/api/v1/workspaces/<slug>/project-states/`.

### Frontend
- No new route — enhance `(projects)/projects/(list)/page.tsx`.
- Components: add a status column/select to the project card and a **Kanban-by-status** board view
  (reuse the issue kanban layout components); a Project-States settings screen under
  `(settings)/settings/projects/` mirroring the existing per-project **states** settings page at
  `(settings)/settings/projects/[projectId]/states`.
- `ce/` stub: `apps/web/ce/store/project-state/index.ts` re-export stub; the projects store
  (`ce/store/...`) gains group-by-state selectors.
- Store: extend the workspace `ProjectStore` with `projectStatesMap` + grouping getters.

### Effort / deps / risks
- **Effort: M** (model is a State clone; the grouping/kanban UI on the project list is the bulk).
- **Dependencies/order:** independent. Nice to land before Initiatives if we want initiative
  cards grouped the same way, but not required.
- **Risks:** naming collision with issue `State` (namespace clearly as `ProjectState`); default
  seeding per workspace on migration and on workspace-create signal.
- **Silo-required?** **No.** Pure State-pattern clone at workspace scope.

---

## 4. Updates (status posts)

Periodic status posts (health color + text) on a **project, cycle, or initiative** — a lightweight
polymorphic-ish "status update" timeline.

### Behavior
- On a project/cycle/initiative page, a user posts an Update: a **health** (green/yellow/red),
  optional target-progress %, and rich-text body.
- Updates render as a reverse-chronological timeline; the latest health drives a badge on the
  parent entity (project card, initiative header). Comments/reactions optional (v2).

### Data model
Polymorphic-ish via nullable FKs (Plane's usual style — avoids Django GenericForeignKey and keeps
DB constraints/joins simple). New `apps/api/plane/db/models/update.py`:

```python
class UpdateStatus(models.TextChoices):
    ON_TRACK = "on-track", "On Track"
    AT_RISK = "at-risk", "At Risk"
    OFF_TRACK = "off-track", "Off Track"

class EntityUpdate(BaseModel):                    # BaseModel base.py:17
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE,
                                  related_name="workspace_updates")
    # exactly one of the following is set (enforced by CheckConstraint):
    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, null=True, blank=True,
                                related_name="project_updates")
    cycle = models.ForeignKey("db.Cycle", on_delete=models.CASCADE, null=True, blank=True,
                              related_name="cycle_updates")
    initiative = models.ForeignKey("db.Initiative", on_delete=models.CASCADE, null=True,
                                   blank=True, related_name="initiative_updates")
    status = models.CharField(choices=UpdateStatus.choices, default=UpdateStatus.ON_TRACK,
                              max_length=20)       # health color
    description = models.TextField(blank=True)
    description_html = models.JSONField(blank=True, null=True)
    completed_percentage = models.FloatField(default=0)
    class Meta:
        db_table = "entity_updates"
        ordering = ("-created_at",)               # timeline order, cf. cycle.py:86
        constraints = [models.CheckConstraint(
            name="entity_update_exactly_one_parent",
            check=(
                Q(project__isnull=False, cycle__isnull=True, initiative__isnull=True) |
                Q(project__isnull=True, cycle__isnull=False, initiative__isnull=True) |
                Q(project__isnull=True, cycle__isnull=True, initiative__isnull=False)
            ))]

class UpdateReaction(BaseModel):   # optional v2, clone issue reaction pattern
    update = models.ForeignKey(EntityUpdate, on_delete=models.CASCADE, related_name="reactions")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    reaction = models.CharField(max_length=20)
```

Alternative to three nullable FKs: an `entity_type`/`entity_id` pair (true polymorphic). Rejected —
loses FK cascade + join efficiency; the nullable-FK + CheckConstraint form matches how Plane models
optional parents and is queryable per-parent.

**Migration sketch:** create `entity_updates` (+ `update_reactions` if v2). The `initiative` FK
means Updates depends on §1's `Initiative` existing (or make that FK nullable/added in a later
migration to decouple ordering).

### Backend
Internal `app/` — one nested route per parent (keeps permissions simple):
- `GET/POST /api/workspaces/<slug>/projects/<project_id>/updates/`
- `GET/PATCH/DELETE .../projects/<project_id>/updates/<uuid:pk>/`
- `GET/POST .../projects/<project_id>/cycles/<cycle_id>/updates/`
- `GET/POST .../initiatives/<initiative_id>/updates/`

Public v1 `api/`: `EntityUpdateListCreate/DetailAPIEndpoint` under the same nested paths with
`X-API-Key`.

### Frontend
- No dedicated route; an **Updates tab/panel** on each parent detail page (project, cycle,
  initiative). Component `apps/web/core/components/updates/` (timeline, update-card,
  health-badge, composer). Reuse rich-text editor and reaction components already in `core/`.
- `ce/` stub: `apps/web/ce/store/update/index.ts` and `ce/components/updates/` re-export stubs.
- Nav: add "Updates" tab in project/cycle/initiative detail layouts.
- Store: `UpdateStore` keyed by `entityType:entityId`.

### Effort / deps / risks
- **Effort: M** (single small model, one reusable timeline component reused across three parents).
- **Dependencies/order:** the `initiative` FK depends on §1. **Order: build after Initiatives**
  (or ship project+cycle updates first, add the initiative FK in a follow-up migration).
- **Risks:** the "exactly one parent" invariant — enforce with the CheckConstraint above **and**
  serializer validation; permission inheritance from parent entity.
- **Silo-required?** **No.** Native model + reused editor/timeline UI.

---

## 5. Project / Module Overview analytics

An **overview/analytics overlay page** for a single **project** and for a single **module** —
charts, breakdowns, burndown. Basic project/module detail pages exist; the **analytics overview is
absent**.

### Behavior
- A project's "Overview" (or "Analytics") tab shows: work-item counts by state group, by priority,
  by assignee; completion trend/burndown; overdue count; cycle/module progress cards.
- A module's overview shows the same scoped to that module's issues, plus its burndown vs
  `target_date` (`module.py:73`).

### Data model
**None new.** This is a read/aggregation feature over existing `Issue`, `CycleIssue`, `ModuleIssue`.

### Backend — reuse `app/views/analytic/`
The engine already exists:
- `AnalyticsEndpoint` (`analytic/base.py:37`) does the generic x/y/segment plot via
  `build_graph_plot` (`analytic/base.py:32`).
- `ProjectAdvanceAnalyticsBaseView` + `ProjectAdvanceAnalytics{,Stats,Chart}Endpoint` already
  exist and are routed at `app/urls/analytic.py:76-89`
  (`/workspaces/<slug>/projects/<project_id>/advance-analytics{,-stats,-charts}/`).
  **Project overview is largely already served** — the gap is a **frontend page** binding to these.
- **Net-new for modules:** add `ModuleAdvanceAnalytics{,Stats,Chart}Endpoint` mirroring the
  project ones (filter the queryset by `ModuleIssue` — `project_analytics.py` already imports
  `ModuleIssue`), routed at
  `/workspaces/<slug>/projects/<project_id>/modules/<module_id>/advance-analytics{,-stats,-charts}/`
  in `app/urls/analytic.py`.

Public v1 `api/`: optionally expose read-only `.../projects/<id>/analytics/` and
`.../modules/<id>/analytics/` returning the stats JSON.

### Frontend
- Routes: `(detail)/[projectId]/(overview)/page.tsx` for project;
  `(detail)/[projectId]/modules/[moduleId]/(overview)/page.tsx` for module.
- Components: `apps/web/core/components/analytics/overview/` — charts reusing the existing
  analytics chart components (the `ce/store/analytics.store.ts` → `BaseAnalyticsStore` already
  models the data layer). Add project/module scoped variants.
- `ce/` stub: extend `apps/web/ce/store/analytics.store.ts` (currently
  `export class AnalyticsStore extends BaseAnalyticsStore {}`) with project/module-scoped
  selectors, and add `ce/components/analytics/` overview re-export stubs.
- Nav: add "Overview" tab to project and module detail layouts.

### Effort / deps / risks
- **Effort: S–M.** Project side ≈ **S** (endpoints exist; build the page). Module side ≈ **M**
  (add three module endpoints + page).
- **Dependencies/order:** independent; can ship first as a low-risk win. Milestone/Initiative
  rollups (§1/§2) can reuse the same chart-building utilities.
- **Risks:** query cost on large projects (the advance-analytics endpoints already scope by
  project; add DB indexes if needed); chart component reuse must not import silo-only pieces.
- **Silo-required?** **No.** The backend analytics engine is fully present in CE
  (`app/views/analytic/`); only frontend pages + module endpoints are missing.

---

## 6. Build order & effort summary

| # | Feature | Net-new models | Effort | Silo? | Order rationale |
|---|---|---|---|---|---|
| 5 | Project/Module Overview analytics | none | **S–M** | No | Ship first — backend mostly exists, low risk, utilities reused downstream |
| 3 | Project States | `ProjectState` + `Project.state` FK | **M** | No | Independent; enables grouped project/initiative lists |
| 2 | Milestones | `Milestone`, `MilestoneIssue` | **M** | No | Independent Module-clone; parallelizable |
| 1 | Initiatives | `Initiative`, `InitiativeProject`, `InitiativeEpic` | **XL** | No | Broad; must precede Updates' initiative FK and sidebar IA |
| 4 | Updates | `EntityUpdate` (+`UpdateReaction`) | **M** | No | After Initiatives (initiative FK); can ship project/cycle scope earlier |

**Cross-cutting risks:** (a) sidebar/IA changes (Initiatives, tabs) should live on a long-lived
feature branch, not merged piecemeal to `develop`; (b) every rollup uses denormalised
`progress_snapshot` + signal/bgtask refresh — never live aggregation on read (follow `cycle.py:74`);
(c) all new `@/plane-web/*` imports must have a matching `apps/web/ce/**` stub or the build breaks
(the alias at `tsconfig.json:9` has no fallback).

**Silo verdict:** none of the five features require the external silo. The CE backend is ungated,
so we implement real Django models + DRF endpoints in `apps/api/plane/` and replace the frontend
`apps/web/ce/` stubs with real implementations.
