# ngdpbase Manager Architecture

All application behaviour is implemented in managers. Each manager extends `BaseManager`, owns one concern, and is resolved through `WikiEngine.getManager('Name')`. The engine initialises managers in a fixed dependency order and exposes a `backup()` / `restore()` / `shutdown()` lifecycle on every manager.

---

## Initialization Order

WikiEngine registers managers in this sequence. Later managers may call `engine.getManager()` on any manager that appears earlier in the list.

| # | Manager | Depends on |
|---|---|---|
| 1 | __ConfigurationManager__ | *(none — reads config files directly)* |
| 2 | __CatalogManager__ | ConfigurationManager |
| 3 | __CacheManager__ | ConfigurationManager |
| 4 | __MetricsManager__ | ConfigurationManager |
| 5 | __UserManager__ | ConfigurationManager, SchemaManager, PageManager, TemplateManager, ValidationManager, PolicyEvaluator |
| 6 | __EmailManager__ | ConfigurationManager |
| 7 | __AuthManager__ | ConfigurationManager |
| 8 | __NotificationManager__ | ConfigurationManager |
| 9 | __PageManager__ | ConfigurationManager |
| 10 | __TemplateManager__ | *(none)* |
| 11 | __PolicyManager__ | ConfigurationManager |
| 12 | __PolicyValidator__ | PolicyManager |
| 13 | __PolicyEvaluator__ | PolicyManager, PolicyValidator |
| 14 | __ACLManager__ | PolicyEvaluator |
| 15 | __PluginManager__ | ConfigurationManager |
| 16 | __MarkupParser__ | ConfigurationManager, PluginManager |
| 17 | __RenderingManager__ | ConfigurationManager, PageManager, PluginManager, MarkupParser, NotificationManager |
| 18 | __SearchManager__ | ConfigurationManager, PageManager |
| 19 | __ValidationManager__ | ConfigurationManager, PageManager |
| 20 | __VariableManager__ | ConfigurationManager |
| 21 | __SchemaManager__ | ConfigurationManager |
| 22 | __ExportManager__ | PageManager, RenderingManager |
| 23 | __AttachmentManager__ | ConfigurationManager, PageManager, MediaManager |
| 24 | __MediaManager__ | ConfigurationManager, NotificationManager |
| 25 | __AssetManager__ | AttachmentManager, MediaManager, ConfigurationManager |
| 26 | __BackupManager__ | ConfigurationManager, all registered managers |
| 27 | __AuditManager__ | ConfigurationManager |
| 28 | __AddonsManager__ | ConfigurationManager |
| 29 | __ImportManager__ | ConfigurationManager |
| 30 | __BackgroundJobManager__ | ConfigurationManager |
| 31 | __CommentManager__ | ConfigurationManager |
| 32 | __FootnoteManager__ | ConfigurationManager |
| 33 | __AssetService__ | AssetManager *(legacy façade)* |
| 34 | __ThemeManager__ | *(standalone — not a BaseManager)* |

---

## Manager Reference

### ConfigurationManager

Reads `config/*.properties` and env overrides. All other managers query it for their settings. Property names are lowercase dot-separated (`ngdpbase.cache.enabled`). No dependencies.

---

### CacheManager

Centralised cache with a pluggable provider (`NodeCacheProvider` default, Redis optional, Null fallback).

__Providers:__ resolved by `ngdpbase.cache.provider`; falls back to `NullCacheProvider` if health check fails.

__Key API:__

| Method | Description |
|---|---|
| `region(name)` | Returns a namespace-scoped `RegionCache` |
| `get(key)` | Read from cache |
| `set(key, value, options?)` | Write with optional TTL |
| `del(keys)` | Invalidate one or more keys |
| `clear(region?, pattern?)` | Flush region or matching keys |
| `stats(region?)` | Hit/miss counts |
| `static getCacheForManager(engine, region)` | Convenience for managers |

__Flow — cache invalidation on page save:__

```
PageManager.savePage()
  → CacheManager.del('rendered-pages:<name>:*')
  → CacheManager.del('page:<name>')
```

---

### MetricsManager

OpenTelemetry metrics with Prometheus export (port 9464) and optional OTLP.

Disabled by default (`ngdpbase.telemetry.enabled = false`). When enabled, instruments counters and histograms for page views, saves, deletes, search rebuilds, login attempts, HTTP requests, and engine init duration.

