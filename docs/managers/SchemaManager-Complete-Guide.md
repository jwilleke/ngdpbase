# SchemaManager Complete Guide

__Module:__ `src/managers/SchemaManager.js`
__Quick Reference:__ [SchemaManager.md](SchemaManager.md)
__Generated API:__ [API Docs](../api/generated/src/managers/SchemaManager/README.md)

---

## Table of Contents

1. [Architecture](#architecture)
2. [Initialization](#initialization)
3. [Configuration](#configuration)
4. [Schema Loading](#schema-loading)
5. [API Reference](#api-reference)
6. [Creating Schemas](#creating-schemas)
7. [Integration Examples](#integration-examples)

---

## Architecture

```text
┌─────────────────────────────────────────────────────────┐
│                    SchemaManager                         │
│  - initialize()                                          │
│  - getSchema(name)                                       │
│  - getAllSchemaNames()                                   │
└────────────────┬────────────────────────────────────────┘
                 │
         ┌───────┼───────┐
         ▼       ▼       ▼
┌─────────────┐ ┌──────────────┐ ┌──────────────┐
│ ConfigMgr   │ │ schemas/     │ │ Validation   │
│ (path)      │ │ (files)      │ │ Manager      │
└─────────────┘ └──────────────┘ └──────────────┘
```

### Properties

| Property | Type | Description |
| ---------- | ------ | ------------- |
| `schemas` | `Map<string, Object>` | Loaded JSON schemas by name |

---

## Initialization

```javascript
async initialize() {
  const configManager = this.engine.getManager('ConfigurationManager');
  if (!configManager) {
    throw new Error('SchemaManager requires ConfigurationManager to be initialized.');
  }

  const schemasDir = configManager.getProperty('ngdpbase.directories.schemas');

  const files = await fs.readdir(schemasDir);
  for (const file of files) {
    if (file.endsWith('.schema.json')) {
      const schemaName = path.basename(file, '.schema.json');
      const schema = await fs.readJson(path.join(schemasDir, file));
      this.schemas.set(schemaName, schema);
    }
  }
}
```

__Requirements:__

- ConfigurationManager must be initialized first
- Schema directory must be configured

__Error handling:__

- Missing directory: Logs warning, continues with no schemas
- Read errors: Logs error, continues with partial schemas

---

## Configuration

| Property | Type | Description |
| ---------- | ------ | ------------- |
| `ngdpbase.directories.schemas` | string | Directory containing schema files |

Default location: `./schemas`

---

## Schema Loading

### File Requirements

Schema files must:

- Be in the configured schemas directory
- Have `.schema.json` extension
- Contain valid JSON Schema

### Loading Process

1. Read directory contents
2. Filter for `*.schema.json` files
3. Extract name by removing `.schema.json` suffix
4. Parse JSON and store in Map

### Example Schema File

__schemas/page.schema.json:__

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://ngdpbase.org/schemas/page.schema.json",
  "title": "Wiki Page",
  "type": "object",
  "required": ["title", "content"],
  "properties": {
    "title": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "content": {
      "type": "string"
    },
    "uuid": {
      "type": "string",
      "format": "uuid"
    },
    "system-category": {
      "type": "string"
    },
    "user-keywords": {
      "type": "array",
      "items": { "type": "string" }
    }
  }
}
```

---

## API Reference

### getSchema(name)

Retrieve a loaded JSON schema by name.

```javascript
getSchema(name)
```

__Parameters:__

- `name` - Schema name (without `.schema.json` extension)

__Returns:__ `Object|undefined` - JSON Schema object or undefined

__Example:__

```javascript
const pageSchema = schemaManager.getSchema('page');
if (pageSchema) {
  // Use schema for validation
}
```

---

### getAllSchemaNames()

Get list of all loaded schema names.

```javascript
getAllSchemaNames()
```

__Returns:__ `string[]` - Array of schema names

__Example:__

```javascript
const names = schemaManager.getAllSchemaNames();
// ['page', 'user', 'config', 'attachment']
```

---

## Creating Schemas

### JSON Schema Basics

ngdpbase uses JSON Schema Draft-07. Key properties:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "unique-identifier",
  "title": "Human-readable title",
  "description": "What this schema validates",
  "type": "object",
  "required": ["field1", "field2"],
  "properties": {
    "field1": { "type": "string" },
    "field2": { "type": "number" }
  }
}
```

### Common Patterns

__String with constraints:__

```json
{
  "title": {
    "type": "string",
    "minLength": 1,
    "maxLength": 200,
    "pattern": "^[A-Za-z0-9 -]+$"
  }
}
```

__Enum values:__

```json
{
  "status": {
    "type": "string",
    "enum": ["draft", "published", "archived"]
  }
}
```

__Array of strings:__

```json
{
  "tags": {
    "type": "array",
    "items": { "type": "string" },
    "uniqueItems": true
  }
}
```

__Date format:__

```json
{
  "createdAt": {
    "type": "string",
    "format": "date-time"
  }
}
```

---

## Integration Examples

### With ValidationManager

```javascript
const schemaManager = engine.getManager('SchemaManager');
const validationManager = engine.getManager('ValidationManager');

// ValidationManager uses SchemaManager internally
const result = validationManager.validate(pageData, 'page');

if (!result.valid) {
  console.log('Validation errors:', result.errors);
}
```

### Direct Schema Usage

```javascript
const Ajv = require('ajv');
const schemaManager = engine.getManager('SchemaManager');

const ajv = new Ajv();
const pageSchema = schemaManager.getSchema('page');
const validate = ajv.compile(pageSchema);

const valid = validate(pageData);
if (!valid) {
  console.log(validate.errors);
}
```

### Admin Schema Listing

```javascript
app.get('/admin/schemas', (req, res) => {
  const schemaManager = engine.getManager('SchemaManager');
  const schemas = schemaManager.getAllSchemaNames().map(name => ({
    name,
    schema: schemaManager.getSchema(name)
  }));
  res.json(schemas);
});
```

---

## Notes

- __ConfigurationManager required:__ Must be initialized first
- __Lazy loading:__ Schemas loaded once at initialization
- __No hot reload:__ Schema changes require restart
- __Draft-07:__ Uses JSON Schema Draft-07 specification

---

## Related Documentation

- [SchemaManager.md](SchemaManager.md) - Quick reference
- [ValidationManager](ValidationManager.md) - Schema-based validation
- [ConfigurationManager](ConfigurationManager.md) - Configuration access
- [JSON Schema Spec](https://json-schema.org/draft-07/json-schema-release-notes.html) - JSON Schema Draft-07
