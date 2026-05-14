---
name: ValidationManager
description: The ValidationManager is ngdpbase's central system for ensuring data integrity and consistency across the wiki's file-based storage. It enforces UUID-based naming conventions, validates YAML frontm…
dateModified: '2026-05-14'
category: managers
code: src/managers/ValidationManager.ts
---

# ValidationManager Documentation

## Overview

The ValidationManager is ngdpbase's central system for ensuring data integrity and consistency across the wiki's file-based storage. It enforces UUID-based naming conventions, validates YAML frontmatter metadata, and provides utilities for generating compliant files. This manager is crucial for maintaining architectural consistency and preventing malformed content from entering the system.

## Architecture

The ValidationManager follows JSPWiki's manager pattern with clean separation between:

- **Filename Validation**: Enforces UUID v4 naming convention for all wiki pages
- **Metadata Validation**: Ensures YAML frontmatter contains required fields with proper formats
- **Content Validation**: Optional checks for content structure and quality
- **Fix Generation**: Automatic suggestions for correcting validation issues
- **Metadata Generation**: Utilities for creating properly formatted metadata

## Core Responsibilities

### 1. UUID Naming Convention

All wiki pages must follow the format: `{uuid}.md` where UUID is a valid RFC 4122 version 4 UUID.

**Example Valid Filenames:**

- `3463c02f-5c84-4a42-a574-a56077ff8162.md`
- `749e0fc7-0f71-483a-ab80-538d9c598352.md`

**Example Invalid Filenames:**

- `MyPage.md` (not a UUID)
- `3463c02f-5c84-4a42-a574-a56077ff8162.txt` (wrong extension)
- `invalid-uuid-format.md` (invalid UUID)

### 2. Required Metadata Fields

Every page must include these YAML frontmatter fields:

| Field | Type | Description | Validation Rules |
| ------- | ------ | ------------- | ------------------ |
| `title` | string | Page display title | Non-empty string |
| `uuid` | string | Unique identifier | Valid RFC 4122 UUID v4 |
| `slug` | string | URL-safe identifier | Lowercase, alphanumeric, hyphens only: `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` |
| `system-category` | string | System category | Must match valid category list (case-insensitive warning) |
| `user-keywords` | array | User-defined tags | Array of non-empty strings, max 5 items (configurable) |
| `lastModified` | string | Last modification timestamp | Valid ISO 8601 date string |

### 3. System Categories

System categories are now configurable via `app-default-config.json` under `ngdpbase.system-category`. Each category has:

| Property | Type | Description |
| ---------- | ------ | ------------- |
| `label` | string | Display name for the category |
| `description` | string | Human-readable description |
| `default` | boolean | Whether this is the default category |
| `storageLocation` | string | Where pages go: `regular` (/pages) or `required` (/required-pages) |
| `enabled` | boolean | Whether the category is active |

**Default System Categories:**

- `general` - General wiki pages (default, regular storage)
- `system` - System configuration and administrative pages (required storage)
- `documentation` - User documentation (regular storage)
- `user` - User-generated content (regular storage)
- `test` - Testing pages (regular storage)
- `developer` - Developer documentation (regular storage)

Custom categories can be added to configuration. Categories not in the configuration will generate validation warnings (but are still allowed).

## Configuration

Configuration is loaded from ConfigurationManager via `config/app-default-config.json` and `data/config/app-custom-config.json`:

### Basic Configuration

```json
{
  "ngdpbase.maximum.user-keywords": 5,
  "ngdpbase.default.system-category": "general"
}
```

### System Categories Configuration

```json
{
  "ngdpbase.system-category": {
    "general": {
      "label": "General",
      "description": "General wiki pages",
      "default": true,
      "storageLocation": "regular",
      "enabled": true
    },
    "system": {
      "label": "System",
      "description": "System configuration and infrastructure pages",
      "default": false,
      "storageLocation": "required",
      "enabled": true
    },
    "documentation": {
      "label": "Documentation",
      "description": "User and technical documentation",
      "default": false,
      "storageLocation": "regular",
      "enabled": true
    }
  }
}
```

**Configuration Properties:**

