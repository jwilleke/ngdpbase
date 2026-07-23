# Packaged Addons (npm distribution)

> See also: [`addon-architecture.md`](./addon-architecture.md) for the three distribution models, [`addon-development-guide.md`](./addon-development-guide.md) for building an addon, and [`addon-page-handling.md`](./addon-page-handling.md) for how an addon's pages seed/update. This document covers the **`packaged`** model (#673): shipping an addon as an npm package discovered from `node_modules`.

---

## What it is

An addon published as an **npm package** and discovered from `node_modules/<scope>/<slug>-addon/` after `npm install`. It reaches a running instance the same way any dependency does — pinned in `package.json`, integrity-locked in `package-lock.json`, tracked by Renovate against npm semver.

It uses the **identical** slug / module / `register()` contract as `bundled` and `drop-in` addons. Only *discovery* changes: instead of scanning a directory, `AddonsManager` expands a `node_modules:<glob>` entry.

## When to use which model

| Model | Use it for | Trade-off |
|---|---|---|
| **bundled** (`addons/<slug>/` in this repo) | First-party addons that ship *with* ngdpbase and release on its cadence (feeds, calendar, journal, forms, elasticsearch) | Coupled to ngdpbase releases; not for third parties |
| **drop-in** (a directory in `addons-path`) | Local development, quick iteration, or a simple/private addon copied into the image / mounted as a volume | No version pinning — "whatever is in the directory at boot" (the drift that caused #672) |
| **packaged** (`npm install`) | **Shipping an independent addon to production reproducibly** — versioned, lockfile-pinned, Renovate-tracked; installable into a *generic* ngdpbase image with no bespoke Dockerfile | Requires an npm registry + a publish step |

### Recommendation

**`packaged` is the recommended model for deploying an independent addon to production.** It's the only one that gives reproducible, version-pinned, auditable delivery, and it lets a generic `ghcr.io/jwilleke/ngdpbase` image host any addon via `npm install` rather than a per-addon `FROM ngdpbase + COPY` image. It's what the #672 version-drift outage needed.

**It is not the *only* supported model, and shouldn't be forced everywhere:**

- **Keep `bundled`** for addons that are genuinely part of ngdpbase and version with it.
- **Keep `drop-in`** for development (edit files in place, no publish/install cycle) and for a truly private one-off where standing up a registry isn't worth it.

So: recommend `packaged` for *production distribution of independent addons*; use `drop-in` while developing that same addon; `bundled` stays for core. All three remain first-class — the platform makes no trust distinction between them.

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
- The optional `ngdpbase` block is read into the addon's `manifest` (same as a drop-in's `package.json` `ngdpbase` block).

**`index.js`** — the module contract, unchanged across all three models:

```js
module.exports = {
  name: 'geohazardwatch',           // the addon slug — the config-gate key
  version: '1.4.2',
  register(engine, config) { /* … */ },
  dependencies: []                  // optional addon deps
};
```

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

Identical to the other models. A packaged addon's `pages/` seed and update exactly as described in [`addon-page-handling.md`](./addon-page-handling.md) (first-load seed → `{uuid}.md`; opt-in reseed via `ngdpbase.addons.page-reseed`), and its `register()` gets the same engine. Only *how the addon directory arrives* differs.

## Related

- [`addon-architecture.md`](./addon-architecture.md#distribution-models) — the three models table.
- [`addon-development-guide.md`](./addon-development-guide.md) — building an addon.
- [`addon-page-handling.md`](./addon-page-handling.md) — page seeding/reseed.
- [#673](https://github.com/jwilleke/ngdpbase/issues/673) — this feature. [#672](https://github.com/jwilleke/ngdpbase/issues/672) — the version-drift outage it addresses.
