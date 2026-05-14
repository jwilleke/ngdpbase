---
name: ExportManager
description: Per-page export to HTML or Markdown with frontmatter stripping and link rewriting
dateModified: '2026-05-14'
category: managers
code: src/managers/ExportManager.ts
---

# ExportManager

**Module:** `src/managers/ExportManager.ts`
**Extends:** [BaseManager](BaseManager.md)
**Complete Guide:** [ExportManager-Complete-Guide.md](ExportManager-Complete-Guide.md)

---

## Overview

ExportManager handles page exports to multiple formats. Similar to JSPWiki's export functionality, it provides capabilities to export pages to HTML, PDF, and Markdown formats.

## Key Features

- Export single pages to HTML with styling
- Export multiple pages to combined HTML with table of contents
- Export to Markdown format (raw page content)
- Locale-aware timestamp formatting
- Export file management (save, list, delete)

## Quick Example

```javascript
const exportManager = engine.getManager('ExportManager');

// Export single page to HTML
const html = await exportManager.exportPageToHtml('Main');

// Export multiple pages
const combinedHtml = await exportManager.exportPagesToHtml(['Main', 'Welcome', 'About']);

// Export to markdown
const markdown = await exportManager.exportToMarkdown('Main');

// Save export to file
const filePath = await exportManager.saveExport(html, 'MyExport', 'html');
```

## Supported Formats

| Format | Method | Description |
| -------- | -------- | ------------- |
| HTML | `exportPageToHtml()` | Full HTML document with styling |
| HTML (Multi) | `exportPagesToHtml()` | Combined pages with TOC |
| Markdown | `exportToMarkdown()` | Raw page content |

## Export Directory

Default: `./exports`

Configurable via `config.exportDirectory` during initialization.

## Related Managers

- [PageManager](PageManager.md) - Provides page content
- [RenderingManager](RenderingManager.md) - Renders markdown to HTML

## Developer Documentation

For complete API reference, see:

- [ExportManager-Complete-Guide.md](ExportManager-Complete-Guide.md)
- [Generated API Docs](../api/generated/src/managers/ExportManager/README.md)
