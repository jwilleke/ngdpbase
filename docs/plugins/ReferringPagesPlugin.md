---
name: ReferringPagesPlugin
description: Lists pages that link to the current page
dateModified: '2025-12-18'
category: plugins
code: src/plugins/referringPagesPlugin.ts
relatedModules:
  - PluginManager
  - LinkGraph
version: 1.0.0
---

# ReferringPagesPlugin

Lists pages that contain links to the current page (backlinks).

## Overview

The ReferringPagesPlugin displays a list of pages that reference the current page. This is useful for navigation, understanding page relationships, and discovering related content. It uses the wiki's link graph to find referring pages.

__Source:__ `plugins/referringPagesPlugin.js`

## Plugin Metadata

| Property | Value |
| ---------- | ------- |
| Name | ReferringPagesPlugin |
| Author | ngdpbase |
| Version | 1.0.0 |
| JSPWiki Compatible | Yes |

## Usage

### Basic Syntax

```wiki
[{ReferringPagesPlugin}]
```

Lists pages referring to the current page.

### Show Count Only

```wiki
[{ReferringPagesPlugin show='count'}]
```

### For a Specific Page

```wiki
[{ReferringPagesPlugin page='MainPage'}]
```

## Parameters

| Parameter | Type | Default | Required | Description |
| ----------- | ------ | --------- | ---------- | ------------- |
| page | string | current page | No | Target page to find references for |
| max | number | 10 | No | Maximum pages to display |
| show | string | list | No | Output mode: "list" or "count" |
| before | string | - | No | Text/markup before each link |
| after | string | - | No | Text/markup after each link |

### Before/After Formatting

The `before` and `after` parameters support:

- `\n` for newlines
- `\t` for tabs
- `*` or `-` for list formatting (auto-converted to HTML list)

## Examples

### Example 1: Default List

```wiki
[{ReferringPagesPlugin}]
```

__Output:__

```html
<ul>
  <li><a class="wikipage" href="/wiki/HomePage">HomePage</a></li>
  <li><a class="wikipage" href="/wiki/RelatedPage">RelatedPage</a></li>
</ul>
```

### Example 2: Count Only

```wiki
This page is referenced by [{ReferringPagesPlugin show='count'}] other pages.
```

__Output:__ `This page is referenced by 5 other pages.`

### Example 3: Limited Results

```wiki
[{ReferringPagesPlugin max=5}]
```

Shows at most 5 referring pages.

### Example 4: Specific Page References

```wiki
Pages linking to MainPage:
[{ReferringPagesPlugin page='MainPage'}]
```

### Example 5: Custom Formatting

```wiki
[{ReferringPagesPlugin before='* ' after='\n'}]
```

Creates a bullet-pointed list.

### Example 6: No References

When no pages reference the current page:

__Output:__

```html
<p><em>No pages currently refer to this page.</em></p>
```

## Technical Implementation

### Function Signature

```javascript
function ReferringPagesPlugin(pageName, params, linkGraph) {
  const targetPage = opts.page || pageName;
  let referring = linkGraph?.[targetPage] || [];

  if (opts.show === 'count') {
    return String(referring.length);
  }

  // Format and return list
}
```

### Link Graph

The plugin receives a `linkGraph` object mapping pages to their referrers:

```javascript
{
  "PageA": ["PageB", "PageC"],  // Pages B and C link to A
  "PageB": ["PageA"]            // Page A links to B
}
```

## JSPWiki Compatibility

| Feature | JSPWiki | ngdpbase | Notes |
| --------- | --------- | --------- | ------- |
| Basic syntax | Yes | Yes | Fully compatible |
| page parameter | Yes | Yes | Same behavior |
| max parameter | Yes | Yes | Same behavior |
| show='count' | Yes | Yes | Same behavior |
| before/after | Yes | Yes | Same behavior |

## Error Handling

| Scenario | Behavior |
| ---------- | ---------- |
| No link graph | Returns empty list |
| Page not in graph | Returns "No pages currently refer to this page" |
| Invalid max value | Uses default (10) |

## Output Formats

### Default (HTML List)

```html
<ul>
  <li><a class="wikipage" href="/wiki/Page1">Page1</a></li>
  <li><a class="wikipage" href="/wiki/Page2">Page2</a></li>
</ul>
```

### Count Mode

```text
5
```

### Custom Formatting

With `before='* '` and `after='\n'`, creates bullet list format.

## Related Plugins

- [IndexPlugin](./IndexPlugin.md) - Full page index
- [SearchPlugin](./SearchPlugin.md) - Content search

## Related Documentation

- [Plugin System Architecture](../architecture/Plugin-Architecture.md)
- [Link Graph](../architecture/Link-Graph.md)

## Version History

| Version | Date | Changes |
| --------- | ------ | --------- |
| 1.0.0 | 2025-10-12 | Initial implementation |
