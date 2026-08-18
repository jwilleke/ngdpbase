# MediaManager — Complete Guide

__Module:__ `src/managers/MediaManager.ts`
__Quick Reference:__ [MediaManager.md](MediaManager.md)
__Version:__ 1.2.0
__Last Updated:__ 2026-03-11
__Issue:__ #273

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Configuration](#configuration)
4. [Initialization Sequence](#initialization-sequence)
5. [Scanning](#scanning)
6. [Excluding Files and Directories](#excluding-files-and-directories)
7. [Media Index](#media-index)
8. [Querying](#querying)
9. [Keyword Browsing](#keyword-browsing)
10. [Thumbnail Generation](#thumbnail-generation)
11. [Privacy and Access Control](#privacy-and-access-control)
12. [MediaPlugin Integration](#mediaplugin-integration)
13. [HTTP Routes](#http-routes)
14. [API Reference](#api-reference)
15. [Provider System](#provider-system)
16. [Background Scanning](#background-scanning)
17. [Shutdown](#shutdown)
18. [Troubleshooting](#troubleshooting)
19. [Future Roadmap](#future-roadmap)

---

## Overview

MediaManager is the high-level coordinator for ngdpbase's media browsing feature. It:

- Reads config from `ConfigurationManager` (`ngdpbase.media.*` keys)
- Creates and owns a `FileSystemMediaProvider` instance
- Exposes query methods (`getItem`, `listByYear`, `listByKeyword`, `listByPage`, `search`, `getYears`, `getThumbnailBuffer`) to WikiRoutes and plugins
- Applies private-page access control before returning items to callers
- Manages a periodic background rescan timer

The manager is __opt-in__: it is only instantiated by `WikiEngine` when
`ngdpbase.media.enabled = true`. All HTTP routes return 503 when the manager
is absent.

## Architecture

```text
WikiEngine
  └── MediaManager (conditional on ngdpbase.media.enabled)
        ├── FileSystemMediaProvider
        │     ├── ExifTool worker  (exiftool-vendored)
        │     ├── media-index.json (persistent index)
        │     └── thumbnailDir/    (JPEG cache)
        └── setInterval → scanFolders()

MediaPlugin (wiki plugin)
  └── engine.getManager('MediaManager')
        ├── listByKeyword()
        ├── listByPage()
        ├── listByYear()
        └── getYears()
```

### Responsibilities

| Component | Responsibility |
|-----------|---------------|
| `MediaManager` | Config, privacy guard, periodic timer, public API |
| `FileSystemMediaProvider` | Filesystem walk, EXIF, index I/O, thumbnail generation |
| `BaseMediaProvider` | Abstract interface; `initialize()`, `getYears()`, `scan()`, `getItem()`, `getItemsByYear()`, `getItemsByKeyword()`, `getItemsByPage()`, `search()`, `getThumbnailBuffer()`, `shutdown()` |
| `MediaPlugin` | Wiki plugin; embeds counts, lists, thumbnail albums in wiki pages |

## Configuration

All keys are in `ngdpbase.media.*`. Set them in your instance
`app-custom-config.json` (or environment-specific config).

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `ngdpbase.media.enabled` | boolean | `false` | Must be `true` to register the manager |
| `ngdpbase.media.folders` | string[] | `[]` | Absolute paths to scan |
| `ngdpbase.media.maxdepth` | number | `5` | Max recursion depth (0 = unlimited) |
| `ngdpbase.media.scaninterval` | number | `3600000` | Background rescan interval in ms; `0` = disabled |
| `ngdpbase.media.ignoredirs` | string[] | `[".dtrash", ".ts"]` | Directory names to skip unconditionally |
| `ngdpbase.media.extensions` | string[] | *(built-in list)* | File extensions to index; overrides `DEFAULT_MEDIA_EXTENSIONS` when non-empty |
| `ngdpbase.media.index.file` | string | *(FAST_STORAGE/media-index.json)* | Absolute path to index file |
| `ngdpbase.media.thumbnail.dir` | string | *(FAST_STORAGE/media/thumbs)* | Absolute path to thumbnail cache |
| `ngdpbase.media.thumbnail.sizes` | string | `"300x300,150x150"` | Comma-separated WxH specs |
| `ngdpbase.media.metadata.priority` | string[] | `["EXIF","IPTC","XMP"]` | Metadata source priority (reserved) |

### Minimal working configuration

```json
{
  "ngdpbase.media.enabled": true,
  "ngdpbase.media.folders": ["/Volumes/hd2A/media/photos/2020s", "/Volumes/hd2A/media/photos/older"]
}
```

### Overriding the extension list

The built-in `DEFAULT_MEDIA_EXTENSIONS` covers common image and video formats
(see [Thumbnail Generation](#thumbnail-generation)). To index only a subset or
to add formats like `.webm` or `.flv`, set `ngdpbase.media.extensions` to a
complete replacement list:

```json
{
  "ngdpbase.media.extensions": ["jpg", "jpeg", "png", "heic", "mp4", "mov", "webm"]
}
```

Values are normalised to lowercase; a leading dot is stripped automatically.

## Initialization Sequence

`MediaManager.initialize()` runs during engine startup (after `ConfigurationManager`):

1. Reads all `ngdpbase.media.*` keys from `ConfigurationManager`
2. Reads `ngdpbase.media.extensions`; falls back to `DEFAULT_MEDIA_EXTENSIONS` when the value is an empty array
3. Calls `fs.ensureDir(thumbnailDir)` — creates thumbnail directory if absent
4. Creates `new FileSystemMediaProvider({ ..., extensions })`
5. Calls `provider.initialize()` — loads existing `media-index.json` into memory
6. If `scanInterval > 0`, starts a `setInterval` timer calling `scanFolders()`;
   calls `.unref()` so the process can exit cleanly

## Scanning

### On-demand (admin-triggered)

```
POST /admin/media/rescan
→ MediaManager.scanFolders(true)
→ FileSystemMediaProvider.scan(true)
→ walks folders, processes new/changed files
→ saves index to disk
→ returns ScanResult { scanned, added, updated, errors }
```

### Background (periodic)

The scan timer calls `scanFolders()` (no force flag) at the configured interval.
Incremental scans skip files whose `stat.mtimeMs` matches the cached value.

### ScanResult

```typescript
interface ScanResult {
  scanned:   number;   // Total files examined
  added:     number;   // New items added to index
  updated:   number;   // Existing items refreshed
  errors:    number;   // Files that could not be processed
  elapsedMs?: number;  // Optional: elapsed time in ms
}
```

## Excluding Files and Directories

Two complementary mechanisms allow files and folders to be excluded from the index.

### `.ngdpbaseignore` pattern file

Place a `.ngdpbaseignore` file in any directory within a configured media folder. The scanner reads its contents and applies the patterns to files and subdirectories in that directory before calling ExifTool — excluded items incur no metadata-read overhead.

__Pattern syntax__ (gitignore-compatible):

| Pattern | Effect |
|---------|--------|
| `*.wmv` | Skip all `.wmv` files in this directory |
| `outtakes/` | Skip the `outtakes` subdirectory (trailing `/` = dirs only) |
| `vacation-embarrassing.jpg` | Skip a specific file |
| `# comment` | Line is ignored |
| *(blank line)* | Line is ignored |

```
# /Volumes/photos/2023/.ngdpbaseignore

# skip raw unedited files
*.orf
*.cr2

# skip the rejects folder
rejects/

# skip a specific file
IMG_0001.jpg
```

Patterns apply only to the directory containing the `.ngdpbaseignore` file, not recursively to all descendants. Place additional `.ngdpbaseignore` files in subdirectories as needed.

`ngdpbase.media.ignoredirs` entries (e.g. `.dtrash`, `.ts`) are still applied unconditionally by directory name across the entire tree, independently of `.ngdpbaseignore`.

### `ngdpbaseignore` EXIF keyword

Add the keyword `ngdpbaseignore` to a file's EXIF or XMP metadata using any photo management tool (Lightroom, Capture One, Bridge, or `exiftool` on the command line):

```bash
exiftool -Keywords+=ngdpbaseignore /path/to/photo.jpg
```

On the next scan, the file is excluded from the index. If it was previously indexed it is evicted immediately. The keyword travels with the file if it is moved between indexed folders, and does not require any filesystem changes to the scan configuration.

This mechanism is most useful for per-file exclusion on metadata-capable formats (JPEG, HEIC, TIFF, PNG, most RAW formats). It is not applicable to video files that carry no keyword metadata.

### `ScanResult.excluded`

Both mechanisms increment `ScanResult.excluded` so admin tooling can surface how many files were skipped in a given scan.

## Media Index

The index is a flat JSON object mapping item IDs to `MediaIndexEntry` records.

### ID generation

```
id = SHA-256(absoluteFilePath).slice(0, 32)
```

IDs are stable as long as the file path does not change.

### MediaIndexEntry (internal)

```typescript
interface MediaIndexEntry extends MediaItem {
  mtime: number;  // stat.mtimeMs at index time
}
```

### MediaItem (public interface)

```typescript
interface MediaItem {
  id:              string;           // SHA-256(filePath)[0:32]
  filePath:        string;           // Absolute path on disk
  filename:        string;           // Basename
  mimeType:        string;           // e.g. "image/jpeg"
  year?:           number;           // Four-digit year
  dirPath?:        string;           // Parent directory
  linkedPageName?: string;           // Associated wiki page (optional)
  isPrivate?:      boolean;          // Linked to a private page
  creator?:        string;           // Creator of linked page
  metadata?: {
    title:         unknown;
    description:   unknown;
    keywords:      unknown;          // string | string[] — EXIF/IPTC/XMP keywords
    make:          unknown;
    model:         unknown;
    gpsLatitude:   unknown;
    gpsLongitude:  unknown;
    imageWidth?:   unknown;
    imageHeight?:  unknown;
    fileSize?:     unknown;
  };
}
```

> Note: The `eventName` field was removed. Event-based grouping is now
> accomplished via EXIF/XMP keywords rather than filename parsing.

### Persistent file format

```json
{
  "version": 1,
  "updatedAt": "2026-03-11T12:00:00.000Z",
  "items": {
    "a3f7c2d1e8b4690f2a1c3d5e7f9b0c12": {
      "id": "a3f7c2d1e8b4690f2a1c3d5e7f9b0c12",
      "filePath": "/Volumes/hd2A/media/photos/2023/birthday-001.jpg",
      "filename": "birthday-001.jpg",
      "mimeType": "image/jpeg",
      "year": 2023,
      "dirPath": "/Volumes/hd2A/media/photos/2023",
      "mtime": 1686825600000,
      "metadata": {
        "title": null,
        "description": "Garden party",
        "keywords": ["family", "summer", "Birthday 2023"],
        "make": "Apple",
        "model": "iPhone 14 Pro",
        "gpsLatitude": 37.7749,
        "gpsLongitude": -122.4194
      }
    }
  }
}
```

## Querying

All public query methods apply privacy filtering via `checkPrivatePageAccess()`
before returning items to callers. Passing `undefined` as `wikiContext`
bypasses filtering (for admin / internal use).

### getYears

Returns unique years from the in-memory index, sorted descending.

### listByYear

Returns all items where `item.year === year`, sorted by filename.

### listByPage

Delegates to `provider.getItemsByPage(pageName)`. Matches items where
`item.linkedPageName === pageName`. Useful for wiki pages that have media
associated with them via the `linkedPageName` field rather than EXIF keywords.

### getItem

Returns the single item matching `id`, or `null` if not found or access denied.

### search

Multi-token AND search. All query tokens must match (case-insensitive) somewhere
in the combined haystack of: filename, year, title, description, and keywords.

## Keyword Browsing

### listByKeyword

```typescript
async listByKeyword(keyword: string, wikiContext?: WikiContext): Promise<MediaItem[]>
```

Delegates to `provider.getItemsByKeyword(keyword)`. The provider performs an
__exact, case-sensitive match__ against each entry in `metadata.keywords`
(which may be a string or a string array). Items with no keywords are excluded.
The result is then passed through `filterPrivateItems()` before being returned.

Passing `undefined` as `wikiContext` bypasses privacy filtering (admin/internal
use only).

### getItemsByPage

```typescript
async listByPage(pageName: string, wikiContext?: WikiContext): Promise<MediaItem[]>
```

Delegates to `provider.getItemsByPage(pageName)`. Matches items whose
`linkedPageName` field equals `pageName`. This is distinct from keyword
browsing: `listByPage` uses the explicit page association set at index time,
while `listByKeyword` uses EXIF/XMP metadata.

### /media/keyword/:keyword route

```
GET /media/keyword/:keyword
→ mediaManager.listByKeyword(keyword, wikiContext)
→ renders media-keyword.ejs
   Variables: keyword (string), items (MediaItem[])
```

The route URL-decodes the `:keyword` parameter before passing it to
`listByKeyword`, so keywords with spaces and special characters (including
apostrophes) are handled correctly.

### Album-aware prev/next navigation

When the item detail page (`/media/item/:id`) is accessed with a `?keyword=`
query parameter, prev/next navigation is scoped to that keyword's item list
rather than the year's item list:

```typescript
// In mediaItemDetail route:
const albumKeyword = typeof req.query.keyword === 'string' ? req.query.keyword : null;
if (albumKeyword) {
  const siblings = await mediaManager.listByKeyword(albumKeyword, wikiContext);
  // find index of current item in siblings, set prevItem / nextItem
} else if (item.year) {
  const siblings = await mediaManager.listByYear(item.year, wikiContext);
  // ...
}
```

Links generated by `formatAsAlbum()` in `MediaPlugin` automatically append
`?keyword={keyword}` to item detail URLs when a keyword filter is active,
ensuring the album context is preserved as the user navigates between items.

## Thumbnail Generation

Thumbnails are generated by `FileSystemMediaProvider.getThumbnailBuffer()` on first
request and cached to disk as:

```
{thumbnailDir}/{id}-{size}.jpg
```

- Format: JPEG, 85% quality
- Resize mode: `cover` (Sharp) — crops to fill exactly `WxH`
- Only image MIME types are supported; video items return `null`

Cache hits are served from disk (a `fs.readFile`) with no Sharp processing.

The HTTP route adds `Cache-Control: public, max-age=86400` (24 hours).

### Default supported image extensions

`jpg`, `jpeg`, `png`, `gif`, `heic`, `heif`, `tiff`, `tif`,
`webp`, `raw`, `orf`, `cr2`, `nef`, `arw`, `dng`, `bmp`

### Default supported video extensions (index only; no thumbnail)

`mp4`, `mov`, `avi`, `mkv`, `m4v`, `wmv`, `3gp`

Video files are streamed for playback via `GET /media/file/:id` (HTTP Range
support for seeking). Thumbnails are not generated for videos; a placeholder
icon is shown in grids.

## Privacy and Access Control

MediaManager mirrors the private-page access logic from `WikiRoutes.checkPrivatePageAccess()`.

```text
item.linkedPageName present?
  No  → allowed (public item)
  Yes → look up page in PageManager index
          entry.location !== 'private'?  → allowed
          user is admin?                 → allowed
          user is entry.creator?         → allowed
          otherwise                      → denied (item hidden)
```

The check is applied in:

- `getItem()` — returns `null` when denied
- `filterPrivateItems()` — called by `listByYear()`, `listByKeyword()`, `listByPage()`, and `search()`

Items with no `linkedPageName` are always visible to any user.

## MediaPlugin Integration

`MediaPlugin` (`plugins/MediaPlugin.ts`) is a wiki plugin that calls
`MediaManager` methods to embed live media data in wiki page content.

### Plugin parameter resolution

The plugin resolves parameters in this order:

1. If `keyword=` is set: call `listByKeyword(resolvedKeyword)` where
   `'current'` resolves to `context.pageName`
2. Else if `page=` is set: call `listByPage(pageName)` where `'current'`
   resolves to `context.pageName`
3. Else if `year=` is set: call `listByYear(year)`
4. Otherwise: call `getYears()` then `listByYear()` for each year and
   flatten the results

### format='count'

Returns `formatAsCount(items.length)` — an integer as a plain string.

```wiki
[{MediaPlugin}]
[{MediaPlugin format='count' keyword='current'}]
```

### format='list'

Returns an HTML unordered list. Each item is a link to `/media/item/{id}`.
The `max=` parameter limits the number of items shown.

```wiki
[{MediaPlugin format='list' keyword='Molly' max='20'}]
[{MediaPlugin format='list' year='2023'}]
[{MediaPlugin format='list' page='current'}]
```

### format='album'

Returns an inline `<div class="media-plugin-album">` containing fixed-width
(160 px) thumbnail cards. Images render a `<img>` loading from
`/media/thumb/{id}?size=300x300`. Videos and non-image files render a
placeholder icon.

When a `keyword=` filter is active, each card link appends
`?keyword={encodeURIComponent(resolvedKeyword)}` so that navigating to the
detail page keeps the album context for Prev/Next.

```wiki
[{MediaPlugin format='album' keyword='current'}]
[{MediaPlugin format='album' keyword="Molly's Cooking" max='30'}]
```

### format='album-link'

Returns a single `<a>` styled as a secondary button, linking to
`/media/keyword/{encodeURIComponent(resolvedKeyword)}`. Shows item count.
Requires `keyword=`; returns an error message otherwise.

```wiki
[{MediaPlugin format='album-link' keyword='current'}]
[{MediaPlugin format='album-link' keyword="Molly's Cooking"}]
```

### Quote syntax for keywords with apostrophes

Wiki plugin syntax uses single quotes for attribute values. When a keyword
itself contains an apostrophe, use __double quotes__ around the value:

```wiki
[{MediaPlugin format='album' keyword="Molly's Cooking"}]
[{MediaPlugin format='album-link' keyword="Jim's Road Trip"}]
```

Mixing quote styles within the same tag is valid: other attributes can still
use single quotes.

### Plugin Syntax helper in the item detail page

The __Media Information__ collapsible panel on the item detail page
auto-generates ready-to-copy `[{MediaPlugin ...}]` snippets for each keyword
associated with the item. This provides a convenient entry point for embedding
a media album on a related wiki page without writing the syntax by hand.

## HTTP Routes

### Browser UI routes

| Route | View | Variables |
|-------|------|-----------|
| `GET /media` | `media-home.ejs` | `years: number[]` |
| `GET /media/year/:year` | `media-year.ejs` | `year: number`, `items: MediaItem[]` |
| `GET /media/keyword/:keyword` | `media-keyword.ejs` | `keyword: string`, `items: MediaItem[]` |
| `GET /media/item/:id` | `media-item.ejs` | `item: MediaItem`, `prevItem`, `nextItem`, `albumKeyword`, `keywordPageExists` |
| `GET /media/search?q=` | `media-search.ejs` | `query: string`, `items: MediaItem[]` |

### File streaming

```
GET /media/file/:id
Response: streams the raw source file with HTTP Range support
Used by: <video> player on the item detail page
```

### Thumbnail

```
GET /media/thumb/:id?size=300x300
Response: image/jpeg, Cache-Control: public, max-age=86400
```

### JSON API

```
GET /media/api/item/:id
→ { ...MediaItem }

GET /media/api/year/:year
→ { year: number, items: MediaItem[] }
```

### Admin

```
GET /admin/media
→ admin-media.ejs (mediaEnabled, years)

POST /admin/media/rescan   (admin:system permission required)
→ { success: true, result: ScanResult }
```

## API Reference

### `scanFolders(force?: boolean): Promise<ScanResult>`

Delegates to `provider.scan(force)`. Logs before and after. Returns the `ScanResult`.

### `getYears(wikiContext?: WikiContext): Promise<number[]>`

Delegates to `provider.getYears()`. The `wikiContext` parameter is reserved for
future per-year ACL; currently all years are returned without filtering.

### `listByYear(year: number, wikiContext?: WikiContext): Promise<MediaItem[]>`

Calls `provider.getItemsByYear(year)` then `filterPrivateItems(items, wikiContext)`.

### `listByKeyword(keyword: string, wikiContext?: WikiContext): Promise<MediaItem[]>`

Calls `provider.getItemsByKeyword(keyword)` then `filterPrivateItems(items, wikiContext)`.
The keyword match is exact and case-sensitive.

### `listByPage(pageName: string, wikiContext?: WikiContext): Promise<MediaItem[]>`

Calls `provider.getItemsByPage(pageName)` then `filterPrivateItems(items, wikiContext)`.
Matches items by their `linkedPageName` field.

### `getItem(id: string, wikiContext?: WikiContext): Promise<MediaItem | null>`

Calls `provider.getItem(id)`. If `item.linkedPageName` is set and `wikiContext`
is provided, runs `checkPrivatePageAccess()` and returns `null` on denial.

### `search(query: string, wikiContext?: WikiContext): Promise<MediaItem[]>`

Calls `provider.search(query)` then `filterPrivateItems(items, wikiContext)`.

### `getThumbnailBuffer(id: string, size: string): Promise<Buffer | null>`

Delegates directly to `provider.getThumbnailBuffer(id, size)`. No privacy check —
only call after confirming the caller can see the item.

### `shutdown(): Promise<void>`

Clears the scan timer, calls `provider.shutdown()` (ends ExifTool worker), then
calls `super.shutdown()`.

## Provider System

### BaseMediaProvider (abstract)

```typescript
abstract class BaseMediaProvider {
  initialize(): Promise<void>;                                    // Default: no-op
  abstract scan(force?: boolean): Promise<ScanResult>;
  abstract getYears(): Promise<number[]>;
  abstract getItem(id: string): Promise<MediaItem | null>;
  abstract getItemsByYear(year: number): Promise<MediaItem[]>;
  getItemsByPage(pageName: string): Promise<MediaItem[]>;         // Default: []
  getItemsByKeyword(keyword: string): Promise<MediaItem[]>;       // Default: []
  abstract search(query: string): Promise<MediaItem[]>;
  abstract getThumbnailBuffer(id: string, size: string): Promise<Buffer | null>;
  abstract shutdown(): Promise<void>;
}
```

Note: `getItemsByPage` and `getItemsByKeyword` are non-abstract with default
implementations returning empty arrays, making them optional to implement for
providers that do not need them.

### Implementing a custom provider

1. Extend `BaseMediaProvider`
2. Implement all abstract methods
3. Override `getItemsByKeyword()` and `getItemsByPage()` if the backend supports them
4. Export as CommonJS-compatible default
5. Wire up in `MediaManager.initialize()` (replaces `new FileSystemMediaProvider(...)`)

## Background Scanning

```typescript
// In initialize():
this.scanTimer = setInterval(() => {
  void this.scanFolders();
}, scanInterval);
this.scanTimer.unref(); // Won't prevent process exit
```

The `unref()` call ensures the timer does not keep the process alive when
everything else has shut down.

Set `ngdpbase.media.scaninterval = 0` to disable background scanning entirely.

## Shutdown

`shutdown()` is called by `WikiEngine` during graceful server stop:

1. `clearInterval(this.scanTimer)`
2. `await this.provider.shutdown()` — calls `exiftoolInstance.end()` to close
   the ExifTool worker process
3. `await super.shutdown()`

## Troubleshooting

### 503 on all /media/* routes

`ngdpbase.media.enabled` is `false` (default). Set it to `true` and restart.

### Index is empty after scan

Check the server log for `[FileSystemMediaProvider]` lines. Common causes:

- Folders listed in `ngdpbase.media.folders` do not exist or are not readable
- All files in the folder are excluded by `ignoredirs` or `ignorefiles`
- File extensions are not in the indexed set — check `ngdpbase.media.extensions`
  (if set, only those extensions are indexed; if unset, `DEFAULT_MEDIA_EXTENSIONS` applies)

### File extensions not indexed

If a file type you expect to see is missing from the index, verify that its
extension is included in `ngdpbase.media.extensions`. If the config key is not
set, the built-in `DEFAULT_MEDIA_EXTENSIONS` list is used. To add `.webm`:

```json
{ "ngdpbase.media.extensions": ["jpg", "jpeg", "png", "mp4", "mov", "webm"] }
```

### Keyword album is empty

- EXIF/XMP keywords are stored exactly as ExifTool reads them — matching is
  case-sensitive and exact. Verify the keyword spelling with `exiftool {file}` on a
  representative file.
- Ensure a scan has been run after keywords were written to the files.

### Wrong year on items

ExifTool could not read `DateTimeOriginal`. The system falls back to filename
prefix (`YYYY-`), then path component (`\d{4}`), then file mtime. Check whether
the files have valid EXIF data with `exiftool {filename}`.

### Thumbnails not generating

- Verify `ngdpbase.media.thumbnail.dir` is writable
- Check Sharp is installed: `node -e "require('sharp')"` — if it errors, run
  `npm install --os=darwin --cpu=arm64 sharp` (macOS ARM)
- Video files never get thumbnails (FFmpeg not installed)

### ExifTool worker hangs

Each `exiftool.read()` call has a 15-second timeout. If files on slow NAS mounts
time out frequently, increase `taskTimeoutMillis` in the `new ExifTool({...})`
constructor inside `FileSystemMediaProvider`.

## Future Roadmap

| Feature | Notes |
|---------|-------|
| Video thumbnails | Requires `fluent-ffmpeg` + FFmpeg binary |
| Slideshow / lightbox UI | Client-side JS enhancement |
| Link items to wiki pages | Associate `linkedPageName` at scan or edit time |
| Bulk EXIF write-back | Out of scope — feature is read-only by design |
| S3 / cloud provider | New `S3MediaProvider` implementing `BaseMediaProvider` |
