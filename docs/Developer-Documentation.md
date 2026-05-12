# Developer Documentation

Complete index of ngdpbase developer documentation

Last Updated: 2026-05-12

---

## Quick Navigation

| Category | Count | Description |
| ---------- | ------- | ------------- |
| [Managers](#managers) | 24 | Core system managers (quick reference + complete guides) |
| [Plugins](#plugins) | 13 | Plugin documentation (developer + user guides) |
| [Providers](#providers) | 7 | Storage and service providers (quick reference + guides + implementation guide) |
| [Architecture](#architecture) | 15+ | System design and patterns |
| [Testing](#testing) | 3 | Testing guides and strategies |
| [API] "#api" | Auto-gen | TypeDoc generated API reference |

---

## Managers

### Quick Reference Guides

Concise API reference for each manager (~100-200 lines):

| Manager | Description |
| --------- | ------------- |
| [ACLManager](managers/ACLManager.md) | Access Control Lists and page permissions |
| [AssetService](managers/AssetService.md) | Unified DAM search facade over the AssetManager provider registry |
| [AttachmentManager](managers/AttachmentManager.md) | File attachment handling |
| [AuditManager](managers/AuditManager.md) | Audit logging and compliance |
| [BackupManager](managers/BackupManager.md) | System-wide backup and restore |
| [BaseManager](managers/BaseManager.md) | Base class for all managers |
| [CacheManager](managers/CacheManager.md) | Centralized cache management |
| [ConfigurationManager](managers/ConfigurationManager.md) | Configuration management |
| [ExportManager](managers/ExportManager.md) | Page export to HTML/Markdown |
| [MediaManager](managers/MediaManager.md) | Read-only external photo/video library |
| [MetricsManager](managers/MetricsManager.md) | System metrics and performance tracking |
| [NotificationManager](managers/NotificationManager.md) | System notifications |
| [PageManager](managers/PageManager.md) | Page CRUD and storage |
| [PluginManager](managers/PluginManager.md) | Plugin discovery and execution |
| [PolicyEvaluator](managers/PolicyEvaluator.md) | Policy evaluation logic |
| [PolicyManager](managers/PolicyManager.md) | Policy-based access control |
| [PolicyValidator](managers/PolicyValidator.md) | Policy validation |
| [RenderingManager](managers/RenderingManager.md) | Markdown and wiki markup rendering |
| [SchemaManager](managers/SchemaManager.md) | JSON Schema management |
| [SearchManager](managers/SearchManager.md) | Full-text search and indexing |
| [TemplateManager](managers/TemplateManager.md) | Page templates and themes |
| [UserManager](managers/UserManager.md) | User authentication and management |
| [ValidationManager](managers/ValidationManager.md) | Input validation |
| [VariableManager](managers/VariableManager.md) | Variable expansion |

### Complete Guides

In-depth documentation for each manager (500-1000+ lines):

| Manager | Guide |
| --------- | ------- |
| ACLManager | [ACLManager-Complete-Guide.md](managers/ACLManager-Complete-Guide.md) |
| AttachmentManager | [AttachmentManager-Complete-Guide.md](managers/AttachmentManager-Complete-Guide.md) |
| BaseManager | [BaseManager-Complete-Guide.md](managers/BaseManager-Complete-Guide.md) |
| BackupManager | [BackupManager-Complete-Guide.md](managers/BackupManager-Complete-Guide.md) |
| CacheManager | [CacheManager-Complete-Guide.md](managers/CacheManager-Complete-Guide.md) |
| ConfigurationManager | [ConfigurationManager-Complete-Guide.md](managers/ConfigurationManager-Complete-Guide.md) |
| ExportManager | [ExportManager-Complete-Guide.md](managers/ExportManager-Complete-Guide.md) |
| MediaManager | [MediaManager-Complete-Guide.md](managers/MediaManager-Complete-Guide.md) |
| MetricsManager | [MetricsManager-Complete-Guide.md](managers/MetricsManager-Complete-Guide.md) |
| NotificationManager | [NotificationManager-Complete-Guide.md](managers/NotificationManager-Complete-Guide.md) |
| PageManager | [PageManager-Complete-Guide.md](managers/PageManager-Complete-Guide.md) |
| PluginManager | [PluginManager-Complete-Guide.md](managers/PluginManager-Complete-Guide.md) |
| RenderingManager | [RenderingManager-Complete-Guide.md](managers/RenderingManager-Complete-Guide.md) |
| SchemaManager | [SchemaManager-Complete-Guide.md](managers/SchemaManager-Complete-Guide.md) |
| SearchManager | [SearchManager-Complete-Guide.md](managers/SearchManager-Complete-Guide.md) |
| TemplateManager | [TemplateManager-Complete-Guide.md](managers/TemplateManager-Complete-Guide.md) |
| UserManager | [UserManager-Complete-Guide.md](managers/UserManager-Complete-Guide.md) |

---

## Plugins

### Developer Documentation

Plugin implementation guides for developers (in docs/plugins/):

| Plugin | Description |
| -------- | ------------- |
| [ConfigAccessorPlugin](plugins/ConfigAccessorPlugin.md) | Access configuration values |
| [CounterPlugin](plugins/CounterPlugin.md) | Page visit counter |
| [CurrentTimePlugin](plugins/CurrentTimePlugin.md) | Display current date/time with formatting |
| [ImagePlugin](plugins/ImagePlugin.md) | Inline images with options |
| [IndexPlugin](plugins/IndexPlugin.md) | Alphabetical page listing |
| [InsertPlugin](plugins/InsertPlugin.md) | Embed another page (or one section of it) into the current page |
| [RecentChangesPlugin](plugins/RecentChangesPlugin.md) | Recent page changes display |
| [ReferringPagesPlugin](plugins/ReferringPagesPlugin.md) | Show backlinks to current page |
| [SearchPlugin](plugins/SearchPlugin.md) | Embedded search functionality |
| [SessionsPlugin](plugins/SessionsPlugin.md) | Active session count |
| [TotalPagesPlugin](plugins/TotalPagesPlugin.md) | Total page count |
| [UptimePlugin](plugins/UptimePlugin.md) | Server uptime display |
| [VariablesPlugin](plugins/VariablesPlugin.md) | Display system and contextual variables |

### User Documentation

End-user plugin guides (in required-pages/ with `system-category: documentation`):

All 13 plugins have user-facing documentation with examples:

- ConfigAccessorPlugin - Access configuration values
- CounterPlugin - Page visit counter
- CurrentTimePlugin - Display formatted time
- ImagePlugin - Inline images
- IndexPlugin - Alphabetical page listing
- InsertPlugin - Embed another page or section ✨ **New**
- RecentChangesPlugin - Recent page changes
- ReferringPagesPlugin - Show backlinks
- SearchPlugin - Search functionality
- SessionsPlugin - Active sessions count
- TotalPagesPlugin - Total page count
- UptimePlugin - Server uptime
- VariablesPlugin - System variables

---

## Providers

### Quick Reference Guides

Concise API reference for each provider (~150-250 lines):

| Provider | Type | Description |
| ---------- | ------ | ------------- |
| [AssetProvider-Guide](providers/AssetProvider-Guide.md) | Asset (DAM) | Implementation guide for building a new `AssetProvider` backend |
| [BaseMediaProvider](providers/BaseMediaProvider.md) | Asset (DAM) | Abstract base class for media providers |
| [BasicAttachmentProvider](providers/BasicAttachmentProvider.md) | Attachment | File-based attachment storage with SHA-256 deduplication |
| [FileSystemMediaProvider](providers/FileSystemMediaProvider.md) | Asset (DAM) | Read-only filesystem media library with EXIF indexing |
| [FileSystemProvider](providers/FileSystemProvider.md) | Page | UUID-based file storage with YAML frontmatter |
| [FileUserProvider](providers/FileUserProvider.md) | User | JSON file-based user and session storage |
| [VersioningFileProvider](providers/VersioningFileProvider.md) | Page | File storage with delta-compressed version history |

### Complete Guides

In-depth documentation for each provider (500-1000+ lines):

| Provider | Guide |
| ---------- | ------- |
| BasicAttachmentProvider | [BasicAttachmentProvider-Complete-Guide.md](providers/BasicAttachmentProvider-Complete-Guide.md) |
| FileSystemProvider | [FileSystemProvider-Complete-Guide.md](providers/FileSystemProvider-Complete-Guide.md) |
| FileUserProvider | [FileUserProvider-Complete-Guide.md](providers/FileUserProvider-Complete-Guide.md) |
| VersioningFileProvider | [VersioningFileProvider-Complete-Guide.md](providers/VersioningFileProvider-Complete-Guide.md) |

### Additional Provider Documentation

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

- [installation-system](installation/installation-system.md) - Installation wizard details
- [install-complete marker](installation/install-complete.md) - `.install-complete` marker lifecycle
- [startup-process](installation/startup-process.md) - Startup sequence documentation
- [installation-testing-results](installation/installation-testing-results.md) - Installation testing results

### Development Workflow

- [DOCUMENTATION-STANDARDS](DOCUMENTATION-STANDARDS.md) - Documentation conventions
- [SERVER-MANAGEMENT](SERVER-MANAGEMENT.md) - Server management best practices
- [MCP-SERVER](MCP-SERVER.md) - Model Context Protocol server

### Planning

- [TODO](planning/TODO.md) - Current tasks and priorities
- [ROADMAP](planning/ROADMAP.md) - Long-term platform vision

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

- **Project Log:** [project_log.md](project_log.md) - AI agent session history
- **Version History:** [CHANGELOG.md](CHANGELOG.md) - Release notes
- **Semantic Versioning:** [SEMVER.md](SEMVER.md) - Versioning policy

---

## Contributing

Before contributing, please review:

1. **[../CONTRIBUTING.md](../CONTRIBUTING.md)** - Development guidelines
2. **[../CODE_STANDARDS.md](../CODE_STANDARDS.md)** - Coding standards
3. **[../ARCHITECTURE.md](../ARCHITECTURE.md)** - System architecture
4. **[DOCUMENTATION-STANDARDS.md](DOCUMENTATION-STANDARDS.md)** - Documentation conventions

---

## Documentation Status

### Completed (Issue #178)

**Managers:** ✅ 24/24 complete (100%)

- ✅ Quick Reference guide (~100-200 lines) — 24 managers
- ✅ Complete Guide (~500-1000+ lines) — 17 managers with complete guides

**Plugins:** ✅ 12/12 complete (100%)

- ✅ Developer documentation (~150-300 lines)
- ✅ User documentation with examples

**Providers:** ✅ 7/7 complete (100%)

- ✅ AssetProvider-Guide (DAM provider implementation guide — #436)
- ✅ BaseMediaProvider (quick reference)
- ✅ BasicAttachmentProvider (quick reference + complete guide)
- ✅ FileSystemMediaProvider (quick reference)
- ✅ FileSystemProvider (quick reference + complete guide)
- ✅ FileUserProvider (quick reference + complete guide)
- ✅ VersioningFileProvider (quick reference + complete guide)

See [Issue #178](https://github.com/jwilleke/ngdpbase/issues/178) for documentation improvement tracking.
