---
name: MarqueePlugin
description: CSS-based horizontally scrolling text banner
dateModified: '2026-04-06'
category: plugins
code: src/plugins/MarqueePlugin.ts
relatedModules:
  - PluginManager
  - BaseManager
version: 1.1.0
---

# MarqueePlugin

Displays a horizontally scrolling text banner using CSS animation (not the
deprecated `<marquee>` HTML element).  Pauses on mouse hover.  Multiple
banners on the same page each get an isolated `@keyframes` name so they
never interfere with each other.

**Source:** `plugins/MarqueePlugin.ts`

## Plugin Metadata

| Property | Value |
| --- | --- |
| Name | MarqueePlugin |
| Author | ngdpbase |
| Version | 1.0.0 |
| JSPWiki Compatible | Partial (new plugin, no JSPWiki equivalent) |

## Usage

### Minimal

```wiki
[{MarqueePlugin text='Hello World!'}]
```

### Full Example

```wiki
[{MarqueePlugin text='Breaking News: server maintenance at midnight'
               speed='fast'
               direction='left'
               fontsize='1.5em'
               bgcolor='#fff3cd'
               color='#856404'
               separator=' ★ '}]
```

## Parameters

| Parameter | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `text` | string | — | Yes (unless `fetch` used) | The message to scroll. |
| `fetch` | string | — | No | `'ManagerName.methodName(k=v,...)'` — calls a manager method to get text dynamically. Takes precedence over `text`. See [Manager Feed](#manager-feed-fetch-parameter) below. |
| `speed` | string \| number | `medium` | No | `slow` (30 s), `medium` (20 s), `fast` (10 s), or a number of seconds per cycle. |
| `direction` | string | `left` | No | `left` or `right`. |
| `behavior` | string | `scroll` | No | `scroll` (seamless loop), `slide` (enter and stop), `alternate` (bounce). |
| `loop` | string \| number | `infinite` | No | Number of passes or `infinite`. Applies to `slide` / `alternate` only; `scroll` is always infinite. |
| `bgcolor` | string | — | No | CSS `background` value for the banner strip (e.g. `#ffe` or `rgba(0,0,0,.1)`). |
| `color` | string | — | No | CSS `color` value for the text. |
| `fontsize` | string | — | No | CSS `font-size` for the banner text (e.g. `1.5em`, `24px`, `2rem`). Defaults to the surrounding element's size. Non-CSS-unit characters are stripped to prevent style injection. |
| `separator` | string | `•` | No | String inserted between the two repetitions in `scroll` mode. |
| `cssclass` | string | — | No | Extra CSS class added to the outer wrapper `<div>`. |

## Behaviors

### `scroll` (default)

Text is duplicated internally so the loop appears seamless.  The duplicate
is hidden offscreen while the original scrolls off — no visible jump at
the wrap point.

### `slide`

Text enters from the off-screen side and stops flush with the opposite
edge.  Good for one-time announcements.  Combine with `loop='1'` to play
once.

### `alternate`

Text bounces between the left and right edges.  Direction of the first
movement is controlled by `direction`.

## Examples

### Announcement Banner

```wiki
[{MarqueePlugin text='Community meeting Tuesday 7 PM in the clubhouse'
               speed='slow' bgcolor='#d1ecf1' color='#0c5460'}]
```

### Error / Alert Strip

```wiki
[{MarqueePlugin text='System maintenance window: 02:00–04:00 UTC'
               speed='fast' bgcolor='#f8d7da' color='#721c24'}]
```

### Slide-In Once

```wiki
[{MarqueePlugin text='Welcome to the site!' behavior='slide' loop='1' speed='slow'}]
```

### Right-to-Left Scroll

```wiki
[{MarqueePlugin text='Latest updates' direction='right'}]
```

### Custom Separator

```wiki
[{MarqueePlugin text='News item one' separator=' | '}]
```

### Large Headline Banner

```wiki
[{MarqueePlugin text='Grand Opening — Saturday 10 AM'
               fontsize='2em'
               bgcolor='#0d6efd'
               color='white'
               speed='slow'}]
```

### Small Ticker Strip

```wiki
[{MarqueePlugin text='Latest scores: Home 3 — Away 1  •  Home 0 — Away 2'
               fontsize='0.85em'
               speed='fast'}]
```

## Manager Feed (`fetch=` parameter)

`fetch='ManagerName.methodName(k=v,...)'` calls any registered manager method
and uses the returned string as the banner text.  This allows live data to
flow into the banner without hardcoding text in the page.

```wiki
[{MarqueePlugin fetch='HansDataManager.toMarqueeText()'}]
[{MarqueePlugin fetch='HansDataManager.toMarqueeText(limit=3,alertLevel=WATCH)'}]
```

### How it works

1. `execute()` parses the `fetch` param with the regex
   `^([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\(([^)]*)\)$`
2. Splits the arg string on `,` into a `Record<string, string>` of raw key=value pairs
3. Calls `context.engine.getManager(managerName)[methodName](fetchArgs)`
4. Awaits the result and coerces to string

The raw args object is passed directly to the manager — the manager owns
its own option parsing.  Common options (`limit`, `sort`, `since`, `before`)
are parsed via `parseManagerFetchOptions()` from `src/utils/managerUtils.ts`.

### Adding `toMarqueeText()` to a manager

Any manager that extends `BaseManager` inherits a default `toMarqueeText()`
that returns `''`.  Override it to expose live data:

```ts
import { ManagerFetchOptions, parseManagerFetchOptions } from '../utils/managerUtils';

async toMarqueeText(raw: Record<string, string> = {}): Promise<string> {
  const { limit } = parseManagerFetchOptions(raw);
  const pages = await this.getRecentChanges(limit ?? 5);
  return 'Recent: ' + pages.map(p => p.name).join('  •  ');
}
```

### Error handling

| Condition | Output |
| --- | --- |
| Manager not found | `[MarqueePlugin: fetch target '…' not found]` |
| Method not found on manager | `[MarqueePlugin: fetch target '…' not found]` |
| Method returns empty string | Falls through to `[MarqueePlugin: no text provided]` |

## Technical Implementation

### Output Structure

```html
<style>@keyframes ngdp-mq-N { from{…} to{…} }</style>
<div class="ngdp-marquee-wrap [cssclass]"
     style="overflow:hidden;white-space:nowrap;[bgcolor];[color];[fontsize]"
     aria-label="[text]">
  <span class="ngdp-marquee-inner"
        style="display:inline-block;animation:ngdp-mq-N Xs linear infinite;…"
        onmouseenter="this.style.animationPlayState='paused'"
        onmouseleave="this.style.animationPlayState='running'">
    [text][separator][text][separator]   <!-- scroll: duplicated -->
    [text]                                <!-- slide/alternate: single -->
  </span>
</div>
```

### XSS Safety

`text`, `separator`, and `cssclass` are passed through `escapeHtml()` from
`src/utils/pluginFormatters.ts` before being written into the HTML output.
`bgcolor` and `color` are written into a `style` attribute; values
containing `"` or `;` are not further sanitised — authors should use only
valid CSS colour values.  `fontsize` is sanitised by stripping any character
outside `[a-zA-Z0-9.%]` before insertion, preventing semicolon-based style
injection.

### Unique Keyframe Names

A module-level counter increments on each `execute()` call producing names
`ngdp-mq-1`, `ngdp-mq-2`, … so multiple banners never share a keyframe
definition.

## Error Handling

| Condition | Output |
| --- | --- |
| `text` omitted or empty | `<span class="text-muted"><em>[MarqueePlugin: no text provided]</em></span>` |
| Invalid `speed` value | Falls back to `medium` (20 s) |
| Invalid `direction` value | Falls back to `left` |
| Invalid `behavior` value | Falls back to `scroll` |

## Tests

`plugins/__tests__/MarqueePlugin.test.js` — 33 tests covering metadata,
missing-text guard, XSS safety, speed presets, direction, all three
behaviors, styling parameters (including `fontsize` applied, injection
stripped, absent), hover pause, aria-label, unique keyframe names per
instance, and 3 `fetch=` tests (not-found error, text result, args forwarding).

## Related Documentation

- [Plugin System Architecture](../architecture/Plugin-Architecture.md)
- [PluginManager](../managers/PluginManager.md)
- [BaseManager](../managers/BaseManager.md)
- [managerUtils](../../src/utils/managerUtils.ts) — `ManagerFetchOptions`, `parseManagerFetchOptions()`
- [pluginFormatters utility](../../src/utils/pluginFormatters.ts)

## Version History

| Version | Date | Changes |
| --- | --- | --- |
| 1.2.0 | 2026-04-06 | `fontsize=` parameter — CSS font-size with style-injection sanitisation |
| 1.1.0 | 2026-04-05 | `fetch=` parameter — live data from any manager (#465); `execute()` now async |
| 1.0.0 | 2026-04-05 | Initial implementation (#454) |
