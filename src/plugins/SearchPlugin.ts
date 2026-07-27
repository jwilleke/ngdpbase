/**
 * SearchPlugin - JSPWiki-style search plugin for ngdpbase
 * Embeds search results directly in wiki pages
 *
 * Based on JSPWiki's SearchPlugin:
 * https://jspwiki-wiki.apache.org/Wiki.jsp?page=SearchPlugin
 *
 * Usage examples:
 * [{Search query='plugin' max=10}]
 * [{Search system-category='documentation'}]
 * [{Search user-keywords='economics'}]
 * [{Search query='manager' system-category='system' max=5}]
 * [{Search system-category='system' format='count'}]
 * [{Search system-category='documentation' format='titles'}]
 * [{Search user-keywords='test' format='list'}]
 * [{Search author='jim'}]
 * [{Search editor='jim'}]
 * [{Search author='jim' format='titles'}]
 * [{Search author='$currentUser' format='titles'}]
 *
 * Parameters:
 * - query: Search text query (default: '*' for all pages)
 * - system-category: Filter by system category
 * - user-keywords: Filter by user keywords (OR logic for multiple values)
 * - author: Filter by page author (original creator, from metadata.author); use '$currentUser' for the logged-in user
 * - editor: Filter by last editor (from metadata.editor); use '$currentUser' for the logged-in user
 * - since/until/date: #643 — filter by date (YYYY-MM-DD; `date` = whole-day).
 *   Field selected by `dateField` (defaults to `modified`).
 * - dateField: #774 — `modified` (default) or `created`. Filters `since/until/date`
 *   against `metadata.lastModified` or `metadata.created` respectively.
 *   `created` is reliable since #754 backfilled all pages at v3.33.0.
 * - max: Maximum number of results (default: 50, 0 = unlimited)
 * - pageSize: Results per page — enables pagination (default: 0 = disabled)
 * - page: Current page number (default: 1, also read from ?page= query string)
 * - format: Output format (default: 'table')
 *   - 'table': Full table with page names and scores (default)
 *   - 'count': Just the count of matching pages (e.g., "13")
 *   - 'titles': Bullet list of page titles with links
 *   - 'list': Simple list of page names (no links)
 *
 * Related: GitHub Issue #111
 */

import type { SimplePlugin, PluginContext, PluginParams } from './types.js';
import {
  escapeHtml,
  parseMaxParam,
  applyMax,
  parsePageSizeParam,
  parsePageParam,
  applyPagination,
  formatPaginationLinks,
  formatAsTable,
  formatAsList,
  formatAsCount,
  resolveUserParam,
  resolveCurrentKeyword,
  simpleSlug,
  type PageLink
} from '../utils/pluginFormatters.js';

interface SearchParams extends PluginParams {
  query?: string;
  'system-category'?: string;
  'user-keywords'?: string;
  author?: string;
  editor?: string;
  /** #643: filter by last-modified date (YYYY-MM-DD). `date` = whole-day. */
  since?: string;
  until?: string;
  date?: string;
  max?: string | number;
  format?: string;
  page?: string | number;
  pageSize?: string | number;
}

interface SearchResult {
  name?: string;
  title?: string;
  score?: number;
  metadata?: {
    systemCategory?: string;
    [key: string]: unknown;
  };
}

interface SearchOptions {
  query: string;
  maxResults: number;
  categories?: string[];
  userKeywords?: string[];
  author?: string;
  editor?: string;
  /** #643 / #774: date range (inclusive, whole-day). Field selected by
   *  `dateField` below — `'modified'` (default, the v3.22.0 behavior) filters
   *  `metadata.lastModified`; `'created'` (#774, requires #754) filters
   *  `metadata.created`. */
  dateRange?: { from?: string; to?: string };
  /** #774: which date field `dateRange` applies to. Default `'modified'`. */
  dateField?: 'modified' | 'created';
}

