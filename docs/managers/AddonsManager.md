---
name: AddonsManager
description: Discovery, registration, lifecycle, and dependency management for optional ngdpbase add-ons
dateModified: '2026-10-15'
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

## See Also

- Issue #158 — original AddonsManager design
- Issue #686 — auto-enable bundled addons (future enhancement)
- Addon authoring: `docs/platform/addon-architecture.md`
