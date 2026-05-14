# Developer Documentation

Canonical index of every managed module in ngdpbase, mapping each
`src/managers/*.ts`, `src/plugins/*.ts`, and `src/providers/*.ts` to its
documentation (or, if no doc exists yet, to the source file directly).

Last Updated: 2026-05-14

---

## How to use this index (READ FIRST)

**This file is the authoritative starting point for anyone — human or AI agent — looking for "does X already exist in the project?"** It exists because the most common failure mode of contributors is writing duplicate functionality that regresses existing code (issue #660).

Workflow:

1. **Before writing a new manager / plugin / provider / handler, search this index.** Ctrl-F for the concept name, the data shape you're touching, or the verb you'd use to name the new module.
2. **A row exists for every `src/managers/*.ts`, `src/plugins/*.ts`, and `src/providers/*.ts` file** — including those without a doc page. Modules without a doc still point to their source file, so "no doc" is never the same as "doesn't exist."
3. **The doc-status column** marks each row:
   - ✅ **Documented** — quick-reference doc exists in `docs/`
   - 📘 **+ Complete Guide** — also has an in-depth `-Complete-Guide.md` companion
   - ⚠️ **Source only** — no doc page yet; read the `.ts` file directly
4. **If you add a new manager / plugin / provider, add its row here in the same commit.** Indexes that drift are worse than no index. See `DOCUMENTATION-STANDARDS.md` for the standard.
5. **For architecture-level orientation** (rendering pipeline, save pipeline, access-control flow), jump to the [Architecture](#architecture) section.

---

## Quick Navigation

| Category | Count (src/) | Documented | Description |
| ---------- | --- | --- | ------------- |
| [Managers](#managers) | 37 | 24 | Core system managers |
| [Plugins](#plugins) | 33 | 20 | JSPWiki-style content plugins |
| [Providers](#providers) | 28 | 8 | Storage and service providers |
| [Architecture](#architecture) | n/a | 15+ | System design and patterns |
| [Testing](#testing) | n/a | 3 | Testing guides and strategies |
| [API](#api-reference) | n/a | Auto-gen | TypeDoc generated API reference |

---

## Managers

Every manager class in `src/managers/`. Quick reference docs are ~100-200 lines; Complete Guides are 500-1000+.

| Manager | Doc status | Description |
| --------- | --- | ------------- |
| ACLManager | 📘 [doc](managers/ACLManager.md) + [guide](managers/ACLManager-Complete-Guide.md) | Access Control Lists and per-page permissions |
| AddonsManager | ⚠️ [src/managers/AddonsManager.ts](../src/managers/AddonsManager.ts) | Addon lifecycle, enable/disable, theme registration |
| AssetManager | ⚠️ [src/managers/AssetManager.ts](../src/managers/AssetManager.ts) | DAM provider registry; consumed via AssetService facade |
| AssetService | ✅ [doc](managers/AssetService.md) | Unified DAM search facade over AssetManager |
| AttachmentManager | 📘 [doc](managers/AttachmentManager.md) + [guide](managers/AttachmentManager-Complete-Guide.md) | File attachment handling |
| AuditManager | ✅ [doc](managers/AuditManager.md) | Audit logging and compliance |
| AuthManager | ⚠️ [src/managers/AuthManager.ts](../src/managers/AuthManager.ts) | Authentication providers (Password, MagicLink, OIDC) |
| BackgroundJobManager | ⚠️ [src/managers/BackgroundJobManager.ts](../src/managers/BackgroundJobManager.ts) | Scheduled / deferred work execution |
| BackupManager | 📘 [doc](managers/BackupManager.md) + [guide](managers/BackupManager-Complete-Guide.md) | System-wide backup and restore |
| BaseManager | 📘 [doc](managers/BaseManager.md) + [guide](managers/BaseManager-Complete-Guide.md) | Base class for all managers |
| CacheManager | 📘 [doc](managers/CacheManager.md) + [guide](managers/CacheManager-Complete-Guide.md) | Centralized cache management |
| CatalogManager | ⚠️ [src/managers/CatalogManager.ts](../src/managers/CatalogManager.ts) | Catalog/inventory feature support |
| CommentManager | ⚠️ [src/managers/CommentManager.ts](../src/managers/CommentManager.ts) | Per-page comment threads (CommentsPlugin backend) |
| ConfigurationManager | 📘 [doc](managers/ConfigurationManager.md) + [guide](managers/ConfigurationManager-Complete-Guide.md) | Config load, merge, and accessor surface |
| EmailManager | ⚠️ [src/managers/EmailManager.ts](../src/managers/EmailManager.ts) | Outbound mail via configurable transport (used by /contact, #658) |
| ExportManager | 📘 [doc](managers/ExportManager.md) + [guide](managers/ExportManager-Complete-Guide.md) | Page export to HTML/Markdown |
| FootnoteManager | ⚠️ [src/managers/FootnoteManager.ts](../src/managers/FootnoteManager.ts) | Footnote persistence and rendering (FootnotesPlugin backend) |
| ImportManager | ⚠️ [src/managers/ImportManager.ts](../src/managers/ImportManager.ts) | Bulk page import from external sources |
| MediaManager | 📘 [doc](managers/MediaManager.md) + [guide](managers/MediaManager-Complete-Guide.md) | Read-only external photo/video library |
| MetricsManager | 📘 [doc](managers/MetricsManager.md) + [guide](managers/MetricsManager-Complete-Guide.md) | System metrics and performance tracking |
| NotificationManager | 📘 [doc](managers/NotificationManager.md) + [guide](managers/NotificationManager-Complete-Guide.md) | System and per-user notifications |
| OrganizationManager | ⚠️ [src/managers/OrganizationManager.ts](../src/managers/OrganizationManager.ts) | Organization (schema.org) directory |
| PageManager | 📘 [doc](managers/PageManager.md) + [guide](managers/PageManager-Complete-Guide.md) | Page CRUD and storage facade |
| PersonManager | ⚠️ [src/managers/PersonManager.ts](../src/managers/PersonManager.ts) | Person (schema.org) directory |
| PluginManager | 📘 [doc](managers/PluginManager.md) + [guide](managers/PluginManager-Complete-Guide.md) | Plugin discovery and execution |
| PolicyEvaluator | ✅ [doc](managers/PolicyEvaluator.md) | Policy evaluation logic (Tier 2 of ACLManager) |
| PolicyManager | ✅ [doc](managers/PolicyManager.md) | Policy-based access control |
| PolicyValidator | ✅ [doc](managers/PolicyValidator.md) | Policy validation |
| RenderingManager | 📘 [doc](managers/RenderingManager.md) + [guide](managers/RenderingManager-Complete-Guide.md) | Markdown and wiki-markup rendering |
| RoleManager | ⚠️ [src/managers/RoleManager.ts](../src/managers/RoleManager.ts) | Role definitions and lookups |
| SchemaManager | 📘 [doc](managers/SchemaManager.md) + [guide](managers/SchemaManager-Complete-Guide.md) | JSON Schema management |
| SearchManager | 📘 [doc](managers/SearchManager.md) + [guide](managers/SearchManager-Complete-Guide.md) | Full-text search and indexing |
| TemplateManager | 📘 [doc](managers/TemplateManager.md) + [guide](managers/TemplateManager-Complete-Guide.md) | Page templates and themes |
| ThemeManager | ⚠️ [src/managers/ThemeManager.ts](../src/managers/ThemeManager.ts) | Theme discovery, asset resolution |
| UserManager | 📘 [doc](managers/UserManager.md) + [guide](managers/UserManager-Complete-Guide.md) | User authentication and management |
| ValidationManager | ✅ [doc](managers/ValidationManager.md) | Input validation |
| VariableManager | ✅ [doc](managers/VariableManager.md) | Variable expansion (`[{$pagename}]` etc.) |

---

## Plugins

JSPWiki-style content plugins in `src/plugins/`. Each plugin renders `[{PluginName ...}]` markup. Developer docs live in `docs/plugins/`; end-user docs are pages in `required-pages/` (delivered with the platform).

| Plugin | Doc status | Description |
| -------- | --- | ------------- |
| AttachmentsPlugin | ⚠️ [src/plugins/AttachmentsPlugin.ts](../src/plugins/AttachmentsPlugin.ts) | List attachments on the current page |
| AttachPlugin | ✅ [doc](plugins/AttachPlugin.md) | Inline an attachment by name |
| CommentsPlugin | ⚠️ [src/plugins/CommentsPlugin.ts](../src/plugins/CommentsPlugin.ts) | Render the page's comment thread |
| ConfigAccessorPlugin | ✅ [doc](plugins/ConfigAccessorPlugin.md) | Access configuration values at render time |
| CounterPlugin | ✅ [doc](plugins/CounterPlugin.md) | Page visit counter |
| CurrentTimePlugin | ✅ [doc](plugins/CurrentTimePlugin.md) | Display current date/time with formatting |
| FootnotesPlugin | ⚠️ [src/plugins/FootnotesPlugin.ts](../src/plugins/FootnotesPlugin.ts) | Render the page's footnotes section |
| ImagePlugin | ✅ [doc](plugins/ImagePlugin.md) | Inline images with options |
| IndexPlugin | ✅ [doc](plugins/IndexPlugin.md) | Alphabetical page listing |
| InsertPlugin | ✅ [doc](plugins/InsertPlugin.md) | Embed another page (or one section of it) |
| LocationPlugin | ✅ [doc](plugins/LocationPlugin.md) | Geo links and embedded maps |
| MarqueePlugin | ✅ [doc](plugins/MarqueePlugin.md) | Scrolling-text banner |
| MediaGallery | ⚠️ [src/plugins/MediaGallery.ts](../src/plugins/MediaGallery.ts) | Render a gallery of media items |
| MediaItem | ⚠️ [src/plugins/MediaItem.ts](../src/plugins/MediaItem.ts) | Render a single media item |
| MediaPlugin | ⚠️ [src/plugins/MediaPlugin.ts](../src/plugins/MediaPlugin.ts) | Media insertion (legacy entry point) |
| MediaSearch | ⚠️ [src/plugins/MediaSearch.ts](../src/plugins/MediaSearch.ts) | Search media by metadata |
| MyContributionsPlugin | ⚠️ [src/plugins/MyContributionsPlugin.ts](../src/plugins/MyContributionsPlugin.ts) | Current user's edits/creates |
| MyLinksPlugin | ✅ [doc](plugins/MyLinksPlugin.md) | User-curated quick links |
| PageSlideshowPlugin | ⚠️ [src/plugins/PageSlideshowPlugin.ts](../src/plugins/PageSlideshowPlugin.ts) | Slideshow of pages matching a query |
| RecentChangesPlugin | ✅ [doc](plugins/RecentChangesPlugin.md) | Recent page changes display |
| ReferringPagesPlugin | ✅ [doc](plugins/ReferringPagesPlugin.md) | Show backlinks to current page |
| SearchPlugin | ✅ [doc](plugins/SearchPlugin.md) | Embedded search functionality |
| SessionsPlugin | ✅ [doc](plugins/SessionsPlugin.md) | Active session count |
| SlideshowPlugin | ✅ [doc](plugins/SlideshowPlugin.md) | Slideshow of attachments/images |
| TablePlugin | ⚠️ [src/plugins/TablePlugin.ts](../src/plugins/TablePlugin.ts) | Render a table from inline data |
| TabPlugin | ⚠️ [src/plugins/TabPlugin.ts](../src/plugins/TabPlugin.ts) | Single tab within `[{Tabs}]` |
| TabsPlugin | ⚠️ [src/plugins/TabsPlugin.ts](../src/plugins/TabsPlugin.ts) | Tabbed content container |
| TotalPagesPlugin | ✅ [doc](plugins/TotalPagesPlugin.md) | Total page count |
| UndefinedPagesPlugin | ✅ [doc](plugins/UndefinedPagesPlugin.md) | Pages referenced but not yet created |
| UptimePlugin | ✅ [doc](plugins/UptimePlugin.md) | Server uptime display |
| UserLookupPlugin | ✅ [doc](plugins/UserLookupPlugin.md) | Render user info by username |
| VariablesPlugin | ✅ [doc](plugins/VariablesPlugin.md) | Display system and contextual variables |

Note: end-user documentation pages for plugins live in `required-pages/` with `system-category: documentation`, not in `docs/`. The CalendarPlugin docs at `docs/plugins/CalendarPlugin.md` describe an addon plugin; see addon documentation in `addons/calendar/`.

---

## Providers

Storage and service providers in `src/providers/`. Each provider implements a `Base<Type>Provider` interface; multiple providers can coexist behind the same manager (e.g., AuditManager has File/Cloud/Database/Null).

| Provider | Type | Doc status | Description |
| ---------- | ------ | --- | ------------- |
| BaseAttachmentProvider | Attachment | ⚠️ [src](../src/providers/BaseAttachmentProvider.ts) | Abstract base for attachment storage |
| BaseAuditProvider | Audit | ⚠️ [src](../src/providers/BaseAuditProvider.ts) | Abstract base for audit log sinks |
| BaseAuthProvider | Auth | ⚠️ [src](../src/providers/BaseAuthProvider.ts) | Abstract base for auth providers |
| BaseCacheProvider | Cache | ⚠️ [src](../src/providers/BaseCacheProvider.ts) | Abstract base for cache backends |
| BaseMediaProvider | Asset (DAM) | ✅ [doc](providers/BaseMediaProvider.md) | Abstract base for media providers |
| BasePageProvider | Page | ⚠️ [src](../src/providers/BasePageProvider.ts) | Abstract base for page storage |
| BaseSearchProvider | Search | ⚠️ [src](../src/providers/BaseSearchProvider.ts) | Abstract base for search backends |
| BaseUserProvider | User | ⚠️ [src](../src/providers/BaseUserProvider.ts) | Abstract base for user/session storage |
| BasicAttachmentProvider | Attachment | 📘 [doc](providers/BasicAttachmentProvider.md) + [guide](providers/BasicAttachmentProvider-Complete-Guide.md) | File-based attachments with SHA-256 dedup |
| CloudAuditProvider | Audit | ⚠️ [src](../src/providers/CloudAuditProvider.ts) | Cloud-bucket audit log sink |
| DatabaseAuditProvider | Audit | ⚠️ [src](../src/providers/DatabaseAuditProvider.ts) | SQL audit log sink |
| ElasticsearchSearchProvider | Search | ✅ [doc](providers/ElasticsearchSearchProvider.md) | Elasticsearch full-text index |
| FileAuditProvider | Audit | ⚠️ [src](../src/providers/FileAuditProvider.ts) | JSONL file audit log sink |
| FileOrganizationProvider | Organization | ⚠️ [src](../src/providers/FileOrganizationProvider.ts) | JSON-file organization directory |
| FilePersonProvider | Person | ⚠️ [src](../src/providers/FilePersonProvider.ts) | JSON-file person directory |
| FileRoleProvider | Role | ⚠️ [src](../src/providers/FileRoleProvider.ts) | JSON-file role definitions |
| FileSystemMediaProvider | Asset (DAM) | ✅ [doc](providers/FileSystemMediaProvider.md) | Read-only filesystem media with EXIF |
| FileSystemProvider | Page | 📘 [doc](providers/FileSystemProvider.md) + [guide](providers/FileSystemProvider-Complete-Guide.md) | UUID-based page files with YAML frontmatter |
| FileUserProvider | User | 📘 [doc](providers/FileUserProvider.md) + [guide](providers/FileUserProvider-Complete-Guide.md) | JSON-file user and session storage |
| GoogleOIDCProvider | Auth | ⚠️ [src](../src/providers/GoogleOIDCProvider.ts) | Google OpenID Connect auth |
| LunrSearchProvider | Search | ⚠️ [src](../src/providers/LunrSearchProvider.ts) | In-process Lunr full-text index |
| MagicLinkAuthProvider | Auth | ⚠️ [src](../src/providers/MagicLinkAuthProvider.ts) | Email magic-link authentication |
| NodeCacheProvider | Cache | ⚠️ [src](../src/providers/NodeCacheProvider.ts) | In-process `node-cache` backend |
| NullAuditProvider | Audit | ⚠️ [src](../src/providers/NullAuditProvider.ts) | No-op audit sink (audit disabled) |
| NullCacheProvider | Cache | ⚠️ [src](../src/providers/NullCacheProvider.ts) | No-op cache (caching disabled) |
| PasswordAuthProvider | Auth | ⚠️ [src](../src/providers/PasswordAuthProvider.ts) | Local username/password auth |
| RedisCacheProvider | Cache | ⚠️ [src](../src/providers/RedisCacheProvider.ts) | Redis-backed cache backend |
| VersioningFileProvider | Page | 📘 [doc](providers/VersioningFileProvider.md) + [guide](providers/VersioningFileProvider-Complete-Guide.md) | File storage with delta-compressed version history |

### Provider implementation guide

- [AssetProvider-Guide](providers/AssetProvider-Guide.md) — How to build a new `AssetProvider` backend.

### Versioning provider supporting docs

- [Versioning-Migration-Guide](pageproviders/Versioning-Migration-Guide.md)
- [Versioning-Deployment-Guide](admin/Versioning-Deployment-Guide.md)
- [Versioning-Maintenance-Guide](pageproviders/Versioning-Maintenance-Guide.md)

---

## Architecture

System design and architectural patterns:

| Document | Description |
| ---------- | ------------- |
| [Current-Rendering-Pipeline](architecture/Current-Rendering-Pipeline.md) | Production rendering pipeline (request → HTML) |
| [Current-Save-Page-Pipeline](architecture/Current-Save-Page-Pipeline.md) | Production save pipeline (request → disk) |
| [MANAGERS-OVERVIEW](architecture/MANAGERS-OVERVIEW.md) | Manager-based architecture |
| [PROJECT-STRUCTURE](architecture/PROJECT-STRUCTURE.md) | Directory structure and organization |
| [JSPWikiPreprocessor](architecture/JSPWikiPreprocessor.md) | Table and style-block handler (Phase 2.5) |
| [Policies-Roles-Permissions](architecture/Policies-Roles-Permissions.md) | Access control architecture |
| [CacheManager Complete Guide](managers/CacheManager-Complete-Guide.md) | Caching strategy — both CacheManager regions and provider-level structural caches |
| [Access-Control](architecture/Access-Control.md) | Operational guide for `hasRole` / `hasPermission` / `canAccess` / `getPrincipals` |
| [Page-Metadata](architecture/Page-Metadata.md) | Page frontmatter structure |

### Core Concepts

| Document | Description |
| ---------- | ------------- |
| [WikiContext](WikiContext.md) | Request context pattern (quick reference) |
| [WikiContext-Complete-Guide](WikiContext-Complete-Guide.md) | In-depth WikiContext documentation |
| [WikiDocument-Complete-Guide](WikiDocument-Complete-Guide.md) | WikiDocument DOM documentation |
| [rendering-pipeline](rendering-pipeline.md) | End-to-end rendering flow |

---

## Testing

Testing documentation and strategies:

| Document | Description |
| ---------- | ------------- |
| [Testing-Summary](testing/Testing-Summary.md) | Current test status and quick reference |
| [Complete-Testing-Guide](testing/Complete-Testing-Guide.md) | Comprehensive testing documentation |
| [PREVENTING-REGRESSIONS](testing/PREVENTING-REGRESSIONS.md) | Regression prevention strategy |

---

## API Reference

Auto-generated TypeDoc API documentation:

- **Location:** `docs/api/generated/`
- **Generate:** `npm run docs`
- **View:** `npm run docs:watch` (live preview)
- **Format:** Markdown (for GitHub) or HTML

To generate fresh API docs:

```bash
npm run docs        # Generate markdown
npm run docs:html   # Generate HTML
```

---

## Developer Guides

### Installation & Setup

- [installation-system](installation/installation-system.md) — Installation wizard details
- [install-complete marker](installation/install-complete.md) — `.install-complete` marker lifecycle
- [startup-process](installation/startup-process.md) — Startup sequence documentation
- [installation-testing-results](installation/installation-testing-results.md) — Installation testing results

### Development Workflow

- [DOCUMENTATION-STANDARDS](DOCUMENTATION-STANDARDS.md) — Documentation conventions and the policy that governs this index
- [SERVER-MANAGEMENT](SERVER-MANAGEMENT.md) — Server management best practices
- [MCP-SERVER](MCP-SERVER.md) — Model Context Protocol server

### Planning

- [TODO](TODO.md) — Current tasks and priorities
- [ROADMAP](planning/ROADMAP.md) — Long-term platform vision

---

## Templates

Documentation templates for creating new documentation:

| Template | Use For |
| ---------- | --------- |
| [Manager-Template](templates/Manager-Template.md) | New manager documentation |
| [Provider-Template](templates/Provider-Template.md) | New provider documentation |
| [Plugin-Template](templates/Plugin-Template.md) | Plugin developer docs |
| [Plugin-User-Template](templates/Plugin-User-Template.md) | Plugin user guides |

---

## Project Status

- **Project Log:** [project_log.md](project_log.md) — AI agent session history
- **Version History:** [CHANGELOG.md](CHANGELOG.md) — Release notes
- **Semantic Versioning:** [SEMVER.md](SEMVER.md) — Versioning policy

---

## Contributing

Before contributing, please review:

1. **[../CONTRIBUTING.md](../CONTRIBUTING.md)** — Development guidelines
2. **[../CODE_STANDARDS.md](../CODE_STANDARDS.md)** — Coding standards
3. **[../ARCHITECTURE.md](../ARCHITECTURE.md)** — System architecture
4. **[DOCUMENTATION-STANDARDS.md](DOCUMENTATION-STANDARDS.md)** — Documentation conventions

---

## Documentation Status (2026-05-14)

Honest accounting of doc coverage. Targets are pragmatic — abstract base classes and trivial null/no-op providers don't need long-form docs, but every module should at least have a stub or appear in this index.

**Managers:** 24/37 with quick-reference docs (65%); 17 with Complete Guides. 13 source-only:

- AddonsManager, AssetManager, AuthManager, BackgroundJobManager, CatalogManager, CommentManager, EmailManager, FootnoteManager, ImportManager, OrganizationManager, PersonManager, RoleManager, ThemeManager

**Plugins:** 20/33 with doc pages (61%). 12 source-only:

- AttachmentsPlugin, CommentsPlugin, FootnotesPlugin, MediaGallery, MediaItem, MediaPlugin, MediaSearch, MyContributionsPlugin, PageSlideshowPlugin, TablePlugin, TabPlugin, TabsPlugin

**Providers:** 8/28 with doc pages (29%). The bulk of source-only providers are abstract bases (`Base*Provider`) and null/trivial implementations (`Null*Provider`). Notable non-trivial providers that should be documented:

- GoogleOIDCProvider, MagicLinkAuthProvider, PasswordAuthProvider, LunrSearchProvider, RedisCacheProvider, FileAuditProvider, CloudAuditProvider, DatabaseAuditProvider, FilePersonProvider, FileOrganizationProvider, FileRoleProvider

See [issue #178](https://github.com/jwilleke/ngdpbase/issues/178) for the doc-coverage tracking issue and [#660](https://github.com/jwilleke/ngdpbase/issues/660) for the discoverability problem this index addresses.
