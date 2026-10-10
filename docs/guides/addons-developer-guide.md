# Addons developer guide

> This is the document an addon author starts from. Load order, the full slug inventory, page sync, and the packaged image are depth: [architecture](../platform/addon-architecture.md), [identity contract](../platform/addon-identity-contract.md), [page handling](../platform/addon-page-handling.md), [packaged distribution](../platform/deployment/addon-packaged.md).

## Start here

Read this page and you can load a permission-correct addon on a local instance. You do not need the platform docs for a first addon.

### Before you write code

- __Node.js `>=24.0.0` and npm `>=11.0.0`.__ That is `engines` in this repo's `package.json`.
- __A local instance.__ `./server.sh start`. Instance config is the operator file in [Configuration](#configuration).
- __An account whose password you set.__ The shipped `admin` password is `admin123`. Change it on first login, or set `NGDPBASE_ADMIN_PASSWORD` and point `ngdpbase.user.security.defaultpassword` at `"$NGDPBASE_ADMIN_PASSWORD"` before the first boot ([SETUP.md](../../SETUP.md)). Do not build or test an addon against the shipped password.
- __A place for the code.__
  - A first-party addon ships in this repository. Fork, branch, and open a pull request that adds `addons/<slug>/`.
  - An addon you own lives in its own repository. Develop it as a drop-in directory. Ship production as a packaged npm addon, or as the wrapper image in [Shipping Your Addon as a Container Image](#12-shipping-your-addon-as-a-container-image).

### Choose a starting point

- __A directory__ in this repo or beside it: `npm run create:addon -- --id <slug>`. Flags are in [Quick start](#quick-start-scaffold-a-new-addon-675).
- __A whole repository__ (the addon at `addons/<slug>/`, plus a wrapper `Dockerfile`, Renovate, CI and a licence): `npm run create:addon -- --id <slug> --repo`. See [A whole repository](#a-whole-repository---repo).

Worked examples already in this repo: [`addons/journal`](../../addons/journal) (a person's pages, and the permissions that guard them) and [`addons/calendar`](../../addons/calendar) (depends on `forms`, so `forms` has to be enabled too). Copy one of those.

Then set `ngdpbase.addons.<slug>.enabled` to `true`, run `./server.sh restart`, and confirm the addon under `/admin` → Add-ons. Every addon starts disabled, including one discovered outside `./addons`.

The rules that have to be right before that restart: [identity](#identity), [where it is loaded](#where-it-is-loaded), [configuration](#configuration), [permissions](#permissions), [seed pages](#seed-wiki-pages), and [testing](#testing-and-lint).

## Standing rules

- Addon code is subject to the same invariants as `src/`: context forwarded, allow/deny from `hasPermission` / `canAccess`, outbound HTTP through `src/http/`. Read [security-developer-guide.md](security-developer-guide.md) and [audit-developer-guide.md](audit-developer-guide.md) before writing a route, manager method or job; they apply [security-posture.md](../security-posture.md) and [audit-posture.md](../audit-posture.md).
- An addon never names a role in code. It declares its own permission, and a policy granting it, in its `config/default-config.json`, and its routes ask for the permission. A policy may name the roles it grants to on day one (an operator narrows them in `app-custom-config.json`).
- There is no "signed in" gate. A route asks `requirePermission`; a feature that belongs to a person then asks `ctx.actingUsername()` for who it acts as ([#1430](https://github.com/jwilleke/ngdpbase/issues/1430)).
- Where an addon's content goes ([system-category.md](../system-category.md)):
  - __Pages it generates and owns__ go in its own category and vault, never `general` or the user's `default` vault.
  - __A `general` page it helps a person create__ is that person's page, with no addon rules afterwards.
  - __Data it keeps in its own files__ (its `dataPath`) is the system's, not a user's, and never goes in a vault. Admins read it, or it is handed to another addon through a hook, as forms does with `registerHandler`.
  - __Pages it seeds__ are documentation about the addon (`system-category: addon`), public.
- An addon's `config/default-config.json` is a merge layer. Maps merge per entry; `id` arrays merge by id. Do not append to a role's `permissions` array.
- `ngdpbase.slug` in `package.json` and the `name` exported from `index.ts` are the same value. What the loader does when they are not is [Identity](#identity).
- Seed pages get a real UUID v4, a title and a slug. A placeholder UUID, or a missing title or slug, is skipped with a warning (an error log for a domain add-on) and an admin notification.
- Import host HTTP as `../../dist/src/http/guardedFetch.js`, never `src/http/`.
- Recurring work is a scheduled job ([Background Jobs](#8-background-jobs)), never `setInterval`: a timer catches nothing up, runs twice during a rolling update, and records nothing when it misses.

---

## Identity

The slug is the addon's identity. `resolveAddonSlug` (`src/utils/addonsPathResolver.ts`) computes it without loading the module:

1. `package.json` `ngdpbase.slug`, when that field is set.
2. Otherwise the folder name.
3. An npm package with no slug drops a trailing `-addon` from the package directory name, so `@scope/geohazardwatch-addon` is `geohazardwatch`. A directory addon (bundled or drop-in) keeps its folder name verbatim, including a folder that ends in `-addon`.

`npm run create:addon` rejects an `--id` that ends in `-addon`. That is the scaffolder's check. Directory discovery keeps the folder name, as in the rule above.

The `name` exported from `index.ts` or `index.js` is a display label that must equal the slug. On a mismatch the slug is the identity that is used. The config key read is `ngdpbase.addons.<slug>.enabled`. A key written under the module's `name` is ignored. A domain addon logs the mismatch at error; any other addon warns. Dependencies, dedup, and the boot check that an enabled addon exists all key off the slug too.

The same string has to be the one you mount (`/api/<slug>`, `/addons/<slug>`), pass to `engine.setCapability`, put on a dashboard card as `addonName`, prefix job ids with, and stamp as `addon:` on a seed page. A dependency name is the other addon's slug.

What breaks when they disagree:

- The addon stays disabled, because the enable key you wrote does not match the slug.
- A declared dependency does not resolve, and startup errors.
- A later rename leaves the old config keys, the old URLs, and the pages already seeded under the old uuid. Seeding does not move them.

Every other place the slug is written down is the [identity contract](../platform/addon-identity-contract.md). That page is the inventory; the rules above are the ones that decide whether the addon loads.

## Where it is loaded

Three ways an addon reaches a running instance. The slug, the module, and `register()` are the same. Pick by who owns the addon.

| Model | Use it when | Minimum to load |
| --- | --- | --- |
| __bundled__ | First-party, released with ngdpbase | `addons/<slug>/` in this repo, with `index.ts` or `index.js`. Set `ngdpbase.addons.<slug>.enabled` to `true` in the operator file ([Configuration](#configuration)). The default `ngdpbase.managers.addons-manager.addons-path` is `./addons`. |
| __drop-in__ | Your own repo, edited in place | The same directory. Add its parent to `addons-path` (a string, or an array that also keeps `./addons`). Set the same enable key. `./server.sh restart`. |
| __packaged__ | Production of an independent addon | An npm package named `@scope/<slug>-addon`, with `ngdpbase.slug`, `main` pointing at `index.js`, and module `name` equal to the slug. Add `node_modules:@scope/*-addon` to `addons-path`, and set the same enable key. |

`addons-path` is a string or an array. Directory entries are scanned first. A `node_modules:<glob>` entry is expanded after that, and a directory addon of the same slug wins a collision. The runtime image has no npm, so a packaged install is a two-stage copy of `node_modules` — that recipe is [addon-packaged.md](../platform/deployment/addon-packaged.md). The `FROM` image in [section 12](#12-shipping-your-addon-as-a-container-image) is the drop-in wrapper, not the packaged model.

Enabled defaults to false for every addon, on every path. An addon copied into a non-default directory stays off until the enable key is set ([#686](https://github.com/jwilleke/ngdpbase/issues/686) is the open request to change that for non-default paths). The keys, the file they live in, and what `register()` is handed are [Configuration](#configuration).

## Configuration

An addon's settings are ordinary configuration keys. Three layers, and the later one wins: shipped `config/app-default-config.json`, then each enabled addon's `config/default-config.json`, then the operator file. `domainDefaults` is a separate boot-only write, at the end of this section.

### The namespace

Keys for this addon are `ngdpbase.addons.<slug>.*`. `<slug>` is the canonical identity from [Identity](#identity), and the `name` exported from `index.ts` or `index.js` must be that same string. A key written under a different `name` is not read.

`getAddonConfig` collects every key with that prefix, resolves env-var references (below), strips `ngdpbase.addons.<slug>.`, and passes the rest to `register(engine, config)`. One remaining segment stays a property. Further dots become a nested object.

| Key in the file | `config` in `register()` |
| --- | --- |
| `ngdpbase.addons.journal.enabled` | `config.enabled` |
| `ngdpbase.addons.journal.defaultAuthorLock` | `config.defaultAuthorLock` |
| `ngdpbase.addons.journal.streakEnabled` | `config.streakEnabled` |
| `ngdpbase.addons.demo.admin-account.password` | `config['admin-account'].password` |

### Defaults the addon ships

`addons/<slug>/config/default-config.json` holds fully qualified keys. `npm run create:addon` writes it, with or without `--repo`. Writing the file by hand is the same shape. A key whose name starts with `_` is a comment and is dropped.

The file is a merge layer, and only once the addon is enabled. Maps merge per entry. An array of objects that each have an `id` merges by that id, so the file can add `ngdpbase.permissions.definitions` and `ngdpbase.access.policies` without replacing the catalogs. A plain array replaces wholesale. The operator file still wins over the addon file. The permission recipe is [Permissions](#permissions).

### Where the operator overrides it

The operator file is `<instance data folder>/config/app-custom-config.json`.

The instance data folder is `FAST_STORAGE`, otherwise `INSTANCE_DATA_FOLDER`, otherwise `./data`. `INSTANCE_CONFIG_FILE` changes the filename. On a checkout that sets `FAST_STORAGE`, the file is `$FAST_STORAGE/config/app-custom-config.json`.

### The enable key and `addons-path`

- `ngdpbase.addons.<slug>.enabled` — default `false`, on every discovery path. Set it to `true` in the operator file. The copy of this key inside `default-config.json` does not turn the addon on: that file is read only after the shipped-plus-operator view already says enabled.
- `ngdpbase.managers.addons-manager.addons-path` — where discovery looks. Shipped value `./addons`. A string or an array of directory paths, plus `node_modules:<glob>` entries for packaged addons. See [Where it is loaded](#where-it-is-loaded).
- `ngdpbase.managers.addons-manager.enabled` — shipped `true`. `false` discovers nothing.

### Secrets

A secret is an environment variable, not a literal in either JSON file. `default-config.json` ships with the addon. The operator file is still a config file.

The process loads environment variables in this order, highest first: the ambient environment, then `<instance data folder>/.env`, then `<cwd>/.env` (`src/bootstrap-env.ts`). `./server.sh` sources the same files before Node starts.

Point the config key at the variable with a bare whole-value reference. The name is uppercase letters, digits, and underscores:

```json
"ngdpbase.addons.my-addon.apiKey": "$MY_ADDON_API_KEY"
```

`getProperty` resolves that before `register()` sees `config.apiKey`. If `MY_ADDON_API_KEY` is unset, that one key is omitted and a warning is logged; the addon still loads. Treat a missing `config.apiKey` as "not configured".

`${VAR}` is the other form, for a path inside a longer string (`"${FAST_STORAGE}/my-addon"`). An unset variable is left as the literal `${VAR}`. A value that should start with a dollar sign is written `$$`.

### `domainDefaults`

`package.json` `ngdpbase.domainDefaults` is a map of fully qualified keys applied at load, before `register()`, when the operator file does not already set that key. The write is `setRuntimeProperty`: this boot only, not saved to the operator file. A domain addon uses it for a site default such as the active theme:

```json
{
  "ngdpbase": {
    "slug": "my-addon",
    "type": "domain",
    "domainDefaults": { "ngdpbase.theme.active": "my-addon" }
  }
}
```

Any addon may set the field. The operator file wins.

## Permissions

Declare the permission and grant it in the addon's own `config/default-config.json`. That file is the merge layer in [Configuration](#configuration): maps merge per entry, and an `id` array merges by id. Do not append to a role's `permissions` array.

```json
{
  "ngdpbase.permissions.definitions": {
    "my-addon-manage": {
      "description": "Create and edit my-addon records",
      "icon": "cog",
      "color": "#0d6efd"
    }
  },
  "ngdpbase.access.policies": [
    {
      "id": "my-addon-manage-access",
      "name": "My addon management",
      "priority": 90,
      "effect": "allow",
      "subjects": [{ "type": "role", "value": "admin" }],
      "resources": [{ "type": "page", "pattern": "*" }],
      "actions": ["my-addon-manage"]
    }
  ]
}
```

A policy may name the roles it grants on day one. An operator narrows that in `app-custom-config.json`. Addon code never names a role.

A route asks `await ctx.requirePermission('my-addon-manage')` or `await ctx.hasPermission('my-addon-manage')` on an `ApiContext`. A page door asks `canAccess` or `hasPermissionOn`. The route shape is [Writing Routes](#7-writing-routes). Deny policies, the token ceiling, and vault-owner are [security-developer-guide.md](security-developer-guide.md).

Worked examples: `addons/journal/config/default-config.json` declares `journal-read`, `journal-write`, and `journal-export` in one policy, `journal-access`. `addons/calendar/config/default-config.json` declares `calendar-manage` and `calendar-reserve`.

## Testing and lint

An addon under `addons/` is linted with the host. These run in `npm run lint`, in `lint:ci`, and (for the ones named) on the pre-commit hook:

- `npm run lint:code` — eslint on `src/**/*.ts` and `addons/**/*.ts`.
- `npm run lint:addons` — no addon value-import of host `src/`, and no compiled `.js` left under `src/`. On the pre-commit hook.
- `npm run lint:http`, `npm run lint:csrf`, `npm run lint:gates`, `npm run lint:permission-subject` — outbound HTTP, CSRF, role-name gates, and rebuilt permission subjects. Each scans `addons/` as well as `src/`.
- `npm run lint:audit` — declared audit events are emitted, including the add-on's own (declared in its `config/default-config.json`, emitted with `addonAuditEventName`; see [audit-developer-guide.md](audit-developer-guide.md#addons)). On the pre-commit hook. An add-on kept in its own repository runs the same check on its own directory, from the image: `node dist/scripts/audit-coverage.js --check --addon <dir>` (the CI that `create:addon --repo` generates does this).

`npm run check:addon-load` is not on the hook. After `npm run build:addons` (or `npm run build`), it imports each `addons/*/index.js` in a child Node process. It does not call `register()`.

Unit tests sit beside the addon (`addons/<slug>/__tests__/**/*.ts` or `addons/<slug>/*.test.ts`). `npm test` includes them. A test teardown removes only the directories that test created. It must not delete `./data/` wholesale.

A TypeScript addon in this repo needs `npm run build:addons` before `./server.sh restart`. When `index.js` is present, that is the file discovery loads.

---

## Quick start: scaffold a new addon (#675)

The fastest path to a working addon is to generate one, then edit it:

```bash
npm run create:addon -- --id volcano-watch
```

That writes `addons/volcano-watch/` containing a manifest with the correct
canonical slug, an `index.ts` that registers a manager and a plugin, a seed page
with a freshly generated UUID, and a `README.md`. Enable it and restart, and the
addon loads and its page seeds.

```bash
# name the plugins and managers up front, and write somewhere else
npm run create:addon -- --id volcano-watch --type domain \
  --plugins VolcanoMap,VolcanoList --managers VolcanoData \
  --target ../volcano-watch
```

| Flag | Default | Meaning |
|---|---|---|
| `--id` | *(required)* | Canonical slug — lowercase, digits, single dashes |
| `--type` | `additive` | `additive` augments an instance; `domain` means the addon __is__ the site |
| `--plugins` | one, named from the id | Comma-separated plugin names |
| `--managers` | one, named from the id | Comma-separated manager names |
| `--repo` | off | Write a whole repository, with the addon at `addons/<id>/` |
| `--target` | `addons/<id>`; with `--repo`, `../<id>` | Output directory |
| `--force` | off | Write into a non-empty directory |

Two things the scaffolder gets right that are easy to get wrong by hand:

- __Identity.__ The `ngdpbase.slug` in `package.json` and the `name` exported
  from `index.ts` are emitted from one value, so they cannot disagree — the
  mismatch [#927](https://github.com/jwilleke/ngdpbase/issues/927) exists to
  catch. A trailing `-addon` in `--id` is rejected by the scaffolder. The
  load-time rules are [Identity](#identity).
- __Page UUIDs.__ Seed pages get a real v4 UUID, generated with the same `uuid`
  package `ValidationManager` uses. A hand-copied or placeholder UUID makes
  `AddonsManager` skip the page with a warning and an admin notification. The
  seeder also requires a title and a slug.

The manual walkthrough below still applies — read it to understand what the
generated files do, and for anything the scaffolder does not emit (routes,
views, themes, static assets).

### A whole repository: `--repo`

An addon you own lives in its own repository. `--repo` writes that repository in one step:

```bash
npm run create:addon -- --id volcano-watch --repo --target ../volcano-watch
```

The addon lands at `addons/volcano-watch/`, byte-for-byte what the command writes without `--repo`. Around it:

| File | What it does |
|---|---|
| `Dockerfile` | Wrapper image: the published ngdpbase image with the addon copied into its default `addons/`. `ARG NGDPBASE_VERSION` starts at the ngdpbase release you generated from |
| `renovate.json` | Bumps `NGDPBASE_VERSION` on each ngdpbase release; minor and patch auto-merge, a major waits for review |
| `.github/workflows/ci.yml` | Typechecks the addon inside the matching `-devtools` image (the version comes from the Dockerfile ARG), checks the slug against the exported `name`, checks seed page UUIDs, and builds the image |
| `LICENSE` | Apache-2.0, as ngdpbase |
| `.gitignore` | `node_modules/`, `dist/`, `data/`, `.env` and the like |
| `README.md` | How to run it, and a link back to this guide |

There is no rename step: every name comes from `--id`, `--plugins` and `--managers`. The repository replaces the retired `ngdpbase-addon-template`. Shipping the image is [Shipping Your Addon as a Container Image](#12-shipping-your-addon-as-a-container-image); for production prefer the packaged model in [addon-packaged.md](../platform/deployment/addon-packaged.md).

---

## 1. Repository Setup

A first-party addon is `addons/<slug>/` in this repository. An addon you own is the same shape inside its own repo. The layout:

```
my-addon-repo/
└── addons/
    └── my-addon/
        ├── index.js          ← entry point (index.ts is accepted; index.js wins if both exist)
        ├── managers/
        ├── routes/
        ├── plugins/
        ├── pages/            ← pages seeded into the instance on startup
        ├── theme/            ← optional; auto-deployed to themes/<addon>/ on first boot (theme.json required)
        ├── public/           ← static assets (CSS, JS, images)
        └── README.md
```

The `addons/` subdirectory is what gets wired into ngdpbase via config.
You can host multiple add-ons in one repo under the same `addons/` directory.
Which of the three models you are in, and the minimum config for each, is [Where it is loaded](#where-it-is-loaded).

Use [`addons/journal/`](../../addons/journal/) and [`addons/calendar/`](../../addons/calendar/) as the reference implementations. Calendar depends on [`addons/forms/`](../../addons/forms/). All three are TypeScript with their own `tsconfig.json`, compiled in place by `npm run build:addons`. `AddonsManager` loads `index.js` when that file is present, and `index.ts` only when it is not.

---

## 2. Wire into Your Running Instance

This is the drop-in wire-up. A bundled addon uses the default `./addons` path and only needs the enable key. A packaged addon uses a `node_modules:<glob>` entry. See [Where it is loaded](#where-it-is-loaded). The file below is the operator file from [Configuration](#configuration): `<instance data folder>/config/app-custom-config.json`.

Add to that file:

```json
{
  "ngdpbase.managers.addons-manager.addons-path": "/absolute/path/to/my-addon-repo/addons",
  "ngdpbase.addons.my-addon.enabled": true
}
```

Restart the server: `./server.sh restart`

The `AddonsManager` scans the path, finds all subdirectories with `index.js` or `index.ts`, and loads the enabled ones in dependency order. When both files exist, `index.js` is the one loaded.

### Multiple Addon Paths

`addons-path` accepts either a single string __or an array of strings__. This lets you mix generic
add-ons (kept in `fairways-base/addons/`) with non-generic ones hosted in separate repositories:

```json
{
  "ngdpbase.managers.addons-manager.addons-path": [
    "./addons",
    "/absolute/path/to/external-addon-repo/addons"
  ],
  "ngdpbase.addons.my-addon.enabled": true,
  "ngdpbase.addons.external-addon.enabled": true
}
```

Each path is scanned in order. If the same addon `name` appears in more than one path, the first
occurrence wins and subsequent duplicates are skipped with a warning in the logs.

__Convention:__ keep generic/reusable add-ons in `fairways-base/addons/`; keep site-specific or
private add-ons in their own external repo and reference that path in the array.

---

## 3. The AddonModule Interface

Your `index.js` must export an object (or `module.exports =` in CommonJS):

```javascript
/** @type {import('../src/managers/AddonsManager').AddonModule} */
module.exports = {
  name: 'my-addon',          // must equal the canonical slug; see Identity
  version: '1.0.0',
  description: 'What this add-on does',
  author: 'Your Name',
  dependencies: [],           // names of other add-ons that must load first

  async register(engine, config) {
    // Called at startup if enabled. Mount routes, init data, register plugins.
  },

  async status() {
    // Optional. Called by /admin/addons for health display.
    return { healthy: true, message: 'OK' };
  },

  async shutdown() {
    // Optional. Called on graceful server shutdown.
  }
};
```

### The `config` parameter

`config` is the addon's namespace with the prefix stripped and env-var references resolved. The rules are [Configuration](#configuration).

```javascript
async register(engine, config) {
  const dataPath = config.dataPath || './data/my-addon';
  const apiKey = config.apiKey; // set only when $MY_ADDON_API_KEY was set
}
```

---

## 4. Using the Engine

### Importing host code — through `dist/`, never `src/`

The host compiles to `dist/`. A bundled addon compiles __in place__ (its `tsconfig.json` has `rootDir` and `outDir` of `../..`), so its `.js` sits beside its `.ts`. Any value you import from the host must therefore be a path that exists at runtime:

```typescript
// Right — resolves in Node and in vitest (CI builds before it tests)
import logger from '../../dist/src/utils/logger.js';
import { guardedFetch } from '../../../dist/src/http/guardedFetch.js';

// Wrong — see below
import { guardedFetch } from '../../../src/http/guardedFetch.js';
```

The wrong form is worse than a missing file. Because the addon's `rootDir` spans the repository, importing `src/http/guardedFetch.js` pulls the host's `.ts` into __your__ compilation and emits `src/http/guardedFetch.js` next to it. On your machine the import then works. The container image copies `dist/` and `addons/` but not `src/`, so there Node throws `ERR_MODULE_NOT_FOUND` on the addon's first line and `AddonsManager` skips the addon with one log line. That is how v4.13.0 shipped with `elasticsearch` and `feeds` dead while every test was green ([#1192](https://github.com/jwilleke/ngdpbase/issues/1192)).

`import type` from either place is fine — it is erased at compile and seeks no file — but `dist/` has the `.d.ts` files too, so there is no reason to point at `src/`.

Two gates enforce this: `npm run lint:addons` fails on any addon value import that resolves under `src/` (and on any compiled `.js` found under `src/`), and `npm run check:addon-load` imports every `addons/*/index.js` in a child Node process after the build.

### Access a Manager

```javascript
const pageManager = engine.getManager('PageManager');
const pages = await pageManager.getAllPages();
```

Core manager names: `PageManager`, `UserManager`, `PolicyInformationPoint`, `AttachmentManager`,
`SearchManager`, `RenderingManager`, `PluginManager`, `ConfigurationManager`,
`AuditManager`, `CacheManager`, `BackgroundJobManager`, `NotificationManager`,
`MediaManager` *(may be undefined when `ngdpbase.media.enabled` is false)*.

### Mount Express Routes

```javascript
const path = require('path');

async register(engine, config) {
  const app = engine.app;

  // Serve static assets (add-on public/ folder)
  app.use('/addons/my-addon', require('express').static(
    path.join(__dirname, 'public')
  ));

  // API routes
  const apiRouter = require('./routes/api');
  app.use('/api/my-addon', apiRouter(engine, config));
}
```

> __Note:__ When your add-on lives in an external repo, the core's automatic static
> serving at `/addons/...` only covers the ngdpbase `addons/` directory. You must
> mount your own static middleware in `register()` as shown above.

### Register Plugins

```javascript
async register(engine, config) {
  const pluginManager = engine.getManager('PluginManager');
  const MyPlugin = require('./plugins/MyPlugin');
  await pluginManager.registerPlugin('MyPlugin', MyPlugin);
}
```

Registered plugins are then available in wiki page markup as `[{MyPlugin param='value'}]`.

### Register Stylesheets

```javascript
async register(engine, config) {
  const addonsManager = engine.getManager('AddonsManager');
  addonsManager.registerStylesheet('/addons/my-addon/css/style.css', 'my-addon');
}
```

The URL is injected into every page's `<head>` via `res.locals.addonStylesheets`.
Make sure the path is served (see static middleware above or `addons/` core serving).

### Register an Admin Dashboard Card

Any addon with an admin UI should register a card on the `/admin` dashboard. The card shows the addon's live `status()` message and a link to the admin page. No template editing needed — registration is sufficient.

```javascript
async register(engine, config) {
  const addonsManager = engine.getManager('AddonsManager');
  if (addonsManager) {
    addonsManager.registerDashboardCard({
      addonName: 'my-addon',   // must match your addon name
      title: 'My Addon',
      icon: 'fas fa-cog',      // any Font Awesome class
      adminUrl: '/addons/my-addon',
    });
  }
}
```

Cards render inside the Add-ons section on `/admin`. Page Management is the first row; Add-ons, with its cards, is below that. The card body displays `status().message` automatically.

### Seed Wiki Pages

Place `.md` files in your add-on's `pages/` directory. `AddonsManager` will copy them into the instance's pages directory automatically on startup.

> __Full reference:__ [`addon-page-handling.md`](../platform/addon-page-handling.md) covers where addon pages live (name-based source vs UUID-based runtime), what does and doesn't sync to an existing instance (additions ✅, updates/removals ❌), the orphan-file class, and the reseed gap ([#920](https://github.com/jwilleke/ngdpbase/issues/920)).

#### When does seeding run?

Seeding runs once per addon per server startup, inside `AddonsManager.loadAddon()`, immediately after the addon's `register()` function completes. It is __not__ triggered by install events or file-system watchers — a server restart is required to seed new pages.

#### UUID requirements

Each seed page __must__ have a valid UUID v4 in its frontmatter `uuid` field. The destination filename in the instance pages directory is always `{uuid}.md` — the source filename is ignored.

```markdown
---
title: My Addon Home
uuid: 4a266851-f3cd-4ba6-bbbe-5a408f3adf72
slug: my-addon-home
system-category: addon
addon: my-addon
author: my-addon
---

Welcome to my add-on.
```

Generate a UUID: `node -e "console.log(require('crypto').randomUUID())"`

A `title` and a `slug` are required too. If `uuid` is missing or is not a UUID (the seeder accepts the 8-4-4-4-12 hex form; the scaffolder writes a v4), or if `title` or `slug` is missing, the file is __skipped with a warning__ (an error log when the add-on is `domain`) and an admin notification, and not seeded. Pages that fail those checks are never written to disk.

#### Idempotency — existing pages are never overwritten

If `{uuid}.md` already exists in the instance pages directory, the seed file is silently skipped. This means:

- User edits to seeded pages survive restarts.
- Re-running the server never clobbers existing content.
- Deleting `{uuid}.md` and restarting does __not__ seed it again: the site's seeded-pages record treats a removed page as removed on purpose. Bring it back from Required Pages Sync (or restore it from the trash).

#### Auto-set frontmatter fields

`AddonsManager` stamps these frontmatter fields on every newly seeded page:

| Field | Value | Notes |
|-------|-------|-------|
| `addon` | the addon's name | Always set to the loading addon's name |
| `system-category` | source value, or `addon` | The source value when it has one |
| `addon-source-category` | the category applied | So a later source change can be told from an operator edit |
| `access` | the category default | Only when the source does not set `access` |
| `addon-source-hash` | hash of the body | What the reseed comparison uses |

#### A uuid the site already holds

If a live page already has that uuid, the seed leaves it in place. It does not compare the existing page's `addon` field, and it does not log a cross-addon conflict. Content is refreshed only under the reseed rules below.

A source page whose title or slug belongs to a __different__ uuid is not seeded. That is logged at info:

```
[AddonsManager] Shipped pages could not be seeded: <title> (<addon>/pages/<file>): <reason>
```

Use a freshly generated UUID for every seed page. Two files in the same `pages/` directory must not share one.

#### Updating seeded pages / admin reseed

By default seeding is __first-load only__: once a page exists in the instance it is skipped on every restart (see [Idempotency](#idempotency--existing-pages-are-never-overwritten) above), so operator edits are never clobbered.

__Pushing updated addon page content is supported__ two ways ([#920](https://github.com/jwilleke/ngdpbase/issues/920)):

- __Content-aware boot reseed__ — set `ngdpbase.addons.page-reseed: true` (default `false`). On each boot, a page is refreshed from source only when the source changed __and__ the instance copy is unmodified since seed (edited pages are skipped). Reseed keeps the UUID and records a revertable version. Safe to leave on ("keep addon pages in sync") or flip on → restart → off for a one-time sync.
- __On-demand via the admin UI__ — __Required Pages Sync__ at `/admin/required-pages` ([#513](https://github.com/jwilleke/ngdpbase/issues/513)) lists addon pages with status, previews would-update / would-skip, and applies on demand with no restart.

(The original first-boot seeding lives in the now-closed #442. There is no dedicated `POST /admin/addons/:addonName/reseed` REST route — the Required Pages Sync surface is the entry point.)

#### Overriding the Left Menu and Footer

Two special slugs let an add-on replace the instance-wide navigation and footer without editing system pages:

| File | Slug | Replaces |
|------|------|----------|
| `pages/left-menu-content.md` | `left-menu-content` | `LeftMenu` required page |
| `pages/footer-content.md` | `footer-content` | `Footer` required page |

When the server renders any page it checks for `left-menu-content` first; if found, it is used instead of `LeftMenu`. Same for `footer-content` vs `Footer`. This means an add-on can ship its own navigation without touching the core system pages.

Example `left-menu-content.md`:

```markdown
---
title: Left Menu Content
uuid: 0c0cb715-a46c-4a91-9189-9e05b7f9e95f
slug: left-menu-content
system-category: addon
addon: my-addon
author: my-addon
---
- <a href="/"><i class="fas fa-home"></i> Home</a>
- <a href="/search"><i class="fas fa-search"></i> Search</a>
- [My Feature One]
- [My Feature Two]
- [Recent Changes]
```

Example `footer-content.md`:

```markdown
---
title: Footer Content
uuid: 2b04424b-5541-41e5-b85c-dee161f66945
slug: footer-content
system-category: addon
addon: my-addon
author: my-addon
---
<small>**[{$applicationname}]** v[{$version}] | Powered by my-addon</small>
```

---

### Ship a Theme

Since v3.17.0 (issue #443): if your add-on ships a `theme/` subdirectory, ngdpbase auto-deploys it to the
instance's `themes/<addon-name>/` on __first boot__ — the same mental model as
`pages/`. This is how a domain add-on carries its site identity (e.g. the
`fairways` add-on ships the Fairways theme).

```
addons/my-addon/theme/
├── theme.json          ← REQUIRED — presence sentinel (no theme.json = not deployed)
├── css/
│   └── variables.css
└── assets/
    └── favicon.png
```

Behaviour:

- __First-boot copy.__ On add-on registration, if `theme/theme.json` exists
  and `themes/<addon-name>/` does __not__, the tree is copied. Logged as
  `[AddonsManager] Deployed theme from <addon>/theme/ → themes/<addon>/`.
- __Never overwrites.__ If `themes/<addon-name>/` already exists, the copy is
  skipped — operator customisations to the deployed theme are preserved. The
  add-on source is *not* re-synced automatically (it's a snapshot).
- __Activate it.__ Set `ngdpbase.theme.active` to the addon slug through
  `domainDefaults`, so it takes effect without operator config. The
  `package.json` shape is [Configuration](#configuration).

- __Manual re-deploy.__ `/admin/addons` shows a __Deploy Theme__ button
  (__Redeploy Theme__ once deployed) for any add-on that ships a theme. This
  overwrites `themes/<addon-name>/` with the add-on's current `theme/` — used
  to pull in upstream theme updates. No server restart needed (theme CSS is
  served as static files; a page reload suffices).

The instance themes root is `ngdpbase.theme.directory` (default `themes`).
`ThemeManager` is unchanged — it still reads `themes/<name>/`; deployment just
puts the files there.

> Drift note: because first-boot copy is a snapshot, theme changes you ship in
> a later add-on release are __not__ picked up until an operator clicks
> Redeploy. Direct-load (no-copy) resolution for domain add-ons is __not
> implemented and is not planned__ — [#444](https://github.com/jwilleke/ngdpbase/issues/444)
> was closed 2026-05-25 as superseded-by-practice, the auto-copy mechanism
> having run about a year without a complaint. Refile it if a concrete driver
> appears (a domain addon with theme-size or write-frequency concerns).

---

### Register an Optional Capability

Capability flags gate admin panel sections so disabled features are invisible, not broken.

```javascript
async register(engine, config) {
  engine.setCapability('my-addon', true);
}
```

Guard admin panel EJS sections:

```ejs
<% if (capabilities && capabilities['my-addon']) { %>
  <!-- my-addon admin section -->
<% } %>
```

---

### Declare a Private Store ([#1414](https://github.com/jwilleke/ngdpbase/issues/1414))

An addon that holds a user's own data — health records, finances, anything sensitive or regulated — owns a __store kind__: one private container per user, at `pages/vaults/{user}/{vaultid}/`. Reference: [`docs/private-stores.md`](../private-stores.md).

__You declare the kind. You do not implement encryption, keys, or recovery words.__

#### Declaring the kind

__Being reworked.__ Until [#1505](https://github.com/jwilleke/ngdpbase/issues/1505) an addon declared its kind in `package.json` `ngdpbase.stores`, and core saved it as `ngdpbase.stores.{id}.owner` / `.encrypt`. That mechanism is gone: no addon used it, and a vault kind is now a __system-category entry with a vault__ (`storageLocation.privatestore`), carrying its own `encrypt` and `owner` ([system-category.md](../system-category.md)). An addon will declare its own system-category, owned by its __slug__ ([#927](https://github.com/jwilleke/ngdpbase/issues/927)), in its manifest ([#1507](https://github.com/jwilleke/ngdpbase/issues/1507), [#1559](https://github.com/jwilleke/ngdpbase/issues/1559)). That declaration is not built. The journal vault is already an entry in core `config/app-default-config.json` (`pages/vaults/{user}/journal/`); `addons/journal` does not ship it.

What does not change:

- __`encrypt` is your call as the vault's owner__, not the end user's, and your declaration stands: sensitive or regulated data (a health-record addon, say) declares `encrypt: true`, and nobody turns it off. A copy keeps what it was created with.
- You do not implement encryption, keys or recovery words; core's door does.

#### When your addon is not running

Nothing is ever removed. The kind stays in configuration and every user's copy stays on disk, sealed if it was. The store's door is shut, and says why:

| Your addon | The door |
| --- | --- |
| loaded | open |
| enabled, failed to load | closed: temporarily unavailable |
| turned off | closed: the add-on that owns this store is turned off |
| not installed | closed: not installed on this site |

Turning your addon back on reopens it, with every user's keys as they were. An administrator turning it off is warned how many users hold data in each of your stores, and is never refused.

One rule is stated in the design and __not yet enforced by code__, so do not rely on it: that a kind's definition cannot be removed, nor its data purged, while any user still has data in it.

#### Core owns the door

Core implements the entry step, at `/stores/{kind}`. It derives the user's key material if they have none, generates the 12 recovery words, creates the user's copy of the store with its wrapped DEK, and shows the words __once__, with a confirmation step that discards everything if the words are not typed back. It runs at the user's deliberate entry — never at login, never mid-save.

Your addon's part:

- Link to `/stores/{your-kind-id}` where your set-up step belongs ("set up your health records").
- Assume the key exists once the door returns. By the time your addon writes anything, it does.

The door renders core's own wording around your `label` and `blurb`.

Your addon __never__ sees a KEK, a DEK or a recovery word, and must never ask for, store, or log one. There is no API that hands you key material, and there will not be.

#### What this buys you

- Reads and writes through the normal manager APIs; core seals the bytes and the store's own indexes.
- A user who never enters your store is never asked to keep recovery words.
- The store is self-contained on disk, so everything about it lives in one directory.

A user can take out their store and import it again ([#1387](https://github.com/jwilleke/ngdpbase/issues/1387), [#1472](https://github.com/jwilleke/ngdpbase/issues/1472)), and a site backup copies it as it is on disk. A vault's owner can share it: `ShareManager.issueVaultShare`, read-only, lasting at most the category's `shareMaxDays` ([#1388](https://github.com/jwilleke/ngdpbase/issues/1388)).

#### Where this is going ([#1477](https://github.com/jwilleke/ngdpbase/issues/1477))

The store kind is a system-category entry with a vault. Built:

- `storageLocation.privatestore` is `pages/vaults/{user}/{vaultid}/`. The folders moved off `pages/private/` in [#1506](https://github.com/jwilleke/ngdpbase/issues/1506).
- `encrypt`, `owner` and `defaultPrivate` (`true`, `false` or `choice`) live on that entry. Who may make a page public is the `page-public` policy, not an `allowPublic` field. `encrypt: true` keeps the vault's pages private.
- The door is still `/stores/{kind}`.

What is not built is the add-on declaring that entry in its manifest and core persisting it at first load ([#1507](https://github.com/jwilleke/ngdpbase/issues/1507), [#1559](https://github.com/jwilleke/ngdpbase/issues/1559)). Turning the addon off still loses nothing: the category stays valid, its public pages still show, and the vault shows the closed door. The target is defined in [system-category.md](../system-category.md). Retiring an addon for good (moving its pages out, then removing its category) is [#1490](https://github.com/jwilleke/ngdpbase/issues/1490).

---

## 4b. Add-on Route Views and Refusals: Core's Path, Never a Copy

One code path for what every page shows and for every refusal ([#1749](https://github.com/jwilleke/ngdpbase/issues/1749)). An add-on never builds its own.

__View data.__ A route that calls `res.render()` spreads core's template data first. It is exactly what core's own views get (`WikiRoutes.getCommonTemplateData`): the header, the left menu (through `PageManager.readChromePage`, honouring `ngdpbase.chrome.left-menu-page`), the CSRF token, the signed-in user. Then add the view's own fields:

```typescript
router.get('/', (req, res) => {
  void (async () => {
    res.render('my-view', { ...(await engine.templateData?.(req)), currentUser: req.userContext, /* ... */ });
  })();
});
```

Do not read the left menu or `req.session.csrfToken` yourself; a missing key makes the sidebar empty or every POST a CSRF 403.

__Who may act.__ Ask through `ApiContext`, as core's routes do. A refusal comes back as an `ApiError`; send it with `sendApiError`, never with your own `res.status(...)`. It sends the status, the message and, for a step-up, the way to sign in again (only this site's `/auth/reauth?` page), as JSON or, for a page route, as text:

```typescript
import { ApiContext, ApiError, sendApiError } from '../../../dist/src/context/ApiContext.js';

router.post('/thing', (req, res) => {
  void (async () => {
    try {
      const ctx = ApiContext.from(req, engine);
      await ctx.requirePermission('my-permission');
      // ...
    } catch (err) {
      if (err instanceof ApiError) { sendApiError(res, err); return; }   // 'text' for a page route
      res.status(500).json({ error: String(err) });
    }
  })();
});
```

Decisions, step-up and the step-up audit record all come from core this way. Do not call `PolicyInformationPoint` or `PolicyDecisionPoint` from a route to make your own gate.

---

## 5. Writing a Plugin

Plugins execute server-side during page render and return an HTML string.

```javascript
// plugins/MyPlugin.js
module.exports = {
  name: 'MyPlugin',

  /**
   * @param {object} context  - { engine, pageName, linkGraph }
   * @param {object} params   - key/value pairs from [{MyPlugin key='value'}]
   * @returns {string}        - HTML fragment
   */
  execute(context, params) {
    const myManager = context.engine.getManager('MyDataManager');
    const id = params.id || '';
    const record = myManager?.getById(id);
    if (!record) return `<span class="error">Not found: ${id}</span>`;
    return `<div class="my-widget">${record.name}</div>`;
  }
};
```

Invoked in wiki markup: `[{MyPlugin id='42' style='compact'}]`

### Plugins and the page cache

A rendered page is cached once, keyed by the viewer and their roles, and re-rendered when any data it read changes ([caching-developer-guide.md](caching-developer-guide.md), #1751). A plugin declares nothing: every manager it fetches through `context.engine.getManager(name)` is recorded as data the page read. Your add-on's manager announces each write once, at the door every write goes through:

```javascript
await engine.getManager('CacheManager')?.bump('MyDataManager');
```

The page then stays cached while nothing changes and is re-rendered on the next read after a write. A plugin whose output changes on its own (a clock) sets `volatile: true` on the plugin object; a page that runs it is not cached. Keep no reference to a manager from `initialize`: only fetches through `context.engine` are tracked.

---

## 6. Writing a Manager

Managers hold domain data and business logic. For an add-on a manager is just a plain
class — it does not need to extend `BaseManager` unless you want lifecycle hooks
(`initialize`, `shutdown`, `backup`, `restore`).

```javascript
// managers/MyDataManager.js
class MyDataManager {
  constructor(dataPath) {
    this.dataPath = dataPath;
    this.records = new Map();
  }

  async load() {
    // load from JSON file, SQLite, etc.
  }

  getById(id) {
    return this.records.get(id);
  }
}

module.exports = MyDataManager;
```

Register it in `register()` so plugins and routes can retrieve it:

```javascript
async register(engine, config) {
  const MyDataManager = require('./managers/MyDataManager');
  const mgr = new MyDataManager(config.dataPath || './data/my-addon');
  await mgr.load();
  engine.registerManager('MyDataManager', mgr);
}
```

---

## 7. Writing Routes

### ApiContext — authentication and authorisation

All addon API routes __MUST__ use `ApiContext` for any route that restricts access.
All addon API routes __SHOULD__ use `ApiContext` even for public routes — it gives you
caller identity for free and establishes a consistent pattern.

Do __not__ access `req.userContext`, `req.session`, or `req.session.isAuthenticated` directly
in route handlers. `ApiContext` wraps these correctly and handles TypeScript typing.

The request's types come with the host: `dist/src/context/ApiContext.d.ts` imports ngdpbase's `Request` augmentation (`req.userContext`, `req.session`), so an add-on that imports `ApiContext` sees those properties with no tsconfig entry and no copy of the type ([#1665](https://github.com/jwilleke/ngdpbase/issues/1665)). Typechecking outside the image also needs `@types/express`, `@types/express-session` and `@types/multer` installed; the CI that `create:addon --repo` generates installs them.

__`ApiContext.from()` always succeeds — it never throws for anonymous callers.__
On an unauthenticated request it returns a context with `isAuthenticated: false`
and the anonymous subject's username and roles. The guards (`requirePermission`,
then `actingUsername` for a per-person feature) are opt-in — a public route simply does not call them.
There is no "signed in" guard: whether an anonymous visitor may do something is a policy question,
answered by `requirePermission` ([#1430](https://github.com/jwilleke/ngdpbase/issues/1430)):

```typescript
// Fully public route — no guards, but ApiContext still used for consistency
// and in case you need ctx.isAuthenticated for conditional behaviour
router.get('/feed.ics', async (req, res) => {
  const ctx = ApiContext.from(req, engine); // safe for anonymous callers
  // ctx.isAuthenticated, ctx.username etc. available if needed
  const events = await mgr.query({ calendarId: 'events' });
  res.type('text/calendar').send(generateIcs(events));
});
```

```typescript
// routes/api.ts
import express from 'express';
import { ApiContext, ApiError } from '../../../dist/src/context/ApiContext.js';
import type { WikiEngine } from '../../../dist/src/types/WikiEngine.js';

export default function apiRoutes(engine: WikiEngine, _config: Record<string, unknown>) {
  const router = express.Router();

  // Public route — SHOULD use ApiContext for consistent caller identity
  router.get('/search', async (req, res) => {
    try {
      const ctx = ApiContext.from(req, engine);
      const mgr = engine.getManager('MyDataManager');
      const q = String(req.query.q || '');
      const results = await mgr.search(q);
      // Optionally filter results with await ctx.hasPermission('my-addon-read') — never ctx.roles
      res.json({ results });
    } catch (err) {
      if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
      res.status(500).json({ error: String(err) });
    }
  });

  // Protected route — MUST use ApiContext
  router.post('/items', async (req, res) => {
    try {
      const ctx = ApiContext.from(req, engine);
      await ctx.requirePermission('my-addon-manage'); // → 401 anonymous, 403 signed in, unless a policy grants it
      const username = ctx.actingUsername();          // only for a per-person feature: → 401 if nobody to act as

      const mgr = engine.getManager('MyDataManager');
      const item = await mgr.create(req.body, username);
      res.status(201).json(item);
    } catch (err) {
      if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}
```

### ApiContext reference

| Method / Property | Description |
|---|---|
| `ApiContext.from(req, engine)` | Build from an Express request — always succeeds |
| `ctx.isAuthenticated` | `true` if caller has an active session |
| `ctx.username` | Caller's username, or `null` for anonymous |
| `ctx.roles` | Caller's role array — always an array, never undefined. Never an allow or deny |
| `ctx.email` | Caller's email, or `null` |
| `await ctx.hasPermission(permission)` | `true` if policy grants the permission — deny policies and the token and share ceilings included |
| `await ctx.requirePermission(permission)` | Throws unless policy grants the permission: `ApiError(401)` for an anonymous caller, `ApiError(403)` for a signed-in one |
| `ctx.actingUsername()` | The signed-in username a per-person feature acts as; throws `ApiError(401)` if nobody is signed in. Ask it after `requirePermission` |
| `ctx.engine` | Reference to the engine |

`ApiError` carries a `status` number — catch it and forward to `res.status(err.status)`.

There is no `hasRole` / `requireRole`, and no `requireAuthenticated`: a role name, or being signed in, skips the policy evaluator, deny policies and the agent-token ceiling ([security-developer-guide.md](security-developer-guide.md)). Declare the permission and grant it as in [Permissions](#permissions), then ask for it. The journal and calendar addons are worked examples:

- the journal declares `journal-read`, `journal-write` and `journal-export`, in one `journal-access` policy;
- calendar declares `calendar-manage` (admin) and `calendar-reserve` (every role that can sign in).

---

## 8. Background Jobs

`BackgroundJobManager` runs two kinds of job: one that runs when something asks for it, and one that runs by itself on a schedule. Register both in `register()`. The design and its decisions are on [#1611](https://github.com/jwilleke/ngdpbase/issues/1611); the manager's reference is [BackgroundJobManager.md](../managers/BackgroundJobManager.md).

### A job that runs when asked

```javascript
jobManager.registerJob({
  id: 'my-addon.reindex',
  displayName: 'My Addon — Reindex',
  async run(reportProgress, ctx) {
    reportProgress('Starting...');
    // ... ctx names who asked (#631): use it for any permission check or record ...
    return { success: true, summary: 'Reindexed 120 items' };
  }
});

// From a route, as the person asking:
const runId = await jobManager.enqueue('my-addon.reindex', jobContextFromRequest(req.userContext));
```

`enqueue` returns at once; `getStatus(runId)` gives progress. A job enqueued again while it runs returns the run already going.

__If the server restarts mid-run__ the run is never lost silently. By default it is reported: recorded as failed, audited, and an error notification tells the admins to run it again. Declare `persist: true` when running the job again does no harm — a rebuild, a reindex — and it is restarted instead, as the person who asked, with `ctx.resume` and its last checkpoint. Add `permission: '<the permission your route checks>'` and the restart happens only if that person still holds it. Leave `persist` off for work that must not repeat unchecked, such as an import that would post twice.

### A job that runs on a schedule

```javascript
jobManager.registerJob({
  id: 'my-addon.month-close',
  displayName: 'My Addon — Month close',
  schedule: 'end-of-month 06:00',          // or { rrule: 'FREQ=MONTHLY;BYMONTHDAY=-1;BYHOUR=6;BYMINUTE=0', tz: 'America/New_York' }
  catchUp: 'latest',                       // none | latest | all
  overlap: 'queue',                        // queue | skip
  timeout: 2 * 60 * 60_000,                // ms; scheduled default 1 h; 0 = no limit
  maxAttempts: 3,
  async run(reportProgress, ctx) {
    const start = ctx.resume?.checkpoint?.doneThrough ?? 0;
    for (let n = start + 1; n <= accounts.length; n++) {
      if (ctx.signal.aborted) return { success: false, error: 'stopped' };
      await closeAccount(accounts[n - 1], ctx.slot);    // safe to repeat for the same slot
      ctx.checkpoint({ doneThrough: n });
    }
    return { success: true, summary: `Closed ${accounts.length} accounts for ${ctx.slot}` };
  }
});
```

Nothing else is needed: the scheduler finds the slots, runs each once, and keeps what it must across restarts.

__The schedule.__ An iCalendar recurrence rule (RFC 5545 RRULE), or one of these shorthands, each an optional `HH:MM` (default 00:00):

| Shorthand | Runs |
|---|---|
| `hourly` | on the hour |
| `daily 06:00` | every day |
| `weekly MO 06:00` | one day a week (`MO` … `SU`) |
| `every 15m`, `every 6h`, `every 30d 06:00` | at that interval |
| `start-of-month`, `end-of-month` | the 1st; the last day |
| `last-business-day` | the last Monday–Friday of the month |
| `end-of-quarter` | the last day of March, June, September, December |
| `start-of-year` | 1 January |

- An RRULE goes in as `FREQ=…`, or as `{ rrule, tz, dtstart }`. Interval rules (`every 30d`) count from `dtstart`, default `2000-01-01T00:00:00`, so their phase is the same on every start.
- The time zone is `tz`, else `ngdpbase.default.timezone`. Daylight saving does what a person expects: a time skipped in spring runs at the next valid instant; a time repeated in autumn runs once.
- A date that does not exist is skipped, as RFC 5545 says: `BYMONTHDAY=31` skips short months. The last day of a month is `BYMONTHDAY=-1`.
- `FREQ=SECONDLY` and slots closer than `ngdpbase.jobs.min-interval-ms` (default 60 s) are refused. A schedule that does not compile throws from `registerJob`, naming the job: it is your error at start, never a job that silently never runs.
- Cron is not accepted.

__The job id__ is `<slug>.<job>`: lowercase letters and digits, joined by single dots or dashes. It names the job's state files and the operator's override keys.

__What the run is handed__ (`ctx`, a `JobRunContext`):

| Field | |
|---|---|
| `username`, `origin`, `reason` | Who it runs as. A scheduled run is the system principal with origin `schedule`; an admin's "run now" or rerun is that admin. Permission checks the job makes ask with this, as in [security-developer-guide.md](security-developer-guide.md). |
| `slot` | The slot's instant (ISO, UTC), or `null` for a run nobody scheduled. Key your work on it. |
| `signal` | Aborted at the timeout and at shutdown. A long job checks it and stops. |
| `resume` | `null` on a first attempt; on a later one `{ attempt, checkpoint, reason }`. |
| `checkpoint(data)` | Saves a bookmark the next attempt gets back. |

__Catch-up and overlap.__ Slots missed while the server was down or the job idle follow `catchUp`: `none` runs only a slot that has just come due, `latest` (the default) runs the newest once, `all` runs the newest 12, oldest first. Slots that came due while the job was still running follow `overlap`: `queue` (the default) keeps one waiting, `skip` keeps none. One job never runs twice at once. Every slot passed over is recorded and audited (`job-skipped`), never dropped silently.

__Attempts.__ A failed attempt — an error, a timeout, `success: false`, or the server stopping mid-run — is tried again after 1, 5, then 15 minutes, with the same run id and slot, up to `maxAttempts` (default 3). After the last the slot is failed, audited and notified, and the next slot runs as usual.

__Idempotent per slot.__ A slot can run more than once: a retry, a resume after a crash, an admin's rerun. So doing the slot's work again must change nothing it already did. "Close account X for October" checks whether it is closed and skips it if so.

__Checkpoint or start again.__ A process that stops loses everything in memory: its place in the loop, running totals, results not yet written, open connections. What survives is what was written. A job that wants to continue rather than start again saves a bookmark as it goes:

- __With a checkpoint__: the month close saves `{ doneThrough: 311 }`; on resume `ctx.resume.checkpoint` gives it back and it carries on at 312.
- __Without one__: it starts the slot again from account 1. That is safe only because closing an account twice changes nothing.

A checkpoint is a bookmark, not storage for results: JSON, at most `ngdpbase.jobs.max-checkpoint-bytes` (64 KiB; larger throws to the job), written at most once every 5 s with the latest winning, and once more when the run ends. Deleted when the slot succeeds, kept when it fails. Results go where the addon keeps its data.

__Timeouts and shutdown.__ At its `timeout` the run's `signal` is aborted, and it is failed as timed out. On SIGTERM or SIGINT every running job's `signal` is aborted and it gets `ngdpbase.jobs.shutdown-grace-ms` (default 5 s) to stop; the run is then saved as interrupted with its last checkpoint, and the next start resumes it at once without counting an attempt. A hard kill does not get that far: the run resumes once its lock expires, as its next attempt.

__`persist`__ (default `true` for a scheduled job) keeps slots, history and locks in FAST_STORAGE, or the application database. `persist: false` keeps them in memory: no catch-up after a restart, no lock, no resume. Use it only for a harmless tick whose next run does the same work.

__Do not use `setInterval` for recurring work.__ A timer catches nothing up after downtime, runs twice during a rolling update, records nothing when it misses, and is not stopped cleanly at shutdown. Register a scheduled job instead.

__What the operator controls__, without changing your code: `ngdpbase.jobs.<id>.schedule` replaces the schedule, `ngdpbase.jobs.<id>.enabled: false` pauses it, and Admin → Scheduled Jobs runs it now, reruns a skipped or failed slot, or retries a waiting run. See [Scheduled Jobs](../admin/Scheduled-Jobs.md).

__Testing a scheduled job.__ Construct `BackgroundJobManager` with `{ stateProvider, now }` (a `FileJobStateProvider` in a temporary directory and your own clock), register the job, move the clock, call `tick()`, then `whenIdle()`. A second manager over the same directory is a restart. `src/managers/__tests__/BackgroundJobManager.scheduler.test.ts` shows each case.

---

## 9. Dependency Example

If your add-on requires another to be loaded first:

```javascript
module.exports = {
  name: 'volcano-maps',
  dependencies: ['volcano-wiki'],   // volcano-wiki loads before volcano-maps
  async register(engine, config) {
    const volcanoMgr = engine.getManager('VolcanoDataManager');
    // ...
  }
};
```

`AddonsManager` resolves load order via topological sort. It will error at startup if a
declared dependency is not installed or not enabled.

---

## 10. Development Workflow

1. Edit files in your add-on repo. A TypeScript add-on in this repo needs `npm run build:addons` (or `npm run build`) so `index.js` is current; a plain-JS add-on has no compile step
2. `./server.sh restart` to pick up changes
3. Check logs: `pm2 logs` or `./server.sh logs`
4. Visit `/admin` → Add-ons section to verify load status and `status()` output

For faster iteration on routes/logic without full restart, you can temporarily
`require()` your module inside a route handler and `delete require.cache[...]` —
but a restart is the reliable path.

### Contributing Core Improvements Upstream

If you discover a missing API or bug in the core during add-on development:

1. Fix it in the `ngdpbase` repo
2. Commit and restart
3. Continue add-on development

Keep core PRs self-contained — no add-on-specific code in the core repo.

---

## 11. Add-on Checklist

- [ ] `name` exported from `index.ts` or `index.js` matches `ngdpbase.slug` and the `ngdpbase.addons.<slug>` config key
- [ ] `"ngdpbase.addons.my-addon.enabled": true` in instance config
- [ ] `addons-path` in instance config points to the repo's `addons/` directory (string or array of strings)
- [ ] Static assets mounted via `engine.app.use()` in `register()`
- [ ] `engine.setCapability('my-addon', true)` called if you have admin UI sections
- [ ] `addonsManager.registerDashboardCard(...)` called if you have an admin UI page
- [ ] `status()` returns `{ healthy: bool, message: string }` for admin health display
- [ ] `shutdown()` closes any open connections or file handles
- [ ] Recurring work is a scheduled job with an id `<slug>.<job>`, safe to run again for the same slot, honouring `ctx.signal` — no `setInterval`
- [ ] Dependencies declared in `dependencies[]` if your add-on relies on another
- [ ] Every restricted route asks `requirePermission` / `hasPermission` for a permission the addon declares and grants by policy — no role name anywhere; its actions emit their declared audit events ([security-developer-guide.md](security-developer-guide.md), [audit-developer-guide.md](audit-developer-guide.md))
- [ ] Host code is imported through `dist/…`, never `src/…` — `npm run lint:addons` and `npm run check:addon-load` are green
- [ ] Seed pages in `pages/` have a title, a slug, and a real UUID v4 in frontmatter (`uuid`). The instance file is `{uuid}.md`; the source filename is not
- [ ] `pages/left-menu-content.md` and `pages/footer-content.md` present if the add-on owns the UI chrome
- [ ] If shipping a theme: `theme/theme.json` present (sentinel) and `domainDefaults` sets `ngdpbase.theme.active`
- [ ] If the addon holds a user's own data: its vault is a system-category entry (manifest declaration is not built — [#1507](https://github.com/jwilleke/ngdpbase/issues/1507), [#1559](https://github.com/jwilleke/ngdpbase/issues/1559); the journal entry lives in core config today), sensitive or regulated data sets `encrypt: true`, the set-up step links to the core door, and no key material or recovery word is read, stored or logged ([#1414](https://github.com/jwilleke/ngdpbase/issues/1414))

---

## 12. Shipping Your Addon as a Container Image

This section is the drop-in wrapper: an addon in __its own repo__, layered onto the published ngdpbase image with `COPY addons`. It does not apply to bundled addons, which are already in `ghcr.io/jwilleke/ngdpbase`. The packaged model (an npm package, no `COPY addons`) is [Where it is loaded](#where-it-is-loaded) and [addon-packaged.md](../platform/deployment/addon-packaged.md).

### What ngdpbase publishes for you

On every `v*` tag, `.github/workflows/docker-build.yml` in `jwilleke/ngdpbase` builds and pushes a container image:

| Tag | Example | Stability |
|---|---|---|
| `<major>.<minor>.<patch>` | `ghcr.io/jwilleke/ngdpbase:3.11.3` | Pinned to a specific release — recommended for production |
| `<major>.<minor>` | `ghcr.io/jwilleke/ngdpbase:3.11` | Floats with patch releases — picks up CVE patches automatically |
| `<major>` | `ghcr.io/jwilleke/ngdpbase:3` | Floats with minor releases — features land without you opting in |
| `latest` | `ghcr.io/jwilleke/ngdpbase:latest` | Default-branch tip — fine for evaluation, never for production |

The image is the only container artifact ngdpbase produces. There is no published Dockerfile template, no codegen, no platform-side hook system. You consume the image via `FROM` in your own Dockerfile.

### Recommended Dockerfile pattern

Layer your addon on top of the published ngdpbase image. Example from [`jwilleke/geohazardwatch/Dockerfile`](https://github.com/jwilleke/geohazardwatch/blob/main/Dockerfile):

```dockerfile
# renovate: datasource=docker depName=ghcr.io/jwilleke/ngdpbase
ARG NGDPBASE_VERSION=3.11.3
FROM ghcr.io/jwilleke/ngdpbase:${NGDPBASE_VERSION}

LABEL org.opencontainers.image.title="my-addon-site"
LABEL org.opencontainers.image.source="https://github.com/<you>/<your-addon-repo>"

WORKDIR /opt/<slug>

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY addons ./addons

WORKDIR /app
```

Key points:

- The `# renovate: datasource=docker depName=...` annotation on the line above `ARG` is what makes the auto-bump (next section) work. Without it Renovate ignores the ARG.
- `--ignore-scripts` skips `prepare` (husky). Husky is a devDependency, not present under `--omit=dev`, and the missing `husky` binary would crash `npm ci` with exit 127 in the runtime container.
- `WORKDIR /app` at the end matches ngdpbase's working directory so the inherited `CMD` and `ENTRYPOINT` from the base image still resolve correctly.
- The addon code is mounted into the runtime via `addons-path` config (typically supplied through a Kubernetes ConfigMap or a `-v /opt/<slug>:/opt/<slug>` bind mount, plus `"ngdpbase.managers.addons-manager.addons-path": ["/opt/<slug>/addons"]` in the instance config).

### Auto-bump with Renovate

Without automation, the `ARG NGDPBASE_VERSION` default rots. ngdpbase ships `v3.11.3` → your image still pulls `v3.10.3` → your container is missing CVE patches.

Add `renovate.json` to your addon repo:

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended"],
  "packageRules": [
    {
      "matchDatasources": ["docker"],
      "matchPackageNames": ["ghcr.io/jwilleke/ngdpbase"],
      "automerge": false,
      "labels": ["dependencies", "ngdpbase-bump"],
      "commitMessageTopic": "ngdpbase",
      "groupName": "ngdpbase upstream"
    }
  ]
}
```

Enable Renovate on the repo (GitHub App or self-hosted). On every ngdpbase release, Renovate opens a PR that:

1. Bumps the `ARG NGDPBASE_VERSION=...` default in your Dockerfile.
2. Includes the upstream changelog/release notes from `ghcr.io/jwilleke/ngdpbase`'s OCI labels.
3. Triggers your CI to rebuild the image against the new base.

Reviewer merges → CI publishes a fresh combined image → your container is current. This is the __deterministic method for container deployment builds__ referenced in [#668](https://github.com/jwilleke/ngdpbase/issues/668): the platform handles publishing, Renovate handles propagation, no codegen required on either side.

If you prefer Dependabot, the equivalent `.github/dependabot.yml` entry is:

```yaml
version: 2
updates:
  - package-ecosystem: "docker"
    directory: "/"
    schedule:
      interval: "daily"
```

Renovate is recommended over Dependabot here because Renovate's `datasource=docker` annotation in the Dockerfile lets it find the ARG without the file being a literal `FROM image:tag` line — Dependabot only inspects literal `FROM` lines and won't pick up an ARG-driven version.

### What lives where

| Concern | Where it's owned |
|---|---|
| Building/publishing the ngdpbase image | `jwilleke/ngdpbase` (`.github/workflows/docker-build.yml`) — fully automated |
| Building/publishing the combined addon-site image | Your addon repo (your own Dockerfile + your own CI workflow) |
| Bumping the `FROM` version | Renovate/Dependabot in your addon repo — fully automated |
| Runtime addon registration | `addons-path` config on the deployed instance (ConfigMap, `.env`, etc.) |

ngdpbase does not need to know your addon exists. Your addon repo does not need to know how ngdpbase is built. The only contract between them is: ngdpbase publishes images at `ghcr.io/jwilleke/ngdpbase:<version>`; you consume them with `FROM`.

---

## Related

| Resource | Contents |
|----------|----------|
| [`addons/journal/`](../../addons/journal/) | Worked example — personal journal, permissions in `config/default-config.json` |
| [`addons/calendar/`](../../addons/calendar/) | Worked example — calendar; depends on `forms` |
| [`addons/forms/`](../../addons/forms/) | Schema-driven forms. Enable it when you enable calendar |
| [`docs/platform/addon-architecture.md`](../platform/addon-architecture.md) | Load order and the module contract |
| [`docs/platform/addon-identity-contract.md`](../platform/addon-identity-contract.md) | Every place a slug is written |
| [`docs/platform/addon-page-handling.md`](../platform/addon-page-handling.md) | What syncs to an existing instance |
| [`docs/platform/deployment/addon-packaged.md`](../platform/deployment/addon-packaged.md) | npm discovery and the two-stage image |
| [`docs/platform/ngdp-as-platform.md`](../platform/ngdp-as-platform.md) | Platform overview and roadmap |
| [`docs/platform/platform-core-capabilities.md`](../platform/platform-core-capabilities.md) | All built-in managers and APIs |
| [`docs/private-stores.md`](../private-stores.md) | Private stores: layout, store kinds and the door, keys and recovery words, access, pages, links, search, trash and files |
| [AddonsManager source](../../src/managers/AddonsManager.ts) | Discovery, loading, lifecycle implementation |
| [security-developer-guide.md](security-developer-guide.md) | Authorization and context — mandatory; its [Addons](security-developer-guide.md#addons) section covers the config merge |
| [audit-developer-guide.md](audit-developer-guide.md) | Audit events — mandatory |
| [security-posture.md](../security-posture.md), [audit-posture.md](../audit-posture.md) | The standing law those guides apply |
| [configuration-developer-guide.md](configuration-developer-guide.md) | Merge layers |
| [`addons/README.md`](../../addons/README.md) | The addons that ship in this repository |
| [`docs/managers/AddonsManager.md`](../managers/AddonsManager.md) | AddonsManager: discovery, registration, lifecycle, dependencies |
| [`docs/system-category.md`](../system-category.md#system-categories-that-add-ons-bring) | System categories an addon brings |
| [`docs/platform/page-overrides.md`](../platform/page-overrides.md#how-add-ons-ship-default-overrides) | How an addon ships default overrides of special pages |
| [`docs/theming.md`](../theming.md#add-on-stylesheet-registration) | Registering an addon stylesheet |
| [`docs/platform/deployment/how-to-deploy.md`](../platform/deployment/how-to-deploy.md#3-deliver-addons) | Delivering addons to a deployment: bundled, drop-in, packaged |
| [`docs/platform/deployment/docker-compose.md`](../platform/deployment/docker-compose.md#adding-addons) | Addons under Docker Compose: derivative image or volume |
| [`docs/platform/deployment/kubernetes.md`](../platform/deployment/kubernetes.md#wrapper-image-vs-runtime-mounted-addons) | Addons under Kubernetes: wrapper image or runtime mount |
| [`docs/platform/deployment/direct-install.md`](../platform/deployment/direct-install.md#addon-discovery-failures) | Addon discovery failures on a direct install |
| [`docs/related-repositories.md`](../related-repositories.md) | Repositories and deployments that ship addons |
| [`docs/Forms-to-Calendar.md`](../Forms-to-Calendar.md) | One addon feeding another: forms to calendar |
| [`docs/planning/addons.md`](../planning/addons.md) | Domain addons: planning notes and open questions |

## How you know you are done

- The checks in [Testing and lint](#testing-and-lint), including `npm run lint:addons` and, after a build, `npm run check:addon-load`
- The security guide's and the audit guide's "How you know you are done" checks
- `npm run create:addon -- --id …`, then the enable key, then `./server.sh restart`, and the addon listed under `/admin` → Add-ons

## Known gaps

- [#686](https://github.com/jwilleke/ngdpbase/issues/686) — an addon discovered outside the default `./addons` path still starts disabled; the operator has to set `ngdpbase.addons.<slug>.enabled` to `true`.
- [#1209](https://github.com/jwilleke/ngdpbase/issues/1209) — closed. `lint:audit` and `lint:addons` are already on the pre-commit hook.

---

Last updated: 2026-10-09
