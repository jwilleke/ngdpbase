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

Headless installs add a `"headless": true` field.

---

## Location

```
FAST_STORAGE/.install-complete
```

`FAST_STORAGE` defaults to `./data`. Set it to a fast local volume path for multi-instance or Docker deployments. The path is resolved by `InstallService.getInstallCompleteFilePath()`.

`SLOW_STORAGE` is a separate variable used for media, footnotes, and attachments — the `.install-complete` marker always lives in `FAST_STORAGE`, not `SLOW_STORAGE`.

---

## When It Is Created

| Path | Method | Trigger |
|---|---|---|
| Interactive wizard | `InstallService.#markInstallationComplete()` | Final step of `processInstallation()` — after config write, org data write, admin password set, and optional page copy |
| Headless install | `InstallService.markHeadlessInstallationComplete()` | `processHeadlessInstallation()` — when `HEADLESS_INSTALL=true` env var is set |

The marker is always the __last__ step. If any earlier installation step fails, the marker is not created and the wizard will be shown again on the next request.

__Source__: `src/services/InstallService.ts` — `#markInstallationComplete()` (~line 945), `markHeadlessInstallationComplete()` (~line 630)

---

## When It Is Checked

Three separate places check for the marker:

| Location | Method | Effect if missing |
|---|---|---|
| `InstallService` | `isInstallComplete()` | Returns `false` → `isInstallRequired()` returns `true` → middleware redirects to `/install` |
| `FileSystemProvider` | `initialize()` | Sets `this.installationComplete = false` — affects required-pages scan behaviour |
| `PageManager` | `seedRequiredPages()` | Skips seeding if marker is present; runs seed if missing and pages dir is empty |

__Sources__:

- `src/services/InstallService.ts:181` — `isInstallComplete()`
- `src/providers/FileSystemProvider.ts:166` — `initialize()`
- `src/providers/VersioningFileProvider.ts:335` — `initialize()`
- `src/managers/PageManager.ts:147` — `seedRequiredPages()`

---

## Installation Required Logic

`InstallService.isInstallRequired()` returns `true` if __any__ of:

1. `.install-complete` file does not exist
2. Admin user does not have the `admin` role
3. No pages exist in `FAST_STORAGE/pages/`

All three conditions must be satisfied for installation to be considered complete.

---

## How to Manually Create It (Recovery)

If the wizard cannot be completed (e.g., pages already exist from a previous deployment), you can create the marker manually:

```bash
echo '{"completedAt":"'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'","version":"1.0.0"}' > data/.install-complete
```

Or via the headless install endpoint (POST to `/install/headless` with `HEADLESS_INSTALL=true`).

---

## How to Reset Installation

Delete the marker to force the wizard to run again:

```bash
rm data/.install-complete
```

Or call `POST /install/reset` which removes the marker and partial installation state.

---

## Docker / Kubernetes

In Docker deployments, the marker lives in the mounted data volume at `/app/data/.install-complete`. Restarting the container without removing the volume skips the wizard. Removing the volume (or not mounting one) causes the wizard to run on first access.

__See also__: [installation-system.md — Docker and Kubernetes Deployments](./installation-system.md#docker-and-kubernetes-deployments)
