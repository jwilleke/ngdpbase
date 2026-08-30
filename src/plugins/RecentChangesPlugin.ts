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
import { escapeHtml, formatDateTime, formatRelativeTime } from '../utils/pluginFormatters.js';

interface RecentChangesParams extends PluginParams {
  since?: string | number;
  format?: string;
}

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
 * Generate full format output
 */
function generateFullFormat(pages: RecentChange[], since: number): string {
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
  html += `<p class="text-muted text-center mt-2"><small>Total: ${pages.length} page${pages.length !== 1 ? 's' : ''} changed</small></p>\n`;
  html += '</div>\n';

  return html;
}

/**
 * Generate compact format output
 */
function generateCompactFormat(pages: RecentChange[], since: number): string {
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
  html += `<p class="text-muted text-end"><small>${pages.length} change${pages.length !== 1 ? 's' : ''}</small></p>\n`;
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

      const recentChanges = await pageManager.getRecentChanges({
        since: cutoffDate,
        principals
      });

      if (recentChanges.length === 0) {
        return `<p class="text-muted">No changes in the last ${since} day${since !== 1 ? 's' : ''}.</p>`;
      }

      if (format === 'full') {
        return generateFullFormat(recentChanges, since);
      } else {
        return generateCompactFormat(recentChanges, since);
      }

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
