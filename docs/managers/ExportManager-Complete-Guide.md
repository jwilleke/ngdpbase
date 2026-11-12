# ExportManager Complete Guide

__Module:__ `src/managers/ExportManager.js`
__Quick Reference:__ [ExportManager.md](ExportManager.md)
__Generated API:__ [API Docs](../api/generated/src/managers/ExportManager/README.md)

---

## Table of Contents

1. [Architecture](#architecture)
2. [Initialization](#initialization)
3. [Export Methods](#export-methods)
4. [Locale Support](#locale-support)
5. [API Reference](#api-reference)

---

## Architecture

```text
┌─────────────────────────────────────────────────────────┐
│                    ExportManager                         │
│  - exportPagesToHtml(pageNames, user)                   │
└────────────────┬──────────────────────────────────────┘
                 │
         ┌───────┼───────┐
         ▼       ▼       ▼
┌─────────────┐ ┌──────────────┐ ┌──────────────┐
│ PageManager │ │ Rendering    │ │ LocaleUtils  │
│ (content)   │ │ Manager      │ │ (timestamps) │
└─────────────┘ └──────────────┘ └──────────────┘
```

### Properties

| Property | Type | Default | Description |
| ---------- | ------ | --------- | ------------- |
| `exportDirectory` | `string` | `./exports` | Directory for saved exports |
| `supportedFormats` | `string[]` | `['html', 'pdf', 'markdown']` | Supported export formats |

---

## Initialization

```javascript
async initialize(config = {}) {
  await super.initialize(config);

  this.exportDirectory = config.exportDirectory || './exports';

  // Create exports directory
  await fs.mkdir(this.exportDirectory, { recursive: true });
}
```

ExportManager creates the export directory automatically during initialization.

---

## Export Methods

### exportPagesToHtml(pageNames, user)

Export multiple pages to a single HTML document with table of contents.

```javascript
async exportPagesToHtml(pageNames, user = null)
```

__Parameters:__

- `pageNames` - Array of page names to export
- `user` - User object for locale-aware timestamps (optional)

__Returns:__ `string` - Combined HTML document with TOC

__Features:__

- Auto-generated table of contents
- Two-column TOC layout
- Page dividers between sections
- Anchor links for navigation
- Print page-break hints

__Example:__

```javascript
const pages = ['Introduction', 'Getting Started', 'Configuration', 'FAQ'];
const html = await exportManager.exportPagesToHtml(pages);
```

---

## Locale Support

### getFormattedTimestamp(user)

Get locale-aware formatted timestamp.

```javascript
getFormattedTimestamp(user = null)
```

__Parameters:__

- `user` - User object with locale preferences (optional)

__Returns:__ `string` - Formatted date/time string

If user has `preferences.locale` set, uses LocaleUtils for formatting. Otherwise falls back to system default.

---

## API Reference

### Export Methods

| Method | Parameters | Returns |
| -------- | ------------ | --------- |
| `exportPagesToHtml(pageNames, user)` | string[], Object? | `Promise<string>` |

### Utility

| Method | Parameters | Returns |
| -------- | ------------ | --------- |
| `getFormattedTimestamp(user)` | Object? | `string` |

---

## Notes

- __No save or single-page routes:__ `saveExport`, `exportPageToHtml`, `exportToMarkdown` and the `POST /export/html/:page` and `POST /export/markdown/:page` routes were removed in [#2378](https://github.com/jwilleke/ngdpbase/issues/2378). A page's export is started from __Export this page__ (`/export/page/:page`) and a search's from __Export these results__, both through the ImportManager's export engine.
- __HTML styling:__ Exports include embedded CSS for consistent rendering
- __Print support:__ HTML exports have print-friendly styles
- __PDF:__ `htmlToPdf(ctx, html, options?)` turns an HTML document into a PDF (#1974); see [ExportManager.md](ExportManager.md#html-to-pdf). There is no page-to-PDF export route yet

---

## Related Documentation

- [ExportManager.md](ExportManager.md) - Quick reference
- [PageManager](PageManager.md) - Page content source
- [RenderingManager](RenderingManager.md) - Markdown rendering
- [LocaleUtils](../utils/LocaleUtils.md) - Locale formatting
