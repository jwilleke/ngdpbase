---
name: AddonsManager
description: Discovery, registration, lifecycle, and dependency management for optional ngdpbase add-ons
dateModified: '2026-05-28'
category: managers
code: src/managers/AddonsManager.ts
---

# AddonsManager

Core add-on management system. Discovers add-ons in the configured `addons/` directories, registers them with the engine, manages their initialization lifecycle, and resolves dependencies between them. Enables optional business modules (journal, calendar, person-contacts, elasticsearch, etc.) to layer onto ngdpbase core without modifying it.

## Responsibilities

- __Discovery__ — scan `addons/*/package.json` for ngdpbase-add-on metadata.
- __Registration__ — call each add-on's `register(engine, config)` hook in dependency order.
- __Lifecycle__ — invoke `init` → `register` → `shutdown` in the correct sequence; per-add-on try/catch keeps a failing add-on from blocking the others.
- __Capability flags__ — addons can call `engine.setCapability(name, true)` to advertise their availability; consumers gate behaviour on `engine.hasCapability(name)`.
- __Profile-section hooks__ — addons that contribute to `/profile` register a `profileSection(user)` callback; AddonsManager fans the call out.
- __Dashboard cards / stylesheets__ — addons register UI surfaces here.

## See Also

- Issue #158 — original AddonsManager design
- Issue #686 — auto-enable bundled addons (future enhancement)
- Addon authoring: `docs/platform/addon-architecture.md`
