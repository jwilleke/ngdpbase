---
name: Managers and providers developer guide
description: How to add a manager or provider — one door per resource, config selects the implementation
dateModified: 2026-10-19
category: guides
relatedModules: [BaseManager, BaseProvider]
---

# Managers and providers developer guide

How to add a manager or a provider. The invariant is in [guiding-framework.md](../guiding-framework.md): all code that touches a resource goes through that resource's manager.

## Standing rules

- One manager per resource. There is no second write path around it.
- Managers extend `BaseManager`. Providers extend the matching `Base*Provider`. The manager loads the provider; routes and plugins do not.
- `engine.getManager('Name')` is the address. Absent must not mean null — keep the capability addressable and make the implementation inert.
- Configuration selects the provider (`ngdpbase.<capability>.provider`) and parameterises it. It does not contain logic.
- A capability that can be left unconfigured must still work (Null, console, or an in-process default). Log the resolved provider at boot.
- Authorization and audit happen at the manager door, with an `ActorContext`. See [security-developer-guide.md](security-developer-guide.md) and [audit-developer-guide.md](audit-developer-guide.md).
- A manager whose data can appear on a page bumps its cache topic after every write, through one write helper at its door (`CacheManager.bump`). See [caching-developer-guide.md](caching-developer-guide.md).
- A manager that needs the site closed puts it in maintenance mode through the one door, below. It never throws to stop the boot over something an administrator can fix, and never writes its own gate.

## Maintenance mode has one owner

`MaintenanceState` (`src/utils/maintenanceState.ts`), held by the Engine as `engine.maintenance`, owns maintenance mode: whether the site is in it, the reasons, the visitor message and estimate, and whether administrators may enter ([#1906](https://github.com/jwilleke/ngdpbase/issues/1906), operator 2026-10-19). `engine.blockConfiguration` is retired.

- __Enter:__ `engine.maintenance.enter(reason, { message?, estimatedDuration? })`. The reason is for administrators: write what failed and how to fix it. Pass `message` only when visitors should hear something other than the site's own maintenance message.
- __Leave:__ `engine.maintenance.leave(reason)`, with the same string, when the reason clears. The site reopens when none is left, without a restart.
- __Who uses it:__ AuditManager (`refuse-boot`), AddonsManager (a site-critical add-on that did not load), DatabaseManager (the application database cannot be opened), `app.ts` (an unusable TLS file or egress range) and the admin toggle. A new one goes through the same call.
- __Where the state lives:__ in memory on the Engine, created in its constructor, so a manager can enter it while the others are still initialising. A failure is true for one run, so it is never written into the operator's file. The admin switch is the one reason that survives a restart: the toggle also writes `ngdpbase.features.maintenance.enabled`, and `restoreSwitch` enters it again at boot.
- __What visitors see:__ the manager's message if it passed one, else `ngdpbase.features.maintenance.message` (any text an administrator sets), else the retired `ngdpbase.managers.addons-manager.site-critical.public-message` when a site set it, else the shipped message; the estimate likewise from `ngdpbase.features.maintenance.estimated-duration`. Never a reason, on the page or in `/health/readiness`.
- __Who gets in:__ a failure keeps everyone, administrators included, to `/admin`, `/login` and `/logout`, and `/health/readiness` answers 503. The admin switch alone lets administrators with `admin-system` use the whole site, when `ngdpbase.features.maintenance.allow-admins` is true.
- __What administrators see:__ every reason in the startup log and on the admin dashboard, plus whatever notification the manager sends (the add-on and database failures send a critical one).

## How to add a manager

1. Scaffold from [docs/templates/Manager-Template.md](../templates/Manager-Template.md).
2. Register it on `WikiEngine` in dependency order.
3. Add `docs/managers/YourManager.md` with `code: src/managers/YourManager.ts` in the same commit. The index in [Developer-Documentation.md](../Developer-Documentation.md) is generated from that frontmatter.
4. If it stores bytes, add a provider that extends the right `Base*Provider` and a Null or file default.

## How to add a provider

1. Scaffold from [docs/templates/Provider-Template.md](../templates/Provider-Template.md).
2. Bind it with `ngdpbase.<capability>.provider` and `ngdpbase.<capability>.provider.<name>.*`.
3. Load it with a dynamic `import()` inside the factory, not a top-level import.

## How you know you are done

- `npm test` covers the new door (authorize, audit, inert default).
- `docs/managers/YourManager.md` (or `docs/providers/…`) exists with a `code:` field.

## See also

- [guiding-framework.md](../guiding-framework.md)
- [architecture/MANAGERS-OVERVIEW.md](../architecture/MANAGERS-OVERVIEW.md)
- [BaseManager](../managers/BaseManager.md)
- [BaseProvider](../providers/BaseProvider.md)
- [configuration-developer-guide.md](configuration-developer-guide.md)

## Known gaps

- [#1211](https://github.com/jwilleke/ngdpbase/issues/1211)
- [#1134](https://github.com/jwilleke/ngdpbase/issues/1134)
- [#1135](https://github.com/jwilleke/ngdpbase/issues/1135)
- [#1109](https://github.com/jwilleke/ngdpbase/issues/1109)
- [#1167](https://github.com/jwilleke/ngdpbase/issues/1167)
- [#1136](https://github.com/jwilleke/ngdpbase/issues/1136)
- [#1906](https://github.com/jwilleke/ngdpbase/issues/1906): editing `ngdpbase.features.maintenance.enabled` on the configuration screen, rather than with the toggle, takes effect at the next restart. AuditManager and the TLS and egress checks send no notification of their own; their reasons are on the admin dashboard and in the log.
