---
name: IndexPlugin
description: Generates an alphabetical index of all wiki pages
dateModified: '2026-09-07'
category: plugins
code: src/plugins/IndexPlugin.ts
relatedModules:
  - PluginManager
  - PageManager
version: 1.0.0
---

# IndexPlugin

Generates an alphabetical index of all wiki pages with filtering support.

## Overview

The IndexPlugin creates a navigable alphabetical index of wiki pages, similar to JSPWiki's IndexPlugin. Pages are grouped by first letter with jump links for easy navigation. Supports include/exclude regex patterns for filtering.

__Source:__ `plugins/IndexPlugin.js`

## Plugin Metadata

| Property | Value |
| ---------- | ------- |
| Name | IndexPlugin |
| Author | ngdpbase |
| Version | 1.0.0 |
| JSPWiki Compatible | Yes |

## Usage

### Basic Syntax

```wiki
[{IndexPlugin}]
```

Shows all pages in alphabetical order.

### With Filters

```wiki
[{IndexPlugin include='^Doc.*' exclude='.*Test.*'}]
```

## Parameters

| Parameter | Type | Default | Required | Description |
| ----------- | ------ | --------- | ---------- | ------------- |
| include | string | - | No | Regex pattern to include pages |
| exclude | string | - | No | Regex pattern to exclude pages |
| pageSize | number | `250` | No | Entries per page. `0` renders the whole index. |
| page | number | `1` | No | Which page to show, when not navigating by query string. |

### Why the index is paged by default (#1305)

The plugin used to render every page it had; on a 17,742-page instance that was
the whole index in one response. The bound is therefore on by default, and a
caller who wants the complete list asks for it with `pageSize='0'`.

Grouping is applied to the page, not before it: a letter with more entries than
`pageSize` spans several pages, and the jump-to links cover the letters on the
page you are looking at. The count reads `250 of 17,742 pages` so the bound is
visible rather than implied.

Page links are the canonical control from `pluginFormatters`, so keyboard and
swipe come from `WikiPagination` without this plugin wiring anything. They
address `?page=N` on the page the plugin is embedded in, which means two
`[{IndexPlugin}]` calls on one page turn together.

### Filter Patterns

Patterns use JavaScript regular expression syntax:

- `^Doc.*` - Pages starting with "Doc"
- `.*Plugin$` - Pages ending with "Plugin"
- `Test` - Pages containing "Test"
- `^(Main|Home)$` - Exact match for "Main" or "Home"

## Examples

### Example 1: Full Index

```wiki
[{IndexPlugin}]
```

__Output:__

```html
<div class="index-plugin">
  <div class="index-sections">
    <strong>Jump to:</strong> <a href="#index-A">A</a> | <a href="#index-B">B</a> | ...
  </div>

  <div class="index-section" id="index-A">
    <h3>A</h3>
    <ul>
      <li><a class="wikipage" href="/wiki/About">About</a></li>
      <li><a class="wikipage" href="/wiki/Admin">Admin</a></li>
    </ul>
  </div>
  ...
</div>
```

### Example 2: Documentation Pages Only

```wiki
[{IndexPlugin include='^(Doc|Guide|Tutorial).*'}]
```

Shows only pages starting with Doc, Guide, or Tutorial.

### Example 3: Exclude System Pages

```wiki
[{IndexPlugin exclude='^(System|Admin|Config).*'}]
```

Shows all pages except those starting with System, Admin, or Config.

### Example 4: Combined Filters

```wiki
[{IndexPlugin include='.*Manager.*' exclude='.*Test.*'}]
```

Shows pages containing "Manager" but not containing "Test".

## Output Structure

### Jump Links Section

When multiple letter sections exist, a jump links bar appears at the top:

```
Jump to: A | B | C | D | ...
```

### Letter Sections

Each letter group contains:

- Section anchor (e.g., `#index-A`)
- Letter heading (h3)
- Unordered list of page links

### Non-Letter Pages

Pages starting with numbers or special characters are grouped under `#`.

## Technical Implementation

### Execute Method

```javascript
async execute(context, params) {
  const pageManager = context?.engine?.getManager?.('PageManager');
  const allPageNames = await pageManager.getAllPages();

  // Apply filters
  if (opts.include) {
    filteredPages = filteredPages.filter(name => includeRegex.test(name));
  }
  if (opts.exclude) {
    filteredPages = filteredPages.filter(name => !excludeRegex.test(name));
  }

  // Group by first letter and generate HTML
  // ...
}
```

### Context Usage

- `context.engine.getManager('PageManager')` - For page listing

## JSPWiki Compatibility

| Feature | JSPWiki | ngdpbase | Notes |
| --------- | --------- | --------- | ------- |
| Basic syntax | Yes | Yes | Fully compatible |
| include filter | Yes | Yes | Same regex syntax |
| exclude filter | Yes | Yes | Same regex syntax |
| Alphabetical grouping | Yes | Yes | Same behavior |

## Error Handling

| Error | Cause | Output |
| ------- | ------- | -------- |
| PageManager unavailable | Engine not initialized | Error message |
| Invalid include pattern | Bad regex syntax | Error with pattern |
| Invalid exclude pattern | Bad regex syntax | Error with pattern |

## CSS Classes

| Class | Description |
| ------- | ------------- |
| index-plugin | Container div |
| index-sections | Jump links container |
| index-section | Individual letter section |

## Related Plugins

- [SearchPlugin](./SearchPlugin.md) - For dynamic page searches
- [RecentChangesPlugin](./RecentChangesPlugin.md) - For recent page changes

## Related Documentation

- [Plugin System Architecture](../architecture/Plugin-Architecture.md)
- [PageManager](../managers/PageManager.md)

## Version History

| Version | Date | Changes |
| --------- | ------ | --------- |
| 1.0.0 | 2025-10-04 | Initial implementation |
