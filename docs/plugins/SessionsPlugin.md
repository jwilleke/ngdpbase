---
name: SessionsPlugin
description: Shows the number of active sessions
dateModified: '2025-12-18'
category: plugins
code: src/plugins/SessionsPlugin.ts
relatedModules:
  - PluginManager
  - ConfigurationManager
version: 1.0.0
---

# SessionsPlugin

Displays the number of active user sessions on the wiki server.

## Overview

The SessionsPlugin provides real-time information about how many users are currently connected to the wiki. It can show either total session count or distinct user count.

__Source:__ `plugins/SessionsPlugin.js`

## Plugin Metadata

| Property | Value |
| ---------- | ------- |
| Name | SessionsPlugin |
| Author | ngdpbase |
| Version | 1.0.0 |
| JSPWiki Compatible | Yes |

## Usage

### Basic Syntax

```wiki
[{SessionsPlugin}]
```

Shows total session count.

### Distinct Users

```wiki
[{SessionsPlugin property='distinctUsers'}]
```

## Parameters

| Parameter | Type | Default | Required | Description |
| ----------- | ------ | --------- | ---------- | ------------- |
| property | string | users | No | What to count: "users" or "distinctUsers" |

### Property Values

| Value | Description |
| ------- | ------------- |
| users | Total number of active sessions (default) |
| distinctUsers | Number of unique logged-in users |

## Examples

### Example 1: Total Sessions

```wiki
Currently [{SessionsPlugin}] active sessions.
```

__Output:__ `Currently 5 active sessions.`

### Example 2: Distinct Users

```wiki
[{SessionsPlugin property='distinctUsers'}] users are online.
```

__Output:__ `3 users are online.`

### Example 3: Dashboard Display

```wiki
!! System Status

| Metric | Value |
| -------- | ------- |
| Active Sessions | [{SessionsPlugin}] |
| Unique Users | [{SessionsPlugin property='distinctUsers'}] |
| Server Uptime | [{UptimePlugin}] |
| Total Pages | [{TotalPagesPlugin}] |
```

## Technical Implementation

### Execute Method

```javascript
async execute(context, params = {}) {
  const stats = context.engine.getManager('SessionStatsManager');
  if (!stats?.hasStore()) return '0';

  if (property === 'users') {
    const { users, anonymous } = await stats.users();
    // render links + anonymous count
  }
  const data = await stats.count();
  if (property === 'distinctusers') return String(data.distinctUsers);
  return String(data.sessionCount);
}
```

### Data source

The plugin reads the session store in-process through [SessionStatsManager](../managers/SessionStatsManager.md). It makes no HTTP request. Before #1246 it fetched this server's own `/api/session-count` URL through a bare global `fetch`, which was an outbound call outside `src/http/` and rendered `0` whenever the configured host was not reachable from inside the container.

`/api/session-count` and `/api/session-users` still exist for callers outside the process and return the same shapes:

```json
{ "sessionCount": 5, "distinctUsers": 3 }
{ "users": ["alice", "bob"], "anonymous": 1, "total": 4 }
```

### Configuration

None. `ngdpbase.server.host` and `ngdpbase.server.port` no longer affect the plugin.

## JSPWiki Compatibility

| Feature | JSPWiki | ngdpbase | Notes |
| --------- | --------- | --------- | ------- |
| Basic syntax | Yes | Yes | Same behavior |
| Session count | Yes | Yes | Via API call |
| property parameter | Partial | Yes | Extended options |

## Error Handling

| Error | Cause | Output |
| ------- | ------- | -------- |
| API unavailable | Server not responding | "0" |
| Config error | Invalid configuration | "0" (uses defaults) |
| Network error | Connection failed | "0" |

## Related Plugins

- [UptimePlugin](./UptimePlugin.md) - Server uptime
- [TotalPagesPlugin](./TotalPagesPlugin.md) - Page count

## Related Documentation

- [Plugin System Architecture](../architecture/Plugin-Architecture.md)
- [Session Management](../admin/Session-Management.md)

## Version History

| Version | Date | Changes |
| --------- | ------ | --------- |
| 1.0.0 | 2025-10-05 | Initial implementation |
