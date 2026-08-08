# Access Control — Operational Guide

**Status**: Production (as of 2026-05-03, post-v3.6.0)
**Source**: `src/context/WikiContext.ts`, `src/parsers/context/ParseContext.ts`, `src/context/ApiContext.ts`, `src/managers/UserManager.ts`, `src/managers/ACLManager.ts`, `src/managers/PolicyEvaluator.ts`
**Related**: [policy-based-access-control-design.md](../design/policy-based-access-control-design.md) | [WikiContext-Complete-Guide.md](../WikiContext-Complete-Guide.md) | [MANAGERS-OVERVIEW.md](./MANAGERS-OVERVIEW.md)

How to do permission and role checks in ngdpbase code. One canonical method per question; no inline `userContext.roles.includes('admin')` or `userContext.isAdmin` reads.

---

## TL;DR — which method should I use?

| Question | Method | Backed by | Async? |
|---|---|---|---|
| Does the user carry a role? | `wikiContext.hasRole(...names)` | `userContext.roles` array check | sync |
| Is the user globally allowed to do action X? | `wikiContext.hasPermission(action)` | `UserManager.hasPermission` → `PolicyEvaluator` | async |
| Is the user allowed to do action X **on this page**? | `wikiContext.canAccess(action)` | `ACLManager.checkPagePermissionWithContext` (3-tier) | async |
| What principals match this user for audience filters? | `wikiContext.getPrincipals()` | `[...roles, username]` | sync |
| Hot-path role check, no WikiContext available? | `WikiContext.userHasRole(userContext, ...names)` | static helper | sync |

In `ParseContext` (parser-pipeline plugins), the same four methods exist with the same shapes. In `ApiContext` (`/api/*` routes), `hasRole` / `requireRole` (sync) and `hasPermission` / `requirePermission` (async).

---

## The three contexts

ngdpbase has three context types, each with the same access-check API surface:

### `WikiContext` — request-scoped, page rendering

`src/context/WikiContext.ts`. Built by `WikiRoutes.createWikiContext(req, options)`. Holds engine, request, response, page name, page metadata, and userContext. **Lazy theme resolution** — calling `wikiContext.hasRole(...)` or `wikiContext.hasPermission(...)` does not trigger ConfigurationManager.getProperty for theme; that only fires when `wikiContext.activeTheme` or `wikiContext.themeInfo` is read for template rendering.

```ts
const wikiContext = this.createWikiContext(req);
if (!wikiContext.hasRole('admin')) return res.status(403).send('...');
if (!(await wikiContext.hasPermission('admin-system'))) return res.status(403).send('...');
if (!(await wikiContext.canAccess('edit'))) return res.status(403).send('...');
const principals = wikiContext.getPrincipals();
```

### `ParseContext` — parser-pipeline-scoped

`src/parsers/context/ParseContext.ts`. Created by `MarkupParser` from a serialized `WikiContext.toParseOptions()` snapshot. Carries pageName, originalContent, userContext, pageMetadata, and a live engine reference. Used by plugins (`CommentsPlugin`, `FootnotesPlugin`, `ConfigAccessorPlugin`) and the `${userroles}` variable.

```ts
// Inside a plugin's execute(context: PluginContext, params: PluginParams)
if (!context.hasRole('admin')) return '';
if (!(await context.hasPermission('comment-create'))) return '';
if (!(await context.canAccess('edit'))) return '';
```

### `ApiContext` — `/api/*` route-scoped

`src/context/ApiContext.ts`. Built by `ApiContext.from(req, engine)`. Slimmer shape than WikiContext — just the user fields + engine + `requireAuthenticated` / `requireRole` / `requirePermission` guards that throw `ApiError(401|403)` for clean JSON-error handling.

```ts
const ctx = ApiContext.from(req, engine);
ctx.requireAuthenticated();              // throws ApiError(401) if not
ctx.requireRole('admin', 'editor');      // sync — throws ApiError(403) if neither
await ctx.requirePermission('user-edit'); // async — throws ApiError(403) if denied
```

---

## The four methods

### 1. `hasRole(...names)` — sync, pure roles array check

Returns `true` if `userContext.roles` contains any of the given role names. Does **not** consult PolicyEvaluator. Use for cheap role-name gates where the policy system isn't needed.

```ts
if (wikiContext.hasRole('admin')) { ... }
if (wikiContext.hasRole('admin', 'editor', 'contributor')) { ... }   // multi-role OR
```