interface SearchManager {
  search(query: string, options: { maxResults: number }): Promise<SearchResult[]>;
  advancedSearch(options: SearchOptions): Promise<SearchResult[]>;
}

interface FormatOptions {
  query: string;
  systemCategory?: string;
  userKeywords?: string;
  author?: string;
  editor?: string;
  maxResults: number;
  format: string;
}

/**
 * Parse multi-value parameter (supports pipe-separated OR logic)
 * Examples:
 * - 'economics' -> ['economics']
 * - 'economics|geology' -> ['economics', 'geology']
 * @param value - Parameter value
 * @returns Array of values
 */
function parseMultiValue(value: string | undefined): string[] {
  if (!value) return [];

  // Split on pipe for OR logic
  return value.split('|')
    .map(v => v.trim())
    .filter(v => v.length > 0);
}

/**
 * Format search results as a simple count
 * @param results - Search results
 * @returns Count as text
 */
function formatCount(results: SearchResult[]): string {
  return `<span class="search-count">${formatAsCount(results ? results.length : 0)}</span>`;
}

/**
 * Format search results as a bullet list of titles with links
 * @param results - Search results
 * @param options - Search options for display
 * @returns HTML bullet list
 */
function formatTitles(results: SearchResult[], options: FormatOptions): string {
  if (!results || results.length === 0) {
    return `<div class="search-plugin">
  <p class="info">No results found${options.query !== '*' ? ` for query: "${escapeHtml(options.query)}"` : ''}</p>
</div>`;
  }

  const links: PageLink[] = results.map(result => ({
    href: `/view/${encodeURIComponent(result.name || result.title || 'Unknown')}`,
    text: result.title || result.name || 'Unknown',
    cssClass: 'wikipage'
  }));

  return `<div class="search-plugin search-titles">\n${formatAsList(links)}\n</div>\n`;
}

/**
 * Format search results as a simple list of page names (no links)
 * @param results - Search results
 * @param options - Search options for display
 * @returns HTML list
 */
function formatList(results: SearchResult[], options: FormatOptions): string {
  if (!results || results.length === 0) {
    return `<div class="search-plugin">
  <p class="info">No results found${options.query !== '*' ? ` for query: "${escapeHtml(options.query)}"` : ''}</p>
</div>`;
  }

  let html = '<div class="search-plugin search-list">\n';
  html += '<ul>\n';

  for (const result of results) {
    const title = result.title || result.name || 'Unknown';
    html += `  <li>${escapeHtml(title)}</li>\n`;
  }

  html += '</ul>\n';
  html += '</div>\n';

  return html;
}

/**
 * Format search results as JSPWiki-style table
 * @param results - Search results
 * @param options - Search options for display
 * @returns HTML table
 */
function formatResultsTable(results: SearchResult[], options: FormatOptions): string {
  if (!results || results.length === 0) {
    return `<div class="search-plugin">
  <p class="info">No results found${options.query !== '*' ? ` for query: "${escapeHtml(options.query)}"` : ''}</p>
</div>`;
  }

  // Build filter description
  let filterDesc = '';
  if (options.systemCategory) filterDesc += ` in category: ${escapeHtml(options.systemCategory)}`;
  if (options.userKeywords) filterDesc += ` with keywords: ${escapeHtml(options.userKeywords)}`;
  if (options.author) filterDesc += ` by author: ${escapeHtml(options.author)}`;
  if (options.editor) filterDesc += ` last edited by: ${escapeHtml(options.editor)}`;

  let html = '<div class="search-plugin">\n';
  html += '<div class="search-summary">\n';
  html += `  <p>Found <strong>${formatAsCount(results.length)}</strong> result${results.length !== 1 ? 's' : ''}`;
  if (options.query && options.query !== '*') {
    html += ` for <strong>"${escapeHtml(options.query)}"</strong>`;
  }
  if (filterDesc) html += filterDesc;
  html += '</p>\n</div>\n\n';

  const rows = results.map(result => {
    const pageName = result.name || result.title || 'Unknown';
    const title = result.title || result.name || 'Unknown';
    const score = result.score ? result.score.toFixed(3) : '1.000';
    let pageCell = `<a class="wikipage" href="/view/${encodeURIComponent(pageName)}">${escapeHtml(title)}</a>`;
    if (result.metadata?.systemCategory) {
      pageCell += ` <span class="badge badge-secondary">${escapeHtml(result.metadata.systemCategory)}</span>`;
    }
    return [pageCell, score];
  });

  html += formatAsTable(['Page', 'Score'], rows);
  html += '\n</div>\n';

  return html;
}

