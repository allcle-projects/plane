# 06 — Integrations, Importers, Automations & Enhanced Search

**Scope:** Design spec (not implementation) for the four "paid Plane" feature families we intend to self-host on our Plane CE v1.3.1 fork (`/home/otro/git/plane-fork`, branch `mote`).

**Repo ground truth (verified this pass):**
- Backend is **unified** under `apps/api/plane/`. Internal API = `app/` (session/cookie auth), public v1 API = `api/` (`X-API-Key`, see `apps/api/plane/api/rate_limit.py`, `apps/api/plane/api/middleware/`). Models = `db/models/`, Celery = `bgtasks/`, licensing/instance config = `license/`.
- **There is NO `ee/` directory.** Paid gating is FRONTEND-only — the frontend swaps `@/plane-web/...` for `@/ce/...` stubs (e.g. `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/automations/page.tsx:22` imports `CustomAutomationsRoot` from `@/plane-web/components/automations/root`, whose CE stub is `apps/web/ce/components/automations/root.tsx`).
- **Outbound webhooks are fully functional** with HMAC-SHA256 signing: `apps/api/plane/app/views/webhook/base.py` (CRUD), `apps/api/plane/db/models/webhook.py` (`Webhook`, `WebhookLog`, `generate_token`), `apps/api/plane/bgtasks/webhook_task.py` (`webhook_send_task` line 261, HMAC at lines 315-322, retry/backoff at lines 254-259, auto-deactivation at line 368). Fan-out entry points: `webhook_activity` (line 386) and `model_activity` (line 471).
- **Integration models exist but are ORPHANS** — zero views, zero urls, zero serializers. `apps/api/plane/db/models/integration/base.py` (`Integration` line 16, `WorkspaceIntegration` line 41), `.../integration/github.py` (`GithubRepository`, `GithubRepositorySync`, `GithubIssueSync`, `GithubCommentSync`), `.../integration/slack.py` (`SlackProjectSync`). Exported from `db/models/integration/__init__.py` only.
- The **frontend integrations page already exists and calls a non-existent backend**: `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/(workspace)/integrations/page.tsx:34` fetches `integrationService.getAppIntegrationsList()` (fetch key `APP_INTEGRATIONS`). Upstream Plane serves this from the external **silo** service; in our fork the endpoint returns 404. This is the seam where real integration logic used to live.
- **Importer model is generic and Jira/GitHub-only in its `service` choices:** `apps/api/plane/db/models/importer.py:14` — `service = CharField(choices=(("github","GitHub"),("jira","Jira")))`. No Confluence/Notion/CSV parsers, no importer views/urls. Status machine (`queued/processing/completed/failed`) at line 15-24 is reusable as-is.
- **Automation today = two cron sweeps only:** `apps/api/plane/bgtasks/issue_automation_task.py` (`archive_and_close_old_issues`, driven by `Project.archive_in`/`Project.close_in`), scheduled in `apps/api/plane/celery.py:44-46` (`crontab(hour=1, minute=0)`). No rule engine. The event hook point is `issue_activity` (`apps/api/plane/bgtasks/issue_activities_task.py:1504`) with its `ACTIVITY_MAPPER` (line 1540) — every issue mutation flows through here.
- **Search is `icontains`-only:** `apps/api/plane/app/views/search/base.py` — `GlobalSearchEndpoint` (line 46) filters issues/projects/cycles/modules/views/pages/intakes via `Q(field__icontains=...)`; `SearchEndpoint` (line 305) does mention/entity lookup. No full-text index, no trigram, no vectors.
- **Instance config for secrets already exists:** `apps/api/plane/license/models/instance.py:72` `InstanceConfiguration(key unique, value TextField, category, is_encrypted)` — the god-mode admin (`apps/admin/`) reads/writes these. This is where OAuth client secrets belong.

**The silo, in one sentence:** upstream Plane's real integrations (GitHub App, GitLab, Slack, Sentry, Intercom, importers) run in a **separate closed "silo" microservice** that holds the OAuth apps, does bidirectional event sync, and calls back into Plane's API. It is **absent from this repo** — we have only the DB tables it would have written to. Every design below states explicitly whether it needs a silo-equivalent or can be done with webhooks + our task-bot.

---

## Feature 1 — Integrations (GitHub / GitLab / Slack / Sentry / Draw.io)

### 1.0 Silo assessment (do this first)

