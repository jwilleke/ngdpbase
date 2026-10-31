---
name: ExportManager
description: Per-page export to HTML or Markdown, the one CSV writer for every CSV export, and HTML to PDF through a chosen provider (none, local Chromium, or a Chromium service)
dateModified: '2026-10-23'
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

### Providers

`ngdpbase.export.pdf.provider` chooses the engine, as `ngdpbase.mail.provider` does for EmailManager and `ngdpbase.database.provider` for DatabaseManager (operator decision on #1974, 2026-10-23). The container image carries no browser; a site chooses where Chromium runs.

| Provider | Class | Engine | For |
| --- | --- | --- | --- |
| `none` (default) | `NonePdfProvider` | none: `htmlToPdf` throws `PdfUnavailableError` | a site that makes no PDFs; add-ons fall back to HTML |
| `local-chrome` | `LocalChromePdfProvider` | a Chromium already on the machine | a direct (bare-metal) install |
| `chrome-service` | `ChromeServicePdfProvider` | a separate Chromium service by URL (Gotenberg) | a container site |

The classes are in `src/export/`, behind the `PdfProvider` interface (`src/export/PdfProvider.ts`): `render({ html, options, timeoutMs })` returns the normalised PDF, throws `PdfUnavailableError` when there is no engine to use, and throws a plain `Error` when the engine ran and the render failed. Another engine (WeasyPrint, say) is one more class and one more name. A name that is not a provider is unavailable, and the log names the ones there are.

#### local-chrome

Headless Chromium, driven by `playwright-core`.

- `playwright-core` is an `optionalDependency`, pinned to the version `@playwright/test` uses, so there is one copy. It has no install script: nothing downloads a browser at `npm install`.
- The browser is found on every call, in this order: `ngdpbase.export.pdf.provider.local-chrome.chromium-path` when set (and only that: a missing configured path is unavailable, never a quiet fallback); Playwright's own Chromium (`npx playwright install chromium`); then `/usr/bin/chromium`, `/usr/bin/chromium-browser`, `/usr/lib/chromium/chromium`, `/usr/bin/google-chrome`, `/usr/bin/google-chrome-stable`, `/snap/bin/chromium`, and the usual macOS and Windows Chrome locations (`SYSTEM_CHROMIUM_PATHS` in `src/export/pdfEngine.ts`). Installing Chromium takes effect without a restart. Setting it up: [SETUP.md](../../SETUP.md#optional-pdf-export).
- Sandbox: JavaScript is off in the page. Every request the page makes is aborted except `data:` URIs (`isAllowedPdfRequest` in `src/export/pdfNormalize.ts`); the browser context is also offline and its proxy points at a closed port. Images, stylesheets and fonts must be inlined. `file:` URLs are not loaded.
- Each render is its own child process (`src/export/pdfRenderWorker.ts`), with only `PATH`, `HOME`, the temp and locale variables and the font-config variables in its environment, none of the site's secrets. It launches Chromium, renders, normalises, answers and exits; it and its Chromium are killed at `ngdpbase.export.pdf.timeout-ms`.

#### chrome-service

A Chromium service the site reaches by URL, speaking [Gotenberg](https://gotenberg.dev)'s HTML route. Checked against Gotenberg 8.38.1.

- The request: `POST <url>/forms/chromium/convert/html`, `multipart/form-data`, with the document as the `files` part named `index.html` (`text/html; charset=utf-8`) and these fields: `paperWidth` and `paperHeight` (the named size in inches, as Chromium's own print uses), `marginTop`, `marginRight`, `marginBottom`, `marginLeft` (the caller's lengths, `0` when unset, since Gotenberg's own default margin is not zero), `preferCssPageSize=true` (an `@page` rule wins, as locally) and `printBackground`. The answer must be `200` and start `%PDF-`.
- Outbound through `guardedFetch`, under the site's egress policy (`ngdpbase.security.egress.*`). A service on the LAN or in the cluster has a private address, which the policy refuses until its range is in `ngdpbase.security.egress.allowed-ranges`; loopback (`127.0.0.1`, `localhost`) is never reachable, so a service on the same host is addressed by its LAN or container-network address.
- `ngdpbase.export.pdf.timeout-ms` bounds the whole request; `ngdpbase.export.pdf.provider.chrome-service.max-bytes` bounds the answer.
- The PDF goes through the same `normalizePdf` pass a local render gets, in a child process (`normalizePdfInChild`), so parsing it never runs on the thread that answers requests.
- Unavailable (flagged): no URL set, refused by the egress policy, or nothing answering. A render failure (not flagged): a timeout, a non-`200` answer, an answer that is not a PDF or is too large.
- What the service's Chromium may load is the service's own setting, not the request's: run Gotenberg with JavaScript off and no outside URLs ([SETUP.md](../../SETUP.md#chrome-service-gotenberg)), and inline images, stylesheets and fonts as for `local-chrome`.
- Gotenberg's Chromium fetches from Gotenberg's own network, so a URL in the HTML can reach hosts the site cannot (another container, a cloud metadata address). Two Gotenberg flags limit it. `--chromium-allow-list` (SETUP.md sets `^(data:|file:///tmp/)`) loads nothing else. `--chromium-deny-list` refuses what matches, after the allow list; its default, `^file:(?!//\/tmp/).*`, blocks only local files, so a site that cannot use the allow list should at least deny `file:` outside Gotenberg's temp folder, loopback, the private ranges and link-local, for example `'--chromium-deny-list=^(file:(?!//\/tmp/)|https?://(localhost|127\.|0\.|10\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|\[)).*'`. A deny list by address does not catch a host name that resolves inside the network (`http://elasticsearch:9200`), which is why the allow list is the setting to use.
- The page export (`core.pdf`, [#2120](https://github.com/jwilleke/ngdpbase/issues/2120)) does not rely on those flags: it takes every URL that is not `data:` out of the HTML before it leaves the process (`withoutRemoteUrls`, `src/ice/shims/export.ts`). Any other caller of `htmlToPdf` (an add-on's invoice, say) passes HTML it built itself, and still relies on them.

### Deterministic output

Chromium writes the render time (`/CreationDate`, `/ModDate`) and its user agent (`/Creator`) into each PDF. `normalizePdf` (pdf-lib) removes the dates and any trailer `/ID`, and sets `/Producer` and `/Creator` to `ngdpbase`. `/Title` comes from the HTML's `<title>`. The same HTML on the same core version, provider and engine version (the same Chromium and fonts, or the same Gotenberg image) gives the same bytes; `src/export/__tests__/pdfEngine.integration.test.ts` renders an invoice twice through local Chromium and compares SHA-256, and `ChromeServicePdfProvider.test.ts` does the same through a stub service. A different engine or font set may lay the page out differently, so a fingerprint holds for the document issued, not for a re-render on another site or provider.

Fonts: core ships no font files of its own, and each engine uses its own (Gotenberg's image carries a broad set). An add-on that needs a font everywhere embeds it with `@font-face { src: url(data:font/woff2;base64,…) }`.

### Off the request path

A local render, and the metadata pass on a service's PDF, each run in a child process; a service render waits on the network. The site waits on nothing but the answer.

- `ngdpbase.export.pdf.timeout-ms` (default `30000`): a local child and its Chromium are killed after this; a service request is abandoned. `htmlToPdf` rejects with a "timed out" error.
- `ngdpbase.export.pdf.max-concurrent` (default `2`): renders running at once, whatever the provider. More wait their turn; the timeout counts from when a render starts, not from when it was asked for.

### When there is no engine

`htmlToPdf` throws `PdfUnavailableError` (`code: 'PDF_UNAVAILABLE'`) when the provider is `none` or not a provider, or the chosen one cannot be used: for `local-chrome`, `playwright-core` is not installed, no Chromium is found, or Chromium cannot start; for `chrome-service`, see above. The server log says which, at warn level.

Decided for #1974: ExportManager reports itself only __once something has asked for a PDF__. A site that never makes one is never flagged, since PDF is optional. The first refused call sets ExportManager to "Working, but needs your attention" on the admin dashboard (`markNeedsAttention`, reason `PDF_UNAVAILABLE_REASON`, config key `ngdpbase.export.pdf.provider`). The next render that works clears it. An outage already shown for ExportManager (the export folder) is not replaced by it.

A render that starts and then fails (a timeout, a page Chromium cannot print, a service error) is a plain error and flags nothing.

No audit event is recorded: the render reads and changes nothing. The add-on that issues the document records it.

### Configuration

| Key | Default | What it does |
| --- | --- | --- |
| `ngdpbase.export.pdf.provider` | `"none"` | `none`, `local-chrome` or `chrome-service` |
| `ngdpbase.export.pdf.provider.local-chrome.chromium-path` | `""` | The browser to run; empty finds one. `sensitive`: shown only to `admin-read` holders |
| `ngdpbase.export.pdf.provider.chrome-service.url` | `""` | The service's base URL, e.g. `http://gotenberg.<namespace>.svc.cluster.local:3000`. `sensitive` |
| `ngdpbase.export.pdf.provider.chrome-service.max-bytes` | `52428800` | The largest PDF accepted from the service |
| `ngdpbase.export.pdf.page-size` | `"Letter"` | Page size when the caller names none |
| `ngdpbase.export.pdf.timeout-ms` | `30000` | A render, or the whole service request, is stopped after this |
| `ngdpbase.export.pdf.max-concurrent` | `2` | Renders at once |

All are read on every render, so a change applies without a restart.

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
  - Core ships no fonts of its own; whatever the engine has is what unembedded text uses.
  - There is no page-to-PDF export route or button; `htmlToPdf` is for add-ons and core code.
  - `local-chrome` starts its own Chromium per render (about half a second); there is no warm browser pool.
  - `chrome-service` cannot hold the service's Chromium to the `data:`-only rule from the request; that is the service's own setting.
  - `chrome-service` speaks Gotenberg's API only, and sends no credentials (Gotenberg's optional basic auth is not supported).

## Developer Documentation

For complete API reference, see:

- [ExportManager-Complete-Guide.md](ExportManager-Complete-Guide.md)
- [Generated API Docs](../api/generated/src/managers/ExportManager/README.md)
