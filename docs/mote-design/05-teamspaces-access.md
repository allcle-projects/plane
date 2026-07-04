# 05 — Teamspaces & Access Control (Design Spec)

> **Status:** Design only. No implementation.
> **Target:** Plane CE v1.3.1 fork, repo `/home/otro/git/plane-fork`, branch `mote`.
> **Scope:** Self-hosting five paid Plane features on our CE fork. Each is designed to live **inside this repo** (no external `ee/` package), since the fork has no `ee/` directory and paid gating upstream is frontend-only.

## 0. Architecture facts this spec builds on

These are load-bearing constraints verified in the code; every feature below respects them.

- **Backend is unified, no license gating.** Everything lives under `apps/api/plane/`: internal REST in `app/`, public v1 (X-API-Key) in `api/`, models in `db/models/`, auth in `authentication/`, permission classes in `app/permissions/`, god-mode instance config in `license/`. There is **no `ee/` directory** — confirmed absent. Backend performs **no license/edition checks**; `license/models/instance.py:29` only records `edition = PLANE_COMMUNITY`. So all backend work here is net-new code we own, not a gated module.
- **Paid gating upstream is frontend-only.** `apps/web/tsconfig.json:9` aliases `@/plane-web/* → ./ce/*`. The real paid implementations live in an external "silo" package that is **not in this repo**; `ce/` holds inert stubs. Example: `apps/web/ce/components/projects/teamspaces/teamspace-list.tsx:12-14` — `ProjectTeamspaceList` returns `null`. It is already wired into the product at `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/members/page.tsx:22,53`. **Our strategy: implement inside `ce/` so the existing alias picks it up with zero import rewrites.**
- **Role model is fixed ints, duplicated in ~4 places.** `ROLE` enum `app/permissions/base.py:13-16` (ADMIN=20, MEMBER=15, GUEST=5); `ROLE_CHOICES` `db/models/workspace.py:19`; `ROLE` re-imported from `db.models.project` in `app/permissions/project.py:10`; and literal ints `Admin=20/Member=15/Guest=5` in `app/permissions/workspace.py:12-14`. `WorkspaceMember.role` is a `PositiveSmallIntegerField(choices=ROLE_CHOICES, default=5)` (`db/models/workspace.py:205`). Guest is a **role**, not a seat quota.
- **Permission enforcement has two shapes.** (a) DRF `BasePermission` classes in `app/permissions/*.py` (e.g. `ProjectBasePermission` `project.py:13`, `WorkSpaceAdminPermission` `workspace.py:62`). (b) A decorator `allow_permission(allowed_roles, level=...)` `app/permissions/base.py:19-88` used on view methods (e.g. all over `app/views/intake/base.py`). **Both hardcode role ints** — this is the blast radius for Custom RBAC.
- **Auth uses an adapter pattern.** `authentication/adapter/base.py` `Adapter` → `complete_login_or_signup()` (`base.py:289-360`) is the single funnel for every provider. `CredentialAdapter` (`adapter/credential.py:8`) → `EmailProvider.authenticate()` is invoked from `authentication/views/app/email.py:109`, then `user_login(...)` (`email.py:111`) mints the session. There are **no OTP/MFA/TOTP fields** anywhere on `User` or `Profile` (`db/models/user.py`, `Profile` at `user.py:200`) — confirmed by grep.
- **God-mode config exists.** `InstanceConfiguration` (`license/models/instance.py:72-83`), read via `get_configuration_value([{key,default}])` (already used in `adapter/base.py:106` for `ENABLE_SIGNUP`, and `check_sync_enabled` `base.py:125-137`). This is the canonical place for instance-wide admin toggles (2FA enforcement).
- **Public v1 API** authenticates by `X-Api-Key` header → `APIToken` (`api/middleware/api_authentication.py:16-51`), views in `api/views/`, urls in `api/urls/`. Intake and member already have public endpoints (`api/views/intake.py`, `api/views/member.py`).

### ⚠️ Pre-existing orphan: a `Team` model already exists