**On `ApiContext`**: same shape, sync.

**Static variant** for hot paths without a context (maintenance middleware, `/metrics`):

```ts
import WikiContext from '../context/WikiContext.js';
if (WikiContext.userHasRole(req.userContext, 'admin')) { ... }
```

### 2. `hasPermission(action)` — async, global PolicyEvaluator path

Returns `true` if the user is globally allowed to perform `action`. Delegates to `UserManager.hasPermission(username, action)` which evaluates through `PolicyEvaluator.evaluateAccess({pageName: '*', action, userContext})`.

Honors:

- Anonymous role expansion (`['anonymous', 'All']`)
- Authenticated role expansion (`['Authenticated', 'All']` appended)
- Inactive-user check (rejects users with `isActive: false`)
- Policy priority order (deny policies win when they have higher priority)
- `'All'` role semantics (matches everyone, including anonymous)

```ts
if (!(await wikiContext.hasPermission('admin-system'))) return res.status(403)...;
if (!(await wikiContext.hasPermission('user-edit')))  return res.status(403)...;
```

**On `ApiContext`**: `await ctx.hasPermission(action)`. Both `ApiContext` and `ParseContext` `hasPermission` go through the same canonical UserManager path post-v3.6.0 (`#625`, `#630`, `#633`).

### 3. `canAccess(action)` — async, page-resource-aware 3-tier evaluator

Returns `true` if the user is allowed to perform `action` **on the current page**. Delegates to `ACLManager.checkPagePermissionWithContext(wikiContext, action)`.

The 3-tier evaluator runs in order; the first tier that decides wins:

| Tier | Source | What it checks |
|---|---|---|
| 0 | Page front matter `user-keywords: [private]` | Hard constraint — only the page creator and admins can pass. Non-overridable by other tiers. |
| 1 | Page front matter `audience: [...]` / `access: ...` | Per-page allowlist. If declared and the user matches, allow; if declared and the user doesn't match, deny. |
| 2 | Global policies via `PolicyEvaluator` | Evaluates `{pageName, action, userContext}` against the policy file (priority-ordered, with `effect: allow|deny`). |

```ts
if (!(await wikiContext.canAccess('edit'))) return res.status(403)...;
if (!(await wikiContext.canAccess('view'))) return res.status(403)...;
```

`canAccess('view')` is the canonical "can the user read this page?" gate. Action-name mapping inside ACLManager: `view` → `page-read`, `edit` → `page-edit`, `delete` → `page-delete`, `create` → `page-create`, `rename` → `page-rename`, `upload` → `asset-upload`.

**On `ParseContext`**: synthesizes a minimal WikiContext-shaped object from `pageName + originalContent + userContext + pageMetadata` and delegates to ACLManager. **Not on `ApiContext`** — page-resource-aware checks belong to wiki-page rendering, not to API-route scope.

### 4. `getPrincipals()` — sync, audience-filter principals

Returns `[...roles, username]` if authenticated, `[...roles]` if not. Used by search providers to filter results without invoking the full ACL evaluator per-result.

```ts
const principals = wikiContext.getPrincipals();
// e.g. ['editor', 'reader', 'alice']
const visible = pages.filter(p => !p.isPrivate || p.audience.some(a => principals.includes(a)));
```

Search providers receive a duck-typed `SearchWikiContext` (defined in `src/providers/BaseSearchProvider.ts`) that exposes `hasRole?(...names)` and `getPrincipals?()` as optional methods, so providers can call them without a full WikiContext available.

---

## Two evaluation engines

### `UserManager.hasPermission(username, action)` — global

Used by `wikiContext.hasPermission()`, `apiContext.hasPermission()`, `parseContext.hasPermission()`. Internally:

1. Resolves the userContext from the username:
   - `null` / `'anonymous'` → `{ roles: ['anonymous', 'All'], isAuthenticated: false }`
   - `'asserted'` (session expired but cookie present) → `{ roles: ['reader', 'All'], isAuthenticated: false }`
   - authenticated → `{ roles: [...resolveUserRoles(username), 'Authenticated', 'All'], isAuthenticated: true }`
2. Rejects users whose record has `isActive: false`.
3. Calls `PolicyEvaluator.evaluateAccess({ pageName: '*', action, userContext })`.

The `pageName: '*'` argument means the evaluator skips per-page resource matching — this is for "can this user do action X anywhere?" gates.

### `ACLManager.checkPagePermissionWithContext(wikiContext, action)` — per-page

