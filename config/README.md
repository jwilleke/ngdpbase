# Configuration System

ngdpbase uses a layered configuration system inspired by JSPWiki's properties files.

## Configuration Files

Configuration files are loaded and merged in the following order (later files override earlier ones):

1. **`app-default-config.json`** - Base configuration with all defaults
2. **`app-{environment}-config.json`** - Environment-specific overrides (optional)
3. **`app-custom-config.json`** - Local custom overrides (optional, .gitignored)

## Environment Detection

The environment is determined by the `NODE_ENV` environment variable:

- `development` (default) - Loads `app-development-config.json`
- `production` - Loads `app-production-config.json`
- `test` - Loads `app-test-config.json`

## Quick Start

### For Development (with debug logging)

```bash
npm run dev
# or
NODE_ENV=development node app.js
```

### For Production

```bash
npm start
# or
NODE_ENV=production node app.js
```

### For Testing

```bash
npm test
```

## Local Customization

To add your own local overrides:

1. Copy the example:

   ```bash
   cp config/app-custom-config.json.example config/app-custom-config.json
   ```

2. Edit `config/app-custom-config.json` with your settings

3. Your custom config is .gitignored and won't be committed

## Environment-Specific Settings

### Development (`app-development-config.json`)

- Debug logging enabled
- Session debugging enabled
- MarkupParser enabled
- Cache disabled for live development
- Relaxed security for local testing

### Production (`app-production-config.json`)

- Info-level logging only
- All debug logging disabled
- Secure session cookies
- Cache enabled for performance
- Enhanced security settings
- MarkupParser enabled

### Test (`app-test-config.json`)

- Warning-level logging only
- Fast sessions
- In-memory storage
- Features disabled for speed

## Configuration Priority Example

If you have:

- `app-default-config.json`: `{ "ngdpbase.port": 3000 }`
- `app-development-config.json`: `{ "ngdpbase.port": 3001 }`
- `app-custom-config.json`: `{ "ngdpbase.port": 8080 }`

Result in development: `port = 8080` (custom wins)

## Key Configuration Properties

### Application

- `ngdpbase.application-name` - Site name
- `ngdpbase.application.base-url` - Base URL for the wiki
- `ngdpbase.port` - HTTP port (default: 3000)

### Logging

- `ngdpbase.logging.level` - `debug`, `info`, `warn`, `error`
- `ngdpbase.logging.debug.enabled` - Master debug flag
- `ngdpbase.logging.debug.session` - Session debugging
- `ngdpbase.logging.debug.login` - Login debugging

### Rendering

- `ngdpbase.rendering.useAdvancedParser` - Enable MarkupParser
- `ngdpbase.rendering.logParsingMethod` - Log which parser is used

### Security

- `ngdpbase.session.cookie.secure` - HTTPS-only cookies
- `ngdpbase.session.cookie.httpOnly` - No JavaScript access
- `ngdpbase.session.cookie.sameSite` - CSRF protection

### Performance

- `ngdpbase.cache.enabled` - Enable caching
- `ngdpbase.cache.ttl` - Cache time-to-live (seconds)
- `ngdpbase.search.indexOnStartup` - Build search index on start

## Best Practices

1. **Never modify `app-default-config.json` directly** - It's the base template
2. **Use environment configs for environment-specific settings** - Debug flags, URLs, etc.
3. **Use custom config for personal/local settings** - Ports, paths, secrets
4. **Comment fields starting with `_` are ignored** - Use for documentation
5. **Keep secrets out of environment configs** - They're committed to git
6. **Use environment variables for sensitive data** - Database passwords, API keys

## Checking Active Configuration

The system logs at startup:

```
📋 ConfigurationManager initialized for environment: development
📋 Loaded configs: default + environment + custom
```

To see all merged config values, use ConfigurationManager methods in code:

```javascript
const configManager = engine.getManager('ConfigurationManager');
const port = configManager.getProperty('ngdpbase.port');
```