`db/models/workspace.py:261-283` **already defines `class Team(BaseModel)`** with `name`, `description`, `workspace` FK (`related_name="workspace_team"`), `logo_props`, a soft-delete-aware unique constraint, and `db_table = "teams"`. **But it is dead code:** it is **not exported** from `db/models/__init__.py` (grep: no match) and **not referenced anywhere** in `app/` (grep: no match). There is **no `TeamMember` and no `TeamProject`**. Treat `Team` as a usable starting scaffold for Teamspaces (§1) — its migration may already be applied, so verify `showmigrations` before adding fields.

---

## 1. Teamspaces

A Teamspace is a named sub-grouping **within a workspace** that bundles a set of members and a set of projects, and exposes team-scoped views/pages. **Effort: XL — phased.**

### Behavior
- Workspace admins create Teamspaces; each has a name, description, logo, lead(s), a member list, and a linked project list.
- A Teamspace gives its members a scoped landing surface: team home, team-scoped work-item list (union of issues across the team's projects), team views, team pages.
- Sidebar nav gets a "Teamspaces" section listing the teams the current user belongs to.
- On the project members settings page, the existing `ProjectTeamspaceList` slot (`members/page.tsx:53`) shows which Teamspaces this project belongs to.
- Membership in a Teamspace does **not** by itself grant project access — it is an organizational overlay on top of existing `ProjectMember`/`WorkspaceMember` rows (see permissions).

### Data model
Existing: `Team` (`db/models/workspace.py:261-283`). **Reuse as-is** (optionally add `lead` FK). Net-new join models — put them adjacent to `Team` in `workspace.py`:

```python
# db/models/workspace.py (net-new; Team already exists at line 261)

class Team(BaseModel):            # EXISTING lines 261-283 — extend, don't recreate
    # + optional net-new field:
    lead = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                             null=True, blank=True, related_name="led_teams")

class TeamMember(BaseModel):      # NET-NEW
    team = models.ForeignKey("db.Team", on_delete=models.CASCADE, related_name="team_member")
    member = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                               related_name="member_team")
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE,
                                  related_name="workspace_team_member")
    class Meta:
        db_table = "team_members"
        constraints = [models.UniqueConstraint(
            fields=["team", "member"], condition=models.Q(deleted_at__isnull=True),
            name="team_member_unique_team_member_when_deleted_at_null")]

class TeamProject(BaseModel):     # NET-NEW
    team = models.ForeignKey("db.Team", on_delete=models.CASCADE, related_name="team_project")
    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="project_team")
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE,
                                  related_name="workspace_team_project")
    class Meta:
        db_table = "team_projects"
        constraints = [models.UniqueConstraint(
            fields=["team", "project"], condition=models.Q(deleted_at__isnull=True),
            name="team_project_unique_team_project_when_deleted_at_null")]
```

Follow the exact soft-delete unique-constraint idiom used at `workspace.py:217-223`. **Export all three** from `db/models/__init__.py` (currently `Team` is not exported — fix that).

**Migration sketch:** one migration in `db/migrations/` that (a) `AddField` `Team.lead` (nullable), (b) `CreateModel` `TeamMember`, `TeamProject`. Because `Team`'s own migration may already exist, `makemigrations` will produce a delta only. Team-scoped views/pages (phase 3) reuse existing `IssueView` (`db/models/view.py`) and `Page` (`db/models/page.py`) by adding a nullable `team` FK to each, gated behind their own migration.

### Backend
Internal `app/`:
- New viewset file `app/views/workspace/team.py` (net-new), registered in `app/urls/workspace.py` (pattern at `urls/workspace.py:8`).
  - `GET/POST   /api/workspaces/<slug>/teamspaces/` — list/create teams.
  - `GET/PATCH/DELETE /api/workspaces/<slug>/teamspaces/<team_id>/`.
  - `GET/POST/DELETE /api/workspaces/<slug>/teamspaces/<team_id>/members/`.
  - `GET/POST/DELETE /api/workspaces/<slug>/teamspaces/<team_id>/projects/`.
  - `GET /api/workspaces/<slug>/teamspaces/<team_id>/work-items/` — issues across `TeamProject` projects (reuse `issue_filters`).
- New serializers in `app/serializers/` (`TeamSerializer`, `TeamMemberSerializer`, `TeamProjectSerializer`).

Public v1 `api/`: add `api/views/team.py` + `api/urls/team.py` mirroring the internal read/write surface (`GET/POST /api/v1/workspaces/<slug>/teamspaces/...`), authed by the existing `X-Api-Key` middleware. Follow `api/views/member.py` as the template. **Phase this last.**

Permission-layer changes:
- Create/edit team → workspace Admin/Member. Reuse `WorkSpaceAdminPermission` (`permissions/workspace.py:62`) unchanged.
- Add a **net-new** `TeamMemberPermission` in `app/permissions/` (new file `team.py`) that checks `TeamMember` membership for team-scoped reads. Do **not** overload project permissions.
- Adding a project to a team requires the actor be a project Admin (reuse `ProjectAdminPermission` `permissions/project.py:119`).

### Frontend
- **Replace the stub** `apps/web/ce/components/projects/teamspaces/teamspace-list.tsx:12-14` (currently `return null`) with a real component listing the teams a project belongs to (calls `GET .../teamspaces?project_id=`). Because of the `@/plane-web/* → ./ce/*` alias, the existing import at `members/page.tsx:22` needs **no change**.
- New routes under `apps/web/app/(all)/[workspaceSlug]/`: `teamspaces/` (list), `teamspaces/[teamId]/` (home), `.../[teamId]/work-items/`, `.../[teamId]/views/`, `.../[teamId]/pages/`, `.../[teamId]/settings/`.
- New MobX store `apps/web/ce/store/teamspace/` + service, wired into `ce/store/root.store.ts` (currently no team store — grep confirms). Follow the `ce/store/workspace` / `ce/store/member` structure.
- Sidebar: add a "Teamspaces" nav section in the workspace sidebar component.
- No god-mode toggle needed — Teamspaces are always-on once shipped.

### Effort / order / risks
- **Effort: XL.** Phase it:
  - **Phase 1 (M):** models + migration + internal CRUD for team/members/projects; replace `teamspace-list.tsx` stub; sidebar list. Delivers "teams exist and group projects."
  - **Phase 2 (M):** team home + team work-items aggregation view + store.
  - **Phase 3 (L):** team-scoped views & pages (adds `team` FK to `IssueView`/`Page` + their surfaces).
  - **Phase 4 (S):** public v1 API.
- **Dependencies:** none hard; independent of §2–§5. If Custom RBAC (§2) lands first, team permission checks should consume the new permission resolver rather than raw ints.
- **Risks:** low-moderate. Main risk is scope creep in phase 3 (views/pages are large surfaces). The pre-existing orphan `Team` model means a possible **migration-state mismatch** — verify whether `teams` table already exists before generating migrations.
- **Silo-required?** **No.** Fully self-hostable in-repo. Alternative if under time pressure: ship Phase 1 only (grouping + list) and defer team-scoped views/pages.

---

## 2. Custom RBAC (custom roles)

User-defined roles with granular, permission-level grants, replacing the assumption that role ∈ {5,15,20}. **Effort: XL. Highest blast radius in this document.**

### Behavior
- Workspace admins define custom Roles (e.g. "Reviewer", "Billing") with a name and a set of granular permissions (create_issue, delete_project, manage_members, view_analytics, …), scoped at workspace and/or project level.
- Members are assigned a Role instead of / in addition to the fixed int role.
- Built-in Admin/Member/Guest remain as **seeded, non-deletable** roles so existing behavior is preserved.

### Data model (net-new)
```python
# db/models/role.py  (NET-NEW)
class Permission(BaseModel):
    key = models.CharField(max_length=100, unique=True)   # e.g. "issue.create"
    category = models.CharField(max_length=50)            # workspace | project | issue ...
    description = models.TextField(blank=True)

class Role(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="roles")
    name = models.CharField(max_length=100)
    level = models.CharField(max_length=20)               # WORKSPACE | PROJECT
    is_system = models.BooleanField(default=False)        # seeded Admin/Member/Guest
    base_role = models.PositiveSmallIntegerField(null=True)  # bridge to 20/15/5 for compatibility
    permissions = models.ManyToManyField(Permission, related_name="roles")

class RoleAssignment(BaseModel):
    role = models.ForeignKey("db.Role", on_delete=models.CASCADE, related_name="assignments")
    member = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE)
    project = models.ForeignKey("db.Project", null=True, on_delete=models.CASCADE)
```

**Compatibility bridge (critical):** keep `WorkspaceMember.role`/`ProjectMember.role` ints (`db/models/workspace.py:205`) as the source of truth for **system** roles; `Role.base_role` maps a custom role back to the nearest int for any check not yet migrated. A **seed migration** creates the three system `Role` rows (`is_system=True`, `base_role` 20/15/5) and a `Permission` catalog. This lets both systems coexist during rollout.

### Backend — integration with existing permission layer (the hard part)
The current layer hardcodes ints in **two shapes**, both must be refactored to a single resolver:

1. **Introduce a resolver.** New `app/permissions/resolver.py`: `has_permission(user, workspace_slug, project_id, permission_key) -> bool`. It (a) resolves the user's `RoleAssignment`(s), unions their `Permission.key`s, and checks membership; (b) **falls back** to the legacy int check when the user has only a system role — so nothing breaks day one.
2. **Rewrite `allow_permission`** (`app/permissions/base.py:19-88`) to accept **either** role ints (legacy call sites keep working via `base_role`) **or** a `permission_key=` kwarg that routes to the resolver. This decorator is used pervasively (e.g. every method in `app/views/intake/base.py`), so backward-compatible signature is mandatory.
3. **Rewrite the DRF classes** in `app/permissions/project.py` (`ProjectBasePermission:13`, `ProjectMemberPermission:56`, `ProjectEntityPermission:85`, `ProjectAdminPermission:119`, `ProjectLitePermission:133`) and `app/permissions/workspace.py` (`WorkSpaceBasePermission:19`, `WorkSpaceAdminPermission:62`, `WorkspaceEntityPermission`, …) to delegate to the resolver, keeping their class names and `has_permission` contracts identical so no view file changes.

Endpoints (internal `app/`, new `app/views/workspace/role.py` + `app/urls/workspace.py`):
- `GET/POST /api/workspaces/<slug>/roles/`, `GET/PATCH/DELETE /api/workspaces/<slug>/roles/<role_id>/` (system roles are read-only).
- `GET /api/workspaces/<slug>/permissions/` — catalog for the role editor UI.
- `POST/DELETE /api/workspaces/<slug>/members/<member_id>/roles/` — assign/unassign.

Public v1: **defer.** Custom roles via API key is niche; add `api/views/role.py` only if demanded.

### Frontend
- New workspace settings section `settings/roles/` (list, create/edit role with a permission matrix), `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/roles/`.
- Member settings gains a role picker fed by `GET .../roles/`.
- New `ce/store/role/` MobX store + service.
- No `ce/` stub replacement needed (upstream keeps this entirely in silo). No god-mode toggle; this is per-workspace.

### Effort / order / risks — BLAST RADIUS
- **Effort: XL.** The models are small; the danger is the permission refactor.
- **Blast radius:** **every authenticated write path in the product** flows through either `allow_permission` (`base.py:19`) or a `BasePermission` subclass in `app/permissions/`. Grep the decorator and each class name before touching them — a regression here is an org-wide authorization bug (either lockout or privilege escalation). Mandatory mitigations:
  - Keep the **legacy int fallback** permanently; never remove `WorkspaceMember.role`.
  - Land the resolver **behind the existing signatures** first (pure refactor, same behavior, full test pass) **before** exposing any custom-role UI.
  - Add exhaustive permission unit tests per class/method **before** refactor (characterization tests), then refactor to green.
- **Dependencies / order:** do this **after** Teamspaces if both are wanted, and treat it as its own release train. Nothing else here depends on it, but §1/§4/§5 permission checks should adopt the resolver once it exists.
- **Silo-required?** **No**, but it is the **most invasive** in-repo change. Alternative (lower risk, ~80% of the value): a fixed **4th and 5th preset role** (e.g. "Restricted Member", "Viewer") added as new int constants to the `ROLE` enum + `ROLE_CHOICES` — no resolver, no M2M, just a few new branches in the existing checks. Recommend starting here and only building full custom RBAC if the presets prove insufficient.

---

## 3. Two-Factor Authentication (TOTP)

TOTP second factor on login, integrated into the auth adapter funnel, with per-user enrollment and an instance-wide enforcement toggle. **Effort: M.**

### Behavior
- User enrolls in Settings → Security: server issues a TOTP secret + QR (`otpauth://`), user confirms one code, server returns 8–10 one-time backup codes.
- On subsequent password/OAuth logins, if 2FA is enrolled, the session is **half-authenticated** and the user is prompted for a 6-digit TOTP (or a backup code) before a full session is minted.
- Instance admin can flip **"require 2FA for all users"** in god-mode; users without 2FA are forced to enroll on next login.

### Data model (net-new)
No OTP fields exist today (grep on `user.py` empty). Add a dedicated model rather than bloating `User`:
```python
# db/models/mfa.py  (NET-NEW)
class UserMFA(BaseModel):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="mfa")
    is_enabled = models.BooleanField(default=False)
    secret = models.CharField(max_length=255)          # encrypted at rest (Fernet, like is_encrypted config)
    confirmed_at = models.DateTimeField(null=True)

class MFABackupCode(BaseModel):
    mfa = models.ForeignKey("db.UserMFA", on_delete=models.CASCADE, related_name="backup_codes")
    code_hash = models.CharField(max_length=255)       # hashed, single-use
    used_at = models.DateTimeField(null=True)
```
Enforcement flag is **not** a model field — store it as `InstanceConfiguration` key `ENABLE_MFA_ENFORCEMENT` (`license/models/instance.py:72`), read via `get_configuration_value` exactly like `ENABLE_SIGNUP` (`adapter/base.py:106`). Encrypt `secret` using the same encryption path `InstanceConfiguration.is_encrypted` uses.

### Backend
Integrate at the single funnel — do **not** touch each provider:
- Modify `Adapter.complete_login_or_signup()` (`authentication/adapter/base.py:289-360`): after `save_user_data` (`base.py:349`) and **before** returning `user`, check `UserMFA.is_enabled`. If enabled, **do not** let `user_login` mint a full session; instead set a short-lived "mfa_pending" marker in the session and raise/return a state that `authentication/views/app/email.py:109-111` translates into a redirect to a `/mfa` challenge page (mirror the existing `AuthenticationException` → redirect pattern at `email.py:125-132`).
- Net-new views in `authentication/views/app/mfa.py`:
  - `POST /auth/mfa/enroll/` → returns secret + provisioning URI (uses `pyotp`).
  - `POST /auth/mfa/confirm/` → verify first code, generate backup codes, set `is_enabled`.
  - `POST /auth/mfa/verify/` → verify TOTP/backup during login, then call `user_login` (`authentication/utils/login.py`) to upgrade the pending session to full.
  - `POST /auth/mfa/disable/`.
- Enforcement: in `get_redirection_path`/`post_user_auth_workflow` (`authentication/utils/`), if `ENABLE_MFA_ENFORCEMENT == "1"` and user has no confirmed MFA, redirect to forced enrollment.
- New dependency: `pyotp` (add to `apps/api/requirements/`). Backup codes: `secrets` stdlib.

Permission layer: unaffected (this is authN, not authZ).

### Frontend
- Settings → Security page: enrollment (QR via a client-side QR lib, secret from enroll endpoint), backup-code display/download, disable.
- New `/mfa` challenge route on the auth flow (sits between sign-in POST and dashboard).
- Admin god-mode UI: a toggle in the instance admin panel bound to `ENABLE_MFA_ENFORCEMENT` (the admin panel already renders `InstanceConfiguration` keys).
- No `ce/` stub to replace; this is net-new surface.

### Effort / order / risks
- **Effort: M.** Self-contained; the only tricky bit is the half-session state in `complete_login_or_signup`.
- **Dependencies:** independent of §1/§2/§4/§5. Should ship its own release.
- **Risks:** session-state correctness (must not mint a full session pre-verification), secret encryption at rest, and lockout recovery (backup codes + an instance-admin "reset MFA for user" escape hatch are mandatory). OAuth/OIDC logins also funnel through the same adapter, so 2FA applies uniformly — verify each provider view (`views/app/google.py`, `github.py`, `oidc.py`, …) inherits the challenge redirect.
- **Silo-required?** **No.** Cleanly implementable in-repo against the adapter pattern. Alternative: enforce 2FA at the IdP (OIDC provider) and skip app-native TOTP entirely — zero backend change, but only works for SSO deployments, not email/password.

---

## 4. Guest seat ratio (1:5)

Cap the number of Guest-role members relative to paid (Admin+Member) members per workspace. **Effort: S. Low value — brief.**

### Behavior
- When inviting or activating a Guest, block if it would push guests above `5 × (admins + members)` in that workspace. Show a clear error.

### Data model
**None net-new.** Everything derives from `WorkspaceMember.role` counts (`db/models/workspace.py:205`) and `WorkspaceMemberInvite.role` (`workspace.py:241`). Optionally make the ratio configurable via an `InstanceConfiguration` key `GUEST_SEAT_RATIO` (default `5`).

### Backend
- Single enforcement point: `WorkspaceInvitationsViewset.create` (`app/views/workspace/invite.py:53`). It already loops candidate emails and already does a role-hierarchy guard (`invite.py:63`). Add, right after that guard: count active members by role for the workspace, count pending Guest invites, and reject the batch if `guests + new_guests > ratio × paid`. Return 400 like the existing errors (`invite.py:64`).
- Also guard the **join/accept** path and any role-downgrade endpoint (`WorkSpaceMemberViewSet` update) so an accepted invite or a Member→Guest change can't breach the ratio after the fact.
- No permission-class change.

### Frontend
- Surface the 400 error in the invite modal; optionally show "X of Y guest seats used." No new store, no `ce/` stub.

### Effort / order / risks
- **Effort: S.** A counting check in one-to-three views.
- **Dependencies:** none. Trivially independent. If Custom RBAC (§2) lands, "Guest" may become a `base_role` — count by `base_role == 5` instead.
- **Risks:** low. Race condition on concurrent invites (accept a small over-count, or wrap in `select_for_update`). Mostly a product-policy question, not an engineering one.
- **Silo-required?** **No.** Alternative: don't enforce technically at all — it's a billing/honor-system concept with no paywall in a self-host. Recommend implementing only if there's a real seat-accounting need; otherwise skip.

---

## 5. Customers + intake responsibility routing

A first-class Customer entity, and routing of incoming intake requests to a responsible member. **Effort: M–L.**

### Behavior
- Workspace maintains a Customer directory (name, email/domain, contact info, notes).
- Incoming intake issues can be associated with a Customer, and auto-routed to a **responsible member** based on rules (by customer, by project, or round-robin fallback).
- The responsible member is notified and shown as owner of the intake item's triage.

### Data model (net-new — no Customer model exists today; grep confirms)
```python
# db/models/customer.py  (NET-NEW)
class Customer(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="customers")
    name = models.CharField(max_length=255)
    email = models.EmailField(null=True, blank=True)
    domain = models.CharField(max_length=255, null=True, blank=True)   # route by sender domain
    logo_props = models.JSONField(default=dict)
    metadata = models.JSONField(default=dict)
    class Meta:
        db_table = "customers"
        constraints = [models.UniqueConstraint(
            fields=["workspace", "name"], condition=models.Q(deleted_at__isnull=True),
            name="customer_unique_workspace_name_when_deleted_at_null")]

class CustomerResponsibility(BaseModel):   # who owns intake for a customer/project
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE)
    customer = models.ForeignKey("db.Customer", null=True, on_delete=models.CASCADE, related_name="responsibilities")
    project = models.ForeignKey("db.Project", null=True, on_delete=models.CASCADE)
    responsible_member = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    priority = models.IntegerField(default=0)   # rule precedence
```
Link intake to customer with a **net-new nullable FK on the existing `IntakeIssue`** (`db/models/intake.py:50`), plus an `assigned_to` for the resolved responsible member:
```python
# additions to IntakeIssue (db/models/intake.py:50) via migration
customer = models.ForeignKey("db.Customer", null=True, on_delete=models.SET_NULL, related_name="intake_issues")
responsible_member = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
                                       related_name="responsible_intake_issues")
```
Note `IntakeIssue` already carries `source`, `source_email` (`intake.py:70-71`) — reuse `source_email`'s domain to auto-match a `Customer.domain`.

### Backend
Intake itself already works (`app/views/intake/base.py`, `IntakeViewSet`). Add:
- **Customer CRUD** — new `app/views/workspace/customer.py` + `app/urls/workspace.py`:
  - `GET/POST /api/workspaces/<slug>/customers/`, `GET/PATCH/DELETE /.../customers/<id>/`.
  - `GET/POST/DELETE /.../customers/<id>/responsibilities/`.
- **Routing hook** — in `IntakeIssueViewSet.create` (in `app/views/intake/base.py`), after the intake issue is created, run a resolver: match `source_email` domain → `Customer` → most-specific `CustomerResponsibility` (by customer, then project, then default) → set `responsible_member`, and fire the existing notification/activity task path (`issue_activity` is already imported at `intake/base.py`). Keep it a **post-create side effect** so no existing behavior regresses.
- Public v1: add `api/views/customer.py` + `api/urls/customer.py` (mirror `api/views/intake.py`) so external systems can create customers / push intake with a customer reference via `X-Api-Key`.

Permission layer:
- Customer CRUD → `WorkSpaceAdminPermission` (`permissions/workspace.py:62`) for writes, workspace membership for reads. No new permission class required; reuse existing.

### Frontend
- New workspace section `settings/customers/` (directory + responsibility rules editor), `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/customers/`.
- Intake triage UI: show/assign Customer + responsible member on each intake item.
- New `ce/store/customer/` MobX store + service. No existing `ce/` stub for customers (upstream keeps it in silo), so this is additive.

### Effort / order / risks
- **Effort: M–L.** Customer CRUD is M; the routing resolver + notification wiring pushes toward L.
- **Dependencies:** builds on existing intake (`app/views/intake/`, `db/models/intake.py`) — no dependency on §1–§4. If Teamspaces (§1) exists, responsibility could route to a **team** instead of a single member (nice-to-have, not required).
- **Risks:** low-moderate. Routing rule precedence must be deterministic (hence `priority`). Auto-assign must degrade gracefully (no match → leave unassigned, don't error). Domain matching on `source_email` is best-effort.
- **Silo-required?** **No.** Fully in-repo. Alternative (thin): ship the `Customer` model + manual assignment on intake items only, and **skip the auto-routing resolver** — captures most value at S–M effort; add rule-based routing later.

---

## Appendix — cross-cutting build notes

- **All backend models** go in `db/models/*.py`, must be exported from `db/models/__init__.py`, and follow the soft-delete unique-constraint idiom (`workspace.py:217-223`). Migrations land in `db/migrations/`.
- **All frontend work** goes in `apps/web/ce/**` so the `@/plane-web/* → ./ce/*` alias (`tsconfig.json:9`) resolves it without import changes — this is the key trick that lets us self-host silo features. Replace stubs in place (`ce/components/.../teamspace-list.tsx`), add new stores to `ce/store/root.store.ts`.
- **God-mode toggles** (2FA enforcement, optional guest ratio) use `InstanceConfiguration` (`license/models/instance.py:72`) + `get_configuration_value` (`adapter/base.py:106`), never new columns.
- **Recommended sequencing:** (1) 2FA (§3, M, isolated, high security value) → (2) Customers/intake routing (§5, M–L, isolated, high product value) → (3) Teamspaces (§1, XL, phased) → (4) Custom RBAC (§2, XL, do last as its own train because of blast radius) → (5) Guest ratio (§4, S, drop-in anytime, optional).
- **Existing vs net-new summary:** *Existing/reusable:* `Team` model (orphan, `workspace.py:261`), `InstanceConfiguration` + `get_configuration_value`, auth `Adapter` funnel, `allow_permission` + DRF permission classes, intake models/views, invite view, `WorkspaceMember.role`. *Net-new:* `TeamMember`/`TeamProject`, `Role`/`Permission`/`RoleAssignment` + resolver, `UserMFA`/`MFABackupCode` + `pyotp`, `Customer`/`CustomerResponsibility` + `IntakeIssue` FKs, and all corresponding serializers/urls/stores. **No `ee/` package is created; nothing here requires the external silo.**
