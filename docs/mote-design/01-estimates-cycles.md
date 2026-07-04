# Design Spec: Estimates (TIME), Cycle Start/Stop + Auto-schedule, Gantt Drag-to-Link

> Target repo: `plane-fork` (Plane CE v1.3.1, branch `mote`). Backend is unified under
> `apps/api/plane/` (`app/`=internal API, `api/`=public v1). **No `ee/` dir exists** — paid
> gating is frontend-only via `apps/web/ce/*` stubs behind the alias `@/plane-web/* → ./ce/*`.
> The backend enforces **no** license checks, so every backend change below is buildable in-place.
>
> This is a **design spec, not an implementation**. All claims cite `file:line` in the fork.
> Each section separates **ALREADY EXISTS** from **NET-NEW**.

---

## Cross-cutting finding (read first)

Plane's paid impls normally live in an external "silo" service, and the CE tree ships
**frontend stubs** that a silo build swaps out. Two of our three features already have a large
part of their *frontend* pre-wired in this exact stub pattern, and the backend enum/relation
plumbing is partly there too. The work is therefore mostly **filling stubs**, not greenfield:

| Feature | FE stub state | BE state |
|---|---|---|
| Estimates TIME | UI **fully built** in `core/`, gated by `is_ee`, TIME input imported from `@/plane-web` stub | enum **missing TIME** (blocker) |
| Cycle Start/Stop | none | status is **computed from dates**, no state column |
| Gantt drag-to-link | arrows render; drag stubs return `<></>` | relation-create endpoint **already exists** |

None of the three **requires** the silo. All can be delivered by (a) editing the `ce/` stubs in
place, and (b) small unified-backend additions. Silo is only relevant if we later want their
closed-source visual polish; we replace stubs directly instead.

---

## 1. Estimates — TIME type

### 1.1 Behavior
A project admin can create an estimate system of type **Time** (in addition to Points and
Categories). Estimate points are entered as **hours + minutes** and rendered as `2h 30m`.
Issues get a time estimate; cycle/module progress and burndown aggregate **total / completed
minutes** the same way they already aggregate Points.

### 1.2 What ALREADY exists (frontend is done)
The entire TIME **frontend** is already present and merely gated off:
- `packages/constants/src/estimates.ts:12-16` — `EEstimateSystem` enum already includes `TIME = "time"`.
- `packages/constants/src/estimates.ts:122-142` — `ESTIMATE_SYSTEMS.time` template ("Hours" 1–6) with **`is_ee: true`** (this flag hides it in the create UI: `apps/web/core/components/estimates/create/stage-one.tsx:76` renders a system only when `is_available && !is_ee`).
- `packages/types/src/estimate.ts:23` + `packages/types/src/enums.ts:42` — `TEstimateSystemKeys` already unions `EEstimateSystem.TIME`.
- Input routing: `apps/web/core/components/estimates/inputs/root.tsx:35-41` — for `TIME` renders `<EstimateTimeInput>` **imported from the `@/plane-web` (ce) stub** (`root.tsx:11`), value parsed as `parseInt(value)` (i.e. **integer minutes**).
- Rendering: `apps/web/core/components/estimates/points/preview.tsx:71` uses `convertMinutesToHoursMinutesString(Number(value))`; dropdown `apps/web/core/components/dropdowns/estimate.tsx:115,202`, readonly `apps/web/core/components/readonly/estimate.tsx:39`, power-k menu, and create/update point editors (`points/create.tsx:97,156`, `points/update.tsx:102,163`) all branch on `EEstimateSystem.TIME`.
- Utils exist: `packages/utils/src/datetime.ts:346` `convertHoursMinutesToMinutes(h,m)=h*60+m` and `datetime.ts:367` `convertMinutesToHoursMinutesString(totalMinutes)`.

**Storage semantics (confirmed by the above):** a TIME estimate reuses the existing
`EstimatePoint.value` `CharField` (`apps/api/plane/db/models/estimate.py:47`) — the string holds
an **integer number of minutes** (e.g. `"150"` = 2h30m). **No new column and no float** — this
matches the FE `parseInt`/`convertMinutesToHoursMinutesString` contract. Aggregation can reuse
the existing `Cast("estimate_point__value", FloatField())` sums used for Points.

### 1.3 What is NET-NEW (backend only)

