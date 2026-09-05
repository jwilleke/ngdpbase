# ngdpbase Glossary

Canonical definitions for terms used in code, docs, logs, and agent sessions.
When in doubt, use the term in the "Preferred" column.

---

## Server Lifecycle

### Build (Compile)

Preferred: __Build__
Avoid: "compile", "transpile", "recompile"

Runs `tsc` to convert TypeScript source (`src/`) into JavaScript (`dist/`).
Required after any source code change before the server can run the new code.

```sh
./server.sh stop       # always stop before building (build clears dist/)
npm run build          # runs clean (rm -rf dist) then tsc
./server.sh start      # start after build completes
```

Note: `npm run build` runs `rm -rf dist` as a prebuild step, which crashes a
running PM2 process. Always stop the server first.

### Restart

Preferred: __Restart__

Stops and starts the PM2-managed server process. Does NOT recompile source.
Use after a config change, environment change, or to recover a crashed process.

```sh
./server.sh restart
./server.sh stop
./server.sh start
```

Always use `server.sh`. Never use `kill`, `node app.js`, or direct PM2 commands.
`server.sh` sources `.env`, manages PM2, PID locks, and orphan cleanup.

---

## Storage Layout

ngdpbase splits data across two volumes for performance. All config keys are __all lowercase__.

| Term | Env Var | Path (dev) | Contents |
|---|---|---|---|
| Fast Storage | `FAST_STORAGE` | `/Volumes/hd2/jimstest-wiki/data` | users, sessions, logs, config, Page Index, Search Index, Media Index, media thumbnails |
| Slow Storage | `SLOW_STORAGE` | `/Volumes/hd2A/jimstest-wiki/data` | pages (`*.md`), attachments, attachment metadata |
| `dist/` | — | `…/ngdpbase/dist/` | compiled JS (output of Build) |
| `src/` | — | `…/ngdpbase/src/` | TypeScript source |
| `plugins/` | — | `…/ngdpbase/plugins/` | wiki plugin source (compiled to `dist/plugins/`) |
| `config/` | — | `…/ngdpbase/config/` | default config (`app-default-config.json`) |

Key config paths (resolved via `ConfigurationManager.getResolvedDataPath()`):

| Config Key | Default Value | Description |
|---|---|---|
| `ngdpbase.page.provider.filesystem.storagedir` | `${SLOW_STORAGE}/pages` | wiki page `.md` files |
| `ngdpbase.attachment.provider.basic.storagedir` | `${SLOW_STORAGE}/attachments` | attachment binary files |
| `ngdpbase.attachment.metadatafile` | `${SLOW_STORAGE}/attachments/attachment-metadata.json` | attachment metadata |
| `ngdpbase.page.provider.versioning.indexfile` | `${FAST_STORAGE}/page-index.json` | Page Index |
| `ngdpbase.search.provider.lunr.indexdir` | `${FAST_STORAGE}/search-index/` | Search Index |
| `ngdpbase.media.index.file` | `${FAST_STORAGE}/media-index.json` | Media Index |
| `ngdpbase.managers.plugin-manager.search-paths` | `["./dist/plugins"]` | plugin search paths |

---

## Page Data & Initialization

### Page Index (`page-index.json`)

Preferred: __Page Index__ or __`page-index.json`__
Avoid: "page cache file", "index file", "page index file"

The on-disk JSON file that stores metadata for every wiki page (title, slug,
UUID, lastModified, author). Located at `$FAST_STORAGE/page-index.json`.

Used at startup to populate the in-memory Page Cache without a full Directory
Scan. Enables Fast Init (~1s vs ~90s for a full scan).

Updated incrementally on every page save, rename, or delete via a serialized
write queue (prevents race conditions from concurrent page saves).

### Page Cache

Preferred: __Page Cache__
Avoid: "pageCache", "in-memory cache", "page list"

The in-memory `Map<title, PageInfo>` maintained by `VersioningFileProvider` at
runtime. The authoritative source for page existence, titles, and slugs while
the server is running. Populated at startup from the Page Index (Fast Init) or
from a Directory Scan.

`getAllPages()` returns `Array.from(pageCache.keys())` — page titles, sorted.

### Directory Scan

Preferred: __Directory Scan__
Avoid: "scan", "full scan", "NAS scan", "page scan", "rebuilding via directory scan"

Reads every `.md` file in `$SLOW_STORAGE/pages/` from disk to build the Page
Cache from scratch. Happens at startup only when the Page Index is missing or
corrupt. Takes ~90s with 14K+ pages on a NAS-mounted volume.

