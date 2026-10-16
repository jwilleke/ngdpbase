/**
 * UndefinedPagesPlugin - JSPWiki-style plugin for ngdpbase
 *
 * Lists pages that are linked to (RED-LINKs) but do not exist in the wiki.
 * Each entry is rendered as a create link (/edit/PageName) styled like a red link.
 *
 * Syntax:
 *   [{UndefinedPagesPlugin}]
 *   [{UndefinedPagesPlugin max='25'}]
 *   [{UndefinedPagesPlugin format='count'}]
 *   [{UndefinedPagesPlugin format='table'}]
 *   [{UndefinedPagesPlugin include='pattern' exclude='pattern'}]
 *
 * Parameters:
 *   max           - Maximum number of results (default: 0 = unlimited)
 *   format        - Output format: 'list' (default), 'count', 'table'
 *   before        - Text/markup before each item (list format only)
 *   after         - Text/markup after each item (list format only)
 *   include       - Regex: only include pages matching this pattern
 *   exclude       - Regex: exclude pages matching this pattern
 *   showReferring - 'true' to expand referring pages (list: nested sub-list; table: links instead of count)
 *
 * JSPWiki reference:
 *   https://jspwiki-wiki.apache.org/Wiki.jsp?page=UndefinedPagesPlugin
 */

import type { SimplePlugin, PluginContext, PluginParams } from './types.js';
import type { PageLink, TableOptions } from '../utils/pluginFormatters.js';

interface UndefinedPagesParams extends PluginParams {
  max?:           string | number;
  format?:        string;
  before?:        string;
  after?:         string;
  include?:       string;
  exclude?:       string;
  showReferring?: string;
  sort?:          string;
  page?:          string | number;
  pageSize?:      string | number;
}

interface PageManager {
  getAllPages(): Promise<string[]>;
}

type LinkGraph = Record<string, string[]>;

