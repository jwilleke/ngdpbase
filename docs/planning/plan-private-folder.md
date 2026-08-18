# Plan: Private Folders + Attachment Privacy + MediaManager Stub

## Issues: #122, #232 (attachment privacy cross-ref), #273 (MediaManager)

---

## Context

Issue #122 requests per-user private folders where pages tagged with the `private` userKeyword are physically isolated from public pages and access-controlled. Issue comments also require attachments to respect the same privacy rules (#232), and the MediaManager (#273) must understand the private folder concept from the start so it doesn't need to be retrofitted later.

### Key config distinction

| Config key | Purpose | Who sets it |
|---|---|---|
| `ngdpbase.system-category` | Admin-defined page categories that drive storage location (`regular`, `required`, `github`). VersioningFileProvider already reads `storageLocation` from these entries. | Admins/config |
| `ngdpbase.user-keywords` | User-applied content tags (`private`, `draft`, `review`, etc.). Currently metadata-only with no storage enforcement. | Users |
| `ngdpbase.system-keywords` | System-level controlled vocabulary (`general`). | System |

The `private` entry already exists in `ngdpbase.user-keywords`. This plan adds `storageLocation: "private"` to that entry — mirroring the `system-category` pattern — and wires up the enforcement that `system-category` already has.

### Current state

- All pages stored flat by UUID: `{pagesDirectory}/{uuid}.md`
- `ngdpbase.user-keywords.private` exists in config but has no storage enforcement code
- ACLManager supports page-level ACLs (`[{ALLOW}]` in content) but no metadata-based isolation
- Attachments are content-addressed (SHA-256) in a single shared directory
- MediaManager does not exist yet

---

## Phase 1: Private Wiki Pages (Issue #122)

### 1.1 — Extend PageIndexEntry in `VersioningFileProvider.ts`

Add `'private'` as a third location type and a `creator` field:

```typescript
// src/providers/VersioningFileProvider.ts
interface PageIndexEntry {
  title: string;
  uuid: string;
  slug: string;
  filename: string;        // still `{uuid}.md`
  currentVersion: string;
  location: 'pages' | 'required-pages' | 'private';  // NEW: 'private'
  creator?: string;        // NEW: username that created the page; required when location === 'private'
  lastModified: string;
  editor: string;          // username that last modified the page
  hasVersions: boolean;
}
```

### 1.1a — Bulk migration of existing `page-index.json` entries

On first boot after upgrade, `loadOrCreatePageIndex()` calls `migratePageIndexEntries()` immediately after loading. It assigns missing `location` and `creator` fields in one pass and writes the index back — a no-op on all subsequent boots:

```typescript
private async migratePageIndexEntries(): Promise<void> {
  if (!this.pageIndex) return;
  let migrated = 0;
  for (const entry of Object.values(this.pageIndex.pages)) {
    if (!entry.location) {
      entry.location = entry.location ?? 'pages';   // existing entries default to 'pages'
      migrated++;
    }
    if (!entry.creator) {
      // required-pages are system-owned; all others default to 'jim' for this instance
      entry.creator = entry.location === 'required-pages' ? 'system' : 'jim';
      migrated++;
    }
  }
  if (migrated > 0) {
    logger.info(`[VersioningFileProvider] Migrated ${migrated} index entries (added location/creator)`);
    await this.savePageIndex();
  }
}
```

### 1.2 — Extend path-building in `FileSystemProvider.ts`

Add a helper `resolvePageFilePath(entry)` that constructs the path based on location:

```typescript
private resolvePageFilePath(uuid: string, location: string, creator?: string): string {
  if (location === 'private' && creator) {
    return path.join(this.pagesDirectory, 'private', creator, `${uuid}.md`);
  }
  return path.join(this.pagesDirectory, `${uuid}.md`);  // existing default
}
```

Called in `savePage()` and `getPage()` instead of the current hardcoded `path.join(this.pagesDirectory, ...)`.

Create private directory on first use via `fs.mkdir({ recursive: true })`.

