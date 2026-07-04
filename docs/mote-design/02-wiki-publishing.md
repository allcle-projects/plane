# 02 — Wiki & Publishing (Paid-feature self-host design spec)

> **Status:** DESIGN ONLY — no implementation. Target: Plane CE v1.3.1 fork, branch `mote`.
> **Repo:** `/home/otro/git/plane-fork`
> **Scope:** 5 features that upstream ships only via the closed "silo" (`@/plane-web/*`) — we design self-hosted CE-fork equivalents.

## 0. Architecture ground truth (read this first)

The paid/CE split in this fork is **frontend-only**. There is **no `ee/` directory** and the backend has **no license checks**.

- **Backend is unified** under `apps/api/plane/`:
  - `app/` = authenticated internal API (session/JWT).
  - `api/` = public v1 API, `X-API-Key` auth (`apps/api/plane/api/rate_limit.py`).
  - `space/` = **anonymous** published-content API (`permission_classes = [AllowAny]`).
  - `db/models/` = shared ORM. `license/` = license bookkeeping only, not gating.
- **Frontend paid gating** = the alias `@/plane-web/* → ./ce/*` (`apps/web/ce/`). Every paid capability is a **CE stub** returning `null`/empty; the real impl lives in the silo, not the repo. To ship a feature we **replace the stub** with a working CE implementation.
- **Base model classes:** `BaseModel` (`apps/api/plane/db/models/base.py:17`), `ProjectBaseModel` (`apps/api/plane/db/models/project.py:181` — adds `project` + `workspace` FKs), `WorkspaceBaseModel` (`apps/api/plane/db/models/workspace.py:185` — adds `workspace` FK only). All carry soft-delete (`deleted_at`) + audit fields.

### Critical corrections to the brief (verified against code)

1. **`apps/space` does NOT render published pages.** The only anon routes are `apps/space/app/issues/[anchor]/page.tsx` and `apps/space/app/[workspaceSlug]/[projectId]/page.tsx`. There is **no** `pages/[anchor]` route. Full app tree: `apps/space/app/` contains only `issues/[anchor]/`, `[workspaceSlug]/[projectId]/`, plus root/assets/compat.
2. **The `space/` backend only serves `entity_name="project"`.** Every anon endpoint hard-codes `entity_name="project"` (e.g. `space/views/meta.py:21`, `space/views/project.py:23`, `space/views/issue.py:80,230`). There is **no** page or view anon serving. `space/urls/__init__.py:11` wires only `intake_urls, issue_urls, project_urls, asset_urls`.
3. **`apps/web` has NO workspace-level pages route.** Pages routes are all project-scoped: `apps/web/app/(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/pages/(list)/page.tsx` and `.../pages/(detail)/[pageId]/page.tsx`. `is_global` exists on the model but has no web route, no nav entry, no store.
4. **`DeployBoard.TYPE_CHOICES` already lists both `"page"` and `"view"`** (`db/models/deploy_board.py:20-28`) — the model is fully entity-agnostic. But `packages/types/src/publish.ts:10` only types `"project" | "page"`, and **only project publishing is wired end-to-end** (`DeployBoardViewSet`, `app/views/project/base.py:530`).

**Net:** "published pages" and "published views" are BOTH net-new in this fork (backend + space frontend), not just "views". `is_global` wiki is net-new frontend on an existing field. Page comments/shares/collections are net-new models + endpoints + frontend.

---

## Feature 1 — Page Comments

### Behavior
Threaded comments on any page (project or workspace/global). Reply nesting, emoji reactions, edit/delete, @mentions surface in the existing notification pipeline. Comments visible in the page's right rail (mirrors the issue-comment rail UX). On a **published** page (Feature 5-style), anon visitors can read comments and — if the deploy board has `is_comments_enabled` — post them, exactly as issue boards already allow (`space/views/issue.py:214 IssueCommentPublicViewSet`).

### Data model — NET-NEW
Mirror `IssueComment` (`apps/api/plane/db/models/issue.py:443`) but keyed to `Page`. Pages are workspace-scoped and can be global (no project), so subclass **`WorkspaceBaseModel`**, not `ProjectBaseModel`, and keep an optional `project` FK for permission scoping.

