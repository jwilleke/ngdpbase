# Asset Manager — Unified Digital Asset Management (DAM) Framework

Issue: #405 (CLOSED) · Spin-off: #423 (OPEN)

---

## Overview

The Asset Manager epic replaced the previous split `AttachmentManager` / `MediaManager`
architecture with a unified `AssetManager` that acts as the foundation for a full
Digital Asset Management (DAM) system. Any addon or plugin can now contribute or consume
assets through a single, extensible `AssetProvider` interface.

__Core problem solved:__ Two parallel, incompatible asset stores with different storage
mechanisms, page-linkage fields, write support, and provider patterns. The unified
framework eliminates that split without changing the on-disk storage layout or breaking
the existing HTTP API contract.

---

## Completed Work (Phases 1–6)

### Phase 1 — AssetProvider interface + unified AssetRecord type

Commit: `f25af1f2`

- Defined `AssetProvider` interface in `src/types/Asset.ts`
- Defined `AssetRecord` (schema.org-aligned, replaces `AttachmentMetadata` + `MediaItem`)
- Defined `ProviderCapability` enum: `upload | search | thumbnail | stream`
- Defined `AssetQuery`, `AssetPage`, `AssetInput` parameter types
- `BasicAttachmentProvider` and `FileSystemMediaProvider` both refactored to implement `AssetProvider`

### Phase 2 — AssetService migrated to return AssetRecord

Commit: `3e46a873`

- `AssetService.search()` now returns `AssetPage` with `AssetRecord[]`
- Deprecated field aliases kept for backward compatibility
- `AssetSearchResult` retired; callers updated

### Phase 3 — Decouple upload from page-linkage

Commit: `c90e327a`

- Upload endpoint accepts optional page context; no longer requires page assignment at upload time
- `attachToPage()` lazy-linkage path removed
- Absorbed issue #403 (Unify asset page-linkage field)

### Phase 4 — Usage index: usedOnPages[] updated on page save

Commit: `8b2328df`

- Save-time content scan replaces lazy mention tracking
- `AssetRecord.mentions` (schema.org) populated by scanning page content at save time
- All asset records carry accurate `usedOnPages[]` without manual linking step

### Phase 5 — Structured EXIF/IPTC/XMP metadata engine

Commit: `8fdb6af3`

- `AssetMetadata`, `AssetCamera`, `AssetGPS`, `AssetDimensions`, `AssetUsageRights`, `AssetUsageStats` types defined
- EXIF extracted at upload/ingest time via `sharp().metadata()`; stored in `AssetRecord.metadata`
- Both providers populate structured metadata fields (GPS, camera model, orientation, copyright)

### Phase 6 — Unified transform pipeline

Commit: `9a99b43c`

- `src/utils/imageTransform.ts` — shared utility for all providers
- `transformImage()` applies EXIF-based auto-rotation, resize, and format conversion
- `parseSize()` parses `"WxH"` size strings
- `BasicAttachmentProvider.getThumbnail()` and `FileSystemMediaProvider.getThumbnailBuffer()` both use it

### AssetManager provider registry (start of Phase 7)

Commit: `025f7fcf`

- `src/managers/AssetManager.ts` — registry class with `registerProvider()`, `getProvider()`, `getProviders()`, `search()`, `getById()`, `getThumbnail()`
- Both built-in providers (`local`, `media-library`) auto-registered at startup
- `AssetService` delegates to `AssetManager`; falls back to legacy fan-out for compatibility
- Plugin registration path: `engine.getManager('AssetManager').registerProvider(myProvider)`

---

## Operational Status