What the silo does upstream, and its status here:

| Silo capability | Evidence it's absent in our fork | Can webhooks+task-bot replace it? |
|---|---|---|
| Hosts OAuth apps, runs 3-legged OAuth callback, stores tokens | No OAuth views anywhere; `WorkspaceIntegration.api_token` FK + `metadata`/`config` JSON exist (`integration/base.py:46-49`) but nothing writes them | Partly — task-bot can hold a single org-level PAT instead of per-user OAuth |
| Receives **inbound** provider webhooks (GitHub push, Slack events) and mutates Plane | No inbound receiver endpoint; `Integration.webhook_url`/`webhook_secret` (`base.py:23-24`) are unused columns | Yes — task-bot terminates provider webhooks and calls Plane's **public v1 API** |
| Bidirectional sync bookkeeping | Tables exist (`GithubIssueSync`, `GithubCommentSync`, `SlackProjectSync`) but no code populates them | task-bot keeps its own mapping table; Plane tables optional |
| Serves `getAppIntegrationsList()` catalog | Frontend calls it (`integrations/page.tsx:34`); backend has no route → 404 | Yes — a trivial static/DB catalog endpoint (see 1.3) |

**Conclusion:** the silo is confirmed absent (only its data tables survive). We do **not** need to resurrect it for our use case. Two options follow.

### 1.1 Behavior (user-facing)

- **Slack:** when an issue is created/updated/completed in a watched project, a formatted message posts to the mapped Slack channel. Optionally: a Slack slash-command / message action creates a Plane issue.
- **GitHub:** mention `PLANE-123` (or `<project-identifier>-<seq>`) in a PR/commit/issue body → Plane issue gets a linked-reference comment + optional state transition (e.g. PR merged → Done). Optionally the reverse (Plane issue → GitHub issue) for public repos.
- **GitLab:** same as GitHub via GitLab webhooks.
- **Sentry:** new Sentry issue (or alert) → create/append a Plane issue in a triage project with the Sentry permalink and culprit.
- **Draw.io:** embed/attach a diagram in an issue/page; edits round-trip. This is **not** an OAuth integration — it is a client-side editor + asset storage, so it lives entirely in the frontend + existing asset upload (`apps/api/plane/app/views/asset/`). No silo, no backend integration model.

### 1.2 Two options per integration

#### Option A — Native silo-style OAuth integration (heavy)

Build in-repo what the silo did: register OAuth views + urls for each orphan model, run the OAuth dance, persist `WorkspaceIntegration` + provider sync rows, stand up an **inbound webhook receiver** that verifies provider signatures and mutates issues.

- **New views (net-new):** `apps/api/plane/app/views/integration/{base,github,slack,gitlab,sentry}.py` + `apps/api/plane/app/urls/integration.py`, wired in `app/urls/__init__.py`.
- **Reuses orphan models** `Integration`, `WorkspaceIntegration` (`integration/base.py:16,41`), `GithubRepositorySync`/`GithubIssueSync` (`integration/github.py`), `SlackProjectSync` (`integration/slack.py`). GitLab/Sentry need **new** models mirroring the GitHub trio.
- **Inbound receiver (net-new, security-critical):** a public unauthenticated endpoint (outside the `X-API-Key` middleware) that verifies `X-Hub-Signature-256` (GitHub), Slack signing secret, GitLab token, Sentry signature — before touching the DB. This is the single biggest risk and the reason the silo was isolated.
- **OAuth secrets:** stored as `InstanceConfiguration` rows (`license/models/instance.py:72`), `is_encrypted=True`, managed in god-mode admin (`apps/admin/`).
- **Effort: XL** per provider (OAuth + inbound receiver + sync reconciliation + token refresh). **Silo-required?** effectively yes — you are rebuilding the silo inside the monolith. **Not recommended** for our team size.

#### Option B — Lightweight: outbound webhooks + task-bot bridge (RECOMMENDED)

Use the **already-working** outbound webhook system for Plane→world, and our **task-bot (server3)** as the world→Plane bridge via the **public v1 API**. No OAuth, no inbound receiver in the monolith, no silo.

Data flow:

