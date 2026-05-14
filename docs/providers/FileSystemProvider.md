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

**Quick Reference** | [Complete Guide](FileSystemProvider-Complete-Guide.md)

**Module:** `src/providers/FileSystemProvider.ts`
**Type:** Page Storage Provider
**Extends:** BasePageProvider
**Status:** Production Ready

## Overview

FileSystemProvider implements file-based page storage using Markdown files with YAML frontmatter. It's the default page storage provider, using UUID-based filenames for reliable identification while supporting title-based lookups.

## Key Features

- **UUID-based file naming** - Reliable page identity across renames
- **Title-based lookup** - Case-insensitive title matching
- **Plural name matching** - "Page" matches "Pages" automatically
- **Dual storage locations** - Regular pages and required/system pages
- **In-memory caching** - Multiple lookup indexes for performance
- **Frontmatter parsing** - Gray-matter for YAML metadata

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

- **During installation:** `installationComplete = false` → Loads from both `pagesDirectory` and `requiredPagesDirectory`
- **After installation:** `installationComplete = true` → Loads only from `pagesDirectory`

**Why?** Required pages (system docs, templates) are copied once during installation, not loaded every time.

## Cache Structure

FileSystemProvider uses a multi-index cache:

- **pageCache** - Main cache by canonical identifier
- **titleIndex** - Maps lowercase title to canonical identifier
- **uuidIndex** - Maps UUID to canonical identifier
- **slugIndex** - Maps URL slug to canonical identifier

## Related Documentation

- **Complete Guide:** [FileSystemProvider-Complete-Guide.md](FileSystemProvider-Complete-Guide.md)
- **Parent Class:** [BasePageProvider.md](BasePageProvider.md)
- **Manager:** [PageManager.md](../managers/PageManager.md)

---

**Last Updated:** 2025-12-22
**Version:** 1.5.0