| Component | Status | Notes |
|---|---|---|
| `AssetProvider` interface | Stable | All providers implement it; schema.org-aligned |
| `AssetRecord` type | Stable | Used by all search results and upload returns |
| `BasicAttachmentProvider` | Production | `id='local'`, full capabilities: upload/search/stream/thumbnail |
| `FileSystemMediaProvider` | Production | `id='media-library'`, capabilities: search/thumbnail |
| `AssetManager` registry | Production | Auto-initialized; both providers registered |
| `AssetService` | Production | Routes through `AssetManager`; backward-compatible fallback intact |
| Metadata extraction (EXIF) | Production | GPS, camera, orientation, copyright |
| Transform pipeline | Production | Auto-rotation, resize, format conversion via `imageTransform.ts` |
| Usage index (`usedOnPages[]`) | Production | Updated on every page save via content scan |
| Browse Assets UI | Production | Unified dialog (issue #404 CLOSED) |
| `/api/assets/search` | Stable | API contract unchanged; changes were additive only |
| Unit tests | Passing | `AssetService.test.js`, `WikiRoutes.assetSearch.test.js` |

__What was not changed:__ file storage locations on disk, `/api/assets/search` API
contract, or the access control model (private-page filtering preserved).

---

## Work Defined But Not Started (Issue #423)

Phase 7 — Additional storage providers. Full details in issue #423.

### Target providers

| Provider | id | Capabilities | Notes |
|---|---|---|---|
| `S3Provider` | `s3` | upload, search, stream | AWS S3 or S3-compatible (MinIO, Backblaze B2) |
| `GoogleDriveProvider` | `google-drive` | upload, search, stream | OAuth2; read from shared drives |
| Plugin-contributed | any | declared by plugin | registered via `AssetManager.registerProvider()` |

### Design constraints defined in #423

- Credentials stored in operator config (`ngdpbase.assets.providers.<id>.*`), never in page content
- Each cloud provider is an __optional peer dependency__ — its absence must not break core startup
- Remote providers should cache presigned URLs or buffers via `CacheManager`
- Prefer `stream()` for large files; `store()` may need multipart upload for large files

### Acceptance criteria from #423

- [ ] `S3Provider` implemented and tested against MinIO
- [ ] Provider capabilities declared; missing optional methods are never called
- [ ] Credentials loaded from config, not hardcoded
- [ ] Optional peer dependency pattern — missing `@aws-sdk/client-s3` does not throw at startup
- [ ] Plugin-contributed provider registration works end-to-end from an addon `initialize()`
- [ ] `AssetService.search()` confirmed routed through `AssetManager` (no fallback needed)

---

## Key Files

| File | Purpose |
|---|---|
| `src/types/Asset.ts` | All DAM types: `AssetRecord`, `AssetProvider`, `AssetQuery`, `AssetMetadata`, etc. |
| `src/managers/AssetManager.ts` | Provider registry; fan-out search/getById/getThumbnail |
| `src/managers/AssetService.ts` | Public search API; delegates to `AssetManager` |
| `src/providers/BasicAttachmentProvider.ts` | `id='local'`; full capability local attachment backend |
| `src/providers/FileSystemMediaProvider.ts` | `id='media-library'`; read-only media library backend |
| `src/utils/imageTransform.ts` | Shared thumbnail/transform pipeline |
| `src/managers/__tests__/AssetService.test.js` | Unit tests: search, filtering, pagination |
| `src/routes/__tests__/WikiRoutes.assetSearch.test.js` | HTTP tests: `/api/assets/search` |
| `docs/managers/AssetService.md` | API reference for `AssetService` |

---

## Suggestions

### 1. Retire the legacy fallback in AssetService — #434

`AssetService` still contains a hardcoded fallback fan-out path for when `AssetManager`
is unavailable. Since `AssetManager` now auto-initializes with both providers, this path
is dead code. Removing it simplifies the control flow and reduces the risk of the two
paths diverging silently. Candidate for a small clean-up PR after #423 acceptance
criteria are met.

### 2. Add an integration test for provider registration — #435

The plugin registration path (`engine.getManager('AssetManager').registerProvider(...)`)
has no automated test. A lightweight fixture provider registered in a test addon would
close this gap and protect the contract before third-party providers are built in #423.

### 3. Document the provider writing guide — #436

`docs/managers/AssetService.md` covers the consumer API but there is no guide for
implementing a new `AssetProvider`. A short `docs/providers/AssetProvider-Guide.md`
covering the interface contract, capability flags, optional method rules, and the
`transformImage()` utility would make #423 (and future plugin authors) faster.

### 4. Consider a provider health-check method — #437

Cloud providers (S3, Google Drive) can fail at runtime due to credential expiry or
network issues. Adding an optional `healthCheck?(): Promise<boolean>` to `AssetProvider`
would allow `AssetManager` to surface degraded providers in the admin UI and skip them
during fan-out rather than surfacing errors to end users.

### 5. Extend usage-index to reverse lookup — #438

`usedOnPages[]` tracks which pages reference an asset. The inverse — "which assets does
this page use" — requires scanning all assets. A lightweight `pageAssets` index keyed
by page slug (written at save time alongside the content scan in Phase 4) would make
page-level asset auditing and cleanup significantly cheaper, especially with 14K+ pages.

---

Generated: 2026-04-02
