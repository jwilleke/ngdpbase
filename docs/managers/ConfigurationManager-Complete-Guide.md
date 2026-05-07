# ConfigurationManager Complete Guide

**Module:** `src/managers/ConfigurationManager.ts`
**Quick Reference:** [ConfigurationManager.md](ConfigurationManager.md)

---

## Overview

The ConfigurationManager provides JSPWiki-compatible configuration management for ngdpbase. It implements a two-tier configuration system with default values and instance-specific overrides.

## Architecture

The ConfigurationManager follows JSPWiki's configuration patterns with Docker/Kubernetes support:

- **Default Configuration**: `config/app-default-config.json` contains all default settings (read-only, in codebase)
- **Custom Overrides**: `INSTANCE_DATA_FOLDER/config/{INSTANCE_CONFIG_FILE}` contains instance customizations
- **Instance Separation**: `INSTANCE_DATA_FOLDER` env var controls where instance data is stored
- **Configurable Filename**: `INSTANCE_CONFIG_FILE` env var controls which config file to load
- **Property Merging**: Custom config overrides defaults
- **Runtime Access**: Provides getter methods for commonly used configuration values
- **Admin Interface**: Web-based configuration management with validation

## Configuration Files

### File Locations

```text
config/                                    # In codebase (read-only)
├── app-default-config.json               # Base defaults (required)
└── app-custom-config.example             # Template for custom config

INSTANCE_DATA_FOLDER/config/               # Instance-specific (default: ./data/config/)
└── {INSTANCE_CONFIG_FILE}                # Custom overrides (default: app-custom-config.json)
```

**Environment Variables:**

| Variable | Default | Description |
| --- | --- | --- |
| `INSTANCE_DATA_FOLDER` | `./data` | Base path for all instance data |
| `INSTANCE_CONFIG_FILE` | `app-custom-config.json` | Config filename to load |

**Deployment examples:**

- **Local development**: `INSTANCE_DATA_FOLDER=./data`
- **Docker**: `INSTANCE_DATA_FOLDER=/app/data`
- **Kubernetes**: `INSTANCE_DATA_FOLDER=/app/data` (mounted PVC)

### config/app-default-config.json

Contains all default configuration properties. This file should not be modified directly.

**Key sections:**

```json
{
  "ngdpbase.application-name": "ngdpbase",
  "ngdpbase.version": "1.3.2",
  "ngdpbase.application.base-url": "http://localhost:3000",
  "ngdpbase.server.port": 3000,
  "ngdpbase.server.host": "localhost",
  "ngdpbase.session.secret": "ngdpbase-session-secret-change-in-production",
  "ngdpbase.session.max-age": 86400000,
  "ngdpbase.front-page": "Welcome",
  "ngdpbase.pageProvider": "FileSystemProvider",
  "ngdpbase.searchProvider": "LuceneSearchProvider"
}
```

### INSTANCE_DATA_FOLDER/config/app-custom-config.json

Contains custom overrides for default properties. Created by installation wizard or manually.

**Example:**

```json
{
  "_comment": "This file overrides values from app-default-config.json",
  "ngdpbase.application-name": "My Custom Wiki",
  "ngdpbase.application.base-url": "https://wiki.mycompany.com",
  "ngdpbase.server.port": 8080,
  "ngdpbase.front-page": "CustomHomePage"
}
```

## How to Test ConfigurationManager

You can test `src/managers/ConfigurationManager.ts` with the test script:

```bash
node scripts/configurationmanage-get-config.js <key> [--prefix] [--pretty]
```

Examples:

```bash
node scripts/configurationmanage-get-config.js ngdpbase.notifications.dir
node scripts/configurationmanage-get-config.js ngdpbase.notifications --prefix --pretty
```

## Property Naming Convention

All properties follow JSPWiki's naming convention:

- **Namespace prefix**: `ngdpbase.` or `log4j.`
- **Hierarchical structure**: Use dots to separate levels
- **Descriptive names**: Clear, self-documenting property names

**Examples:**

- `ngdpbase.server.port` - Server configuration
- `ngdpbase.session.max-age` - Session settings
- `ngdpbase.rss.generate` - RSS feed settings
- `ngdpbase.translatorReader.allowHTML` - Content processing

## API Reference

### ConfigurationManager Class

#### Core Methods

##### `initialize()`

Initializes the ConfigurationManager by loading and merging configuration files.

##### `getProperty(key, defaultValue = null)`

Gets a configuration property value with optional default.

**Parameters:**

- `key` (string): Property key (e.g., 'ngdpbase.application-name')
- `defaultValue` (any): Default value if property not found

**Returns:** any - Property value or default

##### `setProperty(key, value)`

Sets a custom configuration property (saves to `INSTANCE_DATA_FOLDER/config/app-custom-config.json`).

**Parameters:**

- `key` (string): Property key
- `value` (any): Property value

##### `getAllProperties()`

Gets merged configuration properties (defaults + environment + custom overrides).

