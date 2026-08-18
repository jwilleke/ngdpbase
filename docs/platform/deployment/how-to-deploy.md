# How to Deploy ngdpbase

A practical, opinionated walkthrough of standing up an ngdpbase instance — pick a target, get the image, deliver addons, set config, and understand how updates flow. Each step links the detailed reference.

> See also: [`../Deployment.md`](../Deployment.md) for the platform overview.

---

## 1. Pick a deployment target

| Target | Use it for | Guide |
|---|---|---|
| __Direct install__ | A host/VM running Node directly (or `./server.sh`) | [`direct-install.md`](./direct-install.md) |
| __Docker Compose__ | A single host, container-managed, named volumes | [`docker-compose.md`](./docker-compose.md) |
| __Kubernetes__ | Clustered / production (the maps + geohazardwatch stacks run here) | [`kubernetes.md`](./kubernetes.md) |

The rest of this page is target-agnostic: image, addons, config, and updates apply the same whichever you chose.

## 2. Get the image

ngdpbase publishes a container image to GHCR on every release tag (`docker-build.yml` on `v*`):

```
ghcr.io/jwilleke/ngdpbase:<version>     # e.g. 3.62.1  (also :3.62, :3, :latest)
```

Pin an __exact version__ in production (`:3.62.1`), not `:latest`. Renovate can track the pin against new releases.

## 3. Deliver addons

Addons reach the instance in one of three ways — full detail in [`../addon-architecture.md`](../addon-architecture.md#distribution-models):

- __bundled__ — first-party addons already inside the image (`feeds`, `calendar`, `journal`, `forms`, `elasticsearch`). Nothing to install; just enable in config.
- __drop-in__ — a directory listed in `addons-path`. Fine for development and simple/private cases.
- __packaged__ — an npm package installed into the image. __The recommended model for production distribution of independent / `type: 'domain'` addons__ (e.g. geohazardwatch) — versioned, lockfile-pinned, Renovate-tracked. Full guide + the drop-in→packaged migration: [`addon-packaged.md`](./addon-packaged.md).

For a packaged addon, a thin image is just the base plus an install line:

```dockerfile
FROM ghcr.io/jwilleke/ngdpbase:3.62.1
WORKDIR /app
RUN npm install @jwilleke/geohazardwatch-addon@1.4.2
```

…and an `addons-path` entry `"node_modules:@jwilleke/*-addon"` (step 4). The ngdpbase base version and the addon version are pinned __independently__ — bumping one never drags the other.

## 4. Configure the instance

Config lives in __`<data>/config/app-custom-config.json`__ on the data volume (custom overrides win over the shipped `app-default-config.json`; keys are __flat dotted__, never nested objects). The essentials:

```json
{
  "ngdpbase.managers.addons-manager.addons-path": ["/app/addons", "node_modules:@jwilleke/*-addon"],
  "ngdpbase.addons.geohazardwatch.enabled": true,
  "ngdpbase.addons.page-reseed": true
}
```

- __`addons-path`__ — where to discover addons (directories and/or `node_modules:` globs).
- __`ngdpbase.addons.<slug>.enabled`__ — installing/dropping an addon makes it *discoverable*; this flag makes it *active*.
- __`ngdpbase.addons.page-reseed`__ (optional, default off) — when true, addon page updates reseed on restart (edit-preserving, revertable via version history). See [`../addon-page-handling.md`](../addon-page-handling.md).

## 5. Storage

Two volumes (see the target guide for the exact mounts):

- __FAST_STORAGE__ — sessions, logs, users, search index, __config__.
- __SLOW_STORAGE__ — pages, attachments, backups, and the media library.

Runtime data an addon manages (e.g. geohazardwatch's quake/HANS datasets) lives on a persistent volume, __never baked into the image__ — so it survives image bumps untouched.

## 6. How updates flow

```
ngdpbase release (v-tag) ──▶ GHCR image ──▶ Renovate bumps the base-image pin ──▶ rebuild + redeploy
addon release (npm tag)  ──▶ npm registry ─▶ Renovate bumps the addon pin ───────▶ rebuild + redeploy
```

The two axes are independent and each lockfile/tag-pinned — the drift that caused #672 is gone. For minor/patch bumps Renovate can auto-merge (per the consumer repo's `renovate.json`); majors get manual review.

- __Addon page content__ updates only propagate when `page-reseed` is on and the page is unmodified — see [`../addon-page-handling.md`](../addon-page-handling.md).
- __Restart__ the instance after a redeploy so the in-memory caches and addon discovery re-run.

## Related

- [`../addon-architecture.md`](../addon-architecture.md) — distribution models, load order.
- [`addon-packaged.md`](./addon-packaged.md) — the recommended production addon model + migration.
- [`../addon-page-handling.md`](../addon-page-handling.md) — page seeding/reseed.
- [`direct-install.md`](./direct-install.md) · [`docker-compose.md`](./docker-compose.md) · [`kubernetes.md`](./kubernetes.md) — per-target detail.