### 1.3 — Extend version directory for private pages

Private page versions stored at `versions/private/{uuid}/` (no username in version path since UUID is unique):

```typescript
// VersioningFileProvider.getVersionDirectory()
private getVersionDirectory(uuid: string, location: 'pages' | 'required-pages' | 'private' = 'pages'): string {
  if (location === 'private') return path.join(this.privateVersionsDir, uuid);
  if (location === 'required-pages') return this.requiredPagesVersionsDir;
  return path.join(this.pagesVersionsDir, uuid);
}
```

Add `this.privateVersionsDir = path.join(this.versionsDirectory, 'private')` to constructor.

### 1.4 — Detect "private" keyword in `PageManager.savePageWithContext()`

In `PageManager.savePageWithContext()` (`src/managers/PageManager.ts` lines 274-293), use a __config-driven__ check — read `storageLocation` from the keyword definition in `ngdpbase.user-keywords`, mirroring how `ngdpbase.system-category` drives location today:

```typescript
const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
const userKeywordDefs = configManager.getProperty<Record<string, { storageLocation?: string }>>('ngdpbase.user-keywords', {});
const userKeywords = (metadata['user-keywords'] || []) as string[];

// Check if any applied user-keyword requests private storage
const privateLocation = userKeywords
  .map(kw => userKeywordDefs[kw]?.storageLocation)
  .find(loc => loc === 'private');

const enrichedMetadata = {
  ...metadata,
  creator: wikiContext.userContext?.username || 'anonymous',
  'system-location': privateLocation ?? undefined,  // consumed by provider
  'page-creator': privateLocation ? wikiContext.userContext?.username : undefined,
};
```

`VersioningFileProvider.savePage()` reads `metadata['system-location']` and `metadata['page-creator']` to determine storage path, exactly as it currently reads `system-category` → `storageLocation`.

### 1.5 — Enforce access via `WikiContext` in `WikiRoutes.ts`

All access checks use `WikiContext` — the single object that carries both page and user data, consistent with `ACLManager.checkPagePermissionWithContext()`. Build a `WikiContext` once per request and reuse it everywhere.

Add a `checkPrivatePageAccess(wikiContext: WikiContext)` helper:

```typescript
function checkPrivatePageAccess(wikiContext: WikiContext): boolean {
  // WikiContext.pageObject carries the loaded page (added via engine.buildWikiContext)
  const index = wikiContext.pageObject?.metadata?.['index-entry'] as PageIndexEntry;
  if (index?.location !== 'private') return true;            // public page — allow
  if (!wikiContext.userContext?.authenticated) return false;   // anonymous — deny
  if (wikiContext.userContext.roles?.includes('admin')) return true; // admin — allow
  return wikiContext.userContext.username === index.creator;  // creator — allow
}
```

Routes build `WikiContext` once via the existing `WikiRoutes.createWikiContext()` (`src/routes/WikiRoutes.ts:132`), then pass it through:

```typescript
// In WikiRoutes handler — createWikiContext() already exists:
const wikiContext = this.createWikiContext(req, { pageName });
if (!checkPrivatePageAccess(wikiContext)) return res.status(403).render('error', { code: 403 });
```

Apply in:

- `GET /wiki/:pageName` (view)
- `GET /wiki/:pageName/edit` (edit)
- `GET /wiki/:pageName/history` (history)
- `GET /wiki/:pageName/delete` (delete)

Return __403__ (not 404) so the user knows the page exists but is restricted.

### 1.6 — Exclude private pages from search

In `SearchManager.updatePageInIndex()` / `LunrSearchProvider`: store `isPrivate: true` and `creator: username` in the index document.

Pass `WikiContext` through `SearchManager.search(query, options)` — add optional `wikiContext?: WikiContext` to `SearchOptions` (replaces any raw userContext). Filter private results in the search provider:

```typescript
// In LunrSearchProvider.search():
results = results.filter(doc => {
  if (!doc.isPrivate) return true;
  const uc = options.wikiContext?.userContext;
  return uc?.roles?.includes('admin') || uc?.username === doc.creator;
});
```