- `label` (string, required) - Display name used in metadata validation
- `description` (string, optional) - Human-readable description
- `default` (boolean, optional) - Mark as default category (only one should be true)
- `storageLocation` (string, optional) - `regular` for /pages or `required` for /required-pages
- `enabled` (boolean, optional) - Set to false to disable category

**Adding Custom Categories:**
To add a custom category, add it to `app-custom-config.json`:

```json
{
  "ngdpbase.system-category": {
    "custom-category": {
      "label": "Custom Category",
      "description": "My custom category",
      "default": false,
      "storageLocation": "regular",
      "enabled": true
    }
  }
}
```

The configuration is hierarchical - custom config merges with and overrides default config.

### Programmatic Initialization

```javascript
await validationManager.initialize({
  maxUserKeywords: 5,
  maxCategories: 3
});
```

## Usage

### Basic Validation

#### Validate a Filename

```javascript
const validationManager = engine.getManager('ValidationManager');

const result = validationManager.validateFilename('3463c02f-5c84-4a42-a574-a56077ff8162.md');
if (result.success) {
  console.log('Filename is valid');
} else {
  console.error(`Validation failed: ${result.error}`);
}
```

**Result Object:**

```javascript
{
  success: boolean,
  error: string | null
}
```

#### Validate Metadata

```javascript
const metadata = {
  title: 'My Wiki Page',
  uuid: '3463c02f-5c84-4a42-a574-a56077ff8162',
  slug: 'my-wiki-page',
  'system-category': 'Documentation',
  'user-keywords': ['guide', 'tutorial'],
  lastModified: '2025-10-05T12:00:00.000Z'
};

const result = validationManager.validateMetadata(metadata);
if (result.success) {
  console.log('Metadata is valid');
  if (result.warnings.length > 0) {
    console.warn('Warnings:', result.warnings);
  }
} else {
  console.error(`Validation failed: ${result.error}`);
}
```

**Result Object:**

```javascript
{
  success: boolean,
  error: string | null,
  warnings: string[]
}
```

#### Validate Complete Page

```javascript
const filename = '3463c02f-5c84-4a42-a574-a56077ff8162.md';
const metadata = { /* metadata object */ };
const content = '# My Page\n\nContent here...';

const result = validationManager.validatePage(filename, metadata, content);
if (result.success) {
  console.log('Page is valid');
} else {
  console.error(`Validation failed: ${result.error}`);
}
```

**Result Object:**

```javascript
{
  success: boolean,
  error: string | null,
  warnings: string[],
  filenameValid: boolean,
  metadataValid: boolean
}
```

### Metadata Generation

#### Generate Valid Metadata for New Page

```javascript
const metadata = validationManager.generateValidMetadata('My New Page', {
  'system-category': 'Documentation',
  'user-keywords': ['guide', 'howto']
});

// Result:
{
  title: 'My New Page',
  uuid: 'generated-uuid-v4',
  slug: 'my-new-page',
  'system-category': 'Documentation',
  'user-keywords': ['guide', 'howto'],
  lastModified: '2025-10-05T12:00:00.000Z'
}
```

#### Generate Filename from Metadata

```javascript
const filename = validationManager.generateFilename(metadata);
// Returns: '3463c02f-5c84-4a42-a574-a56077ff8162.md'
```

#### Generate Slug from Title

```javascript
const slug = validationManager.generateSlug('My Amazing Wiki Page!');
// Returns: 'my-amazing-wiki-page'

const slug2 = validationManager.generateSlug('Hello   World---Test');
// Returns: 'hello-world-test'
```

### Validation & Fix Generation

#### Validate Existing File with Fix Suggestions

```javascript
const fs = require('fs-extra');
const matter = require('gray-matter');

const filePath = '/pages/old-page.md';
const fileContent = await fs.readFile(filePath, 'utf8');
const fileData = matter(fileContent);

const result = validationManager.validateExistingFile(filePath, fileData);

if (!result.success) {
  console.error(`Validation failed: ${result.error}`);

  if (result.fixes) {
    console.log('Suggested fixes:');
    if (result.fixes.filename) {
      console.log(`- Rename file to: ${result.fixes.filename}`);
    }
    console.log('- Updated metadata:', result.fixes.metadata);
  }
}
```

