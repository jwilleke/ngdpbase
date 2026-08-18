---
name: AssetProvider-Guide
description: Implementation guide for plugin authors building a new AssetProvider backend
dateModified: '2026-05-14'
category: providers
code: src/managers/AssetManager.ts
---

# AssetProvider Implementation Guide

__For:__ Plugin authors and contributors building a new asset storage backend.

__Quick Reference__ | [AssetService consumer API](../managers/AssetService.md)

---

## Overview

`AssetProvider` is the single interface every asset backend must implement. Once
registered with `AssetManager`, your provider participates in all unified search,
browse, and thumbnail calls automatically.

This guide covers the interface contract, capability flags, optional method rules,
thumbnail generation, addon registration, reference implementations, and a testing
checklist.

---

## The Interface

Defined in `src/types/Asset.ts`:

```typescript
interface AssetProvider {
  // Identity (required, readonly)
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: ProviderCapability[];

  // Required methods
  search(query: AssetQuery): Promise<AssetPage>;
  getById(id: string): Promise<AssetRecord | null>;

  // Optional (capability-gated)
  store?(buffer: Buffer, info: AssetInput): Promise<AssetRecord>;
  delete?(id: string): Promise<boolean>;
  getThumbnail?(id: string, size: string): Promise<Buffer | null>;
  stream?(id: string): Promise<NodeJS.ReadableStream | null>;

  // Optional liveness check
  healthCheck?(): Promise<boolean>;
}
```

---

## Identity Fields

### `id` — stable provider identifier

A lowercase, hyphen-separated string unique across all registered providers.
Used as the `providerId` on every `AssetRecord` your provider returns, and as
the routing key in `AssetManager.getById(id, providerId)` and
`AssetManager.search({ providerId })`.

```typescript
readonly id = 's3';          // good
readonly id = 'my-plugin';   // good
readonly id = 'MyPlugin';    // avoid — case-sensitive, breaks routing
```

__Never reuse an id__ that another provider might use. Built-in ids are `'local'`
(BasicAttachmentProvider) and `'media-library'` (FileSystemMediaProvider).

### `displayName` — human-readable label

Shown in admin UI health reports and log output.

```typescript
readonly displayName = 'AWS S3 Asset Store';
```

---

## Capability Flags

```typescript
type ProviderCapability = 'upload' | 'search' | 'thumbnail' | 'stream';
```

__Rule: never declare a capability you have not implemented.__ `AssetManager`
guards optional method calls by checking capabilities first — if you declare
`'thumbnail'` but omit `getThumbnail()`, the guard passes but the call throws.

| Capability | Required method | Meaning |
|---|---|---|
| `'search'` | `search()` | Provider can list and filter assets |
| `'upload'` | `store()` | Provider can accept new file uploads |
| `'thumbnail'` | `getThumbnail()` | Provider can generate or serve thumbnails |
| `'stream'` | `stream()` | Provider can stream raw file bytes |

All providers must implement `search()` and `getById()` regardless of
capabilities — those are always required.

__Examples:__

```typescript
// Read-only media library — browse and thumbnails only
readonly capabilities: ProviderCapability[] = ['search', 'thumbnail'];

// Full read/write cloud store
readonly capabilities: ProviderCapability[] = ['upload', 'search', 'thumbnail', 'stream'];

// Index-only provider (no binary serving)
readonly capabilities: ProviderCapability[] = ['search'];
```

---

## Required Methods

### `search(query: AssetQuery): Promise<AssetPage>`

Return a page of matching assets. `AssetManager` calls this with `pageSize: 9999`
and `offset: 0` — it handles pagination across all providers itself. Return
__all__ matching items for the given query.

```typescript
interface AssetQuery {
  query?: string;           // free-text filter
  year?: number;            // filter by year (media providers)
  mimeCategory?: 'image' | 'document' | 'other';
  pageSize?: number;        // hint from AssetManager (usually 9999 for full set)
  offset?: number;          // hint from AssetManager (usually 0)
  sort?: 'date' | 'caption';
  order?: 'asc' | 'desc';
}

interface AssetPage {
  results: AssetRecord[];
  total: number;
  hasMore: boolean;
}
```

- Return an empty page `{ results: [], total: 0, hasMore: false }` when nothing
  matches — never return `null` or `undefined`.
- Do not throw for an empty result set; only throw on genuine I/O errors.
- `AssetManager` catches and logs provider errors, so a throw here will cause
  your provider's results to be silently omitted from the merged set.

### `getById(id: string): Promise<AssetRecord | null>`

Return the asset with the given provider-internal id, or `null` if not found.

- Return `null` for a missing id — do not throw `404`.
- Only throw on genuine storage errors (disk I/O, network failure).
- The id is opaque to callers; use whatever format suits your backend
  (`uuid`, `path/relative/to/root.jpg`, S3 object key, etc.).

---

## AssetRecord — the unified return type

Every method that produces an asset must return a fully-populated `AssetRecord`.
Field names follow schema.org where a direct equivalent exists.

