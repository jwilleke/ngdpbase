---
name: IndexPlugin
description: Generates an alphabetical index of all wiki pages
dateModified: '2025-12-18'
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

**Source:** `plugins/IndexPlugin.js`

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

**Output:**

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
