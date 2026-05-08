# Changelog

All notable changes to ngdpbase will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [3.11.2] - 2026-05-08

### Fixed

- **`npm run version:*` shortcuts** (#659) — pointed `version:show` /
  `version:patch` / `version:minor` / `version:major` / `version:help`
  in `package.json` at the working `src/utils/version.ts` (canonical per
  `AGENTS.md`) instead of the duplicate `scripts/version.ts`, which used
  CJS-style `__dirname` and crashed under ESM (`"type": "module"`) with
  `ReferenceError: __dirname is not defined in ES module scope`.
- Deleted `scripts/version.ts` so there is one and only one version
  script: `src/utils/version.ts`. AGENTS.md unchanged — already pointed
  at the canonical location. Workaround `npx tsx src/utils/version.ts
  <bump>` is no longer needed; the npm shortcuts work directly.

## [3.11.1] - 2026-05-08

### Added

- **`POST /contact`** handler (#658 iteration 3 — closes #658) — wires up
  the form preview shipped in 3.11.0. Pipeline:
  - kill switch check (`contact.enabled = false` → 404)
  - operator-redirect check (`contact.page` set → 405)
  - per-IP rate limit (5 submissions / 15-minute rolling window) → 429
  - honeypot (`_website` field; bots fill, humans don't) → 200 silent
    success without sending mail
  - input validation (name 1-100, email 1-254 + format, optional subject
    ≤200, message 1-5000) — re-renders form with error on failure (HTTP 400)
  - recipient resolution via `UserManager.getContactRecipient` — null →
    render not-configured branch (no mail, no leak)
  - mail send via existing `EmailManager.sendTo()` → 200 with success view
- **`SimpleRateLimiter`** (`src/utils/SimpleRateLimiter.ts`) — minimal
  in-memory per-key rate limiter, ~80 lines. Module-scope per pod;
  distributed deployments get per-replica counters, not a shared budget.
  Documented in `docker/HEADLESS-DEPLOYMENT-NOTES.md` §9 with guidance to
  run a real WAF / proxy upstream for cross-replica protection.
  7 unit tests in `src/utils/__tests__/SimpleRateLimiter.test.ts`.
- **`views/contact.ejs`** updated — submit button enabled, "iteration 3
  coming" banner removed, real `<form action="/contact" method="POST">`
  with required fields, honeypot input, value-preserving form re-render
  on validation error, success view ("Message sent — we typically respond
  within a few days") for `state: 'submitted'`.
- 14 new POST tests in `src/routes/__tests__/WikiRoutes.contact.test.ts`
  covering kill switch, redirect, happy path, default-subject fallback,
  honeypot silent success, all validation paths, dormant recipient,
  EmailManager failure, rate limit (429 + Retry-After), and the
  "recipient never appears in response body" invariant.
- `docker/HEADLESS-DEPLOYMENT-NOTES.md` §9 — operator guide for
  activating the contact feature: set admin email off the install-default
  sentinel OR set `contact.recipient` explicitly; configure
  `ngdpbase.mail.*` for actual delivery; `contact.page` override path.

### Known limitation

- POST `/contact` does **not** validate CSRF tokens. The codebase has no
  app-wide CSRF middleware (`csurf` is in `package.json` but never
  imported); existing POST routes (`/register`, `/admin/*`) also skip
  the check. Adding it only for `/contact` would be inconsistent. The
  honeypot + rate limit + recipient sentinel cover the realistic abuse
  cases for this unauthenticated form. The CSRF gap is tracked as #663
  and affects all POST routes equally.

## [3.11.0] - 2026-05-08

### Added

- **`GET /contact`** route (#658 iteration 2) — built-in contact endpoint with
  a four-state behavior matrix:
  - `contact.enabled = false` → 404 (kill switch)
  - `contact.page = "<slug>"` → 302 → `/view/<slug>` (operator-owned override)
  - `contact.page = ""` + recipient resolved → render form preview view
  - `contact.page = ""` + no routable admin email → render
    "Contact form is not configured" view
- Three new config keys, all under `ngdpbase.application.contact.*`:
  - **`ngdpbase.application.contact.enabled`** (boolean, default `true`) —
    kill switch.
  - **`ngdpbase.application.contact.page`** (string, default `""`) — slug to
    redirect `/contact` to instead of rendering the built-in form. Cannot
    equal `"contact"` — a redirect loop, rejected at startup with a clear
    error message (`ConfigurationManager.assertContactPageNotLoop`).
  - **`ngdpbase.application.contact.recipient`** (string, default `""`) —
    explicit recipient address (or list/alias). When empty, recipient is
    resolved at request time to the first user with the `admin` role whose
    email is non-empty AND not the install-default sentinel
    `admin@localhost`. The sentinel rule keeps the contact feature dormant
    on fresh installs that haven't set a real admin email yet, instead of
    mailing into a black hole. The resolved address is **never rendered to
    clients** — server-side only.
- **`UserManager.getContactRecipient(override)`** — recipient resolution
  helper (11 unit tests in
  `src/managers/__tests__/UserManager.getContactRecipient.test.ts`).
- **`views/contact.ejs`** — branches on `state` (`form` | `not-configured`).
  In iteration 2 the form view shows the field layout with the submit button
  disabled and a banner ("Submission is not yet wired up — coming in #658
  iteration 3"). The actual POST handler, mail send, rate limit, honeypot,
  and CSRF wiring land in iteration 3.
- 9 route tests in `src/routes/__tests__/WikiRoutes.contact.test.ts` cover
  the full state matrix and the "recipient not rendered to client" invariant.
- 4 startup-invariant tests in `ConfigurationManager.test.ts` for the
  `contact.page === "contact"` loop guard (including whitespace-trim).

### Changed

- `ConfigurationManager.initialize()` now calls
  `assertContactPageNotLoop()` after `assertBaseUrlConfigured()` —
  refuses to start if `contact.page` is set to `"contact"`.

## [3.10.6] - 2026-05-08

### Added

- **`Contact Us`** required page (slug `contact-us`, system-category
  `documentation`) — generic operator-overridable copy referencing the
  `[{$applicationname}]` placeholder. Closes the redlinked `[Contact Us]`
  link from the v3.10.4 `request-access` page so visitors who follow it
  reach a real destination instead of an unresolved page-link.
  Iteration 1 of #658 — the `/contact` route, config keys
  (`ngdpbase.application.contact.{enabled,page,recipient}`), recipient
  resolution, and form mechanism are deferred to iterations 2 and 3.

## [3.10.5] - 2026-05-08

### Fixed

- `views/header.ejs` — replaced two hardcoded `/wiki/<slug>` URLs with the
  canonical `/view/<slug>`:
  - Line 134 (added by #654, v3.10.3): the **Request access** button rendered
    when `ngdpbase.application.registration: false`
  - Line 374 (added by #537): pinned-page links in the My Links sidebar
  Both were regressions against the #364 migration ("Renamed /wiki/ URL path
  to /view/ across all source, views, plugins, tests"). The legacy
  `/wiki/:page` route still 301-redirects to `/view/:page`
  (`WikiRoutes.ts:8566-8569`), so existing bookmarks and external links keep
  working. Per AGENTS.md ("Never Use the Word 'Wiki'") and the operator's
  documented preference, the canonical `/view/` path is the only one that
  should appear in newly-written or recently-added user-facing surface area.

## [3.10.4] - 2026-05-08

### Fixed

- Default `ngdpbase.application.registration.redirect-page` slug `request-access`
  pointed at no shipped page. Added `required-pages/<uuid>.md` (slug
  `request-access`, title "Request access") with generic operator-overridable
  copy referencing `[Contact Us]`. Existing installs pick up the new page on
  the next `./server.sh restart` — `VersioningFileProvider`'s boot scanner
  auto-loads required-pages whose UUID is not yet in the index. For ongoing
  required-page changes (modifications, title drift, UUID conflicts), admins
  can review and selectively sync via `/admin/required-pages` — the
  comparison UI shows per-page `new` / `modified` / `current` / `uuid-mismatch`
  status, supports force-sync, reconciliation, and addon-page diffing, and
  skips pages with `user-modified: true` so operator edits are preserved.
  Operators that already shipped their own page titled "Request access" keep
  theirs: the boot scanner skips on title collision
  (`VersioningFileProvider.ts:480`). Fixes #657 (introduced by #654 in 3.10.3).

## [3.10.3] - 2026-05-08

### Added

- **`ngdpbase.application.registration`** (boolean, default `true`) — operator
  switch to disable self-registration. When `false`:
  - `GET /register` and `POST /register` return HTTP 404
  - The header's "Register" button is replaced by a "Request access" link
    pointing at the wiki page named by
    `ngdpbase.application.registration.redirect-page` (default
    slug: `request-access`). Operators control that page's content via the
    wiki UI — drop in a `[{Form …}]` plugin invocation, contact text, etc.
  - OIDC auto-provisioning of brand-new users (`GoogleOIDCProvider`) is
    rejected — the existing `ngdpbase.auth.google-oidc.auto-provision` key
    is overridden when application-level registration is off
  - Login for existing users (password / magic-link / OIDC) is unaffected
  - Admin-driven user creation via `POST /admin/users` is unaffected — gated
    by the `user-create` permission, not this flag
- **`ngdpbase.application.registration.redirect-page`** (string, default
  `"request-access"`) — wiki slug the header button links to when
  registration is disabled.

### Changed

- `getCommonTemplateData()` now exposes `allowRegistration` (boolean) and
  `registrationRedirectPage` (string) to all views; `views/header.ejs`
  branches on the former to choose between Register and Request access.

## [3.10.2] - 2026-05-07

## [3.10.1] - 2026-05-07

## [3.10.0] - 2026-05-07

### Changed

- **#642** Iteration 3 (final): magic-link auth now derives its verify-link host from `ConfigurationManager.getBaseURL()` at runtime instead of reading a separate config key. New `ConfigurationManager.isBaseUrlExplicit()` accessor. `AuthManager.initialize()` refuses to register the magic-link provider unless `ngdpbase.application.base-url` is explicitly configured (via custom config or `NGDPBASE_BASE_URL`) — magic-link tokens are credentials embedded in URLs, so emitting them pointing at the unconfigured localhost default would leak credentials. `WikiRoutes` magic-link initiate handler simplified — no longer computes its own baseUrl. `AuthInitiateContext.baseUrl` field removed (no longer used).

### Removed

- `ngdpbase.auth.magic-link.base-url` config key (#642) — magic-link host is now derived from the canonical `ngdpbase.application.base-url` at runtime. **No migration shim** for this key — operators that previously set it can simply remove it; the canonical key is the single source of truth.
- `MagicLinkConfig.baseUrl` field (#642) — the provider reads it from the engine at runtime.
- `AuthInitiateContext.baseUrl` field (#642) — providers derive base URL from config, callers don't pass it in.

This closes #642. All three iterations shipped: canonical key + migration shim (3.9.2), startup invariant + delete example file (3.9.3), magic-link cleanup + security check (3.10.0).

## [3.9.3] - 2026-05-07

### Changed

- **#642** Iteration 2: hardening. Added startup invariant in `ConfigurationManager` that refuses to start when `.install-complete` exists but `ngdpbase.application.base-url` is not explicitly set in custom config or via `NGDPBASE_BASE_URL`. Deleted `config/app-custom-config.example` and removed the `copyExampleConfigs()` install path that consumed it — install now writes the custom config from the form data alone. Dockerfile no longer copies the template; headless install docs updated to note operators must provide their own config or env-var overrides.

### Removed

- `config/app-custom-config.example` (#642) — was the source of the camelCase key spread; superseded by the install form, k8s ConfigMaps, and env-var overrides.
- `InstallService.copyExampleConfigs()` (#642) — no longer needed.
- `HeadlessInstallResult.steps.configsCopied` field (#642) — always 0 now that example copying is gone.

## [3.9.2] - 2026-05-07

### Changed

- **#642** Iteration 1: unified `ngdpbase.base-url` and `ngdpbase.baseURL` onto canonical `ngdpbase.application.base-url`. Migration shim in `ConfigurationManager` copies legacy keys into the canonical one at load time with a deprecation warning. Forms addon, k8s configmap, Dockerfile comment, and docs all updated.

## [3.9.1] - 2026-05-07

### Added

- **#620** Identity-cache hit/miss telemetry. New OpenTelemetry counter `${prefix}_cache_lookups_total` with attributes `{manager, cache, result}` covers all seven cache lookup points in `RoleManager`, `PersonManager`, and `OrganizationManager`. No-op when telemetry is disabled. 8 new tests in `identityCaches.test.ts`.

## [3.9.0] - 2026-05-04

## [3.8.0] - 2026-05-03

## [3.7.0] - 2026-05-03

## [3.6.0] - 2026-05-02

## [3.5.4] - 2026-05-02

## [3.5.3] - 2026-05-02

## [3.5.2] - 2026-05-02

## [3.5.1] - 2026-05-02

## [3.5.0] - 2026-05-02

## [3.4.0] - 2026-05-01

## [3.3.7] - 2026-04-30

## [3.3.6] - 2026-04-23

## [3.3.5] - 2026-04-22

## [3.3.4] - 2026-04-21

## [3.3.3] - 2026-04-13

## [3.3.2] - 2026-04-13

## [3.3.1] - 2026-04-12

## [3.3.0] - 2026-04-08

## [3.1.4] - 2026-04-06

## [3.1.3] - 2026-04-06

## [3.1.1] - 2026-04-05

## [3.1.0] - 2026-04-05

## [3.0.15] - 2026-04-04

## [3.0.14] - 2026-04-04

## [3.0.13] - 2026-04-02

## [3.0.12] - 2026-04-02

## [3.0.11] - 2026-04-01

## [3.0.10] - 2026-03-30

## [3.0.9] - 2026-03-29

## [3.0.8] - 2026-03-26

## [3.0.7] - 2026-03-26

## [3.0.6] - 2026-03-24

## [3.0.5] - 2026-03-24

## [3.0.4] - 2026-03-24

## [3.0.3] - 2026-03-24

## [3.0.2] - 2026-03-24

## [3.0.1] - 2026-03-23

## [3.0.0] - 2026-03-23

## [2.0.11] - 2026-03-23

## [2.0.10] - 2026-03-23

## [2.0.9] - 2026-03-23

## [2.0.8] - 2026-03-23

## [2.0.7] - 2026-03-23

## [2.0.6] - 2026-03-23

## [2.0.5] - 2026-03-23

**See [docs/project_log.md](./docs/project_log.md) for detailed AI agent session logs and daily work history.**

## [1.5.9] - 2026-02-06

### Fixed

- server.sh stop race condition - delete from PM2 first (#231)
- ReferringPagesPlugin regex for page names with parentheses (#239)

### Added

- Thumbnail generation with Sharp library (#232)
- Insert from Browse Attachments when editing (#232)
- User-facing Attachments documentation page (#232)

### Changed

- ImagePlugin default display mode from 'float' to 'block' (#236)

---

## [1.5.2] - 2026-02-01

### Fixed

- Configuration Management save no longer redirects away from page (#227)
- Admin Dashboard layout updated (#227)
- User preferences not persisting due to query string nested parsing (#226)
- Create New Page defaults and system-category handling (#225)

---

## [1.5.0] - 2025-12-12

### BREAKING CHANGE - Data Directory Consolidation

All instance-specific data directories have been consolidated under `./data/` for simpler deployment and Docker volume mounting.

#### Migration Required

**Existing installations MUST run the migration script before upgrading:**

```bash
./scripts/migrate-to-data-dir.sh
```

Or with dry-run first:

```bash
./scripts/migrate-to-data-dir.sh --dry-run
```

#### New Directory Structure

See [Project Structure](ARCHITECTURE.md)

```
data/
├── pages/        - Wiki content (was ./pages)
├── users/        - User accounts (was ./users)
├── attachments/  - File attachments (unchanged)
├── logs/         - Application logs (was ./logs)
├── search-index/ - Search index (was ./search-index)
├── backups/      - Backup files (was ./backups)
├── sessions/     - Session files (was ./sessions)
└── versions/     - Page versions (unchanged)
```

#### Config Property Changes

| Property | Old Value | New Value |
| ---------- | ----------- | ----------- |
| `ngdpbase.page.provider.filesystem.storagedir` | `./pages` | `./data/pages` |
| `ngdpbase.user.provider.storagedir` | `./users` | `./data/users` |
| `ngdpbase.search.provider.lunr.indexdir` | `./search-index` | `./data/search-index` |
| `ngdpbase.logging.dir` | `./logs` | `./data/logs` |
| `ngdpbase.audit.provider.file.logdirectory` | `./logs` | `./data/logs` |
| `ngdpbase.backup.directory` | `./backups` | `./data/backups` |

### Added

- **Docker Support**: Simplified Docker deployment with single volume mount
  - Updated Dockerfile for consolidated data structure
  - Updated docker-compose.yml for single `./data` volume
  - Updated Docker documentation (README.md, DOCKER.md)
- **Migration Script**: `scripts/migrate-to-data-dir.sh` for existing installations
- **GitHub Issues**: #169 (LoggingProvider pattern), #170 (BackupProvider pattern)

### Changed

- Marked legacy config properties (`ngdpbase.directories.*`, `ngdpbase.jsonuserdatabase`, etc.)
- Docker now requires only one volume mount instead of multiple

### Documentation

- Updated AGENTS.md with current sprint status
- Updated docs/project_log.md with session details
- Updated docker/README.md and docker/DOCKER.md

## [1.4.0] - 2024-10-16

### Added - Version History Feature (Epic #124)

Complete page versioning system with JSPWiki-style version management.

#### Phase 1-2: Foundation & Core Provider

- **VersioningFileProvider**: File-based storage with complete version history
  - Delta storage using fast-diff algorithm (80-90% space savings)
  - Gzip compression for old versions
  - Checkpoint system every N versions for fast retrieval
  - LRU cache for recently accessed versions
  - Backward compatible with FileSystemProvider
- **DeltaStorage utility**: Efficient diff creation and application
- **VersionCompression utility**: Gzip compression/decompression

#### Phase 3: Version Retrieval & Restoration

- `getVersionHistory()` - Retrieve all versions for a page
- `getPageVersion()` - Get specific version content
- `compareVersions()` - Compare any two versions with diff
- `restoreVersion()` - Restore page to previous version (creates new version)
- Metadata tracking: author, date, change type, comment, content hash

#### Phase 4: Migration & Initialization

- Automatic migration from FileSystemProvider on first startup
- Creates v1 for all existing pages
- Builds centralized page-index.json
- Zero downtime deployment
- Manual migration script: `npm run migrate:versioning`

#### Phase 5: Maintenance & Optimization

- `purgeOldVersions()` - Clean up old versions with retention policies
- Configurable retention: maxVersions and retentionDays
- Milestone preservation (v1, every 10th version)
- Storage analytics and reporting
- CLI maintenance tool: `npm run maintain:*`
- Compression of old versions
- Integrity verification

#### Phase 6: UI Integration

- **REST API Endpoints**:
  - `GET /api/page/:identifier/versions` - List versions
  - `GET /api/page/:identifier/version/:version` - Get version
  - `GET /api/page/:identifier/compare/:v1/:v2` - Compare versions
  - `POST /api/page/:identifier/restore/:version` - Restore version
- **Page History View** (`/history/:page`):
  - Complete version list with metadata table
  - Visual indicators (current, checkpoints, compression)
  - View, compare, and restore actions
  - AJAX-powered version preview modal
- **Diff Viewer** (`/diff/:page`):
  - Unified and side-by-side comparison modes
  - Syntax highlighting (additions/deletions/unchanged)
  - Diff statistics
- **Page View Integration**:
  - Version info banner on all pages
  - Info dropdown → Page History link
  - Quick access to version features

#### Phase 7: Testing & Documentation

- **Comprehensive Test Suite**:
  - 28 API endpoint tests (100% coverage)
  - Unit tests for VersioningFileProvider
  - Integration tests for UI workflows
  - Edge case and security testing
- **User Documentation**:
  - Complete user guide (45+ pages)
  - Step-by-step instructions
  - FAQ and troubleshooting
- **API Documentation**:
  - Full REST API reference (25+ pages)
  - Request/response examples
  - Integration examples (React, Node.js)
- **Admin Documentation**:
  - Deployment guide
  - Configuration reference
  - Performance tuning
  - Backup and recovery procedures

### Configuration

New versioning configuration options:

```json
{
  "ngdpbase.page.provider": "versioningfileprovider",
  "ngdpbase.page.provider.versioning.maxversions": 50,
  "ngdpbase.page.provider.versioning.retentiondays": 365,
  "ngdpbase.page.provider.versioning.compression": "gzip",
  "ngdpbase.page.provider.versioning.deltastorage": true,
  "ngdpbase.page.provider.versioning.checkpointinterval": 10,
  "ngdpbase.page.provider.versioning.cachesize": 50
}
```

### Technical Details

**New Files**:

- `src/providers/VersioningFileProvider.js` - Main provider implementation
- `src/utils/DeltaStorage.js` - Diff algorithm wrapper
- `src/utils/VersionCompression.js` - Compression utilities
- `src/utils/VersioningMigration.js` - Migration utilities
- `scripts/migrate-to-versioning.js` - Migration CLI
- `scripts/maintain-versions.js` - Maintenance CLI
- `views/page-history.ejs` - History view template
- `views/page-diff.ejs` - Diff viewer template

**Modified Files**:

- `src/routes/WikiRoutes.js` - Added 4 API + 2 view routes
- `views/view.ejs` - Added version info banner
- `views/header.ejs` - Updated Page History link

**Tests**:

- `src/providers/__tests__/VersioningFileProvider.test.js`
- `src/providers/__tests__/VersioningFileProvider-Maintenance.test.js`
- `src/utils/__tests__/DeltaStorage.test.js`
- `src/utils/__tests__/VersionCompression.test.js`
- `src/routes/__tests__/WikiRoutes.versioning.test.js`

**Documentation**:

- `docs/user-guide/Using-Version-History.md`
- `docs/api/Versioning-API.md`
- `docs/admin/Versioning-Deployment-Guide.md`
- `docs/Versioning-Maintenance-Guide.md`
- `docs/Phase-6-Implementation-Summary.md`
- `docs/planning/Versioning-Implementation.md`

### Performance

- Version retrieval: <100ms for <50 versions
- Diff generation: <500ms for typical pages
- Storage overhead: 10-20% with delta storage + compression
- Memory overhead: ~2MB for 100-entry cache (average 20KB/page)

### Breaking Changes

None. VersioningFileProvider is opt-in and fully backward compatible.

### Migration

To enable versioning:

1. Update config: `"ngdpbase.page.provider": "versioningfileprovider"`
2. Restart application
3. Version history created automatically for all pages

To disable versioning:

1. Update config: `"ngdpbase.page.provider": "filesystemprovider"`
2. Restart application
3. Version data preserved for future re-enabling

### Dependencies

No new dependencies required. Uses existing:

- `fast-diff@1.3.0` (already installed in Phase 1)
- `pako@2.1.0` (already installed in Phase 1)
- `fs-extra@11.3.0` (existing)
- `uuid@9.0.0` (existing)

### Known Limitations

- No pagination for >100 versions per page (acceptable for most use cases)
- No version filtering by author/date in UI
- No bulk operations (restore multiple pages)
- No conflict resolution for concurrent edits during restore

### Future Enhancements

See issue #124 for planned Phase 7+ features.

---

## [1.3.2] - 2024-10-14

### Fixed

- Various bug fixes and improvements

### Documentation

- Enhanced project documentation structure
- Added comprehensive architecture guides

---

## [1.3.1] - 2024-10-10

### Added

- WikiDocument DOM parser
- Enhanced JSPWiki compatibility
- Improved test coverage

---

## [1.3.0] - 2024-10-01

### Added

- Policy-based access control
- Audit trail system
- Admin dashboard
- Time-based permissions

---

## [1.2.0] - 2024-09-15

### Added

- Advanced search functionality
- Multi-criteria filtering
- Category organization
- Plugin system

---

## [1.1.0] - 2024-09-01

### Added

- Image upload functionality
- Inline image support
- Attachment management

---

## [1.0.0] - 2024-08-15

### Added

- Initial release
- Basic wiki functionality
- Markdown support
- File-based storage
- JSPWiki-style links
- Bootstrap UI
- Three-state authentication

---

## Version Numbering

- **Major** (X.0.0): Breaking changes, major features
- **Minor** (1.X.0): New features, backward compatible
- **Patch** (1.0.X): Bug fixes, minor improvements

---

## Links

- [GitHub Repository](https://github.com/jwilleke/ngdpbase)
- [Documentation](./docs/)
- [Issue Tracker](https://github.com/jwilleke/ngdpbase/issues)

---

**Note**: This changelog was formalized starting with version 1.4.0. Previous version entries are abbreviated. For detailed git history, see commit logs.