#### Generate Fix Suggestions

```javascript
const fixes = validationManager.generateFixSuggestions('old-page.md', {
  title: 'Old Page'
  // Missing: uuid, slug, system-category, user-keywords, lastModified
});

// Result:
{
  filename: '{generated-uuid}.md',
  metadata: {
    title: 'Old Page',
    uuid: '{generated-uuid-v4}',
    slug: 'old-page',
    'system-category': 'general',
    'user-keywords': [],
    lastModified: '2025-10-05T12:00:00.000Z'
  }
}
```

### Content Validation

```javascript
const content = '# My Page\n\nVery short content';

const result = validationManager.validateContent(content);
// Result:
{
  warnings: ['Content is very short (less than 10 characters)']
}
```

## API Reference

### ValidationManager Class

Extends `BaseManager` and provides comprehensive validation services.

#### Properties

##### `requiredMetadataFields: string[]`

Array of required metadata field names:

```javascript
['title', 'uuid', 'slug', 'system-category', 'user-keywords', 'lastModified']
```

##### `validSystemCategories: string[]`

Array of standard system category values:

```javascript
['System', 'System/Admin', 'Documentation', 'General', 'User', 'Test', 'Developer']
```

##### `maxUserKeywords: number`

Maximum allowed user keywords per page (default: 5, configurable via `ngdpbase.maximum.user-keywords`).

##### `maxCategories: number`

Maximum allowed categories per page (default: 3, configurable).

#### Methods

##### `initialize(config?: object): Promise<void>`

Initializes the ValidationManager with configuration from ConfigurationManager.

**Parameters:**

- `config` (optional): Configuration overrides
  - `maxUserKeywords` (number): Max keywords per page
  - `maxCategories` (number): Max categories per page

**Returns:** `Promise<void>`

**Example:**

```javascript
await validationManager.initialize({
  maxUserKeywords: 10,
  maxCategories: 5
});
```

---

##### `validateFilename(filename: string): object`

Validates that a filename follows UUID naming convention.

**Parameters:**

- `filename` (string): The filename to validate (e.g., `'{uuid}.md'`)

**Returns:** Validation result object

```javascript
{
  success: boolean,
  error: string | null
}
```

**Example:**

```javascript
const result = validationManager.validateFilename('3463c02f-5c84-4a42-a574-a56077ff8162.md');
// { success: true, error: null }

const invalid = validationManager.validateFilename('MyPage.md');
// { success: false, error: "Filename 'MyPage.md' does not follow UUID naming convention..." }
```

---

##### `validateMetadata(metadata: object): object`

Validates page metadata contains all required fields with proper values.

**Parameters:**

- `metadata` (object): The metadata object from YAML frontmatter

**Returns:** Validation result object

```javascript
{
  success: boolean,
  error: string | null,
  warnings: string[]
}
```

**Validation Rules:**

- `title`: Non-empty string
- `uuid`: Valid RFC 4122 UUID v4
- `slug`: URL-safe string matching `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`
- `system-category`: String (warning if not in standard list)
- `user-keywords`: Array of non-empty strings, max `maxUserKeywords` items
- `lastModified`: Valid ISO 8601 date string

**Example:**

```javascript
const result = validationManager.validateMetadata({
  title: 'My Page',
  uuid: '3463c02f-5c84-4a42-a574-a56077ff8162',
  slug: 'my-page',
  'system-category': 'Documentation',
  'user-keywords': ['guide'],
  lastModified: '2025-10-05T12:00:00.000Z'
});
// { success: true, error: null, warnings: [] }
```

---

##### `validatePage(filename: string, metadata: object, content?: string): object`

Validates a complete page before saving, including UUID consistency check.

**Parameters:**

- `filename` (string): The target filename
- `metadata` (object): The page metadata
- `content` (string, optional): The page content for optional validation

**Returns:** Comprehensive validation result

```javascript
{
  success: boolean,
  error: string | null,
  warnings: string[],
  filenameValid: boolean,
  metadataValid: boolean
}
```

**Validation Checks:**

