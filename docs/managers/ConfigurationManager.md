---
name: ConfigurationManager
description: Loads and merges app-default-config.json + app-custom-config.json; the single source of truth for runtime config
dateModified: '2026-05-14'
category: managers
code: src/managers/ConfigurationManager.ts
---

# ConfigurationManager

**Module:** `src/managers/ConfigurationManager.ts`
**Complete Guide:** [ConfigurationManager-Complete-Guide.md](ConfigurationManager-Complete-Guide.md)

---

## Overview

ConfigurationManager provides JSPWiki-compatible configuration management with a two-tier merge system. Configuration is loaded from default settings and instance-specific overrides.

## Key Features

- **Two-Tier Configuration** - Default (read-only) + custom overrides
- **Instance Data Separation** - Config location controlled by `INSTANCE_DATA_FOLDER`
- **Configurable Config File** - Config filename controlled by `INSTANCE_CONFIG_FILE`
- **Property Merging** - Custom properties override defaults automatically
- **Environment Variables** - Docker/Traefik/Kubernetes deployment support
- **Runtime Updates** - Change configuration via admin interface
- **Convenience Methods** - Type-safe getters for common settings
- **Backup/Restore** - Full configuration backup support

## Configuration Merge Order

```text
1. config/app-default-config.json                              (in codebase - required, read-only)
2. INSTANCE_DATA_FOLDER/config/{INSTANCE_CONFIG_FILE}          (instance overrides - optional)
```

**Environment Variables:**

- `INSTANCE_DATA_FOLDER` - Base path for instance data (default: `./data`, Docker: `/app/data`)
- `INSTANCE_CONFIG_FILE` - Config filename to load (default: `app-custom-config.json`)

## Quick Example

```javascript
const configManager = engine.getManager('ConfigurationManager');

// Convenience methods
const appName = configManager.getApplicationName();
const port = configManager.getServerPort();
const baseURL = configManager.getBaseURL();

// Direct property access with default
const customSetting = configManager.getProperty('ngdpbase.myfeature.enabled', true);

// Set custom property (persisted to app-custom-config.json)
await configManager.setProperty('ngdpbase.application-name', 'My Wiki');
```

## Core Methods

| Method | Returns | Description |
| -------- | --------- | ------------- |
| `getProperty(key, default)` | `any` | Get property with optional default |
| `setProperty(key, value)` | `Promise<void>` | Set and persist custom property |
| `getAllProperties()` | `Object` | Get all merged properties |
| `getCustomProperties()` | `Object` | Get only custom overrides |
| `getDefaultProperties()` | `Object` | Get default values |
| `resetToDefaults()` | `Promise<void>` | Clear all custom properties |

## Convenience Methods

| Method | Returns | Config Key |
| -------- | --------- | ------------ |
| `getApplicationName()` | `string` | `ngdpbase.application-name` |
| `getBaseURL()` | `string` | `ngdpbase.application.base-url` |
| `getFrontPage()` | `string` | `ngdpbase.front-page` |
| `getServerPort()` | `number` | `ngdpbase.server.port` |
| `getServerHost()` | `string` | `ngdpbase.server.host` |
| `getSessionSecret()` | `string` | `ngdpbase.session.secret` |
| `getSessionMaxAge()` | `number` | `ngdpbase.session.max-age` |

## Specialized Config Methods

| Method | Returns | Description |
| -------- | --------- | ------------- |
| `getManagerConfig(name)` | `Object` | Manager-specific settings |
| `getFeatureConfig(name)` | `Object` | Feature toggle and settings |
| `getLoggingConfig()` | `Object` | Logging configuration |
| `getSearchConfig()` | `Object` | Search configuration |
| `getAccessControlConfig()` | `Object` | ACL and business hours |
| `getAuditConfig()` | `Object` | Audit logging settings |
| `getRSSConfig()` | `Object` | RSS feed configuration |

## Configuration Files

| File | Location | Purpose | Edit? |
| --- | --- | --- | --- |
| `app-default-config.json` | `config/` (codebase) | Base defaults | No (read-only) |
| `app-custom-config.json` | `INSTANCE_DATA_FOLDER/config/` | Instance overrides | Yes |

## Environment Variable Overrides

For Docker/Traefik/Kubernetes deployments:

| Variable | Purpose |
| --- | --- |
| `INSTANCE_DATA_FOLDER` | Base path for all instance data (default: `./data`) |
| `INSTANCE_CONFIG_FILE` | Config filename to load (default: `app-custom-config.json`) |
| `NGDPBASE_BASE_URL` | Overrides `ngdpbase.application.base-url` |
| `NGDPBASE_HOSTNAME` | Overrides `ngdpbase.hostname` |
| `NGDPBASE_HOST` | Overrides `ngdpbase.server.host` |
| `NGDPBASE_PORT` | Overrides `ngdpbase.server.port` |

> **Future:** [#775](https://github.com/jwilleke/ngdpbase/issues/775) tracks adding **env-var-ref resolution inside `getProperty()`** so any string config value of the form `"$VARNAME"` resolves to `process.env.VARNAME` at lookup time. Lets secrets (API keys, SMTP passwords) live in `.env` instead of committed config files. Same `.env` workflow already used for `FAST_STORAGE` / `SLOW_STORAGE` / `PORT`. See the issue for the resolution rules (whole-value refs only in v1; `"$$literal"` escape; strict throw on unset).

## Admin Interface

Access `/admin/configuration` with admin privileges to:

- View all active configuration
- Edit custom overrides
- Reset properties to defaults
- Add new custom properties

## Testing

```bash
# Test configuration values
node scripts/configurationmanage-get-config.js ngdpbase.notifications.dir
node scripts/configurationmanage-get-config.js ngdpbase.notifications --prefix --pretty
```

## Related Managers

- [BaseManager](BaseManager.md) - Base manager class
- All managers depend on ConfigurationManager for settings

## Developer Documentation

For complete property reference, admin interface details, and troubleshooting:

- [ConfigurationManager-Complete-Guide.md](ConfigurationManager-Complete-Guide.md)
