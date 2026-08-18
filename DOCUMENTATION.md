# Documentation

Complete documentation for ngdpbase is organized in the `docs/` directory. This file provides high-level reference to all available documentation.

## Project Documentation Structure

### Root Level Files (This Directory)

- __[README.md](./README.md)__ - Project overview and quick start
- __[AGENTS.md](./AGENTS.md)__ - AI agent context and project status
- __[ARCHITECTURE.md](./ARCHITECTURE.md)__ - System architecture and design patterns
- __[CODE_STANDARDS.md](./CODE_STANDARDS.md)__ - Coding standards and best practices
- __[CONTRIBUTING.md](./CONTRIBUTING.md)__ - Development workflow and guidelines
- __[SECURITY.md](./SECURITY.md)__ - Security practices and policies
- __[CHANGELOG.md](./CHANGELOG.md)__ - Version history and release notes
- __[CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)__ - Community guidelines

## Detailed Documentation

See [docs/](./docs/) directory for comprehensive documentation on:

### Developer Documentation Index

__[docs/Developer-Documentation.md](./docs/Developer-Documentation.md)__ - Complete index of all developer documentation:

- 18 Managers (quick reference + complete guides)
- 12 Plugins (developer + user guides)
- 5 Providers (storage and services)
- Architecture patterns and design documents
- Testing guides and strategies
- API reference (auto-generated)

### Documentation by Category

- __[docs/managers/](./docs/managers/)__ - Manager documentation (18 managers)
  - Quick reference guides (~100-200 lines each)
  - Complete guides (~500-1000+ lines each)
  - PageManager, RenderingManager, UserManager, ConfigurationManager, etc.

- __[docs/plugins/](./docs/plugins/)__ - Plugin documentation (12 plugins)
  - Developer implementation guides
  - User-facing documentation
  - CurrentTimePlugin, ImagePlugin, SearchPlugin, etc.

- __[docs/architecture/](./docs/architecture/)__ - Architecture patterns (15+ documents)
  - Manager-based architecture overview
  - WikiDocument DOM pipeline
  - Policies, roles, and permissions
  - Storage providers
  - Rendering pipeline

- __[docs/planning/](./docs/planning/)__ - Project planning
  - TODO.md - Current tasks and priorities
  - ROADMAP.md - Long-term vision and milestones

- __[docs/testing/](./docs/testing/)__ - Testing documentation
  - Testing-Summary.md - Current test status
  - Complete-Testing-Guide.md - Comprehensive guide
  - PREVENTING-REGRESSIONS.md - Regression prevention

- __[docs/migration/](./docs/migration/)__ - Migration guides
  - Upgrade instructions
  - Breaking changes
  - Data migration procedures

- __[docs/api/](./docs/api/)__ - API documentation
  - Auto-generated TypeDoc reference
  - REST API reference
  - Configuration API

## Installation & Setup

For first-time installation:

1. Read [README.md](./README.md) for overview
2. See [docs/INSTALLATION-SYSTEM.md](./docs/INSTALLATION-SYSTEM.md) for installation wizard
3. Check [docs/SETUP.md](./docs/SETUP.md) for environment setup

## Development

For developers contributing to ngdpbase:

1. Start with [CONTRIBUTING.md](./CONTRIBUTING.md)
2. Review [ARCHITECTURE.md](./ARCHITECTURE.md) for system design
3. Study [CODE_STANDARDS.md](./CODE_STANDARDS.md) for coding practices
4. Read [docs/developer/](./docs/developer/) for specific guides

## Deployment

For operations and deployment:

1. See [docs/SERVER.md](./docs/SERVER.md) for server management
2. Review [docs/SERVER-MANAGEMENT.md](./docs/SERVER-MANAGEMENT.md) for best practices
3. Check [SECURITY.md](./SECURITY.md) for security configuration

## Project Status & History

- __Current Status__: See [AGENTS.md](./AGENTS.md) - "Current Status" section
- __Release History__: See [CHANGELOG.md](./CHANGELOG.md)
- __Work History__: See [docs/project_log.md](./docs/project_log.md)
- __Tasks & Priorities__: See [docs/planning/TODO.md](./docs/planning/TODO.md)
- __Roadmap__: See [docs/planning/ROADMAP.md](./docs/planning/ROADMAP.md)

