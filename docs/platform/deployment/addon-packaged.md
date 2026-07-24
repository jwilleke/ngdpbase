# Packaged Addons (npm distribution)

> See also: [`addon-architecture.md`](../addon-architecture.md) for the three distribution models, [`addon-development-guide.md`](../addon-development-guide.md) for building an addon, and [`addon-page-handling.md`](../addon-page-handling.md) for how an addon's pages seed/update. This document covers the **`packaged`** model (#673): shipping an addon as an npm package discovered from `node_modules`.

---

## What it is

An addon published as an **npm package** and discovered from `node_modules/<scope>/<slug>-addon/` after `npm install`. It reaches a running instance the same way any dependency does — pinned in `package.json`, integrity-locked in `package-lock.json`, tracked by Renovate against npm semver.

It uses the **identical** slug / module / `register()` contract as `bundled` and `drop-in` addons. Only *discovery* changes: instead of scanning a directory, `AddonsManager` expands a `node_modules:<glob>` entry.

## When to use which model

| Model | Use it for | Trade-off |
|---|---|---|
| **bundled** (`addons/<slug>/` in this repo) | First-party addons that ship *with* ngdpbase and release on its cadence (feeds, calendar, journal, forms, elasticsearch) | Coupled to ngdpbase releases; not for third parties |
| **drop-in** (a directory in `addons-path`) | Local development, quick iteration, or a simple/private addon copied into the image / mounted as a volume | No version pinning — "whatever is in the directory at boot" (the drift that caused #672) |
| **packaged** (`npm install`) | **Production distribution of an independent addon** — versioned, lockfile-pinned, Renovate-tracked; installable into a *generic* ngdpbase image with no bespoke Dockerfile. **The recommended model for `type: 'domain'` addons in production** (see below) | Requires an npm registry + a publish step |

### Policy

- **`type: 'domain'` addons → `packaged` for production, `drop-in` for development.** A domain addon is a whole downstream product built on ngdpbase (e.g. `geohazardwatch`) — the most independent kind, deployed to production, versioned on its own cadence. That is precisely the case `packaged` exists for, and precisely the case that hit the #672 version-drift outage under `drop-in`. Develop it as a `drop-in` (edit-in-place, no publish cycle); ship it to production as a `packaged` npm dependency.
- **`bundled`** stays the model for first-party addons that are part of ngdpbase's release surface.
- **`drop-in`** remains supported and is the right choice for local development and truly private one-offs where standing up a registry isn't worth it.

All three remain first-class — the platform makes no trust distinction between them. The recommendation is about *how to ship*, not what an addon may do.

### Migrating a domain addon from drop-in to packaged

A domain addon today typically owns its whole image (`FROM ngdpbase + WORKDIR + npm ci + COPY addons + labels`). Going packaged relocates that:

| Today (drop-in image) | Packaged |
|---|---|
| `COPY addons ./addons` | `RUN npm install @scope/<slug>-addon@x.y.z` into a generic ngdpbase image |
| the addon's own deps via its `npm ci` | the addon package's `dependencies` — pulled transitively by the install |
| image `LABEL`s / branding | deployment config (`ngdpbase.application-name`, theme) or a thin wrapper image |
| runtime data volume (quakes/HANS/etc.) | **unchanged** — stays mounted; never was in the image |
| `NGDPBASE_VERSION` ARG bump (base image) | **still the base image pin** — but now *independent* of the addon version, each pinned + Renovate-tracked separately |

Net: the bespoke per-addon image collapses to a generic base image + one `npm install` line + config. The two version axes (ngdpbase base, addon package) decouple, which is what removes the drift.

> **Audit every deployment artifact that references the addon's drop-in path directly — not just the main Dockerfile.** CronJobs, init containers, sidecars, and debug/exec scripts that hardcode the old drop-in layout (e.g. `workingDir: /opt/<slug>`, `node addons/<slug>/import/*.js`) break **silently on their next scheduled run** rather than at deploy time, because the packaged model changes where the addon's files physically live (`node_modules/<scope>/<slug>-addon/`, not `addons/<slug>/` or `/opt/<slug>/`). Image-automation (e.g. Flux) will happily bump such a job's pinned tag to the new packaged image with nothing positioned to catch the broken path. Grep your whole deployment — every manifest, not just the app Deployment — for the old path before cutting over. (Surfaced in geohazardwatch#152: a daily data-import CronJob was a second, independent consumer of `/opt/geohazardwatch` and was not on the migration checklist.)

## How discovery works

Add a `node_modules:<glob>` entry to `addons-path`:

```json
"ngdpbase.managers.addons-manager.addons-path": [
  "/app/addons",
  "node_modules:@jwilleke/*-addon"
]
```

- Entries **not** prefixed `node_modules:` are directory paths (bundled/drop-in), resolved to absolute and scanned as before.
- A `node_modules:<glob>` entry is a package glob. `@scope/name-glob` matches `node_modules/@scope/<name-glob>`; a bare `glob` matches top-level `node_modules/<glob>`. Matching uses `minimatch` against the package directory name.
- **npm discovery runs after all directory scans.** If a bundled/drop-in addon and an npm package register the same addon `name`, the directory one wins and the npm duplicate is skipped (logged).
- `node_modules` is resolved from the instance's working directory (`<cwd>/node_modules`).

## Authoring a packaged addon

A packaged addon is an ordinary npm package whose installed directory satisfies the addon contract.

**`package.json`:**

```json
{
  "name": "@jwilleke/geohazardwatch-addon",
  "version": "1.4.2",
  "main": "index.js",
  "ngdpbase": {
    "slug": "geohazardwatch",
    "type": "domain"
  }
}
```

- Package name convention: `@<scope>/<slug>-addon` (so the `*-addon` glob catches it).
- `main` must resolve to an `index.js` (or the discovery falls back to `index.js`/`index.ts` in the package root).
- `ngdpbase.slug` is the addon's **canonical identity** (#927): it is the registry key, the `ngdpbase.addons.<slug>.enabled` config-gate key, the dependency-reference name, and what the boot-time validator matches — all resolved from `package.json` *without importing the module*. **Declare it.** If omitted, identity falls back to the package directory name minus a trailing `-addon` (so `@jwilleke/geohazardwatch-addon` → `geohazardwatch`), but relying on that couples your identity to the package folder name — declaring `slug` is authoritative and explicit.

**`index.js`** — the module contract, unchanged across all three models:

```js
module.exports = {
  name: 'geohazardwatch',           // display label; MUST equal ngdpbase.slug
  version: '1.4.2',
  register(engine, config) { /* … */ },
  dependencies: []                  // optional addon deps (referenced by slug)
};
```

The module's exported `name` is a display label, not the identity — at load time `AddonsManager` warns (errors for `type: 'domain'`) if `name !== slug`. Keep them equal.

The addon is still gated by `ngdpbase.addons.<name>.enabled` — installing the package makes it *discoverable*, not automatically active.

## Publishing

The addon needs a registry the instance can `npm install` from:

- **GitHub Packages** (recommended for private/org addons) — an npm registry scoped to the org, authenticated with the same GitHub token flow already used for GHCR. Add an `.npmrc` mapping the scope to `npm.pkg.github.com`.
- **Public npmjs** — fine for open addons.

Publish is a normal `npm publish` (typically from the addon repo's CI on a version tag), independent of ngdpbase's own release cadence.

## Deploying

In a generic ngdpbase image (or a thin layer on it):

```dockerfile
FROM ghcr.io/jwilleke/ngdpbase:3.62.1
WORKDIR /app
RUN npm install @jwilleke/geohazardwatch-addon@1.4.2
# addons-path includes "node_modules:@jwilleke/*-addon"; enable the addon in config
```

Renovate then tracks `@jwilleke/geohazardwatch-addon` against npm semver — the addon version and the ngdpbase base-image version bump **independently**, each lockfile/tag-pinned. No cross-repo build context, no directory drift.

## Pages, themes, and everything else

Identical to the other models. A packaged addon's `pages/` seed and update exactly as described in [`addon-page-handling.md`](../addon-page-handling.md) (first-load seed → `{uuid}.md`; opt-in reseed via `ngdpbase.addons.page-reseed`), and its `register()` gets the same engine. Only *how the addon directory arrives* differs.

## Related

- [`addon-architecture.md`](../addon-architecture.md#distribution-models) — the three models table.
- [`addon-development-guide.md`](../addon-development-guide.md) — building an addon.
- [`addon-page-handling.md`](../addon-page-handling.md) — page seeding/reseed.
- [#673](https://github.com/jwilleke/ngdpbase/issues/673) — this feature. [#672](https://github.com/jwilleke/ngdpbase/issues/672) — the version-drift outage it addresses.
