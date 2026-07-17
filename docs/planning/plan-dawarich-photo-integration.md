# Plan: Dawarich Photo Integration (Immich-Compatible Adapter)

Issue: #864

## Background

`maps.nerdsbythehour.com` (Dawarich, self-hosted location-history/Google-Timeline replacement) supports plotting geotagged photos on the map and inside trips, but only by talking to a real Immich or PhotoPrism instance over their native APIs — it has no "point at a folder" mode of its own.

We evaluated deploying Immich for this and rejected it: Immich's "external library" feature (index an existing folder without importing/duplicating it) is read-only by default, and removing the `:ro` mount to allow metadata edits gives Immich direct write/delete access to the originals — an unacceptable risk across 50k+ photos. There's also a confirmed upstream bug where metadata edits on a read-only external library silently report success while doing nothing ([immich-app/immich#10538](https://github.com/immich-app/immich/issues/10538)).

`ngdpbase` already has almost everything needed to be the photo backend instead: `MediaManager` / `FileSystemMediaProvider` indexes existing folders in place (no duplication), reads GPS + `DateTimeOriginal` + camera metadata via `exiftool-vendored`, and generates cached thumbnails via Sharp. This plan adds a thin Immich-shaped compatibility layer on top so Dawarich can talk to `ngdpbase` exactly as it would talk to Immich, pointed at `/Volumes/shared/media/photos/`.

## Goals

- Dawarich's existing Immich client works against `ngdpbase` **unmodified** — no fork, no patch to Dawarich.
- No new indexing engine — reuse `MediaManager` / `FileSystemMediaProvider` / `media-index.json` as-is.
- No photo duplication, no write access to source files (read-only, matching the existing `MediaManager` design principle).
- New surface area is additive: existing `/media/*` UI routes, `MediaPlugin`, and `/share/*` are untouched.

## Non-goals

- **EXIF write-back ("Enrich Photos" in Dawarich)** — writing GPS into photos that lack it. Out of scope; `ngdpbase`'s media feature is read-only by design (see `MediaManager-Complete-Guide.md` roadmap). If wanted later, it's a separate proposal — this plan only covers Dawarich *reading* photo locations, not writing them.
- PhotoPrism-shaped adapter — Immich's contract is smaller and covers our case; no need to also implement PhotoPrism's.

## Decided: strict per-type date policy, error (exclude) on missing date

Dawarich's own `time_framed_data` re-filter aside, the adapter itself must not guess: a photo shown at the wrong point in someone's timeline because we silently fell back to file mtime is worse than not showing it at all. Decision:

- **Photos** (`type: "image"`): require `DateTimeOriginal` specifically. `extractCaptureDate()`'s existing fallback chain (`DateTimeOriginal` → `CreateDate` → `MediaCreateDate` → `CreationDate`) is too lenient for this purpose — those later fields are the video/container-creation-time fields, not "the photographer took this here," and using them for a photo would misplace it in time.
- **Movies** (`type: "video"`): require one of `CreateDate` / `MediaCreateDate` / `CreationDate` — the same fields the existing chain already documents as "the file/container creation timestamps that video formats use" (`FileSystemMediaProvider`'s comment on `CAPTURE_DATE_FIELDS`, added for #750). `DateTimeOriginal` is not expected on videos and isn't required for them.
- **Missing required field → error, not silent inclusion.** Since Dawarich's contract has no per-item error slot (it just expects a flat item list), "error" resolves to: the item is excluded from the `/api/search/metadata` response entirely, and the exclusion is counted/logged server-side (mirroring the existing `counters.noCaptureDate` / `#807` admin-visibility pattern already in `FileSystemMediaProvider`, rather than inventing a new mechanism). A hard-failing the whole paginated request over one bad file isn't viable — it would block every other photo in that date window too.

This means `metadata.dateTimeOriginal` (a merged, type-blind value with only `'exif' | 'filename'` provenance) is **not** sufficient on its own for this feature — see Gap 1 below.

## What Dawarich actually needs

Confirmed by reading Dawarich's own source (`app/services/immich/request_photos.rb`, `app/services/immich/connection_tester.rb`, `app/services/photos/thumbnail.rb`, `app/serializers/api/photo_serializer.rb` in [Freika/dawarich](https://github.com/Freika/dawarich)) — the entire Immich contract Dawarich exercises is two endpoints:

### 1. `POST /api/search/metadata`

Request body Dawarich sends:

```json
{
  "takenAfter": "2024-01-01T00:00:00Z",
  "takenBefore": "2024-12-31T23:59:59Z",
  "size": 1000,
  "page": 1,
  "order": "asc",
  "withExif": true
}
```

`takenBefore` is omitted when Dawarich has no end date. Dawarich paginates by incrementing `page` until it receives an empty `assets.items` array (up to 10,000 pages as a safety cap).

Required response shape:

```json
{
  "assets": {
    "items": [
      {
        "id": "a3f7c2d1e8b4690f2a1c3d5e7f9b0c12",
        "type": "IMAGE",
        "fileCreatedAt": "2024-06-01T14:32:00.000Z",
        "localDateTime": "2024-06-01T10:32:00.000Z",
        "originalFileName": "birthday-001.jpg",
        "exifInfo": {
          "latitude": 37.7749,
          "longitude": -122.4194,
          "city": null,
          "state": null,
          "country": null,
          "orientation": "1"
        }
      }
    ]
  }
}
```

Fields actually read by Dawarich's serializer (`Api::PhotoSerializer`): `id`, `exifInfo.latitude`/`longitude`, `localDateTime`, `fileCreatedAt`, `originalFileName`, `type` (lower-cased, `"video"` items are dropped), `exifInfo.orientation` (`"6"` → portrait, else landscape). `exifInfo.city`/`state`/`country` are read but not required — Dawarich has its own reverse geocoding for map points, so we can omit or leave these `null`.

### 2. `GET /api/assets/:id/thumbnail?size=preview`

Returns the raw image bytes (`Content-Type` some image type, not JSON). Dawarich's `Photos::Thumbnail` sends `x-api-key` and `accept: application/octet-stream`; it doesn't care what size we actually return as long as it's a reasonable preview-sized JPEG.

### Connection test

Dawarich's Settings-page "Test connection" button (`Immich::ConnectionTester`) does: `POST /api/search/metadata` with `{takenAfter: <today>, size: 1, page: 1, order: 'asc', withExif: true}`, then if an asset came back, `GET /api/assets/:id/thumbnail?size=preview` on it. A `403` with a body containing `"asset.view"` is specifically detected and surfaced as a permissions error — we don't need to replicate that failure mode, just make sure a normal `200` response is returned when photos exist.

## What `ngdpbase` already has (verified against current `master`)

`FileSystemMediaProvider.processFile()` already extracts everything the contract needs, per item, into `MediaIndexEntry.metadata`:

- `metadata.dateTimeOriginal` — a full `"YYYY-MM-DD HH:MM:SS"` capture timestamp, built by `extractCaptureDate()` from `DateTimeOriginal` → `CreateDate` → `MediaCreateDate` → `CreationDate`, with a `metadata.captureDateSource` provenance flag (`'exif' | 'filename'`). **This already exists — it is not gated behind the stale `year`-only facet described in `MediaManager-Complete-Guide.md`.** That doc is out of date; the code has since grown a full timestamp (Phase 5 / #807-#809).
- `metadata.gps` — structured `{ latitude, longitude, altitude }` (plus legacy flat `gpsLatitude`/`gpsLongitude` kept for back-compat).
- `metadata.orientation` — numeric EXIF orientation tag.
- `filename`, `mimeType`, `id` (stable `SHA-256(filePath)[0:32]`).
- `getThumbnailBuffer(id, size)` — cached JPEG generation via Sharp.

So the only genuinely missing piece is a **query method**: nothing today filters the index by a date *range* — `getItemsByYear()` is the closest existing method, and it's year-granularity only. Everything else (the raw data fields) is already there.

## Gap 1: date-range query + per-type strict date field

Two changes to `FileSystemMediaProvider`, since the strict per-type policy above needs to know which literal tag supplied the date, not just `'exif' | 'filename'`:

1. **Track the source tag.** Extend `extractCaptureDate()`'s return value (or add a sibling field) to record which of `CAPTURE_DATE_FIELDS` actually matched — e.g. `metadata.captureDateField: 'DateTimeOriginal' | 'CreateDate' | 'MediaCreateDate' | 'CreationDate' | null`. This is a small addition to an already-computed loop (`extractCaptureDate()` already iterates `CAPTURE_DATE_FIELDS` and returns on the first match — just also return which field matched). Existing behavior (`metadata.dateTimeOriginal`, `captureDateSource`, the year facet) is unchanged; this is additive.

2. **Date-range query.** Add to `BaseMediaProvider`:

   ```typescript
   abstract getItemsByDateRange(after?: string, before?: string): Promise<MediaItem[]>;
   ```

   Implement in `FileSystemMediaProvider` as a linear scan of the in-memory index comparing `metadata.dateTimeOriginal` (parsed as UTC) against `after`/`before`. Mirrors the existing `getItemsByYear()` pattern (in-memory filter over `Object.values(this.index)`) — no re-scan required, since the underlying data is already persisted per item (once change 1 above lands).

   Sort ascending by `dateTimeOriginal` to match Dawarich's requested `order: 'asc'` and make pagination stable.

The strict per-type accept/reject check (`captureDateField === 'DateTimeOriginal'` for images, `captureDateField in {CreateDate, MediaCreateDate, CreationDate}` for videos) lives in the Gap 2 handler, not the provider — the provider's job stays "return everything in range with full metadata," and the Dawarich-specific strictness is applied where the Dawarich-specific contract is built.

Add a thin `MediaManager.listByDateRange(after, before, wikiContext?)` wrapper following the existing `listByYear` pattern (delegates to the provider, then `filterPrivateItems()`).

## Gap 2: Dawarich-compatible route

New route file, e.g. `src/routes/DawarichCompatRoutes.ts`, registered alongside the existing `/media/*` routes in `WikiRoutes.ts`'s route-mounting section (near line ~10855). Two routes:

```
POST /api/search/metadata
GET  /api/assets/:id/thumbnail
```

These paths are dictated by the Immich contract, not chosen by us — they don't collide with anything `ngdpbase` currently serves (no existing `/api/search/*` or `/api/assets/*` routes).

### Handler: `POST /api/search/metadata`

1. Authenticate (see Gap 3).
2. Parse `takenAfter` / `takenBefore` / `page` / `size` from the body.
3. Call `mediaManager.listByDateRange(takenAfter, takenBefore, undefined)` (bypass privacy filtering — see Open Questions) once, cache the full sorted result for the request's `(takenAfter, takenBefore)` key for the duration of pagination (in-memory `Map`, short TTL — Dawarich re-requests the same window per page).
4. Apply the strict per-type date check: keep an item only if (`type === 'image'` and `captureDateField === 'DateTimeOriginal'`) or (`type === 'video'` and `captureDateField` is one of `CreateDate`/`MediaCreateDate`/`CreationDate`). Drop and count everything else (missing field, or only a filename/mtime-derived date) — log via the same admin-visible counter convention as `#807`'s `noCaptureDate`.
5. Slice `[(page-1)*size, page*size)` of the surviving items.
6. Map each `MediaItem` → the Immich-shaped item (id, type, fileCreatedAt ← `metadata.dateTimeOriginal`, localDateTime ← same value treated as local, originalFileName ← `filename`, exifInfo.latitude/longitude ← `metadata.gps`, exifInfo.orientation ← `metadata.orientation`).
7. Return `{ assets: { items: [...] } }`; empty array once `page` exceeds the result set, so Dawarich's pagination loop terminates.

### Handler: `GET /api/assets/:id/thumbnail`

1. Authenticate (see Gap 3).
2. `mediaManager.getThumbnailBuffer(id, '500x500')` (or a size configured for this compat layer — Dawarich doesn't care about exact dimensions).
3. Stream the JPEG buffer back with `Content-Type: image/jpeg`.
4. `404` if the item doesn't exist or isn't an image (mirrors `getThumbnailBuffer`'s existing `null`-for-video behavior).

Thumbnail generation itself is already confirmed working operationally (verified on the `jimstest` `ngdpbase` instance) — this handler is just a thin wrapper around the existing, already-proven `getThumbnailBuffer()`.

## Gap 3: authentication — DECIDED: static key + network restriction

Every existing `ngdpbase` API route either relies on an authenticated wiki session (cookie) or Authentik forward-auth at the ingress (`/api/page/ingest`, see `#819`). Neither works for Dawarich: its Immich client is a bare server-to-server HTTP call sending only an `x-api-key` header (the same convention Immich itself uses) — no session, no OAuth bearer flow, no interactive login. Routing these two routes through Authentik was considered and rejected: Authentik forward-auth needs a browser session or an OIDC bearer-token exchange, and Dawarich's HTTParty client can only ever send the three hardcoded headers (`x-api-key`, `accept`, `Content-Type`) — fronting these routes with Authentik would just mean bypassing Authentik for exactly these paths, gaining nothing.

Decision: two layers, not one.

1. **App-level shared-secret API key.** `ngdpbase.dawarichCompat.apiKey`, config-driven (analogous to how the existing `ngdpbase-ingest-creds` SOPS secret feeds credentials into `geohazardwatch`/`jimsmcp` today), checked via `req.headers['x-api-key']` with a constant-time comparison. Mirrors Immich's own convention, which is also what Dawarich's client already sends unprompted — nothing to explain in Dawarich's Settings UI, it's just "the Immich API key" field. There's no existing API-key-checking middleware in `ngdpbase` to reuse as-is, but the *shape* of `ShareManager`'s `shareGate()` — one function, checked first thing in every handler — is worth mirroring for the new `dawarichCompatGate()`.
2. **Network-level restriction.** The two routes must not be reachable over the public Cloudflare Tunnel hostname — only over Tailscale/LAN, so a leaked API key alone isn't sufficient for access. Dawarich already supports pointing its Immich URL field at a private/internal address (it has an explicit `skip_ssl_verification` option in `Immich::ConnectionTester`, intended for exactly this kind of self-hosted/internal setup) — this is a config choice on the Dawarich side (which URL you put in Settings), not a code change to Dawarich itself. Concretely: whatever ingress/tunnel config exposes `ngdpbase` publicly today must exclude `/api/search/metadata` and `/api/assets/*` from the public hostname, or those two routes must live on a separate internal-only listener/hostname entirely. Exact mechanism (Cloudflare Tunnel path exclusion vs. Tailscale-only hostname vs. separate port) is an implementation detail to work out against however `ngdpbase` is actually deployed — not re-litigated here.

## Config additions

```json
{
  "ngdpbase.dawarichCompat.enabled": false,
  "ngdpbase.dawarichCompat.apiKey": "",
  "ngdpbase.dawarichCompat.thumbnailSize": "500x500"
}
```

Mirrors the existing `ngdpbase.media.enabled` opt-in pattern — routes 503 when disabled, same as `/media/*` does when `MediaManager` is absent.

## Deployment note

`ngdpbase.media.folders` must point at `/Volumes/shared/media/photos/` (or wherever that share is mounted from the host actually running `ngdpbase`). Dawarich runs in the `maps` namespace in k3s on `deby`; wherever `ngdpbase` runs needs to be network-reachable from there (same requirement as pointing Dawarich at a real Immich instance) — this plan doesn't change where `ngdpbase` itself is deployed, only exposes two new routes on it.

## Open questions

- **Privacy filtering**: should Dawarich-visible photos skip `filterPrivateItems()` entirely (treat all indexed photos as visible to the map), or should photos linked to private wiki pages (`linkedPageName` → a `private`-location page) stay hidden from Dawarich too? Leaning toward: skip filtering — Dawarich's photo layer is a personal map only you and Molly see, and "private" in `ngdpbase` means "hidden from other wiki users," a different axis. Worth confirming before implementing rather than guessing.
- **Rate limiting**: `ShareManager`'s anonymous routes have a module-scope rate limiter (`shareRateLimiter`, #853). Dawarich's own Redis-backed 1-minute cache (`Photos::Search.cached`) already bounds request frequency from the Dawarich side, so a limiter here is probably unnecessary — flag if that assumption is wrong.
- **`localDateTime` vs `fileCreatedAt` timezone handling**: Dawarich reads both but only actually *uses* `fileCreatedAt` for its own `time_framed_data` re-filter and `localDateTime` for display. `ngdpbase`'s `dateTimeOriginal` has no explicit timezone (EXIF rarely does) — plan is to emit the same string for both fields and let Dawarich's display-only use of `localDateTime` absorb the ambiguity. Should double check this doesn't produce visibly wrong times in trip views before considering it done.

## Testing plan

- Unit test `getItemsByDateRange()` against a fixture index (before/after/both bounds, unbounded, empty range).
- Unit test the strict per-type date filter: image with `DateTimeOriginal` (kept), image with only `CreateDate` (dropped), video with `MediaCreateDate` (kept), video with only a filename-derived date (dropped), item with no capture date at all (dropped, counted).
- Unit test whatever auth check Gap 3 lands on (missing key, wrong key, correct key).
- Integration test: seed a handful of real-shaped `MediaIndexEntry` fixtures with GPS + `dateTimeOriginal`/`captureDateField`, hit `POST /api/search/metadata` with a `takenAfter`/`takenBefore` window, assert the Immich-shaped response and the drop-count for date-less fixtures.
- Manual end-to-end: point a real Dawarich Settings → Immich integration at this instance, confirm "Test connection" succeeds, confirm photos render on the map for a known date range.
