---
name: TotalPagesPlugin
description: Shows the total number of wiki pages
dateModified: '2025-12-18'
category: plugins
code: src/plugins/TotalPagesPlugin.ts
relatedModules:
  - PluginManager
  - PageManager
version: 1.0.0
---

# TotalPagesPlugin

Displays the total number of pages in the wiki.

## Overview

The TotalPagesPlugin provides a simple count of all wiki pages. It's useful for dashboard displays, statistics pages, and system information.

__Source:__ `plugins/TotalPagesPlugin.js`

## Plugin Metadata

| Property | Value |
| ---------- | ------- |
| Name | TotalPagesPlugin |
| Author | ngdpbase |
| Version | 1.0.0 |
| JSPWiki Compatible | Yes |

## Usage

### Basic Syntax

```wiki
[{TotalPagesPlugin}]
```

Returns the total page count as a number.

## Parameters

This plugin has no parameters.

## Examples

### Example 1: Simple Count

```wiki
This wiki contains [{TotalPagesPlugin}] pages.
```

__Output:__ `This wiki contains 247 pages.`

### Example 2: Statistics Section

```wiki
!! Wiki Statistics

| Metric | Value |
| -------- | ------- |
| Total Pages | [{TotalPagesPlugin}] |
| Active Sessions | [{SessionsPlugin}] |
| Server Uptime | [{UptimePlugin}] |
```

### Example 3: Dashboard

```wiki
!! Welcome to ngdpbase

Browse our [{TotalPagesPlugin}] pages of documentation, or use the search
to find specific topics.
```

## Technical Implementation

### Execute Method

```javascript
async execute(context, params) {
  const engine = context.engine;
  const pageManager = engine.getManager('PageManager');

  if (pageManager && pageManager.getAllPages) {
    const pages = await pageManager.getAllPages();
    return Array.isArray(pages) ? pages.length.toString() : '0';
  }
  return '0';
}
```

### Context Usage

- `context.engine.getManager('PageManager')` - For page listing

## Output

Returns a plain number string (e.g., `"247"`), making it easy to embed inline.

## JSPWiki Compatibility

| Feature | JSPWiki | ngdpbase | Notes |
| --------- | --------- | --------- | ------- |
| Basic syntax | Yes | Yes | Identical behavior |
| Output format | Yes | Yes | Plain number |

## Error Handling

| Error | Cause | Output |
| ------- | ------- | -------- |
| No engine | Context missing engine | "0" |
| No PageManager | Manager not available | "0" |
| API error | getAllPages fails | "0" |

## Related Plugins

- [IndexPlugin](./IndexPlugin.md) - Full page listing
- [SearchPlugin](./SearchPlugin.md) - Search with count format
- [SessionsPlugin](./SessionsPlugin.md) - Session count
- [UptimePlugin](./UptimePlugin.md) - Server uptime

## Related Documentation

- [Plugin System Architecture](../architecture/Plugin-Architecture.md)
- [PageManager](../managers/PageManager.md)

## Version History

| Version | Date | Changes |
| --------- | ------ | --------- |
| 1.0.0 | 2025-12-12 | Initial implementation |