1. Filename follows UUID.md convention
2. Metadata contains all required fields
3. UUID in filename matches UUID in metadata
4. Optional content validation (if provided)

**Example:**

```javascript
const result = validationManager.validatePage(
  '3463c02f-5c84-4a42-a574-a56077ff8162.md',
  { title: 'Test', uuid: '3463c02f-5c84-4a42-a574-a56077ff8162', /* ... */ },
  '# Test Page\n\nContent...'
);
```

---

##### `validateContent(content: string): object`

Performs optional content quality checks.

**Parameters:**

- `content` (string): The page content

**Returns:** Content validation result

```javascript
{
  warnings: string[]
}
```

**Checks:**

- Content is non-empty string
- Contains markdown headers (`#`)
- Has sufficient length (≥10 characters)

**Example:**

```javascript
const result = validationManager.validateContent('# Title\n\nContent here...');
// { warnings: [] }

const short = validationManager.validateContent('Hi');
// { warnings: ['Content is very short (less than 10 characters)', 'Content appears to lack markdown headers'] }
```

---

##### `isValidSlug(slug: string): boolean`

Validates slug format (URL-safe).

**Parameters:**

- `slug` (string): The slug to validate

**Returns:** `boolean` - True if valid

**Rules:** Must be lowercase, alphanumeric, and hyphens only: `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`

**Example:**

```javascript
validationManager.isValidSlug('my-wiki-page');  // true
validationManager.isValidSlug('My-Wiki-Page');  // false (uppercase)
validationManager.isValidSlug('my--page');      // false (double hyphen)
validationManager.isValidSlug('-my-page');      // false (leading hyphen)
```

---

##### `generateValidMetadata(title: string, options?: object): object`

Generates properly formatted metadata for a new page with all required fields.

**Parameters:**

- `title` (string): Page title
- `options` (object, optional): Additional metadata options
  - `uuid` (string): Use specific UUID (generates new one if not provided)
  - `slug` (string): Use specific slug (generates from title if not provided)
  - `system-category` (string): System category (uses default if not provided)
  - `user-keywords` (array): User keywords array
  - Any other fields to include in metadata

**Returns:** Complete metadata object

```javascript
{
  title: string,
  uuid: string,
  slug: string,
  'system-category': string,
  'user-keywords': string[],
  lastModified: string
}
```

**Example:**

```javascript
const metadata = validationManager.generateValidMetadata('My New Wiki Page', {
  'system-category': 'Documentation',
  'user-keywords': ['guide', 'tutorial'],
  customField: 'custom value'
});

// Result:
{
  title: 'My New Wiki Page',
  uuid: '3463c02f-5c84-4a42-a574-a56077ff8162',  // auto-generated
  slug: 'my-new-wiki-page',  // auto-generated from title
  'system-category': 'Documentation',
  'user-keywords': ['guide', 'tutorial'],
  lastModified: '2025-10-05T12:00:00.000Z',  // current timestamp
  customField: 'custom value'
}
```

---

##### `generateSlug(title: string): string`

Generates URL-safe slug from title.

**Parameters:**

- `title` (string): Page title

**Returns:** `string` - URL-safe slug

**Transformation Rules:**

1. Convert to lowercase
2. Replace non-alphanumeric characters with hyphens
3. Remove leading/trailing hyphens
4. Collapse multiple consecutive hyphens into single hyphen

**Example:**

```javascript
validationManager.generateSlug('Hello World');           // 'hello-world'
validationManager.generateSlug('My Amazing Page!!!');    // 'my-amazing-page'
validationManager.generateSlug('Test---Multiple Spaces'); // 'test-multiple-spaces'
validationManager.generateSlug('  Trim Me  ');          // 'trim-me'
```

---

##### `generateFilename(metadata: object): string`

Generates UUID-based filename from metadata.

**Parameters:**

- `metadata` (object): Page metadata containing UUID

**Returns:** `string` - Filename in `{uuid}.md` format

**Throws:** Error if metadata.uuid is missing

**Example:**

```javascript
const filename = validationManager.generateFilename({
  uuid: '3463c02f-5c84-4a42-a574-a56077ff8162',
  title: 'My Page'
});
// Returns: '3463c02f-5c84-4a42-a574-a56077ff8162.md'
```

