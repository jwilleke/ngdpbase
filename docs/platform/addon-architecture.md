# Addon System Architecture

Internal reference for the ngdpbase addon subsystem. Covers load order, manager contracts, config resolution, type setup, and integration points. For build-your-own-addon instructions, see [`addon-development-guide.md`](./addon-development-guide.md). For the slug-naming rules every addon must follow (and what breaks if you rename one), see [`addon-identity-contract.md`](./addon-identity-contract.md).

**Three distribution models, one slug + module + load contract:** addons reach a running ngdpbase instance as **`bundled`** (in this repo's `addons/<slug>/`), **`drop-in`** (any directory listed in the `addons-path` config), or **`packaged`** (`npm install` — documented but not yet implemented). Names locked in by #668. Pick by how the addon is owned and shipped — see the [Distribution Models](#distribution-models) table immediately below.

---

## Distribution Models

ngdpbase recognises three ways an addon can reach a running instance. The slug, the module contract, and the load sequence are identical across all three — only the source of the addon directory differs.

| Model | Lives at | Cadence | Status |
|---|---|---|---|
| **bundled** | `addons/<slug>/` inside the ngdpbase repo | Ships with each ngdpbase release | Implemented |
| **drop-in** | Any directory listed in the `ngdpbase.managers.addons-manager.addons-path` config (e.g. `/opt/external-addons/addons/<slug>/`) | Independent repo, deployed at install/restart time | Implemented |
| **packaged** | `node_modules/<scope>/<slug>-addon/` via `npm install` | Independent repo, npm-versioned and lockfile-pinned | Not implemented — `AddonsManager.scanAddonsDirectory()` only scans configured directory paths today; supporting `node_modules` would mean a new loader path or pointing `addons-path` at `node_modules/<scope>/`. No active driver, kept here as a documented option. |

Pick a model by how the addon is owned and shipped:

- **bundled** — the addon is part of the platform's release surface (e.g. `forms`, `calendar`, `elasticsearch`, `journal`). Versioned with ngdpbase. Always available.
- **drop-in** — the addon has its own repo and release cadence, and the operator drops it onto the filesystem at deployment time. The current model for `geohazardwatch`-style domain addons. No build-system coupling to ngdpbase.
- **packaged** — same independent ownership as drop-in, but distributed as an npm package and pinned via the consumer's `package.json`. The right model for container deployments where reproducibility matters: one `npm install <pkg>@<version>` line in the generated Dockerfile, no cross-repo build context.

The platform makes no trust distinction between models. A `type: 'domain'` addon (see §3) can be bundled, drop-in, or packaged.

---

## 1. Initialization Order

Addons load **after** Express session and user-context middleware, so `req.session` and `req.userContext` are available in all addon route handlers.

```
src/app.ts
  ├── engine.initialize()          — core managers boot; AddonsManager created but NOT initialized
  ├── Express session middleware   — cookie, session, userContext attached to req
  ├── engine.initializeAddons()    — AddonsManager.initialize() → discover → load
  └── WikiRoutes registration      — standard wiki routes mount after addons
```

`engine.initializeAddons()` is a thin wrapper that calls `AddonsManager.initialize()`. AddonsManager is registered in the core manager registry, so routes and plugins created during addon registration can call `engine.getManager('AddonsManager')` at runtime.

---

## 2. AddonsManager Load Sequence

**File:** `src/managers/AddonsManager.ts`

### 2a. Discovery (`scanAddonsDirectory`)

For each directory under every configured `addons-path`:

1. Skip hidden entries, dotfiles, and `shared/`
2. Require `index.js` or `index.ts` to be present
3. Dynamically `require()` the module
4. Validate required fields: `name` (string), `register` (function)
5. Parse `package.json` for the optional `ngdpbase` manifest block
6. Register in internal Map keyed by `addon.name`; first occurrence wins — later duplicates log a warning and are skipped

### 2b. Dependency Resolution (`resolveLoadOrder`)

Topological sort over `module.dependencies[]`. Throws on:

- Circular dependency
- Missing dependency (declared but not discovered)

Only enabled addons enter the sort. Result is an ordered string array like `['a', 'b', 'c']`.

### 2c. Loading (`loadAddon`)

For each addon in resolved order:

1. **Domain guard** — if addon `type === 'domain'` and a domain addon is already loaded, downgrade to `additive` with a warning. Only one domain addon is permitted per instance.
2. **domainDefaults** — for each key in `manifest.domainDefaults`, call `ConfigurationManager.setRuntimeProperty(key, value)` if the operator hasn't explicitly set that key. Changes are ephemeral (this boot only, not written to disk).
3. **Config resolution** — call `getAddonConfig(addonName)` which collects all config entries matching the prefix `ngdpbase.addons.{addonName}.`, strips the prefix, and returns a plain `Record<string, unknown>`.
4. **register(engine, config)** — the addon's main initialization hook.
5. **Page seeding** — after `register()` returns, scan `addons/{name}/pages/*.md`, parse frontmatter, and call `PageManager.savePage()` for any page whose slug doesn't already exist in the instance.
6. **Theme deploy** (since v3.17.0, #443) — immediately after page seeding, if `addons/{name}/theme/theme.json` exists and `themes/{name}/` does not, copy the `theme/` tree to the instance themes dir (`ngdpbase.theme.directory`, default `themes`). Skip-if-exists — never overwrites operator customisations. See [§ 8b Theme Deployment](#8b-theme-deployment).
7. **status()** — if present, called immediately to populate the admin/addons panel.

---

## 3. AddonModule Contract

```typescript
// src/managers/AddonsManager.ts
interface AddonModule {
  name: string;
  version: string;
  description?: string;
  author?: string;
  dependencies?: string[];
  register(engine: WikiEngine, config: Record<string, unknown>): Promise<void> | void;
  status?(): Promise<AddonStatusDetails> | AddonStatusDetails;
  shutdown?(): Promise<void> | void;
}

interface AddonStatusDetails {
  healthy: boolean;
  message?: string;
  records?: number;
  [key: string]: unknown;
}
```

The module must be exported both as `export default` (ESM) and `module.exports = ...` (CJS) because the runtime `require()`s the compiled JS:

```typescript
export default myAddon;
module.exports = myAddon;
```

---

## 4. Config Resolution

Operators set addon config under `ngdpbase.addons.<addonName>.*` in `data/config/app-custom-config.json`. AddonsManager strips the prefix before passing `config` to `register()`:

| Config key in file | `config` key in register() |
|--------------------|---------------------------|
| `ngdpbase.addons.journal.enabled` | `enabled` |
| `ngdpbase.addons.journal.defaultPrivate` | `defaultPrivate` |
| `ngdpbase.addons.journal.dataPath` | `dataPath` |

Multiple addon paths are supported:

```json
{
  "ngdpbase.managers.addons-manager.addons-path": [
    "./addons",
    "/opt/external-addons/addons"
  ]
}
```

---

## 5. WikiEngine API Available in register()

`engine` is a fully-initialized `WikiEngine` instance. All core managers are ready.

### Manager access

```typescript
engine.getManager<T>(name: string): T | undefined
```

Core manager names: `ConfigurationManager`, `PageManager`, `UserManager`, `PluginManager`, `SearchManager`, `RenderingManager`, `ACLManager`, `NotificationManager`, `BackupManager`, `CacheManager`, `AuditManager`, `CatalogManager`, `TemplateManager`, `PolicyManager`, `ValidationManager`, `SchemaManager`, `ExportManager`, `AttachmentManager`, `ImportManager`, `AuthManager`, `EmailManager`, `MediaManager`, `AssetManager`, `MetricsManager`, `BackgroundJobManager`, `MarkupParser`, `AddonsManager`.

### Register a custom manager

```typescript
const myMgr = new MyManager(engine, dataPath);
await myMgr.load();
engine.registerManager('MyManager', myMgr);
```

Other addons, plugins, and routes can then retrieve it with `engine.getManager('MyManager')`.

### Express app

```typescript
engine.app          // Express.Application
engine.app?.use('/api/my-addon', router)
engine.app?.use('/addons/my-addon', express.static(path.join(__dirname, 'public')))

// Register addon-local EJS views directory
const views = (engine.app?.get('views') as string | string[]) ?? [];
engine.app?.set('views', [...[views].flat(), path.join(__dirname, 'views')]);
```

### Capability flags

```typescript
engine.setCapability('my-addon', true)
// In EJS templates: <% if (capabilities?.['my-addon']) { %>
```

---

## 6. Plugin Registration

```typescript
// src/managers/PluginManager.ts
interface PluginObject {
  name?: string;
  execute(context: PluginContext, params: PluginParams): Promise<string> | string;
  initialize?(engine: WikiEngine): Promise<void> | void;
}

interface PluginContext {
  engine: WikiEngine;
  pageName: string;
  userContext?: { username?: string; roles?: string[] };
  linkGraph: Record<string, unknown>;
  [key: string]: unknown;
}

interface PluginParams {
  [key: string]: string | number | boolean;
}
```

Registration:

```typescript
const pm = engine.getManager<PluginManager>('PluginManager');
if (pm) await pm.registerPlugin('MyPlugin', MyPlugin);
```

Invoked in wiki markup as `[{MyPlugin param='value'}]`.

**Note on userContext:** `PluginSyntaxHandler` spreads the page's `WikiContext` into the plugin context object, so `context['userContext']` carries the current user's session data. Access it as:

```typescript
const user = context['userContext'] as { username?: string } | undefined;
```

---

## 7. Stylesheet Injection

```typescript
const addonsManager = engine.getManager<AddonsManager>('AddonsManager');
if (addonsManager) {
  addonsManager.registerStylesheet('/addons/my-addon/css/style.css', 'my-addon');
}
```

The layout template iterates `res.locals.addonStylesheets` (set in `app.ts`) and injects a `<link>` tag for each registered URL. Static files must be served first (see section 5 Express app).

---

## 7b. Admin Dashboard Cards

Any addon with an admin UI can register a card on the `/admin` dashboard. Cards appear between the Add-ons summary row and the Page Management row, showing live status output from the addon's `status()` method plus a link to the addon's admin page.

```typescript
export interface AddonDashboardCard {
  addonName: string;  // must match addon name in registry
  title: string;      // card header text
  icon: string;       // Font Awesome class, e.g. 'fas fa-calendar-alt'
  adminUrl: string;   // link target for the "Manage" button
}
```

```typescript
const addonsManager = engine.getManager<AddonsManager>('AddonsManager');
if (addonsManager) {
  addonsManager.registerDashboardCard({
    addonName: 'my-addon',
    title: 'My Addon',
    icon: 'fas fa-cog',
    adminUrl: '/addons/my-addon',
  });
}
```

`adminDashboard()` in `WikiRoutes.ts` calls `getDashboardCards()` and enriches each card with the addon's live `AddonStatusDetails` (the `message` field is displayed on the card). No template editing is needed — registering the card is sufficient.

---

## 8. Page Seeding

Place Markdown files in `addons/{name}/pages/`. Required frontmatter:

```yaml
---
title: My Page
uuid: 4a266851-f3cd-4ba6-bbbe-5a408f3adf72   # must be valid UUID v4
slug: my-page-slug
system-category: addon
addon: my-addon
author: system
---
```

Seeding is **idempotent**: if a page with that slug already exists, it is skipped. User edits survive restarts. AddonsManager automatically sets `addon` and `system-category: addon` if omitted.

---

## 8b. Theme Deployment

Since v3.17.0 (issue #443), an add-on may ship a `theme/` subdirectory; it
deploys to the instance themes directory the same way pages seed, and is the
mechanism by which a domain add-on carries its site identity.

- **Sentinel:** `addons/{name}/theme/theme.json` must exist (mirrors `pages/`
  needing at least one `.md`). No `theme.json` → nothing deploys.
- **First-boot copy:** runs immediately after page seeding (step 6 in § 2c).
  Copies `addons/{name}/theme/` → `{themesDir}/{name}/` only if the
  destination does not already exist.
- **Idempotent / non-destructive:** an existing `{themesDir}/{name}/` is never
  overwritten on boot — operator theme edits survive. The copy is a snapshot;
  the add-on source is not auto-re-synced.
- **Themes dir:** `ngdpbase.theme.directory` (default `themes`).
  `ThemeManager` is unchanged — it still reads `themes/<name>/`.
- **Manual re-deploy:** `POST /admin/addons/:name/deploy-theme`
  (`AddonsManager.deployAddonTheme()`) force-overwrites — surfaced as the
  **Deploy / Redeploy Theme** button on `/admin/addons` for any add-on whose
  `getStatus()` reports `hasTheme`. No restart required (theme CSS is static).

Implementation: `AddonsManager.seedAddonTheme()` / `deployAddonTheme()` /
`addonShipsTheme()`. Type-aware direct-load (no-copy) resolution for domain
add-ons is a separate, **unimplemented** design discussion — see #444.

---

## 9. Auth Patterns in Routes

Use `ApiContext` for all route authentication — the same pattern used by core wiki routes:

```typescript
import { ApiContext, ApiError } from '../../../dist/src/context/ApiContext';

router.get('/resource', (req, res) => {
  try {
    const ctx = ApiContext.from(req, engine);   // always succeeds
    ctx.requireAuthenticated();                  // throws ApiError(401) if not logged in
    ctx.requireRole('admin');                    // throws ApiError(403) if role absent
    // ctx.username, ctx.roles, ctx.isAuthenticated available
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: String(err) });
  }
});
```

---

## 10. Custom Manager Pattern (BaseManager)

```typescript
// src/managers/BaseManager.ts
abstract class BaseManager {
  protected engine: WikiEngine;
  readonly description?: string;

  constructor(engine: WikiEngine)

  // Override these:
  async initialize(config?: Record<string, unknown>): Promise<void>
  async shutdown(): Promise<void>
  async backup(): Promise<BackupData>
  async restore(backupData: BackupData): Promise<void>
  async toMarqueeText(options?: ManagerFetchOptions): Promise<string>
  // Supports: [{MarqueePlugin fetch='MyManager.toMarqueeText(key=value)'}]
}
```

Minimal implementation:

```typescript
class MyManager extends BaseManager {
  readonly description = 'My manager description';
  private data: Map<string, unknown> = new Map();

  async load(): Promise<void> {
    // Read from disk; called manually in addon register()
  }

  async save(): Promise<void> {
    // Atomic write to disk
  }

  count(): number { return this.data.size; }
}
```

Call `load()` manually in `register()` before calling `engine.registerManager()`. The core engine does not auto-call `load()` on custom addon managers.

---

## 11. TypeScript Build Setup

### tsconfig.json (addon)

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "../..",
    "outDir": "../..",
    "tsBuildInfoFile": "./.tsbuildinfo",
    "skipLibCheck": true,
    "declaration": false,
    "declarationMap": false
  },
  "include": [
    "index.ts",
    "managers/**/*.ts",
    "routes/**/*.ts",
    "plugins/**/*.ts",
    "../../src/types/**/*.d.ts"
  ],
  "exclude": ["node_modules", "dist", "**/*.test.ts", "**/__tests__/**"]
}
```

Key points:

- `rootDir: "../.."` and `outDir: "../.."` together cause output to land at `dist/addons/{name}/…` mirroring the source layout
- Imports from core use `../../../dist/src/…` paths (compiled core output)
- `../../src/types/**/*.d.ts` provides ambient type declarations

### eslint.config.mjs

Add the addon tsconfig to `parserOptions.project` to enable type-aware linting:

```javascript
parserOptions: {
  project: [
    "./tsconfig.json",
    "./addons/calendar/tsconfig.json",
    "./addons/my-addon/tsconfig.json"   // ← add this
  ]
}
```

Without this, ESLint throws a "not included in any tsconfig" error on pre-commit.

### package.json build:addons

```json
"build:addons": "cd addons/calendar && npm install --silent && npx tsc -p tsconfig.json && cd ../my-addon && npm install --silent && npx tsc -p tsconfig.json"
```

---

## 12. AddonManifest (package.json `ngdpbase` field)

```typescript
interface AddonManifest {
  type?: 'domain' | 'additive';       // default: 'additive'
  domainDefaults?: Record<string, unknown>;
  capabilities?: string[];
}
```

**`type: 'domain'`** — the addon IS the primary site identity (e.g. a specialized single-purpose tool). Only one domain addon is permitted; a second one is downgraded to `additive` with a warning.

**`domainDefaults`** — config keys applied at boot if not already set by the operator. Ephemeral; not persisted. Useful for domain addons that need specific default behavior without requiring operators to manually set every key.

---

## 13. Existing Addons at a Glance

| Addon | Type | Key Manager | Plugin | Routes | Pages |
|-------|------|-------------|--------|--------|-------|
| `calendar` | additive | `CalendarDataManager` (extends BaseManager, owns JSON event store) | `CalendarPlugin` (FullCalendar embed) | `/api/calendar`, `/addons/calendar` | UpcomingEvents, My Calendar, Calendar Help |
| `elasticsearch` | additive | none | none | `/addons/elasticsearch` | none |
| `forms` | additive | `FormsDataManager` (loads JSON form definitions, stores submissions per form) | `FormsPlugin` (renders schema-driven Bootstrap form; supports `section` fieldsets, `prefill` from user context, `proxySubmission` block) | `/api/forms/submit/:formId`, `/api/forms/schema/:formId`, `/addons/forms` | Using FormPlugin, Form Definition Reference |
| `journal` | additive | `JournalDataManager` (sidecar index, streak, facets); `JournalTemplateManager` (built-in + custom writing templates) | `JournalPlugin` (timeline/streak/on-this-day) | `/journal`, `/api/journal`, `/addons/journal` | journalhelp, myjournal |

---

## 14. Shutdown

On SIGINT/SIGTERM, `engine.shutdown()` calls `AddonsManager.shutdown()`, which calls each addon's `shutdown()` in **reverse** load order. Use this to clear intervals, flush caches, or close open handles:

```typescript
async shutdown(): Promise<void> {
  if (this.reminderInterval) {
    clearInterval(this.reminderInterval);
    this.reminderInterval = null;
  }
}
```
