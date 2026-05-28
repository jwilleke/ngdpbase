---
name: TabsPlugin
description: Renders Bootstrap nav-tabs from [{Tab name="..."}]content[{/Tab}] body blocks
dateModified: '2026-05-28'
category: plugins
code: src/plugins/TabsPlugin.ts
relatedModules:
  - ConfigurationManager
---

# TabsPlugin

Parses `[{Tab name='…'}]…[{/Tab}]` body blocks and renders them as a Bootstrap 5 nav-tabs / nav-pills / nav-underline component. Active-tab state is persisted in `localStorage` per page when enabled.

## Usage

```wiki
[{Tabs}]
[{Tab name='Overview'}]
First tab content.
[{/Tab}]
[{Tab name='Details'}]
Second tab content.
[{/Tab}]
[{/Tabs}]
```

First tab is active on initial render.

## Configuration

| Config key | Default | Description |
|---|---|---|
| `ngdpbase.tab.style` | `tabs` | Nav style: `tabs`, `pills`, or `underline` |
| `ngdpbase.tab.persist` | `true` | Persist active-tab selection in `localStorage` per page |

## Implementation

- Body content is scanned with a regex matching `[{Tab name='X'}]…[{/Tab}]` blocks.
- Tab names are slugified into DOM ids (`pane-<uid>-<slug>` / `tab-<uid>-<slug>`).
- A short random uid suffix avoids collisions when multiple `[{Tabs}]` blocks appear on the same page.
- Empty bodies (no `[{Tab}]` blocks parsed) → empty string output.

## See Also

- [TabPlugin](TabPlugin.md) — the body-block marker