```
Plane issue mutation
  └─ issue_activity (issue_activities_task.py:1504)
       └─ model_activity / webhook_activity (webhook_task.py:471 / 386)
            └─ webhook_send_task  ──HMAC-signed POST──▶  task-bot (server3)
                                                            ├─▶ Slack chat.postMessage (bot token)
                                                            └─▶ GitHub/GitLab API (org PAT)

GitHub/GitLab/Sentry/Slack event
  └─ provider webhook ──▶ task-bot (verifies provider sig)
       └─ Plane public v1 API (X-API-Key)
            POST /api/v1/workspaces/{slug}/projects/{id}/issues/  (create)
            POST /api/v1/.../issues/{id}/comments/                (link back)
            PATCH /api/v1/.../issues/{id}/  (state → Done)
```

- task-bot already runs on server3, already posts to Slack (per project memory: `task-bot .env SLACK_BOT_TOKEN`, `chat.postMessage`), and already ingests webhooks. It becomes the integration hub.
- **HMAC verification on the receiving side:** task-bot validates `X-Plane-Signature` using the webhook `secret_key` (produced at `webhook_task.py:315-322`).

### 1.3 Concrete design — Option B, Slack + GitHub

**Slack notifications (Plane → Slack), zero backend code change:**
1. Admin creates an outbound webhook (existing UI `settings/(workspace)/webhooks`, backed by `WebhookEndpoint` `webhook/base.py:20`) pointing at `https://task-bot.internal/plane/slack`, `issue=true`, `issue_comment=true`.
2. task-bot receives the signed payload (`{event, action, data, activity}` shape from `webhook_task.py:305-312`), verifies HMAC, maps `data.project` → Slack channel (task-bot config or optional `SlackProjectSync.webhook_url`), renders a message, calls `chat.postMessage`.
3. **Channel mapping** lives in task-bot config initially. If we want it managed in Plane, the lightest option is to **reuse `SlackProjectSync`** (`integration/slack.py:14`) purely as a mapping table (`project` ↔ `webhook_url`/`team_id`) via one small internal CRUD view — no OAuth, admin pastes an incoming-webhook URL. That is **S** effort and the only backend addition needed for Slack.

**GitHub PR/issue linking (GitHub → Plane), no monolith change:**
1. Configure a GitHub webhook (repo or org) → `https://task-bot.internal/github`.
2. task-bot verifies `X-Hub-Signature-256`, scans PR/commit/issue text for `\b([A-Z][A-Z0-9]+)-(\d+)\b` (Plane identifier pattern), resolves each to a workspace/project, then calls the **public v1 API** with `X-API-Key`:
   - `POST /api/v1/workspaces/{slug}/projects/{pid}/issues/{iid}/comments/` — "Referenced in PR #42 (link)".
   - on `pull_request.closed && merged` → `PATCH .../issues/{iid}/` set `state` to the project's Done state (task-bot looks up states via `GET .../states/`).
3. **Reverse (Plane → GitHub)** optional: outbound webhook `issue=true` → task-bot creates/updates a GitHub issue via org PAT; task-bot stores its own `plane_issue ↔ gh_issue` map (or we optionally populate `GithubIssueSync` for visibility).

**Effort (Option B):** Slack **S**, GitHub **S–M**, GitLab **S** (same shape), Sentry **S** (Sentry → task-bot → create issue). Draw.io **M** (frontend editor + asset round-trip, unrelated to task-bot).

### 1.4 Data model

- **Existing, reuse as-is:** `Integration` / `WorkspaceIntegration` (`integration/base.py:16,41`) as the catalog + per-workspace enablement record. `SlackProjectSync` (`integration/slack.py:14`) as channel map. `Webhook` (`webhook.py`) as the transport.
- **Net-new (only if Option A, or Option B reverse-sync bookkeeping):** `GitlabRepositorySync`, `GitlabIssueSync`, `SentryProjectSync` mirroring the GitHub trio in `integration/github.py`.
- **Migration sketch (Option B, minimal):** one migration adding nothing to tables — Option B needs **no schema change**. If we add the Slack mapping CRUD, we reuse the existing `slack_project_syncs` table (already migrated).
- **Catalog endpoint fix (net-new, S):** implement `GET /api/workspaces/{slug}/integrations/` returning `Integration.objects.all()` so the existing frontend page (`integrations/page.tsx:34`) stops 404-ing. Seed `Integration` rows (github/gitlab/slack/sentry) via a data migration.

### 1.5 Backend

