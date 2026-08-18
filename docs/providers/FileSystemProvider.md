---
name: FileSystemProvider
description: UUID-based page storage on local disk with YAML frontmatter
dateModified: 2026-05-14
category: providers
code: src/providers/FileSystemProvider.ts
relatedModules: [BasePageProvider, PageManager, VersioningFileProvider]
status: stable
---

# FileSystemProvider

__Quick Reference__ | [Complete Guide](FileSystemProvider-Complete-Guide.md)

__Module:__ `src/providers/FileSystemProvider.ts`
__Type:__ Page Storage Provider
__Extends:__ BasePageProvider
__Status:__ Production Ready

## Overview

FileSystemProvider implements file-based page storage using Markdown files with YAML frontmatter. It's the default page storage provider, using UUID-based filenames for reliable identification while supporting title-based lookups.

## Key Features

- __UUID-based file naming__ - Reliable page identity across renames
- __Title-based lookup__ - Case-insensitive title matching
- __Plural name matching__ - "Page" matches "Pages" automatically
- __Dual storage locations__ - Regular pages and required/system pages
- __In-memory caching__ - Multiple lookup indexes for performance
- __Frontmatter parsing__ - Gray-matter for YAML metadata

## Configuration

```javascript
// All configuration via ConfigurationManager (lowercase keys)
'ngdpbase.page.provider.filesystem.storagedir'         // Main pages directory (default: ./data/pages)
'ngdpbase.page.provider.filesystem.requiredpagesdir'   // Required pages dir (default: ./required-pages)
'ngdpbase.page.provider.filesystem.encoding'           // File encoding (default: utf-8)
'ngdpbase.translator-reader.match-english-plurals'     // Enable plural matching (default: true)
```

## Basic Usage

```javascript
// FileSystemProvider is configured via PageManager
// Not used directly - accessed through PageManager proxy methods

const pageManager = engine.getManager('PageManager');
const provider = pageManager.getCurrentPageProvider();

// Provider methods called via PageManager
await pageManager.getPage('MyPage');         // Uses provider.getPage()
await pageManager.getAllPages();             // Uses provider.getAllPages()
await pageManager.savePage('MyPage', {...}); // Uses provider.savePage()
```

## File Structure

```
data/pages/
  ├── 550e8400-e29b-41d4-a716-446655440000.md  (Home page)
  ├── 9f3a4b2c-5d1e-4a8f-b2c9-8e7f6d5c4a3b.md  (Plugin docs)
  └── a40812e4-3a9d-42b5-b5a8-e89b41a46096.md  (Metadata guide)

required-pages/                                 (Only loaded during installation)
  ├── 0a3d3111-7d22-4dfe-ae6d-b412a37a07cf.md  (System Pages)
  └── 86ca6fb2-5754-4fa6-9efc-6aaf6e592031.md  (Developer Docs)
```

## Core Methods

| Method | Purpose | Example |
| -------- | --------- | --------- |
| `getPage(identifier)` | Get page by title/UUID/slug | `await provider.getPage('Home')` |
| `getAllPages()` | Get all pages (cached) | `const pages = await provider.getAllPages()` |
| `pageExists(identifier)` | Check if page exists | `if (await provider.pageExists('MyPage'))` |
| `savePage(identifier, data)` | Create or update page | `await provider.savePage('MyPage', {...})` |
| `deletePage(identifier)` | Delete page | `await provider.deletePage('MyPage')` |
| `renamePage(oldName, newName)` | Rename page (preserves UUID) | `await provider.renamePage('Old', 'New')` |
| `refreshPageCache()` | Reload cache from disk | `await provider.refreshPageCache()` |

## Installation-Aware Loading

- __During installation:__ `installationComplete = false` → Loads from both `pagesDirectory` and `requiredPagesDirectory`
- __After installation:__ `installationComplete = true` → Loads only from `pagesDirectory`

__Why?__ Required pages (system docs, templates) are copied once during installation, not loaded every time.

## Cache Structure

FileSystemProvider uses a multi-index cache:

- __pageCache__ - Main cache by canonical identifier
- __titleIndex__ - Maps lowercase title to canonical identifier
- __uuidIndex__ - Maps UUID to canonical identifier
- __slugIndex__ - Maps URL slug to canonical identifier

## Related Documentation

- __Complete Guide:__ [FileSystemProvider-Complete-Guide.md](FileSystemProvider-Complete-Guide.md)
- __Parent Class:__ [BasePageProvider.md](BasePageProvider.md)
- __Manager:__ [PageManager.md](../managers/PageManager.md)

---

__Last Updated:__ 2025-12-22
__Version:__ 1.5.0