New file `apps/api/plane/db/models/page.py` (append), or a new `page_comment.py`:

```python
class PageComment(WorkspaceBaseModel):          # mirrors IssueComment:443
    page = models.ForeignKey("db.Page", on_delete=models.CASCADE, related_name="comments")
    comment_stripped = models.TextField(blank=True)
    comment_json = models.JSONField(blank=True, default=dict)
    comment_html = models.TextField(blank=True, default="<p></p>")
    attachments = ArrayField(models.URLField(), size=10, blank=True, default=list)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                              related_name="page_comments", null=True)
    access = models.CharField(choices=(("INTERNAL","INTERNAL"),("EXTERNAL","EXTERNAL")),
                              default="INTERNAL", max_length=100)   # EXTERNAL = anon/published
    edited_at = models.DateTimeField(null=True, blank=True)
    parent = models.ForeignKey("self", on_delete=models.CASCADE, null=True, blank=True,
                               related_name="child_comments")       # threading
    external_id = models.CharField(max_length=255, null=True, blank=True)
    external_source = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        db_table = "page_comments"
        ordering = ("created_at",)

class PageCommentReaction(WorkspaceBaseModel):   # mirrors CommentReaction:619
    comment = models.ForeignKey(PageComment, on_delete=models.CASCADE, related_name="reactions")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                              related_name="page_comment_reactions")
    reaction = models.TextField()
    class Meta:
        db_table = "page_comment_reactions"
        # unique (comment, actor, reaction, deleted_at) — copy CommentReaction:631 constraint
```

**Reactions:** yes — reuse the `reaction` = shortcode-string pattern from `CommentReaction` (`issue.py:619`). Do **not** attach reactions directly to a page in v1 (comment-only), to keep scope tight.

**Migration sketch:** single migration `page_comment` — `CreateModel(PageComment)` + `CreateModel(PageCommentReaction)` + the two partial-unique constraints. Zero changes to existing tables. Consider copying `IssueComment`'s `Description` OneToOne (`issue.py:446`) only if you want rich-text description reuse; **simpler to skip** and keep `comment_json/html` inline (the fields above already carry the content).

### Backend — NET-NEW
Internal `app/` (model after issue comment viewset pattern; add `apps/api/plane/app/views/page/comment.py`, serializer, register in `app/urls/page.py`):

| Method | Path |
|---|---|
| GET, POST | `workspaces/<slug>/pages/<page_id>/comments/` |
| GET, PATCH, DELETE | `workspaces/<slug>/pages/<page_id>/comments/<comment_id>/` |
| POST | `.../comments/<comment_id>/reactions/` |
| DELETE | `.../comments/<comment_id>/reactions/<reaction_code>/` |

> Note current page URLs are project-scoped (`app/urls/page.py:22-31`). For global pages, add the workspace-scoped variant above; for project pages either scope is fine. Permission: reuse `ProjectPagePermission` (`app/views/page/base.py:53`) when `project` set, else workspace-member check.

Public v1 `api/` (optional, `X-API-Key`): add `PageCommentListCreateAPIEndpoint` mirroring `api/views/page.py` — low priority.

Anon `space/` (only if page publishing ships, Feature 5-page): mirror `IssueCommentPublicViewSet` (`space/views/issue.py:214`) as `PageCommentPublicViewSet`, resolving `DeployBoard.objects.get(anchor=..., entity_name="page")` instead of `"project"`. New routes in a new `space/urls/page.py`:
- `anchor/<anchor>/pages/<page_id>/comments/` (GET/POST)
- `anchor/<anchor>/pages/<page_id>/comments/<pk>/` (GET/PATCH/DELETE)
- `anchor/<anchor>/page-comments/<comment_id>/reactions/` (GET/POST/DELETE)

Wire into `space/urls/__init__.py:11`.

