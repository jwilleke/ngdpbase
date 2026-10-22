---
name: ExportManager
description: Per-page export to HTML or Markdown, the one CSV writer for every CSV export, and HTML to PDF through an optional headless Chromium
dateModified: '2026-10-22'
category: managers
code: src/managers/ExportManager.ts
---

# ExportManager

__Module:__ `src/managers/ExportManager.ts`
__Extends:__ [BaseManager](BaseManager.md)
__Complete Guide:__ [ExportManager-Complete-Guide.md](ExportManager-Complete-Guide.md)

---

## Overview

ExportManager handles page exports to multiple formats. Similar to JSPWiki's export functionality, it exports pages to HTML and Markdown, and turns any HTML document into a PDF.

## Key Features

- Export single pages to HTML with styling
- Export multiple pages to combined HTML with table of contents
- Export to Markdown format (raw page content)
- Locale-aware timestamp formatting
- Export file management (save, list, delete)
- The one CSV writer for every CSV export (`toCsv`, `csvCell`): the audit log export and add-ons alike
- HTML to PDF (`htmlToPdf`): sandboxed, deterministic, off the request path; see [HTML to PDF](#html-to-pdf)

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
| PDF | `htmlToPdf(ctx, html, options?)` | Any HTML document; see [HTML to PDF](#html-to-pdf) |

## HTML to PDF

`htmlToPdf(ctx, html, options?)` returns the PDF as a `Buffer` ([#1974](https://github.com/jwilleke/ngdpbase/issues/1974)). How an add-on uses it, with the HTML fallback, is in the [add-ons guide](../guides/addons-developer-guide.md#make-a-pdf-and-email-it).

```javascript
const pdf = await engine.getManager('ExportManager').htmlToPdf(ctx, html, {
  format: 'Letter',              // Letter, Legal, Tabloid, Ledger, A0–A6; default ngdpbase.export.pdf.page-size
  margin: { top: '15mm' },       // CSS lengths in px, in, cm or mm; default none
  printBackground: true          // default true
});
```

An `@page` rule in the HTML wins over `format` and `margin`, as when a browser prints. A bad option is refused with a `TypeError` before anything starts.

### The engine

Headless Chromium, driven by `playwright-core` (decided on #1974: engine A, optional at run time).

- `playwright-core` is an `optionalDependency`, pinned to the version `@playwright/test` uses, so there is one copy. It has no install script: nothing downloads a browser at `npm install`.
- The browser is found on every call, in this order: `ngdpbase.export.pdf.chromium-path` when set (and only that: a missing configured path is unavailable, never a quiet fallback); Playwright's own Chromium (`npx playwright install chromium`); then `/usr/bin/chromium`, `/usr/bin/chromium-browser`, `/usr/lib/chromium/chromium`, `/usr/bin/google-chrome`, `/usr/bin/google-chrome-stable`, `/snap/bin/chromium`, and the usual macOS and Windows Chrome locations (`SYSTEM_CHROMIUM_PATHS` in `src/export/pdfEngine.ts`). Installing Chromium takes effect without a restart.
- The container image installs Alpine's `chromium` and `font-liberation`, so container sites have PDF with no setting. A direct install adds Chromium itself ([SETUP.md](../../SETUP.md#optional-chromium-for-pdf)).

### Sandbox

- JavaScript is off in the page.
- Every request the page makes is aborted except `data:` URIs (`isAllowedPdfRequest` in `src/export/pdfNormalize.ts`); the browser context is also offline and its proxy points at a closed port. Images, stylesheets and fonts must be inlined. `file:` URLs are not loaded.
- The render runs in a child process with only `PATH`, `HOME`, the temp and locale variables and the font-config variables in its environment, none of the site's secrets.

### Deterministic output

Chromium writes the render time (`/CreationDate`, `/ModDate`) and its user agent (`/Creator`) into each PDF. `normalizePdf` (pdf-lib) removes the dates and any trailer `/ID`, and sets `/Producer` and `/Creator` to `ngdpbase`. `/Title` comes from the HTML's `<title>`. The same HTML on the same core version and the same Chromium and fonts gives the same bytes; `src/export/__tests__/pdfEngine.integration.test.ts` renders an invoice twice and compares SHA-256. A different Chromium build or font set may lay the page out differently, so a fingerprint holds for the document issued, not for a re-render on another site.

Fonts: the image ships Liberation (metric-compatible with Arial, Times New Roman and Courier New). Core ships no font files of its own; an add-on that needs a font everywhere embeds it with `@font-face { src: url(data:font/woff2;base64,…) }`.

### Off the request path

Each render is its own child process (`src/export/pdfRenderWorker.ts`): it launches Chromium, renders, normalises, answers and exits. The site waits on nothing but the answer.

- `ngdpbase.export.pdf.timeout-ms` (default `30000`): the child and its Chromium are killed after this, and `htmlToPdf` rejects with "PDF render timed out".
- `ngdpbase.export.pdf.max-concurrent` (default `2`): renders running at once. More wait their turn; the timeout counts from when a render starts, not from when it was asked for.

### When there is no engine

`htmlToPdf` throws `PdfUnavailableError` (`code: 'PDF_UNAVAILABLE'`) when `playwright-core` is not installed, no Chromium is found, or Chromium cannot start. The server log says which, at warn level.

Decided for #1974: ExportManager reports itself only __once something has asked for a PDF__. A site that never makes one is never flagged, since PDF is optional. The first refused call sets ExportManager to "Working, but needs your attention" on the admin dashboard (`markNeedsAttention`, reason `PDF_UNAVAILABLE_REASON`, config key `ngdpbase.export.pdf.chromium-path`). The next render that works clears it. An outage already shown for ExportManager (the export folder) is not replaced by it.

A render that starts and then fails (a timeout, a page Chromium cannot print) is a plain error and flags nothing.

No audit event is recorded: the render reads and changes nothing. The add-on that issues the document records it.

### Configuration

| Key | Default | What it does |
| --- | --- | --- |
| `ngdpbase.export.pdf.chromium-path` | `""` | The browser to run; empty finds one. `sensitive`: shown only to `admin-read` holders |
| `ngdpbase.export.pdf.page-size` | `"Letter"` | Page size when the caller names none |
| `ngdpbase.export.pdf.timeout-ms` | `30000` | A render is killed after this |
| `ngdpbase.export.pdf.max-concurrent` | `2` | Renders at once |

All four are read on every render, so a change applies without a restart.

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
- [EmailManager](EmailManager.md#attachments) - Sends a PDF as an attachment

## Known gaps

- [#1974](https://github.com/jwilleke/ngdpbase/issues/1974) — HTML to PDF:
  - Renders waiting for a slot have no queue limit, and the timeout does not count the wait.
  - Core ships no fonts of its own; the image's Liberation set, or whatever a direct install has, is what unembedded text uses.
  - There is no page-to-PDF export route or button; `htmlToPdf` is for add-ons and core code.
  - Each render starts its own Chromium (about half a second); there is no warm browser pool.

## Developer Documentation

For complete API reference, see:

- [ExportManager-Complete-Guide.md](ExportManager-Complete-Guide.md)
- [Generated API Docs](../api/generated/src/managers/ExportManager/README.md)