## Quick Links

### For New Users

- [README.md](./README.md) - What is ngdpbase?
- [docs/INSTALLATION-SYSTEM.md](./docs/INSTALLATION-SYSTEM.md) - Getting started
- Help & Support - See README.md

### For Developers

- __[docs/Developer-Documentation.md](./docs/Developer-Documentation.md)__ - Complete developer doc index
- [CONTRIBUTING.md](./CONTRIBUTING.md) - How to contribute
- [ARCHITECTURE.md](./ARCHITECTURE.md) - How it's built
- [CODE_STANDARDS.md](./CODE_STANDARDS.md) - How to code
- [docs/managers/](./docs/managers/) - Manager documentation
- [docs/plugins/](./docs/plugins/) - Plugin documentation

### For Operations

- [docs/SERVER.md](./docs/SERVER.md) - Running ngdpbase
- [docs/SERVER-MANAGEMENT.md](./docs/SERVER-MANAGEMENT.md) - Best practices
- [SECURITY.md](./SECURITY.md) - Security setup

### For Maintainers

- [AGENTS.md](./AGENTS.md) - Project context
- [CHANGELOG.md](./CHANGELOG.md) - Version management
- [docs/project_log.md](./docs/project_log.md) - Work history
- [docs/planning/TODO.md](./docs/planning/TODO.md) - Current tasks

## Key Technologies & References

### Core Stack

- __Node.js v18+__ - JavaScript runtime
- __Express.js 5.x__ - Web framework
- __PM2__ - Process manager
- __EJS__ - Template engine
- __Bootstrap 5__ - UI framework

### Storage & Processing

- __Markdown__ - Content format
- __YAML Frontmatter__ - Metadata
- __Showdown__ - Markdown parser
- __JSPWiki Syntax__ - Wiki syntax compatibility
- __linkedom__ - DOM implementation

### Development Tools

- __Jest__ - Testing framework
- __TypeScript__ - Type system (progressive migration)
- __Prettier__ - Code formatter
- __markdownlint__ - Documentation linter

## Documentation Standards

All documentation in this project follows these standards:

- __Markdown format__ - Using CommonMark specification
- __Clear hierarchy__ - H1 title, H2 major sections
- __Links__ - Relative links between documents
- __Code examples__ - Syntax highlighted with language tags
- __Tables__ - For structured information
- __Lists__ - For sequential and grouped information

## File Organization

```
ngdpbase/
├── README.md                           # Project overview
├── AGENTS.md                           # AI context
├── ARCHITECTURE.md                     # System design
├── CODE_STANDARDS.md                   # Coding standards
├── CONTRIBUTING.md                     # Development workflow
├── SECURITY.md                         # Security policies
├── CHANGELOG.md                        # Release history
├── CODE_OF_CONDUCT.md                  # Community guidelines
│
├── docs/                               # Detailed documentation
│   ├── project_log.md                  # Work history
│   ├── INSTALLATION-SYSTEM.md          # Setup wizard docs
│   ├── INSTALLATION-TESTING-RESULTS.md # Test results
│   ├── SERVER.md                       # Server management
│   ├── SERVER-MANAGEMENT.md            # Best practices
│   ├── architecture/                   # Architecture docs (15+)
│   ├── developer/                      # Developer guides
│   ├── planning/                       # Planning & roadmap
│   ├── testing/                        # Testing guides
│   ├── api/                            # API documentation
│   ├── migration/                      # Migration guides
│   └── ...                             # Other detailed docs
│
└── src/                                # Source code
    └── ...                             # Implementation
```

## Getting Help

- __Questions?__ Check the relevant documentation above
- __Found a bug?__ See [CONTRIBUTING.md](./CONTRIBUTING.md) for issue reporting
- __Want to contribute?__ See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines
- __Security concern?__ See [SECURITY.md](./SECURITY.md)

## Related Files

- [.github/](./github/) - GitHub templates and workflows
- [config/](./config/) - Configuration file examples
- [scripts/](./scripts/) - Utility scripts
