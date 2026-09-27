# `.install-complete` Marker File

__Status__: Production (as of 2026-04-27)
__Related__: [installation-system.md](./installation-system.md) | [startup-process.md](./startup-process.md)

---

## What It Is

`data/.install-complete` (at `FAST_STORAGE/.install-complete`) is a JSON marker file that signals the installation wizard has been completed for this instance. Its presence — not its content — gates access to the wiki.

```json
{
  "completedAt": "2026-04-27T12:00:00.000Z",
  "version": "1.0.0"
}
```

Headless installs add a `"headless": true` field. A marker written at start-up for a site that was already set up (see below) adds an `"inferred"` field saying why.

---

## Location

```
FAST_STORAGE/.install-complete
```

`FAST_STORAGE` defaults to `./data` (the legacy `INSTANCE_DATA_FOLDER` is read when `FAST_STORAGE` is unset). Set it to a fast local volume path for multi-instance or Docker deployments. The path is declared once, `installCompletePath()` in `src/utils/configFiles.ts`; `ConfigurationManager.getInstallCompletePath()` returns it for this site, and every reader goes through one of the two.

`SLOW_STORAGE` is a separate variable used for media, footnotes, and attachments — the `.install-complete` marker always lives in `FAST_STORAGE`, not `SLOW_STORAGE`.

---

## When It Is Created

| Path | Method | Trigger |
|---|---|---|
| Interactive wizard | `InstallService.#markInstallationComplete()` | Final step of `processInstallation()` — after config write, org seed and admin password set |
| Headless install | `InstallService.markHeadlessInstallationComplete()` | `processHeadlessInstallation()` — when `HEADLESS_INSTALL=true` env var is set |
| Start-up, existing site | `InstallService.markExistingSiteInstalled()` | Every start, before the first request, when the marker is missing on a site that is already set up ([#1410](https://github.com/jwilleke/ngdpbase/issues/1410)) — see below |

In the wizard and the headless install the marker is always the __last__ step. If any earlier installation step fails, the marker is not created and the wizard will be shown again on the next request. The wizard runs every step every time: the config write merges into an existing file and the organization seed is idempotent, so a retry still records the form's answers.

__Source__: `src/services/InstallService.ts`

---

## When It Is Checked

These places check for the marker:

| Location | Method | Effect if missing |
|---|---|---|
| `InstallService` | `isInstallComplete()` | Returns `false` → `isInstallRequired()` returns `true` → middleware redirects to `/install` |
| `FileSystemProvider`, `VersioningFileProvider` | `initialize()` | Sets `this.installationComplete = false`. Since [#1405](https://github.com/jwilleke/ngdpbase/issues/1405) it no longer changes which pages are loaded |
| `ConfigurationManager` | `assertBaseUrlConfigured()` | None. With the marker present, start-up refuses unless `ngdpbase.application.base-url` is set explicitly (#642) |
| `OrganizationManager` | `initialize()` | None. With the marker present, the configured anchor organization file must exist |

Required pages do not depend on the marker ([#1405](https://github.com/jwilleke/ngdpbase/issues/1405)). `PageManager.seedRequiredPages()` runs at the end of every engine start-up and seeds each required page a site has never had, recording it in `${FAST_STORAGE}/seeded-shipped-pages.json`. A page removed on the site stays removed.

---

## Installation Required Logic

`InstallService.isInstallRequired()` returns `true` exactly when `.install-complete` does not exist ([#1410](https://github.com/jwilleke/ngdpbase/issues/1410)).

It once also required an `admin` account and at least one page. Both now exist from the first start: `UserManager` creates the bootstrap admin, and `PageManager` seeds the required pages at the end of every start-up. So they say nothing about whether anyone ran setup, and a fresh site was read as installed and never showed the wizard. The placeholder anchor organization `OrganizationManager` seeds at start-up (#1027) is the same kind of artifact.

### Sites set up before the marker decided

At every start, `InstallService.markExistingSiteInstalled()` writes the marker, with an `"inferred"` reason and a warning in the log, when all of these hold:

- the marker is missing
- `ngdpbase.application.base-url` is set explicitly (without it the next start would refuse, #642)
- the site has its own custom config file, or a page that is not in `seeded-shipped-pages.json`

A fresh site has neither a custom config nor a page of its own, so it gets the wizard.

### Partial installation

`detectPartialInstallation()` reports a partial install when a custom config exists without the marker: an earlier wizard attempt wrote it, or the operator put it there first. The install form then shows a note, and `POST /install/reset` can clear it.

---

## How to Manually Create It (Recovery)

If the wizard cannot be completed (e.g., pages already exist from a previous deployment), you can create the marker manually:

```bash
echo '{"completedAt":"'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'","version":"1.0.0"}' > data/.install-complete
```

Or via the headless install endpoint (POST to `/install/headless` with `HEADLESS_INSTALL=true`).

---

## How to Reset Installation

Delete the marker to make the wizard run again on the next request:

```bash
rm data/.install-complete
```

On a site that is already set up, a __restart__ writes the marker back (see "Sites set up before the marker decided"), so run the wizard before restarting.

`POST /install/reset` works only while there is a partial installation (a custom config and no marker). It backs up and removes the custom config, the install organization, the `admin` account, the page files and the seeded-pages record.

---

## Docker / Kubernetes

In Docker deployments, the marker lives in the mounted data volume at `/app/data/.install-complete`. Restarting the container without removing the volume skips the wizard. Removing the volume (or not mounting one) causes the wizard to run on first access.

__See also__: [installation-system.md — Docker and Kubernetes Deployments](./installation-system.md#docker-and-kubernetes-deployments)
