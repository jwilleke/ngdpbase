# Semantic Versioning Implementation

This document outlines the semantic versioning implementation for ngdpbase.

## Overview

The project now follows [Semantic Versioning 2.0.0](https://semver.org/) specification:

__Format__: MAJOR.MINOR.PATCH

- __MAJOR__: Incompatible API changes
- __MINOR__: Backward-compatible functionality additions
- __PATCH__: Backward-compatible bug fixes

## Current Version

__Version__: 1.2.0 (as of September 7, 2025)

This represents a MINOR version increment from the baseline due to significant new features:

- Advanced search system
- Enhanced authentication
- UI/UX improvements
- JSPWiki-style functionality

## Tools Implemented

### 1. Version Management Script (`scripts/version.js`)

__Usage__:

```bash
node scripts/version.js                    # Show current version
node scripts/version.js patch              # Increment patch version
node scripts/version.js minor              # Increment minor version
node scripts/version.js major              # Increment major version
node scripts/version.js set <version>      # Set specific version
node scripts/version.js help               # Show help
```

### 2. NPM Scripts

Added to `package.json`:

```json
{
  "scripts": {
    "version:show": "node scripts/version.js",
    "version:patch": "node scripts/version.js patch",
    "version:minor": "node scripts/version.js minor",
    "version:major": "node scripts/version.js major",
    "version:help": "node scripts/version.js help"
  }
}
```

### 3. Enhanced Package.json

Updated with:

- Proper semantic version (1.2.0)
- Descriptive project description
- Correct main entry point
- Version management scripts

### 4. Semantic Versioning in Changelog

The `CHANGELOG.md` now follows [Keep a Changelog](https://keepachangelog.com/) format with:

- Proper version headers with dates
- Version type indicators (MAJOR/MINOR/PATCH)
- Semantic versioning guide
- [Unreleased] section for future changes

## Version History

- __1.2.0__ (2025-09-07): MINOR - Advanced search system, enhanced authentication, UI improvements
- __1.1.0__ (2025-08-01): MINOR - Basic feature set with authentication and templates  
- __1.0.0__ (2025-07-01): MAJOR - Initial release

## Automation Features

The version management script automatically:

1. __Updates package.json__ with new version
2. __Updates CHANGELOG.md__ with release information
3. __Validates version format__ to ensure SemVer compliance
4. __Provides guidance__ on version type selection
5. __Shows warnings__ for major version bumps

## Usage Guidelines

### When to increment versions

__PATCH (1.2.0 → 1.2.1)__:

- Bug fixes
- Documentation updates
- Performance improvements (no API changes)
- Internal refactoring

__MINOR (1.2.0 → 1.3.0)__:

- New features
- New API methods/endpoints
- Enhanced functionality
- Backward-compatible changes

__MAJOR (1.2.0 → 2.0.0)__:

- Breaking API changes
- Removed functionality
- Incompatible changes
- Architecture overhauls

## Best Practices

1. __Always update CHANGELOG.md__ before releasing
2. __Test thoroughly__ before version increments
3. __Document breaking changes__ for major versions
4. __Use descriptive commit messages__ referencing version changes
5. __Tag releases__ in Git with version numbers

## Examples

```bash
# After fixing a bug
npm run version:patch

# After adding search filters feature  
npm run version:minor

# After changing authentication API
npm run version:major

# Set specific version for hotfix
node scripts/version.js set 1.2.1
```

## Integration with Development Workflow

1. __Feature Development__: Work on features in branches
2. __Testing__: Ensure all features work before versioning
3. __Documentation__: Update changelog with changes
4. __Version Increment__: Use appropriate version bump
5. __Release__: Tag and deploy the new version

This semantic versioning implementation provides clear version management and helps users understand the impact of updates.
