---
title: Using UptimePlugin
uuid: E2BC4BF9-4DDB-40DD-8CE5-C418EE7FCC08
system-category: documentation
user-keywords:
  - Plugins
  - Uptime
  - Server
slug: using-uptimeplugin
lastModified: '2026-04-23T00:00:00.000Z'
author: system
---
# Using UptimePlugin

The __UptimePlugin__ displays how long the server has been running since its last restart, formatted as days, hours, and minutes. See [Plugins] for a complete list of available plugins.

## Syntax

[[{UptimePlugin}] renders as:

[{UptimePlugin}]

## Parameters

This plugin has no parameters.

## Examples

### Inline in a sentence

[[Server uptime: [{UptimePlugin}]] renders as:

Server uptime: [{UptimePlugin}]

## Output Format

%%table-striped
|| Duration || Format ||
| Days or more | `3d 12h 45m` |
| Hours only | `5h 30m` |
| Minutes only | `15m` |
/%