### Fast Init

Preferred: __Fast Init__
Avoid: "fast-path", "fast startup", "index-based startup"

The normal startup path: loads the Page Index (`page-index.json`) from disk
to populate the Page Cache in ~1s, skipping a Directory Scan.

### Page Index Rebuild

Preferred: __Page Index Rebuild__
Avoid: "reindex pages", "rebuild page index", "refresh index"

Rewrites `page-index.json` from the current Page Cache. Happens automatically
on page save/delete/rename. Not the same as a Search Index Rebuild.

---

## Search

### Search Index

Preferred: __Search Index__
Avoid: "Lunr index", "search-index", "full-text index"

The in-memory Lunr.js full-text index used to power wiki search. Persisted to
disk at `$FAST_STORAGE/search-index/`. Separate from the Page Index.
Provided by `LunrSearchProvider`.

### Search Index Rebuild

Preferred: __Search Index Rebuild__
Avoid: "reindex", "rebuild search", "rebuild Lunr", "build search index"

Rebuilds the Lunr full-text index from all page documents. Triggered
automatically during a full startup Directory Scan, or via an admin action.
With 14K+ documents this causes a ~3GB RAM spike; `max_memory_restart` in
`ecosystem.config.js` must be ≥ 4GB (`PM2_MAX_MEMORY` env var).

---

## Attachments

### Attachment

Preferred: __Attachment__
Avoid: "upload", "file", "asset"

A file uploaded to the wiki and associated with one or more pages. Stored as
`{sha256-hash}{extension}` in `$SLOW_STORAGE/attachments/`. Metadata is in
`attachment-metadata.json` (Schema.org `CreativeWork` format). Served via
`GET /attachments/:attachmentId`.

Private-page attachments are stored in a per-creator subdirectory:
`$SLOW_STORAGE/attachments/private/{creator}/`

Key metadata fields:

- `identifier` — SHA-256 content hash (used as the serving ID)
- `name` — original filename (e.g., `iran-provinces.png`)
- `encodingFormat` — MIME type (e.g., `image/png`)
- `storageLocation` — full filesystem path at time of upload (__may be stale__ after data migration; `getAttachment()` derives the actual path from the configured `storageDirectory` instead)
- `mentions` — array of page UUIDs that reference this attachment
- `isPrivate` / `creator` — set when linked to a private page

### Attachment Metadata (`attachment-metadata.json`)

Preferred: __Attachment Metadata__ or __`attachment-metadata.json`__

Single JSON file at `$SLOW_STORAGE/attachments/attachment-metadata.json`
containing Schema.org `CreativeWork` records for every attachment. Loaded into
memory at startup by `BasicAttachmentProvider`. The `storageLocation` field
records the path at upload time — after a data migration this may be stale;
`getAttachment()` re-derives the path from the configured storage directory.

### `resolveAttachmentSrc(src, pageName)`

Preferred: __resolveAttachmentSrc__ or __attachment resolution__

The canonical method (`AttachmentManager.resolveAttachmentSrc()`) used by all
plugins (ImagePlugin, AttachPlugin, MediaPlugin) to convert a raw `src` value
into a `{ url, mimeType }` pair. Resolution order:

1. __External URL__ — `http://` or `https://` → returned as-is, `mimeType: ''`
2. __Absolute path__ — starts with `/` → returned as-is, `mimeType: ''`
3. __Current-page lookup__ — searches attachments whose `mentions` include `pageName` for an exact filename match
4. __Global filename search__ — searches all attachments by exact `name` match

Returns `null` if unresolvable (caller decides how to render the error).

---

## Media

### Media Index (`media-index.json`)

Preferred: __Media Index__ or __`media-index.json`__
Avoid: "image index", "photo index"

Persistent JSON index of external media items (photos, videos stored in
configured media folders outside the wiki). Located at
`$FAST_STORAGE/media-index.json`. Used by `MediaManager` and
`FileSystemMediaProvider` for fast lookups without rescanning the filesystem.

Each `MediaItem` record includes: `id` (SHA-256 of file path), `filePath`,
`filename`, `mimeType`, `year` (from EXIF or filename), `eventName` (parsed
from catalog-export filenames in `YYYY-MM-DD-EventName` format),
`linkedPageName`, `isPrivate`, `creator`.

### Media Index Rebuild

Preferred: __Media Index Rebuild__ or __media rescan__
Avoid: "rebuild image index", "rescan photos"

