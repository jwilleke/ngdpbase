---
name: AddonsManager
description: Discovery, registration, lifecycle, and dependency management for optional ngdpbase add-ons
dateModified: '2026-10-19'
category: managers
code: src/managers/AddonsManager.ts
---

# AddonsManager

Core add-on management system. Discovers add-ons in the configured `addons/` directories, registers them with the engine, manages their initialization lifecycle, and resolves dependencies between them. Enables optional business modules (journal, calendar, person-contacts, elasticsearch, etc.) to layer onto ngdpbase core without modifying it.

## Responsibilities

- __Discovery__ — scan `addons/*/package.json` for ngdpbase-add-on metadata.
- __Registration__ — call each add-on's `register(engine, config, host)` hook in dependency order: `dependencies` must be installed and enabled and load first; `optionalDependencies` load first when installed and enabled and are skipped otherwise (#1808).
- __Host__ — `host` is built per add-on by `buildAddonHost` (`src/utils/addonHost.ts`) and frozen: core's `ApiContext`, `ApiError`, `sendApiError`, `actorOf`, `jobContextFromRequest`, `jobContextFromSystem`, `guardedFetch`, a `logger` child tagged with the slug, and `recordAuditEvent` / `addonAuditEventName` limited to the events that add-on declares in its own `config/default-config.json` (read through `ConfigurationManager.getAddonDeclaredDefaults`). An add-on whose `register` takes two arguments still loads ([#1813](https://github.com/jwilleke/ngdpbase/issues/1813)).
- __Lifecycle__ — invoke `init` → `register` → `shutdown` in the correct sequence; per-add-on try/catch keeps a failing add-on from blocking the others.
- __Capability flags__ — addons can call `engine.setCapability(name, true)` to advertise their availability; consumers gate behaviour on `engine.hasCapability(name)`.
- __Profile-section hooks__ — addons that contribute to `/profile` register a `profileSection(user)` callback; AddonsManager fans the call out. The paired save hook is `saveProfileSection(ctx, body)` — since [#1234](https://github.com/jwilleke/ngdpbase/issues/1234) its first argument is the caller's context (`PermissionSubject`), forwarded to whatever the addon writes, never a username; an addon still on the old `(username, body)` shape is named in a warning at load and its saves fail per call.
- __Dashboard cards / stylesheets__ — addons register UI surfaces here.
- __Load failures ([#1883](https://github.com/jwilleke/ngdpbase/issues/1883))__ — every enabled add-on that does not load, whatever the reason (a refusal before import, an import that throws, no `register()`, `register()` throwing, an unresolvable load order, or never found), goes through `recordLoadFailure`: its status carries the reason, and admins get one `error` notification, "Critical: add-on `<slug>` did not load". The "Add-on declaration problem" notification no longer repeats a refusal of an enabled add-on. When `ConfigurationManager.isAddonSiteCritical(slug)` is true it also calls `engine.maintenance.enter(reason)`, the one maintenance door ([#1906](https://github.com/jwilleke/ngdpbase/issues/1906)); the gate reads it per request, so the site starts in maintenance mode with `/admin`, `/login` and `/logout` open and visitors shown only the site's maintenance message (`ngdpbase.features.maintenance.message`). `app.ts` logs the add-on's reasons after `initializeAddons()`. The rule and the value's rules are in [the addons developer guide](../guides/addons-developer-guide.md#when-an-addon-does-not-load-site-critical).
- __Installing add-ons ([#1830](https://github.com/jwilleke/ngdpbase/issues/1830))__ — before discovery, installs or verifies the add-ons `ngdpbase.addons.install` names, into `<instance data folder>/addons/<slug>/`, and loads from there only the ones it verified. See below.

## Installed add-ons

AddonsManager owns the installer, because which add-ons a site has is add-on state and has one owner. The mechanics are utilities with no state of their own:

- `src/utils/addonInstaller.ts` — registry, integrity, the install and verify flow;
- `src/utils/addonProvenance.ts` — the Sigstore provenance check (`@sigstore/verify`, `@sigstore/bundle`);
- `src/utils/sigstoreTrustedRoot.ts` — the Sigstore trusted root from its TUF repository (`tuf-js`, seeded from `@sigstore/tuf`), downloaded through `guardedFetch` rather than tuf-js's own global `fetch`;
- `src/utils/addonTarball.ts` — reading and unpacking the tarball safely (`tar`);
- `src/utils/addonLock.ts` — the lock file, read synchronously by the configuration merge too.

Every outbound request (packument, tarball, attestations, TUF metadata) uses `guardedFetch` with the egress policy.

- __Config:__ `ngdpbase.addons.install` — a map of slug → `{ "package", "version", "repository" }`, default `{}`. Declared `sensitive` in `ngdpbase.config.sensitive-values`, because it says which software at which versions the site runs. An empty map does nothing: no folder, no request.
- __Tuning__ (all under `ngdpbase.managers.addons-manager.install.`): `registry` (default `https://registry.npmjs.org`, `sensitive`), `sigstore-tuf-url` (default `https://tuf-repo-cdn.sigstore.dev`, `sensitive`), `timeout-ms` (30000), `max-metadata-bytes` (16 MiB), `max-tarball-bytes` (50 MiB), `max-unpacked-bytes` (200 MiB).
- __Lock file:__ `<data>/addons/addons-lock.json`, `{ lockfileVersion: 1, addons: { <slug>: { package, version, integrity, installedAt, provenance: { repository, verifiedAt } } } }`. The verified tarballs are in `<data>/addons/.packages/`, the TUF cache in `<data>/addons/.sigstore/`.
- __What loads:__ AddonsManager registers from `<data>/addons` only the slugs the installer verified on this start, even when `addons-path` names the folder; any other folder there is reported to admins and not loaded. The configuration merge takes an installed add-on's `config/default-config.json` layer only when the lock file and the install map both name it.
- __Boot order:__ `ConfigurationManager` counts a slug named in the install map as known, so an enabled add-on that is not installed yet does not refuse the boot (#672). An enabled id that only a stray folder in `<data>/addons` answers is logged and skipped by that check, never refused; an enabled id with no folder anywhere still refuses the boot as before. After an install, a repair or a rejection, AddonsManager calls `ConfigurationManager.reload()` so a new add-on's layer applies on this boot.
- __Audit:__ `addon-install` (on-failure `refuse`, written after every check and before anything is written) and `addon-verify-failed` (on-failure `continue`), through `recordSystemAction` under `systemContext`. `addon-update` is declared, `enabled: false`, until the Update action exists.
- __Problems__ are logged and posted to admins through `NotificationManager` (`type: 'system'`), one per add-on: `<slug> not installed: <reason>`. The boot always continues.

The decided behaviour, and what is not built yet, is in [the addons developer guide](../guides/addons-developer-guide.md#installed-add-ons).

## See Also

- Issue #158 — original AddonsManager design
- Issue #686 — auto-enable bundled addons (future enhancement)
- Addon authoring: `docs/platform/addon-architecture.md`
