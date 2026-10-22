---
name: AttachmentManager
description: "File attachment CRUD: upload, lookup-by-filename, per-page attachment listings, SHA-256 deduplication"
dateModified: '2026-10-22'
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
- __Backup/Restore Support__ - The files and their metadata are in every backup; a restore is staged with the rest of the site (#1876, [below](#backup-and-restore))

## Quick Example

```javascript
const attachmentManager = engine.getManager('AttachmentManager');

// Upload attachment
const attachment = await attachmentManager.uploadAttachment(
  fileBuffer,
  { originalName: 'doc.pdf', mimeType: 'application/pdf', size: 1024 },
  wikiContext.userContext, // who is uploading: mandatory, positional
  { pageName: 'ProjectDocs' }
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
| `uploadAttachment(buffer, fileInfo, ctx, options)` | `Promise<Object>` | Upload new attachment, recorded under `ctx`'s username ([below](#who-uploaded-it-1926)) |
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
| `resolveAttachmentSrc(src, pageName, ctx)` | `Promise<{url, mimeType}\|null>` | Canonical src resolution used by Image/ATTACH plugins; the viewer's context reaches their own sealed files |
| `getSealedAttachment(id, ctx)` | `Promise<{buffer, metadata}\|null>` | A file from the requester's own unlocked encrypted stores, decrypted (#1400) |
| `getSealedAttachmentsForPage(pageName, ctx)` | `Promise<Array>` | The requester's own sealed files uploaded onto a page (#1400) |

## Who uploaded it (#1926)

An upload's author and editor are the uploader's __username__, read from the context passed to `uploadAttachment`. The provider is handed `{ username }` (the `User` type in `BaseAttachmentProvider`); an email is never recorded as the uploader, and nothing is recorded as `Unknown`.

No one uploads anonymously. After policy allows the upload and before anything is written, a context with no username, or the anonymous subject's (`Anonymous`, which a share visitor carries too), is refused with `Permission denied: you must be signed in to upload a file`; the upload route answers it 401. `BasicAttachmentProvider.storeAttachment` also refuses a call that names no username. A vault upload by nobody is refused earlier, by the vault's container rule. Records written before #1926 keep what they have.

## Attachment Resolution Order

`resolveAttachmentSrc()` is the single resolution path shared by all plugins ([`[{Image}]`](../plugins/ImagePlugin.md), [`[{ATTACH}]`](../plugins/AttachPlugin.md)):

| Step | Trigger | Behavior |
| ------ | ------- | -------- |
| 0 | `src` starts with `media://` | Resolved via MediaManager by filename (see [MediaManager](MediaManager.md)) |
| 1 | `src` starts with `http://` or `https://` | Returned as-is |
| 2 | `src` starts with `/` | Returned as-is |
| 2a | plain filename | The viewer's own sealed files on this page, by name — only their own unlocked encrypted stores (#1400) |
| 3 | plain filename | Page-local attachment lookup (exact filename) |
| 4 | plain filename | Global attachment search (lazily updates `mentions`) |
| — | no match | Returns `null` |

## Files in an encrypted store (#1400)

A file uploaded into an __encrypted__ private store never enters the global `attachment-metadata.json`. The store is self-contained ([private stores](../private-stores.md), "Stores are self-contained"):

- The provider keeps it in the store: bytes in `{store}/attachments/{uuid}.ext`, listed in the store's own index `{store}/files-index.json`. Both are written through the store's `StoreFileIO`, which seals them with the store DEK. The name on disk is a random UUID, so it cannot confirm a known file.
- Duplicates are found in the same store only, by a SHA-256 fingerprint kept inside the sealed index.
- This manager is the door. It gets the store's I/O from the context, asks the PIP (`canAccessPrivateContainer`) who may reach the file, calls the provider and writes the audit record. Only the requester's own stores whose DEK the session holds are looked in; a locked store, or another user's, contributes nothing.
- Upload, serve (`/attachments/:id`, `Cache-Control: private, no-store`), the page's attached-files list, `[{ATTACH}]`/`[{Image}]` resolution and delete are covered. Unencrypted private files are still in the global index until [#1454](https://github.com/jwilleke/ngdpbase/issues/1454).

## UI Features

- __Upload Attachment__ - Modal from navbar (More... → Upload Attachment)
- __Browse Attachments__ - Browse all attachments (More... → Browse Attachments)
- __Insert from Browse__ - When editing, Insert button adds syntax at cursor
- __Admin Management__ - Full management at `/admin/attachments`

## User Documentation

See the wiki page [Attachments](/wiki/Attachments) for end-user documentation.

## Backup and restore

The files are in every backup, beside the document, never in it ([#1876](https://github.com/jwilleke/ngdpbase/issues/1876); `src/providers/attachmentFilesBackup.ts`):

- `<stem>.attachments.tar` — the shared pool folder, without `.thumbs` (made again on demand) and without the metadata file; the metadata is in the document (`providerBackup`).
- `<stem>.vault-attachments.tar` — each vault's `attachments/` folder and `files-index.json`, the bytes as stored: a sealed vault's files stay sealed, nothing is decrypted. PageManager's backup of the vaults leaves these out.
- Both are streamed, file by file. BackupManager names and keys each archive (`options.archive`), and checks each one a restore reads (`options.readArchive`) ([#1985](https://github.com/jwilleke/ngdpbase/issues/1985)): the pool and the vaults are not one folder, so this is special handling, not a declared folder. `backup()` throws outside BackupManager, and for a provider without `backupFiles`.

`restore()` is staged (`restoreIsStaged()`), as part of a site restore only: the pool is extracted to `<pool>.staged` with the metadata file written from the document, and each vault's files to `attachments.staged` and `files-index.json.staged` beside the live ones. A vault that must be sealed on this site whose files in the backup aren't all sealed bytes refuses the whole staging (#1836). A vault the site no longer has is not staged, and admins are told. A backup from another provider, or one taken before #1876, refuses. The part is recorded through the `siteRestore` restore option, at the paths it names (`stagedPathFor`). At the next start, before the metadata is read, the provider swaps the staged paths in when the whole site restore goes in, and only paths that are its own, through BackupManager's `applyStagedPartAtStart` ([#1986](https://github.com/jwilleke/ngdpbase/issues/1986)). Details in the [backup and restore guide](../guides/backup-restore-guide.md#the-staged-site-restore-1876-slice-1).

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
- [FileManager](FileManager.md) - The files door (#1852): reads today's attachments as file records through `sharedPoolAssetRecords`, `readableVaultAssetRecords` and, for the operator dry run, `vaultFileInventory`; the provider opens `{ readOnly: true }` for it

## Developer Documentation

For complete API reference, configuration options, provider implementation, and troubleshooting:

- [AttachmentManager-Complete-Guide.md](AttachmentManager-Complete-Guide.md)