Triggers a full re-scan of configured media folders and rewrites
`media-index.json`. Config keys: `ngdpbase.media.folders` (paths to scan),
`ngdpbase.media.maxdepth` (default 5), `ngdpbase.media.ignoredirs`,
`ngdpbase.media.ignorefiles`.

__Manual:__ `POST /admin/media/rescan` (admin UI: `/admin/media`)
__Automatic:__ background timer every `ngdpbase.media.scaninterval` ms (default 3600000 = 1 hour)

Internally calls `mediaManager.scanFolders(true)` → `FileSystemMediaProvider.scan(force=true)`.

---

## Plugins

### Plugin

Preferred: __Plugin__
Avoid: "macro", "widget", "extension"

A module that extends wiki rendering via JSPWiki-style syntax:
`[{PluginName param='value'}]`

Plugins are loaded from directories listed in
`ngdpbase.managers.plugin-manager.search-paths` (default `["./dist/plugins"]`)
and compiled from `plugins/*.ts` source. Plugin discovery is case-insensitive;
`[{Image}]` and `[{ImagePlugin}]` both resolve to `ImagePlugin`.

__Two plugin shapes:__

- __Object plugin__ (preferred): `{ name, execute(context, params), initialize?(engine) }`
- __Function plugin__ (legacy): `(pageName, params, linkGraph) => string`

__Built-in plugins:__

| Plugin | Syntax | Description |
|---|---|---|
| `ATTACH` | `[{ATTACH src='file.pdf'}]` | Render attachment inline; images show as clickable thumbnails, other files as download links |
| `Image` | `[{Image src='img.jpg' align='left'}]` | Render image with layout/styling options |
| `AttachmentsPlugin` | `[{AttachmentsPlugin}]` | List all attachments for the current page |
| `MediaPlugin` | `[{MediaPlugin id='...'}]` | Render a media item inline |
| `MediaGallery` | `[{MediaGallery}]` | Display a media gallery |
| `MediaSearch` | `[{MediaSearch}]` | Search media items |
| `CurrentTimePlugin` | `[{CurrentTimePlugin}]` | Display current date/time |
| `CounterPlugin` | `[{CounterPlugin}]` | Increment and display a counter |
| `IndexPlugin` | `[{IndexPlugin}]` | Generate a page index/TOC |
| `LocationPlugin` | `[{LocationPlugin lat='...' lon='...'}]` | Store/display location with GPS map link |
| `RecentChangesPlugin` | `[{RecentChangesPlugin}]` | List recently changed pages |
| `referringPagesPlugin` | `[{referringPagesPlugin}]` | List pages linking to current page |
| `SearchPlugin` | `[{SearchPlugin}]` | Full-text search interface |
| `TotalPagesPlugin` | `[{TotalPagesPlugin}]` | Count total wiki pages |
| `UndefinedPagesPlugin` | `[{UndefinedPagesPlugin}]` | List broken/undefined links |
| `VariablesPlugin` | `[{VariablesPlugin}]` | Expand wiki variables |
| `SessionsPlugin` | `[{SessionsPlugin}]` | Display session information |
| `UptimePlugin` | `[{UptimePlugin}]` | Display wiki uptime |
| `ConfigAccessorPlugin` | `[{ConfigAccessorPlugin}]` | Read configuration values |

---

## Rendering

### WikiContext

Preferred: __WikiContext__
Avoid: "context", "wiki context object", "page context"

Request-scoped object created per HTTP request, providing a single source of
truth for the current operation. Holds `pageName`, `userContext`, `request`,
`response`, engine managers, and the rendering context type.

Context types (static constants on `WikiContext`):
`VIEW`, `EDIT`, `PREVIEW`, `DIFF`, `INFO`, `NONE`

Key methods:

- `renderMarkdown(content)` — render wiki markup to HTML
- `toParseOptions()` — build `ParseContext` options for MarkupParser
- `createWikiContext(req, options)` — factory in `WikiRoutes`

### ParseContext

Preferred: __ParseContext__
Avoid: "parse context", "rendering context"

Immutable-ish object passed through the markup processing pipeline carrying:
`pageName`, `userName`, `userContext`, `requestInfo`, engine reference.
Used by handlers and plugins to access the engine managers (`getManager()`)
and check authentication/permissions during rendering.

### MarkupParser (Advanced Renderer)

Preferred: __MarkupParser__ or __advanced renderer__
Avoid: "new parser", "advanced parser", "JSPWiki parser"

Multi-phase markup processing engine (`src/parsers/MarkupParser.ts`).
The primary renderer when available. Handles plugins, variables, wiki links,
tables, attachments, and forms via a priority-ordered set of syntax handlers.

