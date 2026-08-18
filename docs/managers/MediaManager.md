---
name: MediaManager
description: Read-only external photo/video library (filesystem-backed) with EXIF indexing and keyword facets
dateModified: '2026-05-14'
category: managers
code: src/managers/MediaManager.ts
---

# MediaManager

__Module:__ `src/managers/MediaManager.ts`
__Extends:__ [BaseManager](BaseManager.md)
__Complete Guide:__ [MediaManager-Complete-Guide.md](MediaManager-Complete-Guide.md)

---

## Overview

MediaManager browses, searches, and serves thumbnails for pre-existing media files
(photos, videos) stored on external drives or local folders. It is strictly
__read-only__ with respect to source files. A persistent JSON index and on-demand
Sharp thumbnails are maintained in the configured data directory.

## Key Features

- __Filesystem scanning__ — recursive walk of configured folders via `exiftool-vendored`
- __EXIF / IPTC / XMP metadata__ — date, title, description, keywords, camera, GPS
- __Persistent JSON index__ — loaded at startup; incrementally updated on each scan
- __Thumbnail generation__ — Sharp, cached to disk; images only (videos show placeholder)
- __Year-based browse__ — items grouped by year (from EXIF or filename/path fallback)
- __Keyword browsing__ — `listByKeyword()` returns items whose EXIF/XMP keywords contain a given value; powers `/media/keyword/:keyword` album pages
- __Full-text search__ — multi-token AND search across all metadata fields
- __Private-page awareness__ — items linked to private pages hidden from non-owners
- __MediaPlugin integration__ — `[{MediaPlugin}]` wiki plugin embeds counts, lists, and thumbnail albums in wiki pages
- __Opt-in__ — disabled by default (`ngdpbase.media.enabled = false`)
- __Background rescan__ — configurable periodic timer

## Quick Example

```typescript
const mediaManager = engine.getManager('MediaManager');

// Trigger a rescan
const result = await mediaManager.scanFolders(true);
// { scanned: 12400, added: 43, updated: 7, errors: 0 }

// List years
const years = await mediaManager.getYears();
// [2025, 2024, 2023, ...]

// Items for a year (private-filtered)
const items = await mediaManager.listByYear(2024, wikiContext);

// Items for a keyword (private-filtered)
const kwItems = await mediaManager.listByKeyword("Molly's Cooking", wikiContext);

// Single item
const item = await mediaManager.getItem(id, wikiContext);

// Thumbnail buffer
const buffer = await mediaManager.getThumbnailBuffer(id, '300x300');

// Search
const results = await mediaManager.search('birthday 2023', wikiContext);
```

## Core Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `scanFolders(force?)` | `Promise<ScanResult>` | Walk configured folders and update index |
| `getYears(wikiContext?)` | `Promise<number[]>` | Sorted-descending list of years with items |
| `listByYear(year, wikiContext?)` | `Promise<MediaItem[]>` | All items for a year, privacy-filtered |
| `listByKeyword(keyword, wikiContext?)` | `Promise<MediaItem[]>` | Items whose EXIF/XMP keywords contain `keyword`, privacy-filtered |
| `listByPage(pageName, wikiContext?)` | `Promise<MediaItem[]>` | Items linked to a wiki page by `linkedPageName`, privacy-filtered |
| `getItem(id, wikiContext?)` | `Promise<MediaItem\|null>` | Single item by ID, privacy-filtered |
| `findByFilename(filename)` | `Promise<MediaItem\|null>` | Find first item by basename — used by `media://` URI resolution |
| `search(query, wikiContext?)` | `Promise<MediaItem[]>` | Keyword search, privacy-filtered |
| `getThumbnailBuffer(id, size)` | `Promise<Buffer\|null>` | JPEG thumbnail (cached) |
| `shutdown()` | `Promise<void>` | Clear timer, release ExifTool worker |

## Wiki Integration — `media://` URI Scheme

MediaManager integrates with the attachment resolution pipeline so that media library photos can be embedded in wiki pages using `[{Image}]` or `[{ATTACH}]` without uploading them as wiki attachments.

