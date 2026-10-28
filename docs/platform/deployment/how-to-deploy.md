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

Addons reach the instance one way, in detail in [`../addon-architecture.md`](../addon-architecture.md#distribution-models):

- __bundled__ — first-party addons already inside the image (`feeds`, `calendar`, `journal`, `forms`, `elasticsearch`). Nothing to install; just enable in config.
- __installed__ — the site's configuration names an npm package, a version and its repository, and core installs and verifies it into the data volume at start. An admin moves it to a newer release with the Update button on Admin → Add-ons. No image of your own: the site runs the stock image. This is how a domain site such as geohazardwatch.com runs: [`domain-site.md`](./domain-site.md).
- __drop-in__ — a directory listed in `addons-path`. For local development only, not a way to deploy.

A site that builds its own image with an add-on baked in should move to the installed model: [`addon-packaged.md`](./addon-packaged.md).

## 4. Configure the instance

Config lives in __`<data>/config/app-custom-config.json`__ on the data volume (custom overrides win over the shipped `app-default-config.json`; keys are __flat dotted__, never nested objects). The essentials:

```json
{
  "ngdpbase.addons.install": {
    "geohazardwatch": {
      "package": "@jwilleke/geohazardwatch-addon",
      "version": "^1.2.289",
      "repository": "github.com/jwilleke/geohazardwatch"
    }
  },
  "ngdpbase.addons.geohazardwatch.enabled": true,
  "ngdpbase.addons.page-reseed": true
}
```

- __`ngdpbase.addons.install`__ — the add-ons this site installs from npm ([`domain-site.md`](./domain-site.md)).
- __`ngdpbase.addons.<slug>.enabled`__ — installing an addon makes it *available*; this flag makes it *active*.
- __`ngdpbase.addons.page-reseed`__ (optional, default off) — when true, addon page updates reseed on restart (edit-preserving, revertable via version history). See [`../addon-page-handling.md`](../addon-page-handling.md).

## 5. Storage

Two volumes (see the target guide for the exact mounts):

- __FAST_STORAGE__ — sessions, logs, users, search index, __config__.
- __SLOW_STORAGE__ — pages, attachments, backups, and the media library.

Runtime data an addon manages (e.g. geohazardwatch's quake/HANS datasets) lives on a persistent volume, __never baked into the image__ — so it survives image bumps untouched.

## 6. How updates flow

```
ngdpbase release (v-tag) ──▶ GHCR image ──▶ image tag bumped in the deployment ──▶ redeploy
addon release (npm tag)  ──▶ npm registry ─▶ Update on Admin → Add-ons ──────────▶ restart
```

The two axes are independent and each pinned: the image tag moves core, the add-on's entry in `ngdpbase.addons.install` moves the add-on. The drift that caused #672 is gone.

- __Addon page content__ updates only propagate when `page-reseed` is on and the page is unmodified — see [`../addon-page-handling.md`](../addon-page-handling.md).
- __Restart__ the instance after a redeploy so the in-memory caches and addon discovery re-run.

## Related

- [`../addon-architecture.md`](../addon-architecture.md) — distribution models, load order.
- [`domain-site.md`](./domain-site.md) — a domain site: the stock image plus an add-on installed through the site's config.
- [`addon-packaged.md`](./addon-packaged.md) — moving a site off a site image.
- [`../addon-page-handling.md`](../addon-page-handling.md) — page seeding/reseed.
- [`direct-install.md`](./direct-install.md) · [`docker-compose.md`](./docker-compose.md) · [`kubernetes.md`](./kubernetes.md) — per-target detail.