Key handlers (from `src/parsers/handlers/`):

| Handler | Priority | Handles |
|---|---|---|
| `PluginSyntaxHandler` | 90 | `[{PluginName param=value}]` |
| `WikiLinkHandler` | — | `[PageName]` and `[text\|PageName]` |
| `WikiTableHandler` | — | `\|\|col\|\|col\|\|` table syntax |
| `WikiStyleHandler` | — | `__bold__`, `''italic''` |
| `VariableSyntaxHandler` | — | `${VARIABLE}` |
| `WikiFormHandler` | — | wiki form syntax |
| `InterWikiLinkHandler` | — | cross-wiki links |

### Legacy Renderer (Showdown)

Preferred: __legacy renderer__ or __Showdown fallback__
Avoid: "old parser", "markdown parser"

Fallback renderer used when `MarkupParser` is unavailable. Runs Showdown
(Markdown → HTML) + `VariableManager` variable expansion. No plugin support.
Triggered when `RenderingManager.getParser()` returns null.

---

## UI & Appearance

### Site Theme

Preferred: __Site Theme__ or __display theme__
Avoid: "theme", "color scheme" (ambiguous — see also Code Editor Style)

The active Bootstrap/Bootswatch theme folder loaded by `ThemeManager`. Controls
the site's overall look: color palette, typography, navbar, and component styles.
Set via config key `ngdpbase.theme.active` (default: `default`).

Available themes live in `themes/<name>/` and require a `theme.json`. A standard
Bootswatch theme can be added by placing a CDN URL in `theme.json`'s `fonts[]`
array — no custom CSS needed. `core.css` provides the Bootstrap→semantic CSS
variable bridge that makes any Bootstrap 5 theme work out of the box.

`ThemeManager` resolves the active theme's paths (`coreCssPath`, `variablesCssPath`,
`logoPath`, `faviconPath`, `fontUrls`) and falls back to
`/themes/core-variables-empty.css` when a theme has no `variables.css`.

Separate from Light-Dark Mode and Code Editor Style.

### Light-Dark Mode

Preferred: __Light-Dark Mode__ or __display mode__
Avoid: "dark mode toggle", "theme toggle", "color scheme"

The user's brightness preference for the site: `light`, `dark`, or `system`
(follows the OS setting). Stored in `user.preferences['display.theme']`.

Applied at runtime by setting `data-bs-theme="light|dark"` on the `<html>` element
— Bootstrap 5.3's native dark mode mechanism. CSS custom properties in
`variables.css` respond to `[data-bs-theme="dark"]` to flip colors.

Controlled per-user via:

- The __⊕ icon__ button in the top navigation bar (desktop and mobile)
- The __Light / Dark Mode__ field on the `/profile` page

Persisted server-side for authenticated users via `POST /api/user/display-theme`;
stored in `localStorage` only for anonymous users.

Separate from the active Site Theme (which Bootstrap theme is loaded) and the
Code Editor Style (textarea color scheme).

### Code Editor Style

Preferred: __Code Editor Style__
Avoid: "editor theme" alone (ambiguous with display theme or site theme), "theme"

The syntax-highlighting color scheme applied inside the page editor textarea only
(e.g., `default`, `dracula`, `monokai`). Stored in `user.preferences['editor.theme']`.
Has no effect on the rest of the site's appearance.

Configured via the __Code Editor Style__ field on the `/profile` page.

Separate from Light-Dark Mode and the active Site Theme.

### Chip

Preferred: __Chip__ (when the element is interactive / part of a set)
Avoid: "badge" for keyword/tag pills, "tag pill", "label"

An interactive pill representing one member of a page's __taxonomy__, derived
from frontmatter, not authored in Markdown body. Rendered by the view/plugin
layer:

- `user-keywords` — human-authored; rendered clickable → `/search?q=<kw>`
  (`view.ejs`).
- `system-keywords` — machine/ES auto-tags ("auto-tags"); same chip rendering.