__Key API:__ `recordPageView(ms)`, `recordPageSave(ms)`, `recordHttpRequest(ms, attrs)`, `getMetricsHandler()` → Express handler for `/metrics`.

---

### UserManager

Authentication, role assignment, session management, and user-page creation.

__Provider:__ `ngdpbase.user.provider` (default `FileUserProvider`). Creates a default admin on first boot.

__Key API:__

| Method | Description |
|---|---|
| `authenticateUser(username, password)` | Verify credentials → `User \| null` |
| `createUser(data)` | Create user; syncs Schema.org Person |
| `createOrUpdateExternalUser(data)` | OAuth / magic-link upsert |
| `getUser(username)` | Fetch without password |
| `searchUsers(query, options?)` | Filtered user list |
| `hasPermission(username, action)` | Checks via PolicyEvaluator |
| `getUserPermissions(username)` | Full permission list |
| `hasRole(username, role)` | Role membership test |
| `assignRole(username, role)` | Grant role |
| `getCurrentUser(req)` | Extract `UserContext` from Express request |
| `ensureAuthenticated(req, res, next)` | Express middleware |
| `requirePermissions(perms)` | Express middleware |
| `createSession(username, data)` | Return session ID |
| `getSession(id)` | Return `UserSession \| null` |
| `isAdminUsingDefaultPassword()` | Boot-time warning check |
| `backup()` / `restore()` | Provider-delegated |

__Inter-manager calls:__

- `SchemaManager` → sync Person on create/update/delete
- `PageManager` → detect display-name page conflict
- `TemplateManager` → apply template when creating user page
- `ValidationManager` → generate metadata for user page
- `PolicyEvaluator` → permission resolution

---

### EmailManager

Shared outbound mail transport. Provider is `console` (dev) or `smtp` (production), set by `ngdpbase.mail.provider`. Disabled by default.

__Key API:__ `send(message)`, `sendTo(to, subject, text, html?)`, `isEnabled()`.

Used by AuthManager (magic-link), calendar addon (confirmations), and form addon (submissions).

---

### AuthManager

Authentication provider orchestration (OAuth, magic-link, local). Initialised early (step 7) so session middleware is ready before routes register. Delegates to configured providers.

---

### NotificationManager

System-level notification bus. Managers emit notifications (e.g., MediaManager emits a warning when a configured folder is missing). Routes and admin UI subscribe.

---

### PageManager

Core page storage and retrieval. Provider-based (`FileSystemProvider` default).

__Key API:__

| Method | Description |
|---|---|
| `getPage(name)` | Fetch `WikiDocument` |
| `savePage(doc)` | Write page; invalidates caches |
| `deletePage(name)` | Delete; fires search/link-graph updates |
| `renamePage(oldName, newName)` | Atomic rename |
| `listPages()` | All page names |
| `getAllPages()` | Full `WikiDocument[]` |
| `pageExists(name)` | Existence check |
| `searchPages(query)` | Simple text search |
| `getPageHistory(name)` | Version list |
| `getPageVersion(name, version)` | Historical content |
| `backup()` / `restore()` | Delegated to provider |

__Flow — page save cascade:__

```
savePage(doc)
  → FileSystemProvider.write()
  → CacheManager.del(rendered-pages + page keys)
  → SearchManager.updatePageInIndex(name, doc)
  → RenderingManager.updatePageInLinkGraph(name, content)
  → AttachmentManager.syncPageMentions(name, content)
  → AssetManager.syncPageAssets(name, content)
  → MetricsManager.recordPageSave(ms)
```

---

### TemplateManager

Page templates (Markdown files in `./templates/`) and themes (CSS in `./themes/`). Self-contained — no manager dependencies.

__Key API:__ `getTemplates()`, `getTemplate(name)`, `applyTemplate(name, vars)`, `createTemplate(name, content)`, `getThemes()`, `getTheme(name)`, `suggestTemplates(pageName, category)`.

Variable substitution replaces `{{uuid}}`, `{{date}}`, `{{pageName}}`, `{{keywords}}` tokens in template content.

---

### PolicyManager

Loads access-control policies from configuration (`ngdpbase.access.policies`). Disabled by default.

Policies define `subject` (user/role/group), `resource` (page/category), `action` (view/edit/delete), `effect` (allow/deny), and numeric `priority`.

__Key API:__ `getPolicy(id)`, `getAllPolicies()` (sorted by priority descending).

---