Used by `wikiContext.canAccess()`, `parseContext.canAccess()`, and route handlers that need per-page checks. Runs the 3-tier evaluator described above. The ParseContext path synthesizes a minimal context shape; in tier-2 it falls through to `PolicyEvaluator` with the actual page name, getting glob-pattern resource matching for free.

### `PolicyEvaluator.evaluateAccess({ pageName, action, userContext })` — bottom

Iterates registered policies in priority order. Each policy has `subjects` (roles), `resources` (page-name globs), `actions`, and `effect: 'allow' | 'deny'`. The first policy whose `subjects` + `resources` + `actions` all match decides. If no policy matches, default deny.

You should **not** call `PolicyEvaluator.evaluateAccess` directly from application code — go through `UserManager` (for global) or `ACLManager` (for per-page) so the canonical role-expansion / 3-tier logic runs.

---

## ESLint guard against reintroduction

`eslint.config.mjs` has a `no-restricted-syntax` rule (post-v3.6.0) with three AST selectors:

| Pattern | Migration |
|---|---|
| `*.isAdmin` member access (any object) | Use `wikiContext.hasRole('admin')` / `parseContext.hasRole('admin')` / `WikiContext.userHasRole(userContext, 'admin')`. The `.isAdmin` field was never set by session middleware and is broken. |
| `*.roles.includes(...)` call expression | Use `hasRole(...names)`. |
| `*.roles?.includes(...)` (optional chaining variant) | Same — use `hasRole(...names)`. |

**Disabled in test files** (legitimate use in mock fixtures). Two production-side `eslint-disable-next-line` annotations:

- `src/context/ApiContext.ts:hasRole` — canonical implementation reads `this.roles.includes(...)` internally
- `src/routes/WikiRoutes.ts:adminUpdateUser` — form-data validation (`updates.roles.includes('admin')`), not a permission check on the caller

If the rule fires on new code, the violation message points to the canonical migration target.

---

## Common patterns

### Admin gate (route handler)

```ts
const wikiContext = this.createWikiContext(req);
if (!(await wikiContext.hasPermission('admin-system'))) {
  return await this.renderError(req, res, 403, 'Access Denied', '...');
}
```

### Multi-role gate (admin OR editor OR contributor)

```ts
const wikiContext = this.createWikiContext(req);
if (!wikiContext.hasRole('admin', 'editor', 'contributor')) {
  return res.status(403).json({ success: false, error: 'Access denied' });
}
```

### Per-page edit gate (resource-aware)

```ts
const wikiContext = this.createWikiContext(req, { pageName });
if (!(await wikiContext.canAccess('edit'))) {
  return await this.renderError(req, res, 403, 'Access Denied', '...');
}
```

### Hot-path middleware (no WikiContext construction)

```ts
import WikiContext from './context/WikiContext.js';

app.use((req, res, next) => {
  const isAdmin = WikiContext.userHasRole(req.userContext, 'admin');
  if (allowAdmins && isAdmin) { next(); return; }
  res.status(503).render('maintenance', { ..., isAdmin });
});
```

### Plugin (parser-pipeline)

```ts
import WikiContext from '../context/WikiContext.js';

async function execute(context: PluginContext, params: PluginParams): Promise<string> {
  const userContext = context.userContext;
  const isAdmin = WikiContext.userHasRole(userContext, 'admin');
  // or for ParseContext-typed callers:
  // const isAdmin = parseContext.hasRole('admin');
  return renderHtml(items, isAdmin);
}
```

### API route guards (throw on deny)

```ts
async apiUsersSearch(req: Request, res: Response): Promise<void> {
  try {
    const ctx = ApiContext.from(req, this.engine);
    ctx.requireAuthenticated();              // throws ApiError(401) if anonymous
    await ctx.requirePermission('search-user'); // throws ApiError(403) if denied
    // ... handler body
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
    return res.status(500).json({ error: 'Internal' });
  }
}
```

### Search-provider audience filter

```ts
private _buildPrivacyFilter(wikiContext?: SearchOptions['wikiContext']): {...} {
  const principals = wikiContext?.getPrincipals?.() ?? [];
  return { isPrivate: principals.length > 0, audience: principals };
}
```

---

## Anti-patterns (lint-flagged)

