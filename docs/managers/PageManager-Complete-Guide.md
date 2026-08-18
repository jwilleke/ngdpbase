# PageManager Complete Guide

__Module:__ `src/managers/PageManager.js`
__Quick Reference:__ [PageManager.md](PageManager.md)
__Version:__ 1.3.2
__Last Updated:__ 2025-12-20
__Status:__ Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Configuration Reference](#configuration-reference)
4. [Page Provider System](#page-provider-system)
5. [FileSystemProvider](#filesystemprovider)
6. [Future Providers](#future-providers)
7. [API Reference](#api-reference)
8. [Usage Examples](#usage-examples)
9. [Integration with Other Managers](#integration-with-other-managers)
10. [Best Practices](#best-practices)
11. [Troubleshooting](#troubleshooting)
12. [Migration Guide](#migration-guide)

---

## Overview

The __PageManager__ is the central coordinator for all wiki page operations in ngdpbase. It implements a __pluggable provider architecture__ following the JSPWiki pattern, allowing different storage backends (filesystem, database, cloud) to be swapped via configuration without changing application code.

### Key Responsibilities

- __Provider Management__: Load and initialize the configured page storage provider
- __API Coordination__: Provide a stable public API that delegates to the active provider
- __Backward Compatibility__: Maintain existing method signatures while supporting provider abstraction
- __Configuration Integration__: Work with ConfigurationManager for dynamic provider loading

### Design Philosophy

The PageManager follows the __Separation of Concerns__ principle:

- PageManager: Thin coordinator layer (public API)
- Provider: Storage implementation (filesystem, database, etc.)
- ConfigurationManager: Configuration source of truth

This architecture enables:

- __Pluggability__: Swap storage backends via configuration
- __Testability__: Mock providers for testing
- __Scalability__: Move from filesystem to database/cloud without code changes
- __Maintainability__: Clear separation between coordination and implementation

---

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                       ngdpbase Engine                             │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                  PageManager                                │ │
│  │  - getCurrentPageProvider()                                 │ │
│  │  - getPage(identifier)                                      │ │
│  │  - savePage(pageName, content, metadata)                    │ │
│  │  - deletePage(identifier)                                   │ │
│  │  - getAllPages()                                            │ │
│  └─────────────────┬──────────────────────────────────────────┘ │
│                    │ Delegates to                                │
│                    ▼                                             │
│  ┌──────────────────────────────────────────────────────┐       │
│  │           BasePageProvider (Abstract)                │       │
│  │  + initialize()                                       │       │
│  │  + getProviderInfo()                                  │       │
│  │  + getPage(identifier)                                │       │
│  │  + savePage(pageName, content, metadata)              │       │
│  │  + deletePage(identifier)                             │       │
│  └──────────────────┬───────────────────────────────────┘       │
│                     │ Implements                                 │
│          ┌──────────┴──────────┬──────────────┐                 │
│          ▼                     ▼              ▼                 │
│  ┌──────────────┐   ┌──────────────────┐   ┌────────────┐      │
│  │ FileSystem   │   │  Database        │   │   Cloud    │      │
│  │ Provider     │   │  Provider        │   │  Provider  │      │
│  │              │   │  (Future)        │   │  (Future)  │      │
│  │ - File I/O   │   │  - SQL/NoSQL     │   │  - S3/Blob │      │
│  │ - YAML       │   │  - Transactions  │   │  - CDN     │      │
│  │ - Cache      │   │  - Migrations    │   │  - Sync    │      │
│  └──────────────┘   └──────────────────┘   └────────────┘      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Configuration Flow

```
┌──────────────────────────────────────────────────────────────────┐
│  1. Engine initialization                                         │
│     └─> ConfigurationManager loads config files                  │
│         (app-default-config.json → app-{env} → app-custom)       │
└────────────────────┬─────────────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────────────┐
│  2. PageManager.initialize()                                      │
│     ├─> getProperty('ngdpbase.page.provider.default')             │
│     │   Returns: 'filesystemprovider'                            │
│     ├─> getProperty('ngdpbase.page.provider')                     │
│     │   Returns: 'filesystemprovider' (with fallback)            │
│     └─> #normalizeProviderName('filesystemprovider')             │
│         Returns: 'FileSystemProvider' (PascalCase)               │
└────────────────────┬─────────────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────────────┐
│  3. Provider loading and initialization                           │
│     ├─> require('../providers/FileSystemProvider')               │
│     ├─> new FileSystemProvider(engine)                           │
│     └─> provider.initialize()                                    │
│         ├─> getProperty('ngdpbase.page.provider.filesystem.*')    │
│         ├─> Load page cache                                      │
│         └─> Build indexes (title, UUID)                          │
└──────────────────────────────────────────────────────────────────┘
```

### Data Flow Example: Saving a Page

```
User Request: POST /edit/MyPage
    │
    ▼
┌─────────────────────────────────────────┐
│  Routes/Controllers                     │
│  req.body: { content, metadata }        │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│  PageManager.savePage()                 │
│  - Validates input                      │
│  - Delegates to provider                │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│  FileSystemProvider.savePage()          │
│  - Generates UUID if needed             │
│  - Combines frontmatter + content       │
│  - Writes to filesystem                 │
│  - Updates cache and indexes            │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│  Filesystem: pages/{uuid}.md            │
│  ---                                    │
│  title: MyPage                          │
│  uuid: 3463c02f-...                     │
│  ---                                    │
│  # Content here...                      │
└─────────────────────────────────────────┘
```

---

## Configuration Reference

### Core Configuration (ALL LOWERCASE)

All PageManager configuration keys use __lowercase__ naming:

```json
{
  "_comment_page_storage": "Page storage configuration (ALL LOWERCASE)",
  "ngdpbase.page.enabled": true,
  "ngdpbase.page.provider.default": "filesystemprovider",
  "ngdpbase.page.provider": "filesystemprovider",
  "ngdpbase.page.provider.filesystem.storagedir": "./pages",
  "ngdpbase.page.provider.filesystem.requiredpagesdir": "./required-pages",
  "ngdpbase.page.provider.filesystem.encoding": "utf-8",
  "ngdpbase.page.provider.filesystem.autosave": true
}
```

### Configuration Keys Explained

#### General Settings

| Key | Type | Default | Description |
| ----- | ------ | --------- | ------------- |
| `ngdpbase.page.enabled` | boolean | `true` | Enable/disable page storage system |
| `ngdpbase.page.provider.default` | string | `"filesystemprovider"` | Default provider name (fallback) |
| `ngdpbase.page.provider` | string | `"filesystemprovider"` | Active provider name |

__Provider Fallback Pattern:__

```javascript
// 1. Try specific provider setting
const providerName = getProperty('ngdpbase.page.provider')

// 2. Fall back to default if not set
const defaultProvider = getProperty('ngdpbase.page.provider.default')
```

#### FileSystemProvider Settings

| Key | Type | Default | Description |
| ----- | ------ | --------- | ------------- |
| `ngdpbase.page.provider.filesystem.storagedir` | string | `"./pages"` | Main pages directory |
| `ngdpbase.page.provider.filesystem.requiredpagesdir` | string | `"./required-pages"` | System pages directory |
| `ngdpbase.page.provider.filesystem.encoding` | string | `"utf-8"` | File encoding |
| `ngdpbase.page.provider.filesystem.autosave` | boolean | `true` | Enable autosave (future) |

### Provider Name Normalization

Configuration uses __lowercase__ provider names, which are normalized to __PascalCase__ class names:

| Configuration Value | Class Name |
| --------------------- | ------------ |
| `filesystemprovider` | `FileSystemProvider` |
| `databaseprovider` | `DatabaseProvider` |
| `databasepageprovider` | `DatabasePageProvider` |
| `s3provider` | `S3Provider` |
| `s3pageprovider` | `S3PageProvider` |
| `cloudstorageprovider` | `CloudStorageProvider` |

Example normalization code:

```javascript
#normalizeProviderName(providerName) {
  const lower = providerName.toLowerCase();
  const knownProviders = {
    'filesystemprovider': 'FileSystemProvider',
    'databaseprovider': 'DatabaseProvider',
    // ... more providers
  };
  return knownProviders[lower] || /* fallback logic */;
}
```

### Special Page Mappings (ALL LOWERCASE)

Special JSP pages are mapped with lowercase keys:

```json
{
  "ngdpbase.specialpage.login": "Login.jsp",
  "ngdpbase.specialpage.userpreferences": "UserPreferences.jsp",
  "ngdpbase.specialpage.search": "Search.jsp",
  "ngdpbase.specialpage.findpage": "FindPage.jsp",
  "ngdpbase.specialpage.diff": "Diff.jsp",
  "ngdpbase.specialpage.workflow": "Workflow.jsp",
  "ngdpbase.specialpage.upload": "Upload.jsp"
}
```

---

## Page Provider System

### BasePageProvider Interface

All page providers must extend `BasePageProvider` and implement these methods:

```javascript
class BasePageProvider {
  constructor(engine) {
    this.engine = engine;
    this.initialized = false;
  }

  /**
   * Initialize the provider with configuration
   * @returns {Promise<void>}
   */
  async initialize() {
    throw new Error('Provider must implement initialize()');
  }

  /**
   * Get provider metadata
   * @returns {{name: string, version: string, description: string, features: string[]}}
   */
  getProviderInfo() {
    throw new Error('Provider must implement getProviderInfo()');
  }

  /**
   * Get page content and metadata
   * @param {string} identifier - Page UUID or title
   * @returns {Promise<{content: string, metadata: object, title: string, uuid: string}|null>}
   */
  async getPage(identifier) {
    throw new Error('Provider must implement getPage()');
  }

  /**
   * Save page content and metadata
   * @param {string} pageName - Page title
   * @param {string} content - Page content (markdown)
   * @param {object} metadata - Page metadata
   * @returns {Promise<void>}
   */
  async savePage(pageName, content, metadata = {}) {
    throw new Error('Provider must implement savePage()');
  }

  /**
   * Delete a page
   * @param {string} identifier - Page UUID or title
   * @returns {Promise<boolean>}
   */
  async deletePage(identifier) {
    throw new Error('Provider must implement deletePage()');
  }

  /**
   * Check if page exists
   * @param {string} identifier - Page UUID or title
   * @returns {boolean}
   */
  pageExists(identifier) {
    throw new Error('Provider must implement pageExists()');
  }

  /**
   * Get all page titles
   * @returns {Promise<string[]>}
   */
  async getAllPages() {
    throw new Error('Provider must implement getAllPages()');
  }
}
```

### Provider Lifecycle

1. __Construction__: Provider instance created with engine reference
2. __Initialization__: `initialize()` called to load configuration and set up storage
3. __Operation__: Provider handles all page operations via public API
4. __Coordination__: Provider may interact with other managers (SearchManager, CacheManager, etc.)

---

## FileSystemProvider

### Overview

The __FileSystemProvider__ stores pages as Markdown files with YAML frontmatter. It implements filesystem-based storage with in-memory caching and multiple lookup indexes.

### Features

- ✅ UUID-based file naming for uniqueness
- ✅ Title-based lookup with case-insensitive matching
- ✅ Plural name matching (e.g., "Users" finds "User")
- ✅ Dual storage locations (regular + required/system pages)
- ✅ In-memory caching with title and UUID indexes
- ✅ YAML frontmatter for metadata
- ✅ Markdown content support
- ✅ Automatic directory creation
- ✅ Comprehensive error handling

### Storage Structure

```
ngdpbase/
├── pages/                           # Regular user pages
│   ├── 3463c02f-5c84-4a42-a574-a56077ff8162.md
│   ├── 749e0fc7-0f71-483a-ab80-538d9c598352.md
│   └── ...
└── required-pages/                  # System/required pages
    ├── 870029a0-1132-40ce-98f6-57b66c09ce12.md
    ├── c244243a-1234-5678-9abc-def012345678.md
    └── ...
```

### Page File Format

Each page is stored as a `.md` file with YAML frontmatter:

```markdown
---
title: "Welcome"
uuid: "3463c02f-5c84-4a42-a574-a56077ff8162"
author: "jim"
created: "2025-01-15T10:30:00.000Z"
modified: "2025-10-12T07:30:00.000Z"
category: "general"
keywords: ["welcome", "introduction"]
systemCategory: "general"
---

# Welcome to ngdpbase

This is the content of the page in Markdown format...
```

### Frontmatter Schema

| Field | Type | Required | Description |
| ------- | ------ | ---------- | ------------- |
| `title` | string | Yes | Page title (human-readable name) |
| `uuid` | string | Yes | Unique identifier (UUID v4) |
| `author` | string | Yes | Page creator username |
| `created` | ISO8601 | Yes | Creation timestamp |
| `modified` | ISO8601 | Yes | Last modification timestamp |
| `category` | string | No | User-defined category |
| `keywords` | array | No | Search/organization keywords |
| `systemCategory` | string | No | System category (from config) |
| `storageLocation` | string | No | Storage location hint ("regular" or "required") |

### In-Memory Caching

FileSystemProvider maintains three data structures for fast lookups:

```javascript
// 1. Main cache: Stores full page info by canonical identifier (title)
this.pageCache = new Map();
// Example: "Welcome" → { title, uuid, filePath, metadata }

// 2. Title index: Maps lowercase title to canonical identifier
this.titleIndex = new Map();
// Example: "welcome" → "Welcome"

// 3. UUID index: Maps UUID to canonical identifier
this.uuidIndex = new Map();
// Example: "3463c02f-..." → "Welcome"
```

__Lookup Flow:__

```
User requests page: "welcome" (lowercase)
    │
    ▼
1. Check titleIndex: "welcome" → "Welcome" (canonical)
    │
    ▼
2. Look up pageCache: "Welcome" → { full page info }
    │
    ▼
3. Return cached page info (or read from disk if not cached)
```

### Plural Name Matching

The FileSystemProvider uses `PageNameMatcher` for intelligent name matching:

```javascript
// Configuration
"ngdpbase.translatorReader.matchEnglishPlurals": true

// Examples of matches:
"User" matches "Users"
"Category" matches "Categories"
"Person" matches "People"
"Child" matches "Children"
```

When enabled, the system can find pages even if the link uses a plural form:

```markdown
[Users]  <!-- Finds page titled "User" -->
[Categories]  <!-- Finds page titled "Category" -->
```

### Page Operations

#### Reading a Page

```javascript
// By title
const page = await pageManager.getPage('Welcome');

// By UUID
const page = await pageManager.getPage('3463c02f-5c84-4a42-a574-a56077ff8162');

// Result:
{
  content: '# Welcome to ngdpbase\n\nThis is...',
  metadata: { title, uuid, author, created, modified, ... },
  title: 'Welcome',
  uuid: '3463c02f-5c84-4a42-a574-a56077ff8162',
  filePath: '/path/to/pages/3463c02f-5c84-4a42-a574-a56077ff8162.md'
}
```

#### Creating a Page

```javascript
await pageManager.savePage('New Page', '# Hello World', {
  author: 'jim',
  category: 'documentation',
  keywords: ['new', 'example']
});

// FileSystemProvider will:
// 1. Generate UUID if not provided
// 2. Add created/modified timestamps
// 3. Write to filesystem: pages/{uuid}.md
// 4. Update cache and indexes
```

#### Updating a Page

```javascript
// Get existing page
const page = await pageManager.getPage('Welcome');

// Modify content
const newContent = page.content + '\n\n## New Section';

// Save (metadata preserved)
await pageManager.savePage('Welcome', newContent, page.metadata);

// FileSystemProvider will:
// 1. Update modified timestamp
// 2. Write updated content
// 3. Refresh cache
```

#### Deleting a Page

```javascript
const deleted = await pageManager.deletePage('Old Page');

// FileSystemProvider will:
// 1. Find file by title or UUID
// 2. Delete file from filesystem
// 3. Remove from cache and indexes
// 4. Return true if successful
```

### Configuration Examples

#### Default Configuration

```json
{
  "ngdpbase.page.enabled": true,
  "ngdpbase.page.provider.default": "filesystemprovider",
  "ngdpbase.page.provider": "filesystemprovider",
  "ngdpbase.page.provider.filesystem.storagedir": "./pages",
  "ngdpbase.page.provider.filesystem.requiredpagesdir": "./required-pages",
  "ngdpbase.page.provider.filesystem.encoding": "utf-8",
  "ngdpbase.page.provider.filesystem.autosave": true
}
```

#### Custom Directories

```json
{
  "ngdpbase.page.provider.filesystem.storagedir": "/data/wiki/pages",
  "ngdpbase.page.provider.filesystem.requiredpagesdir": "/data/wiki/system"
}
```

#### Disable Plural Matching

```json
{
  "ngdpbase.translatorReader.matchEnglishPlurals": false
}
```

---

## Future Providers

The following providers are planned for future implementation. Configuration examples and documentation are provided for forward compatibility.

### DatabaseProvider

Store pages in SQL or NoSQL databases for better scalability and transaction support.

#### Configuration Example

```json
{
  "_comment_page_storage": "Database page storage (FUTURE)",
  "ngdpbase.page.provider": "databaseprovider",
  "ngdpbase.page.provider.database.type": "postgresql",
  "ngdpbase.page.provider.database.host": "localhost",
  "ngdpbase.page.provider.database.port": 5432,
  "ngdpbase.page.provider.database.database": "ngdpbase",
  "ngdpbase.page.provider.database.username": "ngdpbase_user",
  "ngdpbase.page.provider.database.password": "${DB_PASSWORD}",
  "ngdpbase.page.provider.database.pool.min": 2,
  "ngdpbase.page.provider.database.pool.max": 10,
  "ngdpbase.page.provider.database.ssl": true
}
```

#### Features (Planned)

- ✅ Transactional page updates
- ✅ Full-text search integration
- ✅ Page versioning/history
- ✅ Atomic operations
- ✅ Connection pooling
- ✅ Prepared statements for security
- ✅ Support for PostgreSQL, MySQL, MongoDB

#### Database Schema (PostgreSQL Example)

```sql
CREATE TABLE pages (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  author VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modified_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  category VARCHAR(100),
  system_category VARCHAR(100),
  storage_location VARCHAR(20) DEFAULT 'regular',
  UNIQUE(title)
);

CREATE INDEX idx_pages_title ON pages(title);
CREATE INDEX idx_pages_author ON pages(author);
CREATE INDEX idx_pages_category ON pages(category);
CREATE INDEX idx_pages_system_category ON pages(system_category);

CREATE TABLE page_metadata (
  uuid UUID REFERENCES pages(uuid) ON DELETE CASCADE,
  key VARCHAR(100) NOT NULL,
  value JSONB,
  PRIMARY KEY (uuid, key)
);

CREATE TABLE page_keywords (
  uuid UUID REFERENCES pages(uuid) ON DELETE CASCADE,
  keyword VARCHAR(100) NOT NULL,
  PRIMARY KEY (uuid, keyword)
);

CREATE INDEX idx_page_keywords ON page_keywords(keyword);
```

### S3Provider / CloudStorageProvider

Store pages in cloud object storage (AWS S3, Azure Blob, Google Cloud Storage).

#### Configuration Example (S3)

```json
{
  "_comment_page_storage": "S3 page storage (FUTURE)",
  "ngdpbase.page.provider": "s3provider",
  "ngdpbase.page.provider.s3.region": "us-east-1",
  "ngdpbase.page.provider.s3.bucket": "ngdpbase-pages",
  "ngdpbase.page.provider.s3.prefix": "pages/",
  "ngdpbase.page.provider.s3.accesskeyid": "${AWS_ACCESS_KEY_ID}",
  "ngdpbase.page.provider.s3.secretaccesskey": "${AWS_SECRET_ACCESS_KEY}",
  "ngdpbase.page.provider.s3.encryption": "AES256",
  "ngdpbase.page.provider.s3.storageclass": "STANDARD",
  "ngdpbase.page.provider.s3.cdnenabled": true,
  "ngdpbase.page.provider.s3.cdnurl": "https://cdn.example.com"
}
```

#### Features (Planned)

- ✅ Scalable object storage
- ✅ Built-in redundancy and durability
- ✅ CDN integration for fast access
- ✅ Server-side encryption
- ✅ Versioning support
- ✅ Lifecycle policies
- ✅ Cross-region replication

#### Storage Structure (S3)

```
s3://ngdpbase-pages/
├── pages/
│   ├── 3463c02f-5c84-4a42-a574-a56077ff8162.md
│   ├── 749e0fc7-0f71-483a-ab80-538d9c598352.md
│   └── ...
├── required-pages/
│   ├── 870029a0-1132-40ce-98f6-57b66c09ce12.md
│   └── ...
└── metadata/
    └── index.json  # Page index for fast lookups
```

---

## API Reference

### PageManager Methods

#### `initialize(config = {})`

Initialize the PageManager and load the configured provider.

__Parameters:__

- `config` (object, optional): Additional configuration options

__Returns:__ `Promise<void>`

__Throws:__ Error if ConfigurationManager is not available or provider fails to load

__Example:__

```javascript
await pageManager.initialize();
```

---

#### `getCurrentPageProvider()`

Get the currently active page provider instance.

__Returns:__ `BasePageProvider` - The active provider instance

__Example:__

```javascript
const provider = pageManager.getCurrentPageProvider();
const info = provider.getProviderInfo();
console.log(`Using ${info.name} v${info.version}`);
```

---

#### `getPage(identifier)`

Get page content and metadata together.

__Parameters:__

- `identifier` (string): Page UUID or title

__Returns:__ `Promise<Object|null>` - Page object or null if not found

__Page Object Structure:__

```javascript
{
  content: string,      // Markdown content
  metadata: object,     // Frontmatter metadata
  title: string,        // Page title
  uuid: string,         // Page UUID
  filePath: string      // File path (FileSystemProvider only)
}
```

__Example:__

```javascript
const page = await pageManager.getPage('Welcome');
if (page) {
  console.log(`Title: ${page.title}`);
  console.log(`UUID: ${page.uuid}`);
  console.log(`Content: ${page.content}`);
}
```

---

#### `getPageContent(identifier)`

Get only page content (without metadata).

__Parameters:__

- `identifier` (string): Page UUID or title

__Returns:__ `Promise<string>` - Markdown content

__Example:__

```javascript
const content = await pageManager.getPageContent('Welcome');
console.log(content);
```

---

#### `getPageMetadata(identifier)`

Get only page metadata (without content).

__Parameters:__

- `identifier` (string): Page UUID or title

__Returns:__ `Promise<Object|null>` - Metadata object or null if not found

__Example:__

```javascript
const metadata = await pageManager.getPageMetadata('Welcome');
console.log(`Author: ${metadata.author}`);
console.log(`Created: ${metadata.created}`);
```

---

#### `savePage(pageName, content, metadata = {})`

Save page content and metadata.

__Parameters:__

- `pageName` (string): Page title
- `content` (string): Page content (Markdown)
- `metadata` (object, optional): Page metadata

__Returns:__ `Promise<void>`

__Example:__

```javascript
await pageManager.savePage('New Page', '# Hello World', {
  author: 'jim',
  category: 'documentation',
  keywords: ['example', 'test']
});
```

---

#### `deletePage(identifier)`

Delete a page.

__Parameters:__

- `identifier` (string): Page UUID or title

__Returns:__ `Promise<boolean>` - `true` if deleted, `false` if not found

__Example:__

```javascript
const deleted = await pageManager.deletePage('Old Page');
if (deleted) {
  console.log('Page deleted successfully');
}
```

---

#### `pageExists(identifier)`

Check if a page exists.

__Parameters:__

- `identifier` (string): Page UUID or title

__Returns:__ `boolean` - `true` if page exists

__Example:__

```javascript
if (pageManager.pageExists('Welcome')) {
  console.log('Welcome page exists');
}
```

---

#### `getAllPages()`

Get all page titles.

__Returns:__ `Promise<string[]>` - Sorted array of page titles

__Example:__

```javascript
const pages = await pageManager.getAllPages();
console.log(`Total pages: ${pages.length}`);
pages.forEach(title => console.log(title));
```

---

#### `getAllPagesWithMetadata()`

Get all pages with their metadata.

__Returns:__ `Promise<Array>` - Array of page objects with metadata

__Example:__

```javascript
const pages = await pageManager.getAllPagesWithMetadata();
pages.forEach(page => {
  console.log(`${page.title} - ${page.metadata.author}`);
});
```

---

#### `searchPages(query)`

Search pages by content or title.

__Parameters:__

- `query` (string): Search query

__Returns:__ `Promise<Array>` - Array of matching pages

__Example:__

```javascript
const results = await pageManager.searchPages('authentication');
console.log(`Found ${results.length} pages`);
```

---

#### `renamePage(oldName, newName)`

Rename a page.

__Parameters:__

- `oldName` (string): Current page title
- `newName` (string): New page title

__Returns:__ `Promise<void>`

__Example:__

```javascript
await pageManager.renamePage('Old Name', 'New Name');
```

---

#### `getPageHistory(identifier)`

Get page version history (if supported by provider).

__Parameters:__

- `identifier` (string): Page UUID or title

__Returns:__ `Promise<Array>` - Array of version objects

__Example:__

```javascript
const history = await pageManager.getPageHistory('Welcome');
history.forEach(version => {
  console.log(`${version.modified} by ${version.author}`);
});
```

---

### BasePageProvider Methods

Providers must implement these methods. See [Page Provider System](#page-provider-system) for full interface documentation.

---

## Usage Examples

### Basic Operations

#### Create a New Page

```javascript
const pageManager = engine.getManager('PageManager');

await pageManager.savePage('My New Page', `
# My New Page

This is a new wiki page with some content.

## Section 1
Content here...
`, {
  author: 'jim',
  category: 'documentation',
  keywords: ['example', 'documentation']
});
```

#### Read a Page

```javascript
const page = await pageManager.getPage('My New Page');

console.log('Title:', page.title);
console.log('UUID:', page.uuid);
console.log('Author:', page.metadata.author);
console.log('Content:', page.content);
```

#### Update a Page

```javascript
// Get existing page
const page = await pageManager.getPage('My New Page');

// Modify content
const updatedContent = page.content + '\n\n## New Section\nAdded content...';

// Save with updated metadata
await pageManager.savePage('My New Page', updatedContent, {
  ...page.metadata,
  modified: new Date().toISOString()
});
```

#### Delete a Page

```javascript
const deleted = await pageManager.deletePage('My New Page');
if (deleted) {
  console.log('Page deleted successfully');
} else {
  console.log('Page not found');
}
```

#### List All Pages

```javascript
const allPages = await pageManager.getAllPages();
console.log(`Total pages: ${allPages.length}`);

// Sort and display
allPages.sort().forEach(title => {
  console.log(`- ${title}`);
});
```

### Advanced Operations

#### Search Pages

```javascript
const results = await pageManager.searchPages('authentication');

results.forEach(page => {
  console.log(`Found: ${page.title}`);
  console.log(`Excerpt: ${page.excerpt}`);
});
```

#### Rename a Page

```javascript
await pageManager.renamePage('Old Page Name', 'New Page Name');
console.log('Page renamed successfully');
```

#### Get Page Metadata Only

```javascript
const metadata = await pageManager.getPageMetadata('Welcome');

console.log('Author:', metadata.author);
console.log('Created:', metadata.created);
console.log('Keywords:', metadata.keywords.join(', '));
```

#### Check Page Existence

```javascript
if (pageManager.pageExists('Welcome')) {
  console.log('Welcome page exists');
} else {
  console.log('Welcome page not found');
}
```

### Express.js Integration

#### Route: Get Page Content

```javascript
app.get('/wiki/:page', async (req, res) => {
  const pageManager = req.app.get('engine').getManager('PageManager');
  const pageName = req.params.page;

  try {
    const page = await pageManager.getPage(pageName);

    if (!page) {
      return res.status(404).render('not-found', { pageName });
    }

    res.render('view', { page });
  } catch (error) {
    console.error('Error loading page:', error);
    res.status(500).render('error', { error });
  }
});
```

#### Route: Edit Page

```javascript
app.post('/edit/:page', async (req, res) => {
  const pageManager = req.app.get('engine').getManager('PageManager');
  const pageName = req.params.page;
  const { content } = req.body;

  try {
    // Get existing metadata or create new
    const existingPage = await pageManager.getPage(pageName);
    const metadata = existingPage ? existingPage.metadata : {
      author: req.user.username,
      created: new Date().toISOString()
    };

    // Update modified timestamp
    metadata.modified = new Date().toISOString();

    await pageManager.savePage(pageName, content, metadata);
    res.redirect(`/wiki/${encodeURIComponent(pageName)}`);
  } catch (error) {
    console.error('Error saving page:', error);
    res.status(500).render('error', { error });
  }
});
```

#### Route: Delete Page

```javascript
app.delete('/delete/:page', async (req, res) => {
  const pageManager = req.app.get('engine').getManager('PageManager');
  const pageName = req.params.page;

  try {
    const deleted = await pageManager.deletePage(pageName);

    if (deleted) {
      res.json({ success: true, message: 'Page deleted' });
    } else {
      res.status(404).json({ success: false, message: 'Page not found' });
    }
  } catch (error) {
    console.error('Error deleting page:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
```

---

## Integration with Other Managers

### RenderingManager

PageManager coordinates with RenderingManager for content rendering:

```javascript
const pageManager = engine.getManager('PageManager');
const renderingManager = engine.getManager('RenderingManager');

// Get raw page content
const page = await pageManager.getPage('Welcome');

// Render to HTML
const html = await renderingManager.renderPage(page.content, {
  pageName: page.title,
  metadata: page.metadata
});
```

### SearchManager

PageManager provides page content to SearchManager for indexing:

```javascript
const pageManager = engine.getManager('PageManager');
const searchManager = engine.getManager('SearchManager');

// When page is saved, update search index
await pageManager.savePage(pageName, content, metadata);
await searchManager.indexPage(pageName, content, metadata);
```

### BackupManager

PageManager integrates with BackupManager for backup/restore operations:

```javascript
const pageManager = engine.getManager('PageManager');
const backupManager = engine.getManager('BackupManager');

// Register PageManager for backup
backupManager.registerManager('PageManager', {
  backup: async () => {
    const allPages = await pageManager.getAllPagesWithMetadata();
    return { pages: allPages };
  },
  restore: async (data) => {
    for (const page of data.pages) {
      await pageManager.savePage(page.title, page.content, page.metadata);
    }
  }
});
```

### CacheManager

PageManager can use CacheManager for performance optimization:

```javascript
const pageManager = engine.getManager('PageManager');
const cacheManager = engine.getManager('CacheManager');

// Cache frequently accessed pages
async function getCachedPage(pageName) {
  const cacheKey = `page:${pageName}`;

  let page = cacheManager.get(cacheKey);
  if (!page) {
    page = await pageManager.getPage(pageName);
    cacheManager.set(cacheKey, page, 300); // Cache for 5 minutes
  }

  return page;
}
```

---

## Best Practices

### Configuration

1. __Use Lowercase Keys__: All configuration keys should be lowercase

   ```json
   "ngdpbase.page.provider": "filesystemprovider"  ✅
   "ngdpbase.page.Provider": "FileSystemProvider"  ❌
   ```

2. __Provider Fallback__: Always configure both default and active provider

   ```json
   "ngdpbase.page.provider.default": "filesystemprovider",
   "ngdpbase.page.provider": "filesystemprovider"
   ```

3. __Never Modify app-default-config.json in Production__: Use `app-custom-config.json` for overrides

   ```json
   // app-custom-config.json
   {
     "ngdpbase.page.provider.filesystem.storagedir": "/data/wiki/pages"
   }
   ```

### Page Management

1. __Always Use UUID Lookups for Programmatic Access__:

   ```javascript
   // Good - UUID is stable
   const page = await pageManager.getPage('3463c02f-5c84-...');

   // Risky - Title might change
   const page = await pageManager.getPage('Welcome');
   ```

2. __Preserve Metadata When Updating__:

   ```javascript
   const page = await pageManager.getPage('MyPage');
   await pageManager.savePage('MyPage', newContent, {
     ...page.metadata,  // Preserve existing metadata
     modified: new Date().toISOString()
   });
   ```

3. __Check Existence Before Operations__:

   ```javascript
   if (pageManager.pageExists('MyPage')) {
     await pageManager.deletePage('MyPage');
   }
   ```

### Error Handling

1. __Handle Null Returns__:

   ```javascript
   const page = await pageManager.getPage('NonExistent');
   if (!page) {
     // Handle missing page
     return res.status(404).send('Page not found');
   }
   ```

2. __Catch Provider Errors__:

   ```javascript
   try {
     await pageManager.savePage(pageName, content, metadata);
   } catch (error) {
     logger.error('Failed to save page:', error);
     // Handle error appropriately
   }
   ```

### Performance

1. __Use Caching for Frequently Accessed Pages__:

   ```javascript
   const cacheKey = `page:${pageName}`;
   let page = cache.get(cacheKey);
   if (!page) {
     page = await pageManager.getPage(pageName);
     cache.set(cacheKey, page, 300);
   }
   ```

2. __Batch Operations When Possible__:

   ```javascript
   // Instead of multiple individual saves
   const pages = ['Page1', 'Page2', 'Page3'];
   await Promise.all(pages.map(name =>
     pageManager.savePage(name, content, metadata)
   ));
   ```

3. __Use `getAllPages()` Instead of Multiple `getPage()` Calls__:

   ```javascript
   // Good
   const allPages = await pageManager.getAllPagesWithMetadata();

   // Bad
   const titles = await pageManager.getAllPages();
   const pages = await Promise.all(titles.map(t => pageManager.getPage(t)));
   ```

---

## Troubleshooting

### Common Issues

#### 1. PageManager Initialization Fails

__Symptom__: Error message "PageManager requires ConfigurationManager"

__Cause__: ConfigurationManager not initialized before PageManager

__Solution__: Ensure proper manager initialization order in `Engine.js`:

```javascript
await this.registerManager('ConfigurationManager', ...);
await this.registerManager('PageManager', ...);
```

---

#### 2. Provider Not Found

__Symptom__: Error message "Failed to initialize page provider: DatabaseProvider"

__Cause__: Provider class doesn't exist or wrong name in configuration

__Solution__: Check provider name normalization:

```json
{
  "ngdpbase.page.provider": "filesystemprovider"  // Lowercase
}
```

---

#### 3. Pages Not Loading

__Symptom__: `getPage()` returns null for known pages

__Cause__: Cache not refreshed or incorrect directory path

__Solution__: Check logs for initialization messages:

```
📄 Loading page provider: filesystemprovider (FileSystemProvider)
[FileSystemProvider] Page directory: /path/to/pages
[FileSystemProvider] Initialized with 83 pages.
```

Verify directory exists and contains `.md` files.

---

#### 4. Page Saves Failing

__Symptom__: `savePage()` throws error or pages don't persist

__Cause__: File permission issues or invalid metadata

__Solution__:

1. Check directory permissions: `ls -la pages/`
2. Validate metadata structure
3. Check logs for specific error messages

---

#### 5. Plural Matching Not Working

__Symptom__: Links like `[Users]` don't find page titled "User"

__Cause__: Plural matching disabled in configuration

__Solution__: Enable plural matching:

```json
{
  "ngdpbase.translatorReader.matchEnglishPlurals": true
}
```

---

### Debug Logging

Enable detailed logging to troubleshoot issues:

```javascript
const logger = require('./utils/logger');
logger.setLevel('debug');

// PageManager operations will log detailed information
const page = await pageManager.getPage('Welcome');
```

Log messages to look for:

- `📄 Loading page provider: ...` - Provider initialization
- `[FileSystemProvider] Page directory: ...` - Directory paths
- `[FileSystemProvider] Initialized with N pages` - Page count
- `📄 PageManager initialized with ...` - Successful initialization

---

## Migration Guide

### Migrating from Old Configuration Keys

If you're upgrading from an older version with different configuration keys:

#### Before (Old Keys)

```json
{
  "ngdpbase.pageProvider": "FileSystemProvider",
  "ngdpbase.directories.pages": "./pages",
  "ngdpbase.directories.required-pages": "./required-pages",
  "ngdpbase.encoding": "UTF-8"
}
```

#### After (New Keys - ALL LOWERCASE)

```json
{
  "ngdpbase.page.enabled": true,
  "ngdpbase.page.provider.default": "filesystemprovider",
  "ngdpbase.page.provider": "filesystemprovider",
  "ngdpbase.page.provider.filesystem.storagedir": "./pages",
  "ngdpbase.page.provider.filesystem.requiredpagesdir": "./required-pages",
  "ngdpbase.page.provider.filesystem.encoding": "utf-8"
}
```

#### Migration Steps

1. __Backup Configuration__: Copy `app-custom-config.json` to `app-custom-config.json.backup`

2. __Update Keys__: Replace old keys with new lowercase keys

3. __Update Provider Name__: Change from `FileSystemProvider` to `filesystemprovider`

4. __Test Configuration__: Restart server and check logs for successful initialization

5. __Verify Pages Load__: Access a few pages to confirm everything works

---

### Creating a Custom Provider

To create a new page storage provider:

1. __Create Provider Class__:

```javascript
// src/providers/CustomProvider.js
const BasePageProvider = require('./BasePageProvider');

class CustomProvider extends BasePageProvider {
  constructor(engine) {
    super(engine);
  }

  async initialize() {
    const configManager = this.engine.getManager('ConfigurationManager');
    // Read configuration keys:
    // ngdpbase.page.provider.custom.*

    this.initialized = true;
  }

  getProviderInfo() {
    return {
      name: 'CustomProvider',
      version: '1.0.0',
      description: 'Custom storage provider',
      features: ['feature1', 'feature2']
    };
  }

  // Implement all required methods...
}

module.exports = CustomProvider;
```

1. __Update Provider Normalization__:

```javascript
// src/managers/PageManager.js
#normalizeProviderName(providerName) {
  const knownProviders = {
    'filesystemprovider': 'FileSystemProvider',
    'customprovider': 'CustomProvider',  // Add your provider
    // ...
  };
  return knownProviders[lower] || /* fallback */;
}
```

1. __Add Configuration__:

```json
{
  "ngdpbase.page.provider": "customprovider",
  "ngdpbase.page.provider.custom.option1": "value1",
  "ngdpbase.page.provider.custom.option2": "value2"
}
```

1. __Test Provider__: Restart server and verify initialization logs

---

## Summary

The __PageManager__ provides a flexible, pluggable architecture for wiki page storage. Key takeaways:

- ✅ __Pluggable Providers__: Swap storage backends via configuration
- ✅ __Lowercase Configuration__: All config keys use lowercase naming
- ✅ __Provider Fallback__: Default + active provider pattern
- ✅ __FileSystemProvider__: Production-ready filesystem storage with caching
- ✅ __Future Providers__: Database and cloud storage planned
- ✅ __Clean API__: Stable public API with provider delegation
- ✅ __Integration__: Works seamlessly with other managers

For questions or issues, check the [Troubleshooting](#troubleshooting) section or review server logs for detailed error messages.

---

__Document Version__: 1.0.0
__ngdpbase Version__: 1.3.2
__Last Updated__: 2025-10-12