/**
 * Format search results based on format type
 * @param results - Search results
 * @param options - Search options for display
 * @returns Formatted output
 */
function formatResults(results: SearchResult[], options: FormatOptions): string {
  switch (options.format) {
  case 'count':
    return formatCount(results);
  case 'titles':
    return formatTitles(results, options);
  case 'list':
    return formatList(results, options);
  case 'table':
  default:
    return formatResultsTable(results, options);
  }
}

/**
 * SearchPlugin implementation
 */
const SearchPlugin: SimplePlugin = {
  name: 'SearchPlugin',
  description: 'JSPWiki-style search plugin for embedding search results in pages',
  author: 'ngdpbase',
  version: '2.0.0',

  /**
   * Execute the search plugin
   * @param context - Wiki context containing engine reference
   * @param params - Plugin parameters
   * @returns HTML output
   */
  async execute(context: PluginContext, params: PluginParams): Promise<string> {
    const opts = (params || {}) as SearchParams;

    try {
      // Get SearchManager from engine
      const searchManager = context?.engine?.getManager?.('SearchManager') as SearchManager | undefined;
      if (!searchManager) {
        return '<p class="error">SearchManager not available</p>';
      }

      // Parse parameters
      const query = String(opts.query || '*');
      const systemCategory = opts['system-category'];
      const userKeywords = opts['user-keywords'];
      const rawAuthor = opts.author ? String(opts.author) : undefined;
      const rawEditor = opts.editor ? String(opts.editor) : undefined;
      const author = resolveUserParam(rawAuthor, context);
      const editor = resolveUserParam(rawEditor, context);

      // If $currentUser token was used but visitor is not logged in, prompt to log in
      if ((rawAuthor?.toLowerCase() === '$currentuser' && author === undefined) ||
          (rawEditor?.toLowerCase() === '$currentuser' && editor === undefined)) {
        return '<p class="info">Please log in to see your contributions.</p>';
      }
      const maxResults = parseMaxParam(opts.max, 50);
      const format = String(opts.format || 'table').toLowerCase();

      // #643: date filter. `date` = whole-day match; otherwise
      // since (lower bound) / until (upper bound).
      // #774: `dateField` selects which field to filter (modified | created).
      // Pages all carry `created` since #754 (v3.33.0) — the previous
      // "dateField=created is N/A" comment is no longer true.
      const dateRe = /^\d{4}-\d{2}-\d{2}$/;
      const dateWhole = opts.date ? String(opts.date) : '';
      const dateFrom = dateWhole || (opts.since ? String(opts.since) : '');
      const dateTo   = dateWhole || (opts.until ? String(opts.until) : '');
      if ((dateFrom && !dateRe.test(dateFrom)) || (dateTo && !dateRe.test(dateTo))) {
        return '<p class="error">Invalid date parameter: use YYYY-MM-DD (since / until / date)</p>';
      }
      const dateFieldRaw = opts.dateField ? String(opts.dateField).toLowerCase() : 'modified';
      if (dateFieldRaw !== 'modified' && dateFieldRaw !== 'created') {
        return '<p class="error">Invalid dateField parameter: use `modified` or `created`</p>';
      }
      const dateField = dateFieldRaw;

      // Validate format parameter
      const validFormats = ['table', 'count', 'titles', 'list'];
      if (!validFormats.includes(format)) {
        return `<p class="error">Invalid format parameter: must be one of ${validFormats.join(', ')}</p>`;
      }

      // Build search options
      const searchOptions: SearchOptions = {
        query: query === '*' ? '' : query,  // Empty query for wildcard
        maxResults: maxResults
      };

      // Add category filter if specified
      if (systemCategory) {
        searchOptions.categories = parseMultiValue(systemCategory);
      }

      // Add keyword filter if specified. #901: `user-keywords='current'`
      // resolves (below, after all other filters are built) to whichever form
      // of THIS page's keyword — name or slug — matches more pages, so a
      // keyword-landing page self-scopes regardless of tagging convention.
      // Consistent with MediaPlugin's `keyword='current'`.
      const ukIsCurrent = typeof userKeywords === 'string' && userKeywords.trim().toLowerCase() === 'current';
      if (userKeywords && !ukIsCurrent) {
        searchOptions.userKeywords = parseMultiValue(userKeywords);
      }

      // Add author/editor filters if specified
      if (author) searchOptions.author = author;
      if (editor) searchOptions.editor = editor;

      // #643: add the date range if specified. #774: also propagate the
      // selected dateField (default 'modified' — pre-#774 callers see no
      // behavior change).
      if (dateFrom || dateTo) {
        searchOptions.dateRange = {};
        if (dateFrom) searchOptions.dateRange.from = dateFrom;
        if (dateTo) searchOptions.dateRange.to = dateTo;
        searchOptions.dateField = dateField;
      }

      // Execute search
      let results: SearchResult[];
      if (ukIsCurrent) {
        // #901: resolve 'current' to the page-keyword form (name or slug) with
        // more matches, reusing the shared helper. The lookup layers the
        // resolved keyword onto the other filters already in searchOptions, so
        // category/date/author still apply.
        const vm = context?.engine?.getManager?.('ValidationManager') as { generateSlug?: (t: string) => string } | undefined;
        const slugify = (n: string): string => vm?.generateSlug ? vm.generateSlug(n) : simpleSlug(n);
        const resolved = await resolveCurrentKeyword<SearchResult>(
          'current', context.pageName ?? '', slugify,
          (kw) => searchManager.advancedSearch({ ...searchOptions, userKeywords: [kw] })
        );
        results = resolved.results;
      } else if (systemCategory || userKeywords || author || editor || dateFrom || dateTo) {
        // Use advanced search for filtering
        results = await searchManager.advancedSearch(searchOptions);
      } else {
        // Use basic search if no filters
        if (query === '*') {
          // Get all pages for wildcard search
          results = await searchManager.advancedSearch(searchOptions);
        } else {
          results = await searchManager.search(query, { maxResults });
        }
      }

      // Apply pagination or max limit
      let limited: SearchResult[];
      let paginationHtml = '';
      const pageSize = parsePageSizeParam(opts.pageSize);
      if (pageSize > 0) {
        const rawPage = context.query?.['page'] ?? opts.page;
        const page = parsePageParam(rawPage);
        const paged = applyPagination(results, page, pageSize);
        limited = paged.items;
        paginationHtml = formatPaginationLinks(paged.currentPage, paged.totalPages, context.pageName);
      } else {
        limited = applyMax(results, maxResults);
      }

      // Format results based on format parameter
      // count format uses the full result set; paginated formats use the sliced set
      if (format === 'count') {
        return formatResults(results, { query, systemCategory, userKeywords, author, editor, maxResults, format });
      }
      return formatResults(limited, { query, systemCategory, userKeywords, author, editor, maxResults, format }) + paginationHtml;

    } catch (error) {
      const err = error as Error;
      return `<p class="error">Search failed: ${escapeHtml(err.message)}</p>`;
    }
  },

  /**
   * Plugin initialization (JSPWiki-style)
   * @param _engine - Wiki engine instance
   */
  initialize(_engine: unknown): void {
    // Plugin initialized
  }
};

export default SearchPlugin;
