# AttachmentManager Complete Guide

__Module:__ `src/managers/AttachmentManager.js`
__Quick Reference:__ [AttachmentManager.md](AttachmentManager.md)
__Version:__ 1.0.0
__Based on:__ JSPWiki AttachmentManager pattern

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Configuration](#configuration)
4. [Provider System](#provider-system)
5. [Usage Examples](#usage-examples)
6. [API Reference](#api-reference)
7. [Backup and Restore](#backup-and-restore)
8. [Future Providers](#future-providers)
9. [Best Practices](#best-practices)
10. [Troubleshooting](#troubleshooting)

---

## Overview

The AttachmentManager is responsible for managing file attachments in ngdpbase. It provides a high-level interface for uploading, downloading, deleting, and managing attachments while delegating actual storage to pluggable attachment providers.

### Key Features

- __Pluggable Storage Providers__: Support for multiple storage backends (filesystem, database, cloud storage)
- __Schema.org Metadata__: Rich metadata using Schema.org CreativeWork format
- __Content Deduplication__: Hash-based storage prevents duplicate file storage
- __Page Mentions Tracking__: Track which pages reference which attachments
- __Permission Enforcement__: Integration with PolicyManager for access control
- __Backup/Restore Support__: Full backup and restore capabilities via BackupManager
- __Provider Fallback__: Configurable default provider with fallback pattern

### Design Principles

Following JSPWiki's attachment management pattern, AttachmentManager:

1. Delegates storage to pluggable providers
2. Enforces permissions via PolicyManager
3. Tracks attachment-page relationships
4. Provides high-level attachment operations
5. Uses all lowercase configuration keys

---

## Architecture

```text
┌─────────────────────────────────────────────────────────┐
│                   AttachmentManager                      │
│  (High-level API, permissions, coordination)            │
└────────────────┬────────────────────────────────────────┘
                 │
                 │ delegates storage to
                 ▼
┌─────────────────────────────────────────────────────────┐
│              BaseAttachmentProvider                      │
│           (Abstract provider interface)                  │
└─────────────────┬───────────────────────────────────────┘
                  │
          ┌───────┴───────┬──────────────┬───────────────┐
          ▼               ▼              ▼               ▼
  ┌───────────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐
  │   Basic       │ │ Database │ │   S3     │ │ Azure Blob  │
  │  Attachment   │ │Attachment│ │Attachment│ │ Attachment  │
  │   Provider    │ │ Provider │ │ Provider │ │  Provider   │
  │  (Filesystem) │ │  (SQL)   │ │  (AWS)   │ │  (Azure)    │
  └───────────────┘ └──────────┘ └──────────┘ └─────────────┘
        ✅              🔮           🔮             🔮
    Implemented      Future       Future         Future
```

### Component Responsibilities

__AttachmentManager:__

- Permission checking via PolicyManager
- Provider initialization and management
- High-level attachment operations (upload, download, delete)
- Provider name normalization (lowercase → PascalCase)
- Backup/restore coordination

__BaseAttachmentProvider:__

- Abstract interface all providers must implement
- Defines standard methods (storeAttachment, getAttachment, etc.)
- Enforces ConfigurationManager usage

__Concrete Providers:__

- Implement actual storage logic (filesystem, database, cloud)
- Handle metadata persistence
- Provide backup/restore support
- Report provider features and capabilities

---

## Configuration

### Configuration Structure (ALL LOWERCASE)

AttachmentManager uses a hierarchical configuration structure with all lowercase keys:

```json
{
  "_comment_attachment_storage": "Attachment storage configuration",
  "ngdpbase.attachment.enabled": true,

  "_comment_attachment_provider": "Provider fallback pattern",
  "ngdpbase.attachment.provider.default": "basicattachmentprovider",
  "ngdpbase.attachment.provider": "basicattachmentprovider",

  "_comment_attachment_shared": "Shared settings (all providers)",
  "ngdpbase.attachment.maxsize": 10485760,
  "ngdpbase.attachment.allowedtypes": "image/*,text/*,application/pdf",
  "ngdpbase.attachment.forcedownload": false,
  "ngdpbase.attachment.metadatafile": "./data/attachments/attachment-metadata.json",

  "_comment_attachment_provider_basic": "BasicAttachmentProvider settings",
  "ngdpbase.attachment.provider.basic.storagedir": "./data/attachments",
  "ngdpbase.attachment.provider.basic.hashcontent": true,
  "ngdpbase.attachment.provider.basic.hashmethod": "sha256",

  "_comment_attachment_enhanced": "Enhanced attachment features",
  "ngdpbase.attachment.enhanced.enabled": true,
  "ngdpbase.attachment.enhanced.thumbnails": true,
  "ngdpbase.attachment.enhanced.thumbnailsizes": "150x150,300x300",
  "ngdpbase.attachment.enhanced.metadata": true,
  "ngdpbase.attachment.enhanced.cachemetadata": true
}
```

### Configuration Keys Reference

#### Core Settings

| Key | Type | Default | Description |
| ----- | ------ | --------- | ------------- |
| `ngdpbase.attachment.enabled` | boolean | `true` | Enable/disable attachment system |
| `ngdpbase.attachment.provider.default` | string | `"basicattachmentprovider"` | Default provider fallback |
| `ngdpbase.attachment.provider` | string | `"basicattachmentprovider"` | Current active provider |
| `ngdpbase.attachment.maxsize` | number | `10485760` | Max file size in bytes (10MB) |
| `ngdpbase.attachment.allowedtypes` | string | `"image/*,text/*,application/pdf"` | Allowed MIME types |
| `ngdpbase.attachment.forcedownload` | boolean | `false` | Force download vs inline display |
| `ngdpbase.attachment.metadatafile` | string | `"./data/attachments/attachment-metadata.json"` | Metadata file location |

#### BasicAttachmentProvider Settings

| Key | Type | Default | Description |
| ----- | ------ | --------- | ------------- |
| `ngdpbase.attachment.provider.basic.storagedir` | string | `"./data/attachments"` | Filesystem storage directory |
| `ngdpbase.attachment.provider.basic.hashcontent` | boolean | `true` | Enable content-based hashing |
| `ngdpbase.attachment.provider.basic.hashmethod` | string | `"sha256"` | Hash algorithm (sha256, md5) |

#### Enhanced Features

| Key | Type | Default | Description |
| ----- | ------ | --------- | ------------- |
| `ngdpbase.attachment.enhanced.enabled` | boolean | `true` | Enable enhanced features |
| `ngdpbase.attachment.enhanced.thumbnails` | boolean | `true` | Generate thumbnails for images |
| `ngdpbase.attachment.enhanced.thumbnailsizes` | string | `"150x150,300x300"` | Thumbnail sizes |
| `ngdpbase.attachment.enhanced.metadata` | boolean | `true` | Extract file metadata |
| `ngdpbase.attachment.enhanced.cachemetadata` | boolean | `true` | Cache metadata in memory |

### Provider Fallback Pattern

The provider fallback pattern ensures reliability:

1. __Check active provider__: `ngdpbase.attachment.provider`
2. __Fallback to default__: `ngdpbase.attachment.provider.default`
3. __Hardcoded fallback__: `"basicattachmentprovider"`

This allows administrators to change providers without breaking the system.

### Provider Name Normalization

Provider names follow lowercase convention in configuration but are normalized to PascalCase for class loading:

| Config Value | Normalized Class Name |
| -------------- | ---------------------- |
| `basicattachmentprovider` | `BasicAttachmentProvider` |
| `databaseattachmentprovider` | `DatabaseAttachmentProvider` |
| `s3attachmentprovider` | `S3AttachmentProvider` |
| `azureblobattachmentprovider` | `AzureBlobAttachmentProvider` |

---

## Provider System

### Available Providers

#### 1. BasicAttachmentProvider ✅ (Implemented)

__Status:__ Production Ready
__Storage:__ Filesystem
__Features:__

- Content deduplication via SHA-256 hashing
- Schema.org CreativeWork metadata
- Shared storage model with page mentions tracking
- Automatic metadata persistence
- Backup/restore support

__Configuration:__

```json
{
  "ngdpbase.attachment.provider": "basicattachmentprovider",
  "ngdpbase.attachment.provider.basic.storagedir": "./data/attachments",
  "ngdpbase.attachment.provider.basic.hashcontent": true,
  "ngdpbase.attachment.provider.basic.hashmethod": "sha256"
}
```

__Storage Structure:__

```text
data/attachments/
├── metadata.json                    # All attachment metadata
├── a8/                             # First 2 chars of hash
│   └── a87ff679a2f3e71d9181...    # Full hash filename
├── 5f/
│   └── 5feceb66ffc86f38d952...
└── ...
```

__Use Cases:__

- Small to medium-sized wikis (< 1000 attachments)
- Single-server deployments
- Local development
- Simple backup requirements

#### 2. DatabaseAttachmentProvider 🔮 (Future)

__Status:__ Planned
__Storage:__ SQL Database (PostgreSQL, MySQL, SQLite)
__Benefits:__

- Transactional integrity
- Built-in replication
- Advanced querying capabilities
- Better for large deployments

__Planned Configuration:__

```json
{
  "ngdpbase.attachment.provider": "databaseattachmentprovider",
  "ngdpbase.attachment.provider.database.connectionstring": "postgresql://user:pass@localhost/ngdpbase",
  "ngdpbase.attachment.provider.database.tablename": "attachments",
  "ngdpbase.attachment.provider.database.poolsize": 10,
  "ngdpbase.attachment.provider.database.timeout": 30000
}
```

__Use Cases:__

- Large wikis (> 1000 attachments)
- Multi-server deployments
- Need for transactional guarantees
- Integration with existing databases

#### 3. S3AttachmentProvider 🔮 (Future)

__Status:__ Planned
__Storage:__ AWS S3 (Simple Storage Service)
__Benefits:__

- Unlimited scalability
- Built-in redundancy (11 9's durability)
- CDN integration via CloudFront
- Pay-per-use pricing

__Planned Configuration:__

```json
{
  "ngdpbase.attachment.provider": "s3attachmentprovider",
  "ngdpbase.attachment.provider.s3.bucket": "my-ngdpbase-attachments",
  "ngdpbase.attachment.provider.s3.region": "us-east-1",
  "ngdpbase.attachment.provider.s3.accesskey": "${AWS_ACCESS_KEY}",
  "ngdpbase.attachment.provider.s3.secretkey": "${AWS_SECRET_KEY}",
  "ngdpbase.attachment.provider.s3.encryption": "AES256",
  "ngdpbase.attachment.provider.s3.storageclass": "STANDARD"
}
```

__Use Cases:__

- Enterprise wikis with high availability requirements
- Global wikis needing CDN support
- Compliance requirements (S3 supports encryption at rest)
- Need for automatic backups and versioning

#### 4. AzureBlobAttachmentProvider 🔮 (Future)

__Status:__ Planned
__Storage:__ Azure Blob Storage
__Benefits:__

- Integration with Microsoft ecosystem
- Geo-redundant storage options
- Azure CDN support
- Competitive pricing

__Planned Configuration:__

```json
{
  "ngdpbase.attachment.provider": "azureblobattachmentprovider",
  "ngdpbase.attachment.provider.azure.accountname": "myngdpbase",
  "ngdpbase.attachment.provider.azure.accountkey": "${AZURE_STORAGE_KEY}",
  "ngdpbase.attachment.provider.azure.containername": "attachments",
  "ngdpbase.attachment.provider.azure.redundancy": "GRS",
  "ngdpbase.attachment.provider.azure.tier": "Hot"
}
```

__Use Cases:__

- Organizations using Azure infrastructure
- Need for geo-redundant storage
- Integration with Azure services
- Compliance with Azure certifications

---

## Usage Examples

### Basic Attachment Upload

```javascript
const attachmentManager = engine.getManager('AttachmentManager');

// Prepare file data
const fileBuffer = fs.readFileSync('./document.pdf');
const fileInfo = {
  originalName: 'document.pdf',
  mimeType: 'application/pdf',
  size: fileBuffer.length
};

// Upload options
const options = {
  pageName: 'ProjectDocs',
  description: 'Project requirements document',
  context: {
    username: 'john.doe',
    isAuthenticated: true,
    roles: ['editor']
  }
};

// Upload attachment
try {
  const attachment = await attachmentManager.uploadAttachment(
    fileBuffer,
    fileInfo,
    options
  );

  console.log(`Attachment uploaded: ${attachment.id}`);
  console.log(`URL: ${attachment.url}`);
} catch (error) {
  console.error('Upload failed:', error.message);
}
```

### Download Attachment

```javascript
// Get attachment by ID
const attachmentId = 'a87ff679a2f3e71d9181a67b7542122c';

try {
  const result = await attachmentManager.getAttachment(attachmentId);

  if (result) {
    console.log(`Downloaded: ${result.metadata.name}`);
    console.log(`Size: ${result.metadata.contentSize} bytes`);

    // Save to disk
    fs.writeFileSync(`./downloads/${result.metadata.name}`, result.buffer);
  } else {
    console.log('Attachment not found');
  }
} catch (error) {
  console.error('Download failed:', error.message);
}
```

### List Attachments for a Page

```javascript
const pageName = 'ProjectDocs';

try {
  const attachments = await attachmentManager.getAttachmentsForPage(pageName);

  console.log(`${attachments.length} attachments found:`);
  attachments.forEach(att => {
    console.log(`- ${att.name} (${att.contentSize} bytes)`);
  });
} catch (error) {
  console.error('List failed:', error.message);
}
```

### Delete Attachment

```javascript
const attachmentId = 'a87ff679a2f3e71d9181a67b7542122c';

// User context for permission checking
const userContext = {
  username: 'john.doe',
  isAuthenticated: true,
  roles: ['editor']
};

try {
  const deleted = await attachmentManager.deleteAttachment(
    attachmentId,
    userContext
  );

  if (deleted) {
    console.log('Attachment deleted successfully');
  } else {
    console.log('Attachment not found');
  }
} catch (error) {
  console.error('Delete failed:', error.message);
}
```

### Check Attachment Exists

```javascript
const attachmentId = 'a87ff679a2f3e71d9181a67b7542122c';

try {
  const exists = await attachmentManager.attachmentExists(attachmentId);
  console.log(`Attachment exists: ${exists}`);
} catch (error) {
  console.error('Check failed:', error.message);
}
```

### Refresh Attachment List

```javascript
// Re-scan storage and rebuild indexes
try {
  await attachmentManager.refreshAttachmentList();
  console.log('Attachment list refreshed');
} catch (error) {
  console.error('Refresh failed:', error.message);
}
```

---

## API Reference

### AttachmentManager

#### `async initialize(config = {})`

Initialize AttachmentManager with configuration.

__Parameters:__

- `config` (Object): Configuration object (usually empty, loaded from ConfigurationManager)

__Returns:__ ```Promise<void>```

__Example:__

```javascript
await attachmentManager.initialize();
```

---

#### `getCurrentAttachmentProvider()`

Get the current attachment provider instance.

__Returns:__ BaseAttachmentProvider

__Example:__

```javascript
const provider = attachmentManager.getCurrentAttachmentProvider();
console.log(provider.getProviderInfo());
```

---

#### `async uploadAttachment(fileBuffer, fileInfo, options = {})`

Upload an attachment.

__Parameters:__

- `fileBuffer` (Buffer): File data
- `fileInfo` (Object): `{ originalName, mimeType, size }`
- `options` (Object): Upload options
  - `pageName` (string): Page to attach to (optional)
  - `description` (string): File description
  - `context` (Object): WikiContext with user information

__Returns:__ ```Promise<Object>``` - Attachment metadata

__Throws:__ Error if permission denied or upload fails

__Example:__

```javascript
const attachment = await attachmentManager.uploadAttachment(
  fileBuffer,
  { originalName: 'doc.pdf', mimeType: 'application/pdf', size: 1024 },
  { pageName: 'MyPage', context: { username: 'user', isAuthenticated: true } }
);
```

---

#### `async getAttachment(attachmentId)`

Get attachment file data and metadata.

__Parameters:__

- `attachmentId` (string): Attachment identifier

__Returns:__ Promise<Object|null> - `{ buffer, metadata }` or null if not found

__Example:__

```javascript
const result = await attachmentManager.getAttachment('abc123');
if (result) {
  console.log(`File: ${result.metadata.name}`);
  fs.writeFileSync('download.pdf', result.buffer);
}
```

---

#### `async getAttachmentMetadata(attachmentId)`

Get attachment metadata only (no file data).

__Parameters:__

- `attachmentId` (string): Attachment identifier

__Returns:__ Promise<Object|null> - Schema.org CreativeWork metadata

__Example:__

```javascript
const metadata = await attachmentManager.getAttachmentMetadata('abc123');
if (metadata) {
  console.log(`Size: ${metadata.contentSize} bytes`);
  console.log(`Type: ${metadata.encodingFormat}`);
}
```

---

#### `async deleteAttachment(attachmentId, userContext)`

Delete an attachment.

__Parameters:__

- `attachmentId` (string): Attachment identifier
- `userContext` (Object): User context for permission checking

__Returns:__ ```Promise<boolean>``` - True if deleted, false if not found

__Throws:__ Error if permission denied

__Example:__

```javascript
const deleted = await attachmentManager.deleteAttachment(
  'abc123',
  { username: 'user', isAuthenticated: true, roles: ['editor'] }
);
```

---

#### `async attachmentExists(attachmentId)`

Check if attachment exists.

__Parameters:__

- `attachmentId` (string): Attachment identifier

__Returns:__ ```Promise<boolean>```

__Example:__

```javascript
if (await attachmentManager.attachmentExists('abc123')) {
  console.log('Attachment found');
}
```

---

#### `async getAllAttachments()`

Get all attachments metadata (without file data).

__Returns:__ ```Promise<Array<Object>>``` - Array of attachment metadata

__Example:__

```javascript
const attachments = await attachmentManager.getAllAttachments();
console.log(`Total attachments: ${attachments.length}`);
```

---

#### `async getAttachmentsForPage(pageName)`

Get attachments used by a specific page.

__Parameters:__

- `pageName` (string): Page name/title

__Returns:__ ```Promise<Array<Object>>``` - Array of attachment metadata

__Example:__

```javascript
const attachments = await attachmentManager.getAttachmentsForPage('ProjectDocs');
```

---

#### `async refreshAttachmentList()`

Refresh internal cache/index by re-scanning storage.

__Returns:__ ```Promise<void>```

__Example:__

```javascript
await attachmentManager.refreshAttachmentList();
```

---

#### `async backup()`

Create backup of all attachment data.

__Returns:__ ```Promise<Object>``` - Backup data

__Example:__

```javascript
const backupData = await attachmentManager.backup();
fs.writeFileSync('attachments-backup.json', JSON.stringify(backupData));
```

---

#### `async restore(backupData)`

Restore attachments from backup data.

__Parameters:__

- `backupData` (Object): Backup data from backup()

__Returns:__ ```Promise<void>```

__Example:__

```javascript
const backupData = JSON.parse(fs.readFileSync('attachments-backup.json'));
await attachmentManager.restore(backupData);
```

---

#### `async shutdown()`

Shutdown AttachmentManager and cleanup resources.

__Returns:__ ```Promise<void>```

__Example:__

```javascript
await attachmentManager.shutdown();
```

---

### Schema.org CreativeWork Metadata Format

Attachments use Schema.org CreativeWork format for metadata:

```javascript
{
  "@context": "https://schema.org",
  "@type": "CreativeWork",
  "@id": "urn:uuid:550e8400-e29b-41d4-a716-446655440000",
  "identifier": "a87ff679a2f3e71d9181a67b7542122c",
  "name": "document.pdf",
  "encodingFormat": "application/pdf",
  "contentSize": 1048576,
  "dateCreated": "2025-10-12T07:00:00.000Z",
  "dateModified": "2025-10-12T07:00:00.000Z",
  "creator": {
    "@type": "Person",
    "name": "John Doe"
  },
  "description": "Project requirements document",
  "url": "/attachments/a87ff679a2f3e71d9181a67b7542122c",
  "mentions": [
    {
      "@type": "WebPage",
      "name": "ProjectDocs"
    }
  ]
}
```

---

## Backup and Restore

### How BackupManager Integration Works

AttachmentManager integrates seamlessly with BackupManager:

1. __BackupManager__ calls `backup()` on all registered managers
2. __AttachmentManager__ delegates to current provider's `backup()`
3. __Provider__ returns all metadata and references to files
4. __BackupManager__ aggregates data into compressed backup file

### Backup Data Structure

```json
{
  "AttachmentManager": {
    "provider": "BasicAttachmentProvider",
    "version": "1.0.0",
    "timestamp": "2025-10-12T07:00:00.000Z",
    "attachments": [
      {
        "@context": "https://schema.org",
        "@type": "CreativeWork",
        "identifier": "a87ff679...",
        "name": "document.pdf",
        ...
      }
    ],
    "providerData": {
      "storageDirectory": "./data/attachments",
      "fileCount": 42,
      "totalSize": 10485760
    }
  }
}
```

### Backup Best Practices

1. __Regular Backups__: Schedule daily backups via BackupManager
2. __Include Files__: Ensure backup includes actual attachment files, not just metadata
3. __Test Restores__: Periodically test restore procedures
4. __Off-site Storage__: Store backups in different location from attachments
5. __Version Control__: Keep multiple backup versions

### Manual Backup Example

```javascript
// Create backup
const backupManager = engine.getManager('BackupManager');
const backupPath = await backupManager.backup();
console.log(`Backup created: ${backupPath}`);

// Restore from backup
await backupManager.restore(backupPath);
console.log('Restore completed');
```

---

## Future Providers

### Creating a Custom Provider

To create a custom attachment provider:

1. __Extend BaseAttachmentProvider__
2. __Implement all required methods__
3. __Use ConfigurationManager for all configuration__
4. __Follow lowercase configuration pattern__
5. __Add provider to normalization map in AttachmentManager__

### Example: CustomAttachmentProvider

```javascript
const BaseAttachmentProvider = require('./BaseAttachmentProvider');
const logger = require('../utils/logger');

class CustomAttachmentProvider extends BaseAttachmentProvider {
  constructor(engine) {
    super(engine);
    this.storageBackend = null;
  }

  async initialize() {
    const configManager = this.engine.getManager('ConfigurationManager');

    // Load configuration (ALL LOWERCASE)
    const endpoint = configManager.getProperty(
      'ngdpbase.attachment.provider.custom.endpoint',
      'http://localhost:8080'
    );
    const apiKey = configManager.getProperty(
      'ngdpbase.attachment.provider.custom.apikey',
      ''
    );

    // Initialize storage backend
    this.storageBackend = new StorageClient({ endpoint, apiKey });
    await this.storageBackend.connect();

    this.initialized = true;
    logger.info('[CustomAttachmentProvider] Initialized');
  }

  async storeAttachment(fileBuffer, fileInfo, metadata, user) {
    // Implementation
  }

  async getAttachment(attachmentId) {
    // Implementation
  }

  // Implement all other required methods...

  getProviderInfo() {
    return {
      name: 'CustomAttachmentProvider',
      version: '1.0.0',
      description: 'Custom storage provider',
      features: ['custom-feature-1', 'custom-feature-2']
    };
  }
}

module.exports = CustomAttachmentProvider;
```

### Configuration for Custom Provider

```json
{
  "ngdpbase.attachment.provider": "customattachmentprovider",
  "ngdpbase.attachment.provider.custom.endpoint": "http://storage.example.com",
  "ngdpbase.attachment.provider.custom.apikey": "${STORAGE_API_KEY}",
  "ngdpbase.attachment.provider.custom.timeout": 30000,
  "ngdpbase.attachment.provider.custom.retries": 3
}
```

### Update AttachmentManager Normalization

Add your provider to the normalization map:

```javascript
#normalizeProviderName(providerName) {
  const knownProviders = {
    'basicattachmentprovider': 'BasicAttachmentProvider',
    'databaseattachmentprovider': 'DatabaseAttachmentProvider',
    's3attachmentprovider': 'S3AttachmentProvider',
    'azureblobattachmentprovider': 'AzureBlobAttachmentProvider',
    'customattachmentprovider': 'CustomAttachmentProvider' // Add here
  };

  if (knownProviders[lower]) {
    return knownProviders[lower];
  }

  // Fallback logic...
}
```

---

## Best Practices

### Configuration

1. __Always Use Lowercase Keys__: All configuration keys must be lowercase
2. __Use Provider Fallback__: Always set both `.provider.default` and `.provider`
3. __Environment Variables__: Use environment variables for sensitive values (API keys)
4. __Custom Config__: Put custom settings in `app-custom-config.json`, not defaults

### Security

1. __Permission Checking__: Always pass user context for uploads/deletes
2. __File Type Validation__: Configure `allowedtypes` to restrict dangerous files
3. __Size Limits__: Set appropriate `maxsize` based on server capacity
4. __Access Control__: Use PolicyManager to define attachment permissions

### Performance

1. __Content Deduplication__: Enable hash-based deduplication to save space
2. __Metadata Caching__: Enable `cachemetadata` for faster lookups
3. __Thumbnail Generation__: Enable thumbnails for image-heavy wikis
4. __Provider Selection__: Choose provider based on scale and requirements

### Maintenance

1. __Regular Backups__: Schedule automated backups via BackupManager
2. __Monitor Storage__: Track attachment count and total size
3. __Cleanup Orphans__: Periodically remove attachments not referenced by any page
4. __Test Providers__: Test provider functionality after configuration changes

---

## Troubleshooting

### AttachmentManager Won't Initialize

__Symptom:__ AttachmentManager fails to initialize with error

__Possible Causes:__

1. ConfigurationManager not available
2. Invalid provider name
3. Provider file not found
4. Configuration keys have uppercase characters

__Solution:__

```javascript
// Check ConfigurationManager
const configManager = engine.getManager('ConfigurationManager');
if (!configManager) {
  throw new Error('ConfigurationManager required');
}

// Verify provider name is lowercase
const providerName = configManager.getProperty('ngdpbase.attachment.provider');
console.log(`Provider: ${providerName}`); // Should be lowercase

// Check if provider file exists
const providerPath = `./src/providers/${normalizedName}.js`;
console.log(`Looking for: ${providerPath}`);
```

### Provider Name Not Normalized

__Symptom:__ Error "Cannot find module '../providers/basicattachmentprovider'"

__Cause:__ Provider name not in normalization map

__Solution:__ Add provider to `#normalizeProviderName()` method in AttachmentManager

### Uploads Failing with Permission Error

__Symptom:__ "Permission denied for attachment:upload"

__Cause:__ User lacks upload permissions in PolicyManager

__Solution:__ Check policies and user roles:

```javascript
// Verify user has upload permission
const policyManager = engine.getManager('PolicyManager');
const hasPermission = await policyManager.evaluate({
  subject: { type: 'user', value: 'username' },
  action: 'attachment:upload',
  resource: { type: 'attachment' }
});
```

### Attachment Not Found

__Symptom:__ `getAttachment()` returns null

__Possible Causes:__

1. Attachment ID incorrect
2. Attachment deleted
3. Provider storage corrupted
4. Metadata out of sync

__Solution:__

```javascript
// Check if attachment exists
const exists = await attachmentManager.attachmentExists(attachmentId);

// Refresh attachment list to resync
if (!exists) {
  await attachmentManager.refreshAttachmentList();
  const existsNow = await attachmentManager.attachmentExists(attachmentId);
  console.log(`After refresh: ${existsNow}`);
}
```

### Large Files Won't Upload

__Symptom:__ Upload fails for files over certain size

__Cause:__ `maxsize` configuration too small

__Solution:__ Increase max size in configuration:

```json
{
  "ngdpbase.attachment.maxsize": 52428800  // 50MB
}
```

### Storage Directory Not Created

__Symptom:__ Error "ENOENT: no such file or directory"

__Cause:__ Storage directory doesn't exist and can't be created

__Solution:__ Check permissions and create manually:

```bash
mkdir -p ./data/attachments
chmod 755 ./data/attachments
```

---

## Related Documentation

- [Configuration Refactoring Plan](../architecture/Configuration-Refactoring-Plan.md)
- [UserManager Documentation](./UserManager-Documentation.md)
- [PolicyManager Documentation](./PolicyManager-Documentation.md)
- [BackupManager Documentation](./BackupManager-Documentation.md)
- [BaseAttachmentProvider API](../../src/providers/BaseAttachmentProvider.js)
- [BasicAttachmentProvider Implementation](../../src/providers/BasicAttachmentProvider.js)

---

## Version History

| Version | Date | Changes |
| --------- | ------ | --------- |
| 1.0.0 | 2025-10-12 | Initial documentation with refactored configuration |

---

__Last Updated:__ 2025-12-20
__Maintainer:__ ngdpbase Team
__Issues:__ <https://github.com/jwilleke/ngdpbase/issues>
