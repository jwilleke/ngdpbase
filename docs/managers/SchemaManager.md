---
name: SchemaManager
description: "JSON Schema registration and validation for typed entities (Person, Organization, etc.)"
dateModified: '2026-05-14'
category: managers
code: src/managers/SchemaManager.ts
---

# SchemaManager

**Module:** `src/managers/SchemaManager.ts`
**Extends:** [BaseManager](BaseManager.md)
**Complete Guide:** [SchemaManager-Complete-Guide.md](SchemaManager-Complete-Guide.md)

---

## Overview

SchemaManager loads and provides access to JSON schemas used throughout ngdpbase for validating page metadata, configuration files, and other structured data.

## Key Features

- Load JSON Schema files from configured directory
- Provide schema access by name
- List all available schemas
- Integration with ValidationManager for data validation

## Quick Example

```javascript
const schemaManager = engine.getManager('SchemaManager');

// Get a specific schema
const pageSchema = schemaManager.getSchema('page');

// List all loaded schemas
const schemaNames = schemaManager.getAllSchemaNames();
// ['page', 'user', 'config', ...]

// Use with ValidationManager
const validationManager = engine.getManager('ValidationManager');
const result = validationManager.validate(pageData, 'page');
```

## Schema File Naming

Schemas must follow the naming pattern: `{name}.schema.json`

Examples:

- `page.schema.json` → accessed as `'page'`
- `user.schema.json` → accessed as `'user'`
- `config.schema.json` → accessed as `'config'`

## Configuration

```json
{
  "ngdpbase.directories.schemas": "./schemas"
}
```

## Related Managers

- [ValidationManager](ValidationManager.md) - Uses schemas for validation
- [ConfigurationManager](ConfigurationManager.md) - Provides schema directory path

## Developer Documentation

For complete API reference, see:

- [SchemaManager-Complete-Guide.md](SchemaManager-Complete-Guide.md)
- [Generated API Docs](../api/generated/src/managers/SchemaManager/README.md)
