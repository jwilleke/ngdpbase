---
name: BaseAttachmentProvider
description: Abstract interface for attachment storage providers — extension surface for new attachment backends
dateModified: '2026-05-28'
category: providers
code: src/providers/BaseAttachmentProvider.ts
---

# BaseAttachmentProvider

Abstract contract for attachment storage. Implement this to swap how attachments are persisted (filesystem, S3, database, etc.). `AttachmentManager` delegates all storage operations to the configured provider.

## Implementations

- [BasicAttachmentProvider](BasicAttachmentProvider.md) — filesystem-backed default

## Contract

Implementations must provide:

- `saveAttachment(pageUuid, filename, buffer, metadata?)` — store + return metadata
- `getAttachment(pageUuid, filename)` — retrieve buffer + metadata
- `deleteAttachment(pageUuid, filename)` — remove
- `listAttachments(pageUuid?)` — enumerate (per-page or global)
- `getProviderInfo()` — name/version/description/features for diagnostics

Files in a private store (#1400) — default implementations refuse or find nothing:

- `storeFileInStore(location, bytes, file)` — store in the store's own index; the same bytes already in THAT store return the existing entry
- `getFileInStore(location, id)` / `filesInStoreForPage(location, pageName)` / `deleteFileInStore(location, id)`

A `StoreFileLocation` is `{ owner, store, io }`. The `io` (`StoreFileIO`) already seals or not; the provider stores and reads, and never decides who may or whether to encrypt.

## See Also

- `src/managers/AttachmentManager.ts` — the consumer
- `src/types/AttachmentProvider.ts` — full interface definition
