---
title: Using CounterPlugin
system-category: documentation
user-keywords:
  - Counter
  - Plugins
  - Numbering
  - Sequential
uuid: ff2c3a6d-fdfc-479f-90e3-585dc2b3abd0
slug: using-counterplugin
lastModified: '2026-04-23T00:00:00.000Z'
author: system
---
# Using CounterPlugin

The __CounterPlugin__ maintains page-level counters that increment each time they render — useful for numbering figures, sections, or any sequential items on a page.

## Description

Counters reset on every page load. Each page view starts fresh, and different users see independent counters. This makes CounterPlugin suitable for numbering items within a page, not for tracking visits across sessions. See [Plugins] for a complete list of available plugins.

## Syntax

[[{Counter}] renders as:

[{Counter}]

## Parameters

%%table-striped
|| Parameter || Type || Default || Description ||
| `name` | string | `counter` | Identifies the counter — counters with different names are independent |
| `increment` | number | `1` | Amount added each time the plugin renders. Use a negative number to count down. |
| `start` | number | *(none)* | Resets the counter to this value before incrementing |
| `showResult` | boolean | `true` | Set to `false` to increment silently without displaying the value |
/%

## Examples

### Basic Counter

Three calls to the default counter:

[[{Counter name='ex1' start='1'}]
[[{Counter name='ex1'}]
[[{Counter name='ex1'}] renders as:

[{Counter name='ex1' start='1'}]
[{Counter name='ex1'}]
[{Counter name='ex1'}]

### Named Counter

Named counters are independent of each other and of the default counter:

[[{Counter name='chapter' start='1'}]
[[{Counter name='chapter'}]
[[{Counter name='chapter'}] renders as:

[{Counter name='chapter' start='1'}]
[{Counter name='chapter'}]
[{Counter name='chapter'}]

### Custom Increment

[[{Counter name='byten' start='10'}]
[[{Counter name='byten' increment='10'}]
[[{Counter name='byten' increment='10'}] renders as:

[{Counter name='byten' start='10'}]
[{Counter name='byten' increment='10'}]
[{Counter name='byten' increment='10'}]

### Countdown

[[{Counter name='cd' start='5'}]
[[{Counter name='cd' increment='-1'}]
[[{Counter name='cd' increment='-1'}]
[[{Counter name='cd' increment='-1'}] renders as:

[{Counter name='cd' start='5'}]
[{Counter name='cd' increment='-1'}]
[{Counter name='cd' increment='-1'}]
[{Counter name='cd' increment='-1'}]

## Accessing Counter Values as Variables

Counter values are available as page variables after the plugin renders. Use `[{$counter}]` for the default counter, or `[{$counter-name}]` for a named counter:

[[{Counter name='fig' start='1'}] — Figure [{$counter-fig}] renders as:

[{Counter name='fig' start='1'}] — Figure [{$counter-fig}]

## Use Cases

### Numbered sections with a reset

```
# Section [{Counter name='section' start='1'}]
## Subsection [{Counter name='sub' start='1'}]
## Subsection [{Counter name='sub'}]

# Section [{Counter name='section'}]
## Subsection [{Counter name='sub' start='1'}]
## Subsection [{Counter name='sub'}]
```

### Silent tracking

```
[{Counter name='views' showResult='false'}]
Views this render: [{$counter-views}]
```