- **Option B:** no new Celery tasks (reuses `webhook_send_task`). One small internal view for the integration catalog + optional Slack-map CRUD under `app/views/integration/` + `app/urls/integration.py`.
- **Public v1 API is the inbound contract** — already exists: issues (`api/views/issue.py`), comments, states (`api/urls/*`). task-bot authenticates with a workspace `X-API-Key`.
- **Option A only:** OAuth callback views, provider inbound receivers, token-refresh Celery beat jobs.

### 1.6 Frontend

- Integrations list page **already exists** (`integrations/page.tsx`) and renders `SingleIntegrationCard` per catalog item — it just needs the backend catalog endpoint (1.4). Each card's connect flow (Option B) opens a modal that: (a) creates the outbound webhook pointing at task-bot, (b) for Slack captures the channel/incoming-webhook URL.
- OAuth client secrets (Option A) configured in **god-mode admin** (`apps/admin/`) as `InstanceConfiguration` rows — never in the workspace UI.
- Draw.io: a new editor component + attachment type; no settings page.

### 1.7 Effort / dependencies / risks / silo-required

| Integration | Recommended path | Effort | Silo-required? | Key risk |
|---|---|---|---|---|
| Slack | B (task-bot) | S | **No** | channel-map source of truth |
| GitHub | B (task-bot) | S–M | **No** | identifier regex false-positives; PAT scope |
| GitLab | B (task-bot) | S | **No** | same as GitHub |
| Sentry | B (task-bot) | S | **No** | dedupe / noise → triage project only |
| Draw.io | frontend + assets | M | **No** | asset versioning |
| (any) native OAuth | A | XL each | **Yes-equivalent** | inbound signature verification = security-critical |

**Dependencies:** task-bot deployment on server3 (exists), a workspace-scoped `X-API-Key` for task-bot, `WEBHOOK_ALLOWED_HOSTS`/`WEBHOOK_ALLOWED_IPS` (`webhook_task.py:332-333`) must allow the task-bot host.

---

## Feature 2 — Importers (Confluence / Notion / CSV / Members)

### 2.1 Behavior

Admin picks a source (Confluence space export, Notion workspace/CSV export, generic issue CSV, or members CSV), uploads a file (or provides a token), maps columns/fields, and Plane creates projects/issues/pages/members asynchronously with a progress + error report.

### 2.2 Data model

- **Reuse `Importer`** (`importer.py:13`) as the job record: `status` machine (line 15-24), `initiated_by`, `metadata`/`config`/`data`/`imported_data` JSON, `token` FK. It is `ProjectBaseModel` (project-scoped).
- **Migration sketch:** extend the `service` choices (`importer.py:14`) from `github/jira` to add `confluence`, `notion`, `csv`, `members` — a trivial `AlterField` migration (choices are not DB-enforced in Postgres, so this is metadata-only + serializer validation). Optionally add `source_file = models.ForeignKey("db.FileAsset", null=True)` to attach the uploaded export, and `error_log = JSONField(default=list)` for per-row failures. Both are additive migrations.
- The `token` FK is `NOT NULL` today (`importer.py:29`); CSV imports have no OAuth token → migration should make `token` nullable, or we mint a placeholder token. Recommend `null=True`.

### 2.3 Backend — importer framework

**Parser registry (net-new):** `apps/api/plane/utils/importers/` with a base `class BaseImporter` (`validate(config)`, `parse(file) -> IntermediateGraph`, `map_fields(mapping)`) and per-source subclasses `CsvImporter`, `MembersCsvImporter`, `NotionImporter`, `ConfluenceImporter`. The **intermediate representation** (projects → issues → comments → pages, plus member list) decouples parsing from insertion so all sources share one loader.

**Async import via Celery (net-new task):** `apps/api/plane/bgtasks/importer_task.py::run_import(importer_id)`:
1. Load `Importer`, set `status="processing"`.
2. Instantiate the registered parser by `importer.service`, parse the uploaded `FileAsset`.
3. Bulk-create projects/issues/pages inside a transaction, batching (`bulk_create`) like the existing automation task (`issue_automation_task.py:68`).
4. Emit `issue_activity.delay(type="issue.activity.created", ...)` per created issue so downstream (search index, webhooks, notifications) stays consistent — same pattern the codebase already uses (`issue_automation_task.py:70`).
5. Write per-row failures to `imported_data`/`error_log`; set `status="completed"`/`"failed"`.

This mirrors the existing export pipeline (`bgtasks/export_task.py`, `exporter_expired_task.py`) so we follow an established shape.

