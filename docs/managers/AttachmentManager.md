---
name: AttachmentManager
description: "File attachment CRUD: upload, lookup-by-filename, per-page attachment listings, SHA-256 deduplication"
dateModified: '2026-05-14'
category: managers
code: src/managers/AttachmentManager.ts
---

# AttachmentManager

__Module:__ `src/managers/AttachmentManager.ts`
__Extends:__ [BaseManager](BaseManager.md)
__Complete Guide:__ [AttachmentManager-Complete-Guide.md](AttachmentManager-Complete-Guide.md)

---

## Overview

AttachmentManager handles file attachments for wiki pages. Following JSPWiki's pattern, it delegates storage to pluggable providers while enforcing permissions and tracking attachment-page relationships.

## Key Features

- __Pluggable Storage Providers__ - Filesystem, database, or cloud storage backends
- __Schema.org Metadata__ - Rich metadata using CreativeWork format
- __Content Deduplication__ - SHA-256 hash-based storage prevents duplicates
- __Page Mentions Tracking__ - Track which pages reference attachments
- __Permission Enforcement__ - Integration with authenticated user context
- __Backup/Restore Support__ - Full backup via BackupManager

## Quick Example

```javascript
const attachmentManager = engine.getManager('AttachmentManager');

// Upload attachment
const attachment = await attachmentManager.uploadAttachment(
  fileBuffer,
  { originalName: 'doc.pdf', mimeType: 'application/pdf', size: 1024 },
  { pageName: 'ProjectDocs', context: wikiContext }
);

// Get attachment
const result = await attachmentManager.getAttachment(attachment.identifier);

// List attachments for a page
const pageAttachments = await attachmentManager.getAttachmentsForPage('ProjectDocs');

// Delete attachment
await attachmentManager.deleteAttachment(attachment.identifier, wikiContext);
```

## Core Methods

| Method | Returns | Description |
| -------- | --------- | ------------- |
| `uploadAttachment(buffer, fileInfo, options)` | `Promise<Object>` | Upload new attachment |
| `getAttachment(id)` | `Promise<{buffer, metadata}>` | Get attachment data and metadata |
| `getAttachmentMetadata(id)` | `Promise<Object>` | Get metadata only |
| `getAttachmentsForPage(pageName)` | `Promise<Array>` | List page attachments |
| `getAllAttachments()` | `Promise<Array>` | List all attachments |
| `deleteAttachment(id, context)` | `Promise<boolean>` | Delete attachment |
| `attachmentExists(id)` | `Promise<boolean>` | Check existence |
| `attachToPage(id, pageName)` | `Promise<boolean>` | Link attachment to page |
| `detachFromPage(id, pageName)` | `Promise<boolean>` | Unlink from page |
| `refreshAttachmentList()` | `Promise<void>` | Rescan storage |
| `getAttachmentUrl(id)` | `string` | Get attachment URL path |
| `getAttachmentByFilename(filename)` | `Promise<Object\|null>` | Find attachment by filename |
| `resolveAttachmentSrc(src, pageName)` | `Promise<{url, mimeType}\|null>` | Canonical src resolution used by Image/ATTACH plugins |

## Attachment Resolution Order

`resolveAttachmentSrc()` is the single resolution path shared by all plugins ([`[{Image}]`](../plugins/ImagePlugin.md), [`[{ATTACH}]`](../plugins/AttachPlugin.md)):

| Step | Trigger | Behavior |
| ------ | ------- | -------- |
| 0 | `src` starts with `media://` | Resolved via MediaManager by filename (see [MediaManager](MediaManager.md)) |
| 1 | `src` starts with `http://` or `https://` | Returned as-is |
| 2 | `src` starts with `/` | Returned as-is |
| 3 | plain filename | Page-local attachment lookup (exact filename) |
| 4 | plain filename | Global attachment search (lazily updates `mentions`) |
| — | no match | Returns `null` |

## UI Features

- __Upload Attachment__ - Modal from navbar (More... → Upload Attachment)
- __Browse Attachments__ - Browse all attachments (More... → Browse Attachments)
- __Insert from Browse__ - When editing, Insert button adds syntax at cursor
- __Admin Management__ - Full management at `/admin/attachments`

## User Documentation

See the wiki page [Attachments](/wiki/Attachments) for end-user documentation.

## Configuration

```json
{
  "ngdpbase.attachment.enabled": true,
  "ngdpbase.attachment.provider": "basicattachmentprovider",
  "ngdpbase.attachment.maxsize": 10485760,
  "ngdpbase.attachment.allowedtypes": "image/*,text/*,application/pdf",
  "ngdpbase.attachment.provider.basic.storagedir": "./data/attachments",
  "ngdpbase.attachment.provider.basic.hashcontent": true
}
```

## Available Providers

| Provider | Status | Storage |
| ---------- | -------- | --------- |
| `BasicAttachmentProvider` | Production | Filesystem with hash-based deduplication |
| `DatabaseAttachmentProvider` | Planned | SQL database |
| `S3AttachmentProvider` | Planned | AWS S3 |
| `AzureBlobAttachmentProvider` | Planned | Azure Blob Storage |

## Related Managers

- [PolicyManager](PolicyManager.md) - Access control policies
- [BackupManager](BackupManager.md) - Backup/restore operations
- [ConfigurationManager](ConfigurationManager.md) - Configuration settings

## Developer Documentation

For complete API reference, configuration options, provider implementation, and troubleshooting:

- [AttachmentManager-Complete-Guide.md](AttachmentManager-Complete-Guide.md)