### 1.7 — Config: add `storageLocation` to the existing `ngdpbase.user-keywords.private` entry

The `private` entry already exists in `config/app-default-config.json` under `ngdpbase.user-keywords`. Add `storageLocation: "private"` to it — the same field used by `ngdpbase.system-category` entries to signal where pages should be stored:

```json
// config/app-default-config.json → ngdpbase.user-keywords → private
"private": {
  "label": "private",
  "description": "Private content editable only by creator and admins",
  "category": "access",
  "enabled": true,
  "restrictEditing": true,
  "storageLocation": "private",    // NEW — triggers private subdirectory storage
  "allowedRoles": ["admin", "creator"]
}
```

This is the only config change needed for Phase 1. The enforcement logic in 1.4 reads this field at runtime, so adding new keyword storage behaviors in future requires only a config change.

### 1.8 — Privacy status change on save (removing the "private" keyword)

When a user edits a private page and removes the `private` user-keyword, `PageManager.savePageWithContext()` detects the transition: current `index.location === 'private'` but new metadata has no private `storageLocation`. The provider must __move the file__:

```typescript
// In VersioningFileProvider.savePage() — detect location change
const currentEntry = this.pageIndex.get(uuid);
const newLocation = resolveLocationFromMetadata(enrichedMetadata);  // 'pages' | 'private'
if (currentEntry?.location !== newLocation) {
  await this.movePageFile(uuid, currentEntry.location, currentEntry.creator, newLocation, newCreator);
  await this.moveVersionDirectory(uuid, currentEntry.location, newLocation);
}
```

Same logic applies in reverse: making a public page private moves it from `pages/` to `pages/private/{creator}/`.

### 1.9 — Required-pages can never be private

Pages with `location: 'required-pages'` are stored in the source repository (`required-pages/`) and committed to GitHub. They are public by definition and must be excluded from any private-folder logic.

Two guards are applied:

1. __Route-level (WikiRoutes.ts)__ — reject any save that includes `private` in `user-keywords` for a required page:

```typescript
if (isCurrentlyRequired && userKeywordsArray.includes('private')) {
  return res.status(400).send('Required pages cannot be marked as private');
}
```

1. __Provider-level (1.4)__ — `savePageWithContext()` skips the `system-location` enrichment when `currentEntry.location === 'required-pages'`, so even if the keyword somehow reaches the provider, no file move occurs.

### 1.10 — URL scheme stays unchanged

Private pages remain at `/wiki/PageName` — no URL change. Privacy is enforced at the route handler level (1.5), not in the URL structure. A private page's existence can be acknowledged with a 403, but the URL does not leak the ownership path.

### 1.11 — `WikiContext` construction uses existing `WikiRoutes.createWikiContext()`

`WikiContext` is already the central orchestrator per `docs/WikiContext-Complete-Guide.md`. The existing factory in `WikiRoutes` is `this.createWikiContext(req, options)` (`src/routes/WikiRoutes.ts:132`). All access checks throughout this plan use it:

```typescript
// Pattern already used in WikiRoutes — reference this everywhere:
const wikiContext = this.createWikiContext(req, { pageName });
if (!checkPrivatePageAccess(wikiContext)) return res.status(403).render('error', { code: 403 });
```

No new factory method needed on WikiEngine.

### 1.12 — Admin visibility of private pages

Admins can read any private page (enforced in 1.5). Add a `/admin/pages?filter=private` view listing all private pages across all creators — queries the page index filtered by `location === 'private'`. Deferred to a follow-up issue, but the `creator` field in `PageIndexEntry` is required from the start to support this query.

---

## Phase 2: Private Attachments (Issue #232 cross-ref)

### 2.1 — Private attachment storage subdirectory

Extend `BasicAttachmentProvider` (`src/providers/BasicAttachmentProvider.ts`):

