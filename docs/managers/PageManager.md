---
name: PageManager
description: Page CRUD and storage facade over the PageProvider registry
dateModified: 2026-05-14
category: managers
code: src/managers/PageManager.ts
relatedModules: [BaseManager, FileSystemProvider, VersioningFileProvider]
status: stable
---

# PageManager

**Module:** `src/managers/PageManager.ts`
**Extends:** [BaseManager](BaseManager.md)
**Complete Guide:** [PageManager-Complete-Guide.md](PageManager-Complete-Guide.md)

---

## Overview

PageManager is the central coordinator for all wiki page operations. It implements a pluggable provider architecture following the JSPWiki pattern, allowing different storage backends (filesystem, database, cloud) to be swapped via configuration.

## Key Features

- **Pluggable Providers** - Swap storage backends via configuration
- **UUID-Based Storage** - Unique identifiers for all pages
- **Title and UUID Lookup** - Find pages by either identifier
- **Plural Name Matching** - "Users" finds "User" page
- **In-Memory Caching** - Fast lookups with indexes
- **WikiContext Support** - Context-aware save/delete operations
- **Backup/Restore** - Full page backup support

## Quick Example

```javascript
const pageManager = engine.getManager('PageManager');

// Save a page
await pageManager.savePage('My Page', '# Hello World', {
  author: 'jim',
  category: 'documentation'
});

// Get a page (by title or UUID)
const page = await pageManager.getPage('My Page');
console.log(page.content, page.uuid);

// Check existence
if (pageManager.pageExists('My Page')) {
  console.log('Page exists');
}

// Delete a page
await pageManager.deletePage('My Page');
```

## Core Methods

| Method | Returns | Description |
| -------- | --------- | ------------- |
| `getPage(identifier)` | `Promise<Object\|null>` | Get page by title or UUID |
| `getPageContent(identifier)` | `Promise<string>` | Get content only |
| `getPageMetadata(identifier)` | `Promise<Object\|null>` | Get metadata only |
| `savePage(name, content, metadata)` | `Promise<void>` | Save page |
| `deletePage(identifier)` | `Promise<boolean>` | Delete page |
| `pageExists(identifier)` | `boolean` | Check if page exists |
| `getAllPages()` | `Promise<string[]>` | Get all page titles |
| `refreshPageList()` | `Promise<void>` | Rescan storage |

## WikiContext Methods

| Method | Description |
| -------- | ------------- |
| `savePageWithContext(wikiContext, metadata)` | Save using WikiContext |
| `deletePageWithContext(wikiContext)` | Delete using WikiContext |

## Page Object Structure

```javascript
{
  content: string,      // Markdown content
  metadata: object,     // Frontmatter metadata
  title: string,        // Page title
  uuid: string,         // Page UUID
  filePath: string      // File path (FileSystemProvider)
}
```

## Configuration

```json
{
  "ngdpbase.page.enabled": true,
  "ngdpbase.page.provider": "filesystemprovider",
  "ngdpbase.page.provider.filesystem.storagedir": "./pages",
  "ngdpbase.page.provider.filesystem.requiredpagesdir": "./required-pages",
  "ngdpbase.page.provider.filesystem.encoding": "utf-8"
}
```

## Available Providers

| Provider | Status | Description |
| ---------- | -------- | ------------- |
| `FileSystemProvider` | Production | Filesystem with UUID naming |
| `DatabaseProvider` | Planned | SQL/NoSQL database storage |
| `S3Provider` | Planned | AWS S3 cloud storage |

## Related Managers

- [ConfigurationManager](ConfigurationManager.md) - Configuration settings
- [RenderingManager](RenderingManager.md) - Content rendering
- [SearchManager](SearchManager.md) - Page indexing and search
- [BackupManager](BackupManager.md) - Backup/restore operations

## Developer Documentation

For complete API reference, provider implementation details, and troubleshooting:

- [PageManager-Complete-Guide.md](PageManager-Complete-Guide.md)