---

##### `validateExistingFile(filePath: string, fileData: object): object`

Validates an existing file and provides fix suggestions if validation fails.

**Parameters:**

- `filePath` (string): Path to the existing file
- `fileData` (object): Object with `content` and `data` properties from gray-matter
  - `content` (string): File content without frontmatter
  - `data` (object): Parsed YAML frontmatter

**Returns:** Validation result with optional fix suggestions

```javascript
{
  success: boolean,
  error: string | null,
  warnings: string[],
  filenameValid: boolean,
  metadataValid: boolean,
  fixes?: {
    filename: string | null,
    metadata: object
  }
}
```

**Example:**

```javascript
const matter = require('gray-matter');
const fileContent = await fs.readFile('/pages/old-page.md', 'utf8');
const fileData = matter(fileContent);

const result = validationManager.validateExistingFile('/pages/old-page.md', fileData);

if (!result.success && result.fixes) {
  console.log('Rename file to:', result.fixes.filename);
  console.log('Update metadata to:', result.fixes.metadata);
}
```

---

##### `getCategoryConfig(label: string): object|null`

Gets system category configuration by label.

**Parameters:**

- `label` (string): Category label (e.g., "General", "System")

**Returns:** Category configuration object or null

```javascript
{
  key: string,           // Category key from config
  label: string,         // Display label
  description: string,   // Category description
  default: boolean,      // Is default category
  storageLocation: string, // 'regular' or 'required'
  enabled: boolean       // Is enabled
}
```

**Example:**

```javascript
const categoryConfig = validationManager.getCategoryConfig('System');
if (categoryConfig) {
  console.log('Storage location:', categoryConfig.storageLocation); // 'required'
  console.log('Description:', categoryConfig.description);
}
```

---

##### `getCategoryStorageLocation(category: string): string`

Gets storage location for a category.

**Parameters:**

- `category` (string): Category label

**Returns:** `string` - Storage location (`'regular'` or `'required'`)

**Example:**

```javascript
const location = validationManager.getCategoryStorageLocation('System');
// Returns: 'required'

const location2 = validationManager.getCategoryStorageLocation('Documentation');
// Returns: 'regular'
```

**Use Case:**

```javascript
const category = metadata['system-category'];
const storageLocation = validationManager.getCategoryStorageLocation(category);

if (storageLocation === 'required') {
  targetPath = path.join(requiredPagesDir, filename);
} else {
  targetPath = path.join(pagesDir, filename);
}
```

---

##### `getAllSystemCategories(): Array<object>`

Gets all enabled system categories with their configuration.

**Parameters:** None

**Returns:** Array of category configuration objects

```javascript
[
  {
    key: 'general',
    label: 'General',
    description: 'General wiki pages',
    default: true,
    storageLocation: 'regular',
    enabled: true
  },
  // ... more categories
]
```

**Example:**

```javascript
const categories = validationManager.getAllSystemCategories();

// Display in UI dropdown
categories.forEach(cat => {
  console.log(`${cat.label}: ${cat.description}`);
});

// Filter by storage location
const requiredCategories = categories.filter(c => c.storageLocation === 'required');
```

---

##### `getDefaultSystemCategory(): string`

Gets the default system category label.

**Parameters:** None

**Returns:** `string` - Default category label (e.g., "General")

**Example:**

```javascript
const defaultCategory = validationManager.getDefaultSystemCategory();
// Returns: 'General'

// Use in metadata generation
const metadata = {
  title: 'New Page',
  'system-category': validationManager.getDefaultSystemCategory(),
  // ...
};
```

---

##### `generateFixSuggestions(filename: string, metadata: object): object`

Generates suggestions to fix validation issues in existing pages.

**Parameters:**

- `filename` (string): Current filename
- `metadata` (object): Current metadata

**Returns:** Fix suggestions object

```javascript
{
  filename: string | null,  // Suggested new filename (if change needed)
  metadata: object          // Complete corrected metadata
}
```

**Fix Logic:**

- Generates new UUID if missing or invalid
- Creates filename matching UUID
- Generates slug from title if missing
- Sets default system-category if missing
- Initializes empty user-keywords array if missing
- Sets current timestamp for lastModified if missing
- Uses filename as title fallback if title missing