**Members import (CSV):** parse `email,display_name,role`; for each row reuse the existing invitation path (`api/views/member.py`, `bgtasks/workspace_invitation_task.py`, `project_invitation_task.py`) rather than inserting membership directly — this preserves the invite/accept flow and role validation.

**Endpoints:**
- Internal `app/`: `POST /api/workspaces/{slug}/projects/{id}/importers/` (create + enqueue), `GET .../importers/{id}/` (status/progress), `GET .../importers/` (list). New views `app/views/importer/base.py` + `app/urls/importer.py`.
- Public v1 `api/`: optional `POST /api/v1/.../importers/` for scripted/CSV imports (task-bot could drive bulk member onboarding).
- File upload reuses the existing asset flow (`app/views/asset/`).

### 2.4 Frontend

- Import settings page (sibling of exports): source picker, file upload, **column-mapping UI** (CSV headers → Plane fields), then a job-status panel polling `GET .../importers/{id}/`. The existing `IntegrationAndImportExportBanner` component (used at `integrations/page.tsx:44`) indicates the import/export settings surface already exists to extend.
- No god-mode config needed for CSV/members; Notion/Confluence-via-API would need a token field (workspace-scoped, not instance-scoped).

### 2.5 Effort / dependencies / risks / silo-required

| Source | Effort | Silo-required? | Risk |
|---|---|---|---|
| CSV (issues) | M | **No** | column mapping UX, encoding |
| Members CSV | S–M | **No** | reuse invite flow; role mapping |
| Notion (export ZIP/CSV) | M–L | **No** (file-based) | Notion export fidelity (nested pages, DB props) |
| Notion (live API) | L | **No** but needs token store | rate limits, pagination |
| Confluence (space export) | L | **No** (file-based) | storage-format HTML → Plane rich text |

**Dependencies:** parser registry, `Importer` schema tweak (nullable `token`, extended `service`), asset upload. **Risk:** rich-text/attachment fidelity from Confluence/Notion is the main quality risk; start with CSV + members (highest value, lowest risk), add Notion/Confluence file-import next. **Silo:** none required — all file-based; only live-API variants need a token, still no silo.

---

## Feature 3 — Automations (rule engine: trigger → condition → action)

### 3.1 Behavior

Per-project rules: **"WHEN `<trigger>` IF `<conditions>` THEN `<actions>`."** Examples: when state changes to Done → set `completed_at` + notify Slack; when priority = urgent and assignee empty → assign to lead; when label `bug` added → move to Triage project. Extends today's fixed auto-archive/auto-close (`issue_automation_task.py`) into user-defined rules.

### 3.2 Data model (net-new)

```python
# apps/api/plane/db/models/automation.py  (net-new)
class AutomationRule(ProjectBaseModel):        # project-scoped, like Importer/Slack syncs
    name         = CharField(max_length=255)
    is_active    = BooleanField(default=True)
    trigger      = CharField(max_length=64)    # e.g. "issue.state.changed", "issue.created",
                                               #      "issue.label.added", "issue.assignee.changed"
    conditions   = JSONField(default=list)     # [{field, operator, value}, ...]  (AND-joined; OR via groups)
    actions      = JSONField(default=list)     # [{type, params}, ...]
    run_order    = PositiveIntegerField(default=0)

class AutomationRuleLog(ProjectBaseModel):     # audit / debugging
    rule         = ForeignKey(AutomationRule, related_name="logs")
    issue        = ForeignKey("db.Issue", null=True)
    matched      = BooleanField()
    actions_run  = JSONField(default=list)
    error        = TextField(null=True)
```

- **Schema for condition/action (validated by serializer, not DB):**
  - Condition: `{"field": "priority", "operator": "eq|neq|in|contains|is_empty|is_not_empty", "value": ...}`. Supported fields: `state`, `state_group`, `priority`, `assignees`, `labels`, `target_date`, `created_by`.
  - Action: `{"type": "set_state|set_priority|assign|add_label|remove_label|set_completed_at|notify_slack|create_subtask|move_project", "params": {...}}`.
- **Migration sketch:** one new migration creating `automation_rules` + `automation_rule_logs` tables (both `ProjectBaseModel`, so they inherit `workspace`/`project`/`created_by` FKs). Register in `db/models/__init__.py`.

### 3.3 Backend — hook points, evaluation, executor