### Frontend
- **CE stub to replace:** `apps/web/ce/components/comments/comment-block.tsx` currently renders an `IssueComment` block only (`TIssueComment`, `comment-block.tsx:12`). Generalize its prop type or add a `PageCommentBlock` in `ce/components/comments/`. Wire a comments tab into the page navigation pane — the pane scaffolding already exists: `apps/web/ce/components/pages/navigation-pane/tab-panels/root.tsx` (add a `comments` tab beside `outline`/`assets`).
- New MobX store `web/core/store/pages/page-comment.store.ts` (mirror issue-comment store) + service in `web/core/services/`.
- Routes: none new — comments render inside existing page detail route `.../pages/(detail)/[pageId]/page.tsx`.
- `apps/space` changes: only if page publishing ships — a comments panel in the (net-new) `pages/[anchor]` route (see Feature 5-page).

### Editor / `apps/live` integration
- **Inline (anchored) comments** — commenting on a text selection — require a ProseMirror mark + a decoration in `packages/editor`. **`packages/editor/src` has no existing `comment` extension** (verified: `find … -iname '*comment*'` empty). This is XL on its own. **Recommendation: v1 = document-level comment rail only** (no inline anchors), which needs zero editor/live changes. Defer inline-anchored comments to a phase 2.
- `apps/live` (hocuspocus, `apps/live/src/services/page/project-page.service.ts`) is the Yjs doc sync; comments are **relational, not CRDT** — keep them out of the Yjs document. No `apps/live` change needed for the rail.
- @mentions already exist in the page editor (`PageLog` TYPE_CHOICES has `user_mention`, `page.py:92`); reuse the mention extension's output to fan out notifications via the existing notification model.

### Effort: **L** (rail only) / **XL** (with inline-anchored comments)
### Dependencies/order: standalone. If publishing wanted, do after Feature 5-page.
### Risks: threading depth UI; anon spam on published pages (reuse issue-board rate limits); double-writing `comment_stripped` (copy `IssueComment.save()` strip logic, `issue.py:474`).
### Silo-required? **No.** Fully CE-buildable. Task-bot alternative: none needed; @mention notifications route through the existing in-app notification pipeline.

---

## Feature 2 — Workspace-level Wiki pages

### Behavior
Workspace-scoped pages not tied to any project ("company wiki"). Accessible from a top-level **Wiki** nav entry, with its own list + nested tree + detail/editor. Differs from project pages: no `project_id`, visible to all workspace members (subject to Feature 3 sharing/access), appear under the workspace sidebar rather than a project.

### Data model — EXISTING (no migration)
`Page.is_global = models.BooleanField(default=False)` **already exists** (`db/models/page.py:51`). A global page simply has `is_global=True` and **no `ProjectPage` M2M rows** (`ProjectPage`, `page.py:135`). `Page` is already workspace-FK'd (`page.py:30`) and supports nesting via `parent` (`page.py:40`) and versions via `PageVersion` (`page.py:158`). **Nothing to migrate.**

### Backend — MOSTLY EXISTING, small NET-NEW
Current page endpoints are project-scoped only (`app/urls/page.py:22`, all under `.../projects/<project_id>/pages/...`) and `PageViewSet.get_queryset` (`app/views/page/base.py:81`) filters by project. Add workspace-scoped, project-less variants:

| Method | Path (NET-NEW) |
|---|---|
| GET, POST | `workspaces/<slug>/pages/` (filter `is_global=True`) |
| GET, PATCH, DELETE | `workspaces/<slug>/pages/<page_id>/` |
| POST/DELETE | `workspaces/<slug>/pages/<page_id>/{archive,lock,access}/` |
| GET/PATCH | `workspaces/<slug>/pages/<page_id>/description/` (Yjs binary; reuse `PagesDescriptionViewSet`, `page/base.py:498`) |
| GET | `workspaces/<slug>/pages/<page_id>/versions/` |

Implementation: parametrize the existing `PageViewSet` to branch on presence of `project_id` (global path sets `is_global=True`, skips `ProjectPage` creation, uses workspace-member permission instead of `ProjectPagePermission`). Reuse all existing bgtasks (`page_transaction`, `track_page_version`, `page/base.py:52-54`).

`apps/live` already resolves pages generically via `project-page.service.ts`; add a `workspace-page.service.ts` variant (or generalize) so the collaborative editor loads global-page binaries.

