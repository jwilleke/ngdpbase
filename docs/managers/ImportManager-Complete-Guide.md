# ImportManager Complete Guide

## Overview

`ImportManager` manages the import of content from external sources into ngdpbase. It uses an extensible __converter registry__ to support multiple source formats. The admin UI at `/admin/import` is the primary interface; the manager can also be used programmatically.

__Source:__ `src/managers/ImportManager.ts`  
__Converters:__ `src/converters/`

---

## Supported Formats

| Format ID | Class | Extensions | Notes |
|-----------|-------|------------|-------|
| `jspwiki` | `JSPWikiConverter` | `.txt` | Converts JSPWiki markup to Markdown |
| `html` | `HtmlConverter` | `.html`, `.htm` | Extracts article content, converts to Markdown |
| `markdown` | *(pending #467)* | `.md`, `.markdown` | Pass-through — see [ngdpbase#467](https://github.com/jwilleke/ngdpbase/issues/467) |

Select __Auto-detect__ (`format: 'auto'`) to let the system choose based on file extension and content sniffing via `canHandle()`.

---

## Architecture: Converter Registry

All converters implement `IContentConverter` (`src/converters/IContentConverter.ts`):

```typescript
interface IContentConverter {
  readonly formatId: string;       // e.g. 'jspwiki'
  readonly formatName: string;     // e.g. 'JSPWiki' (shown in UI)
  readonly fileExtensions: string[]; // e.g. ['.txt']

  convert(content: string): ConversionResult;
  canHandle(content: string, filename: string): boolean;
}

interface ConversionResult {
  content: string;                      // converted Markdown
  metadata: Record<string, unknown>;    // extracted frontmatter fields
  warnings: string[];                   // non-fatal issues
}
```

Built-in converters are registered in the constructor:

```typescript
this.registerConverter(new JSPWikiConverter());
this.registerConverter(new HtmlConverter());
```

The UI dropdown is auto-populated from `getConverterInfo()`, which returns the `formatId`, `formatName`, and `fileExtensions` of every registered converter.

---

## Adding a New Converter

1. Create `src/converters/MyFormatConverter.ts` implementing `IContentConverter`.
2. Export it from `src/converters/index.ts`.
3. Register it in `ImportManager` constructor:

   ```typescript
   this.registerConverter(new MyFormatConverter());
   ```

4. The format will automatically appear in the `/admin/import` dropdown.

No other changes are needed — the registry handles discovery.

---

## Import Options

```typescript
interface ImportOptions {
  sourceDir: string;          // directory or zip containing source files
  targetDir?: string;         // destination (default: data/pages)
  format?: string;            // converter formatId, or 'auto'
  preserveOriginals?: boolean; // keep source files (default: true)
  dryRun?: boolean;           // preview without writing (default: false)
  generateUUIDs?: boolean;    // generate UUIDs for new pages (default: true)
  fileExtensions?: string[];  // override extensions to process
  limit?: number;             // max files (for large imports)
  offset?: number;            // skip first N files (for resuming)
  onProgress?: (event: ImportProgressEvent) => void;
}
```

---

## What Happens During Import

1. Archive is extracted to a temporary directory (if `.zip` source).
2. Each file is matched to a converter via `format` option or auto-detection.
3. Converter runs `convert()` → returns Markdown + metadata + warnings.
4. UUID is generated (or preserved if present in frontmatter).
5. Frontmatter is written: `title`, `uuid`, `slug`, `lastModified`, plus any converter-extracted metadata.
6. File is written to `targetDir` (default: `data/pages`).
7. Page index is rebuilt after all files are processed.
8. Attachments in the archive are imported alongside pages.

Duplicate detection: if a page with the same slug already exists, the __Overwrite__ / __Skip__ option in the UI controls behavior.

---

## Programmatic Usage

```typescript
const importManager = engine.getManager('ImportManager') as ImportManager;

// List available converters
const converters = importManager.getConverterInfo();

// Dry run (preview)
const preview = await importManager.previewImport({
  sourceDir: '/path/to/wiki',
  format: 'auto'
});

// Execute import
const result = await importManager.importPages({
  sourceDir: '/path/to/wiki',
  format: 'jspwiki',
  dryRun: false,
  onProgress: (event) => console.log(event)
});

// Register a custom converter at runtime
importManager.registerConverter(new MyFormatConverter());
```

---

## Pending Work

- __[#467](https://github.com/jwilleke/ngdpbase/issues/467)__ — Add `MarkdownConverter` for `.md`/`.markdown` files. Currently `.md` files cannot be imported via `/admin/import`. See issue for scope and acceptance criteria.

---

## Related

- `src/converters/IContentConverter.ts` — converter interface
- `src/converters/JSPWikiConverter.ts` — JSPWiki implementation
- `src/converters/HtmlConverter.ts` — HTML implementation
- `docs/managers/ExportManager.md` — companion export functionality
- Admin UI: `/admin/import`

---

## Sibling: FeedManager ([#685](https://github.com/jwilleke/ngdpbase/issues/685))

`ImportManager` (this doc) handles __operator-triggered one-shot__ imports — file upload at `/admin/import`, stateless converter registry, output is wiki pages. Its sibling __FeedManager__ (filed, not yet implemented) will handle __scheduled live feeds__ — URL-driven, cron-managed, state-bearing (last-fetched + dedup + change-detection), output is __catalog records__ consumed by `[DataFeed]` / `[Marquee]` plugins rather than materialised as pages.

Same problem family ("get external structured data into the wiki"), different lifecycle:

| | ImportManager (shipped) | FeedManager ([#685](https://github.com/jwilleke/ngdpbase/issues/685)) |
|---|---|---|
| Trigger | Operator at `/admin/import` | Cron / scheduler |
| Input | File upload (JSPWiki, HTML, MD pending [#467](https://github.com/jwilleke/ngdpbase/issues/467)) | URL feed (REST, RSS, CSV, GeoJSON, WFS, XLS) |
| Output | Wiki pages | Catalog records (queryable via `CatalogSource`) |
| State | Stateless beyond converter registry | Last-fetched, dedup, stale-feed warnings |
| Consumer | The created page __is__ the product | `[DataFeed source=…]` + `[Marquee source=…]` plugins |
| Materialise as page? | Always | Only when operator explicitly curates a subject page |
| Packaging | Manager (in-engine) | __Addon__ (long-running, disable-able) |

They share normalization primitives (`kind` codes from [#728](https://github.com/jwilleke/ngdpbase/issues/728), page-creation utilities) for the rare materialize-as-page case — but __do not share codepaths__. See [#685](https://github.com/jwilleke/ngdpbase/issues/685) for the full design.