```typescript
// Resolve private storage dir
this.privateStorageDir = path.join(this.storageDirectory, 'private');
```

In `storeAttachmentInternal()`, check if the associated page is private:

```typescript
const isPrivatePage = options?.isPrivatePage ?? false;
const pageCreator = options?.pageCreator;
const targetDir = isPrivatePage && pageCreator
  ? path.join(this.privateStorageDir, pageCreator)
  : this.storageDirectory;
```

File path: `{targetDir}/{sha256hash}{ext}` — same content-addressing, different directory.

Add `isPrivate: boolean` and `creator?: string` to `SchemaCreativeWork` metadata.

### 2.2 — Propagate privacy to AttachmentManager via `WikiContext`

Replace the separate `isPrivatePage`/`pageCreator` flags in `UploadOptions` with a `WikiContext`. The manager derives all page and user data from it — DRY, consistent with the rest of the engine.

```typescript
interface UploadOptions {
  description?: string;
  wikiContext: WikiContext;   // carries pageName AND userContext — replaces old context/isPrivatePage/pageCreator
}
```

`AttachmentManager.uploadAttachment()` resolves page privacy from the WikiContext's pageName:

```typescript
const pageName = options.wikiContext.pageName;
const page = pageName ? await pageManager.getPage(pageName) : null;
const index = page?.metadata?.['index-entry'] as PageIndexEntry | undefined;
const isPrivate = index?.location === 'private';
const pageCreator = index?.creator;
```

### 2.3 — Guard attachment serving route via `WikiContext`

In `WikiRoutes.serveAttachment()` (`GET /attachments/:attachmentId`), build a `WikiContext` for the attachment's linked page and run the same `checkPrivatePageAccess()` used by page routes:

```typescript
const meta = await attachmentManager.getAttachmentMetadata(attachmentId);
if (meta?.isPrivate) {
  // Re-use the page access helper — build WikiContext from the attachment's linked page
  const linkedPageName = meta.mentions?.[0]?.name;
  const wikiContext = this.createWikiContext(req, { pageName: linkedPageName ?? '' });
  if (!checkPrivatePageAccess(wikiContext)) return res.status(403).render('error', { code: 403 });
}
```

This ensures attachment access control goes through the same `WikiContext`-based path as page access — one check function, not duplicate logic.

---

## Phase 3: MediaManager Stub (Issue #273)

### 3.1 — Design decision: AttachmentManager vs MediaManager boundary

These two managers are __kept separate__ with no handoff between them:

| | AttachmentManager | MediaManager |
|---|---|---|
| Source | User uploads via wiki UI | Pre-existing files on external disk |
| Write model | Writes files into `attachments/` | Read-only — never writes to source |
| Lifecycle | Bound to a wiki page | Independent of wiki pages |
| Metadata | Schema.org CreativeWork | EXIF/IPTC/XMP via `exiftool-vendored` |

AttachmentProvider does __not__ delegate to MediaManager for image/video uploads. The clean architectural separation is preserved.

__Bridge without coupling__: if uploaded attachments should also appear in the media browser, add `${SLOW_STORAGE}/attachments` to `ngdpbase.media.folders` in config. MediaManager will scan and index the directory with zero code coupling.

---

### 3.2 — New files

| File | Purpose |
|------|---------|
| `src/managers/MediaManager.ts` | Manager: initialize, scan, year browsing, search, index management |
| `src/providers/BaseMediaProvider.ts` | Abstract interface: scan(), getItem(), getItemsByYear(), etc. |
| `src/providers/FileSystemMediaProvider.ts` | Filesystem implementation with exiftool-vendored + Sharp |

### 3.3 — MediaManager extends BaseManager

```typescript
class MediaManager extends BaseManager {
  private provider: BaseMediaProvider | null = null;
  private scanInterval: NodeJS.Timeout | null = null;

  async initialize(): Promise<void>
  async scanFolders(force?: boolean): Promise<void>
  async getItem(id: string, wikiContext?: WikiContext): Promise<MediaItem | null>
  async listByYear(year: number, wikiContext?: WikiContext): Promise<MediaItem[]>
  async search(query: string, wikiContext?: WikiContext): Promise<MediaItem[]>
  async shutdown(): Promise<void>
}
```