**Hook point (the key architectural decision):** every issue mutation already funnels through `issue_activity` (`issue_activities_task.py:1504`) and its `ACTIVITY_MAPPER` (line 1540). The field-level `track_*` functions (e.g. `track_state` line 189, `track_priority` line 161, `track_assignees` line 357, `track_labels` line 290) already compute old→new diffs. **Add a single dispatch call** after `IssueActivity.objects.bulk_create(...)` (line 1584) that hands the created activities to the automation evaluator. This gives us triggers for state/priority/assignee/label/create/target_date **for free** from existing diff logic — no new signals needed.

**Evaluator + executor (net-new Celery task):** `apps/api/plane/bgtasks/automation_task.py::evaluate_automations(issue_id, project_id, actor_id, triggers)`:
1. Load active `AutomationRule` for the project whose `trigger` ∈ the fired triggers, ordered by `run_order`.
2. For each rule, evaluate `conditions` against the current `Issue` (fetch once, evaluate in Python — condition volume is tiny).
3. For matched rules, dispatch each action to an `ACTION_HANDLERS` registry. State-changing actions (`set_state`, `assign`, `add_label`) mutate the issue **and re-emit `issue_activity.delay(...)`** with `requested_data={"automation": True}` (the codebase already tags automation-driven activity this way — see `issue_automation_task.py:73`). `notify_slack` reuses the outbound-webhook/task-bot path from Feature 1. `set_completed_at` sets the timestamp when moving to a `completed`-group state.
4. **Loop guard:** carry an `automation` flag / recursion-depth in the activity payload; the evaluator skips rules re-triggered by its own automation-tagged activity (prevents infinite rule cascades). This is essential.
5. Write `AutomationRuleLog`.

**Async & ordering:** run as a Celery task (`.delay`) off the activity path so user requests stay fast, consistent with how notifications/webhooks are already dispatched from `issue_activity` (lines 1586-1592).

**Time-based triggers** (e.g. "3 days in Done → archive") stay as a Celery beat sweep, extending the existing `archive_and_close_old_issues` (`celery.py:44`).

**Endpoints:** internal CRUD `app/views/automation/base.py` + `app/urls/automation.py` (list/create/update/delete/toggle, plus `GET .../automations/{id}/logs/`). Public v1 optional. Permissions: project admin (`allow_permission([ROLE.ADMIN], level="PROJECT")`, the pattern used across `app/views`).

### 3.4 Frontend

- The automations settings page **already exists** (`settings/projects/[projectId]/automations/page.tsx`) and renders the built-in `AutoArchiveAutomation`/`AutoCloseAutomation` plus the paid `CustomAutomationsRoot` from `@/plane-web/components/automations/root` (CE stub: `apps/web/ce/components/automations/root.tsx`, currently a no-op). **We implement our rule-builder inside that CE stub** — a rule list + a trigger/condition/action builder form. No new route needed; we replace the stub's return with a real component.
- No god-mode/OAuth config required (self-contained feature).

### 3.5 Effort / dependencies / risks

- **Effort: L** (models S, evaluator/executor M, condition/action handler registry M, rule-builder UI L).
- **Dependencies:** the one dispatch line added to `issue_activity` (`issue_activities_task.py:~1585`); action handlers reuse existing issue-mutation + webhook code.
- **Risks:** (1) **infinite loops** — mitigated by the automation-tag + depth guard (§3.3.4); (2) rule ordering/conflicts (two rules setting different states) — `run_order` + first-match-wins per field, logged; (3) evaluating on every activity adds load — keep the query narrow (indexed `project_id + is_active + trigger`) and short-circuit when no rules exist.
- **Silo-required? No.**

---

## Feature 4 — Enhanced / Semantic Search

### 4.1 Behavior

