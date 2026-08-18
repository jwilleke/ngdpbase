---
name: ConfigurationManager
description: Loads and merges app-default-config.json + app-custom-config.json; the single source of truth for runtime config
dateModified: '2026-05-14'
category: managers
code: src/managers/ConfigurationManager.ts
---

# ConfigurationManager

__Module:__ `src/managers/ConfigurationManager.ts`
__Complete Guide:__ [ConfigurationManager-Complete-Guide.md](ConfigurationManager-Complete-Guide.md)

---

## Overview

ConfigurationManager provides JSPWiki-compatible configuration management with a two-tier merge system. Configuration is loaded from default settings and instance-specific overrides.

## Key Features

- __Two-Tier Configuration__ - Default (read-only) + custom overrides
- __Instance Data Separation__ - Config location controlled by `INSTANCE_DATA_FOLDER`
- __Configurable Config File__ - Config filename controlled by `INSTANCE_CONFIG_FILE`
- __Property Merging__ - Custom properties override defaults automatically
- __Environment Variables__ - Docker/Traefik/Kubernetes deployment support
- __Runtime Updates__ - Change configuration via admin interface
- __Convenience Methods__ - Type-safe getters for common settings
- __Backup/Restore__ - Full configuration backup support

## Configuration Merge Order

```text
1. config/app-default-config.json                              (in codebase - required, read-only)
2. INSTANCE_DATA_FOLDER/config/{INSTANCE_CONFIG_FILE}          (instance overrides - optional)
```

__Environment Variables:__

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

## Env-var references in config values (#775, v3.38.0)

`getProperty()` resolves environment-variable references in string config values
at lookup time. Two forms — pick by use:

### `${VAR}` brace form (embedded, silent on missing) — for paths

Use inside a larger template string. The reference is resolved when the env var
is set; left literal when unset (the missing value surfaces at point-of-use,
typically with a clear filesystem error).

```json
"ngdpbase.session.storagedir":         "${FAST_STORAGE}/sessions",
"ngdpbase.page.provider.filesystem.storagedir": "${SLOW_STORAGE}/pages"
```

This is the existing form used throughout `app-default-config.json` for storage
path templates. Multiple refs per string and embedded use are both supported.

### `$VAR` bare-whole-value form (strict, throws on missing) — for secrets

The ENTIRE config value is a single env-var reference. __Throws__ at lookup time
when the var is unset — loud failure beats silent misconfiguration for credentials.

```dotenv
# .env
NASA_FIRMS_KEY=xxxxxxxx
SMTP_PASSWORD=yyyyyyyy
```

```json
// app-custom-config.json
"ngdpbase.feedManager.sources.nasa-firms.apiKey": "$NASA_FIRMS_KEY",
"ngdpbase.email.smtp.password":                   "$SMTP_PASSWORD"
```

Bare-form variable names must match the POSIX-shell convention:
uppercase letters / digits / underscores, not starting with a digit (`^\$[A-Z_][A-Z0-9_]*$`).

### `$$literal` escape hatch

For the rare value that genuinely starts with `$`:

```json
"some.key": "$$abc"   // resolves to "$abc"
```

### Log-safety: `getMaskedProperty()`

When logging config values (admin endpoints, startup banners), use
`getMaskedProperty(key, default?)` to surface `"***"` for any bare-form secret
reference. Plain literals and brace-form path templates resolve unmasked
(they're not secrets).

```typescript
logger.info(`API key configured: ${cm.getMaskedProperty('feeds.nasa.apiKey')}`);
// → "API key configured: ***"
```

### k8s / production interplay (touches #655)

Env-var refs compose cleanly with k8s `Secret` + `ConfigMap`:

```yaml
env:
  - name: NASA_FIRMS_KEY
    valueFrom:
      secretKeyRef:
        name: ngdpbase-feed-secrets
        key: nasa-firms-key
```

No code change between local-dev `.env` and prod k8s Secret — same `$VAR` syntax in config.

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