All public methods accept `WikiContext` (optional — admin/internal calls pass `undefined`). `WikiContext` is built once per request in the route handler and passed through.

Register in `WikiEngine.ts` after `AttachmentManager` (line ~147), only when `ngdpbase.media.enabled` is true.

### 3.4 — BaseMediaProvider interface

```typescript
abstract class BaseMediaProvider {
  abstract scan(force?: boolean): Promise<ScanResult>;
  abstract getItem(id: string): Promise<MediaItem | null>;
  abstract getItemsByYear(year: number): Promise<MediaItem[]>;
  abstract getThumbnailBuffer(id: string, size: string): Promise<Buffer | null>;
  abstract search(query: string): Promise<MediaItem[]>;
  abstract shutdown(): Promise<void>;
}
```

### 3.5 — FileSystemMediaProvider key behavior

- __Dependencies__: `exiftool-vendored` (metadata), `sharp` (already installed, thumbnails)
- __Index file__: `${FAST_STORAGE}/media-index.json` — same atomic write + rename pattern as `page-index.json`
- __Incremental scan__: on startup, load index; scan only dirs whose `mtime` changed since last scan
- __Batch processing__: process N files per event-loop tick to avoid blocking (like VersioningFileProvider write queue)
- __Ignore config__:

  ```json
  "ngdpbase.media.ignoredirs": [".dtrash", ".ts"],
  "ngdpbase.media.ignorefiles": [".photoviewignore", ".plexignore"]
  ```

- __Thumbnail generation__: lazy, on first request; stored in `${FAST_STORAGE}/media/thumbs/{sha256}.jpg`, __never__ in source tree
- __Read-only__: `ngdpbase.media.readonly: true` — refuse to write to source media folders

### 3.6 — Metadata extraction strategy (MWG priority model)

Use `exiftool-vendored` with the MWG composite tag model, priority configurable via:

```json
"ngdpbase.media.metadata.priority": ["EXIF", "IPTC", "XMP"]
```

Date resolution priority (per item):

1. EXIF `DateTimeOriginal` — most reliable (log warning if absent)
2. XMP sidecar (`.xmp` adjacent file) — covers historical scans
3. Path-parsed `YYYY-MM` from containing directory name
4. Filename date prefix (`YYYY-MM-DD-...`)
5. File `mtime` — last resort

### 3.7 — Grouping via metadata (no pre-built albums)

Path/date/event information is stored as metadata fields on each item in `media-index.json`. No separate album structures are built or maintained. Grouping is done at query time against the index.

Required metadata fields per item:

- `year` — extracted from EXIF `DateTimeOriginal` or path/filename fallback (primary grouping key)
- `dirPath` — source directory path (available for display; not used as an album ID)
- `eventName` — parsed from catalog-export filenames (`YYYY-MM-DD-EventName-...`) when present; `null` otherwise

The `/media` browse UI groups items __by year__ using the index. Finer groupings (month, event) are filters on the same index query, not separate data structures.

User-defined named collections are out of scope for this iteration.

### 3.8 — Private awareness in MediaManager

When a media item is linked to a wiki page (`mentions` field), `MediaManager.getItem()` uses `WikiContext` and the shared `checkPrivatePageAccess()` helper — same function used by page and attachment routes:

```typescript
// MediaManager.getItem(id, wikiContext?)
// wikiContext is created in WikiRoutes via this.createWikiContext(req, { pageName })
// and passed through to the manager — MediaManager never holds a req reference directly
if (item.linkedPageName && wikiContext) {
  // WikiContext is immutable (all readonly fields) — create a new one with the
  // linked page name, preserving userContext and request from the caller's context
  const pageWikiContext = new WikiContext(this.engine, {
    context: WikiContext.CONTEXT.VIEW,
    pageName: item.linkedPageName,
    userContext: wikiContext.userContext ?? undefined,
    request: wikiContext.request ?? undefined,
  });
  if (!checkPrivatePageAccess(pageWikiContext)) return null;  // treat as not found — creator/admin check
}
```

