# Addon Identity Contract

> See also: [`addon-development-guide.md`](./addon-development-guide.md), [`addon-architecture.md`](./addon-architecture.md).

An addon picks a single short identifier — a slug — and that slug is wired into more than a dozen places. They all have to agree, because ngdpbase resolves config keys, mount paths, and capability flags by exact-string match. Picking the slug carelessly, or renaming it later, is a coordinated change across runtime, build, config, and content.

This doc lists every place an addon's slug appears, what it's used for, and what breaks if any of them drift. The rules apply identically whether the addon is __bundled__ (in `addons/`), __drop-in__ (under a configured `addons-path`), or __packaged__ (an npm dependency under `node_modules/`); see [`addon-architecture.md` § Distribution Models](./addon-architecture.md#distribution-models). Examples below show the bundled path because it's the most common, but the slug requirements are the same for the other two models.

---

## Pick the slug once

Before writing any addon code, pick a slug. It should be:

- All lowercase, hyphenated (`my-addon`, `geohazardwatch`).
- Short enough to live comfortably in URLs and config keys.
- Unique within any ngdpbase instance the addon will run in (no two addons can share a mount).
- Stable. Renaming later is breaking — see [Renaming](#renaming) below.

This is your __addon slug__. The rest of this doc treats it as `<slug>`.

---

## Where the slug appears

The slug is the string that has to match across all of these:

### 1. Repository / package

| Location | Form | Why it matters |
|----------|------|---------------|
| Repo's root `package.json` `name` field | `<slug>` | npm metadata; appears in `npm run` output, install logs |
| Addon directory under `addons/` | `addons/<slug>/` | This path is what `AddonsManager` discovers and loads |
| `package.json` `scripts` paths (e.g. import scripts) | `node addons/<slug>/import/*.js` | Breaks if the directory and the script paths disagree |
| `.gitignore`, `.dockerignore` data patterns | `addons/<slug>/data/...` | Stale patterns silently let generated data files into commits or images |

### 2. Addon module (`addons/<slug>/index.js`)

| Field / call | Form | Notes |
|--------------|------|-------|
| `module.exports.name` | `'<slug>'` | The canonical identity returned to `AddonsManager` |
| API router mount | `engine.app.use('/api/<slug>', apiRouter)` | Public REST URL surface |
| Static/admin mount | `engine.app.use('/addons/<slug>', ...)` | Public asset and admin URL surface |
| Stylesheet registration | `addonsManager.registerStylesheet('/addons/<slug>/css/<slug>.css', '<slug>')` | Both the URL and the registration key carry the slug |
| Default `dataPath` | `config.dataPath \|\| './data/<slug>'` | Conventional location for addon-owned data |
| Background job IDs | `'<slug>.import-foo'`, `'<slug>.refresh-bar'` | Job IDs are global — namespace by slug to avoid collisions |
| Capability flag | `engine.setCapability('<slug>', true)` | Other addons / the platform may gate behavior on this |
| Dashboard card | `{ addonName: '<slug>', adminUrl: '/addons/<slug>' }` | The `addonName` is the registry key; `adminUrl` is what the user clicks |

### 3. Config keys

The platform resolves addon config from flat dot-notation keys scoped to the slug:

```jsonc
{
  "ngdpbase.addons.<slug>.enabled": true,
  "ngdpbase.addons.<slug>.dataPath": "./data/<slug>",
  "ngdpbase.addons.<slug>.<anyOtherOption>": "..."
}
```

`AddonsManager.getAddonConfig()` strips the `ngdpbase.addons.<slug>.` prefix and passes the rest to `register(engine, config)`. The slug in the key __must__ match `module.exports.name`, or the addon receives empty config.

The addon's `addons/<slug>/config/default-config.json` (if it ships defaults) uses the same fully-qualified keys.

### 4. Sub-resources inside the addon

These appear inside the addon's own files and reference the slug-rooted URL surface:

| File type | Slug appears in |
|-----------|-----------------|
| `routes/admin.js` | Job-enqueue calls (`jm.enqueue('<slug>.import-foo')`), redirect URLs (`res.redirect('/addons/<slug>?...')`), `res.render('admin-<slug>', …)` |
| `routes/api.js` | Doc comments documenting endpoints (`GET /api/<slug>/...`) |
| `views/admin-<slug>.ejs` | Template filename, plus form `action` URLs (`/addons/<slug>/jobs/...`) |
| `plugins/*.js` | Hardcoded `fetch('/api/<slug>/...')` and `<link>` / `<script>` URLs to `/addons/<slug>/...` |
| `public/css/<slug>.css` | The CSS filename matches the slug by convention |

Anything client-rendered that calls back into the addon's own routes hardcodes `/api/<slug>` or `/addons/<slug>` — those paths exist only because the addon mounted them under that slug.

### 5. Build and CI

| Location | Slug appears in |
|----------|-----------------|
| `Dockerfile` | OCI labels (`org.opencontainers.image.title`, `image.description`), comments |
| GitHub Actions workflows | `IMAGE_NAME`, label values, smoke-test names |
| Version-bump utilities | If the script edits `addons/<slug>/index.js` to update the version field, the path is hardcoded |

### 6. Wiki content (seeded pages)

| Location | Slug appears in |
|----------|-----------------|
| `pages/<slug>-*.md` filenames | By convention, seed pages are prefixed with the slug |
| Frontmatter `slug:` field | `<slug>-about`, `<slug>-plugins`, etc. — these become `/wiki/<slug>-about` URLs |
| Frontmatter `addon:` and `author:` fields | Set to the slug for traceability |
| Cross-links between seed pages | If About links to Plugins as `/wiki/<slug>-plugins`, the slug is embedded in the prose |

### 7. Documentation

`README.md`, `AGENTS.md`, `ARCHITECTURE.md`, `SETUP.md`, `CHANGELOG.md`, the addon's own `README.md`, and any docs that quote URLs, config keys, or directory paths all carry the slug.

---

## Display name vs slug

The slug is a machine identifier. The __display name__ is what humans see in the dashboard, page titles, and prose. They don't have to match.

A typical pattern: slug `geohazardwatch`, display name `GeoHazardWatch`. Display name appears in:

- The addon's dashboard card `title`
- EJS view headings
- Prose in seed pages and READMEs

The display name is free text; renaming it has no runtime impact, only UX impact.

---

## Renaming

Renaming an addon's slug is a __breaking change__. Every place listed above has to update in lockstep, and every consumer of the old identity breaks.

### What breaks for the operator

- `app-custom-config.json` keys under `ngdpbase.addons.<old-slug>.*` are no longer read. The operator must rewrite them under the new slug. The platform doesn't auto-migrate.
- Any URL bookmarks or external links to `/api/<old-slug>/*` or `/wiki/<old-slug>-*` 404.
- Cron jobs or scripts that POST to `/addons/<old-slug>/jobs/*` 404.
- Existing wiki pages seeded under the old slug __stay__ at the old slug. `seedAddonPages` only runs when the slug-derived seed marker is missing — for an existing instance, the old pages remain at the old URLs unless the operator manually moves or recreates them.

### What breaks for downstream addons

- Any addon that checks `engine.getCapability('<old-slug>')` won't see it set.
- Any addon that reads data at `./data/<old-slug>/...` won't find it (unless the operator also renames the directory or sets `dataPath` explicitly).

### Recommended approach

1. Decide whether the rename is worth the breakage. Cosmetic renames usually aren't.
2. If yes, do the rename in one coordinated change (all 7 categories above), not piecemeal.
3. Run lint/tests; the lint output and the boot log of a fresh instance are the cheapest sanity checks that nothing was missed.
4. Document the rename and the operator migration steps in `CHANGELOG.md` — explicitly call it BREAKING and list the config-key change.
5. Leave the historical CHANGELOG and project-log entries alone. They describe events that happened; rewriting them to use the new slug would erase the rename event itself.

---

## Audit checklist

When renaming or auditing an addon's identity, grep the repo for the slug and confirm every match falls into one of the seven categories above:

```sh
grep -rn --exclude-dir=node_modules --exclude-dir=.git "<slug>" .
```

Anything that doesn't fit one of those categories is either a stray reference to fix or a category this doc missed — please update this doc if you find one.
