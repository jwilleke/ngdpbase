---
name: AssetManager
description: Provider registry for the unified Digital Asset Management framework — fans search/getById/getThumbnail across all registered AssetProviders
dateModified: '2026-10-24'
category: managers
code: src/managers/AssetManager.ts
---

# AssetManager

Holds a registry of `AssetProvider` instances (keyed by `provider.id`) and exposes a single search / getById / getThumbnail API that fans out across all registered providers. The built-in providers (BasicAttachmentProvider via AttachmentManager, FileSystemMediaProvider via MediaManager) are auto-registered in `initialize()`. Addons register additional providers via `registerProvider()`.

## Responsibilities

- __Provider registry__ — `registerProvider(provider)` / `unregisterProvider(id)`.
- __Federated query__ — `search(query, ctx)` / `getById(ctx, id)` / `getThumbnail(id)` fan out and merge. `getById` and `getAssetsForPage(ctx, slug)` take the caller's context and answer nothing to a caller the PDP refuses `asset-read` ([#2018](https://github.com/jwilleke/ngdpbase/issues/2018)).
- __Health monitoring__ — last-known status per provider in `healthMap`; surfaced via `ProviderHealthReport`.

## See Also

- [AssetProvider-Guide](../providers/AssetProvider-Guide.md) — how to build a new AssetProvider
- `src/types/Asset.ts` — `AssetProvider`, `AssetRecord`, `AssetPage`, `AssetQuery`, `AssetAggregations`