`WikiContext` has no clone/withPageName helper — all properties are `readonly`. Construct a new instance directly. One access-check function used consistently across pages, attachments, and media items.

### 3.9 — Config keys (`config/app-default-config.json`)

```json
"ngdpbase.media.enabled": false,
"ngdpbase.media.folders": [],
"ngdpbase.media.maxdepth": 5,
"ngdpbase.media.scaninterval": 3600000,
"ngdpbase.media.readonly": true,
"ngdpbase.media.index.file": "${FAST_STORAGE}/media-index.json",
"ngdpbase.media.thumbnail.dir": "${FAST_STORAGE}/media/thumbs",
"ngdpbase.media.thumbnail.sizes": "300x300,150x150",
"ngdpbase.media.metadata.priority": ["EXIF", "IPTC", "XMP"],
"ngdpbase.media.ignoredirs": [".dtrash", ".ts"],
"ngdpbase.media.ignorefiles": [".photoviewignore", ".plexignore"]
```

### 3.10 — Routes (add to `WikiRoutes.ts`)

```
GET  /media                        → Media home / browse (grouped by year)
GET  /media/year/:year             → All items for a given year
GET  /media/item/:id               → Item detail + metadata panel
GET  /media/search                 → Search results
GET  /media/api/item/:id           → JSON item metadata
GET  /media/api/year/:year         → JSON item list for a year
GET  /media/thumb/:id              → Lazy-generated thumbnail (size query param)
GET  /admin/media                  → Admin: scan status, index stats, force rescan
POST /admin/media/rescan           → Trigger full rescan
```

### 3.11 — Plugin macros (iteration 2 placeholder)

Register plugin stubs in `dist/plugins/` following PluginObject pattern from issue #238:

- `MediaGallery` — `[{MediaGallery year=2024 output=grid max=20}]`
- `MediaSearch` — `[{MediaSearch keyword="Nassau" output=grid max=20}]`
- `MediaItem` — `[{MediaItem id="uuid" caption="text"}]`

Parameter names follow #238 conventions: `max` not `limit`, `output` for mode. Slideshow deferred — iteration 2.

---

## Critical Files to Modify

| File | Change |
|------|--------|
| `src/providers/VersioningFileProvider.ts` | Add `'private'` location type, `creator` to PageIndexEntry, version dir for private |
| `src/providers/FileSystemProvider.ts` | `resolvePageFilePath()` helper for location-aware path building |
| `src/managers/PageManager.ts` | Detect "private" keyword in `savePageWithContext()`, pass location metadata |
| `src/managers/SearchManager.ts` | Add optional userContext to SearchOptions; filter private docs for non-creators |
| `src/providers/BasicAttachmentProvider.ts` | Private subdirectory, `isPrivate` + `creator` in SchemaCreativeWork metadata |
| `src/managers/AttachmentManager.ts` | Resolve page privacy from PageManager, pass flags to provider |
| `src/routes/WikiRoutes.ts` | `checkPrivatePageAccess()` guard on page/attachment routes; add `/media/*` routes |
| `src/WikiEngine.ts` | Register MediaManager after AttachmentManager (conditional on config) |
| `config/app-default-config.json` | Add `storageLocation: "private"` to existing `ngdpbase.user-keywords.private` entry; add all `ngdpbase.media.*` defaults |
| `src/managers/MediaManager.ts` | __NEW__ |
| `src/providers/BaseMediaProvider.ts` | __NEW__ |
| `src/providers/FileSystemMediaProvider.ts` | __NEW__ |

---

---

## Privacy vs Encryption

### Implementation sequence

__Phase 1 and Phase 2 of this plan implement isolation without encryption (Option A below).__ Encryption (Option B) is a natural follow-on that can be added later without restructuring the storage layout — the folder structure `pages/private/{creator}/` is the same either way.