```typescript
interface AssetRecord {
  id: string;                  // provider-internal id (stable, unique within this provider)
  providerId: string;          // MUST equal this.id
  filename: string;            // basename (e.g. "photo.jpg")
  name?: string;               // human-readable title (e.g. from EXIF Title)
  description?: string;        // caption / description
  keywords: string[];          // tags (may be empty array, never omit)
  encodingFormat: string;      // MIME type (e.g. "image/jpeg")
  contentSize?: number;        // bytes
  dimensions?: AssetDimensions;
  url: string;                 // browsable URL (e.g. "/my-plugin/file/uuid")
  thumbnailUrl?: string;       // URL to a thumbnail (if pre-generated)
  dateCreated?: string;        // ISO 8601
  author?: string;             // uploader username
  dateModified?: string;       // ISO 8601
  usageRights?: AssetUsageRights;
  usageStats?: AssetUsageStats;
  mentions: string[];          // page slugs that reference this asset (may be empty)
  isPrivate?: boolean;
  metadata: AssetMetadata;     // structured EXIF/IPTC/XMP + custom fields (may be {})
  insertSnippet: string;       // ready-to-paste wiki markup for the editor
}
```

__`insertSnippet` convention__ used by built-in providers:

```typescript
// Image MIME type
insertSnippet = `[{Image src='${filename}'}]`;
// Non-image (document, video, etc.)
insertSnippet = `[{ATTACH src='${filename}'}]`;
// Media library prefix (external/read-only stores)
insertSnippet = `[{Image src='my-plugin://${filename}'}]`;
```

Always set `providerId = this.id`. Always initialise `keywords`, `mentions`, and
`metadata` to `[]`, `[]`, and `{}` respectively even when empty — callers rely on
these being arrays/objects, not `undefined`.

---

## Optional Methods

### `store?(buffer: Buffer, info: AssetInput): Promise<AssetRecord>`

Only implement when you declare `'upload'` in capabilities.

```typescript
interface AssetInput {
  originalName: string;  // original filename from the upload form
  mimeType: string;
  size: number;          // bytes
  pageName?: string;     // wiki page to link the asset to (optional)
  description?: string;
  uploadedBy?: string;
}
```

Return the complete `AssetRecord` for the newly stored asset. Throw on storage
failure; `AssetManager` does not catch errors from `store()`.

### `delete?(id: string): Promise<boolean>`

Return `true` if the asset was deleted, `false` if not found. Throw on I/O error.

### `getThumbnail?(id: string, size: string): Promise<Buffer | null>`

Only implement when you declare `'thumbnail'` in capabilities.

- `size` is a `"WxH"` string (e.g. `"150x150"`, `"300x300"`).
- Return the thumbnail as a JPEG/WebP/PNG `Buffer`, or `null` if the asset has
  no visual representation (e.g. a PDF or audio file).
