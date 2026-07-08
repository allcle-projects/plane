# 07 — Remaining Phase 2 Execution Plan (page split)

> **Purpose:** concrete, phase-split execution plan for the remaining Phase 2 paid features:
> **Custom Fields (XL, keystone)** → **Templates (M)** → **Recurring (M)**.
> Derived from `03-work-item-power.md` §1/§2/§3. Each row = one shippable `mote.N` release
> (build → deploy → verify → commit → ticket), mirroring the mote.7–9 cadence.
>
> **Status ledger (as of 2026-07-07):** wiki + page-comments (mote.7), 2FA (mote.8, PLANE-45),
> time-tracking (mote.9, PLANE-3) are **shipped**. This page covers what's left.
>
> **✅ COMPLETE (2026-07-08):** all 6 releases shipped, deployed, and verified —
> CF (mote.10–13, PLANE-47), Templates (mote.14, PLANE-4), Recurring (mote.15, PLANE-32).
> Post-ship deep verification (backend e2e + authenticated HTTP path + browser render)
> caught & fixed 3 real defects: **mote.16** (recurring FOR UPDATE on nullable FK),
> **mote.17** (template create 400 on required deleted_at), **mote.18** (template instantiate
> 500 on IssueCreateSerializer bare-instance response). Deployed backend = `v1.3.1-mote.18`.
> See [`08-implementation-status.md`](./08-implementation-status.md) for the full roadmap status.

## Dependency spine
Custom Fields **Phase 1–2 are a hard prerequisite** for Templates/Recurring carrying property
values (`03` §1.6, §2.5, §3.5). Templates degrade gracefully without CF; Recurring can start with
inline `issue_data`. Therefore the only correct order is **CF first**, then Templates, then Recurring.

## Sequence (one mote.N per phase)

| # | Release | Scope | Effort | New migration | Deploy touches |
|---|---------|-------|--------|---------------|----------------|
| 1 | **mote.10** | **CF Phase 1** — definitions + storage | L | issue_properties, issue_property_options, issue_property_values (3 tables) | backend + frontend |
| 2 | **mote.11** | **CF Phase 2** — values on detail + create modal | L | — (tables exist) | backend + frontend |
| 3 | **mote.12** | **CF Phase 3** — list/spreadsheet columns | M | — | frontend (mostly) + backend serializer |
| 4 | **mote.13** | **CF Phase 4** — filtering + saved views + public v1 | M | — | backend + frontend |
| 5 | **mote.14** | **Templates** — work-item + project templates | M | issue/project template tables | backend + frontend |
| 6 | **mote.15** | **Recurring** — recurring work items + celery-beat | M | recurring table | backend + frontend |

## Phase detail

### mote.10 — CF Phase 1 (definitions + storage, no value rendering)
- **Models** (`db/models/issue_property.py`, new): `IssueProperty` (definition, FK IssueType), `IssuePropertyOption` (SELECT options), `IssuePropertyValue` (typed-column EAV — one row per value). Register in `db/models/__init__.py`. Migration = 3 CreateModel, additive, no change to `issues`. Mirror EE table names.
- **Backend** (`app/`): **IssueType CRUD is also net-new** — `app/views/issue_type/` + `app/urls/issue_type.py`: `issue-types/` CRUD, `issue-types/<id>/properties/` CRUD, `properties/<id>/options/` CRUD. Serializers + per-type validation. NO value endpoints yet.
- **Frontend**: settings UI (new route under `app/(all)/[workspaceSlug]/settings/...`) to manage types → properties → options. Definition store mirroring `ce/store/estimates/estimate.ts`. NO sidebar/modal value rendering yet.
- **Ships:** the admin surface. Nothing user-facing on work items yet.

### mote.11 — CF Phase 2 (values, the core user value)
- Backend: `property-values/` bulk upsert endpoint (`{property_id: [values]}` diff → rows, emit IssueActivity), validation per type, thread `property_values` into issue detail/list serializer with `prefetch_related`.
- Frontend: implement `WorkItemAdditionalSidebarProperties` + `WorkItemModalAdditionalProperties` stubs; PropertyValueStore per issue; inline edit + validation; activity feed rows.

### mote.12 — CF Phase 3 (columns)
- `WorkItemLayoutAdditionalProperties` stub; per-type spreadsheet column components (pattern `spreadsheet/columns/state-column.tsx`); toggle via `ProjectUserProperty.display_properties.custom_properties`.

### mote.13 — CF Phase 4 (filtering + public API)
- Filter builder subqueries (`?property_<id>=` → EXISTS over `issue_property_values`, cap simultaneous filters), rich-filter UI (`ce/hooks/work-item-filters/`, `ce/components/rich-filters/`), saved-view integration, public v1 endpoints.

### mote.14 — Templates (`03` §2)
- Models `template.py`: work-item + project templates capturing `template_data` (incl. `property_values` now that CF exists). CRUD endpoints. Replace CE stubs `ce/components/issues/issue-modal/template-select.tsx`, `ce/components/projects/create/template-select.tsx`. Team-rule tie-in: `[QA]`/`[회고]` sub-task auto-generation.

### mote.15 — Recurring (`03` §3)
- Model `recurring.py` (schedule + issue_data/template ref); celery-beat job (django_celery_beat DatabaseScheduler already configured) to materialize issues on cadence. Frontend recurrence editor.

## Cross-cutting rules (all phases)
- **One serializer-extension pass** for CF values to avoid N+1 (design §5 global risk a). Always `prefetch_related("property_values", "property_values__property")`.
- **Soft-delete definitions** (`deleted_at`) — never hard-cascade; historical values survive.
- **Emit `IssueActivity`** for value changes (feed consistency).
- **Mirror EE table/field names** for upstream-merge tractability.
- Each release: security-sensitive? No (authZ via existing ProjectEntityPermission). Verify via mote.N build (tsc gate) + smoke (route registration + tables + regression), same as mote.7–9.
- Per-release ticket: create/close in the PLANE project; update the Phase 2 tracker (PLANE-39) and the XL tracker (PLANE-41) as CF phases land.

## Risk register
- **CF filtering perf (mote.13)** — top risk. Correlated subqueries on `issue_property_values` degrade list queries at scale. Composite indexes (§1.2), EXISTS over joins, cap filters, cache `display_properties`.
- **Migration volume** — CF P1 adds 3 tables; verify each migration is additive-only before deploy (0128–0130 precedent).
- **Scope creep across 6 releases** — keep each mote.N to its phase; do not fold Phase 3 columns into Phase 2.