### Frontend — NET-NEW routes + nav
- **Nav entry:** add a `wiki` item to `WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS_LINKS` in `packages/constants/src/workspace.ts` (siblings: `views` at `:203`, `stickies` at `:254`). It renders via `SidebarMenuItems` (`apps/web/core/components/workspace/sidebar/sidebar-menu-items.tsx:12-16`, which reads those constants).
- **Routes (NET-NEW):** under `apps/web/app/(all)/[workspaceSlug]/(projects)/`:
  - `wiki/(list)/page.tsx` — global-pages list + tree.
  - `wiki/(detail)/[pageId]/page.tsx` — editor detail.
  Reuse the project-pages components wholesale (`apps/web/core/components/pages/...`); they are largely project-agnostic once the store supplies the right service.
- **Store:** new `workspace-page.store.ts` mirroring the project page store, pointed at the workspace-scoped endpoints. The CE page-store extension point already exists: `apps/web/ce/store/pages/extended-base-page.ts` (currently a no-op `ExtendedBasePage`) — extend here.
- `ce/` stubs touched: `ce/components/pages/*` (share/move/lock header controls already stubbed — see Feature 3); `ce/store/pages/extended-base-page.ts`.

### Effort: **M** (backend param + route/store reuse; the heavy page/editor components already exist)
### Dependencies/order: **do first** — it establishes the workspace-scoped page plumbing that Features 1/3/4/5-page all build on.
### Risks: permission model for global pages (no `ProjectMember` to lean on — must add workspace-member checks); `PageViewSet.get_queryset` project assumptions (`page/base.py:81`); nav i18n keys.
### Silo-required? **No.** Pure CE. No webhook/task-bot involvement.

---

## Feature 3 — Shared Pages (share with specific users)

### Behavior
Beyond the binary `access` (Public=0 / Private=1, `page.py:37`): grant named users (and later, roles) explicit view/edit access to a private page. Owner sees a "Share" dialog listing collaborators + permission level. Shared users see the page in their wiki/list even though it's Private.

### Data model — NET-NEW
```python
class PageCollaborator(WorkspaceBaseModel):
    page = models.ForeignKey("db.Page", on_delete=models.CASCADE, related_name="collaborators")
    member = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                               related_name="shared_pages")
    role = models.PositiveSmallIntegerField(               # reuse ROLE ints from app/permissions
        choices=((5,"VIEWER"),(15,"MEMBER"),(20,"ADMIN")), default=5)
    class Meta:
        db_table = "page_collaborators"
        constraints = [models.UniqueConstraint(
            fields=["page","member"], condition=models.Q(deleted_at__isnull=True),
            name="page_collaborator_unique_page_member_when_deleted_at_null")]
```
Mirror the partial-unique-on-soft-delete idiom used throughout (`ProjectPage`, `page.py:142`; `DeployBoard`, `deploy_board.py:47`). **Migration:** single `CreateModel`. No existing-table change. `role` ints deliberately match the `ROLE` enum referenced by `allow_permission`/`ROLE` (`app/views/page/base.py:33`) so the permission layer can compare directly.

Access-resolution rule (queryset): a user may see page P if `P.access==PUBLIC` **OR** `P.owned_by==user` **OR** `PageCollaborator(page=P, member=user)` exists. Edit if collaborator `role>=MEMBER` or owner.

### Backend — NET-NEW
Internal `app/`:
| Method | Path |
|---|---|
| GET, POST | `workspaces/<slug>/pages/<page_id>/collaborators/` |
| PATCH, DELETE | `workspaces/<slug>/pages/<page_id>/collaborators/<member_id>/` |

Update `PageViewSet.get_queryset` (`app/views/page/base.py:81`) to OR-in collaborator visibility. Update the lock/access endpoints (`app/urls/page.py:45-55`) to respect collaborator roles.
Public v1: optional GET-only collaborators list. Anon `space/`: N/A (sharing is authenticated-only).

