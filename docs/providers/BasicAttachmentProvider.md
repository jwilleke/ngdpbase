---
name: BasicAttachmentProvider
description: File-system attachment storage with SHA-256-content-addressed dedup and per-page listings
dateModified: '2026-05-14'
category: providers
code: src/providers/BasicAttachmentProvider.ts
---

# BasicAttachmentProvider

__Quick Reference__ | [Complete Guide](BasicAttachmentProvider-Complete-Guide.md)

__Module:__ `src/providers/BasicAttachmentProvider.ts`
__Type:__ Attachment Storage Provider
__Extends:__ BaseAttachmentProvider
__Status:__ Production Ready

## Overview

BasicAttachmentProvider implements filesystem-based attachment storage with SHA-256 content hashing for deduplication. Attachments are stored in a shared directory with Schema.org CreativeWork metadata tracking which pages reference each file.

## Key Features

- __Content-based deduplication__ - SHA-256 hash prevents duplicate storage
- __Schema.org metadata__ - CreativeWork format with full provenance
- __Shared storage model__ - Attachments stored once, referenced by multiple pages
- __Page mentions tracking__ - Tracks which pages use each attachment
- __MIME type filtering__ - Configurable allowed file types with wildcard support
- __Size limits__ - Configurable maximum file size
- __Backup/restore support__ - Full integration with BackupManager

## Configuration

```javascript
// All configuration via ConfigurationManager (lowercase keys)
'ngdpbase.attachment.provider.basic.storagedir'  // Storage directory (default: ./data/attachments)
'ngdpbase.attachment.metadatafile'               // Metadata file (default: ./data/attachments/attachment-metadata.json)
'ngdpbase.attachment.maxsize'                    // Max file size bytes (default: 10485760 = 10MB)
'ngdpbase.attachment.allowedtypes'               // MIME types (default: 'image/*,text/*,application/pdf')
'ngdpbase.attachment.provider.basic.hashcontent' // Enable content hashing (default: true)
'ngdpbase.attachment.provider.basic.hashmethod'  // Hash algorithm (default: 'sha256')
```

## Basic Usage

```javascript
// BasicAttachmentProvider is configured via AttachmentManager
const attachmentManager = engine.getManager('AttachmentManager');
const provider = attachmentManager.getCurrentAttachmentProvider();

// Upload attachment (via AttachmentManager)
const attachment = await attachmentManager.uploadAttachment(
  'MyPage',           // Page name
  fileBuffer,         // File buffer
  'photo.jpg',        // Original filename
  'image/jpeg',       // MIME type
  { author: 'admin' } // Metadata
);

// Get attachment
const file = await attachmentManager.getAttachment(attachment.attachmentId);

// Delete attachment
await attachmentManager.deleteAttachment(attachment.attachmentId);
```

## Storage Structure

```
data/attachments/
  ├── 621c9274e39fc77d5e6cce7028c7805a37e5d977f116c20cc8be728d8de90c26  (SHA-256 hash)
  ├── abc123def456...  (Another file)
  └── metadata.json    (Schema.org CreativeWork metadata)
```

## Metadata Format

```json
{
  "621c9274e39fc77d5e6cce7028c7805a37e5d977f116c20cc8be728d8de90c26": {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    "name": "photo.jpg",
    "description": "User uploaded photo",
    "author": {
      "@type": "Person",
      "name": "admin"
    },
    "dateCreated": "2025-01-22T10:00:00.000Z",
    "encodingFormat": "image/jpeg",
    "contentSize": "245760",
    "mentions": [
      {
        "@type": "WebPage",
        "name": "MyPage",
        "url": "/wiki/MyPage"
      },
      {
        "@type": "WebPage",
        "name": "Gallery",
        "url": "/wiki/Gallery"
      }
    ]
  }
}
```

## Core Methods

| Method | Purpose | Example |
| -------- | --------- | --------- |
| `uploadAttachment(page, buffer, filename, mimeType, metadata)` | Upload new file | `await provider.uploadAttachment('MyPage', buffer, 'file.pdf', 'application/pdf', {...})` |
| `getAttachment(attachmentId)` | Get file buffer | `const file = await provider.getAttachment('621c927...')` |
| `getAttachmentMetadata(attachmentId)` | Get metadata only | `const meta = await provider.getAttachmentMetadata('621c927...')` |
| `listAttachments(pageName)` | Get all attachments for page | `const files = await provider.listAttachments('MyPage')` |
| `deleteAttachment(attachmentId, pageName)` | Delete file (or remove page mention) | `await provider.deleteAttachment('621c927...', 'MyPage')` |
| `attachmentExists(attachmentId)` | Check if file exists | `if (await provider.attachmentExists('621c927...'))` |

## Content Deduplication

BasicAttachmentProvider uses SHA-256 hashing to prevent duplicate storage:

```javascript
// User uploads logo.png to Page A (SHA-256: abc123...)
await provider.uploadAttachment('PageA', buffer1, 'logo.png', 'image/png', {...});
// File stored at: data/attachments/abc123...

// User uploads same logo.png to Page B (SHA-256: abc123...)
await provider.uploadAttachment('PageB', buffer2, 'logo.png', 'image/png', {...});
// File NOT duplicated - mentions array updated to include PageB

// Result: One file, two page references
metadata['abc123...'].mentions = [
  { name: 'PageA', url: '/wiki/PageA' },
  { name: 'PageB', url: '/wiki/PageB' }
]
```

## MIME Type Filtering

```javascript
// Configuration
'ngdpbase.attachment.allowedtypes': 'image/*,text/*,application/pdf'

// Upload checks MIME type
await provider.uploadAttachment('Page', buffer, 'file.exe', 'application/x-msdownload', {...});
// ✗ Rejected - .exe not in allowed types

await provider.uploadAttachment('Page', buffer, 'photo.jpg', 'image/jpeg', {...});
// ✓ Accepted - image/* matches image/jpeg
```

## Size Limits

```javascript
// Configuration
'ngdpbase.attachment.maxsize': 10485760  // 10MB in bytes

// Upload checks file size
const largeBuffer = Buffer.alloc(20 * 1024 * 1024);  // 20MB
await provider.uploadAttachment('Page', largeBuffer, 'huge.pdf', 'application/pdf', {...});
// ✗ Rejected - exceeds 10MB limit
```

## Page Mentions Tracking

```javascript
// Upload to Page A
await provider.uploadAttachment('PageA', buffer, 'doc.pdf', 'application/pdf', {...});
// mentions: [{ name: 'PageA', url: '/wiki/PageA' }]

// Reference same file from Page B
await provider.uploadAttachment('PageB', buffer, 'doc.pdf', 'application/pdf', {...});
// mentions: [{ name: 'PageA', ... }, { name: 'PageB', ... }]

// Delete from Page A
await provider.deleteAttachment(attachmentId, 'PageA');
// mentions: [{ name: 'PageB', ... }]  ← File still exists

// Delete from Page B (last mention)
await provider.deleteAttachment(attachmentId, 'PageB');
// mentions: []  ← File deleted from disk
```

## Security Integration

BasicAttachmentProvider integrates with AttachmentManager's PolicyManager checks:

```javascript
// AttachmentManager checks permissions BEFORE calling provider
const canUpload = await policyManager.checkPermission(userContext, 'attachment:upload');
if (canUpload) {
  await provider.uploadAttachment(...);  // Provider does the actual upload
}

const canDelete = await policyManager.checkPermission(userContext, 'attachment:delete');
if (canDelete) {
  await provider.deleteAttachment(...);
}
```

__Permissions:__

- `attachment:upload` - Upload new attachments
- `attachment:delete` - Delete attachments

## Backup and Restore

```javascript
// Backup includes all files and metadata
const backup = await provider.backup();
/*
{
  attachments: [
    { id: '621c927...', filename: 'photo.jpg', buffer: <Buffer>, metadata: {...} }
  ],
  metadata: { ... }  // Full metadata.json
}
*/

// Restore recreates all files and metadata
await provider.restore(backup);
```

## Image Upload Workflow

```javascript
// 1. User uploads image via editor or navbar
POST /attachments/upload/MyPage
Content-Type: multipart/form-data
file: <image buffer>

// 2. AttachmentManager calls provider
const attachment = await provider.uploadAttachment(
  'MyPage', imageBuffer, 'vacation.jpg', 'image/jpeg', { author: 'admin' }
);

// 3. Provider returns attachment metadata
{
  attachmentId: '621c9274e39fc77d5e6cce7028c7805a37e5d977f116c20cc8be728d8de90c26',
  url: '/attachments/621c927...',
  filename: 'vacation.jpg',
  mimeType: 'image/jpeg'
}

// 4. Image syntax inserted into page
[{Image src='/attachments/621c927...' alt='vacation.jpg'}]
```

## Performance Considerations

- __Hash computation__ - SHA-256 on upload (~10ms for 10MB file)
- __Deduplication__ - Prevents redundant storage
- __Metadata loading__ - Entire metadata.json loaded at startup
- __File I/O__ - Direct filesystem access (no database)

## Dependencies

- `fs-extra` - Filesystem operations
- `crypto` - SHA-256 hashing
- `path` - Path manipulation

## Related Documentation

- __Complete Guide:__ [BasicAttachmentProvider-Complete-Guide.md](BasicAttachmentProvider-Complete-Guide.md)
- __Parent Class:__ [BaseAttachmentProvider.md](BaseAttachmentProvider.md)
- __Manager:__ [AttachmentManager.md](../managers/AttachmentManager.md)
- __Image Plugin:__ [ImagePlugin.md](../plugins/ImagePlugin.md)

## Common Issues

__Q: File uploaded but not showing?__
A: Check page mentions - file may be associated with different page

__Q: Duplicate files consuming space?__
A: SHA-256 deduplication should prevent this - check hash method is enabled

__Q: Upload rejected?__
A: Verify MIME type in allowedtypes config and file size under maxsize limit

__Q: Metadata file growing large?__
A: Consider pruning old attachments with no page mentions

---

__Last Updated:__ 2025-12-22
__Version:__ 1.5.0