---

### Option A — Access control + filesystem isolation (this plan)

Private pages are stored in a separate subdirectory (`pages/private/{creator}/`) and guarded by route-level checks (`checkPrivatePageAccess()`). Unauthorized wiki users receive a 403. Files on disk are plaintext.

__What it protects against:__ other authenticated wiki users reading your private pages through the wiki UI.

__What it does NOT protect against:__

| Gap | Risk |
|-----|------|
| No encryption at rest | Anyone with filesystem or OS access reads files in plaintext |
| Search index | Private content is stored in `search-index.json` on disk; the filter prevents retrieval via the wiki UI but the data is present in the file |
| Version history | Each version file is plaintext at `versions/private/{uuid}/` |
| Attachments (Phase 2) | Moved to `attachments/private/{creator}/` but remain plaintext |
| Admin bypass | Admins can read all private pages by design — admin account compromise exposes all users' private content |
| Backup / snapshots | Any backup of the data directory includes all private content in plaintext |

__Appropriate use cases:__

- Drafts and work-in-progress kept away from other wiki users
- Personal notes that don't need to be shared
- Threat model is "other authenticated users", not "server operators or admins"

__Not appropriate without encryption:__

- Credentials, secrets, or API keys
- Medical, legal, or financial records
- Any content where server operators must not be able to read it
- Regulatory compliance (HIPAA, GDPR sensitive categories, etc.)

---

### Option B — Application-level encryption (future phase)

Option A establishes the folder structure. Option B adds AES-256-GCM encryption on top of it — the same paths, the same provider, encrypt-on-write and decrypt-on-read added to `VersioningFileProvider`. No restructuring required.

