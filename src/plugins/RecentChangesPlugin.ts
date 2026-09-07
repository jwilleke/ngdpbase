/**
 * RecentChangesPlugin - JSPWiki-style plugin for ngdpbase
 * Displays recent page changes in order
 *
 * Based on JSPWiki's RecentChangesPlugin:
 * https://github.com/apache/jspwiki/blob/master/jspwiki-main/src/main/java/org/apache/wiki/plugin/RecentChangesPlugin.java
 * https://jspwiki-wiki.apache.org/Wiki.jsp?page=RecentChangesPlugin
 *
 * Usage:
 *   [{RecentChangesPlugin}]                                - Shows all recent changes (default: 7 days, compact format)
 *   [{RecentChangesPlugin since='2'}]                      - Show changes from the last 2 days (compact format)
 *   [{RecentChangesPlugin since='7' format='full'}]        - Show changes from the last 7 days (full format)
 *   [{RecentChangesPlugin format='compact'}]               - Show changes (compact format)
 *
 * #635: data is sourced from `pageManager.getRecentChanges()`, which reads the
 * provider's in-memory pageIndex / pageCache. Private pages are filtered by the
 * provider based on the caller's principals so users only see edits they're
 * authorised to view. No direct disk reads from this plugin.
 */

import type { SimplePlugin, PluginContext, PluginParams } from './types.js';
import {
  escapeHtml,
  formatDateTime,
  formatRelativeTime,
  parsePageParam,
  parsePageSizeParam,
  applyPagination,
  formatPaginationLinks
} from '../utils/pluginFormatters.js';

interface RecentChangesParams extends PluginParams {
  since?: string | number;
  format?: string;
  /** Most rows to show. Applied at the manager, not after rendering. */
  limit?: string | number;
  /** Rows per page — offers the shared control instead of a flat cap. */
  pageSize?: string | number;
  /** Which page, when the caller is not navigating by query string. */
  page?: string | number;
}

/**
 * Rows shown when the caller does not say (#1305).
 *
 * The plugin rendered every change it was handed, and its `limit` parameter was
 * declared and never read — a page author asking for 20 got all of them and no
 * error. A default of "everything" is what made that a defect rather than an
 * inconsistency, so the bound is on by default.
 */
const DEFAULT_RECENT_CHANGES_LIMIT = 50;

interface RecentChange {
  title: string;
  uuid: string;
  lastModified: string;
  editor?: string;
  currentVersion?: number;
  hasVersions?: boolean;
}

interface PageManager {
  getRecentChanges(options?: {
    limit?: number;
    since?: Date | string;
    principals?: string[];
    includeAll?: boolean;
  }): Promise<RecentChange[]>;
}

/**
 * The count beneath the list (#1305).
 *
 * A capped list must not report its cap as a total. When the bound was applied
 * at the manager the whole set was never counted, so the line says what it
 * actually knows — "50 most recent changes" — rather than claiming the wiki
 * changed 50 times.
 */
function countLine(
  shown: number,
  total: number | null,
  noun: string,
  { prefix = '', suffix = '' }: { prefix?: string; suffix?: string } = {}
): string {
  if (total === null) {
    return `Showing the ${shown} most recent change${shown !== 1 ? 's' : ''}`;
  }
  const of = shown === total ? '' : ` (showing ${shown})`;
  return `${prefix}${total} ${noun}${total !== 1 ? 's' : ''}${suffix}${of}`;
}

/**
 * Generate full format output
 */
/**
 * @param total - Size of the whole change set, or null when the cap was applied
 *                at the manager and the true total was never counted.
 */
function generateFullFormat(pages: RecentChange[], since: number, total: number | null = pages.length): string {
  let html = '<div class="recent-changes-plugin recent-changes-full">\n';
  html += `<h4>Recent Changes (Last ${since} day${since !== 1 ? 's' : ''})</h4>\n`;
  html += '<div class="table-responsive">\n';
  html += '<table class="table table-hover">\n';
  html += '  <thead>\n';
  html += '    <tr>\n';
  html += '      <th style="width: 40%;">Page</th>\n';
  html += '      <th style="width: 25%;">Last Modified</th>\n';
  html += '      <th style="width: 20%;">Editor</th>\n';
  html += '      <th style="width: 15%;">Version</th>\n';
  html += '    </tr>\n';
  html += '  </thead>\n';
  html += '  <tbody>\n';

  for (const page of pages) {
    const editor = page.editor || 'Unknown';
    const version = page.currentVersion || 1;
    const formattedDateStr = formatDateTime(new Date(page.lastModified));

    html += '    <tr>\n';
    html += `      <td><a class="wikipage" href="/view/${encodeURIComponent(page.title)}">${escapeHtml(page.title)}</a></td>\n`;
    html += `      <td><span class="text-muted">${formattedDateStr}</span></td>\n`;
    html += `      <td><small>${escapeHtml(editor)}</small></td>\n`;
    html += `      <td><span class="badge bg-secondary">v${escapeHtml(String(version))}</span></td>\n`;
    html += '    </tr>\n';
  }

  html += '  </tbody>\n';
  html += '</table>\n';
  html += '</div>\n';
  html += `<p class="text-muted text-center mt-2"><small>${countLine(pages.length, total, 'page', { prefix: 'Total: ', suffix: ' changed' })}</small></p>\n`;
  html += '</div>\n';

  return html;
}

