# Cloud → Self-host Plane migration (weekend delta pull)

Ready-to-run, **dry-run-default** scripts that pull ALL data from cloud Plane
(`app.plane.so`) into the self-host fork (`plane.motemote.co.kr`), skipping
anything already present (idempotent by `external_id` = cloud UUID).

> **Nothing here writes until you pass `--execute`.** Every write is also
> idempotent, so re-running is safe. See doc
> `docs/mote-design/11-cloud-to-selfhost-migration-plan.md` §4 (recommended
> approach) and §7 (open decisions).

Run these **on server3** (system `python3`, stdlib only — no pip installs).

---

## 0. Scope

| | |
|---|---|
| Source | cloud `https://api.plane.so/api/v1/workspaces/motemote` (read-only) |
| Destination | self-host `https://plane.motemote.co.kr/api/v1/workspaces/motemote` |
| In-scope delta (measured 2026-07-10) | GROWTH 68, TEAMDEV 33, ALLCL 15, STORE 5, MOTEERP 2 = **123 issues** |
| **Never touched** | `PLANE`, `IDEA`, `MOTEM`, `TEST` (self-host-native, not in cloud) |
| Dedup key | issue/comment `external_id` = cloud UUID, `external_source = "plane-cloud"` |

The scripts pull **everything** (full idempotent re-sync), not just the 123 —
already-present rows are skipped, so the net effect equals the delta.

---

## 1. Prerequisites

1. **Cloud token** — already on server3 at
   `/srv/shared/app-src/task-bot/.env` (`PLANE_API_TOKEN=`). The scripts read it
   automatically, or you can `export PLANE_API_TOKEN=...`. The cloud API needs a
   `User-Agent` header (the client sets one) or it 403s.

2. **Self-host token** — does **not** exist on disk yet. Mint it (a self-host
   write you run by hand):

   ```bash
   python3 01_mint_selfhost_token.py --email <a motemote workspace ADMIN email>
   ```

   That script **prints** the exact `docker exec plane-api-1 ...` command; run
   it, copy the printed `plane_api_...` token, then:

   ```bash
   export SELFHOST_API_TOKEN='plane_api_xxxxxxxxxxxx'
   ```

   The token's user **must be a workspace admin** (listing members requires
   `WorkSpaceAdminPermission`; issue/page writes require a project writing role).

3. **DB read access** (for preflight/verify) is automatic: the scripts source
   `POSTGRES_PASSWORD` from `/srv/shared/stack/plane-server3/plane.env` and run
   read-only `psql` inside `plane-plane-db-1`. Only `SELECT` is ever issued.

---

## 2. Run order

```bash
# 0) mint + export the self-host token (section 1.2)
python3 01_mint_selfhost_token.py --email you@motemote.com   # prints commands
export SELFHOST_API_TOKEN='plane_api_...'

# 1) preflight — read-only inventory + plan + token check + limitations
python3 00_preflight.py

# 2) issues (+comments, links, parent linkage) — DRY-RUN first, then execute
python3 10_migrate_issues.py                 # dry-run: prints would-create/skip
python3 10_migrate_issues.py --execute       # perform writes

# 3) pages — DRY-RUN first, then execute
python3 20_migrate_pages.py
python3 20_migrate_pages.py --execute

# 4) attachments — OPTIONAL / SLOW, run last
python3 30_migrate_attachments.py
python3 30_migrate_attachments.py --execute

# 5) verify — read-only, exits non-zero on mismatch
python3 90_verify.py
```

Handy flags (all scripts): `--project GROWTH` (repeatable, limit to projects),
`--limit N` (cap items per project — smoke-test a couple before the full run).

---

## 3. What each script does