### PolicyValidator

Validates policy schemas (AJV + JSON Schema) and detects conflicts between overlapping policies.

__Key API:__ `validatePolicy(policy)`, `validateAllPolicies()`, `detectPolicyConflicts(policies)`, `validateAndSavePolicy(policy)`.

Checks subject overlap, resource overlap (including glob patterns), and action overlap. Flags priority ties between conflicting policies.

---

### PolicyEvaluator

Evaluates whether a `WikiContext` is permitted to perform an action on a resource.

__Flow:__

```
evaluate(context, action, resource)
  → PolicyManager.getAllPolicies()  (sorted by priority)
  → for each matching policy: apply effect
  → AuditManager.logAccessDecision(context, result, reason, policy)
  → return Allow | Deny | NotApplicable
```

---

### ACLManager

Per-page `acl` frontmatter evaluation. Runs after PolicyEvaluator; provides the final allow/deny for `view` and `edit` actions on specific pages.

```yaml
acl:
  view: [editor, admin]
  edit: [admin]
```

Anonymous users are denied before the rendering pipeline runs.

---

### PluginManager

Auto-discovers and executes wiki plugins.

__Discovery:__ enumerates `.js` / `.ts` files from `ngdpbase.managers.plugin-manager.search-paths`. Excludes test files and `.d.ts` declarations.

__Key API:__

| Method | Description |
|---|---|
| `registerPlugins()` | Load all from search paths |
| `loadPlugin(path)` | Load a single plugin file |
| `findPlugin(name)` | Case-insensitive lookup (also tries `${name}Plugin`) |
| `execute(name, pageName, params, ctx)` | Run plugin → string |
| `registerPlugin(name, plugin)` | Programmatic registration (bypasses file check) |
| `getPluginNames()` | List registered names |

Plugins implement `SimplePlugin { execute(context, params): string }`. Old-style function plugins are also supported.

---

### MarkupParser

JSPWiki-compatible markup parser. The production path is `parseWithDOMExtraction()`:

```
Phase 1    — extractJSPWikiSyntax()
             (fenced code, style blocks, emoji, status boxes → UUID placeholder spans)
Phase 2    — WikiDocument DOM node creation
             (extracted elements become DOM nodes for restoration in Phase 4)
Phase 2.5  — JSPWikiPreprocessor (priority 95)
             (bare table syntax || / |, %%class%% style blocks → HTML)
Step 0.55  — Inline style conversion
             (%%sup/sub/strike%% → <sup>/<sub>/<del>)
Phase 2.6  — Other registered handlers (plugins, wiki links, etc.)
Phase 3    — Showdown markdown → HTML
Phase 4    — DOM placeholder restoration
             (UUID spans replaced with rendered plugin/code/style HTML)
FilterChain — ⚠️ Initialized but never called — see #596
```

Not a BaseManager subclass — initialised by WikiEngine and accessed by RenderingManager via `engine.getManager('MarkupParser')`.

__See also:__ [Current-Rendering-Pipeline.md](./Current-Rendering-Pipeline.md)

---

### RenderingManager

Orchestrates content rendering. Supports the advanced MarkupParser pipeline and a legacy Showdown converter (configurable fallback).

__Key API:__

| Method | Description |
|---|---|
| `renderMarkdown(content, name, ctx, req)` | Main render entry point |
| `renderWithAdvancedParser(...)` | MarkupParser pipeline |
| `renderWithLegacyParser(...)` | Showdown fallback |
| `expandMacros(content, name, ctx, req)` | Expand `[{Plugin}]` tokens |
| `processWikiLinks(content)` | Convert `[[Page]]` to HTML anchors |
| `buildLinkGraph()` | Full scan of all pages |
| `updatePageInLinkGraph(name, content)` | Incremental update after save |
| `getReferringPages(name)` | Backlinks |
| `invalidateHandlerCache()` | Flush MarkupParser render cache |
| `textToHTML(ctx, content)` | Render via `WikiContext.renderMarkdown` |
| `renderPreview(content, name, ctx)` | Unsaved preview |

__Flow — page view (cache miss):__

```
GET /view/:page
  → CacheManager.get(rendered-pages:<name>:<roles>)  → miss
  → ACLManager.check(view, page, userContext)
  → RenderingManager.textToHTML(wikiContext, content)
      → MarkupParser phases 1-7
          → PluginManager.execute() per plugin token
          → VariableManager.expand() per variable
  → CacheManager.set(rendered-pages:<name>:<roles>, html)
  → respond with HTML
```