/**
 * Generate compact format output
 */
/** @param total - As `generateFullFormat`: null when the total is not known. */
function generateCompactFormat(pages: RecentChange[], since: number, total: number | null = pages.length): string {
  let html = '<div class="recent-changes-plugin recent-changes-compact">\n';
  html += `<h5>Recent Changes (Last ${since} day${since !== 1 ? 's' : ''})</h5>\n`;
  html += '<ul class="list-unstyled">\n';

  for (const page of pages) {
    const formattedDateStr = formatRelativeTime(new Date(page.lastModified));

    html += '  <li class="mb-1">\n';
    html += `    <a class="wikipage" href="/view/${encodeURIComponent(page.title)}">${escapeHtml(page.title)}</a> `;
    html += `<small class="text-muted">(${formattedDateStr})</small>\n`;
    html += '  </li>\n';
  }

  html += '</ul>\n';
  html += `<p class="text-muted text-end"><small>${countLine(pages.length, total, 'change')}</small></p>\n`;
  html += '</div>\n';

  return html;
}

const RecentChangesPlugin: SimplePlugin = {
  name: 'RecentChangesPlugin',
  description: 'Displays recent page changes in chronological order',
  author: 'ngdpbase',
  version: '2.0.0',

  async execute(context: PluginContext, params: PluginParams): Promise<string> {
    const opts = (params || {}) as RecentChangesParams;

    try {
      const pageManager = context?.engine?.getManager?.('PageManager') as PageManager | undefined;
      if (!pageManager || typeof pageManager.getRecentChanges !== 'function') {
        return '<p class="error">PageManager not available</p>';
      }

      const since = parseInt(String(opts.since || '7'), 10);
      const format = String(opts.format || 'compact').toLowerCase();

      if (isNaN(since) || since < 0) {
        return '<p class="error">Invalid "since" parameter: must be a positive number</p>';
      }

      // #1305: `limit` was declared on this interface and never read, so
      // [{RecentChanges limit='20'}] returned everything. Silently ignoring a
      // parameter is worse than refusing it, which is why a bad one is an error
      // rather than a fallback to the default.
      const pageSize = parsePageSizeParam(opts.pageSize);
      let limit = DEFAULT_RECENT_CHANGES_LIMIT;
      if (opts.limit !== undefined) {
        limit = parseInt(String(opts.limit), 10);
        if (isNaN(limit) || limit < 1) {
          return '<p class="error">Invalid "limit" parameter: must be a positive number</p>';
        }
      }

      if (format !== 'full' && format !== 'compact') {
        return '<p class="error">Invalid "format" parameter: must be "full" or "compact"</p>';
      }

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - since);
      cutoffDate.setHours(0, 0, 0, 0);

      // #635/#1116: principals are FACTS about the caller — the provider
      // derives the admin bypass from them. Anonymous (no userContext) →
      // empty principals → only public pages returned.
      const userContext = context.userContext as {
        username?: string;
        roles?: string[];
      } | undefined;
      const username = userContext?.username;
      const roles = userContext?.roles ?? [];
      const principals = [...roles, ...(username ? [username] : [])];

      // A page of rows is still a slice of what the manager returns, but the
      // flat cap is applied at the source: rendering 50 of 8,000 rows the
      // manager already built bounds the output, not the work.
      const recentChanges = await pageManager.getRecentChanges({
        since: cutoffDate,
        principals,
        ...(pageSize > 0 ? {} : { limit })
      });

      if (recentChanges.length === 0) {
        return `<p class="text-muted">No changes in the last ${since} day${since !== 1 ? 's' : ''}.</p>`;
      }

      let shown = recentChanges;
      let paginationHtml = '';
      if (pageSize > 0) {
        const paged = applyPagination(recentChanges, parsePageParam(context.query?.['page'] ?? opts.page), pageSize);
        shown = paged.items;
        paginationHtml = formatPaginationLinks(paged.currentPage, paged.totalPages, context.pageName);
      } else {
        // The manager honours `limit` where it implements it; slicing here is
        // what makes the bound true whether it does or not.
        shown = recentChanges.slice(0, limit);
      }

      // With pageSize the whole set is in hand, so the count can state it. With
      // the flat cap the total is known only when the result came in UNDER the
      // cap, which means the set was exhausted; at the cap the manager stopped
      // counting and claiming a total would be inventing one.
      const total = pageSize > 0 || shown.length < limit ? recentChanges.length : null;
      return (format === 'full'
        ? generateFullFormat(shown, since, total)
        : generateCompactFormat(shown, since, total)) + paginationHtml;

    } catch (error) {
      const err = error as Error;
      return `<p class="error">Error displaying recent changes: ${escapeHtml(err.message)}</p>`;
    }
  },

  initialize(_engine: unknown): void {
    // Plugin initialized
  }
};

export default RecentChangesPlugin;