A chip is part of a *set*, links/filters somewhere, and is generated from a
frontmatter field — never written in page content. Ingestion/conversion
(#501/#685, NCM #728) must __preserve__ these fields; it must never overwrite
human `user-keywords`.

### Badge

Preferred: __Badge__ (when the element is static status / category, non-interactive)
Avoid: "chip" for status indicators, "tag"

A static, non-interactive indicator: a single category or status, not a set
member and not a filter link. Examples in this codebase:

- Page-top category badge — driven by `ngdpbase.system-category[<name>].page-badge`
  config from the single `system-category` frontmatter value (`header.ejs`).
- Status pills — `(Private)`, version pills (`v3.17.0`), admin
  `New`/`Modified`/`Current` (`admin-required-pages.ejs`, `RecentChangesPlugin`).

Note: Chips and Badges currently share the Bootstrap `.badge` CSS class — the
__visual is not the semantic__. Both are *rendered product* (produced from
frontmatter/config at view time), so neither is an authoring construct in page
Markdown — see [`docs/NGDP-Compatible-Markdown.md`](./NGDP-Compatible-Markdown.md) §2.1/§3.2 (#728).

---

## Private Pages

### Private Page

Preferred: __private page__

A wiki page accessible only to its creator and admin users. Marked by the
metadata field `system-location: 'private'`; the page creator is stored in
`page-creator` metadata. The page index entry records `location: 'private'`.

Access is enforced in `WikiRoutes.checkPrivatePageAccess()` before rendering,
and in `ACLManager` permission checks. Search results and media items linked
to private pages are filtered by user identity.

Private attachments are stored separately in
`$SLOW_STORAGE/attachments/private/{creator}/` with `isPrivate: true` and
`creator` set in metadata.

---

## Page Metadata

### author

The original creator of a page. Stored as `page-creator` in frontmatter and `creator` in the Page Index. Set once at creation; does not change when the page is later edited.

### editor

The user who last saved the page. Stored as `lastModifiedBy` in frontmatter. Updated on every save, unlike `author`.

### author-lock

A per-page frontmatter flag (`author-lock: true`) that restricts the edit form to the page's author and admin users. All other roles receive a 403 even if their ACL role normally permits editing.

---

## Managers & Providers

### Manager

Preferred: __Manager__ (e.g., `AttachmentManager`, `PageManager`)
Avoid: "service", "controller", "handler"

Singleton engine components accessed via `engine.getManager('ManagerName')`.
Manage a domain of wiki functionality and delegate storage operations to Providers.

Key managers: `ACLManager`, `AttachmentManager`, `BackupManager`,
`ConfigurationManager`, `MediaManager`, `PageManager`, `PluginManager`,
`RenderingManager`, `SearchManager`, `UserManager`.

### Provider

Preferred: __Provider__ (e.g., `BasicAttachmentProvider`, `LunrSearchProvider`)
Avoid: "backend", "driver", "adapter"

Pluggable storage/service implementations selected by Managers. Abstract base
classes (e.g., `BaseAttachmentProvider`, `BasePageProvider`) define the
interface; concrete classes implement it for a specific storage backend.

Key providers: `BasicAttachmentProvider` (attachments), `VersioningFileProvider`
(pages with version history), `LunrSearchProvider` (full-text search),
`FileSystemMediaProvider` (external media scan), `FileUserProvider` (users),
`NodeCacheProvider` / `RedisCacheProvider` (caching).

---

## Quick Reference

| You want to… | Term | Command / Location |
|---|---|---|
| Compile source after a code change | Build | `./server.sh stop && npm run build && ./server.sh start` |
| Reload the server process | Restart | `./server.sh restart` |
| See what pages exist at runtime | Page Cache | `VersioningFileProvider.getAllPages()` |
| Speed up server startup | Fast Init | ensure `$FAST_STORAGE/page-index.json` exists |
| Force rebuild of page metadata file | Page Index Rebuild | automatic on page save; delete `page-index.json` and restart to force |
| Rebuild full-text search | Search Index Rebuild | admin action or restart after deleting `$FAST_STORAGE/search-index/` |
| Rebuild the media/image index | Media Index Rebuild | `POST /admin/media/rescan` or via `/admin/media` UI |
| Render a wiki attachment inline | Plugin: ATTACH | `[{ATTACH src='file.png'}]` |
| Render an image with layout control | Plugin: Image | `[{Image src='img.jpg' align='left' display='float'}]` |
| Resolve an attachment src to a URL | resolveAttachmentSrc | `AttachmentManager.resolveAttachmentSrc(src, pageName)` |
| Add a new wiki plugin | Plugin | add `*.ts` to `plugins/`, build, configure search path |
| Check configured storage paths | ConfigurationManager | `ngdpbase.attachment.provider.basic.storagedir`, etc. |
| Change the site color palette / Bootstrap theme | Site Theme | set `ngdpbase.theme.active` in config; theme folder in `themes/` |
| Toggle light / dark appearance | Light-Dark Mode | ⊕ icon in navbar, or `/profile` → Light / Dark Mode |
| Change page editor color scheme | Code Editor Style | `/profile` → Code Editor Style |
