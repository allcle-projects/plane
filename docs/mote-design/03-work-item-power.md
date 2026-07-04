# 03 — Work Item Power Features (Design Spec)

> Scope: design-only spec for four paid Plane features to self-host on our CE fork
> (`/home/otro/git/plane-fork`, branch `mote`, Plane CE v1.3.1).
> Features: **Custom Fields**, **Templates**, **Recurring Work Items**, **Time Tracking**.
> Nothing here is implemented — this is the blueprint. Every claim about existing code cites `file:line`.

---

## 0. Ground truth: how this fork is wired (read before designing)

### 0.1 Backend layout (unified, no `ee/`)
- All Django code lives under `apps/api/plane/`:
  - `app/` = internal cookie-session API (`app/views/`, `app/urls/`, `app/serializers/`, `app/permissions/`).
  - `api/` = **public v1 API**, authenticated by `X-API-Key`. Base classes in `apps/api/plane/api/views/base.py:50` (`BaseAPIView`, `authentication_classes = [APIKeyAuthentication]` at `:51`) and `:167` (`BaseViewSet`). Public routes registered per-resource, e.g. `apps/api/plane/api/urls/work_item.py`.
  - `db/models/` = models, `bgtasks/` = celery tasks, `license/` = instance license (telemetry only — **no feature gating**, no seat/entitlement checks in backend).
- **There is no `ee/` directory and no backend license gate.** The paid features' backend logic is not in this repo at all (it lives in the external closed-source "silo"). So for every feature below, **the backend is net-new** — we author it in `app/` + `api/`.

### 0.2 Frontend layout + the CE stub pattern (this is the key lever)
- `apps/web/` is Next.js. Alias `@/plane-web/* → ./ce/*` (`apps/web/tsconfig.json:9`). Enterprise builds point `@/plane-web` at a real `web/` impl; our CE points it at `apps/web/ce/`, which contains **stubs that render nothing**.
- **All four features already have CE stubs** — the integration seams are pre-cut. Core code imports the paid component through `@/plane-web/...`; today it resolves to an empty stub. To ship a feature we replace the stub body (and back it with real stores + API). Existing stubs:

| Feature | CE stub file | Symbol | Current body |
|---|---|---|---|
| Custom Fields (sidebar) | `apps/web/ce/components/issues/issue-details/additional-properties.tsx:19` | `WorkItemAdditionalSidebarProperties` | `return <></>` |
| Custom Fields (list/spreadsheet) | `apps/web/ce/components/issues/issue-layouts/additional-properties.tsx:15` | `WorkItemLayoutAdditionalProperties` | `return <></>` |
| Custom Fields (create modal) | `apps/web/ce/components/issues/issue-modal/modal-additional-properties.tsx:14` | `WorkItemModalAdditionalProperties` | `return null` |
| Custom Fields (value types) | `apps/web/ce/types/issue-types/issue-property-values.d.ts:1` | `TIssuePropertyValues = object` | empty type |
| Templates | `apps/web/ce/components/issues/issue-modal/template-select.tsx:22` | `WorkItemTemplateSelect` | `return <></>` |
| Time Tracking (sidebar) | `apps/web/ce/components/issues/worklog/property/root.tsx` | `IssueWorklogProperty` | `return <></>` |
| Time Tracking (activity feed) | `apps/web/ce/components/issues/worklog/activity/root.tsx` | `IssueActivityWorklog` | `return <></>` |
| Time Tracking (add button) | `apps/web/ce/components/issues/worklog/activity/worklog-create-button.tsx` | `IssueActivityWorklogCreateButton` | `return <></>` |