Better global search: typo tolerance, partial-word ranking, description/comment body matching (today it's substring-only on names), and relevance-ranked results — without standing up heavy infra.

### 4.2 Current state (baseline)

`GlobalSearchEndpoint` (`search/base.py:46`) runs `Q(name__icontains=query)` (and a few fields) per entity — no ranking, no typo tolerance, misses description/comment bodies, and `%term%` `ILIKE` can't use a normal index (full scans as data grows). Postgres is already the DB and `django.contrib.postgres` is already imported in this file (`ArrayAgg`, `ArrayField` at lines 20-21), so Postgres-native search is a drop-in.

### 4.3 Two options

**Option A — Postgres full-text + `pg_trgm` (RECOMMENDED for a small self-host):**
- Enable extensions (migration `CREateExtension("pg_trgm")`, `CreateExtension("unaccent")` optional).
- Add a `SearchVectorField` + GIN index to `Issue` (name + description_stripped) and optionally `Page`; keep it fresh with a Postgres trigger or Django `SearchVector` update in `issue_activity`.
- Rewrite the `filter_issues` (and friends) in `search/base.py` to use `SearchQuery`/`SearchRank` for body matches **plus** `TrigramSimilarity(name, query)` for typo-tolerant name ranking, ordered by combined rank. Add a `GinIndex(fields=["name"], opclasses=["gin_trgm_ops"])` for the trigram path.
- **Effort: M.** No new services, no external deps, uses infra we already run. Handles typos, partial words, body search, and is properly indexed.

**Option B — Embedding / vector search (semantic):**
- Either `pgvector` (add extension + `VectorField`, embed issues via a model) or an external vector store. Requires an embedding pipeline (batch + on-write), a model host, and re-embedding on edits.
- **Effort: L–XL** + ongoing GPU/model cost. Overkill for issue-tracker search where users search identifiers/titles/keywords, not fuzzy concepts.

**Recommendation:** **Option A (pg_trgm + FTS).** It closes 90% of the gap (typos, ranking, body search) at M effort with zero new infrastructure. Revisit Option B only if we later want natural-language "find issues about X" semantic recall — and even then `pgvector` keeps it inside Postgres.

### 4.4 Data model

- **Net-new (Option A):** migration enabling `pg_trgm`; add `search_vector = SearchVectorField(null=True)` + `GinIndex` on `Issue` (and `Page`). Populate via trigger or a backfill management command, keep fresh from `issue_activity`.
- No model change if we accept trigram-only on existing `name` columns (even lighter — just add the GIN trgm index in a migration, rewrite the query). This is the **S** starting point; add FTS vector for body search as phase 2.

### 4.5 Backend

- Modify `GlobalSearchEndpoint.filter_issues` et al. (`search/base.py:83+`) to rank by `TrigramSimilarity`/`SearchRank`. Keep the same response contract (`{"results": {...}}`, line 302) so the frontend is untouched.
- Backfill command + optional `issue_activity` hook (`issue_activities_task.py:1584`) to update `search_vector` on write.

### 4.6 Frontend

- No change required — the search palette consumes the same endpoint shape. Optionally surface matched snippet/description in results.

### 4.7 Effort / dependencies / risks / silo-required

- **Effort:** S (trgm GIN + query rewrite) → M (add FTS vector + backfill). **Silo-required? No.**
- **Dependencies:** superuser DB grant to `CREATE EXTENSION` (one-time, self-host we control the RDS/Postgres).
- **Risks:** GIN index write amplification (fine at our scale); keeping `search_vector` fresh (trigger is safest); `%ILIKE%` removal must preserve current behavior for non-issue entities.

---

## Cross-cutting summary & recommended sequencing

| Feature | Recommended approach | Silo needed? | Effort | Net-new vs existing |
|---|---|---|---|---|
| Slack / GitHub / GitLab / Sentry | **Option B**: outbound webhooks (exist) + task-bot bridge via public v1 API | **No** | S–M each | Reuses `Webhook`, `webhook_send_task`, orphan `SlackProjectSync`; net-new = catalog endpoint + task-bot handlers |
| Draw.io | Frontend editor + existing asset upload | No | M | Net-new frontend only |
| Importers (CSV/members/Notion/Confluence) | Parser registry + `Importer` model + Celery | No | S→L | Reuses `Importer` (`importer.py:13`); net-new parsers + `importer_task` |
| Automations | Rule engine hooked into `issue_activity` | No | L | Net-new `AutomationRule`+task; hook = 1 line in `issue_activities_task.py` |
| Enhanced search | `pg_trgm` + Postgres FTS | No | S→M | Modifies `search/base.py`; net-new GIN index/migration |

**Suggested order:** (1) Slack + GitHub via task-bot (highest value, no schema change, S), (2) enhanced search trgm (S, immediate UX win), (3) CSV + members importers (M), (4) automations rule engine (L), (5) Notion/Confluence importers + Draw.io as capacity allows. **None of the recommended paths require resurrecting the silo.**
