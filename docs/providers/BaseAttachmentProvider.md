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

## See Also

- `src/managers/AttachmentManager.ts` — the consumer
- `src/types/AttachmentProvider.ts` — full interface definition