| Script | Writes? | Purpose |
|---|---|---|
| `common.py` | no | Shared `PlaneClient` (paging via `next_cursor`/`next_page_results`), token loading, name→id maps, DB read helpers, `--dry-run/--execute` base, EXCLUDE set. |
| `01_mint_selfhost_token.py` | no (prints only) | Prints the `docker exec` command to mint + later revoke a self-host `APIToken`. |
| `00_preflight.py` | never | Read-only inventory: cloud vs self-host counts, per-project delta, token GET check, contract limitations. |
| `10_migrate_issues.py` | `--execute` | Upsert issues by `external_id`; map state by NAME, labels by name (create missing), assignees by email; then comments (`external_id`) + links (url-dedup); parent linkage in a 2nd pass. |
| `20_migrate_pages.py` | `--execute` | Create pages (`description_html` only) deduped by NAME. |
| `30_migrate_attachments.py` | `--execute` | OPTIONAL/SLOW: download cloud attachment → S3 presigned re-upload → mark uploaded. Idempotent by `external_id`. |
| `90_verify.py` | never | Assert every cloud issue UUID is an `external_id` on self-host (missing = 0). Exit non-zero on mismatch. |

---

## 4. Preservation limitations (confirmed by reading the fork API code)

These come from `apps/api/plane/api/serializers/{issue,page}.py`,
`views/{issue,page}.py`, and `db/models/issue.py`. **Decide on #1 and #3 before
the run.**

1. **`sequence_id` is NOT preserved via the public API.** `Issue.save()`
   overwrites it with `last_sequence + 1` on every create. Self-host assigns
   fresh consecutive numbers. Exact cloud numbers are only reproduced when the
   cloud gap is **contiguous** and self-host `max == first_missing - 1`
   (GROWTH 69–136, ALLCL 183–197, STORE 63–67, MOTEERP 72–73 — likely match).
   **TEAMDEV has gaps (389–410 w/ gaps), so its numbers will NOT line up.**
   Exact-number preservation requires **direct DB writes** (`issues.sequence_id`
   + `IssueSequence`), which is the separate, riskier path **not** approved here.
   → `90_verify.py` gates on **coverage** (missing = 0), not seq-number equality.
   Use `--strict-seq` only if you took the DB-write path.

2. **`created_at` / `created_by` ARE preserved** for issues and comments (the
   view sets them post-save). But `created_by` must be a **self-host** user id;
   cloud user UUIDs differ, so authorship is mapped by **email** via `/members/`
   and otherwise falls back to the migration token's user.

3. **Pages lose fidelity.** `PageCreateSerializer` accepts only
   `name`, `description_html`, `access`:
   - **No `external_id`** → pages dedup by **name** only (renames not detected;
     re-running can duplicate a renamed page).
   - **No `description_binary`** → the Yjs collaborative binary is dropped;
     only rendered HTML is carried (fine for text, loses live-edit state/embeds
     stored only in the binary).
   - **No workspace-level create** → cloud pages not linked to a project can't
     be migrated via API (reported as orphan; migrate by hand if needed).

4. **Issue links have no `external_id`** → deduped by URL (server 409s on dup).

5. **Assignees** must already be project members with a writing role, or the
   serializer silently drops them.

---

## 5. Rollback

- **Data**: writes are additive and `external_id`-tagged. To undo an issue
  import you can soft-delete by `external_source = "plane-cloud"` per project
  (do this deliberately; not scripted here). Take the §4.2 backup first
  (`plane-backup.sh` full dump) so a full restore is always available.
- **Token**: revoke the migration token when done —
  `01_mint_selfhost_token.py` prints the revoke command
  (`APIToken.objects.filter(label="cloud-migration").update(is_active=False)`).

---

## 6. Final verification checklist

- [ ] `00_preflight.py` shows the expected per-project delta and the token check passes.
- [ ] `10_migrate_issues.py` (dry-run) would-create count ≈ 123; then `--execute` reports 0 failures.
- [ ] `20_migrate_pages.py` dry-run reviewed (name-dedup understood) then executed.
- [ ] (optional) `30_migrate_attachments.py` executed if attachment fidelity is required.
- [ ] **`90_verify.py` exits 0** — every cloud issue UUID is covered on self-host (**missing = 0**).
- [ ] Spot-check a TEAMDEV issue in the self-host UI (seq number will differ — expected).
- [ ] Migration token revoked.
