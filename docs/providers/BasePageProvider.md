---
name: BasePageProvider
description: Abstract interface for page storage providers — the canonical extension surface for new page backends
dateModified: '2026-05-28'
category: providers
code: src/providers/BasePageProvider.ts
---

# BasePageProvider

Abstract contract for page storage. Implement this to swap how wiki pages are persisted (filesystem, database, cloud, S3). `PageManager` delegates all storage operations to the configured provider.

Per the architecture: managers are agnostic to the filesystem; providers carry the storage-specific details. A page is a page from `PageManager`'s point of view; whether it lives at `pages/{uuid}.md` or in an S3 bucket is the provider's business.

## Implementations

- [FileSystemProvider](FileSystemProvider.md) — plain markdown files on local disk
- [VersioningFileProvider](VersioningFileProvider.md) — adds version history via delta-compressed snapshots (the default in production)

## Contract (high-level)

| Method | Purpose |
|---|---|
| `getPage(identifier)` | Load full page (content + metadata) |
| `getPageContent(identifier)` | Just the markdown body |
| `getPageMetadata(identifier)` | Just the frontmatter |
| `savePage(name, content, metadata, options?)` | Persist |
| `deletePage(identifier, deletedBy?)` | Remove — __hard or soft depending on the provider__, see below |
| `pageExists(identifier)` | Boolean check |
| `getAllPages()` / `getAllPageInfo(opts?)` | Enumerate |
| `findPage(identifier)` | Resolve UUID / title / slug |
| `getPageByUUID(uuid)` / `getPageBySlug(slug)` | Direct lookup |
| `refreshPageList()` | Re-scan storage |
| `movePrivatePage(uuid, oldCreator, newCreator)` | Hook for creator-keyed directories; default no-op |

## Versioning Surface (optional)

Providers that support versioning override:

- `getVersionHistory(identifier, limit?)`
- `getPageVersion(identifier, version)`
- `restoreVersion(identifier, version)`
- `compareVersions(identifier, v1, v2)`
- `purgeOldVersions(identifier, options?)`

Non-versioning providers leave these as the abstract default (which throws).

## Delete Semantics — provider-dependent (#947, #981)

__A delete is not the same operation on every provider, and callers must not assume it is recoverable.__

| Provider | `deletePage()` behaviour | Recoverable? |
|---|---|---|
| `FileSystemProvider` | __Hard delete__ — unlinks the file, drops it from the caches | No |
| `VersioningFileProvider` | __Soft delete__ — moves the file to `<location>/deleted/`, keeps the whole version directory, moves the index entry to a tombstone | Yes, for the retention window |

This follows directly from what each provider is: soft delete exists to preserve
version history, and a provider with no versions has none to preserve. There is
nothing to fix here — `FileSystemProvider` deleting outright is correct for what
it is. What matters is that __nothing downstream may assume otherwise.__

### Detecting the capability

The soft-delete surface is optional, exactly like the versioning surface above:

- `getDeletedPages()`
- `restoreDeletedPage(uuid)`
- `purgeDeletedPage(uuid)`
- `purgeExpiredDeletedPages()`

A provider without them has no trash. The admin trash API answers __501
`Soft delete not supported`__ rather than pretending, so the right capability
check is the response status — not the presence of a delete route, and not an
assumption carried over from another instance.

```js
const res = await fetch('/api/admin/deleted-pages');
if (res.status === 501) {
  // No trash on this instance. Deletes here are permanent.
}
```

### Why this bites

Instances in the same fleet can differ. During the v3.70.0 release the E2E
suite asserted that a deleted page lands in the trash — true on the instances
running `VersioningFileProvider`, false on the temp build, which runs a
provider with no versions. The test had passed for two releases because it only
ever ran where the assumption happened to hold.

The same class of mistake produced #981: a capability that is configuration- or
provider-dependent was treated as universal, and the resulting failure surfaced
as something unrelated.

### Retention

Where soft delete IS available, `ngdpbase.page.delete.retentiondays` (default
`30`, `0` = keep forever) governs when a tombstoned page and its versions are
purged for good. Purge runs at boot and hourly.

## See Also

- `src/managers/PageManager.ts` — consumer
- `src/types/Page.ts` — `WikiPage`, `PageFrontmatter`, `PageInfo`, `PageSaveOptions`, `PageListOptions`
- `src/types/Version.ts` — `VersionHistoryEntry`, `VersionContent`, `VersionDiff`
