---
name: FileSystemMediaProvider
description: Read-only filesystem media library with EXIF parsing and keyword facets; the default MediaManager backend
dateModified: '2026-05-14'
category: providers
code: src/providers/FileSystemMediaProvider.ts
---

# FileSystemMediaProvider

__Quick Reference__ | [MediaManager-Complete-Guide](../managers/MediaManager-Complete-Guide.md)

__Module:__ `src/providers/FileSystemMediaProvider.ts`
__Type:__ Media Storage Provider
__Extends:__ [BaseMediaProvider](BaseMediaProvider.md)
__Status:__ Production
__Dependencies:__ `exiftool-vendored`, `sharp`, `fs-extra`

---

## Overview

`FileSystemMediaProvider` scans configured local directories for media files,
extracts EXIF/IPTC/XMP metadata via a persistent ExifTool worker process,
maintains an in-memory + on-disk JSON index, and generates JPEG thumbnails
on demand via Sharp.

Source files are __never modified__ — the provider is strictly read-only.

---

## Key Features

- __Incremental scan__ — `stat.mtimeMs` change detection; unchanged files skipped
- __ExifTool worker__ — single `ExifTool` instance reused across all reads (15 s timeout)
- __Year extraction__ — EXIF DateTimeOriginal → filename `YYYY-` → path `\d{4}` → mtime
- __Event names__ — parsed from `YYYY-MM-DD-EventName-NNN.ext` filename pattern
- __Persistent index__ — `media-index.json` loaded at `initialize()`, saved after scan
- __Thumbnail cache__ — `{thumbnailDir}/{id}-{size}.jpg`; cover-crop, 85% JPEG quality
- __ignoreDirs__ — skip directories by name (config list)
- __`.ngdpbaseignore`__ — gitignore-style pattern file; place in any directory to exclude matching entries before ExifTool runs
- __`ngdpbaseignore` EXIF keyword__ — tag a file in any photo manager; provider evicts and excludes it at scan time

---

## Configuration (via FileSystemMediaProviderConfig)

| Field | Type | Description |
|-------|------|-------------|
| `folders` | `string[]` | Absolute paths to scan |
| `ignoreDirs` | `string[]` | Directory names to skip unconditionally |
| `extensions` | `Set<string>` | Lowercase extensions (no dot) to index — built from `ngdpbase.media.extensions` config, falling back to `DEFAULT_MEDIA_EXTENSIONS` |
| `maxDepth` | `number` | Recursion depth (0 = unlimited) |
| `indexFile` | `string` | Path to `media-index.json` |
| `thumbnailDir` | `string` | Path to thumbnail cache |
| `thumbnailSizes` | `string` | Comma-separated WxH specs |
| `metadataPriority` | `string[]` | Reserved |
| `readonly` | `boolean` | Always `true` |

---

## Scan Algorithm

```text
for each folder in config.folders:
  walkDir(folder, depth=0)
    ├─ read directory entries
    ├─ load .ngdpbaseignore patterns from this directory (if file present)
    ├─ for each subdirectory:
    │    skip if name in ignoreDirs → excluded++
    │    skip if matches .ngdpbaseignore pattern → excluded++
    │    if depth < maxDepth (or maxDepth === 0): recurse
    └─ for each file:
         skip if extension not in MEDIA_EXTENSIONS
         skip if matches .ngdpbaseignore pattern → excluded++
         scanned++
         id = sha256(filePath)[0:32]
         if !force && index[id] && index[id].mtime === stat.mtimeMs: skip
         tags = exiftool.read(filePath)
         if "ngdpbaseignore" in tags.Keywords → evict + excluded++
         year, eventName = extract(tags, filePath, stat.mtime)
         update index[id] → added++ or updated++

saveIndex()
```

---

## ID Generation

```typescript
crypto.createHash('sha256').update(absoluteFilePath).digest('hex').slice(0, 32)
```

Stable as long as the file path does not change. Changing a filename or moving
the file creates a new ID (old entry remains in index until the next forced rescan).

---

## Supported Extensions

### Images (thumbnails generated)

`jpg` `jpeg` `png` `gif` `heic` `heif` `tiff` `tif` `webp`
`raw` `orf` `cr2` `nef` `arw` `dng` `bmp`

### Videos (indexed; thumbnails return null)

`mp4` `mov` `avi` `mkv` `m4v` `wmv` `3gp`

---

## Year Extraction

Priority order:

1. EXIF `DateTimeOriginal`, `CreateDate`, or `MediaCreateDate` (ExifDateTime.year)
2. Filename prefix matching `/^(\d{4})[-_]/`
3. Path component matching `/^(\d{4})$/` (searched from deepest to shallowest)
4. `stat.mtime.getFullYear()`

---

## Event Name Parsing

Filename convention: `YYYY-MM-DD-EventName-NNN.ext`

```
2023-06-15-BirthdayParty-001.jpg  →  eventName = "BirthdayParty"
2024-12-25-Christmas-042.heic     →  eventName = "Christmas"
IMG_1234.jpg                       →  eventName = null
```

Regex: `/^\d{4}-\d{2}-\d{2}-(.+?)(?:-\d+)?$/` applied to the filename without extension.

---

## Thumbnail Generation

```typescript
// Path
const thumbPath = `${config.thumbnailDir}/${id}-${size}.jpg`;

// Cache hit
if (await fs.pathExists(thumbPath)) return fs.readFile(thumbPath);

// Generate
const buffer = await sharp(item.filePath)
  .resize(w, h, { fit: 'cover' })
  .jpeg({ quality: 85 })
  .toBuffer();
await fs.writeFile(thumbPath, buffer);
return buffer;
```

Returns `null` for video MIME types or if Sharp throws (logged as warning).

---

## Index Persistence

- __Load:__ `initialize()` reads `config.indexFile` if it exists; populates `this.index`
- __Save:__ called after each `scan()` completes; writes `{ version: 1, updatedAt, items }` as pretty-printed JSON

---

## Shutdown

```typescript
await this.exiftoolInstance.end();
```

Closes the ExifTool worker process. Must be called to avoid orphan processes.

---

## Common Issues

### Files not appearing after scan

- Confirm folder paths in config are absolute and accessible
- Check extension is in the supported set
- Check for a `.ngdpbaseignore` file in the directory or a parent directory — a matching pattern silently excludes the file
- Check the file's EXIF/XMP keywords — the `ngdpbaseignore` keyword causes immediate exclusion

### EXIF year is wrong

Run `exiftool {filename}` on the file. If `DateTimeOriginal` is absent or corrupt,
the fallback chain (filename → path → mtime) is used.

### Thumbnails fail for HEIC / RAW files

Sharp may not support all camera RAW formats. Install the `sharp` build with
`vips` compiled with HEIF support. On macOS ARM: `npm install --os=darwin --cpu=arm64 sharp`.

---

## Related

- [BaseMediaProvider](BaseMediaProvider.md)
- [MediaManager](../managers/MediaManager.md)
- [MediaManager-Complete-Guide](../managers/MediaManager-Complete-Guide.md)