**Returns:** object - Complete merged configuration

##### `getInstanceDataFolder()`

Gets the resolved path to the instance data folder.

**Returns:** string - Absolute path to instance data folder

```javascript
const dataFolder = configManager.getInstanceDataFolder();
// Returns '/app/data' in Docker, or resolved './data' locally
```

##### `resolveDataPath(relativePath)`

Resolves a path relative to the instance data folder.

**Parameters:**

- `relativePath` (string): Path relative to instance data folder (e.g., './pages')

**Returns:** string - Absolute path

```javascript
const pagesDir = configManager.resolveDataPath('./pages');
// Returns '/app/data/pages' in Docker
```

##### `getDefaultProperties()`

Gets default properties from app-default-config.json.

**Returns:** object - Default configuration properties

##### `getCustomProperties()`

Gets custom override properties from app-custom-config.json.

**Returns:** object - Custom configuration overrides

#### Convenience Methods

##### Application Settings

```javascript
getApplicationName()    // ngdpbase.application-name
getBaseURL()           // ngdpbase.application.base-url
getFrontPage()         // ngdpbase.front-page
getEncoding()          // ngdpbase.encoding
```

##### Server Settings

```javascript
getServerPort()        // ngdpbase.server.port (as number)
getServerHost()        // ngdpbase.server.host
```

##### Session Settings

```javascript
getSessionSecret()     // ngdpbase.session.secret
getSessionMaxAge()     // ngdpbase.session.max-age (as number)
getSessionSecure()     // ngdpbase.session.secure (as boolean)
getSessionHttpOnly()   // ngdpbase.session.http-only (as boolean)
```

##### RSS Settings

```javascript
getRSSConfig()         // Complete RSS configuration object
```

## Configuration Categories

### Application Configuration

**Core application settings:**

```json
{
  "ngdpbase.application-name": "ngdpbase",
  "ngdpbase.version": "1.3.2",
  "ngdpbase.application.base-url": "http://localhost:3000",
  "ngdpbase.encoding": "UTF-8",
  "ngdpbase.front-page": "Welcome",
  "ngdpbase.templateDir": "default"
}
```

### Server Configuration

**Server and network settings:**

```json
{
  "ngdpbase.server.port": 3000,
  "ngdpbase.server.host": "localhost",
  "ngdpbase.session.secret": "ngdpbase-session-secret-change-in-production",
  "ngdpbase.session.max-age": 86400000,
  "ngdpbase.session.secure": false,
  "ngdpbase.session.http-only": true
}
```

### Provider Configuration

**Data and service providers:**

```json
{
  "ngdpbase.pageProvider": "FileSystemProvider",
  "ngdpbase.attachment.provider": "BasicAttachmentProvider",
  "ngdpbase.searchProvider": "LuceneSearchProvider",
  "ngdpbase.diff-provider": "TraditionalDiffProvider",
  "ngdpbase.userdatabase": "JSONUserDatabase",
  "ngdpbase.groupdatabase": "JSONGroupDatabase"
}
```

### Feature Configuration

**Feature toggles and settings:**

```json
{
  "ngdpbase.rss.generate": true,
  "ngdpbase.rss.file-name": "rss.xml",
  "ngdpbase.rss.interval": 3600,
  "ngdpbase.translatorReader.allowHTML": false,
  "ngdpbase.plugin.searchresult.showScore": true,
  "ngdpbase.plugin.versioning.use": true
}
```

## Admin Interface

### Configuration Management Dashboard

Access at `/admin/configuration` with admin privileges.

**Features:**

#### Current Configuration Tab

- View all active configuration (merged defaults + custom)
- See source of each property (Default or Custom)
- Real-time configuration state

#### Custom Overrides Tab

- Edit existing custom properties
- Remove custom overrides
- Reset individual properties to defaults
- Bulk reset all properties

#### Default Values Tab

- Browse all default configuration values
- Read-only view of app-default-config.json
- Reference for available properties

#### Add Property Tab

- Add new custom configuration properties
- Property name validation
- Supports ngdpbase.*and log4j.* prefixes

### Property Validation

The admin interface validates:

- **Property names** must start with `ngdpbase.` or `log4j.`
- **Property values** are properly formatted
- **Duplicate properties** are handled correctly

## Integration Examples

### Using Configuration in Managers

```javascript
class MyManager extends BaseManager {
  async initialize() {
    const configManager = this.engine.getManager('ConfigurationManager');

    // Use convenience methods
    const appName = configManager.getApplicationName();
    const port = configManager.getServerPort();

    // Use direct property access
    const customSetting = configManager.getProperty('ngdpbase.mymanager.enabled', true);
  }
}
```

### Runtime Configuration Updates

```javascript
// Update server configuration
const configManager = engine.getManager('ConfigurationManager');
await configManager.setProperty('ngdpbase.server.port', 8080);

// Configuration is automatically saved to INSTANCE_DATA_FOLDER/config/app-custom-config.json
```