### Frontend
- **CE stub to replace:** `apps/web/ce/components/pages/header/share-control.tsx` (`PageShareControl` returns `null`, line 16) and `apps/web/ce/components/pages/header/collaborators-list.tsx` (`PageCollaboratorsList` returns `null`, line 14). Implement the share modal + avatar stack here.
- **Store:** extend `ce/store/pages/extended-base-page.ts` (`ExtendedBasePage`, currently `asJSONExtended` returns `{}`) to carry `collaborators` + share actions; this is exactly the silo extension point.
- Routes: none new — lives in existing page detail header.
- `apps/space`: N/A.
- `apps/live`: editor already enforces read-only via `is_locked` (`page.py:48`); collaborator edit-permission is enforced server-side on the description PATCH — the live server should check collaborator role before accepting Yjs updates (guard in `apps/live/src/services/page/*`).

### Effort: **M**
### Dependencies/order: after **Feature 2** (shares apply to both project & wiki pages; needs the workspace-page plumbing + `ExtendedBasePage`).
### Risks: `apps/live` write-authorization is the tricky part (Yjs updates bypass the REST permission layer — must gate at the hocuspocus `onAuthenticate`/`beforeHandleMessage`); cascading share when a `parent` page is shared (decide: inherit vs explicit — recommend explicit-only in v1).
### Silo-required? **No.** CE-buildable. No task-bot need.

---

## Feature 4 — Collections (page collections / folders)

### Behavior
User- or workspace-owned named "collections" that group arbitrary pages (a page can live in multiple collections) — like folders/favorites-with-structure, independent of the `parent` nesting tree. Shown as an expandable section in the wiki sidebar.

### Data model — NET-NEW
```python
class PageCollection(WorkspaceBaseModel):
    name = models.CharField(max_length=255)
    owned_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                 related_name="page_collections")
    logo_props = models.JSONField(default=dict)     # match Page.logo_props (page.py:50)
    sort_order = models.FloatField(default=65535)   # match Page.DEFAULT_SORT_ORDER (page.py:26)
    is_shared = models.BooleanField(default=False)  # personal vs workspace-visible
    class Meta:
        db_table = "page_collections"

class PageCollectionItem(WorkspaceBaseModel):        # M2M through, mirrors ProjectPage (page.py:135)
    collection = models.ForeignKey(PageCollection, on_delete=models.CASCADE, related_name="items")
    page = models.ForeignKey("db.Page", on_delete=models.CASCADE, related_name="collection_items")
    sort_order = models.FloatField(default=65535)
    class Meta:
        db_table = "page_collection_items"
        constraints = [models.UniqueConstraint(
            fields=["collection","page"], condition=models.Q(deleted_at__isnull=True),
            name="page_collection_item_unique_when_deleted_at_null")]
```
**Migration:** two `CreateModel`s. Pattern-identical to the existing `Page ↔ Project` through-model `ProjectPage` (`page.py:135-155`).

### Backend — NET-NEW
| Method | Path |
|---|---|
| GET, POST | `workspaces/<slug>/page-collections/` |
| GET, PATCH, DELETE | `workspaces/<slug>/page-collections/<collection_id>/` |
| POST | `workspaces/<slug>/page-collections/<collection_id>/pages/` (add page(s)) |
| DELETE | `workspaces/<slug>/page-collections/<collection_id>/pages/<page_id>/` |

New viewset `PageCollectionViewSet` in `app/views/page/collection.py`. Public v1: optional CRUD mirror in `api/`. Anon `space/`: N/A.

### Frontend
- **New nav section** under the Wiki entry (Feature 2): a collapsible "Collections" disclosure in the wiki sidebar (reuse the `Disclosure`/`Transition` pattern already in `sidebar-menu-items.tsx:10`).
- New store `page-collection.store.ts`; drag-a-page-into-collection interaction.
- No `ce/` stub exists for collections (net-new component tree under `web/core/components/pages/collections/`). Nothing to "replace" — pure addition.
- Routes: optional `wiki/collections/[collectionId]/page.tsx`, or render inline in the wiki list. `apps/space` / `apps/live`: N/A.

