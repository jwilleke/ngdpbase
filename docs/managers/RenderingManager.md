---
name: RenderingManager
description: Markdown + JSPWiki-style markup rendering pipeline; orchestrates handlers and plugin invocation
dateModified: '2026-05-14'
category: managers
code: src/managers/RenderingManager.ts
---

# RenderingManager

__Module:__ `src/managers/RenderingManager.ts`
__Extends:__ [BaseManager](BaseManager.md)
__Complete Guide:__ [RenderingManager-Complete-Guide.md](RenderingManager-Complete-Guide.md)

---

## Overview

RenderingManager orchestrates the conversion of markdown and wiki markup to HTML. It implements a dual-parser architecture with an advanced MarkupParser (with WikiDocument DOM extraction) and a legacy Showdown-based fallback for backward compatibility.

## Key Features

- __Dual Parser System__ - Advanced MarkupParser with DOM extraction or legacy Showdown
- __Wiki Link Processing__ - Parse `[PageName]` and `[Text|Target]` wiki links
- __Plugin Integration__ - Execute `[{Plugin}]` syntax via PluginManager
- __Variable Expansion__ - Process `[{$variable}]` syntax with VariableManager
- __Link Graph__ - Build page relationships for backlinks and orphaned pages
- __Plural Name Matching__ - "Users" finds "User" page automatically
- __JSPWiki Tables__ - Convert JSPWiki-style tables to HTML
- __Footnotes Support__ - GitHub Flavored Markdown footnotes `[^1]`

## Quick Example

```javascript
const renderingManager = engine.getManager('RenderingManager');

// Render markdown to HTML
const html = await renderingManager.renderMarkdown(
  '# Hello World\n\nVisit [HomePage] for more info.',
  'MyPage',
  userContext
);

// Render via WikiContext
const context = /* WikiContext instance */;
const html = await renderingManager.textToHTML(context, content);

// Get pages linking to this page
const backlinks = renderingManager.getReferringPages('HomePage');
console.log('Pages linking here:', backlinks);

// Check total page count
const total = renderingManager.getTotalPagesCount();
```

## Core Rendering Methods

| Method | Returns | Description |
| -------- | --------- | ------------- |
| `renderMarkdown(content, pageName, userContext, requestInfo)` | `Promise<string>` | Convert markdown to HTML (auto-selects parser) |
| `textToHTML(context, content)` | `Promise<string>` | Render using WikiContext |
| `renderPreview(content, pageName, userContext)` | `Promise<string>` | Render for preview (no cache) |
| `expandMacros(content, pageName, userContext, requestInfo)` | `Promise<string>` | Expand plugin/variable syntax |
| `processWikiLinks(content)` | `Promise<string>` | Parse and render wiki links |
| `renderPlugins(content, pageName)` | `Promise<string>` | Execute plugin syntax |

## Link Graph Methods

| Method | Returns | Description |
| -------- | --------- | ------------- |
| `buildLinkGraph()` | `Promise<void>` | Build page relationship graph |
| `rebuildLinkGraph()` | `Promise<void>` | Rebuild link graph |
| `getReferringPages(pageName)` | `string[]` | Get pages linking to this page |
| `getOrphanedPages()` | `string[]` | Get pages with no inbound links |
| `getTotalPagesCount()` | `number` | Get total page count |

## Parser Methods

| Method | Returns | Description |
| -------- | --------- | ------------- |
| `getParser()` | `MarkupParser\|null` | Get MarkupParser if enabled |
| `initializeLinkParser()` | `Promise<void>` | Initialize link parser with page names |

## Configuration

```json
{
  "ngdpbase.rendering.useadvancedparser": true,
  "ngdpbase.rendering.fallbacktolegacy": true,
  "ngdpbase.rendering.integration.enabled": true,
  "ngdpbase.rendering.performance.comparison.enabled": false,
  "ngdpbase.rendering.debug.logging.enabled": false,
  "ngdpbase.translator-reader.match-english-plurals": true,
  "ngdpbase.markup.jspwikitables.enabled": true
}
```

## Parser Selection Logic

1. __Advanced Parser__ (if `useadvancedparser: true`):
   - Uses MarkupParser with WikiDocument DOM extraction
   - Multi-phase processing pipeline
   - JSPWiki syntax handlers
   - Filter chains for pre/post processing

2. __Legacy Parser__ (fallback or if advanced disabled):
   - Direct Showdown conversion
   - Basic JSPWiki syntax support
   - Reliable fallback for edge cases

## Supported Markdown Extensions

- __Tables__ - GitHub Flavored Markdown tables
- __Strikethrough__ - `~~deleted text~~`
- __Tasklists__ - `- [x] completed task`
- __Code Blocks__ - ` ``` fenced code blocks
- __Footnotes__ - `[^1]` footnote syntax

## Wiki Link Syntax

| Syntax | Result |
| -------- | -------- |
| `[PageName]` | Link to PageName |
| `[Display Text\|Target]` | Link with custom text |
| `[Text\|http://example.com]` | External link |
| `[Text\|Wikipedia:Article]` | InterWiki link |

## Plugin Syntax

```markdown
[{Plugin parameter='value'}]
[{CurrentTimePlugin format='dd:MMM:yyyy'}]
[{IndexPlugin}]
```

## Variable Syntax

```markdown
[{$applicationname}]  → ngdpbase
[{$pagename}]          → Current page name
[{$baseurl}]           → http://localhost:3000
[{$totalpages}]        → 90
```

## Related Managers

- [PageManager](PageManager.md) - Page storage and retrieval
- [PluginManager](PluginManager.md) - Plugin execution
- [VariableManager](VariableManager.md) - Variable expansion
- [ConfigurationManager](ConfigurationManager.md) - Configuration settings
- [SearchManager](SearchManager.md) - Search integration

## Developer Documentation

For complete architecture details, parser internals, performance tuning, and troubleshooting:

- [RenderingManager-Complete-Guide.md](RenderingManager-Complete-Guide.md)
