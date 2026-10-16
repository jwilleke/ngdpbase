---
name: ExportManager
description: Per-page export to HTML or Markdown, and the one CSV writer for every CSV export
dateModified: '2026-10-16'
category: managers
code: src/managers/ExportManager.ts
---

# ExportManager

__Module:__ `src/managers/ExportManager.ts`
__Extends:__ [BaseManager](BaseManager.md)
__Complete Guide:__ [ExportManager-Complete-Guide.md](ExportManager-Complete-Guide.md)

---

## Overview

ExportManager handles page exports to multiple formats. Similar to JSPWiki's export functionality, it provides capabilities to export pages to HTML, PDF, and Markdown formats.

## Key Features

- Export single pages to HTML with styling
- Export multiple pages to combined HTML with table of contents
- Export to Markdown format (raw page content)
- Locale-aware timestamp formatting
- Export file management (save, list, delete)
- The one CSV writer for every CSV export (`toCsv`, `csvCell`): the audit log export and add-ons alike

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
| CSV | `toCsv(headers, rows)` | Any tabular data; see [CSV](#csv) |

## CSV

ExportManager owns the one CSV writer (moved from `src/utils/csv.ts`, operator decision on [#1813](https://github.com/jwilleke/ngdpbase/issues/1813)). Core's audit export and add-ons reach it as a manager:

```javascript
const csv = engine.getManager('ExportManager').toCsv(['date', 'amount'], [['2026-10-01', 3550]]);
```

- RFC 4180: a field holding a comma, quote or line break is quoted, and lines end CRLF.
- A text cell starting with `=`, `+`, `-`, `@`, a tab or a carriage return gets a leading `'`, so a spreadsheet never runs it as a formula (CSV injection).
- Numbers stay numbers: a negative amount is written `-12550`.

Never write a second CSV writer; call this one.

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
