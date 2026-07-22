/**
 * Shared plugin formatting utilities for ngdpbase plugins.
 * Implements the common output formats defined in issue #238 (Code Consolidation).
 *
 * All plugins should use these helpers to ensure consistent behaviour for
 * `max`, `format`, `before`, and `after` parameters across the platform.
 */

/** A renderable page link with href, display text, and optional styling */
export interface PageLink {
  href: string;
  text: string;
  cssClass?: string;
  style?: string;
  title?: string;
}

/** Options for list/item formatting */
export interface FormatOptions {
  before?: string;
  after?: string;
}

/**
 * Parse a `max` plugin parameter to an integer.
 * Returns `defaultMax` if the value is missing, empty, or non-numeric.
 * A value of 0 means unlimited.
 */
export function parseMaxParam(value: string | number | undefined, defaultMax = 0): number {
  if (value === undefined || value === null || value === '') return defaultMax;
  const n = parseInt(String(value), 10);
  return isNaN(n) || n < 0 ? defaultMax : n;
}

/**
 * Apply a max limit to an array.
 * max=0 means unlimited (returns all items unchanged).
 */
export function applyMax<T>(items: T[], max: number): T[] {
  return max > 0 ? items.slice(0, max) : items;
}

/**
 * Escape HTML special characters.
 * Accepts any primitive value; null/undefined return an empty string.
 */
