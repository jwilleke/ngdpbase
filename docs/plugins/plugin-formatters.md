---
name: plugin-formatters
description: Shared utility functions for plugin authors — consistent parameter parsing, HTML output, pagination, and date formatting across the platform.
dateModified: '2026-09-08'
category: plugins
code: src/utils/pluginFormatters.ts
---

# Plugin Formatters (`src/utils/pluginFormatters.ts`)

Shared utility functions for plugin authors — consistent parameter parsing, HTML output, pagination, and date formatting across the platform.

## Usage

```ts
import {
  escapeHtml,
  parseMaxParam,
  parseBoolParam,
  formatAsList,
  formatAsTable,
  applyPagination,
  formatPaginationLinks,
} from '../../utils/pluginFormatters';
```

Import only what you need. All exports are named; there is no default export.

## Start here, not with a string of HTML

This module is the display vocabulary of the platform, and it is the default
path for plugin output rather than a convenience. A plugin is the intended
extension point of this application: if the shared vocabulary is optional, every
extension invents its own look and there is no house style to inherit.

Measured over the 34 bundled plugins when
[#1306](https://github.com/jwilleke/ngdpbase/issues/1306) was filed, 16 imported
this module __only__ for `escapeHtml` and the parameter helpers and then built
their own markup. Adoption had stopped at the utilities, so everyone who needed
a table wrote one.

So:

- A list of links is `formatAsList`, including one with icons, count badges or a
  per-item button.
- Rows of data are `formatAsTable`.
- A number shown to a person is `formatAsCount` — it carries the thousands
  separators.
- A list that can grow gets `applyPagination` + `formatPaginationLinks`, which
  emit the same control every other paginated surface uses.

`SearchPlugin` and `UndefinedPagesPlugin` use the whole vocabulary end to end
and are the ones to copy.

__If your output genuinely does not fit, the vocabulary is missing something.__
Say so on an issue and extend it here, rather than hand-rolling around it — that
is how `icon`, `badge`, `trailingHtml`, `listClass` and `itemClass` came to
exist.

---

## Parameter Parsing

These functions normalise raw plugin parameter values (which arrive as `string | number | boolean | undefined`) into typed values your plugin logic can use safely.

### `parseMaxParam(value, defaultMax?)`

Parse a `max=` parameter to a non-negative integer. Returns `defaultMax` (default `0`) for missing, empty, or non-numeric values. `0` means unlimited.

```ts
function parseMaxParam(value: string | number | undefined, defaultMax?: number): number
```

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `value` | `string \| number \| undefined` | — | Raw plugin parameter value |
| `defaultMax` | `number` | `0` | Returned when value is absent or invalid. `0` = unlimited |

```ts
const max = parseMaxParam(opts.max);          // 0 = show all
const max = parseMaxParam(opts.max, 10);      // default to 10 if not set
```

---

### `parseBoolParam(value, defaultVal)`

Parse a boolean plugin parameter. Accepts `'true'`/`'1'` → `true` and `'false'`/`'0'` → `false` (case-insensitive). Falls back to `defaultVal` for any other input.

```ts
function parseBoolParam(value: string | number | boolean | undefined, defaultVal: boolean): boolean
```

```ts
const showDraft = parseBoolParam(opts.showDraft, false);
```

---

### `parseSortParam(value, validKeys, defaultKey, defaultOrder?)`

Parse a `sort=` parameter that may include a direction suffix (e.g. `'name'`, `'name-asc'`, `'count-desc'`). Returns a `SortOptions` object.

```ts
function parseSortParam(
  value: string | undefined,
  validKeys: string[],
  defaultKey: string,
  defaultOrder?: SortOrder        // default: 'asc'
): SortOptions
```

```ts
const sort = parseSortParam(opts.sort, ['name', 'count', 'date'], 'name');
// sort.key   → 'name' | 'count' | 'date'
// sort.order → 'asc' | 'desc'
```

---

### `parsePageParam(value, defaultPage?)`

Parse a `page=` parameter to a 1-based integer. Returns `defaultPage` (default `1`) for missing or invalid values.

```ts
function parsePageParam(value: string | number | undefined, defaultPage?: number): number
```

---

### `parsePageSizeParam(value, defaultSize?)`

Parse a `pageSize=` parameter to a non-negative integer. Returns `defaultSize` (default `0`) for missing or invalid values. `0` disables pagination (show all rows).

```ts
function parsePageSizeParam(value: string | number | undefined, defaultSize?: number): number
```

```ts
const pageSize = parsePageSizeParam(opts.pageSize);   // 0 = disabled
const page     = parsePageParam(context.query?.['page'] ?? opts.page);
```

---

### `splitParam(value)`

Split a comma-separated plugin parameter into a trimmed, non-empty string array.

```ts
function splitParam(value: string | number | boolean | undefined): string[]
```

```ts
const tags = splitParam(opts.tags);   // 'foo, bar, baz' → ['foo', 'bar', 'baz']
```

---

### `resolveUserParam(value, context)`

Resolve a plugin parameter that may contain the special token `$currentUser` (case-insensitive) to the authenticated user's username. Returns `undefined` when the token is present but the visitor is anonymous — callers can use this to show a "please log in" prompt.

Non-token values are returned unchanged.

```ts
function resolveUserParam(
  value: string | undefined,
  context: { userName?: string; userContext?: { username?: string } }
): string | undefined
```

```ts
const author = resolveUserParam(opts.author, context);
if (opts.author?.toLowerCase() === '$currentuser' && !author) {
  return '<p>Please log in to view your pages.</p>';
}
```

---

## Array Helpers

### `applyMax(items, max)`

Slice an array to at most `max` items. When `max` is `0`, returns all items unchanged.

```ts
function applyMax<T>(items: T[], max: number): T[]
```

---

### `applyPagination(items, page, pageSize)`

Slice `items` to the requested page. When `pageSize` is `0`, returns all items as page 1 of 1. The `currentPage` in the result is clamped to `1..totalPages`.

```ts
function applyPagination<T>(items: T[], page: number, pageSize: number): PaginationResult<T>
```

```ts
const pageSize = parsePageSizeParam(opts.pageSize);
const page     = parsePageParam(context.query?.['page'] ?? opts.page);

if (pageSize > 0) {
  const paged = applyPagination(results, page, pageSize);
  const pagination = formatPaginationLinks(paged.currentPage, paged.totalPages, context.pageName);
  // render paged.items ...
}
```

`PaginationResult<T>` shape:

| Field | Type | Description |
| --- | --- | --- |
| `items` | `T[]` | The sliced page of items |
| `totalPages` | `number` | Total number of pages |
| `currentPage` | `number` | Clamped page number |
| `totalItems` | `number` | Total item count before slicing |

---

## Output Formatters

### `escapeHtml(text)`

Escape `&`, `<`, `>`, `"`, and `'` in a string for safe HTML insertion. Accepts any primitive; `null`/`undefined` return `''`.

```ts
function escapeHtml(text: string | number | boolean | null | undefined): string
```

Always call this before inserting user-supplied or config-derived values into an HTML string:

```ts
html += `<td><code>${escapeHtml(value)}</code></td>`;
```

---

### `formatAsList(links, options?)`

Format an array of `PageLink` objects as an HTML `<ul>` list. Supports optional `before`/`after` markers around each item (JSPWiki-style). Returns an informational message when the list is empty.

```ts
function formatAsList(links: PageLink[], options?: FormatOptions): string
```

`PageLink` shape:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `href` | `string` | Yes | Link URL |
| `text` | `string` | Yes | Display text (HTML-escaped automatically) |
| `cssClass` | `string` | No | CSS class on the `<a>` element |
| `style` | `string` | No | Inline style on the `<a>` element |
| `title` | `string` | No | `title` attribute on the `<a>` element |
| `icon` | `string` | No | Icon class rendered before the text (e.g. `fas fa-bookmark`). A class name, escaped into the attribute — not markup |
| `badge` | `string` | No | Value shown at the end of the row, e.g. a count. HTML-escaped: a badge is data |
| `trailingHtml` | `string` | No | Markup appended after the link — a per-item action button. Inserted __verbatim__, so escaping anything interpolated into it is the caller's job |

`FormatOptions` also takes `listClass` and `itemClass`, which put your classes on
the `<ul>` and each `<li>`. Between them these five fields are why a plugin no
longer has to hand-roll a list to get a count badge, an icon or a remove button
([#1306](https://github.com/jwilleke/ngdpbase/issues/1306)) — the three reasons
plugins actually had.

```ts
formatAsList(
  pinned.map(item => ({
    href: item.url,
    text: item.title,
    icon: 'fas fa-bookmark',
    trailingHtml: `<button onclick="unpin('${item.id}')">×</button>`
  })),
  { listClass: 'nav flex-column', itemClass: 'nav-item' }
);
```

```ts
const links: PageLink[] = pages.map(p => ({ href: `/view/${p.slug}`, text: p.title }));
return formatAsList(links, { before: opts.before, after: opts.after });
```

---

### `formatAsTable(headers, rows, options?)`

Format rows of data as an HTML `<table>`. Cell values may contain raw HTML (e.g. anchor tags). Header values are plain text and are HTML-escaped automatically.

```ts
function formatAsTable(headers: string[], rows: string[][], options?: TableOptions): string
```

`TableOptions` shape:

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `sortable` | `boolean` | `false` | Adds `sortable` CSS class so `tableSort.js` activates |
| `defaultSortColumn` | `number` | — | 0-indexed initial sort column |
| `defaultSortOrder` | `SortOrder` | `'asc'` | Initial sort direction |
| `cellDataSort` | `Record<number, (row, rowIndex) => string>` | — | Per-column callback returning a `data-sort` attribute value for cells that contain HTML |

```ts
return formatAsTable(
  ['Page', 'Last Modified', 'Author'],
  pages.map(p => [
    `<a href="/view/${escapeHtml(p.slug)}">${escapeHtml(p.title)}</a>`,
    escapeHtml(p.lastModified),
    escapeHtml(p.author),
  ]),
  { sortable: true, defaultSortColumn: 1, defaultSortOrder: 'desc' }
);
```

---

### `formatAsCount(n)`

Format a number with locale-appropriate thousands separators.

```ts
function formatAsCount(n: number): string
// formatAsCount(32227) → '32,227'
```

---

### `formatPaginationLinks(currentPage, totalPages, pageName, queryParam?)`

Build prev/next pagination HTML for a plugin result set. Returns `''` when there is only one page. Links are built as `/view/{pageName}?{queryParam}=N`.

```ts
function formatPaginationLinks(
  currentPage: number,
  totalPages: number,
  pageName: string,
  queryParam?: string    // default: 'page'
): string
```

```ts
const paged = applyPagination(results, page, pageSize);
const paginationHtml = formatPaginationLinks(paged.currentPage, paged.totalPages, context.pageName);
```

---

### `extractExcerpt(raw, maxLen)`

Strip frontmatter, plugin syntax, Markdown decoration, and list bullets from raw page content, then truncate at the last word boundary before `maxLen` characters. Useful for card excerpts and search snippets.

```ts
function extractExcerpt(raw: string, maxLen: number): string
```

```ts
const excerpt = extractExcerpt(page.content, 200);
```

---

## Date & Duration

### `formatDateTime(date, locale?)`

Format a `Date` as a locale-aware date/time string. Example: `"Apr 19, 2026, 10:30 AM"`.

```ts
function formatDateTime(date: Date, locale?: string): string   // default locale: 'en-US'
```

---

### `formatRelativeTime(date, locale?)`

Format a `Date` as a relative time string. Examples: `"just now"`, `"2 hours ago"`, `"3 days ago"`, `"Apr 5, 2026"`. Switches to absolute date after 7 days.

```ts
function formatRelativeTime(date: Date, locale?: string): string
```

---

### `formatDuration(seconds)`

Format a duration in seconds as a human-readable string. Examples: `"3d 12h 45m"`, `"5h 30m"`, `"15m"`.

```ts
function formatDuration(seconds: number): string
```

---

## Miscellaneous

### `shuffleArray(arr)`

Fisher-Yates in-place shuffle. Returns the same array reference.

```ts
function shuffleArray<T>(arr: T[]): T[]
```

---

## Types Reference

```ts
type SortOrder = 'asc' | 'desc';

interface SortOptions {
  key: string;
  order: SortOrder;
}

interface PageLink {
  href: string;
  text: string;
  cssClass?: string;
  style?: string;
  title?: string;
  icon?: string;          // icon CLASS, escaped into the attribute
  badge?: string;         // escaped — a badge is a value
  trailingHtml?: string;  // verbatim — the caller owns escaping
}

interface FormatOptions {
  before?: string;
  after?: string;
  listClass?: string;
  itemClass?: string;
}

interface TableOptions {
  sortable?: boolean;
  defaultSortColumn?: number;
  defaultSortOrder?: SortOrder;
  cellDataSort?: Record<number, (row: string[], rowIndex: number) => string>;
}

interface PaginationResult<T> {
  items: T[];
  totalPages: number;
  currentPage: number;   // clamped to 1..totalPages
  totalItems: number;
}
```