The hard part of encryption is not the cryptography (Node's built-in `crypto` module provides AES-256-GCM) — it is key management.

#### Per-user encryption (recommended)

Each user's private folder (`pages/private/{creator}/`) is encrypted with a key derived from that user's own login password using PBKDF2 or Argon2. The derived key lives in the server-side session only — never persisted to disk. It is discarded on logout.

```
session.privateKey['alice'] = deriveKey(alicePassword, aliceSalt)  // memory only
session.privateKey['bob']   = deriveKey(bobPassword,   bobSalt)    // memory only

pages/private/alice/  ← encrypted with Alice's key; Bob and server operator cannot read
pages/private/bob/    ← encrypted with Bob's key;   Alice and server operator cannot read

```

- Server process cannot decrypt without an active login session
- Alice's content is unreadable to Bob, to admins, and to anyone with OS/disk access
- Each user's key is independent — compromising one user's password does not affect others
- Key must thread through `WikiContext` → `PageManager` → `VersioningFileProvider` for every read/write
- ~2 weeks implementation + UX for the key lifecycle
- __Security value: high__

#### Per-wiki-instance encryption (simpler, weaker)

A single encryption key for the entire wiki instance, derived from an admin-set master passphrase. All private folders encrypted with the same key.

```
pages/private/alice/  ← encrypted with instance master key
pages/private/bob/    ← encrypted with same instance master key

```

- Simpler to implement (~1 week) — one key, no per-user session management
- Admin knows the master key and can therefore decrypt any user's private content
- Protects against OS/disk access by non-admins, but not against admin compromise
- Suitable when the threat model is "disk theft" rather than "admin access"
- __Security value: medium__

#### Comparison

| | Per-user | Per-instance |
|---|---|---|
| Protects against other users | Yes | Yes |
| Protects against server operator / admin | Yes | No |
| Protects against disk theft | Yes | Yes |
| Key management complexity | Per-user session key | Single admin passphrase |
| Lost password = lost data | Yes (per user) | Only if admin loses master passphrase |
| Implementation effort | ~2 weeks | ~1 week |

#### Encrypted backup / download

Because the server holds ciphertext on disk, backup is straightforward and does not require server-side decryption. The user downloads the encrypted folder as a zip — the zip is unreadable to anyone without their password.

```
Server disk:    pages/private/alice/   ← AES-256-GCM ciphertext
Alice downloads: alice-private-backup.zip  ← same ciphertext; useless without Alice's password
```

The zip must include a `key-params.json` file with the PBKDF2 salt and parameters so Alice can re-derive her key from her password on restore. The salt is not secret — it is safe to include in the backup.

__What this enables:__

- Alice can restore her encrypted backup to any ngdpbase instance using the same key derivation
- If Alice loses her wiki password she cannot recover on the server, but a local backup + her original password restores everything — the "lost password = lost data" liability becomes "lost password AND lost backup = lost data"
- Alice owns her data in a meaningful sense; the server is a convenience, not the custodian
- A small standalone decrypt tool (trivial Node.js or Python script using the same PBKDF2 + AES-256-GCM parameters) lets Alice read her pages locally without the wiki server

__Routes needed:__

| Route | Notes |
|-------|-------|
| `GET /user/private/backup` | Streams a zip of `pages/private/{creator}/` ciphertext as-is — no server-side decryption |
| `POST /user/private/restore` | Uploads zip, verifies it decrypts with current key, extracts |

__Effort:__ ~2–3 days on top of the encryption implementation.

#### Cross-cutting concerns for Option B

| Problem | Notes |
|---------|-------|
| Search indexing | Lunr indexes plaintext — encrypted pages cannot be full-text indexed; private pages must be excluded from search, or a separate encrypted index built (significant additional work) |
| Key rotation | When a user changes their password, all files in their private folder must be re-encrypted with the new key |
| Admin recovery | Per-user encryption means lost password = permanently unreadable pages; requires explicit user-facing warnings before the feature is enabled |
| Version history | Each version file must be encrypted/decrypted with the same key — same code path, more files |
| Attachments | `BasicAttachmentProvider` needs the same encrypt/decrypt wrapper for `attachments/private/{creator}/` |
| Session expiry | If a session expires while a user is editing, the next save cannot encrypt; requires graceful error handling and re-authentication prompt |

---

### Decision record

__Phase 1 and Phase 2 implement Option A__ — filesystem isolation and route-level access control. Files remain plaintext. This is appropriate for the "keep other wiki users out" threat model.

__Option B (per-user encryption) is the recommended next step__ if stronger privacy is required. The folder structure established in Phase 1 requires no changes — encryption is additive. Per-user is preferred over per-instance because it protects content even from admin access and supports independent encrypted backups per user.

Per-instance encryption may be appropriate for simpler deployments where admin access to private content is acceptable and the primary concern is disk-level protection.

---

## New npm Dependency

- __`exiftool-vendored`__ — MWG-compliant EXIF/IPTC/XMP metadata for MediaManager. ExifTool binary is bundled by this package (no system Perl required). `sharp` (already a dependency) remains for thumbnail generation only.

---

## Verification

1. __Private page storage__: create a page with "private" keyword as user `alice` → verify file appears at `pages/private/alice/{uuid}.md`, NOT at `pages/{uuid}.md`
2. __Access control__: view alice's private page as user `bob` → 403; as `admin` → 200; as `alice` → 200
3. __Anonymous access__: unauthenticated request to a private page → 403
4. __Search exclusion__: search for content from alice's private page as `bob` → no results; as `alice` → result appears
5. __Private attachments__: upload file to a private page → verify stored in `attachments/private/alice/{hash}.ext`; direct `GET /attachments/{id}` as `bob` → 403
6. __MediaManager startup__: set `ngdpbase.media.enabled: true`, configure a folder → verify `media-index.json` created at `FAST_STORAGE`, no files written to source folder
7. __Thumbnail route__: `GET /media/thumb/{id}?size=300` → 200 JPEG, thumbnail appears in `data/media/thumbs/`, source folder unchanged
8. __E2E tests__: Playwright tests for private page create/view/403 denial — serial mode, separate test project to avoid toggling shared server state
