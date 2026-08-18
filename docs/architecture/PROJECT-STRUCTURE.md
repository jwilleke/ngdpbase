# Project Structure Documentation

## Overview

This document provides a comprehensive guide to the ngdpbase project structure, explaining the purpose and organization of each directory and key file.

## Directory Structure

### Core Application Structure

```bash
ngdpbase/
├── src/                    # Source code directory
├── config/                 # Application configuration
├── public/                 # Static web assets
├── views/                  # Template files
├── app.js                  # Main application entry point
├── package.json            # NPM configuration and dependencies
└── README.md              # Main project documentation
```

### Documentation Structure

```bash
docs/
├── architecture/          # System architecture and design docs
│   ├── ARCHITECTURE-PAGE-CLASSIFICATION.md
│   └── PROJECT-STRUCTURE.md (this file)
├── development/           # Development guides and standards
│   ├── CONTRIBUTING.md    # Contribution guidelines
│   └── TESTING_PLAN.md    # Testing strategy
├── planning/              # Project planning and roadmap
│   ├── ROADMAP.md         # Project vision and priorities
│   ├── PROJECT_BOARD.md   # Current project status
│   └── todo.md            # Task tracking
├── api/                   # API documentation
│   └── NOTIFICATION_ENHANCEMENT.md
├── issues/                # Issue tracking and known problems
│   ├── ATTACHMENT_PERMISSION_CONFLICTS.md
│   ├── DIGITAL-DOCUMENT-PERMISSION-STATUS.md
│   └── PageInventory.md
├── CHANGELOG.md           # Version history and changes
├── SEMVER.md              # Semantic versioning guide
└── Content Management.md  # Content management docs
```

### Runtime Data Structure

```bash
data/                      # Application runtime data (gitignored)
├── notifications.json     # Notification persistence data
├── page-index.json        # Versioning page index
├── sessions/              # Session storage (file-based sessions)
└── attachments/           # Attachment metadata and storage

logs/                      # Application logs (gitignored)
├── app.log               # Winston application logs (detailed operations)
├── pm2-out.log           # PM2 stdout (console output)
├── pm2-error.log         # PM2 stderr (runtime errors)
├── pm2-combined.log      # PM2 combined logs
└── audit.log             # Security/audit events

pages/                     # User-generated wiki pages (gitignored)
├── *.md                  # Individual wiki pages

users/                     # User account data (gitignored)
├── *.json                # User account files

attachments/               # User uploaded files (gitignored)
├── */                    # Organized by type/subdirectory

exports/                   # Exported content (gitignored)
├── *.pdf, *.html, etc.   # Exported wiki content
```

### Development and Testing

```bash
tests/                     # Test files
├── Temp.md               # Test content

scripts/                   # Utility and maintenance scripts
├── migrate-to-schema.js  # Database migration scripts
├── theme-replace-extended.sh
├── theme-replace.sh
├── validate-pages.js     # Page validation utilities

reports/                   # Test and coverage reports (gitignored)
├── coverage/             # Main test coverage
├── coverage-acl/         # ACL-specific coverage
├── coverage-all/         # Full coverage reports
├── coverage-page/        # Page manager coverage
└── coverage-user/        # User manager coverage
```

### Legacy and Archive

```bash
archive/                   # Legacy files and deprecated content
├── .continue/            # Old continuation data
├── wiki.conf/            # Old configuration files
└── temp_review/          # Temporary review files
```

## Directory Purposes

### Source Code (`src/`)

The `src/` directory contains all application source code, organized by functional responsibility:

- __`core/`__: Core engine components and base classes
- __`managers/`__: Business logic managers (PageManager, UserManager, etc.)
- __`routes/`__: HTTP route handlers and API endpoints
- __`utils/`__: Utility functions and helpers

### Configuration (`config/`)

Contains application configuration files:

- __`Config.js`__: Main application configuration with validation
- Environment-specific overrides
- Manager-specific settings

### Static Assets (`public/`)

Web-accessible static files:

- __`css/`__: Stylesheets
- __`js/`__: Client-side JavaScript
- __`images/`__: Static images and assets

### Templates (`views/`)

Server-side templates using EJS:

- __`*.ejs`__: Page templates
- __`admin-*.ejs`__: Admin interface templates
- __`edit.ejs`__: Page editing interface

### Documentation (`docs/`)

Comprehensive documentation organized by purpose:

- __`architecture/`__: System design and technical architecture
- __`development/`__: Development processes and coding standards
- __`planning/`__: Project planning and feature roadmaps
- __`api/`__: API documentation and specifications
- __`issues/`__: Known issues and troubleshooting guides

### Runtime Data (Gitignored)

These directories contain runtime-generated data that should not be version controlled:

- __`data/`__: Application state data (notifications, cache, etc.)
- __`logs/`__: Application logs and debugging information
- __`pages/`__: User-generated wiki content
- __`users/`__: User account and session data
- __`attachments/`__: User-uploaded files
- __`exports/`__: Generated export files
- __`reports/`__: Test coverage and analysis reports

## File Naming Conventions

### Source Files

- __PascalCase__ for classes: `WikiEngine.js`, `PageManager.js`
- __camelCase__ for utilities: `logger.js`, `scripts/version.js`
- __kebab-case__ for config: `Config.js`

### Documentation Files

- __SCREAMING_SNAKE_CASE__ for major docs: `README.md`, `CHANGELOG.md`
- __Title Case__ for feature docs: `Notification Enhancement.md`
- __Descriptive names__ with clear purpose

### Directory Names

- __lowercase__ for technical directories: `src/`, `config/`, `public/`
- __hyphen-separated__ for complex names: `test-coverage/`
- __Purpose-driven__ naming: `user-management/`, `content-validation/`

## Gitignore Strategy

The `.gitignore` file is strategically organized to exclude:

1. __Runtime Data__: Files generated during application execution
2. __User Content__: User-generated wiki pages and uploads
3. __Development Artifacts__: Coverage reports, logs, temporary files
4. __Environment-Specific__: Files that differ between environments

### Key Ignore Patterns

```gitignore
# Runtime data (never commit)
pages/
users/
attachments/
exports/
data/
logs/
reports/

# Development artifacts
coverage/
*.log
node_modules/

# Environment files
.env
.env.*
```

## Development Workflow

### Adding New Features

1. __Source Code__: Add to appropriate `src/` subdirectory
2. __Configuration__: Update `config/Config.js` if needed
3. __Documentation__: Add to relevant `docs/` subdirectory
4. __Tests__: Add to `tests/` directory
5. __Scripts__: Add utilities to `scripts/` directory

### File Organization Guidelines

1. __Keep related files together__: Group by feature or responsibility
2. __Use consistent naming__: Follow established conventions
3. __Document new directories__: Update this document when adding new directories
4. __Maintain separation__: Keep runtime data separate from source code

## Maintenance

### Regular Cleanup Tasks

1. __Archive old files__: Move deprecated files to `archive/`
2. __Review gitignore__: Ensure new file types are properly ignored
3. __Update documentation__: Keep this document current with structure changes
4. __Consolidate similar directories__: Merge related directories when appropriate

### Directory Size Monitoring

- __`logs/`__: Monitor log file sizes, implement rotation
- __`data/`__: Monitor application data growth
- __`attachments/`__: Monitor upload storage usage
- __`reports/`__: Clean up old coverage reports

## Related Documentation

- [CONTRIBUTING.md](../development/CONTRIBUTING.md) - Development guidelines
- [ARCHITECTURE-PAGE-CLASSIFICATION.md](ARCHITECTURE-PAGE-CLASSIFICATION.md) - Page classification system
- [ROADMAP.md](../planning/ROADMAP.md) - Project planning and vision
- [CHANGELOG.md](../CHANGELOG.md) - Version history and changes```</content>
<parameter name="filePath">```/Volumes/hd3/GitHub/ngdpbase/docs/architecture/PROJECT-STRUCTURE.md
