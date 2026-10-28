# Domain Site: Stock Image + Installed Add-on

> See also: [Installed add-ons](../../guides/addons-developer-guide.md#installed-add-ons) in the add-ons guide for what the installer checks and how an add-on is published for it, [`kubernetes.md`](./kubernetes.md) for running the image on a cluster, and [`../../installation/Implementation.md`](../../installation/Implementation.md) for the implementation methods.

A __domain site__ is ngdpbase plus a domain add-on, under its own name. It is built from two things and nothing else:

- the __stock ngdpbase image__, `ghcr.io/jwilleke/ngdpbase:<version>`, unmodified;
- an __add-on installed through the site's configuration__: `ngdpbase.addons.install` names an npm package, a version and the repository it is built from, and core installs and verifies it at start ([#1830](https://github.com/jwilleke/ngdpbase/issues/1830)).

There is no derived image, no Dockerfile and no build step for the site. Core and the add-on move on separate version axes: the image tag moves core, a config value moves the add-on. The add-on's repository holds the add-on only (code, tests, docs, demo pages and its publish workflow); the site's deployment lives with the rest of the site's infrastructure.

This is the one way to deploy an add-on that is not bundled. The earlier shapes (an image built `FROM` ngdpbase, with the add-on copied or npm-installed into it) are retired; a site still on one moves with [`addon-packaged.md`](./addon-packaged.md). A drop-in folder in `addons-path` is for local development only.

## Worked example: geohazardwatch.com

geohazardwatch.com has run this way since 2026-10-26 (epic [#2053](https://github.com/jwilleke/ngdpbase/issues/2053)).

| Piece | Where it lives | How it moves |
| --- | --- | --- |
| Core | `ghcr.io/jwilleke/ngdpbase:<version>`, deployed from [mj-infra-flux](https://github.com/jwilleke/mj-infra-flux) `apps/production/geohazardwatch/` | Flux image automation (policy `geohazardwatch-ngdpbase`, range `>=5.32.0 <6.0.0`) bumps the tag and the pod restarts |
| Add-on | `@jwilleke/geohazardwatch-addon` on npmjs.com, built and published with provenance from [jwilleke/geohazardwatch](https://github.com/jwilleke/geohazardwatch) by its `publish.yml` on a `geohazardwatch-v<version>` tag | an admin presses Update on Admin → Add-ons and restarts, within the config's version range |
| Site configuration | `app-custom-config.json` on the data volume | admin UI, or a hand edit of the file followed by a restart |
| Add-on data | the add-on's own data path on the persistent volume | the add-on's scheduled jobs on core's job runner; no CronJob |

## Configuration

The two keys go in the site's `app-custom-config.json`, which is `<FAST_STORAGE>/config/app-custom-config.json` on the data volume (on geohazardwatch.com, `/app/fast/config/app-custom-config.json`). Never put them in YAML: not in a ConfigMap, not in a manifest. A ConfigMap-mounted config file is read-only and every admin save on it fails ([`kubernetes.md`](./kubernetes.md)), and site configuration is the site's own data, not deployment code.

```json
{
  "ngdpbase.addons.install": {
    "geohazardwatch": {
      "package": "@jwilleke/geohazardwatch-addon",
      "version": "1.2.289",
      "repository": "github.com/jwilleke/geohazardwatch"
    }
  },
  "ngdpbase.addons.geohazardwatch.enabled": true
}
```

- __The map key__ is the add-on's slug (`ngdpbase.slug` in its `package.json`). It must match the slug the published package declares, or the install is refused.
- __`package`__ is the npm package name.
- __`version`__ is a semver range. It is resolved on the first install and whenever the pinned version stops answering it; a restart never picks up a new release. It is also the range Admin → Add-ons offers Updates within ([#2100](https://github.com/jwilleke/ngdpbase/issues/2100)): `^1` lets an admin move to any later 1.x release with a button, while an exact version, as in the example, offers none, and moving it means editing the config.
- __`repository`__ is `host/owner/repo`. The release's Sigstore provenance must come from a CI workflow of this repository, or the install is refused.
- __The enable key__ `ngdpbase.addons.<slug>.enabled` is separate. Installing does not enable an add-on; the key decides, as for every add-on.
- __Keys are flat.__ `ngdpbase.addons.install` is one key whose value is the map; the enable key is its own flat key, not nested inside it.

## What core does with it

At every start, before add-ons load, core reads the install map. The checks and the lock format are in [Installed add-ons](../../guides/addons-developer-guide.md#installed-add-ons); in short:

- __First start with a new entry__ (or a changed package, version or repository): the release is fetched from npm, its sha512 checked against the registry, its provenance verified against `repository`, and it is unpacked into `<FAST_STORAGE>/addons/<slug>/` (on geohazardwatch.com, `/app/fast/addons/geohazardwatch/`). It is pinned in `<FAST_STORAGE>/addons/addons-lock.json` with its integrity and `provenance: { repository, verifiedAt }`, and the tarball is kept in `<FAST_STORAGE>/addons/.packages/`.
- __Every later start:__ the stored tarball is checked against the lock and the folder against the tarball. npm is not asked.
- __Anything refused, or npm unreachable:__ the site starts without that add-on, the reason is logged, and admins are notified. The next start tries again.

To confirm an install, read the lock entry: `version` is what runs, and `provenance.verifiedAt` says when its provenance was checked. Nothing else in `<FAST_STORAGE>/addons/` loads: a folder copied in by hand, or one left after its entry was removed, is skipped with a warning.

The add-on folder is core's: a folder that differs from its tarball is rewritten at the next start. Data the add-on writes belongs under its own data path on the persistent volume, never inside `<FAST_STORAGE>/addons/<slug>/`.

## The release pipeline proves it

Every image build starts the stock image with a data volume whose configuration names a published add-on (`@jwilleke/geohazardwatch-addon`) and checks that it installs with its provenance verified, loads, and that a second start with no network loads it from the pinned copy without asking npm ([#2101](https://github.com/jwilleke/ngdpbase/issues/2101)). The step is "Smoke test — an add-on installed from config" in `.github/workflows/docker-build.yml`, and the local release smoke runs it too. A core change that breaks this shape stops the image from being published.

## The admin-save trap

Core reads `app-custom-config.json` once, at start, and every save from the admin UI writes the whole file back from that in-memory copy. A key added to the file by hand while the site is running is therefore lost if anyone saves a setting in the admin UI before the next restart.

When adding or changing `ngdpbase.addons.install` (or any key) by hand:

- 1 Edit the file on the data volume.
- 2 Restart the site before anyone saves in the admin UI.
- 3 After the restart, check the key is still in the file and the lock entry shows the version you set.

If a save did happen in between, the file is back to what it was at start: make the edit again and restart.

## Updating

- __Core__ moves with the image. On geohazardwatch.com, Flux image automation bumps the tag within its policy range and the pod restarts on the new core. The installed add-on stays at its pinned version: the lock still answers the config, so core verifies the stored copy and asks npm nothing. The add-on repository's `core-compat.yml` builds and tests it against each new ngdpbase release, so a core release that breaks it shows there first. A release whose `ngdpbase.minVersion` is newer than the running core is not installed.
- __The add-on__ moves by Update on Admin → Add-ons ([#2100](https://github.com/jwilleke/ngdpbase/issues/2100)), within the `version` range of its `ngdpbase.addons.install` entry:
  - 1 Release the add-on: in its repository, push the tag `<slug>-v<version>`; its `publish.yml` publishes to npm with provenance and makes a GitHub release.
  - 2 On Admin → Add-ons, the add-on's row shows the installed version, the range and the newest release in it (press Check to ask npm again). A release that needs a newer ngdpbase shows "needs ngdpbase ≥ X" and cannot be installed until core moves.
  - 3 Press Update. Core checks the release as it checks a first install (sha512, provenance from `repository`, contents, `ngdpbase.minVersion`), downloads it into `.packages/`, records who updated what from which version to which (`addon-update`), and pins it in the lock as pending. The running add-on is not changed. If npm cannot be reached, nothing changes and the page says so.
  - 4 Restart the site. The page says "Restart the site to use version X": core cannot swap a running add-on, so the new release is used from the next start. That start switches to it, keeping the previous release's folder (`.previous-<slug>`) and tarball, and removes them once the new release has loaded.
  - A release outside the range still needs a config change: set `version` to a range that includes it and restart (mind [the admin-save trap](#the-admin-save-trap)); core installs and verifies it at that start and deletes the previous version's tarball.

## Rollback

- __The add-on, when the updated release does not load:__ core falls back by itself. After the load pass, an add-on that a start switched to a new release and that did not load is moved back: the new folder is set aside as `.rejected-<slug>-<time>`, the previous folder and lock entry are restored, admins get a notification (`<slug> X did not load (reason). <slug> Y is restored and runs after the next restart`), and the fall-back is recorded. Restart the site to run the previous release; until then the add-on is not running. If the process stopped while loading the new release (a crash), the next start finds the switch unconfirmed and falls back before loading anything. No npm is needed: the previous tarball was kept.
- __The add-on, after an update that loaded:__ the previous release is gone once the new one is confirmed. Set `version` to a range that excludes the new release (for example `~1.2.0` to leave 1.3.0) and restart: this is an ordinary install from npm, with the same sha512 and provenance checks; npm must be reachable.
- __The add-on, after an update that was refused or could not reach npm:__ the site started without the add-on, but the old folder, tarball and lock entry are untouched. Set `version` back and restart: the lock answers again, and the old copy is verified and loaded with no call to npm.
- __Removing the add-on:__ set its enable key to `false`, or remove its `ngdpbase.addons.install` entry, and restart. A folder whose entry is gone is not loaded, and admins are warned about it.
- __Core:__ pin the previous image tag in the site's deployment manifest and pause the image automation for it, or it moves the tag forward again. An add-on pinned at a version whose `ngdpbase.minVersion` the older core does not meet is not loaded on it.

Installed copies are not yet in the site backup ([#1830](https://github.com/jwilleke/ngdpbase/issues/1830), listed in the add-ons guide's Known gaps). They are rebuilt from the install map and npm, so restoring a site restores its configuration and lets the next start reinstall.

## Related

- [Installed add-ons](../../guides/addons-developer-guide.md#installed-add-ons) — the installer's checks, the lock, and publishing with `create:addon --repo`'s `publish.yml`.
- [`kubernetes.md`](./kubernetes.md) — running the stock image on a cluster, and why config never goes in a ConfigMap.
- [`how-to-deploy.md`](./how-to-deploy.md) — the deployment walkthrough.
- [`addon-packaged.md`](./addon-packaged.md) — moving a site off a site image.
- [#2053](https://github.com/jwilleke/ngdpbase/issues/2053) — the geohazardwatch switch to this shape.
