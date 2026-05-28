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
| `deletePage(identifier)` | Remove |
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

## See Also

- `src/managers/PageManager.ts` — consumer
- `src/types/Page.ts` — `WikiPage`, `PageFrontmatter`, `PageInfo`, `PageSaveOptions`, `PageListOptions`
- `src/types/Version.ts` — `VersionHistoryEntry`, `VersionContent`, `VersionDiff`