const UndefinedPagesPlugin: SimplePlugin = {
  name: 'UndefinedPagesPlugin',
  description: 'Lists pages that are linked to (RED-LINKs) but do not exist',
  author: 'ngdpbase',
  version: '1.2.0',

  async execute(context: PluginContext, params: PluginParams): Promise<string> {
    const { parseMaxParam, applyMax, formatAsList, formatAsCount, formatAsTable, escapeHtml, parseSortParam, parsePageParam, parsePageSizeParam, applyPagination, formatPaginationLinks } = context.formatters;
    const opts = (params ?? {}) as UndefinedPagesParams;

    try {
      const pageManager = context.engine?.getManager?.('PageManager') as PageManager | undefined;
      if (!pageManager) {
        return '<p class="error">PageManager not available</p>';
      }

      // Build a lowercase set of all existing page names for fast membership test
      const allPages  = await pageManager.getAllPages();
      const pageSet   = new Set(allPages.map(p => p.toLowerCase()));

      // The link graph keys are every page title that is linked to;
      // those absent from the page set are "undefined" (red-link) pages.
      const linkGraph = (context.linkGraph ?? {}) as LinkGraph;
      let undefinedPages = Object.keys(linkGraph).filter(
        p => !pageSet.has(p.toLowerCase())
      );

      // Optional regex filters
      if (opts.include) {
        try {
          const re = new RegExp(String(opts.include));
          undefinedPages = undefinedPages.filter(p => re.test(p));
        } catch {
          return `<p class="error">Invalid include pattern: ${escapeHtml(String(opts.include))}</p>`;
        }
      }

      if (opts.exclude) {
        try {
          const re = new RegExp(String(opts.exclude));
          undefinedPages = undefinedPages.filter(p => !re.test(p));
        } catch {
          return `<p class="error">Invalid exclude pattern: ${escapeHtml(String(opts.exclude))}</p>`;
        }
      }

      // Sort: parse sort= param; default alphabetical ascending
      const sort = parseSortParam(
        opts.sort,
        ['name', 'count'],
        'name',
        'asc'
      );

      if (sort.key === 'count') {
        undefinedPages.sort((a, b) => {
          const diff = (linkGraph[a]?.length ?? 0) - (linkGraph[b]?.length ?? 0);
          return sort.order === 'asc' ? diff : -diff;
        });
      } else {
        // sort by name
        undefinedPages.sort((a, b) => {
          const cmp = a.toLowerCase().localeCompare(b.toLowerCase());
          return sort.order === 'asc' ? cmp : -cmp;
        });
      }

      const format        = String(opts.format ?? 'list').toLowerCase();
      const showReferring = String(opts.showReferring ?? 'false').toLowerCase() === 'true';

      // count: return total before applying max/pagination (matches JSPWiki behaviour)
      if (format === 'count') {
        return formatAsCount(undefinedPages.length);
      }

      // Pagination vs max
      const pageSize = parsePageSizeParam(opts.pageSize);
      let limited: string[];
      let paginationHtml = '';

      if (pageSize > 0) {
        // Use pageSize= pagination; page can come from query string or param
        const rawPage = context.query?.['page'] ?? opts.page;
        const page = parsePageParam(rawPage);
        const paged = applyPagination(undefinedPages, page, pageSize);
        limited = paged.items;
        paginationHtml = formatPaginationLinks(paged.currentPage, paged.totalPages, context.pageName);
      } else {
        // Apply max limit (existing behaviour)
        const max = parseMaxParam(opts.max);
        limited = applyMax(undefinedPages, max);
      }

      if (limited.length === 0) {
        return '<p><em>No undefined pages found.</em></p>';
      }

      // Build red-link style PageLink objects
      const links: PageLink[] = limited.map(page => ({
        href:     `/edit/${encodeURIComponent(page)}`,
        text:     page,
        cssClass: 'redlink',
        style:    'color: red;',
        title:    `Create page: ${page}`
      }));

      if (format === 'table') {
        // Column 0 = page name, column 1 = referrer count/links
        const sortColIndex = sort.key === 'count' ? 1 : 0;
        const tableOptions: TableOptions = {
          sortable: true,
          defaultSortColumn: sortColIndex,
          defaultSortOrder: sort.order
        };

        // When showReferring=true, column 1 holds HTML links rather than a plain
        // number.  Supply a cellDataSort callback so tableSort.js still sorts by
        // the underlying referrer count.
        if (showReferring) {
          tableOptions.cellDataSort = {
            1: (_row, rowIndex) => String((linkGraph[limited[rowIndex]] ?? []).length)
          };
        }

        const rows = links.map(link => {
          const referrers = linkGraph[link.text] ?? [];
          const anchor    = `<a class="${link.cssClass}" href="${link.href}" style="${link.style ?? ''}" title="${escapeHtml(link.title ?? '')}">${escapeHtml(link.text)}</a>`;
          if (showReferring && referrers.length > 0) {
            const referrerLinks = referrers
              .map(r => `<a class="wikipage" href="/view/${encodeURIComponent(r)}">${escapeHtml(r)}</a>`)
              .join(', ');
            return [anchor, referrerLinks];
          }
          return [anchor, String(referrers.length)];
        });

        const tableHtml = formatAsTable(['Undefined Page', 'Referenced By'], rows, tableOptions);
        return tableHtml + paginationHtml;
      }

      // Default: list format
      // showReferring adds a nested <ul> of referring pages beneath each item
      if (showReferring) {
        const items = limited.map(page => {
          const link      = links.find(l => l.text === page)!;
          const referrers = linkGraph[page] ?? [];
          const anchor    = `<a class="${link.cssClass}" href="${link.href}" style="${link.style ?? ''}" title="${escapeHtml(link.title ?? '')}">${escapeHtml(link.text)}</a>`;
          if (referrers.length === 0) return `<li>${anchor}</li>`;
          const subItems = referrers
            .map(r => `<li><a class="wikipage" href="/view/${encodeURIComponent(r)}">${escapeHtml(r)}</a></li>`)
            .join('\n');
          return `<li>${anchor}\n<ul class="referring-pages">\n${subItems}\n</ul>\n</li>`;
        }).join('\n');
        return `<ul>\n${items}\n</ul>${paginationHtml}`;
      }

      const listHtml = formatAsList(links, {
        before: opts.before ? String(opts.before) : '',
        after:  opts.after  ? String(opts.after)  : ''
      });
      return listHtml + paginationHtml;

    } catch (error) {
      const err = error as Error;
      return `<p class="error">UndefinedPagesPlugin error: ${escapeHtml(err.message)}</p>`;
    }
  },

  initialize(_engine: unknown): void {
    // No initialisation required
  }
};

export default UndefinedPagesPlugin;
