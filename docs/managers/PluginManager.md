---
name: PluginManager
description: "Plugin discovery, registration, and execution; resolves `[{PluginName ...}]` markup to handler output"
dateModified: '2026-10-16'
category: managers
code: src/managers/PluginManager.ts
---

# PluginManager

__Module:__ `src/managers/PluginManager.ts`
__Extends:__ [BaseManager](BaseManager.md)
__Complete Guide:__ [PluginManager-Complete-Guide.md](PluginManager-Complete-Guide.md)

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

1. `initialize(engine)` — called __once at startup__ if present
2. `fetch(engine)` — called __before each `execute()`__ if present; use to pre-load data from managers
3. `execute(context, params)` — called __each render__ that is not served from the page cache; returns HTML string

## Plugins and the Page Cache

A rendered page is cached by the markup parser and re-rendered when data it read changes ([caching-developer-guide.md](../guides/caching-developer-guide.md)). A plugin declares nothing for the managers it uses:

- While a page is being cached, `context.engine` is a tracked engine: every `getManager(name)` records `name` as data the render read, so the page re-renders after that manager bumps its topic.
- The engine passed to `initialize(engine)` is not tracked; keep no manager reference from it. `fetch(engine)` and `execute` get the tracked engine for this render.
- `context.dependsOn(topic)` declares data that is not reached through a manager.
- Output that drifts with time calls `context.dependsOn(CLOCK_TOPIC)` (`'Clock'`, from `src/cache/CacheDependencies.ts`): the page re-renders at most once a minute. `CurrentTime` (to the minute), `Uptime`, `Sessions` and `AppHealth` do this.
- Only output that differs on every request sets `volatile: true` on the plugin object (as `Counter` does) or calls `context.markVolatile()` (as `CurrentTime` does when it shows seconds). That page is rendered on every request and never stored.

```ts
module.exports = {
  name: 'MyPlugin',

  execute(context, params) {
    // Tracked: the page re-renders after MyDataManager bumps its topic.
    const mgr = context.engine.getManager('MyDataManager');
    const items = mgr ? mgr.getItems() : [];
    return items.map(d => `<li>${d.title}</li>`).join('');
  }
};
```

## Formatters

PluginManager owns the plugin formatter helpers in `src/utils/pluginFormatters.ts` ([#1820](https://github.com/jwilleke/ngdpbase/issues/1820)). It holds them as one frozen object, `formatters`, whose members are the module's exported functions and constants themselves, not wrappers. The reference for each helper is [plugin-formatters.md](../plugins/plugin-formatters.md).

- A plugin receives them in every run as `context.formatters`, for example `context.formatters.formatAsTable(headers, rows)`.
- Code that is not a plugin, such as a route, reads `engine.getManager('PluginManager').formatters`.
- Types (`PageLink`, `TableOptions`, `FormOption` and the rest) stay importable from the module with `import type`.
- Nothing else value-imports the module: `npm run lint:addons` fails on a value import of it from any file but `src/managers/PluginManager.ts`, in core and add-on code alike (tests are exempt). A plugin's module-level helper takes the formatters as a parameter from `execute`.
- Tests get the same frozen object from `src/test-support/plugins.ts`: `asExecuted(plugin)` runs `execute` with `formatters` in the context, and `TEST_PLUGIN_MANAGER` is a mock engine's `PluginManager`.

The helpers fall into four groups:

- __Parameter parsers__: `parseMaxParam`, `parseBoolParam`, `parseSortParam`, `parsePageParam`, `parsePageSizeParam`, `parsePlacementParam`, `splitParam`, `resolveUserParam`, `resolveCurrentKeyword`.
- __Output builders__: `formatAsTable`, `formatAsList`, `formatAsCount`, `applyMax`, `applyPagination`, `formatPaginationNav`, `formatPaginationLinks`, `formatStatFilters`, `placementClass`.
- __Value formatting__: `escapeHtml`, `formatMoney`, `formatDuration`, `formatDateTime`, `formatRelativeTime`, `extractExcerpt`, `simpleSlug`, `shuffleArray`.
- __Plugin-to-manager conventions__: `resolveManagerFetch` reaches only a manager's `toMarqueeText` (`FETCHABLE_METHOD`), and `resolveManagerOptions` reaches only its `toFormOptions` (`FORM_OPTIONS_METHOD`). Page text names the manager, so no other method is reachable, and the viewer's context goes with each call.

```ts
module.exports = {
  name: 'MyPlugin',

  execute(context, params) {
    const { escapeHtml, parseMaxParam } = context.formatters;
    const max = parseMaxParam(params.max, 10);
    return `<p>${escapeHtml(context.pageName)}: ${max}</p>`;
  }
};
```

## Related Documentation

- [Plugin Development Guide](../plugins/) - How to create plugins
- [DOMPluginHandler](../parsers/DOMPluginHandler.md) - Plugin syntax parsing
- [Generated API Docs](../api/generated/src/managers/PluginManager/README.md)