__Flow — page view (cache hit):__

```
GET /view/:page
  → CacheManager.get(rendered-pages:<name>:<roles>)  → hit
  → respond with cached HTML  (pipeline skipped entirely)
```

---

### SearchManager

Full-text search with pluggable providers (Lunr.js default, Elasticsearch optional).

Index is built at startup in the background (non-blocking). Supports categories, user-keywords, and system-keywords facets. Results are filtered by `WikiContext` for private-page access.

__Key API:__

| Method | Description |
|---|---|
| `searchWithContext(ctx, query, opts)` | Primary search entry point |
| `advancedSearchWithContext(ctx, opts)` | Multi-facet search |
| `buildSearchIndex()` | Full rebuild from all pages |
| `updatePageInIndex(name, data)` | Incremental update |
| `removePageFromIndex(name)` | Remove on delete |
| `suggestSimilarPages(name, limit)` | Related page suggestions |
| `getSuggestions(partial)` | Autocomplete stubs |
| `getAllCategories()` | Facet values |
| `getAllUserKeywords()` | Facet values |
| `getStatistics()` | Index stats |
| `backup()` / `restore()` | Provider-delegated |

---

### ValidationManager

Validates and sanitizes page metadata (UUID, title, slug, system-category, user-keywords).

__Key API:__

| Method | Description |
|---|---|
| `validatePage(filename, metadata, content?)` | Full page validation |
| `validateMetadata(metadata)` | Metadata-only check |
| `sanitizeMetadata(metadata)` | Return sanitized copy |
| `generateValidMetadata(title, options)` | Generate fresh metadata |
| `generateSlug(title)` | URL-safe slug (Unicode transliteration) |
| `checkConflicts(uuid, title, slug)` | Check uniqueness via PageManager |
| `isValidSlug(slug)` | Pattern check |
| `getAllSystemCategories()` | From config |
| `getCategoryStorageLocation(category)` | Regular vs special storage |

---

### VariableManager

JSPWiki-compatible variable expansion. Resolves `[{$variableName}]` tokens in markup using page metadata, user context, and engine state.

---

### SchemaManager

Manages Schema.org JSON-LD objects (Person, Article, etc.). Used by UserManager to sync user profiles to structured data. Provides `createPerson`, `updatePerson`, `deletePerson`.

---

### ExportManager

Exports pages to styled HTML or Markdown.

__Key API:__ `exportPageToHtml(name, user?)`, `exportPagesToHtml(names, user?)`, `exportToMarkdown(names, user?)`, `saveExport(content, filename, format)`, `getExports()`.

Timestamp formatting is locale-aware via `LocaleUtils`.

__Inter-manager calls:__ `PageManager.getPage()`, `RenderingManager.renderMarkdown()`.

---

### AttachmentManager

File attachments for wiki pages. Provider-based (`BasicAttachmentProvider` default).

__Key API:__

| Method | Description |
|---|---|
| `uploadAttachment(buf, info, opts)` | Store file; checks page privacy |
| `attachToPage(id, pageName)` | Create page→attachment link |
| `getAttachment(id)` | `{ buffer, metadata }` |
| `getAttachmentsForPage(name)` | All attachments for a page |
| `deleteAttachment(id, ctx?)` | Remove; audited |
| `resolveAttachmentSrc(src, pageName)` | Resolve `media://`, page-local, global references |
| `syncPageMentions(name, content)` | Update mention index after save |
| `getThumbnail(id, size)` | Resize via provider |
| `backup()` / `restore()` | Provider-delegated |

__Inter-manager calls:__ `PageManager` for private-page detection; `MediaManager` for `media://` URI resolution.

---

### MediaManager

Read-only media library browser. Scans configured external folders for photos and videos. Manages thumbnails, HEIC→JPEG transcoding, year-based filtering, and keyword indexing.

__Key API:__ `rebuildIndex(onProgress?)`, `scanFolders(force?)`, `getItem(id, ctx?)`, `listByYear(year, ctx?)`, `listByPage(name, ctx?)`, `search(query, ctx?)`, `getThumbnailBuffer(id, size)`, `getTranscodedBuffer(id, format)`.

Private-page access control is enforced via `PageManager.checkPrivatePageAccess()`.

---

### AssetManager