**Data model.** Add TIME to the backend enum. Today `apps/api/plane/db/models/estimate.py:13-15`:
```python
class EstimateType(models.TextChoices):
    CATEGORIES = "categories", "Categories"
    POINTS = "points", "Points"        # ← no TIME
```
Change to add `TIME = "time", "Time"`. `EstimatePoint.value` is unchanged (already `CharField`,
holds minutes). No new fields.

**Migration sketch** (next number is `0123`, after `0122_alter_project_network.py`; note migration
`0121_alter_estimate_type.py:16` currently hardcodes only the two choices — mirror it):
```python
# 0123_estimate_time_type.py
operations = [
    migrations.AlterField(
        model_name="estimate",
        name="type",
        field=models.CharField(
            choices=[("categories","Categories"),("points","Points"),("time","Time")],
            default="categories", max_length=255),
    ),
]
```
`choices` is not DB-enforced in Postgres, but keep it in sync so `EstimateSerializer` validation
and admin accept `"time"`. No data backfill.

**Backend endpoints — mostly enum/validation, not new routes.**
- `app/` create/update already pass `type` straight through: `BulkEstimatePointEndpoint.create` reads `estimate.get("type","categories")` (`apps/api/plane/app/views/estimate/base.py:67,74`) and `partial_update` sets `estimate.type` from the payload (`base.py:120`). Once the enum accepts `"time"`, **no view change** is needed to create TIME estimates.
- **Aggregation is the real change.** Progress/analytics are **hardcoded to `"points"`** and must also honor `"time"`:
  - Cycle progress: `apps/api/plane/app/views/cycle/base.py:666-667` filters `estimate_point__estimate__type="points"`. Change to `estimate__type__in=["points","time"]` (per-project only one estimate is active, so the union is safe).
  - Cycle analytics gate: `cycle/base.py:832-843` builds point distributions only when a `type="points"` estimate exists and `analytic_type=="points"`. Extend the `.exists()` filter to `type__in=["points","time"]`.
  - Module progress sums: `apps/api/plane/app/views/module/base.py:153-208` and module analytics `base.py:468-471` use `Sum(Cast("estimate_point__value", FloatField()))` **without** a type filter, so they already work for TIME once points exist; verify no `type="points"` gate elsewhere in module views.