### Syntax

```wiki
[{Image src='media://IMG_1234.jpg' caption='Family Trip 2024'}]
[{ATTACH src='media://vacation.jpg' align='left' display='float'}]
```

### How It Works

When `AttachmentManager.resolveAttachmentSrc()` encounters a `src` that starts with `media://` it:

1. Strips the prefix and calls `MediaManager.findByFilename(filename)`
2. If a matching item is found, returns `{ url: '/media/file/{id}', mimeType: '...' }`
3. The `/media/file/:id` route serves the raw file with access control

No attachment upload is needed. The media library index is consulted only for `media://` prefixed values, so normal attachment resolution is unaffected.

### Access Control

- `/media/file/:id` enforces the same private-page access control as other media routes
- Items linked to private pages are inaccessible to non-owners even when referenced by `media://` URI

## HTTP Routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/media` | Year-grid browse page |
| `GET` | `/media/year/:year` | Thumbnail grid for a year |
| `GET` | `/media/keyword/:keyword` | Thumbnail album for a keyword |
| `GET` | `/media/item/:id` | Item detail page (image preview or video player) |
| `GET` | `/media/file/:id` | Raw file stream with HTTP Range support (for video seeking) |
| `GET` | `/media/search` | Search form + results |
| `GET` | `/media/thumb/:id?size=WxH` | Thumbnail image |
| `GET` | `/media/api/item/:id` | JSON: single item metadata |
| `GET` | `/media/api/year/:year` | JSON: all items for a year |
| `GET` | `/admin/media` | Admin: stats + rescan |
| `POST` | `/admin/media/rescan` | Trigger full rescan (admin only) |

All routes return __503__ when `ngdpbase.media.enabled = false`.

## Configuration

```json
{
  "ngdpbase.media.enabled": false,
  "ngdpbase.media.folders": [],
  "ngdpbase.media.maxdepth": 5,
  "ngdpbase.media.scaninterval": 3600000,
  "ngdpbase.media.ignoredirs": [".dtrash", ".ts"],
  "ngdpbase.media.extensions": [],
  "ngdpbase.media.index.file": "",
  "ngdpbase.media.thumbnail.dir": "",
  "ngdpbase.media.thumbnail.sizes": "300x300,150x150",
  "ngdpbase.media.metadata.priority": ["EXIF", "IPTC", "XMP"]
}
```

Leave `ngdpbase.media.extensions` empty (or omit it) to use the built-in default extension list. Provide a non-empty array to override it entirely.

## Excluding Files and Directories

Two mechanisms are available to prevent specific files or folders from being indexed:

### `.ngdpbaseignore` pattern file

Place a `.ngdpbaseignore` file in any media directory. Patterns follow gitignore syntax — blank lines and `#` comments are ignored, `*` is a wildcard, and a trailing `/` restricts the pattern to directories only. Patterns apply to files and subdirectories within the same directory.

```
# skip all Windows Media Video files
*.wmv

# skip an outtakes subdirectory
outtakes/

# skip a specific file
vacation-embarrassing.jpg
```

### `ngdpbaseignore` EXIF keyword

For image files that support EXIF/XMP metadata, add the keyword `ngdpbaseignore` using any photo management tool (Lightroom, Capture One, exiftool, etc.). On the next scan the file is excluded from the index and evicted if it was previously indexed. This mechanism requires no filesystem changes and travels with the file if it is moved between indexed folders.

## Provider

| Provider | Status | Notes |
|----------|--------|-------|
| `FileSystemMediaProvider` | Production | Recursive walk, ExifTool, Sharp thumbnails |

## Related

- [FileSystemMediaProvider](../providers/FileSystemMediaProvider.md)
- [BaseMediaProvider](../providers/BaseMediaProvider.md)
- [ConfigurationManager](ConfigurationManager.md)
- [MediaPlugin](../../plugins/MediaPlugin.ts)
- [MediaManager-Complete-Guide.md](MediaManager-Complete-Guide.md)

## User Documentation

See the wiki page [Media Management](/wiki/media-management) for end-user documentation.