- **Consumers already call these seams** (so we don't touch core wiring, only the stub + stores):
  - `apps/web/core/components/issues/issue-detail/sidebar.tsx`
  - `apps/web/core/components/issues/issue-detail/issue-activity/root.tsx` and `.../activity-comment-root.tsx`
  - `apps/web/core/components/issues/issue-modal/form.tsx`
  - `apps/web/core/components/issues/peek-overview/properties.tsx`
  - `apps/web/core/components/issues/issue-layouts/properties/all-properties.tsx`

### 0.3 Reusable model/base primitives
- `BaseModel` (`apps/api/plane/db/models/base.py:17`): UUID PK + `AuditModel` (created/updated by+at), soft-delete via `deleted_at`, auto-sets `created_by`/`updated_by` from `crum.get_current_user()`.
- `ProjectBaseModel` (`apps/api/plane/db/models/project.py:181`): adds `project` + `workspace` FKs, auto-derives `workspace` from `project` on save. **Use this as the parent for anything project-scoped.**
- `WorkspaceBaseModel` (`apps/api/plane/db/models/workspace.py:185`): workspace-scoped, nullable project.
- `Issue` (`apps/api/plane/db/models/issue.py:105`): the work item. Note the sequence/sort-order advisory-lock logic in `save()`.
- `IssueActivity` (`apps/api/plane/db/models/issue.py:407`): audit-feed row (`verb`/`field`/`old_value`/`new_value`/`actor`/`epoch`). The activity feed reads these. Custom-field edits, worklog adds, and recurring auto-creates should all emit `IssueActivity` rows for consistency.
- `Estimate` + `EstimatePoint` (`apps/api/plane/db/models/estimate.py:18,43`): **the closest existing precedent** for a "definition + child options" shape — reuse this pattern for select/multi-select option storage.
- `IssueType` + `ProjectIssueType` (`apps/api/plane/db/models/issue_type.py:14,35`): **already present** (workspace-scoped work-item types, `is_epic`, `is_default`). But there are **no `app/` or `api/` views/urls for issue types** — the model is orphaned scaffolding. Plane's EE hangs custom properties off `IssueType`; we follow that (properties belong to a type), so we must also expose type CRUD.
- `ProjectUserProperty` (`apps/api/plane/db/models/project.py:343`): per-user, per-project view state — `display_properties` JSON (`apps/api/plane/db/models/issue.py:74`, `get_default_display_properties`), `filters`, `display_filters`, `rich_filters`. **This is where custom-field column visibility + filters must be threaded** (extend the JSON, keyed by property id).

### 0.4 Celery / scheduling
- `apps/api/plane/celery.py:29` defines `app.conf.beat_schedule` (static crontab jobs), and `:103` sets `beat_scheduler = "django_celery_beat.schedulers.DatabaseScheduler"`. `django_celery_beat` is in migrations. So we have **both**: static beat entries (good for a single "sweep every N minutes" dispatcher) and DB-backed `PeriodicTask`/`CrontabSchedule` rows (good for per-record custom cadences). Recurring Work Items uses this.
- Task modules live in `apps/api/plane/bgtasks/` (e.g. `issue_automation_task.py`, `issue_activities_task.py`), autodiscovered.

---

## 1. Custom Fields / Work Item Properties  — **XL, phased**

Biggest feature. Scaffolding present: `IssueType` model + the CE stubs in §0.2 + empty `TIssuePropertyValues`. Everything else (models, migrations, all backend views, real frontend) is net-new. **Break into 4 phases.**

### 1.1 Behavior (user-facing)
- Admin defines properties on a **work item type** (`IssueType`): name, type, required, default, options (for selects), settings (min/max, multi toggle).
- Supported types: `TEXT`, `NUMBER`, `SELECT`, `MULTI_SELECT`, `DATE`, `MEMBER`, `BOOLEAN`, `URL` (and future `RELATION`/`FILE`).
- On a work item of that type: extra fields appear in the **detail sidebar** and **create modal**; values are editable inline, validated against the property definition, and changes appear in the activity feed.
- In list/spreadsheet layouts, each active property can be a **toggleable column**; values render read-only or inline-editable.
- Properties are **filterable** and appear in saved views (rich filters).

### 1.2 Data model (net-new)
Follow the `Estimate`/`EstimatePoint` shape (definition + child options). Two tables minimum; three with option table.

```python
# apps/api/plane/db/models/issue_property.py  (NEW)
from django.db import models
from django.contrib.postgres.fields import ArrayField
from .workspace import WorkspaceBaseModel   # workspace-scoped, nullable project

class PropertyTypeEnum(models.TextChoices):
    TEXT="TEXT"; NUMBER="NUMBER"; SELECT="SELECT"; MULTI_SELECT="MULTI_SELECT"
    DATE="DATE"; MEMBER="MEMBER"; BOOLEAN="BOOLEAN"; URL="URL"

class IssueProperty(WorkspaceBaseModel):          # the definition
    issue_type   = models.ForeignKey("db.IssueType", related_name="properties", on_delete=models.CASCADE)
    name         = models.CharField(max_length=255)          # internal
    display_name = models.CharField(max_length=255)          # UI label
    description  = models.TextField(blank=True)
    property_type= models.CharField(max_length=30, choices=PropertyTypeEnum.choices)
    relation_type= models.CharField(max_length=30, null=True, blank=True)  # for MEMBER/RELATION subtype
    is_required  = models.BooleanField(default=False)
    is_active    = models.BooleanField(default=True)
    is_multi     = models.BooleanField(default=False)        # multi-select / multi-value
    default_value= ArrayField(models.TextField(), default=list, blank=True)
    settings     = models.JSONField(default=dict)            # {min,max,format,...}
    sort_order   = models.FloatField(default=65535)
    external_source = models.CharField(max_length=255, null=True, blank=True)
    external_id     = models.CharField(max_length=255, null=True, blank=True)
    class Meta:
        db_table = "issue_properties"
        unique_together = ["issue_type", "name", "deleted_at"]

class IssuePropertyOption(WorkspaceBaseModel):    # options for SELECT/MULTI_SELECT
    property   = models.ForeignKey("db.IssueProperty", related_name="options", on_delete=models.CASCADE)
    name       = models.CharField(max_length=255)
    sort_order = models.FloatField(default=65535)
    is_active  = models.BooleanField(default=True)
    is_default = models.BooleanField(default=False)
    parent     = models.ForeignKey("self", null=True, blank=True, on_delete=models.CASCADE)  # cascading selects
    class Meta:
        db_table = "issue_property_options"

class IssuePropertyValue(WorkspaceBaseModel):     # value on a work item; one row PER value (multi = N rows)
    property = models.ForeignKey("db.IssueProperty", related_name="values", on_delete=models.CASCADE)
    issue    = models.ForeignKey("db.Issue", related_name="property_values", on_delete=models.CASCADE)
    # exactly one of the following is populated based on property_type:
    value_text     = models.TextField(null=True, blank=True)
    value_decimal  = models.DecimalField(max_digits=20, decimal_places=6, null=True, blank=True)
    value_datetime = models.DateTimeField(null=True, blank=True)
    value_boolean  = models.BooleanField(null=True)
    value_uuid     = models.UUIDField(null=True)   # member id / option id
    value_option   = models.ForeignKey("db.IssuePropertyOption", null=True, blank=True, on_delete=models.CASCADE)
    class Meta:
        db_table = "issue_property_values"
        indexes = [
            models.Index(fields=["issue", "property"]),
            models.Index(fields=["property", "value_uuid"]),   # for filtering by member/option
            models.Index(fields=["property", "value_option"]),
        ]
```

**Design decision — EAV vs JSONB.** Use the **typed-column EAV** above (one `IssuePropertyValue` row per value), *not* a single JSONB blob on `Issue`. Reasons: (a) filtering/sorting by a property needs indexable columns; a JSONB blob forces GIN indexes + expression queries that don't compose with Plane's existing `Q()` filter builder; (b) multi-select is naturally N rows; (c) matches Plane EE's own schema so future upstream merges are cleaner. Risk: value queries fan out — mitigate with the composite indexes above and `prefetch_related("property_values")`.

Register in `apps/api/plane/db/models/__init__.py` (next to the `from .issue_type import IssueType` at `:82`).

**Migration sketch:** one migration `xxxx_issue_properties.py` creating the 3 tables + FKs to existing `issue_types`/`issues`/`workspaces`. No changes to `issues` table.

### 1.3 Backend
Internal (`app/`):
- New `app/views/issue_type/` package + `app/urls/issue_type.py` (must add — none exists today):
  - `GET/POST  workspaces/<slug>/issue-types/` and `.../<type_id>/` (PATCH/DELETE) — **also net-new; the IssueType model has no endpoints.**
  - `GET/POST  workspaces/<slug>/issue-types/<type_id>/properties/` + `.../<prop_id>/`
  - `GET/POST  .../properties/<prop_id>/options/` + `.../<option_id>/`
  - `GET/POST/PATCH  workspaces/<slug>/projects/<pid>/issues/<issue_id>/property-values/` (bulk upsert: accept `{property_id: [values]}`, diff, write rows, emit `IssueActivity`).
- Serializers under `app/serializers/issue_property.py`; validation per type (number range, url format, option membership, required).
- Thread values into the issue list/detail response: extend the issue serializer / `all-properties` payload so the frontend gets `property_values` in one round-trip (avoid N+1 — `prefetch_related`).
- **Filtering:** extend the filter builder used by the issue list endpoints so `?property_<id>=...` maps to a subquery on `issue_property_values`. Store column visibility in `ProjectUserProperty.display_properties` (`project.py:343`) under a `custom_properties` sub-key.

Public v1 (`api/`), mirroring `api/urls/work_item.py`:
- `GET/POST  /api/v1/workspaces/<slug>/issue-types/…/properties/` (read + manage definitions).
- `GET/PATCH /api/v1/workspaces/<slug>/projects/<pid>/issues/<id>/property-values/`.
- Reuse `BaseAPIView` (`api/views/base.py:50`, X-API-Key auth).

Celery: none required for core CRUD. Optional `bgtasks/issue_property_task.py` to backfill defaults when a new required property is added to a type with existing issues.

### 1.4 Frontend
Replace stubs (§0.2), add stores, no core rewiring:
- **Types:** flesh out `apps/web/ce/types/issue-types/issue-property-values.d.ts` — `TIssuePropertyValues = Record<propertyId, string[]>`, plus `TIssueProperty`, `TIssuePropertyOption` types.
- **Stores (mobx):** new `apps/web/ce/store/issue/issue-details/` additions — a `PropertyDefinitionStore` (per type) and a `PropertyValueStore` (per issue). Mirror existing estimate store `apps/web/ce/store/estimates/estimate.ts`.
- **Sidebar:** implement `WorkItemAdditionalSidebarProperties` (`additional-properties.tsx:19`) — render one control per active property; reuse Plane UI dropdown/date/member components.
- **Create modal:** implement `WorkItemModalAdditionalProperties` (`modal-additional-properties.tsx:14`) — same controls, feed into the issue-create payload (consumed by `core/.../issue-modal/form.tsx`).
- **List/spreadsheet columns:** implement `WorkItemLayoutAdditionalProperties` (`issue-layouts/additional-properties.tsx:15`); add per-property column components alongside `core/components/issues/issue-layouts/spreadsheet/columns/` (pattern like `state-column.tsx`). Toggle via `display_properties`.
- **Filters:** custom-field filter UI in `apps/web/ce/hooks/work-item-filters/` and `ce/components/rich-filters/` (both dirs already exist as seams).
- **Settings UI:** new project/workspace settings page to manage types → properties → options (net-new route under `app/(all)/[workspaceSlug]/settings/...`).

### 1.5 Phasing (the XL breakdown)
- **Phase 1 (L) — Definitions + storage, no rendering.** Models + migration + issue-type/property/option CRUD (internal API) + settings UI to create properties. No values yet. Ships the admin surface.
- **Phase 2 (L) — Values on detail + modal.** `IssuePropertyValue` write/read, validation, sidebar + create-modal rendering, activity-feed entries. This delivers the core user value.
- **Phase 3 (M) — List columns + spreadsheet inline edit.** Column toggles via `display_properties`, per-type column components.
- **Phase 4 (M) — Filtering + saved views + public v1.** Filter builder subqueries, rich-filter UI, `?property_<id>` params, public API endpoints.

### 1.6 Effort / deps / risks
- **Effort: XL** (phased L/L/M/M).
- **Dependencies:** must land *before or with* Templates (templates capture property values) and Recurring (recurring templates carry property values). Phase 1 is a hard prerequisite for those.
- **Risks:**
  - *Filtering/perf* — the top risk. Property filters become correlated subqueries/joins against `issue_property_values`; on large projects this degrades list queries. Mitigate: composite indexes (§1.2), `EXISTS` subqueries over joins, cap simultaneous property filters, cache `display_properties`.
  - *Serializer N+1* — always `prefetch_related("property_values", "property_values__property")`.
  - *Type/option deletion* — soft-delete definitions (`deleted_at`) so historical values survive; never hard-cascade.
  - *Upstream drift* — mirror EE table names (`issue_properties`, `issue_property_values`) to ease future merges.
- **Silo-required?** No. Fully buildable on CE. The silo only ever provided closed-source impls of these same seams — we author our own.

---

## 2. Templates (work item + project templates) — **M**

Stub present: `WorkItemTemplateSelect` (`apps/web/ce/components/issues/issue-modal/template-select.tsx:22`). Everything else net-new.

### 2.1 Behavior
- User saves a work item (or a whole project shape) as a named **template**: captures name pattern, description, priority, labels, assignees, state, estimate, **custom-field values**, and (project template) modules/states/members/views scaffolding.
- On "create work item", a template dropdown (the existing stub) pre-fills the modal. "Create project from template" clones the shape.

### 2.2 Data model (net-new)
```python
# apps/api/plane/db/models/template.py (NEW)
class Template(WorkspaceBaseModel):
    TEMPLATE_TYPES = (("work_item","Work Item"), ("project","Project"))
    name          = models.CharField(max_length=255)
    description   = models.TextField(blank=True)
    template_type = models.CharField(max_length=30, choices=TEMPLATE_TYPES)
    template_data = models.JSONField(default=dict)   # serialized shape (see below)
    is_active     = models.BooleanField(default=True)
    class Meta:
        db_table = "templates"
        unique_together = ["workspace", "name", "template_type", "deleted_at"]
```
- `template_data` for a **work item**: `{name, description_html, priority, state_id, label_ids, assignee_ids, estimate_point_id, type_id, property_values}` — a plain JSON snapshot; resolved against the target project at apply time (IDs re-mapped or dropped if absent).
- **Project template**: `{project:{...}, states:[...], labels:[...], modules:[...], views:[...], members_roles:[...]}`. Instantiation orchestrated server-side.
- JSONB snapshot (not FKs) is deliberate — a template must survive deletion of the referenced state/label, and be portable across projects.

### 2.3 Backend
Internal (`app/`):
- `app/views/template/` + `app/urls/template.py`:
  - `GET/POST workspaces/<slug>/templates/` (`?type=work_item|project`), `.../<id>/` PATCH/DELETE.
  - `POST workspaces/<slug>/projects/<pid>/templates/<id>/instantiate/` → creates an `Issue` (reusing `Issue.save()` sequence logic at `issue.py:180+`) + writes property values.
  - `POST workspaces/<slug>/templates/<id>/instantiate-project/` → creates project + children (wrap in `transaction.atomic`).
- "Save as template" is just a `POST /templates/` with a client- or server-built snapshot.
Public v1: `GET/POST /api/v1/workspaces/<slug>/templates/` + instantiate endpoints.
Celery: none.

### 2.4 Frontend
- Implement `WorkItemTemplateSelect` (`template-select.tsx:22`) — dropdown fetching workspace templates by `typeId`, on-select pre-fills the modal (consumed by `core/.../issue-modal/form.tsx`).
- New `ce/store/templates/` store.
- "Save as template" action in the issue quick-actions (`apps/web/ce/components/issues/issue-layouts/quick-action-dropdowns/` already exists as a seam).
- Project templates: settings page + "New project" entry point.

### 2.5 Effort / deps / risks
- **Effort: M** (work-item templates M-small; project templates add M).
- **Dependencies:** should follow **Custom Fields Phase 1–2** so `template_data.property_values` is meaningful (degrade gracefully if absent).
- **Risks:** stale ID references in snapshots (mitigate: resolve-or-drop at apply time, never hard-fail); project-template instantiation partial failure (mitigate: `transaction.atomic`).
- **Silo-required?** No.

---

## 3. Recurring Work Items — **M**

No scaffolding (no stub, no model). Pure net-new, but celery-beat + `django_celery_beat` are ready (`celery.py:29,103`).

### 3.1 Behavior
- User attaches a **recurrence** to a template (or a work-item shape): cadence = daily / weekly (weekday set) / monthly / **cron**, plus start date, optional end date/occurrence cap, and target project.
- On each due tick the system auto-creates a fresh work item from the shape and records the run.

### 3.2 Data model (net-new)
```python
# apps/api/plane/db/models/recurring.py (NEW)
class RecurringIssue(ProjectBaseModel):
    name          = models.CharField(max_length=255)
    template      = models.ForeignKey("db.Template", null=True, blank=True, on_delete=models.SET_NULL)
    issue_data    = models.JSONField(default=dict)     # inline shape if no template
    cadence       = models.CharField(max_length=30)    # daily|weekly|monthly|cron
    cron_expression = models.CharField(max_length=100, null=True, blank=True)
    interval      = models.PositiveIntegerField(default=1)   # every N units
    weekdays      = ArrayField(models.PositiveSmallIntegerField(), default=list, blank=True)
    start_date    = models.DateField()
    end_date      = models.DateField(null=True, blank=True)
    max_occurrences = models.PositiveIntegerField(null=True, blank=True)
    occurrence_count= models.PositiveIntegerField(default=0)
    next_run_at   = models.DateTimeField(db_index=True)
    last_run_at   = models.DateTimeField(null=True, blank=True)
    is_active     = models.BooleanField(default=True)
    class Meta:
        db_table = "recurring_issues"
        indexes = [models.Index(fields=["is_active", "next_run_at"])]

class RecurringIssueRun(ProjectBaseModel):   # audit of each auto-create
    recurring = models.ForeignKey("db.RecurringIssue", related_name="runs", on_delete=models.CASCADE)
    issue     = models.ForeignKey("db.Issue", null=True, on_delete=models.SET_NULL)
    run_at    = models.DateTimeField()
    status    = models.CharField(max_length=30, default="success")  # success|failed
    error     = models.TextField(blank=True)
    class Meta:
        db_table = "recurring_issue_runs"
```

### 3.3 Backend + scheduler
- **Dispatcher pattern (recommended):** one static beat entry in `celery.py:29` that runs every ~5 min and fans out due records — cleaner than per-record `PeriodicTask` and avoids beat DB churn:
  ```python
  # add to app.conf.beat_schedule in apps/api/plane/celery.py
  "dispatch-recurring-work-items": {
      "task": "plane.bgtasks.recurring_issue_task.dispatch_due_recurring_issues",
      "schedule": crontab(minute="*/5"),
  },
  ```
- New `apps/api/plane/bgtasks/recurring_issue_task.py`:
  - `dispatch_due_recurring_issues()` — `RecurringIssue.objects.filter(is_active=True, next_run_at__lte=now)`, dispatch `create_recurring_issue.delay(id)` per row.
  - `create_recurring_issue(recurring_id)` — build `Issue` from template/`issue_data` (reuse `Issue.save()` at `issue.py:180`), write property values, create `RecurringIssueRun`, compute + persist `next_run_at` (use `croniter` for cron; simple date math otherwise), increment `occurrence_count`, deactivate if past `end_date`/`max_occurrences`. Emit `IssueActivity` with `verb="created"`, `actor=None` (system).
- Internal API `app/views/recurring/` + `app/urls/recurring.py`: `GET/POST workspaces/<slug>/projects/<pid>/recurring-issues/`, `.../<id>/` PATCH/DELETE, `.../<id>/runs/` (history). Public v1 mirror optional.
- Idempotency: guard `create_recurring_issue` with the `next_run_at` check inside a `select_for_update()` so overlapping beat ticks can't double-create.

### 3.4 Frontend
- Net-new "Recurrence" section in issue-detail sidebar + a management list under project settings. No existing stub — add `ce/components/issues/recurring/` and a store. Reuse the Templates dropdown to pick the shape.

### 3.5 Effort / deps / risks
- **Effort: M.**
- **Dependencies:** best after **Templates** (reuse template shape) and **Custom Fields** (carry property values). Can ship with inline `issue_data` if Templates isn't ready.
- **Risks:** double-creation on overlapping ticks (mitigate: `select_for_update` + `next_run_at` advance in same txn); timezone correctness (store `next_run_at` UTC, compute cadence in the workspace/user tz); drift if `croniter` absent (add dep). DST edges for weekly/monthly.
- **Silo-required?** No. `django_celery_beat` + celery are already configured.

---

## 4. Time Tracking — **M**

Stubs present: `IssueWorklogProperty` (`worklog/property/root.tsx`), `IssueActivityWorklog` (`worklog/activity/root.tsx`), `IssueActivityWorklogCreateButton`. Backend net-new.

### 4.1 Behavior
- Users log time against a work item: **worklog entries** (duration, date, optional description). Manual entry **and** a start/stop **timer**.
- Issue detail shows total logged (+ per-user breakdown); worklog events appear in the activity feed; aggregation rolls up to project/cycle/module for reporting.

### 4.2 Data model (net-new)
```python
# apps/api/plane/db/models/worklog.py (NEW)
class IssueWorklog(ProjectBaseModel):
    issue       = models.ForeignKey("db.Issue", related_name="worklogs", on_delete=models.CASCADE)
    logged_by   = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="worklogs", on_delete=models.CASCADE)
    duration    = models.PositiveIntegerField()          # minutes (store canonical unit)
    description = models.TextField(blank=True)
    logged_at   = models.DateTimeField()                 # when the work happened
    class Meta:
        db_table = "issue_worklogs"
        indexes = [models.Index(fields=["issue"]), models.Index(fields=["logged_by", "logged_at"])]

class IssueTimer(ProjectBaseModel):     # active running timer (optional, for start/stop)
    issue      = models.ForeignKey("db.Issue", related_name="timers", on_delete=models.CASCADE)
    user       = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    started_at = models.DateTimeField()
    is_running = models.BooleanField(default=True)
    class Meta:
        db_table = "issue_timers"
        constraints = [models.UniqueConstraint(
            fields=["user","issue"], condition=Q(is_running=True, deleted_at__isnull=True),
            name="one_running_timer_per_user_issue")]
```
- Duration canonical unit = **minutes** (render as `2h 30m`). On timer stop, create an `IssueWorklog` = `now - started_at`, delete the `IssueTimer`.
- Optional `Project.is_time_tracking_enabled` boolean (add to `Project` model) as a per-project toggle.

### 4.3 Backend
Internal (`app/`) — new `app/views/issue/worklog.py` + routes in `app/urls/issue.py` (which already imports many issue endpoints):
- `GET/POST  workspaces/<slug>/projects/<pid>/issues/<issue_id>/worklogs/` and `.../<id>/` PATCH/DELETE.
- Timer: `POST .../issues/<issue_id>/timer/start/`, `POST .../timer/stop/`, `GET .../timer/` (current).
- Aggregation: `GET workspaces/<slug>/projects/<pid>/worklogs/summary/` (group by user / by issue; optional cycle/module filter).
- On worklog create/update/delete, emit an `IssueActivity` (`issue.py:407`) so the existing activity feed + the `IssueActivityWorklog` stub have data to render.
Public v1 (`api/`): `GET/POST /api/v1/workspaces/<slug>/projects/<pid>/issues/<id>/worklogs/` via `BaseAPIView`.
Celery: none needed; optional nightly rollup into a summary table if reporting gets heavy — defer.

### 4.4 Frontend
- Implement `IssueWorklogProperty` (`worklog/property/root.tsx`) — sidebar block: total logged, "Log time" action, timer start/stop. Consumed by `core/components/issues/issue-detail/sidebar.tsx`.
- Implement `IssueActivityWorklog` + `IssueActivityWorklogCreateButton` (`worklog/activity/*`) — worklog rows in the activity feed. Consumed by `core/.../issue-activity/root.tsx` + `activity-comment-root.tsx`.
- New `ce/store/issue/worklog/` store; report view under project settings/analytics.
- Optional list column via the `WorkItemLayoutAdditionalProperties` mechanism (§1.4).

### 4.5 Effort / deps / risks
- **Effort: M** (manual worklog S; timer + reporting add M).
- **Dependencies:** independent — no Custom Fields dependency. Can ship **first / in parallel** as the lowest-risk feature. The activity-feed integration reuses `IssueActivity` (already wired).
- **Risks:** unit ambiguity (fix by storing minutes canonically); running-timer integrity (unique partial constraint above); clock skew on timer stop (compute server-side from `started_at`); double-count if both manual + timer log the same window (UI guidance only).
- **Silo-required?** No.

---

## 5. Recommended build order (cross-feature)

1. **Time Tracking** (M, independent, stubs+activity wiring exist) — fastest win, validates the "replace CE stub + add store + author backend" loop end-to-end.
2. **Custom Fields Phase 1–2** (L+L) — the keystone; unblocks Templates/Recurring value capture.
3. **Templates** (M) — depends on Custom Fields P1–2.
4. **Recurring Work Items** (M) — depends on Templates (+ Custom Fields) but can start with inline `issue_data`.
5. **Custom Fields Phase 3–4** (M+M) — columns + filtering/public API; the perf-sensitive tail.

**Global risks:** (a) all four widen the issue serializer payload — coordinate one serializer-extension pass to avoid N+1 regressions; (b) all four should emit `IssueActivity` for feed consistency; (c) mirror EE table/field names to keep future upstream merges tractable; (d) none require the closed-source silo — **CE-only build is feasible for every feature**, because the paid split in this fork is purely the frontend `@/plane-web → ce/` alias plus absent backend endpoints, both of which we control.
