---
name: CounterPlugin
description: "Page-render-scoped counters: increment in place to number items or track invocations within a single render"
dateModified: '2026-05-14'
category: plugins
code: src/plugins/CounterPlugin.ts
---

# CounterPlugin

The CounterPlugin maintains page-specific counters that increment each time they render. Unlike a persistent hit counter, this tracks counters within a single page render cycle, making it useful for numbering items, tracking plugin invocations, or implementing conditional logic.

## Important: Counter Behavior

__Counters reset on every page render/reload.__ This is the correct JSPWiki-compatible behavior:

- ✅ Counters are per-render, not persistent across page reloads
- ✅ Each page view starts fresh from 0
- ✅ Different users see independent counters
- ✅ Refreshing the page resets all counters to 0

__Intended Use:__ Counters are for numbering items within a single page view (like figures, sections, or list items), NOT for tracking page views across multiple visits.

__Example:__ If you have `[{Counter}] [{Counter}] [{Counter}]` on a page, it will show "1 2 3" every time the page is loaded, not incrementing across different page loads.

## Usage

### Basic Counter

```wiki
[{Counter}]
[{Counter}]
[{Counter}]
```

This produces sequential numbering: 1, 2, 3

### Named Counter

```wiki
[{Counter name='chapter'}]
[{Counter name='chapter'}]
```

This maintains a separate counter named 'chapter': 1, 2

### Custom Increment

```wiki
[{Counter increment='5'}]
[{Counter increment='5'}]
```

This increments by 5 each time: 5, 10

### Silent Counter

```wiki
[{Counter showResult='false'}]
[{Counter showResult='false'}]
[{Counter}]
```

The first two increments are hidden, the third shows: 3

## Parameters

| Parameter | Type | Default | Description |
| ----------- | ------ | --------- | ------------- |
| `name` | string | `counter` | Distinguishes multiple counters on one page |
| `increment` | number | `1` | Amount to add to counter (can be negative) |
| `start` | number | (none) | Resets counter to specified value |
| `showResult` | boolean | `true` | Controls whether counter value is displayed |

## Examples

### Example 1: Simple Sequential Numbering

```wiki
Item [{Counter}]: First item
Item [{Counter}]: Second item
Item [{Counter}]: Third item
```

__Output:__

```
Item 1: First item
Item 2: Second item
Item 3: Third item
```

### Example 2: Multiple Named Counters

```wiki
Chapter [{Counter name='chapter'}], Section [{Counter name='section'}]
Chapter [{Counter name='chapter'}], Section [{Counter name='section'}]
Chapter [{Counter name='chapter'}], Section [{Counter name='section'}]
```

__Output:__

```
Chapter 1, Section 1
Chapter 2, Section 2
Chapter 3, Section 3
```

### Example 3: Starting from a Specific Value

```wiki
[{Counter start='100'}]
[{Counter}]
[{Counter}]
```

__Output:__

```
100
101
102
```

### Example 4: Custom Increment Steps

```wiki
[{Counter name='even' increment='2'}]
[{Counter name='even' increment='2'}]
[{Counter name='even' increment='2'}]
```

__Output:__

```
2
4
6
```

### Example 5: Countdown with Negative Increment

```wiki
[{Counter name='countdown' start='10'}]
[{Counter name='countdown' increment='-1'}]
[{Counter name='countdown' increment='-1'}]
```

__Output:__

```
10
9
8
```

### Example 6: Hidden Counter Increment

```wiki
[{Counter showResult='false'}]
[{Counter showResult='false'}]
[{Counter showResult='false'}]
The counter is now at: [{$counter}]
```

__Output:__

```
The counter is now at: 3
```

### Example 7: Resetting Mid-Sequence

```wiki
[{Counter}]
[{Counter}]
[{Counter start='1'}]
[{Counter}]
```

__Output:__

```
1
2
1
2
```

## Accessing Counter Values as Variables

Counter values can be accessed without incrementing them using wiki variables:

```wiki
[{Counter}]
[{Counter}]
Current counter value: [{$counter}]
[{Counter}]
Final counter value: [{$counter}]
```

__Output:__

```
1
2
Current counter value: 2
3
Final counter value: 3
```

For named counters, use the format `[{$counter-name}]`:

```wiki
[{Counter name='chapter'}]
[{Counter name='section'}]
Chapter: [{$counter-chapter}], Section: [{$counter-section}]
```

__Output:__

```
1
1
Chapter: 1, Section: 1
```

## Use Cases

### Numbered Lists with Custom Formatting

```wiki
[{Counter start='1'}]. Introduction
[{Counter}]. Background
[{Counter}]. Methodology
[{Counter}]. Results
```

### Multiple Counter Hierarchies

```wiki
# Section [{Counter name='section'}]
## Subsection [{Counter name='subsection'}].1
## Subsection [{Counter name='subsection'}].2

# Section [{Counter name='section'}]
[{Counter name='subsection' start='1'}]
## Subsection [{Counter name='subsection'}].1
```

### Progress Tracking

```wiki
[{Counter showResult='false'}]
[{Counter showResult='false'}]
[{Counter showResult='false'}]
Progress: [{$counter}]/10 steps completed
```

### Conditional Content

```wiki
[{Counter showResult='false'}]
[{If test='$counter > 5'}]
  This appears after 5 counter invocations
[{If}]
```

## Technical Details

### Counter Storage

- Counters are stored in the page rendering context (`context.counters`)
- Each counter is stored with the key format:
  - Default counter: `counter`
  - Named counters: `counter-{name}`
- __Counters persist only for the duration of a single page render__
- __Each page load creates a fresh context__ - all counters start from 0
- Different users viewing the same page maintain separate, independent counters
- Reloading/refreshing the page resets all counters to their initial state

__Why per-render?__ This matches JSPWiki behavior and is designed for:

- Numbering figures, tables, or sections within a page
- Sequential item numbering that should be consistent on each view
- Dynamic content that needs consistent numbering regardless of when it's viewed

### Counter Initialization

- Counters start at 0 and increment to 1 on first use
- The `start` parameter overrides the increment behavior
- When `start` is used, the counter is set to that exact value
- Subsequent calls without `start` resume normal incrementing

### Parameter Precedence

1. If `start` is specified, it sets the counter value (ignoring current value)
2. If `start` is not specified, `increment` is applied to current value
3. `showResult` controls output but doesn't affect counter value
4. All parameters can be combined except `start` overrides increment logic

## JSPWiki Compatibility

This plugin is fully compatible with JSPWiki's Counter plugin:

| Feature | JSPWiki | ngdpbase | Compatible |
| --------- | --------- | --------- | ------------ |
| Basic counter | ✓ | ✓ | ✓ |
| Named counters | ✓ | ✓ | ✓ |
| Custom increment | ✓ | ✓ | ✓ |
| Start parameter | ✓ | ✓ | ✓ |
| showResult parameter | ✓ | ✓ | ✓ |
| Variable access | ✓ | ✓ | ✓ |
| Negative increment | ✓ | ✓ | ✓ |

## See Also

- [JSPWiki Counter Plugin](https://jspwiki-wiki.apache.org/Wiki.jsp?page=Counter)
- [VariableManager Documentation](../managers/VariableManager.md)
- [PluginManager Documentation](../managers/PluginManager.md)
- [Wiki Variables](../features/variables.md)

## Version History

- __1.0.0__ (2025-10-19) - Initial release
  - Basic counter functionality
  - Named counters
  - Custom increment values
  - Start parameter for resetting
  - showResult parameter for silent mode
  - Variable access integration
  - Full JSPWiki compatibility
