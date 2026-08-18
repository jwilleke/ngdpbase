---
name: UptimePlugin
description: Shows the server uptime in human-readable format
dateModified: '2025-12-18'
category: plugins
code: src/plugins/UptimePlugin.ts
relatedModules:
  - PluginManager
  - WikiEngine
version: 1.0.0
---

# UptimePlugin

Displays the wiki server uptime in a human-readable format.

## Overview

The UptimePlugin shows how long the wiki server has been running since its last start. The output is formatted in days, hours, and minutes for easy reading.

__Source:__ `plugins/UptimePlugin.js`

## Plugin Metadata

| Property | Value |
| ---------- | ------- |
| Name | UptimePlugin |
| Author | ngdpbase |
| Version | 1.0.0 |
| JSPWiki Compatible | Yes |

## Usage

### Basic Syntax

```wiki
[{UptimePlugin}]
```

Returns uptime in human-readable format.

## Parameters

This plugin has no parameters.

## Examples

### Example 1: Simple Display

```wiki
Server uptime: [{UptimePlugin}]
```

__Output Examples:__

- `Server uptime: 3d 12h 45m` (days, hours, minutes)
- `Server uptime: 5h 30m` (hours and minutes only)
- `Server uptime: 15m` (minutes only)

### Example 2: Status Dashboard

```wiki
!! System Status

| Metric | Value |
| -------- | ------- |
| Server Uptime | [{UptimePlugin}] |
| Active Sessions | [{SessionsPlugin}] |
| Total Pages | [{TotalPagesPlugin}] |
```

### Example 3: Footer Information

```wiki
----
Wiki powered by ngdpbase. Uptime: [{UptimePlugin}]
```

## Output Format

The uptime is formatted based on duration:

| Duration | Format | Example |
| ---------- | -------- | --------- |
| >= 1 day | `Xd Yh Zm` | `3d 12h 45m` |
| >= 1 hour | `Yh Zm` | `5h 30m` |
| < 1 hour | `Zm` | `45m` |

## Technical Implementation

### Execute Method

```javascript
execute(context, params) {
  const engine = context.engine;
  if (!engine || !engine.startTime) {
    return 'Unknown';
  }

  const uptimeSeconds = Math.floor((Date.now() - engine.startTime) / 1000);
  return this.formatUptime(uptimeSeconds);
}
```

### Format Uptime

```javascript
formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}
```

### Context Usage

- `context.engine.startTime` - Server start timestamp

## JSPWiki Compatibility

| Feature | JSPWiki | ngdpbase | Notes |
| --------- | --------- | --------- | ------- |
| Basic syntax | Yes | Yes | Same behavior |
| Output format | Similar | Yes | Days/hours/minutes |

## Error Handling

| Error | Cause | Output |
| ------- | ------- | -------- |
| No engine | Context missing engine | "Unknown" |
| No startTime | Engine not initialized properly | "Unknown" |

## Related Plugins

- [SessionsPlugin](./SessionsPlugin.md) - Active sessions
- [TotalPagesPlugin](./TotalPagesPlugin.md) - Page count

## Related Documentation

- [Plugin System Architecture](../architecture/Plugin-Architecture.md)
- [WikiEngine](../architecture/WikiEngine.md)

## Version History

| Version | Date | Changes |
| --------- | ------ | --------- |
| 1.0.0 | 2025-09-07 | Initial implementation |