```ts
// ❌ Always broken — .isAdmin was never set by session middleware
if (req.userContext?.isAdmin) { ... }

// ❌ Inline role-name check — use hasRole
if (currentUser.roles?.includes('admin')) { ... }

// ❌ Threading username through userManager.hasPermission instead of context
if (await userManager.hasPermission(currentUser.username, 'admin-system')) { ... }

// ❌ Direct PolicyEvaluator call — skips UserManager's role expansion
await policyEvaluator.evaluateAccess({ pageName: '*', action, userContext });
```

Use:

```ts
// ✅
if (wikiContext.hasRole('admin')) { ... }
if (await wikiContext.hasPermission('admin-system')) { ... }
if (await wikiContext.canAccess('edit')) { ... }
```

---

## Permissions catalog

Defined in `config/app-default-config.json` under `ngdpbase.permissions` and `ngdpbase.roles.definitions`. Common ones:

| Permission | Granted to | Used by |
|---|---|---|
| `page-read` | (most roles) | view pages |
| `page-edit` | editor, contributor, admin | edit existing pages |
| `page-create` | editor, admin | create new pages |
| `page-delete` | admin | delete pages |
| `comment-create` | Authenticated | post comments |
| `user-read` | admin, user-admin | list / view users |
| `user-edit` | admin, user-admin | edit user records |
| `user-create` | admin | create new users |
| `user-delete` | admin | delete users |
| `admin-read` | admin, demo-admin | **view** admin screens — read-only (#1029) |
| `admin-system` | admin | admin gates (`/admin/*`) — view **and** change |
| `admin-roles` | admin | role management |
| `asset-upload` | editor, contributor, admin | upload media/attachments |
| `search-user` | admin, user-admin | search users via API |

To add a permission:

1. Define it under `ngdpbase.permissions.definitions.<name>` in `app-default-config.json`.
2. Grant it to roles via `ngdpbase.roles.definitions.<role>.permissions`. **This is display only** — `ConfigAccessorPlugin` renders the role × permission matrix from it. It grants nothing.
3. **Add the action to a policy under `ngdpbase.access.policies`.** This is what actually enforces. `PolicyEvaluator.evaluateAccess()` reads the policies, *not* the inline arrays from step 2 — so a permission added only there is displayed and never granted, and one added only here is granted but invisible on the Roles page. Steps 2 and 3 must move together; the config file calls this display-vs-enforcement drift.
4. Reference it via `wikiContext.hasPermission('<name>')` or `wikiContext.canAccess('<page-action>')`.

> Worked example: `admin-read` (#1029) needed all three — the catalogue entry, the `admin` role's matrix entry, and `admin-full-access.actions`.

---

## Performance characteristics

Access-control checks are cheap enough that you don't need to memoize them per-request. The expensive parts are paid once at startup, not per request.

### Where the data lives

Page metadata and content are served from **in-memory caches**, not fresh disk reads:

| Read | Backing store | Disk hit per call? |
|---|---|---|
| `pageManager.getPageMetadata(name)` | `pageCache` (Map, in-memory) via `resolvePageInfo()` | **No** — pure Map lookup, wrapped in `Promise.resolve()` for the async signature |
| `pageManager.getPage(name)` | `pageCache` for metadata + `contentCache` for content | Usually no. One-off `fs.readFile` if the page wasn't in `contentCache` at init time, cached after |
| `pageManager.getPageContent(name)` | Same as `getPage` (content half) | Same — usually cache-hit, one-off fallback |
| `wikiContext.pageMetadata` | Set by the route handler via `getPageMetadata()` and threaded through `WikiContextOptions` | No — already resolved by the time WikiContext sees it |

These caches (`src/providers/FileSystemProvider.ts`) are populated during `provider.initialize()` at server startup and kept current via write-path invalidation (`savePage` / `deletePage` / `renamePage` update both the in-memory cache and the on-disk `data/page-index.json`). They reflect current page state — they don't go stale relative to disk.

`VersioningFileProvider` adds its own `pageIndex: PageIndex` (a structured metadata index, serialized to `data/page-index.json`) loaded once at init and mutated in memory. **Don't reach into `pageIndex` directly from application code** — it's an implementation detail of one provider; route handlers should go through `pageManager.getPage*` so a different provider (e.g. database-backed) works without changes.

### Per-request cost breakdown

For a typical `wikiContext.canAccess('view')` call:

1. **Route handler** loads page metadata via `pageManager.getPageMetadata(pageName)` → in-memory Map hit, no disk I/O. Sets `wikiContext.pageMetadata`.
2. **`canAccess('view')`** delegates to `ACLManager.checkPagePermissionWithContext(this, 'view')`:
   - **Tier 0** (private user-keyword): reads `wikiContext.pageMetadata?.['user-keywords']` — already in memory.
   - **Tier 1** (frontmatter audience/access): reads `wikiContext.pageMetadata?.audience` etc. — already in memory.
   - **Tier 2** (PolicyEvaluator): iterates registered policies (in-memory list) and runs glob matches. No I/O.
3. Returns `boolean`. Total cost: a few Map lookups + a small array iteration. **Sub-millisecond on warm caches.**

For `wikiContext.hasPermission('admin-system')`:

1. Delegates to `userManager.hasPermission(username, action)`.
2. UserManager builds a userContext (anonymous expansion / authenticated role lookup — the latter calls `provider.getUser(username)` which hits the user provider's in-memory cache).
3. Calls `PolicyEvaluator.evaluateAccess({pageName: '*', action, userContext})` — same in-memory policy iteration.

For `wikiContext.hasRole('admin')` / `WikiContext.userHasRole(...)`:

- Pure `Set` over `userContext.roles`. **No I/O, no async.** Sub-microsecond.

### When to think about cost

You generally **don't** need to cache the result of `canAccess` per request. The 3-tier evaluation reads in-memory state and is fast.

You *might* want to think about cost if:

- **Search-result filtering**: don't call `canAccess(action)` per result — that's why `getPrincipals()` exists. Search providers compare audience fields against the principals list at query-build time, not per result. See [LunrSearchProvider / ElasticsearchSearchProvider](#search-provider-audience-filter).
- **Bulk page operations** (admin reindex, batch export): if you're iterating thousands of pages, prefer the cheaper `pageManager.getPageMetadata` over `pageManager.getPage` (which can fall back to disk for cold-cache pages).
- **Hot-path middleware** (maintenance gate, `/metrics`): use `WikiContext.userHasRole(req.userContext, 'admin')` instead of constructing a full WikiContext. The static helper avoids the manager-reference resolution at construction time.

### Disk I/O on the access path

Disk I/O happens (rarely) on:

1. **Server startup** — provider scans pages directory, populates caches, loads `page-index.json`.
2. **Page writes** — save/delete/rename update both in-memory caches and the on-disk index.
3. **Content read for a cold-cache page** — one `fs.readFile` per page, then cached. Affects `getPage` / `getPageContent` only; `getPageMetadata` never falls through to disk.
4. **Configuration reload** — admin saves a config change; PolicyManager / ConfigurationManager re-read.

Per-request HTTP traffic on a steady-state server typically does **zero or one** disk reads (zero if everything's in cache; one if a content fallback fires).

---

## Sibling issues / known gaps

The following remain open as separately-tracked follow-ups (none block typical access-control work):

- **#622** — vitest cold-start race; band-aided with `testTimeout: 30000`, `pool: 'forks'`, `maxWorkers: 4`.
- **#626** — `LunrSearchProvider` ignores frontmatter `audience` (drift from ES which evaluates it correctly). Lunr uses an admin-OR-creator rule only.
- **#627 / #628** — Neither Lunr nor ES evaluates `AuthorLocked` for search visibility. Open design call: should AuthorLocked hide pages from search, or remain edit-only?
- **#629** — `ParseContext` still copies user/page-data fields from `WikiContext.toParseOptions()` snapshot. Refactor to hold a `wikiContext` reference would let the access methods live on `WikiContext` only.
- **#631** — Service / non-request principals (`WikiContext.system()` / `WikiContext.forUser(username)` factories for background jobs and schedulers).
- **#632** — Three remaining callers of the deprecated 4-arg `aclManager.checkPagePermission(pageName, action, userContext, content)` (`LeftMenu`, `Footer`, `adminDashboard`). Should migrate to `checkPagePermissionWithContext` and the deprecated method should be deleted.

---

## See also

- [WikiContext-Complete-Guide.md](../WikiContext-Complete-Guide.md) — full WikiContext API + lifecycle
- [policy-based-access-control-design.md](../design/policy-based-access-control-design.md) — JSON policy schema design (Issue #19)
- [time-based-permissions-design.md](../design/time-based-permissions-design.md) — context-aware permission rules
- [MANAGERS-OVERVIEW.md](./MANAGERS-OVERVIEW.md) — UserManager, ACLManager, PolicyManager, PolicyEvaluator roles
- Issue history: #625 (consolidation), #609 (test isolation flake), #630 / #633 (Api / Parse hasPermission divergence)
