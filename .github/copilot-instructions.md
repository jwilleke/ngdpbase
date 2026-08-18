# ngdpbase AI Coding Agent Instructions

__READ [AGENTS.md](../AGENTS.md) FIRST__ - Comprehensive AI agent context for the project.

When running terminal commands, ensure the shell sources ~/.bash_profile or equivalent to include /usr/local/bin in PATH for npm/Node tools.

## Key Documentation

- [AGENTS.md](../AGENTS.md) - AI agent context and project coordination
- [CONTRIBUTING.md](../CONTRIBUTING.md) - Development workflow and standards
- [SERVER.md](../SERVER.md) - Server management and configuration
- [docs/SEMVER.md](../docs/SEMVER.md) - Semantic versioning guidelines
- [docs/architecture/Policies-Roles-Permissions.md](../docs/architecture/Policies-Roles-Permissions.md) - Authorization and ACL patterns

## Architecture Overview

__ngdpbase__ is a JSPWiki-inspired file-based wiki built with Node.js/Express following a modular manager pattern. Pages are stored as Markdown files with YAML frontmatter.

Key patterns: Manager-based architecture (23 managers), WikiContext for request context, Provider pattern for storage abstraction, WikiDocument DOM pipeline for parsing.

See [AGENTS.md](../AGENTS.md) for detailed architecture patterns and tech stack.
