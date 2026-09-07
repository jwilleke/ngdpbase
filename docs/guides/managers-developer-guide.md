---
name: Managers and providers developer guide
description: How to add a manager or provider — one door per resource, config selects the implementation
dateModified: 2026-09-06
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