### Effort: **M**
### Dependencies/order: after **Feature 2** (needs the wiki surface to hang collections off; degrades gracefully to project-pages sidebar if shipped alone).
### Risks: personal-vs-shared visibility rules; sort_order rebalancing on reorder (reuse the float-gap `sort_order` scheme already on `Page`, `page.py:55`).
### Silo-required? **No.** CE-buildable. No task-bot.

---

## Feature 5 — Publish Views (+ the missing published-Page path)

> This is the most involved feature because in this fork **neither published pages nor published views are wired** in `space/` backend or `apps/space` frontend (only published **projects/issue-boards** are). Below covers **View** publishing as asked, and flags the shared "publish a non-project entity" plumbing that Page publishing (Feature 1's anon path) also needs.

### Behavior
Publish a project **View** (a saved issues filter/layout, `db/models/view.py`) to a public anchor URL. Anon visitors see the view's issues rendered read-only in `apps/space`, with the same optional comments/reactions/votes toggles the project board already supports.

### Data model — EXISTING (no migration)
`DeployBoard` is already entity-agnostic and **already enumerates `("view","View")`** (`db/models/deploy_board.py:24`). `entity_identifier` + `entity_name` + unique `anchor` (`deploy_board.py:30-32`) already model this. **Zero migration.** The `view_props` JSON field (`deploy_board.py:37`) already carries which layouts are enabled (list/kanban/etc.), matching the `views` dict written in `DeployBoardViewSet.create` (`app/views/project/base.py:552-566`).

### Types — SMALL NET-NEW (frontend)
`packages/types/src/publish.ts:10` currently:
```ts
export type TPublishEntityType = "project" | "page";   // ← add "view"
```
Change to `"project" | "page" | "view"`. `TPublishSettings` (`publish.ts:24`) is reusable as-is; add a `TViewPublishSettings = TPublishSettings & { view_props: TProjectPublishViewProps }` alias (parallel to `TProjectPublishSettings`, `publish.ts:43`).

### Backend
**Internal `app/` (NET-NEW, small):** the existing `DeployBoardViewSet` (`app/views/project/base.py:530`) hard-codes `entity_name="project"` in both `list` (`:536`) and `create` (`:559`). Generalize (or add a `ViewDeployBoardViewSet`) to accept `entity_name="view"` + `entity_identifier=view_id`. New routes mirroring `app/urls/project.py:113-120`:
| Method | Path |
|---|---|
| GET, POST | `workspaces/<slug>/projects/<project_id>/views/<view_id>/view-deploy-boards/` |
| GET, PATCH, DELETE | `.../views/<view_id>/view-deploy-boards/<pk>/` |

**Anon `space/` (NET-NEW, the bulk):** every anon endpoint currently filters `entity_name="project"` (`space/views/meta.py:21`, `space/views/project.py:23,32,59`, `space/views/issue.py:80,230,258,297,321,367,...`). For views you need anchor→view resolution + an issues-under-view public feed:
- New `space/views/view.py`:
  - `ViewMetaDataEndpoint` (mirror `ProjectMetaDataEndpoint`, `meta.py:16`) resolving `DeployBoard.get(anchor=…, entity_name="view")` → view + project.
  - `ViewDeployBoardPublicSettingsEndpoint` (mirror `space/views/project.py:19`).
  - `ViewIssuesPublicEndpoint` (mirror `ProjectIssuesPublicEndpoint`, `space/views/issue.py:73`) — **but apply the view's saved filters** (`View.filters`/`View.query_data` from `db/models/view.py`) to the anon issue queryset so only the view's issues are returned.
- Reuse the existing anon comment/reaction/vote viewsets (`space/views/issue.py:214,342,430,522`) — but they resolve `entity_name="project"` (`issue.py:230` etc.). Generalize them to accept the deploy board regardless of entity, or add view-scoped variants.
- New `space/urls/view.py` (mirror `space/urls/issue.py`): `anchor/<anchor>/`, `anchor/<anchor>/issues/…`, plus comment/reaction/vote routes. Wire into `space/urls/__init__.py:11`.

### Frontend
- **CE stub to replace:** `apps/web/ce/components/views/publish/use-view-publish.tsx` — currently returns a dead hook (`isPublishModalOpen:false`, `setPublishModalOpen` no-op, `publishContextMenu:undefined`). Implement the real publish modal + toggles, calling the new `view-deploy-boards` endpoint. Reuse the project publish-modal component as the template.
- **`apps/space` (NET-NEW route):** add `apps/space/app/views/[anchor]/page.tsx` (+ `layout.tsx`), mirroring `apps/space/app/issues/[anchor]/page.tsx`. It fetches the view meta + issues from the new anon endpoints and renders the **issues/spatial** layouts. **Reuse the issue-board rendering** already in the space app (the `issues/[anchor]` route renders kanban/list/etc.) — a published view is "an issue board pre-filtered by the view's filters," so the rendering component is shared; only the data source (view-filtered feed) differs. Register the route in `apps/space/app/routes.ts`.
- **Published-Page path (for Feature 1 anon + `is_global` publish):** apps/space has **no** `pages/[anchor]` route and space backend has **no** page-anon serving. To publish a page you must additionally add `apps/space/app/pages/[anchor]/page.tsx` rendering the page's `description_html`, plus a `space/views/page.py` (anon page fetch by anchor) + `space/urls/page.py`. This reuses the same `DeployBoard(entity_name="page")` plumbing generalized above. Treat as a sibling deliverable.
- `apps/live`: published/anon rendering is static HTML (`description_html`), **not** collaborative — no live server involvement for the anon reader.

### Effort: **L** (view publish) — **XL** if bundling the published-page render path too.
### Dependencies/order: generalize `DeployBoardViewSet` + the anon viewsets **once**, shared by view-publish and page-publish. Do the backend generalization first, then the two `apps/space` routes.
### Risks:
- The anon viewsets' hard-coded `entity_name="project"` (`space/views/issue.py`, ~15 call sites) is the main refactor surface — easy to miss one; grep `entity_name="project"` and audit each.
- View filters must be applied server-side on the anon feed (never trust client) — the anon endpoint must re-derive issues from `View.filters`.
- `apps/space` is a React-Router-in-Next shim (`apps/space/app/compat/next/`, `routes.ts`) — new routes must be registered in `routes.ts`, not just filesystem-added.
### Silo-required? **No** — CE-buildable end to end. **Webhook/task-bot alternative:** none needed; publishing is synchronous. (If you wanted "notify on publish," fire the existing webhook model — `db/models/webhook.py` — on DeployBoard create, but that's optional polish.)

---

## Consolidated build order & sizing

| # | Feature | New models | Migration | Effort | Depends on |
|---|---------|-----------|-----------|--------|------------|
| 2 | Workspace Wiki pages | none (`is_global` exists) | none | **M** | — (**do first**) |
| 1 | Page Comments (rail) | PageComment, PageCommentReaction | 1 | **L** | 2 (for global pages) |
| 3 | Shared Pages | PageCollaborator | 1 | **M** | 2 |
| 4 | Collections | PageCollection, PageCollectionItem | 1 | **M** | 2 |
| 5 | Publish Views | none (`DeployBoard` exists) | none | **L** (XL w/ page publish) | shared anon refactor |

**Silo-required: none.** All five are buildable entirely in the CE fork by (a) adding models/migrations, (b) generalizing the existing project-scoped viewsets to be entity/workspace-scoped, and (c) replacing the `apps/web/ce/**` stubs (`share-control.tsx`, `collaborators-list.tsx`, `use-view-publish.tsx`, `extended-base-page.ts`, `comment-block.tsx`) plus adding net-new routes in `apps/web` and `apps/space`.

**Biggest single refactor** shared across Features 1(anon)/5: removing the hard-coded `entity_name="project"` assumption across `apps/api/plane/space/views/*.py` and the `DeployBoardViewSet` (`app/views/project/base.py:530`). Do it once, cleanly, with an audit of every `entity_name="project"` occurrence.

**Editor caveat:** inline-anchored comments (Feature 1 phase 2) are the only item requiring net-new `packages/editor` + `apps/live` work and should be scoped separately (XL). The document-level comment rail needs none.