**Example:**

```javascript
const fixes = validationManager.generateFixSuggestions('old-name.md', {
  title: 'Old Page'
  // Missing: uuid, slug, system-category, user-keywords, lastModified
});

// Result:
{
  filename: '3463c02f-5c84-4a42-a574-a56077ff8162.md',  // new UUID-based filename
  metadata: {
    title: 'Old Page',
    uuid: '3463c02f-5c84-4a42-a574-a56077ff8162',
    slug: 'old-page',
    'system-category': 'general',
    'user-keywords': [],
    lastModified: '2025-10-05T12:00:00.000Z'
  }
}
```

## Integration with Other Managers

### PageManager Integration

PageManager should use ValidationManager before creating or updating pages:

```javascript
const pageManager = engine.getManager('PageManager');
const validationManager = engine.getManager('ValidationManager');
const path = require('path');

async function createPage(title, content, options) {
  // Generate valid metadata
  const metadata = validationManager.generateValidMetadata(title, options);

  // Generate filename
  const filename = validationManager.generateFilename(metadata);

  // Validate before saving
  const validation = validationManager.validatePage(filename, metadata, content);

  if (!validation.success) {
    throw new Error(`Page validation failed: ${validation.error}`);
  }

  // Determine storage location based on category
  const category = metadata['system-category'];
  const storageLocation = validationManager.getCategoryStorageLocation(category);

  let targetPath;
  if (storageLocation === 'required') {
    targetPath = path.join(requiredPagesDir, filename);
  } else {
    targetPath = path.join(pagesDir, filename);
  }

  // Save via PageManager
  await pageManager.savePage(targetPath, { metadata, content });
}
```

**Category-Based Storage Example:**

```javascript
// System pages go to /required-pages
const systemMetadata = validationManager.generateValidMetadata('System Config', {
  'system-category': 'System'
});
const systemLocation = validationManager.getCategoryStorageLocation('System');
console.log(systemLocation); // 'required'

// General pages go to /pages
const generalMetadata = validationManager.generateValidMetadata('My Page', {
  'system-category': 'General'
});
const generalLocation = validationManager.getCategoryStorageLocation('General');
console.log(generalLocation); // 'regular'
```

### ConfigurationManager Integration

ValidationManager reads configuration from ConfigurationManager:

```javascript
const configManager = engine.getManager('ConfigurationManager');

// Configure in app-custom-config.json:
{
  "ngdpbase": {
    "maximum": {
      "user-keywords": 10
    },
    "default": {
      "system-category": "Documentation"
    }
  }
}
```

## Validation Workflow

### Creating New Pages

```
1. User provides title and options
2. ValidationManager.generateValidMetadata(title, options)
3. ValidationManager.generateFilename(metadata)
4. ValidationManager.validatePage(filename, metadata, content)
5. If valid: PageManager.savePage()
6. If invalid: Display errors and prevent save
```

### Migrating Existing Pages

```
1. Read existing file with gray-matter
2. ValidationManager.validateExistingFile(path, fileData)
3. If invalid:
   - Get fix suggestions from result.fixes
   - Rename file to result.fixes.filename
   - Update metadata to result.fixes.metadata
   - Save corrected page
4. If valid: No action needed
```

### Bulk Validation

```javascript
async function validateAllPages() {
  const pageManager = engine.getManager('PageManager');
  const validationManager = engine.getManager('ValidationManager');
  const matter = require('gray-matter');

  const pages = await pageManager.getAllPages();
  const results = [];

  for (const page of pages) {
    const filePath = pageManager.getPagePath(page);
    const fileContent = await fs.readFile(filePath, 'utf8');
    const fileData = matter(fileContent);

    const result = validationManager.validateExistingFile(filePath, fileData);

    if (!result.success) {
      results.push({
        page: page,
        error: result.error,
        fixes: result.fixes
      });
    }
  }

  return results;
}
```

## Error Handling

### Common Validation Errors

