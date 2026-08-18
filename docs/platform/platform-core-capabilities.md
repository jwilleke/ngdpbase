# ngdpbase Core Platform Capabilities

This document describes what ngdpbase provides __out of the box__ to anyone who clones and extends it.
These are things you do __not__ need to build — they are fully implemented, tested, and production-ready.

> __Optional features__ are marked *(disabled by default)* or *(enabled by default)* where they are
> config-gated. Everything else is always-on.

---

## Content Management

### Pages

- Create, read, update, delete wiki pages
- File-based storage — plain Markdown files, no database required
- YAML frontmatter on every page (title, tags, custom fields)
- Automatic slug generation from page title
- Namespace/folder support — pages organized as `Section/SubSection/PageName`
- Page rename and move with redirect support
- "What links here" — backlink tracking across all pages
- Page list, recent changes, undefined pages (linked but not yet created)
- Required pages — committed to repo, auto-installed on first run
- Scales to 14,000+ pages (fast init via `page-index.json`)

### Private Pages

- Pages marked with the `private` keyword are visible only to their creator and admins
- Stored separately on disk (`pages/private/{creator}/`)
- Excluded from search results for unauthorized users
- Access-protected across all routes: view, edit, history, delete
- Required pages cannot be made private
- See: `docs/Private-Pages` (required page)

### Versioning

- Full version history for every page
- Diff view between any two versions
- Restore to any previous version
- Automatic version metadata: timestamp, author, change summary
- Private page versions stored privately (`versions/private/{uuid}/`)

### Attachments & Media

- File upload per page
- Image gallery display
- Caption support (displayed instead of filename)
- Sort by date or caption
- Keyword/year browsing of media
- MIME type filtering
- Thumbnail generation (via `sharp`)
- Private attachments: files on private pages are access-controlled at the same level as the page

### Media Manager *(disabled by default — `ngdpbase.media.enabled: true`)*

- Scans external filesystem folders for photos, videos, and documents
- Builds a media index with metadata (EXIF, IPTC, XMP, captions)
- Periodic re-scan on configurable interval (`ngdpbase.media.scaninterval`)
- Configurable scan depth, ignored directories, and file extensions
- Thumbnail generation for discovered images
- Readonly or read-write mode
- Admin panel controls: Reindex, Rebuild

---

## Markup & Rendering

### Markup Language

- Markdown (CommonMark) — default and primary format
- Footnote support *(enabled by default)*
- JSPWiki-flavored extensions:
  - `[{PluginName param='value'}]` — plugin directives
  - `[[PageName]]` and `[[PageName|Link text]]` — wiki links
  - `[[http://example.com|External link]]` — external links
  - Bold `__text__`, italic `''text''`, monospace `{{text}}`
  - Horizontal rules, numbered and bulleted lists
  - Tables

### Rendering Pipeline

- Extensible handler chain — each markup construct is a registered handler
- Plugin execution during page render
- Variable substitution (`{$pagename}`, `{$currentuser}`, etc.)
- Link resolution with broken-link detection
- XSS-safe output — all user content is sanitized
- Parse result, handler result, and pattern caching (all configurable)

### Plugin System

Server-side `[{PluginName param='value'}]` directives execute during page render and return HTML fragments. Plugins have full access to the engine and all managers.

__Built-in plugins:__

| Plugin | Directive | What it does |
|--------|-----------|--------------|
| `AttachmentsPlugin` | `[{Attachments}]` | Lists attachments for a page or shows total count |
| `AttachPlugin` | `[{Attach}]` | Inline attachment link/upload widget |
| `ConfigAccessorPlugin` | `[{ConfigAccessor}]` | Exposes config values in page markup (admin use) |
| `CounterPlugin` | `[{Counter}]` | Page view counter display |
| `CurrentTimePlugin` | `[{CurrentTime}]` | Formatted date/time with locale and timezone |
| `ImagePlugin` | `[{Image}]` | Renders an image with optional caption and alignment |
| `IndexPlugin` | `[{Index}]` | Page index / table of contents |
| `LocationPlugin` | `[{Location}]` | Embedded map preview from lat/lon coordinates |
| `MediaPlugin` | `[{Media}]` | Lists media items or shows media count |
| `MediaGallery` | `[{MediaGallery}]` | Gallery view of media items (requires MediaManager) |
| `MediaItem` | `[{MediaItem}]` | Single media item display (requires MediaManager) |
| `MediaSearch` | `[{MediaSearch}]` | Media search widget (requires MediaManager) |
| `RecentChangesPlugin` | `[{RecentChanges}]` | List of recently edited pages |
| `ReferringPagesPlugin` | `[{ReferringPages}]` | Pages that link to the current page |
| `SearchPlugin` | `[{Search}]` | Full-text search widget |
| `SessionsPlugin` | `[{Sessions}]` | Active session count |
| `TotalPagesPlugin` | `[{TotalPages}]` | Total page count |
| `UndefinedPagesPlugin` | `[{UndefinedPages}]` | Pages linked but not yet created |
| `UptimePlugin` | `[{Uptime}]` | Server uptime display |
| `VariablesPlugin` | `[{Variables}]` | Renders page variable substitutions |

__Adding plugins:__

- Drop a `.ts` file in `plugins/` — auto-discovered at startup
- Or register programmatically from an add-on: `engine.getManager('PluginManager').registerPlugin(...)`
- Additional search paths configurable via `ngdpbase.managers.plugin-manager.search-paths`

---

## Search