Unified DAM provider registry. Fans out search across `AttachmentManager` and `MediaManager`. Maintains a reverse index (`page → assets`) in `data/page-assets-index.json`.

__Key API:__ `registerProvider(p)`, `search(query)`, `getById(id, providerId?)`, `getThumbnail(id, providerId, size)`, `syncPageAssets(name, content)`, `getAssetsForPage(slug)`.

---

### BackupManager

Orchestrates system-wide backup and restore. Calls `backup()` on every registered manager, gzips the result into a single archive, and retains the N most recent files (configurable).

Supports scheduled auto-backup (`ngdpbase.backup.auto-backup-time`, `ngdpbase.backup.auto-backup-days`).

__Key API:__ `createBackup(opts?)`, `restoreFromFile(path, opts?)`, `listBackups()`, `getLatestBackup()`, `updateAutoBackupConfig(partial)`.

---

### AuditManager

Comprehensive audit trail for access decisions, authentication events, and security events. Provider-based (`FileAuditProvider` default, Null if disabled).

__Key API:__

| Method | Description |
|---|---|
| `logAuditEvent(event)` | Raw event |
| `logAccessDecision(ctx, result, reason, policy)` | ACL/policy decision |
| `logPolicyEvaluation(ctx, policies, result, ms)` | Policy eval trace |
| `logAuthentication(ctx, result, reason)` | Login/logout |
| `logSecurityEvent(ctx, type, severity, desc)` | Security incident |
| `searchAuditLogs(filters, opts)` | Query log store |
| `getAuditStats(filters)` | Aggregate counts |
| `exportAuditLogs(filters, format)` | JSON or CSV export |
| `cleanupOldLogs()` | Apply retention policy |

---

### AddonsManager

Discovers and loads domain addon packages from the `addons/` directory. Each addon is an ESM npm package that registers its own pages, routes, nav items, and themes.

__Flow:__

```
WikiEngine.initialize()
  → AddonsManager.loadAddons()
  → for each addon directory:
      seedAddonPages()     — inject addon content pages
      registerRoutes()     — attach Express routes
      registerNavItems()   — contribute sidebar links
```

---

### BackgroundJobManager

Async job queue for long-running operations (index rebuilds, media scans, backup). Jobs are enqueued, run sequentially or in configurable concurrency, and their status is queryable.

---

### ImportManager

Data import (pages, users, attachments) from external sources or backup archives.

---

### CatalogManager

Addon/plugin catalog and registry. Tracks which addons are installed, their versions, and metadata.

---

### CommentManager

Page comments (stub implementation). Stores comments as JSON files keyed by page UUID.

---

### FootnoteManager

Stores per-page footnotes (display text, URL, note). JSON files keyed by page UUID. Auto-increments numeric IDs within each page.

__Key API:__ `getFootnotes(uuid)`, `addFootnote(uuid, data, createdBy)`, `updateFootnote(uuid, id, data)`, `deleteFootnote(uuid, id)`.

---

### AssetService

Legacy façade over `AssetManager`. Maintains backwards compatibility for routes that were written before `AssetManager` was introduced. Delegates all calls to `AssetManager`.

---

### ThemeManager

Resolves active theme paths (CSS, logo, favicon) and loads `theme.json` metadata (fonts, description). Not a `BaseManager` subclass — used directly by Express static-serving middleware.

__Key API:__ `paths` getter → `ThemePaths`, `static listAvailable(themesDir)` → theme name list.

---

## Key Inter-Manager Flows

### Page Render (cache miss)

```
GET /view/:page
  ↓
WikiRoutes.viewPage()
  → ACLManager.isAllowed(view, page, userContext)
  → PageManager.getPage(name)
  → CacheManager.get(rendered-pages:<name>:<roleSet>)   → miss
  → RenderingManager.textToHTML(ctx, content)
      → MarkupParser.parseWithDOMExtraction()
          → Phase 1: extractJSPWikiSyntax()
          → Phase 2: WikiDocument DOM node creation
          → Phase 2.5: JSPWikiPreprocessor (tables, style blocks)
          → Step 0.55: inline style conversion (%%sup/sub/strike%%)
          → Phase 2.6: handlers (plugins, wiki links, variables)
          → Phase 3: Showdown markdown → HTML
          → Phase 4: DOM placeholder restoration
  → CacheManager.set(rendered-pages:<name>:<roleSet>, html, ttl)
  → MetricsManager.recordPageView(ms)
  → render EJS template with html
```

