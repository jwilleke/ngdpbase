---
name: PluginManager
description: "Plugin discovery, registration, and execution; resolves `[{PluginName ...}]` markup to handler output"
dateModified: '2026-05-14'
category: managers
code: src/managers/PluginManager.ts
---

# PluginManager

**Module:** `src/managers/PluginManager.ts`
**Extends:** [BaseManager](BaseManager.md)
**Complete Guide:** [PluginManager-Complete-Guide.md](PluginManager-Complete-Guide.md)

---

## Overview

PluginManager handles plugin discovery, registration, and execution. Similar to JSPWiki's PluginManager, it provides a plugin system for extending wiki functionality through custom plugins invoked from page content.

## Key Features

- Dynamic plugin discovery from configured search paths
- JSPWiki-style plugin naming (Search or SearchPlugin)
- Secure path validation (plugins only from allowed roots)
- Plugin metadata and information retrieval
- Support for both function-style and class-style plugins
- Optional `fetch(engine)` lifecycle — called before `execute()` so plugins can pre-load data

## Quick Example

```javascript
const pluginManager = engine.getManager('PluginManager');

// Execute a plugin
const result = await pluginManager.execute('CurrentTime', 'MainPage', {
  format: 'YYYY-MM-DD'
}, context);

// Check if plugin exists
if (pluginManager.hasPlugin('Search')) {
  // Plugin is available
}

// List all plugins
const pluginNames = pluginManager.getPluginNames();
// ['CurrentTimePlugin', 'SearchPlugin', 'IndexPlugin', ...]
```

## Plugin Invocation Syntax

In wiki pages, plugins are invoked with:

```wiki
[{PluginName param1='value1' param2='value2'}]
```

Examples:

```wiki
[{CurrentTime format='HH:mm:ss'}]
[{Search query='wiki' max=10}]
[{ReferringPages before='* ' after='\n'}]
```

## Configuration

```json
{
  "ngdpbase.managers.plugin-manager.search-paths": ["./plugins"]
}
```

## Plugin Lifecycle

Each plugin invocation follows this sequence:

1. `initialize(engine)` — called **once at startup** if present
2. `fetch(engine)` — called **before each `execute()`** if present; use to pre-load data from managers
3. `execute(context, params)` — called **each render**; returns HTML string

```ts
// Example plugin using fetch() to pre-load data
module.exports = {
  name: 'MyPlugin',
  _data: [],

  async fetch(engine) {
    const mgr = engine.getManager('MyDataManager');
    this._data = mgr ? mgr.getItems() : [];
  },

  execute(context, params) {
    return this._data.map(d => `<li>${d.title}</li>`).join('');
  }
};
```

## Related Documentation

- [Plugin Development Guide](../plugins/) - How to create plugins
- [DOMPluginHandler](../parsers/DOMPluginHandler.md) - Plugin syntax parsing
- [Generated API Docs](../api/generated/src/managers/PluginManager/README.md)
