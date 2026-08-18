# Architecture

ngdpbase is built on a manager-based architecture designed for modularity, extensibility, and separation of concerns.
This document outlines the project structure and architectural decisions. All architectural decisions follow the principles in [GLOBAL-CODE-PREFERENCES.md](GLOBAL-CODE-PREFERENCES.md)

Related documents:

- [CODE_STANDARDS.md](./CODE_STANDARDS.md) - Coding standards and conventions
- [SECURITY.md](./SECURITY.md) - Security guidelines and best practices
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Development workflow
- [AGENTS.md](./AGENTS.md) - Project context and goals

## High-Level Overview

ngdpbase uses a __central WikiEngine__ that orchestrates 30 specialized managers, each responsible for specific domains.

### Key Componets

- [WikiContext-Complete-Guide.md](docs/WikiContext-Complete-Guide.md) - WikiContext is the central orchestrator for wiki content rendering in ngdpbase and replaces inline regex processing with a modular, manager-based approach.
- [WikiDocument-Complete-Guide](docs/WikiDocument-Complete-Guide.md) -  WikiDocument is a DOM-based representation of a wiki page.

## Key Architecture Patterns

### Manager-Based Architecture

See [docs/architecture/MANAGERS-OVERVIEW.md](./docs/architecture/MANAGERS-OVERVIEW.md) for the full manager inventory, initialization order, and inter-manager flow diagrams.

- Specialized managers extending BaseManager
- Central WikiEngine orchestrator
- Manager access via `engine.getManager('ManagerName')`
- Uniform initialization and lifecycle management

### WikiContext Pattern

Single source of truth for request/user context:

- Created per request with context type, page name, user context, engine reference
- Passed to managers, plugins, parsers, handlers
- Ensures consistent state across components

### Provider Pattern

- Abstract provider interfaces (BasePageProvider, BaseUserProvider, etc.)
- Concrete implementations (FileSystemPageProvider, FileUserProvider)
- Enables storage backend swapping without manager changes

### WikiDocument DOM Pipeline

Three-phase extraction for parsing JSPWiki syntax:

1. Extract JSPWiki syntax elements
2. Create DOM nodes
3. Merge with Markdown content

- Handler-based: DOMVariableHandler, DOMPluginHandler, DOMLinkHandler
- No parsing conflicts between JSPWiki and Markdown syntax

### Configuration System

- Hierarchical: default → environment → custom configs
- 1150+ properties in `config/app-default-config.json`
- JSPWiki-style naming: `ngdpbase.{category}.{property}`
- ConfigurationManager for centralized access
- Server restart required for configuration changes

## Tech Stack

### Runtime

- Node.js with TypeScript/ESM
- Express.js 5.x for routing and middleware
- `server.sh` for process management (ecosystem.config.js for PM2 if used directly)
- EJS templates with Bootstrap 5 UI

### Storage

- __File-based__ (Markdown files with YAML frontmatter)
- __Delta storage__ for versions (fast-diff + pako compression)
- __No database required__ - fully file-based architecture
- Supports local-first deployment with cloud-deployment option

### Content Processing

- __Showdown__ for Markdown parsing
- __Custom JSPWiki handlers__ for compatibility
- __WikiDocument DOM__ (linkedom-based) for content manipulation
- __Delta-based versioning__ (80-95% space savings)

### Testing & Quality

- __Vitest__ (4260+ tests across 162 files, >80% coverage target)
- __Co-located__ `__tests__/` pattern
- __Mocked file operations__ (no real I/O in tests)
- __JSDoc__ (95% coverage requirement)

### Development Standards

- __TypeScript__ (strict mode, native ESM)
- __Semantic Versioning__ for releases
- __markdownlint, .editorconfig, Prettier__ for code formatting

## Project Structure

- All configuration MUST use ConfigurationManager - no hardcoded fallbacks (DRY)
- Use Playwright for E2E testing with Chromium browser, integrate into CI/CD
- Schema.org-compliant front matter, PascalCase naming, TypeDoc for automation
- Implement lint-staged to only lint staged files (not all files), allowing incremental improvement
- All instance-specific data consolidated into `./data/` directory

```
ngdpbase/
├── src/
│   ├── managers/           # 23+ domain-specific managers
│   ├── providers/          # Storage providers (Page, User, Search, etc.)
│   ├── routes/             # Express route handlers
│   ├── services/           # Business logic services
│   ├── plugins/            # Plugin system
│   ├── parsers/            # Content parsing
│   ├── context/            # WikiContext implementation
│   └── utils/              # Utility functions
├── config/                 # Repo only Configuration files
├── data/                   # All instance-specific data (v1.5.0+)
│   ├── pages/              # User-created wiki pages
│   ├── users/              # User accounts and profiles
│   ├── attachments/        # File attachments
│   ├── logs/               # Application logs
│   ├── config/             # Instance only Configuration files
│   ├── search-index/       # Search index files
│   ├── backups/            # Backup files
│   ├── sessions/           # Session files
│   └── versions/           # Page version history
├── required-pages/         # System pages (only used during installation, then copied to data/pages)
├── docs/                   # Developer documentation
├── docker/                 # Docker deployment files
├── views/                  # EJS templates
├── scripts/                # Utility scripts (migration, maintenance)
└── public/                 # Static assets
```

## For More Details

See [docs/architecture/](./docs/architecture/) for comprehensive documentation on:

- [Manager patterns and responsibilities](./docs/architecture/MANAGERS-OVERVIEW.md)
- Plugin architecture and hooks
- WikiDocument DOM pipeline
- Storage provider implementation
- Configuration system details
- ACL and permission system
- Rendering pipeline

## Related Documentation

- [CONTRIBUTING.md](./CONTRIBUTING.md) - Development workflow and coding standards
- [docs/INSTALLATION-SYSTEM.md](./docs/INSTALLATION-SYSTEM.md) - First-run setup wizard
- [docs/SERVER.md](./docs/SERVER.md) - Server management and deployment
- [docker/DOCKER.md](./docker/DOCKER.md) - Docker deployment guide
- [SECURITY.md](./SECURITY.md) - Security practices and threat model