__See also:__ [Current-Rendering-Pipeline.md](./Current-Rendering-Pipeline.md)

### Page Save

```
POST /save/:page
  ↓
WikiRoutes.savePage()
  → ACLManager.checkPermission(edit, page, userContext)
  → PageManager.savePageWithContext(wikiContext, metadata)
      → [1] Reject deprecated inline ACL markup [{ALLOW}/{DENY}]
      → [2] Preserve original author (immutable — never overwritten)
      → [3] Resolve storage location (private keyword → private dir)
      → [4] ValidationManager.sanitizeMetadata()
      → [5] ValidationManager.checkConflicts() (UUID/slug/title)
      → [6] Move private page file if author changed (edge case)
      → [7] provider.savePage()  →  disk write
  → RenderingManager.updatePageInLinkGraph(name, content)
  → SearchManager.updatePageInIndex(name, data)
  → CacheManager  (cache invalidation)
  → redirect → view page
```

__See also:__ [Current-Save-Page-Pipeline.md](./Current-Save-Page-Pipeline.md)

### User Authentication

```
POST /login
  ↓
AuthManager.handleLocalLogin()
  → UserManager.authenticateUser(username, password)
      → FileUserProvider.findUser(username)
      → UserManager.verifyPassword(pwd, hash)
  → UserManager.createSession(username, data)   → sessionId
  → AuditManager.logAuthentication(ctx, success)
  → MetricsManager.recordLoginAttempt()
  → redirect to /view/home
```

### Access Control Evaluation

```
isAllowed(action, resource, userContext)
  ↓
PolicyEvaluator.evaluate(ctx, action, resource)
  → PolicyManager.getAllPolicies()              (sorted by priority)
  → match subject / resource / action per policy
  → apply first matching effect (allow/deny)
  → AuditManager.logAccessDecision(ctx, result, reason, policy)
  ↓
ACLManager.evaluate(page.acl, action, userContext.roles)
  → return final Allow | Deny
```

### Search Request

```
GET /api/search?q=...
  ↓
SearchManager.searchWithContext(wikiContext, query, opts)
  → provider.search(query, opts)               (Lunr or Elasticsearch)
  → filter results: ACLManager.isAllowed(view, page, ctx) per result
  → return SearchResult[]
```

### Plugin Execution (Phase 2.6)

```
MarkupParser.parseWithDOMExtraction() — Phase 2.6 (registered handlers)
  ↓
PluginSyntaxHandler (or similar):
  → for each [{PluginName key=value}] token extracted in Phase 1:
      → PluginManager.findPlugin(name)
      → plugin.execute(wikiContext, params)     → string
      → result stored in WikiDocument DOM node
      → DOM placeholder restored in Phase 4
```

### Backup

```
BackupManager.createBackup()
  ↓
  → engine.getRegisteredManagers()
  → for each manager: manager.backup()          → BackupData
  → merge all BackupData into single object
  → gzip JSON → ./data/backups/backup-<timestamp>.json.gz
  → BackupManager.cleanupOldBackups()           (retain max N)
```

---

## Architectural Patterns

### Provider pattern

`CacheManager`, `SearchManager`, `AttachmentManager`, `UserManager`, `AuditManager`, `MediaManager` each delegate to a pluggable provider loaded by name (e.g., `ngdpbase.cache.provider = nodecacheprovider`). The engine resolves provider names case-insensitively and falls back to a safe Null/default provider on load or health-check failure.

### Dependency injection via engine

```typescript
// inside any manager method:
const pageManager = this.engine.getManager('PageManager') as PageManager;
```

Managers never import each other directly; all coupling goes through `WikiEngine.getManager()`.

### Cache key conventions

| Key pattern | Owner | Invalidated by |
|---|---|---|
| `rendered-pages:<name>:<roleSet>` | RenderingManager | page save, rename, delete |
| `page:<name>` | PageManager | page save, rename, delete |
| `search-index` | SearchManager | full rebuild |
| `link-graph` | RenderingManager | page save, delete |

### Backup / restore lifecycle

Every `BaseManager` subclass implements:

```typescript
backup(): Promise<BackupData>
restore(data: BackupData): Promise<RestoreResult>
shutdown(): Promise<void>
```

`BackupManager.createBackup()` calls `backup()` on all managers; `restoreFromFile()` calls `restore()` in the same initialization order.
