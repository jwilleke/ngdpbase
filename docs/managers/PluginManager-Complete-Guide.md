# PluginManager Complete Guide

__Module:__ `src/managers/PluginManager.js`
__Quick Reference:__ [PluginManager.md](PluginManager.md)
__Generated API:__ [API Docs](../api/generated/src/managers/PluginManager/README.md)

---

## Table of Contents

1. [Architecture](#architecture)
2. [Initialization](#initialization)
3. [Configuration](#configuration)
4. [Plugin Discovery](#plugin-discovery)
5. [Plugin Execution](#plugin-execution)
6. [Plugin Lookup](#plugin-lookup)
7. [Security](#security)
8. [API Reference](#api-reference)
9. [Creating Plugins](#creating-plugins)

---

## Architecture

```text
┌─────────────────────────────────────────────────────────┐
│                    PluginManager                         │
│  - registerPlugins()                                     │
│  - loadPlugin(path)                                      │
│  - execute(name, pageName, params, context)             │
│  - findPlugin(name)                                      │
└────────────────┬────────────────────────────────────────┘
                 │
         ┌───────┼───────┐
         ▼       ▼       ▼
┌─────────────┐ ┌──────────────┐ ┌──────────────┐
│ ConfigMgr   │ │ plugins/     │ │ WikiContext  │
│ (paths)     │ │ (files)      │ │ (execution)  │
└─────────────┘ └──────────────┘ └──────────────┘
```

### Properties

| Property | Type | Description |
| ---------- | ------ | ------------- |
| `plugins` | `Map<string, Object>` | Registered plugins by name |
| `searchPaths` | `string[]` | Directories to search for plugins |
| `allowedRoots` | `string[]` | Validated root paths for security |

---

## Initialization

```javascript
async initialize(config = {}) {
  await super.initialize(config);
  await this.registerPlugins();
}
```

During initialization:

1. Gets search paths from ConfigurationManager
2. Validates each path exists and is a directory
3. Scans for `.js` files (excluding `.test.js`)
4. Loads and registers each valid plugin

---

## Configuration

Plugin search paths come from ConfigurationManager:

```json
{
  "ngdpbase.managers.plugin-manager.search-paths": ["./plugins"]
}
```

| Property | Type | Description |
| ---------- | ------ | --------- |
| `ngdpbase.managers.plugin-manager.search-paths` | string[] \| string | Directories to search for plugins |

__Note:__ No hardcoded fallbacks. If not configured, no plugins are loaded.

---

## Plugin Discovery

### registerPlugins()

Discover and register all plugins from configured paths.

```javascript
async registerPlugins()
```

__Process:__

1. Get search paths from ConfigurationManager
2. Accept array or comma-separated string
3. Resolve and validate each path
4. Use `fs.realpath()` for symlink resolution
5. Enumerate `.js` files (excluding `.test.js`)
6. Call `loadPlugin()` for each file

---

### loadPlugin(pluginPath)

Load a single plugin from a validated path.

```javascript
async loadPlugin(pluginPath)
```

__Parameters:__

- `pluginPath` - Path to the plugin file

__Security checks:__

- Resolves canonical path via `fs.realpath()`
- Verifies path is within allowed roots
- Blocks plugins outside allowed directories

__Plugin loading:__

- Uses `require()` to load the module
- Supports both default exports and named exports
- Calls `plugin.initialize(engine)` if available
- Stores in `plugins` Map by name

---

## Plugin Execution

### execute(pluginName, pageName, params, context)

Execute a plugin and return its output.

```javascript
async execute(pluginName, pageName, params, context = {})
```

__Parameters:__

| Parameter | Type | Description |
| ----------- | ------ | ------------- |
| `pluginName` | string | Name of the plugin |
| `pageName` | string | Current page name |
| `params` | Object | Parsed plugin parameters |
| `context` | Object | Additional context (WikiContext) |

__Returns:__ `string` - Plugin output (HTML or text)

__Execution flow:__

1. Find plugin using `findPlugin()`
2. Build context with engine, pageName, linkGraph
3. If plugin has `execute()` method, call it
4. If plugin is a function, call it directly
5. Return result or error message

__Example:__

```javascript
const result = await pluginManager.execute(
  'CurrentTime',
  'MainPage',
  { format: 'YYYY-MM-DD HH:mm' },
  wikiContext
);
```

---

## Plugin Lookup

### findPlugin(pluginName)

Find a plugin by name with JSPWiki-style name resolution.

```javascript
findPlugin(pluginName)
```

__Parameters:__

- `pluginName` - Name to search for

__Returns:__ `Object|null` - Plugin object or null

__Resolution order:__

1. Exact match (case-sensitive)
2. Case-insensitive match
3. With "Plugin" suffix added (e.g., "Search" → "SearchPlugin")
4. Without "Plugin" suffix (e.g., "SearchPlugin" → "Search")

__Examples:__

```javascript
// All of these find SearchPlugin:
pluginManager.findPlugin('SearchPlugin');    // Exact
pluginManager.findPlugin('searchplugin');    // Case-insensitive
pluginManager.findPlugin('Search');          // Without suffix
pluginManager.findPlugin('search');          // Case-insensitive without suffix
```

---

### hasPlugin(pluginName)

Check if a plugin exists.

```javascript
hasPlugin(pluginName)
```

__Returns:__ `boolean`

---

### getPluginNames()

Get all registered plugin names.

```javascript
getPluginNames()
```

__Returns:__ `Array<string>`

---

### getPluginInfo(pluginName)

Get plugin metadata.

```javascript
getPluginInfo(pluginName)
```

__Returns:__

```javascript
{
  name: 'SearchPlugin',
  description: 'Search wiki pages',
  author: 'ngdpbase',
  version: '1.0.0'
}
```

---

## Security

### Path Validation

PluginManager implements strict path validation:

1. __Allowed roots only:__ Only paths from config are allowed
2. __Canonical paths:__ Uses `fs.realpath()` to resolve symlinks
3. __Prefix checking:__ File path must start with allowed root + separator
4. __No traversal:__ Prevents `../` attacks via canonical resolution

__Example attack prevention:__

```javascript
// This would be blocked:
await pluginManager.loadPlugin('../../../etc/malicious.js');
// Error: blocked plugin outside allowed roots
```

### Plugin Sandboxing

- Plugins run in same Node.js process (no VM isolation)
- Trust plugins from your configured paths
- Review third-party plugins before installation

---

## API Reference

### Discovery Methods

| Method | Parameters | Returns |
| -------- | ------------ | --------- |
| `registerPlugins()` | - | `Promise<void>` |
| `loadPlugin(pluginPath)` | string | `Promise<void>` |

### Execution Methods

| Method | Parameters | Returns |
| -------- | ------------ | --------- |
| `execute(name, page, params, ctx)` | string, string, Object, Object | `Promise<string>` |

### Query Methods

| Method | Parameters | Returns |
| -------- | ------------ | --------- |
| `findPlugin(name)` | string | `Object\|null` |
| `hasPlugin(name)` | string | `boolean` |
| `getPluginNames()` | - | `string[]` |
| `getPluginInfo(name)` | string | `Object\|null` |

---

## Creating Plugins

### Class-Style Plugin (Recommended)

```javascript
// plugins/MyPlugin.js
class MyPlugin {
  static name = 'MyPlugin';
  static description = 'Does something useful';
  static author = 'Your Name';
  static version = '1.0.0';

  static async initialize(engine) {
    // Optional: access engine during init
  }

  static async execute(context, params) {
    const { engine, pageName, linkGraph } = context;
    const { param1, param2 } = params;

    // Your plugin logic here
    return `<div>Plugin output for ${pageName}</div>`;
  }
}

module.exports = MyPlugin;
```

### Function-Style Plugin (Legacy)

```javascript
// plugins/SimplePlugin.js
async function SimplePlugin(pageName, params, linkGraph) {
  return `Hello from ${pageName}!`;
}

SimplePlugin.name = 'SimplePlugin';
SimplePlugin.description = 'A simple plugin';

module.exports = SimplePlugin;
```

### Plugin Parameters

Parameters are parsed from wiki syntax and passed as an object:

__Wiki syntax:__

```wiki
[{MyPlugin foo='bar' count=5 enabled=true}]
```

__Received params:__

```javascript
{
  foo: 'bar',
  count: 5,
  enabled: true
}
```

### Plugin Context

The `context` object contains:

| Property | Type | Description |
| ---------- | ------ | ------------- |
| `engine` | WikiEngine | Wiki engine instance |
| `pageName` | string | Current page name |
| `linkGraph` | Object | Page link graph |
| (spread) | various | All WikiContext properties |

---

## Notes

- __No hardcoded paths:__ All search paths must be configured
- __Case-insensitive:__ Plugin names resolved case-insensitively
- __JSPWiki compatible:__ Supports `Search` or `SearchPlugin` naming
- __Async execution:__ All plugin execution is async

---

## Related Documentation

- [PluginManager.md](PluginManager.md) - Quick reference
- [Plugin Development](../plugins/) - Plugin guides
- [DOMPluginHandler](../parsers/DOMPluginHandler.md) - Syntax parsing
- [Built-in Plugins](../plugins/) - Available plugins