- Full-text Lunr search across all page content and metadata
- Indexed fields: title, body, tags, frontmatter fields
- Search results with relevance scoring and snippets
- Advanced search (field-specific queries)
- Configurable result count
- Autocomplete suggestions *(enabled by default)*
- Private pages excluded from results for unauthorized users
- Pluggable `SearchProvider` interface — swap Lunr for Elasticsearch or any backend
- Real-time index update on page save (no full rebuild required for single changes)

---

## User Management & Authentication

### Users

- Local user accounts (username + bcrypt-hashed password)
- User profiles
- Session-based authentication with configurable timeout
- Self-registration *(configurable — disabled by default)*
- Password change

### Roles & Permissions (ACL)

- Arbitrary named roles (e.g., `admin`, `editor`, `unit-04`, `board`)
- Multiple roles per user
- Role assignment via admin panel
- Page-level ACL policies: READ, WRITE, DELETE per role or user
- Namespace-level ACL: policies applied to all pages under a prefix
- Deny rules (explicit deny overrides allow)
- Anonymous access support (public pages)
- Admin-only bypass for maintenance operations

### Security

- CSRF protection on all forms
- XSS-safe rendering
- Rate limiting *(configurable)*
- Maintenance mode (admin-only access during upgrades)
- Audit trail for all write operations

---

## Admin Panel

- Dashboard: page count, user count, system health
- User management: create, edit, disable users; assign roles
- Role management: create, rename, delete roles
- System settings: view configuration, change theme
- Maintenance mode toggle
- Media management: Reindex, Rebuild *(when MediaManager enabled)*
- Export and backup controls
- Background job status and progress

---

## Theme System

- `themes/core.css` — all structural CSS, shared across all themes
- Per-theme CSS custom property overrides (`themes/<name>/css/variables.css`)
- Per-theme logo and favicon (`themes/<name>/assets/`)
- Light mode, dark mode, and system-preference mode via CSS variables
- Admin UI theme switcher
- Available themes listed automatically from `themes/` directory
- Add a new theme: create a folder with `theme.json` and `css/variables.css` — no code changes

---

## Export & Import

- Full wiki export (all pages + attachments) as a zip archive
- Per-page export
- Markdown import
- `ImportManager` API usable from scripts (e.g., bulk content migration)

---

## Backup & Restore

- Full backup via `BackupManager` (triggered from admin panel or API)
- Restore from backup
- Backup coverage: pages, attachments, user data, config, search index, versions
- Add-on managers can hook into the backup lifecycle via `BaseManager.backup()` / `restore()`

---

## Infrastructure & Operations

### Configuration

- `ConfigurationManager` — layered config (defaults → environment → instance overrides)
- All settings under `ngdpbase.*` namespace
- Runtime overrides persist across restarts via `app-custom-config.json`
- `configManager.setProperty(key, value)` — change config at runtime (e.g., from admin UI)

### Background Jobs

- `BackgroundJobManager` — runs long-running admin operations asynchronously (reindex, rebuild, export, etc.)
- Jobs registered by name (`id`, `displayName`, `run`)
- Job status polling via `/admin/jobs/:jobId/status`
- Progress and results surfaced in admin panel
- Add-ons can register their own job types

### Caching

- `CacheManager` — in-memory cache with TTL, available to all managers
- Page render caching *(configurable)*
- Search result caching *(configurable TTL)*

### Notifications

- `NotificationManager` — internal event bus
- Managers and add-ons subscribe to wiki events (page saved, user created, etc.)

### Metrics

- `MetricsManager` — internal counters and timers
- Accessible via admin panel and API

### Audit Logging

- `AuditManager` — records all write operations with user, timestamp, and details
- Pluggable `AuditProvider` interface *(disabled by default — `ngdpbase.audit.enabled: true`)*

### Schema / Structured Data

- `SchemaManager` — Schema.org structured data emission per page type
- Configurable schema type per system-category

### Process Management

- PM2-based via `server.sh` — `./server.sh start|stop|restart`
- Configurable memory ceiling (`PM2_MAX_MEMORY`)
- PID lock file prevents duplicate processes
- Graceful shutdown with manager cleanup in reverse-init order

---

## Extension Points Summary

These are the four ways to extend ngdpbase without modifying core:

| Extension Point | Where | What it enables |
|----------------|-------|-----------------|
| __Plugins__ | `plugins/` or registered from add-on | Custom markup directives — `[{MyPlugin}]` renders HTML during page display |
| __Add-ons__ | external repo, wired via `addonsPath` config | Full application modules: custom managers, Express routes, background jobs, lifecycle hooks |
| __Themes__ | `themes/<name>/` | Visual customization — CSS variables, logo, favicon |
| __Providers__ | Implement interface, swap in config | Replace storage or search backend (`PageProvider`, `SearchProvider`, `UserProvider`, `AuditProvider`) |

See [`docs/platform/ngdp-as-platform.md`](./ngdp-as-platform.md) for the addon development model, use-case analysis, and how to wire an external addon repo.

---

## What You Do NOT Get Out of the Box

These are explicitly __not__ in core — they are what add-on developers build:

- Domain-specific data models (volcano records, unit contacts, product catalog, etc.)
- Domain-specific plugins (infoboxes, maps, faceted search widgets for your data)
- Custom API routes (`/api/your-domain/*`)
- External service integrations (third-party APIs, payment processors, calendars, feeds)
- Custom themes beyond the defaults
- Bulk data importers for domain content
- Role seed scripts (you define which roles your app needs)
- Encryption at rest for private pages (planned future enhancement)

---

Last updated: 2026-03-29 | Related: [`docs/platform/ngdp-as-platform.md`](./ngdp-as-platform.md), #357 (Volcano Wiki), #122 (Private Pages), #387 (BackgroundJobManager)