- **Public v1 API:** `apps/api/plane/api/views/estimate.py` + `api/urls/estimate.py` — the v1 estimate serializer exposes `type`; adding the enum value is sufficient. No new path. (Confirm the v1 `EstimateSerializer` doesn't re-restrict choices.)
- **Response contract:** progress endpoint already returns `*_estimate_points` keys (`cycle/base.py:767-774`); for TIME these become **minutes**. The FE formats via `convertMinutesToHoursMinutesString`, so no key rename — but document that "points" fields carry minutes when the active system is TIME.

**Frontend.** The only net-new FE work is **flipping the gate and filling one stub**:
1. `packages/constants/src/estimates.ts:140` — set `time.is_ee: false` so the system appears in `stage-one.tsx:76`. (Alternatively leave `is_ee` and add a mote feature flag; simplest is `false`.)
2. Replace the `@/plane-web` stub `EstimateTimeInput` (imported at `inputs/root.tsx:11`, path `apps/web/ce/components/estimates/inputs/*`) with a real hours+minutes control that emits **minutes** as a string via `convertHoursMinutesToMinutes`. (Locate the exact ce file: `apps/web/ce/components/estimates/inputs/`.)
3. No store changes — estimate store already carries `type` and `value`.

### 1.4 Effort / deps / risk / silo
- **Effort: S** (backend enum + ~3 aggregation filters + 1 ce input component + flip one flag).
- **Ordering:** enum migration → aggregation filters → flip `is_ee` / fill `EstimateTimeInput`. No dependency on features 2–3.
- **Risks:** (a) other `type="points"` gates elsewhere (grep `type="points"` and `type=="points"` across `app/` and `web/` before shipping); (b) burndown `burndown_plot(..., plot_type="points")` (`cycle/base.py:932`) assumes points — pass through minutes but confirm it doesn't re-filter by type; (c) mixing a project that switches Points→Time leaves old `value` strings that are still valid integers, so no migration of issue data, but the *unit* label changes.
- **Silo-required? No.** Pure enum + stub-fill. No webhook/task-bot needed.

---

## 2. Cycle manual Start/Stop + Auto-schedule

### 2.1 Behavior
Give cycles an explicit lifecycle a user drives with buttons (**Start**, **Complete/Stop**),
**independent of pure date math**, plus **auto-schedule**: when a current cycle completes, the
next queued (draft) cycle auto-activates. This lets a team run a cycle that starts late or runs
long without the status silently flipping on the calendar boundary.

### 2.2 What ALREADY exists
- `Cycle` model (`apps/api/plane/db/models/cycle.py:60-101`) has `start_date`, `end_date`
  (nullable DateTimeFields, `:63-64`), `progress_snapshot` JSON (`:74`), `version` int (`:80`),
  `sort_order` (`:71`) — **but no status column.**
- **Status is computed, not stored.** `CycleViewSet.get_queryset` annotates `status` with a
  `Case/When` over dates (`apps/api/plane/app/views/cycle/base.py:152-167`): `CURRENT` when
  `start<=now<=end`, `UPCOMING` when `start>now`, `COMPLETED` when `end<now`, else `DRAFT`. Every
  `.values(...)` block re-selects this annotated `status` (e.g. `:229, :262, :304, :385, :452`).
- Date-completion is **already enforced as a hard stop** on edits: `partial_update` refuses to
  edit a cycle whose `end_date < now` except `sort_order` (`cycle/base.py:349-357`).
- Overlap guard exists: `CycleDateCheckEndpoint` (`cycle/base.py:520-556`) rejects date ranges
  that intersect another cycle — relevant to auto-schedule queueing.
- **Precedent to copy:** `Module` already has a real stored status enum
  (`apps/api/plane/db/models/module.py:58-64` `ModuleStatus`; field `module.py:74-85`
  `default="planned"`). We mirror this on Cycle.

### 2.3 What is NET-NEW

**Data model** (`db/models/cycle.py`). Add an explicit state machine alongside the existing
date fields (dates stay for planning/overlap; state governs lifecycle):
```python
# cycle.py — new, mirroring ModuleStatus (module.py:58)
class CycleState(models.TextChoices):
    DRAFT = "draft", "Draft"
    UPCOMING = "upcoming", "Upcoming"
    CURRENT = "current", "Current"
    COMPLETED = "completed", "Completed"

# new fields on Cycle (after version, cycle.py:80)
state         = models.CharField(max_length=20, choices=CycleState.choices, default=CycleState.DRAFT)
started_at    = models.DateTimeField(null=True, blank=True)   # actual start (button press)
completed_at  = models.DateTimeField(null=True, blank=True)   # actual stop
auto_schedule = models.BooleanField(default=False)            # queue-next behavior
```
**Migration `0123`/`0124`:** `AddField` × 4. Data backfill in the same migration: set `state`
from the current date logic so existing cycles keep their computed status —
`RunPython` mapping (`start<=now<=end`→`current`, `end<now`→`completed`, `start>now`→`upcoming`,
else `draft`). Also seed `started_at=start_date`, `completed_at=end_date` for completed ones.

**Interaction with the existing date-based `Case/When`.** Do **not** delete the annotation;
make `state` authoritative and fall back to dates only when `state == draft`. In
`get_queryset` (`cycle/base.py:152-167`) wrap it:
```python
status=Case(
    When(state="current",   then=Value("CURRENT")),
    When(state="completed", then=Value("COMPLETED")),
    When(state="upcoming",  then=Value("UPCOMING")),
    # legacy date fallback only for draft/unmanaged cycles:
    When(Q(state="draft") & Q(start_date__lte=now) & Q(end_date__gte=now), then=Value("CURRENT")),
    ...,
    default=Value("DRAFT"), output_field=CharField())
```
This preserves the wire contract (FE still reads `status` ∈ CURRENT/UPCOMING/COMPLETED/DRAFT;
add `state` to the `.values(...)` lists so the FE can show manual controls). The hard-edit-lock
at `cycle/base.py:349-357` should key off `state == "completed"` instead of `end_date < now`,
so a manually-still-running cycle past its end date remains editable.

**Backend endpoints — NET-NEW internal actions** (`app/`), added to `app/urls/cycle.py`
(existing routes register `CycleProgressEndpoint`/`CycleAnalyticsEndpoint` at
`urls/cycle.py:96-104`, so follow that pattern):
- `POST .../cycles/<cycle_id>/start/` → `CycleStartEndpoint`: guard `state in {draft,upcoming}`;
  set `state=current`, `started_at=now`; if another cycle is already `current` in the project,
  reject (or 409) unless caller passes `force`. Emits `model_activity` like `create` does
  (`cycle/base.py:318`).
- `POST .../cycles/<cycle_id>/complete/` → `CycleCompleteEndpoint`: guard `state=current`; set
  `state=completed`, `completed_at=now`; snapshot progress into `progress_snapshot` (reuse the
  transfer/snapshot path — `transfer_cycle_issues`, `cycle/base.py:606`); then run **auto-schedule**.
- `PATCH .../cycles/<cycle_id>/` — extend existing `partial_update` (`cycle/base.py:336`) to
  accept `auto_schedule`.
- **Auto-schedule logic** (server-side, invoked on complete): pick the next cycle in the same
  project with `state=upcoming` ordered by `start_date`/`sort_order`, flip it to `current`,
  set `started_at=now`. Guard against overlap using the existing `CycleDateCheckEndpoint` query
  (`cycle/base.py:539-547`). This is a **synchronous** action; no queue infra needed.
- **Optional date-boundary automation** (only if we want cycles to auto-complete on `end_date`
  without a button): a periodic **task-bot / Celery beat** job scanning
  `state=current, end_date<now, auto_schedule=True` and calling the complete path. See §2.5.

**Public v1 API** (`api/views/cycle.py`, `api/urls/cycle.py`): expose `state`, `auto_schedule`,
`started_at`, `completed_at` read-only on the v1 cycle serializer; optionally add
`POST /api/v1/.../cycles/<id>/start|complete/` mirrors for external automation (X-API-Key). Low
priority — internal actions cover the UI.

**Frontend.** No `ce/` stub exists for cycles (this is a mote-original feature, not a Plane paid
one), so build in `core/`:
- Cycle store: add `startCycle`, `completeCycle`, `toggleAutoSchedule` actions calling the new
  endpoints; read `state`/`auto_schedule` from the list/detail payloads.
- Cycle header/detail components under `apps/web/core/components/cycles/` — add **Start** /
  **Complete** buttons shown by `state` (Start when draft|upcoming, Complete when current), and
  an "Auto-schedule next" toggle in cycle settings.
- Status pills already map from `status`; extend the mapping to trust `state`.

### 2.4 Effort / deps / risk / silo
- **Effort: M** (4 fields + backfill migration, 2 new endpoints + auto-schedule, `Case/When`
  rewrite, store + a few components). **L** if we also add the periodic auto-complete job and v1 mirrors.
- **Ordering:** model+migration (with backfill) → rewrite `status` annotation to be state-first →
  start/complete endpoints → auto-schedule → FE buttons. Independent of features 1 and 3.
- **Risks:** (a) **every** `.values(...)` block that selects `status` must also select `state`, or
  the FE can't distinguish manual vs computed — audit all `.values` in `cycle/base.py`
  (`:207, :239, :281, :362, :428`); (b) the edit-lock semantics change (date→state) can surprise
  users whose cycles are past end date but still `current`; (c) overlap rule interplay — a
  manually-extended `current` cycle may now overlap the next `upcoming` one, so auto-schedule must
  handle "next is already overlapping" gracefully; (d) `progress_snapshot` is also written by
  `transfer_cycle_issues` — ensure complete doesn't double-snapshot.
- **Silo-required? No.** Fully in unified backend. The only *optional* external piece is a
  **task-bot/Celery-beat** cron for automatic (non-button) completion; a webhook on cycle-complete
  could also drive external notifications but isn't required for the feature.

---

## 3. Gantt drag-to-create dependency

### 3.1 Behavior
On the timeline (Gantt) view, the user grabs a handle on the **right edge** of a block
(predecessor) and drags to another block; on drop a **blocking** relation is created
(predecessor → successor), and the elbow arrow (already rendered) appears. A **left-edge** handle
lets a block declare it is blocked-by the source. During the drag a **live preview path** follows
the cursor, and valid drop targets highlight.

### 3.2 What ALREADY exists
- **Arrow rendering is DONE.** `apps/web/ce/components/gantt-chart/dependency/dependency-paths.tsx`
  (`:43-113`) computes elbow (Manhattan) SVG paths between a predecessor's right edge and each
  successor's left edge, using `getRelationByIssueIdRelationType(predecessorId, "blocking")`
  (`:62`) and block positions from `useTimeLineChartStore` (`:46`). Arrowhead marker defined
  (`:88-99`). This is the finished visualization.
- **Backend relation-create endpoint EXISTS** — no backend work needed:
  - `POST workspaces/<slug>/projects/<pid>/issues/<issue_id>/issue-relation/` →
    `IssueRelationViewSet.create` (`apps/api/plane/app/urls/issue.py:236-238`;
    `apps/api/plane/app/views/issue/relation.py:209-260`). It accepts
    `{ relation_type, issues: [...] }` and, for `relation_type="blocking"`, stores it with the
    correct directionality (`relation.py:223-227`: for `blocking` it swaps issue/related_issue and
    maps via `get_actual_relation`).
  - `POST .../issues/<issue_id>/remove-relation/` → `remove_relation` (`urls/issue.py:241-242`,
    `relation.py:262`) for delete.
  - Enum backs it: `IssueRelationChoices` + `_RELATION_PAIRS` include
    `("blocked_by","blocking")`, `("start_before","start_after")`, `("finish_before","finish_after")`
    (`apps/api/plane/db/models/issue.py:264-285`).
- **Wiring points are already in place**, they just call stubs:
  - `apps/web/core/components/gantt-chart/helpers/draggable.tsx:15,48-49,72-73` renders
    `<LeftDependencyDraggable>` / `<RightDependencyDraggable>` (from `@/plane-web`) whenever
    `enableDependency` is truthy.
  - `apps/web/core/components/gantt-chart/chart/main-content.tsx:222-223` renders
    `<TimelineDependencyPaths>` **and** `<TimelineDraggablePath>` side by side.
  - `apps/web/core/components/gantt-chart/blocks/block.tsx:48,54` reads
    `getIsCurrentDependencyDragging(blockId)` to style the block during a drag.

### 3.3 What is NET-NEW — three FE stubs + store state (backend already done)
The stubs that currently render nothing:
- `apps/web/ce/components/gantt-chart/dependency/draggable-dependency-path.tsx:7-9` —
  `TimelineDraggablePath()` returns `<></>` (this is the **live preview path**).
- `apps/web/ce/components/gantt-chart/dependency/blockDraggables/left-draggable.tsx:15` and
  `right-draggable.tsx:14` — `Left/RightDependencyDraggable(_props)` return `<></>` (the **grab handles**).
- Store dummy: `apps/web/ce/store/timeline/base-timeline.store.ts:346`
  `getIsCurrentDependencyDragging = computedFn((_blockId) => false)` and `isDependencyEnabled = false`
  (`:86`; interface at `:47,52`).

**Store changes** (`ce/store/timeline/base-timeline.store.ts`, and the interface it implements):
Add observable drag state and turn the dummy computed into real logic:
```ts
// new observables
dependencyDrag: {
  sourceBlockId: string;
  sourceSide: "left" | "right";      // right = predecessor(blocking), left = blocked-by
  pointer: { x: number; y: number }; // live cursor in chart coords
  hoverTargetId: string | null;      // hit-tested drop target
} | null = null;

// actions
startDependencyDrag(sourceBlockId, side) { ... }
updateDependencyDrag(pointer, hoverTargetId) { ... }   // throttled on mousemove
endDependencyDrag() { this.dependencyDrag = null; }     // cancel/cleanup

// replace the dummy (base-timeline.store.ts:346)
getIsCurrentDependencyDragging = computedFn((blockId) =>
  this.dependencyDrag?.sourceBlockId === blockId || this.dependencyDrag?.hoverTargetId === blockId);
```
Also flip `isDependencyEnabled` (`:86`) to `true` for the issues/modules timeline stores
(`core/store/timeline/issues-timeline.store.ts:14`, `modules-timeline.store.ts:14`) — or gate it
behind a mote flag if we want to stage rollout.

**Interaction design (fill the three stubs):**
1. **Grab handles** (`left-draggable.tsx`/`right-draggable.tsx`): render a small hit-area at the
   block's left/right edge (they already receive `block` + `ganttContainerRef`). `onPointerDown` →
   `startDependencyDrag(block.id, side)` and `setPointerCapture`. Compute the anchor from
   `block.position.marginLeft (+ width for right)` exactly as `dependency-paths.tsx:65,74` does, so
   the preview lines up with final arrows.
2. **Pointer tracking**: attach `pointermove` on `ganttContainerRef` while dragging; translate
   client coords → chart coords using the same origin the store already exposes
   (`getPositionFromDateOnGantt` / block positions). Call `updateDependencyDrag(pointer, hover)`.
3. **Live preview path** (`draggable-dependency-path.tsx`): when `dependencyDrag != null`, draw
   an SVG elbow from the source anchor to the current pointer, **reusing the same `getDependencyPath`
   elbow builder** in `dependency-paths.tsx:26-41` (extract it to a shared helper so preview and
   final arrows match). Render dashed while dragging.
4. **Drop hit-testing**: on `pointermove`, find the block under the cursor via
   `blockIds`+`getBlockById` bounding boxes (row index = `y / BLOCK_HEIGHT`, `constants.ts`
   `BLOCK_HEIGHT`; x within `[marginLeft, marginLeft+width]`). Set `hoverTargetId`; block.tsx:54
   already consumes `getIsCurrentDependencyDragging` to highlight it. Reject self-drops and
   existing relations.
5. **Relation-create-on-drop**: on `pointerup` over a valid target, call the **existing** endpoint
   via the issue-detail relation store: `relation.create` with
   `relation_type="blocking", issues:[targetId]` for a right(predecessor) drag, or `"blocked_by"`
   for a left drag → `POST .../issues/<sourceId>/issue-relation/` (`urls/issue.py:236`). The store's
   `getRelationByIssueIdRelationType(...,"blocking")` that `dependency-paths.tsx:62` reads updates,
   so the permanent arrow renders immediately. Then `endDependencyDrag()`.

**Routes / components touched:** no new routes. Files to replace: the 3 `ce/` stubs above; edit
`ce/store/timeline/base-timeline.store.ts` (+ its interface `:39-72`); flip `isDependencyEnabled`
in the two `core/store/timeline/*.ts`. Everything under `core/gantt-chart/*` already calls these.

### 3.4 Effort / deps / risk / silo
- **Effort: M** — no backend, no new model; but pointer math, coordinate translation, hit-testing,
  and cleanup on cancel/scroll are fiddly. The elbow math and the create/remove API are free.
- **Ordering:** store drag-state + real `getIsCurrentDependencyDragging` → grab handles
  (pointerdown) → pointer tracking + preview path → hit-testing → create-on-drop. Independent of
  features 1–2. Depends only on the already-done `dependency-paths.tsx`.
- **Risks:** (a) coordinate translation must match `dependency-paths.tsx` anchors exactly or preview
  and final arrow visibly jump; (b) horizontal scroll/resize during drag invalidates cached
  positions — recompute from store, don't cache screen coords; (c) prevent cycles / duplicate
  relations client-side (the endpoint uses `ignore_conflicts=True`, `relation.py:236`, so dupes are
  silently dropped — but we should still block obviously invalid drops for UX); (d) `pointer-events`
  layering — `dependency-paths.tsx:87` svg is `pointer-events-none`; the draggable handles and the
  live-preview layer must sit above blocks but not eat block clicks except on the handle hit-areas;
  (e) touch support (pointer events cover it, but test).
- **Silo-required? No.** The Plane paid build ships these same three components filled in; we fill
  them in `ce/` directly. The **backend is already complete** in the unified API. No webhook/task-bot
  needed — relation creation is a synchronous REST call.

---

## Summary of buildability

| # | Feature | Net-new surface | Effort | Silo? |
|---|---------|-----------------|--------|-------|
| 1 | Estimates TIME | BE enum + 3 aggregation filters; flip `is_ee`; fill 1 ce input (FE UI already built) | **S** | No |
| 2 | Cycle Start/Stop + Auto-schedule | 4 model fields + backfill migration; 2 endpoints + auto-schedule; state-first `Case/When`; FE buttons | **M**(–L) | No (optional cron) |
| 3 | Gantt drag-to-link | 3 ce FE stubs + store drag-state (BE relation API already exists) | **M** | No |

All three land inside `apps/api/plane/` and `apps/web/{ce,core}` with **no `ee/` and no license
gate**. Recommended order to ship independently: **1 → 3 → 2** (1 is smallest and unblocks time
tracking; 3 is pure FE with a ready backend; 2 is the largest, touching the cycle status contract).