### Application Startup

```javascript
// app.js integration
async function initializeWikiEngine() {
  const engine = new WikiEngine();
  await engine.initialize();

  // Get configured values
  const configManager = engine.getManager('ConfigurationManager');
  const port = configManager.getServerPort();
  const baseURL = configManager.getBaseURL();

  console.log(`🔧 Using configured port: ${port}`);
  console.log(`🔧 Using configured baseURL: ${baseURL}`);
}
```

## Deployment Configuration

### Development

File: `./data/config/app-custom-config.json`

```json
{
  "ngdpbase.server.port": 3000,
  "ngdpbase.application.base-url": "http://localhost:3000",
  "ngdpbase.session.secure": false
}
```

### Production

File: `INSTANCE_DATA_FOLDER/config/app-custom-config.json`

```json
{
  "ngdpbase.server.port": 80,
  "ngdpbase.application.base-url": "https://wiki.mycompany.com",
  "ngdpbase.session.secure": true,
  "ngdpbase.session.secret": "production-secret-key-change-this"
}
```

### Using Different Config Files

Use `INSTANCE_CONFIG_FILE` to load a different config file:

```bash
# Load staging config
INSTANCE_CONFIG_FILE=app-staging-config.json node app.js

# Load test config
INSTANCE_CONFIG_FILE=app-test-config.json npm test
```

### Docker/Kubernetes Deployments

For containerized deployments, configuration can be provided via:

- **Environment variables**: `NGDPBASE_BASE_URL`, `NGDPBASE_PORT`, etc.
- **Volume mount**: Mount config file to `INSTANCE_DATA_FOLDER/config/`
- **ConfigMap (K8s)**: Mount ConfigMap as config file
- **Installation wizard**: Complete wizard on first access (writes to PVC)

```yaml
# Kubernetes example
env:
  - name: INSTANCE_DATA_FOLDER
    value: "/app/data"
  - name: INSTANCE_CONFIG_FILE
    value: "app-custom-config.json"
volumeMounts:
  - name: ngdpbase-data
    mountPath: /app/data
```

## Property Migration

When adding new configuration properties:

1. **Add to app-default-config.json** with sensible defaults
2. **Update ConfigurationManager** with getter method if commonly used
3. **Document the property** in this documentation
4. **Update admin interface** if UI changes needed

## Security Considerations

### Session Security

**Important session-related properties:**

```json
{
  "ngdpbase.session.secret": "change-in-production",
  "ngdpbase.session.secure": true,    // HTTPS only
  "ngdpbase.session.http-only": true,  // No JavaScript access
  "ngdpbase.session.max-age": 86400000 // 24 hours
}
```

### Access Control

- Configuration management requires admin privileges
- Property validation prevents unauthorized settings
- Sensitive properties should be documented as security-critical

## Performance

### Configuration Loading

- Configuration loaded once at startup
- Changes require restart (except via admin interface)
- Merged configuration cached in memory
- File I/O only on property changes

### Property Access

- Getter methods are fast (direct object access)
- No database queries or network calls
- Type conversion handled automatically

## JSPWiki Compatibility

The ConfigurationManager maintains compatibility with JSPWiki patterns:

| Feature | JSPWiki | ngdpbase |
| --------- | --------- | ---------- |
| Property Format | `jspwiki.property` | `ngdpbase.property` |
| Two-tier Config | Yes | Yes ✓ |
| Property Merging | Yes | Yes ✓ |
| Admin Interface | Basic | Enhanced ✓ |
| Runtime Updates | Limited | Full ✓ |

## Troubleshooting

### Common Issues

**Configuration not loading:**

- Check JSON syntax in configuration files
- Verify file permissions
- Review startup logs for errors

**Properties not taking effect:**

- Restart server after manual file changes
- Use admin interface for immediate updates
- Check property name spelling

**Admin interface errors:**

- Verify admin privileges
- Check CSRF token issues
- Review property validation rules

### Debug Information

```javascript
const configManager = engine.getManager('ConfigurationManager');

// Check property sources
const allProps = configManager.getAllProperties();
const customProps = configManager.getCustomProperties();
const defaultProps = configManager.getDefaultProperties();

console.log('Custom overrides:', Object.keys(customProps));
console.log('Total properties:', Object.keys(allProps).length);
```

## Best Practices

### Property Naming

- Use descriptive, hierarchical names
- Follow `ngdpbase.category.subcategory.property` pattern
- Avoid abbreviations in property names

### Default Values

- Always provide sensible defaults
- Document expected property types
- Use consistent value formats

### Custom Overrides

- Only override what's necessary
- Document custom configurations
- For Docker/K8s: use ConfigMap or volume mounts for `app-custom-config.json`
- For local dev: `INSTANCE_DATA_FOLDER/config/app-custom-config.json` (default: `./data/config/`)

### Security

- Change default secrets in production
- Use environment-appropriate security settings
- Regularly audit configuration for sensitive data
