---
name: AssetService
description: Unified DAM search facade over the AssetProvider registry; called by SearchManager and the asset-picker
dateModified: '2026-05-14'
category: managers
code: src/managers/AssetService.ts
---

# AssetService

__Module:__ `src/managers/AssetService.ts`
__Extends:__ [BaseManager](BaseManager.md)

---

## Overview

AssetService is a thin fan-out manager that provides unified search across the two
asset stores — [AttachmentManager](AttachmentManager.md) (user-uploaded files) and
[MediaManager](MediaManager.md) (read-only external photo/video library). It does
not manage its own persistent data.

The primary consumer is the editor asset picker (the __Media Library__ button in the
page editor). It is also available to plugins and add-ons via the standard
`engine.getManager('AssetService')` pattern.

## Key Features

- __Unified search__ — single call returns results from both stores, normalised to a common type
- __Type filter__ — restrict results to `attachment`, `media`, or both
- __Year filter__ — narrow media results to a specific year
- __Normalised result shape__ — every result includes a ready-to-paste `insertSnippet` for the editor
- __Graceful degradation__ — if either store is unavailable or throws, the other store's results are still returned
- __No persistent state__ — initialises instantly; all data lives in AttachmentManager and MediaManager

## Quick Example

```typescript
const assetService = engine.getManager('AssetService');

// Search both stores
const results = await assetService.search({ query: 'beach' });

// Attachments only
const attachments = await assetService.search({ types: ['attachment'], query: 'map' });

// Media only, filtered to a year
const photos = await assetService.search({ types: ['media'], year: 2023 });

// Insert the first result's snippet into a wiki page
console.log(results[0].insertSnippet);
// [{Image src='media://IMG_1234.jpg'}]
```

## Core Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `search(options?)` | `Promise<AssetSearchResult[]>` | Fan-out search across attachment and media stores |

## `AssetSearchResult` Type

Each item in the result array conforms to:

| Field | Type | Description |
|-------|------|-------------|
| `assetType` | `'attachment' \| 'media'` | Which store the item came from |
| `id` | `string` | Store-internal identifier |
| `filename` | `string` | Original filename |
| `mimeType` | `string` | MIME type (e.g. `image/jpeg`) |
| `url` | `string` | Browsable / embeddable URL |
| `thumbUrl` | `string?` | Thumbnail URL — media items only (`/media/thumb/:id?size=150x150`) |
| `year` | `number?` | Year — media items only |
| `linkedPageName` | `string?` | Wiki page the item is associated with |
| `isPrivate` | `boolean?` | `true` when gated by a private wiki page — media items only |
| `insertSnippet` | `string` | Ready-to-paste wiki markup for the editor (see below) |

### `insertSnippet` values

| Condition | Snippet |
|-----------|---------|
| Attachment, image MIME | `[{Image src='filename.jpg'}]` |
| Attachment, non-image | `[{ATTACH src='filename.pdf'}]` |
| Media, image MIME | `[{Image src='media://filename.jpg'}]` |
| Media, non-image (e.g. video) | `[{ATTACH src='media://clip.mp4'}]` |

## `AssetSearchOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `query` | `string` | `''` | Free-text query — case-insensitive substring match on filename (attachments); full-text search across all metadata (media) |
| `types` | `('attachment' \| 'media')[]` | both | Restrict results to one or both stores |
| `year` | `number` | — | Filter media results to a specific year. When combined with `query`, uses `search()` then filters; when used alone, uses the faster `listByYear()` |
| `max` | `number` | `50` | Maximum total results (split roughly equally between stores when both are requested) |
| `wikiContext` | `WikiContext` | — | Passed to MediaManager for private-page access control |

## HTTP API

### `GET /api/assets/search`

Requires: `editor`, `contributor`, or `admin` role.

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Free-text query |
| `types` | string | Comma-separated: `attachment`, `media`, or both |
| `year` | number | Four-digit year filter (media only) |
| `max` | number | Result cap (default 50, maximum 200) |

__Response:__

```json
{
  "success": true,
  "results": [ { "assetType": "media", "id": "...", "filename": "...", "insertSnippet": "..." } ],
  "total": 1
}
```

## Editor Integration

The __Media Library__ button in the page editor calls this endpoint and renders results
as a thumbnail grid inside a Bootstrap modal. Clicking __Insert__ on any result pastes
the item's `insertSnippet` at the cursor position in the editor textarea and closes
the modal.

Attachment thumbnails are loaded from the attachment URL directly; media thumbnails use
`/media/thumb/:id?size=150x150`.

## Implementation Notes

- __Result ordering__ — attachments first, then media, within each group ordered by the
  underlying store's natural sort
- __Per-type cap__ — when both types are requested, each gets `ceil(max / 2)` results
  before the final `slice(0, max)` is applied
- __Attachment query__ — simple `toLowerCase().includes()` on the filename; the
  attachment store has no full-text search index
- __Media query__ — delegated to `MediaManager.search()` which uses AND-semantics
  multi-token search across filename, title, description, keywords, and year

## Related

- [AttachmentManager](AttachmentManager.md) — attachment store
- [MediaManager](MediaManager.md) — media library, `findByFilename()`, `media://` URI
- [AttachmentManager.md — Attachment Resolution Order](AttachmentManager.md#attachment-resolution-order) — step 0 (`media://`)
- [AssetProvider Implementation Guide](../providers/AssetProvider-Guide.md) — build a custom asset backend or plugin-contributed provider