export function escapeHtml(text: string | number | boolean | null | undefined): string {
  if (text === null || text === undefined) return '';
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

/**
 * Format a list of page links as an HTML bullet list.
 * Supports optional `before`/`after` markers around each item (JSPWiki-style).
 * Returns an informational message when the list is empty.
 */
export function formatAsList(links: PageLink[], options: FormatOptions = {}): string {
  if (links.length === 0) {
    return '<p><em>No pages found.</em></p>';
  }

  const before = options.before ?? '';
  const after  = options.after  ?? '';

  const processedBefore = before.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
  const processedAfter  = after.replace(/\\n/g,  '\n').replace(/\\t/g, '\t');

  const buildAnchor = (link: PageLink): string => {
    const cls   = link.cssClass ? ` class="${link.cssClass}"` : '';
    const style = link.style    ? ` style="${link.style}"`    : '';
    const title = link.title    ? ` title="${escapeHtml(link.title)}"` : '';
    return `<a href="${link.href}"${cls}${style}${title}>${escapeHtml(link.text)}</a>`;
  };

  if (processedBefore || processedAfter) {
    const isList = processedBefore.includes('*') || processedBefore.includes('-');
    if (isList) {
      const items = links.map(l => `<li>${buildAnchor(l)}</li>`).join('\n');
      return `<ul>\n${items}\n</ul>`;
    }
    const safeBefore = processedBefore.replace(/\*/g, '&#42; ');
    const safeAfter  = processedAfter.replace(/\*/g,  '&#42; ');
    return links
      .map(l => `${safeBefore}${buildAnchor(l)}${safeAfter}`)
      .join('\n')
      .replace(/\n/g, '<br>');
  }

  // Default: <ul><li> list
  const items = links.map(l => `<li>${buildAnchor(l)}</li>`).join('\n');
  return `<ul>\n${items}\n</ul>`;
}

/**
 * Format a count with locale-appropriate thousands separators (e.g. 32,227).
 */
export function formatAsCount(n: number): string {
  return n.toLocaleString('en-US');
}

// ---------------------------------------------------------------------------
// Current-user token resolution
// ---------------------------------------------------------------------------

/** Usernames that represent an unauthenticated visitor */
const ANONYMOUS_NAMES = new Set(['anonymous', 'asserted', '']);

/**
 * Resolve a plugin parameter that may contain the special token `$currentUser`
 * (case-insensitive) to the authenticated user's username.
 *
 * Rules:
 * - Non-token values are returned unchanged.
 * - `$currentUser` resolves to the username from `context.userContext.username`
 *   or `context.userName`, whichever is set first.
 * - Returns `undefined` when the token was used but the visitor is anonymous
 *   (username is "anonymous", "asserted", or absent).  The caller can use this
 *   to detect the "token present but not logged in" case and show a prompt.
 *
 * @example
 * // In a plugin execute():
 * const author = resolveUserParam(params.author, context);
 * if (params.author?.toLowerCase() === '$currentuser' && !author) {
 *   return '<p>Please log in.</p>';
 * }
 */
export function resolveUserParam(
  value: string | undefined,
  context: { userName?: string; userContext?: { username?: string; [key: string]: unknown }; [key: string]: unknown }
): string | undefined {
  if (!value) return value;
  if (String(value).toLowerCase() !== '$currentuser') return value;

  const username = (context.userContext?.username)
    || (context.userName)
    || '';

  return ANONYMOUS_NAMES.has(username.toLowerCase()) ? undefined : username;
}

// ---------------------------------------------------------------------------
// 'current' keyword resolution (page-scoped plugins)
// ---------------------------------------------------------------------------

/**
 * Resolve a keyword parameter that may be the special token `current`
 * (case-insensitive) to the page's own keyword.
 *
 * EXIF/media and page keywords follow no single name-vs-slug convention across
 * a library — some content is tagged with the page NAME (`Dining`, `Travel`),
 * some with the SLUG (`2026-trip-west`). `current` therefore adapts: it tries
 * both the page name and its slug and keeps whichever yields more results
 * (tie / both-empty → name form). This gives page-scoped plugins one
 * self-scoping syntax that works regardless of how content was tagged:
 *   [{MediaPlugin keyword='current'}]   [{Search user-keywords='current'}]
 *
 * Non-`current` values are looked up as-is (single lookup).
 *
 * @param value    Raw keyword param — `current` (any case) triggers resolution.
 * @param pageName Current page name (from plugin context).
 * @param slugify  Name→slug; pass `ValidationManager.generateSlug` for the
 *                 canonical algorithm, or a simple slugifier as fallback.
 * @param lookup   Fetch results for a keyword (e.g. `listByKeyword`, or an
 *                 `advancedSearch`-by-keyword closure).
 * @returns The chosen keyword string and its results (results reusable by the
 *          caller so `current` costs at most two lookups, not three).
 */
export async function resolveCurrentKeyword<T>(
  value: string,
  pageName: string,
  slugify: (name: string) => string,
  lookup: (keyword: string) => Promise<T[]>
): Promise<{ keyword: string; results: T[] }> {
  if (value.toLowerCase() !== 'current') {
    return { keyword: value, results: value ? await lookup(value) : [] };
  }
  const name = pageName ?? '';
  const slug = name ? slugify(name) : '';
  const [byName, bySlug] = await Promise.all([
    name ? lookup(name) : Promise.resolve([] as T[]),
    slug && slug !== name ? lookup(slug) : Promise.resolve([] as T[])
  ]);
  return bySlug.length > byName.length
    ? { keyword: slug, results: bySlug }
    : { keyword: name, results: byName };
}

/**
 * Simple ASCII slugify fallback for callers without ValidationManager access.
 * Matches `generateSlug` for the common ASCII case (spaces/punct → single
 * hyphens, lowercased). Non-ASCII transliteration is NOT applied — pass
 * `ValidationManager.generateSlug` when that matters.
 */
export function simpleSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ---------------------------------------------------------------------------
// Sort utilities
// ---------------------------------------------------------------------------

export type SortOrder = 'asc' | 'desc';

export interface SortOptions {
  key: string;
  order: SortOrder;
}

/**
 * Parse a `sort=` plugin parameter.
 * Accepts "name", "name-asc", "name-desc", "count-asc", "count-desc", etc.
 * validKeys is the list of allowed key names.
 * Falls back to defaultKey/defaultOrder for any unrecognised value.
 */
export function parseSortParam(
  value: string | undefined,
  validKeys: string[],
  defaultKey: string,
  defaultOrder: SortOrder = 'asc'
): SortOptions {
  if (!value) return { key: defaultKey, order: defaultOrder };
  const v = String(value).toLowerCase().trim();
  for (const key of validKeys) {
    if (v === key)            return { key, order: defaultOrder };
    if (v === `${key}-asc`)   return { key, order: 'asc' };
    if (v === `${key}-desc`)  return { key, order: 'desc' };
  }
  return { key: defaultKey, order: defaultOrder };
}

// ---------------------------------------------------------------------------
// Table formatting
// ---------------------------------------------------------------------------

export interface TableOptions {
  /** When true, adds the "sortable" CSS class so tableSort.js activates */
  sortable?: boolean;
  /** 0-indexed column that is the initial sort column */
  defaultSortColumn?: number;
  /** Initial sort direction (default: 'asc') */
  defaultSortOrder?: SortOrder;
  /**
   * Per-column callbacks that return a `data-sort` attribute value for a cell.
   * Keyed by column index.  Needed when a cell contains HTML (e.g. links) but
   * tableSort.js should sort on the underlying numeric/text value.
   * Receives the cell's row data AND the 0-based row index within `rows`.
   */
  cellDataSort?: Record<number, (row: string[], rowIndex: number) => string>;
}

/**
 * Format rows of data as an HTML table.
 * Cell values may contain raw HTML (e.g. anchor tags).
 * Header values are plain text and will be HTML-escaped.
 *
 * @param headers - Column header strings (plain text)
 * @param rows    - Array of row arrays; each element is a cell value (may be raw HTML)
 * @param options - Optional table rendering options (sortable, pagination hints, etc.)
 */
export function formatAsTable(headers: string[], rows: string[][], options?: TableOptions): string {
  if (rows.length === 0) {
    return '<p><em>No pages found.</em></p>';
  }

  const opts = options ?? {};
  const classes = ['plugin-table'];
  if (opts.sortable) classes.push('sortable');

  let tableAttrs = `class="${classes.join(' ')}"`;
  if (opts.sortable && opts.defaultSortColumn !== undefined) {
    tableAttrs += ` data-sort-column="${opts.defaultSortColumn}" data-sort-direction="${opts.defaultSortOrder ?? 'asc'}"`;
  }

  const headerHtml = headers.map(h => `<th>${escapeHtml(h)}</th>`).join('');
  const rowsHtml   = rows.map((row, rowIndex) =>
    `<tr>${row.map((cell, colIdx) => {
      if (opts.cellDataSort?.[colIdx]) {
        const sortVal = opts.cellDataSort[colIdx](row, rowIndex);
        return `<td data-sort="${escapeHtml(sortVal)}">${cell}</td>`;
      }
      return `<td>${cell}</td>`;
    }).join('')}</tr>`
  ).join('\n');

  return [
    `<table ${tableAttrs}>`,
    `<thead><tr>${headerHtml}</tr></thead>`,
    '<tbody>',
    rowsHtml,
    '</tbody>',
    '</table>'
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Duration and date formatting
// ---------------------------------------------------------------------------

/**
 * Format a duration in seconds as a human-readable string.
 * Examples: "3d 12h 45m", "5h 30m", "15m"
 */
export function formatDuration(seconds: number): string {
  const days    = Math.floor(seconds / 86400);
  const hours   = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0)  return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Format a Date as a locale-aware date/time string.
 * Example: "Apr 19, 2026, 10:30 AM"
 */
export function formatDateTime(date: Date, locale = 'en-US'): string {
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true
  };
  return date.toLocaleString(locale, options);
}

/**
 * Format a Date as a relative time string.
 * Examples: "just now", "2 hours ago", "3 days ago", "Apr 5, 2026"
 */
export function formatRelativeTime(date: Date, locale = 'en-US'): string {
  const diffMs      = Date.now() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours   = Math.floor(diffMinutes / 60);
  const diffDays    = Math.floor(diffHours / 24);

  if (diffSeconds < 60)  return 'just now';
  if (diffMinutes < 60)  return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
  if (diffHours < 24)    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays < 7)      return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  return date.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Plugin parameter helpers
// ---------------------------------------------------------------------------

/**
 * Split a comma-separated plugin parameter into a trimmed, non-empty array.
 * Example: splitParam('a, b, c') → ['a', 'b', 'c']
 */
export function splitParam(value: string | number | boolean | undefined): string[] {
  if (!value) return [];
  return String(value).split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Parse a boolean plugin parameter.
 * '0' and 'false' (case-insensitive) → false; '1' and 'true' → true; else → defaultVal.
 */
export function parseBoolParam(value: string | number | boolean | undefined, defaultVal: boolean): boolean {
  if (value === undefined || value === null || value === '') return defaultVal;
  const s = String(value).toLowerCase().trim();
  if (s === 'false' || s === '0') return false;
  if (s === 'true'  || s === '1') return true;
  return defaultVal;
}

// ---------------------------------------------------------------------------
// Plugin placement
// ---------------------------------------------------------------------------

/**
 * Where a plugin's rendered output should sit in the page flow.
 *
 *   - 'right'  — float right; surrounding text wraps on the left (Wikipedia infobox).
 *   - 'left'   — float left; surrounding text wraps on the right.
 *   - 'block'  — full-width block element below the caption text. No float.
 *   - 'inline' — inline-block; sits next to other inline content.
 *
 * Plugins combine `placementClass(placement)` with their own classes, e.g.
 * `<div class="volcano-infobox plugin-placement-right">…</div>`. The
 * `.plugin-placement-*` CSS lives in ngdpbase core.css so every plugin gets a
 * consistent contract whether or not its addon stylesheet has loaded.
 */
export type Placement = 'right' | 'left' | 'block' | 'inline';

const VALID_PLACEMENTS: ReadonlySet<string> = new Set(['right', 'left', 'block', 'inline']);

/**
 * Parse a `placement=` plugin parameter to a validated `Placement` value.
 * Falls back to `defaultPlacement` for missing or unrecognised values.
 */
export function parsePlacementParam(
  value: string | undefined,
  defaultPlacement: Placement = 'right'
): Placement {
  if (value === undefined || value === null || value === '') return defaultPlacement;
  const v = String(value).toLowerCase().trim();
  return VALID_PLACEMENTS.has(v) ? (v as Placement) : defaultPlacement;
}

/**
 * Return the CSS class name for a given placement value.
 * Always returns `plugin-placement-<placement>`.
 */
export function placementClass(placement: Placement): string {
  return `plugin-placement-${placement}`;
}

// ---------------------------------------------------------------------------
// Text / content helpers
// ---------------------------------------------------------------------------

/**
 * Strip frontmatter, plugin syntax, and markdown decoration from raw page
 * content and return plain text suitable for a card excerpt, truncated at
 * the last word boundary before maxLen characters.
 */
export function extractExcerpt(raw: string, maxLen: number): string {
  const text = raw
    .replace(/^---[\s\S]*?---\n?/, '')         // YAML frontmatter
    .replace(/\[\{[^\]]*\}\]/g, '')             // [{Plugin}] syntax
    .replace(/!\[.*?\]\(.*?\)/g, '')            // markdown images
    .replace(/^#{1,6}\s+/gm, '')               // markdown headings
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')  // bold / italic
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')   // markdown links → label
    .replace(/\[([^\]]+)\]/g, '$1')            // wiki links → label
    .replace(/`{1,3}[^`]*`{1,3}/g, '')         // code spans / fences
    .replace(/^\s*[-*+]\s+/gm, '')             // list bullets
    .replace(/\n{2,}/g, ' ')                   // paragraph breaks → space
    .replace(/\n/g, ' ')
    .trim();

  if (text.length <= maxLen) return text;
  const cut = text.lastIndexOf(' ', maxLen);
  return (cut > 0 ? text.slice(0, cut) : text.slice(0, maxLen)) + '…';
}

/**
 * Fisher-Yates in-place shuffle. Returns the same array reference.
 */
export function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Pagination utilities
// ---------------------------------------------------------------------------

/**
 * Parse a `page=` plugin parameter to an integer (1-based).
 * Returns `defaultPage` if the value is missing, empty, or non-numeric.
 */
export function parsePageParam(value: string | number | undefined, defaultPage = 1): number {
  if (value === undefined || value === null || value === '') return defaultPage;
  const n = parseInt(String(value), 10);
  return isNaN(n) || n < 1 ? defaultPage : n;
}

/**
 * Parse a `pageSize=` plugin parameter to an integer.
 * Returns `defaultSize` (0 = disabled / use max= behaviour) for missing/invalid values.
 */
export function parsePageSizeParam(value: string | number | undefined, defaultSize = 0): number {
  if (value === undefined || value === null || value === '') return defaultSize;
  const n = parseInt(String(value), 10);
  return isNaN(n) || n < 0 ? defaultSize : n;
}

export interface PaginationResult<T> {
  items: T[];
  totalPages: number;
  /** Clamped to 1..totalPages */
  currentPage: number;
  totalItems: number;
}

/**
 * Slice `items` to the requested page.
 * When `pageSize` is 0 (disabled), returns all items as page 1 of 1.
 */
export function applyPagination<T>(items: T[], page: number, pageSize: number): PaginationResult<T> {
  if (pageSize <= 0) {
    return { items, totalPages: 1, currentPage: 1, totalItems: items.length };
  }
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    totalPages,
    currentPage,
    totalItems
  };
}

/**
 * Build prev/next pagination HTML for a plugin result set.
 * Returns '' when there is only one page (nothing to navigate).
 *
 * @param currentPage - The current page number (1-based)
 * @param totalPages  - Total number of pages
 * @param pageName    - Wiki page name used to build `/view/{pageName}?page=N`
 * @param queryParam  - Query string parameter name (default: 'page')
 */
export function formatPaginationLinks(
  currentPage: number,
  totalPages: number,
  pageName: string,
  queryParam = 'page'
): string {
  if (totalPages <= 1) return '';

  const base = `/view/${encodeURIComponent(pageName)}`;
  const prev = currentPage > 1
    ? `<a href="${base}?${queryParam}=${currentPage - 1}">\u00ab Prev</a>`
    : '<span class="disabled">\u00ab Prev</span>';
  const next = currentPage < totalPages
    ? `<a href="${base}?${queryParam}=${currentPage + 1}">Next \u00bb</a>`
    : '<span class="disabled">Next \u00bb</span>';

  return `<div class="plugin-pagination">${prev}&nbsp;&nbsp;Page ${currentPage} of ${totalPages}&nbsp;&nbsp;${next}</div>`;
}

// ---------------------------------------------------------------------------
// Manager-fetch convention (#685 slice 2)
// ---------------------------------------------------------------------------

/** Outcome of resolveManagerFetch — lets callers reproduce their own messaging. */
export type ManagerFetchResult =
  | { status: 'ok'; text: string }   // method resolved and returned text
  | { status: 'not-found' }          // spec well-formed but manager/method absent
  | { status: 'no-spec' };           // no spec, no engine, or malformed — caller should ignore

/**
 * Resolve the `fetch='ManagerName.methodName(k=v,...)'` plugin convention to text.
 *
 * Extracted from MarqueePlugin (#685 slice 2) so any plugin can inline a value
 * from a registered manager through one shared, tested implementation rather
 * than re-parsing the spec per plugin. The canonical method is the
 * `BaseManager.toMarqueeText()` convention; the raw `{k: v}` args object is
 * passed straight to the method (the manager owns its own option parsing via
 * `managerUtils.ts`).
 *
 * Behaviour is intentionally identical to the prior MarqueePlugin inline code:
 * a malformed spec or missing engine yields `no-spec` (caller falls through),
 * a well-formed spec whose target is absent yields `not-found`.
 *
 * NOTE (security): this resolves an arbitrary `Manager.method` from page
 * content — same surface as the original MarqueePlugin code. An allow-list /
 * read-only restriction is a deliberate follow-up (security-policy change,
 * tracked separately), not folded into this behaviour-preserving extraction.
 */
export async function resolveManagerFetch(
  spec: string | undefined,
  context: { engine?: { getManager(name: string): unknown } }
): Promise<ManagerFetchResult> {
  if (!spec || !context.engine) return { status: 'no-spec' };

  const match = String(spec).trim().match(/^([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\(([^)]*)\)$/);
  if (!match) return { status: 'no-spec' };

  const [, managerName, methodName, argsStr] = match;
  const fetchArgs: Record<string, string> = {};
  if (argsStr) {
    for (const pair of argsStr.split(',')) {
      const eq = pair.indexOf('=');
      if (eq > 0) fetchArgs[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
    }
  }

  const manager = context.engine.getManager(managerName) as Record<string, unknown> | undefined;
  if (manager && typeof manager[methodName] === 'function') {
    const text = String(await (manager[methodName] as (o: Record<string, string>) => unknown)(fetchArgs));
    return { status: 'ok', text };
  }
  return { status: 'not-found' };
}