| Error | Cause | Solution |
| ------- | ------- | ---------- |
| `Filename does not follow UUID naming convention` | Filename is not a valid UUID | Rename file using `generateFilename()` |
| `UUID mismatch` | Filename UUID ≠ metadata UUID | Update filename or metadata UUID to match |
| `Required metadata field 'X' is missing` | Missing required field in YAML | Add missing field using `generateValidMetadata()` |
| `uuid must be a valid RFC 4122 UUID v4` | Invalid UUID format | Generate new UUID with `uuidv4()` |
| `slug must be a URL-safe string` | Invalid slug format | Use `generateSlug()` to create valid slug |
| `Maximum N user keywords are allowed` | Too many keywords | Reduce keywords array to max allowed |

### Validation Result Patterns

#### Success with Warnings

```javascript
{
  success: true,
  error: null,
  warnings: ['System category "Custom" is not in the standard list...']
}
```

#### Failure with Error

```javascript
{
  success: false,
  error: "Required metadata field 'uuid' is missing",
  warnings: []
}
```

## Best Practices

1. **Always Validate Before Saving**

   ```javascript
   const validation = validationManager.validatePage(filename, metadata, content);
   if (!validation.success) {
     throw new Error(validation.error);
   }
   await pageManager.savePage(filename, pageData);
   ```

2. **Use Metadata Generation for New Pages**

   ```javascript
   // DON'T manually create metadata
   const metadata = { title: 'New Page', uuid: generateUUID(), /* ... */ };

   // DO use generateValidMetadata
   const metadata = validationManager.generateValidMetadata('New Page', options);
   ```

3. **Handle Warnings Appropriately**

   ```javascript
   if (result.warnings.length > 0) {
     console.warn('Validation warnings:', result.warnings);
     // Log or notify but allow operation to continue
   }
   ```

4. **Use Fix Suggestions for Migration**

   ```javascript
   if (!result.success && result.fixes) {
     // Apply automated fixes
     await renameFile(oldPath, result.fixes.filename);
     await updateMetadata(result.fixes.metadata);
   }
   ```

5. **Validate in Development/Testing**

   ```javascript
   if (process.env.NODE_ENV === 'development') {
     const validation = validationManager.validatePage(filename, metadata);
     if (!validation.success) {
       throw new Error(`DEV: Validation failed - ${validation.error}`);
     }
   }
   ```

## Testing

### Unit Test Example

```javascript
const ValidationManager = require('./ValidationManager');
const WikiEngine = require('../WikiEngine');

describe('ValidationManager', () => {
  let engine, validationManager;

  beforeAll(async () => {
    engine = new WikiEngine();
    await engine.initialize();
    validationManager = engine.getManager('ValidationManager');
  });

  test('validates correct filename', () => {
    const result = validationManager.validateFilename(
      '3463c02f-5c84-4a42-a574-a56077ff8162.md'
    );
    expect(result.success).toBe(true);
    expect(result.error).toBeNull();
  });

  test('rejects invalid filename', () => {
    const result = validationManager.validateFilename('MyPage.md');
    expect(result.success).toBe(false);
    expect(result.error).toContain('UUID naming convention');
  });

  test('generates valid metadata', () => {
    const metadata = validationManager.generateValidMetadata('Test Page', {
      'system-category': 'Documentation'
    });

    const validation = validationManager.validateMetadata(metadata);
    expect(validation.success).toBe(true);
  });

  test('generates valid slug', () => {
    expect(validationManager.generateSlug('Hello World')).toBe('hello-world');
    expect(validationManager.generateSlug('Test!@#$%Page')).toBe('test-page');
  });
});
```

## Location

**Source:** `src/managers/ValidationManager.ts`
**Dependencies:**

- `BaseManager` - Base manager class
- `uuid` - UUID generation and validation
- `path` - Path operations

**Related Managers:**

- `PageManager` - Uses ValidationManager for page operations
- `ConfigurationManager` - Provides configuration values

## See Also

- [PageManager UUID Storage](./PageManager-UUID-Storage.md)
- [ConfigurationManager Documentation](./ConfigurationManager-Documentation.md)
- [BaseManager](../architecture/BaseManager.md)
- RFC 4122 (UUID specification)
- ISO 8601 (Date format specification)