- Use the shared `transformImage()` utility (see [Thumbnail Generation](#thumbnail-generation)).
- `AssetManager` catches errors from `getThumbnail()` and returns `null`.

### `stream?(id: string): Promise<NodeJS.ReadableStream | null>`

Only implement when you declare `'stream'` in capabilities.

Return a readable stream for the raw asset bytes, or `null` if not found.
Prefer `stream()` over loading entire files into memory for large assets.

### `healthCheck?(): Promise<boolean>`

Optional liveness check. Return `true` when your backend can serve requests,
`false` (or throw) when it cannot — for example:

- A NAS or SMB volume has been unmounted
- S3 credentials have expired
- The remote service is unreachable

`AssetManager` calls `healthCheck()` at startup and marks degraded providers.
Degraded providers are __skipped in fan-out__ so their errors never reach end
users. A re-check via `AssetManager.checkProviderHealth()` can restore a
recovered provider.

```typescript
async healthCheck(): Promise<boolean> {
  try {
    await fs.access(this.storageRoot, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}
```

---

## Thumbnail Generation

Use the shared `transformImage()` utility from `src/utils/imageTransform.ts`.
It applies EXIF-based auto-rotation before resizing, so portrait photos from
mobile cameras appear upright without extra work.

```typescript
import { transformImage, parseSize } from '../utils/imageTransform';

async getThumbnail(id: string, size: string): Promise<Buffer | null> {
  const parsed = parseSize(size); // "300x300" → { width: 300, height: 300 }
  if (!parsed) return null;

  const filePath = this.resolveFilePath(id);
  if (!filePath) return null;

  try {
    return await transformImage(filePath, {  // accepts Buffer or file path
      width: parsed.width,
      height: parsed.height,
      fit: 'inside',   // preserve aspect ratio (default)
      format: 'jpeg',  // output format (default)
      quality: 85,     // compression quality (default)
    });
  } catch {
    return null;
  }
}
```

`transformImage` accepts either a `Buffer` (e.g. freshly downloaded from S3) or
an absolute file path string (e.g. a local NAS path). Both paths apply the same
`sharp().rotate()` EXIF auto-rotation step.

---

## Addon Registration

Register your provider from your addon's `initialize()` hook so it is available
as soon as the engine is ready:

```typescript
// my-addon/index.ts
export default class MyStorageAddon {
  readonly id = 'my-storage-addon';

  async initialize(engine: WikiEngine): Promise<void> {
    const assetManager = engine.getManager('AssetManager');
    if (!assetManager) {
      logger.warn('[MyStorageAddon] AssetManager not found — provider not registered');
      return;
    }

    const provider = new MyStorageProvider(this.config);
    await provider.initialize();                    // set up credentials, connections
    assetManager.registerProvider(provider);        // join the registry
  }
}
```

After registration your provider is included in every `AssetManager.search()` and
`AssetManager.getById()` fan-out call, and appears in `getProviderHealth()` reports.

__Replacing an existing provider:__ `registerProvider()` replaces any provider
already registered under the same id and logs a warning. Use this deliberately
to swap a built-in provider for a custom one (e.g. replacing `'local'` with an
S3-backed attachment store).

---

## Reference Implementations

Study these before writing your own:

| Provider | Module | Capabilities | Notes |
|---|---|---|---|
| `BasicAttachmentProvider` | `src/providers/BasicAttachmentProvider.ts` | upload, search, stream, thumbnail | Full read/write local filesystem. Reference for `store()`, `delete()`, `stream()`, metadata persistence. |
| `FileSystemMediaProvider` | `src/providers/FileSystemMediaProvider.ts` | search, thumbnail | Read-only directory scan. Reference for `healthCheck()` on NAS/SMB folders, EXIF extraction via ExifTool, incremental index. |

Both providers implement `healthCheck()` and can be used as templates for detecting
offline storage volumes.

---

## Testing Checklist

Minimum assertions for a compliant provider. Run these against your implementation
before opening a PR.

### Identity and capabilities

```javascript
it('has a non-empty stable id', () => {
  expect(provider.id).toBeTruthy();
});

it('has a non-empty displayName', () => {
  expect(provider.displayName).toBeTruthy();
});

it('does not declare capabilities it has not implemented', () => {
  if (provider.capabilities.includes('upload'))     expect(provider.store).toBeDefined();
  if (provider.capabilities.includes('thumbnail'))  expect(provider.getThumbnail).toBeDefined();
  if (provider.capabilities.includes('stream'))     expect(provider.stream).toBeDefined();
});
```

### `search()`

```javascript
it('returns { results, total, hasMore } shape', async () => {
  const page = await provider.search({});
  expect(page).toHaveProperty('results');
  expect(page).toHaveProperty('total');
  expect(page).toHaveProperty('hasMore');
  expect(Array.isArray(page.results)).toBe(true);
});

it('returns empty page when nothing matches', async () => {
  const page = await provider.search({ query: '__no_match_xyz__' });
  expect(page.results).toEqual([]);
  expect(page.total).toBe(0);
  expect(page.hasMore).toBe(false);
});
```

### `getById()`

```javascript
it('returns null for a non-existent id', async () => {
  expect(await provider.getById('__nonexistent__')).toBeNull();
});
```

### `AssetRecord` shape

```javascript
it('every search result has required AssetRecord fields', async () => {
  const { results } = await provider.search({});
  for (const r of results) {
    expect(r.id).toBeTruthy();
    expect(r.providerId).toBe(provider.id);   // must equal this.id
    expect(r.filename).toBeTruthy();
    expect(r.encodingFormat).toBeTruthy();
    expect(r.url).toBeTruthy();
    expect(Array.isArray(r.keywords)).toBe(true);
    expect(Array.isArray(r.mentions)).toBe(true);
    expect(typeof r.metadata).toBe('object');
    expect(r.insertSnippet).toBeTruthy();
  }
});
```

### `healthCheck()` (if implemented)

```javascript
it('returns true when storage is reachable', async () => {
  expect(await provider.healthCheck()).toBe(true);
});

it('returns false (or throws) when storage is unreachable', async () => {
  // simulate unmounted volume / expired credentials
  jest.spyOn(fs, 'access').mockRejectedValue(new Error('ENOENT'));
  const result = await provider.healthCheck().catch(() => false);
  expect(result).toBe(false);
});
```

---

## Related

- `src/types/Asset.ts` — full type definitions for `AssetProvider`, `AssetRecord`, `AssetQuery`, `AssetPage`, `ProviderHealthReport`
- `src/managers/AssetManager.ts` — provider registry, fan-out, health checking
- `src/utils/imageTransform.ts` — shared thumbnail pipeline
- [AssetService consumer API](../managers/AssetService.md) — how callers use the registry
- [BasicAttachmentProvider](BasicAttachmentProvider.md) — full read/write reference implementation
- [FileSystemMediaProvider](FileSystemMediaProvider.md) — read-only reference implementation
- Issue [#423](https://github.com/jwilleke/ngdpbase/issues/423) — S3 / Google Drive provider work (Phase 7)
