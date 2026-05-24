/**
 * MyLinksPlugin — renders the current user's pinned pages as a scrollable list.
 *
 * Usage (in LeftMenu or any page):
 *   [{MyLinks}]
 *
 * Returns empty string for anonymous/unauthenticated users so the section
 * disappears completely when there are no links to show.
 */

import type { SimplePlugin, PluginContext, PluginParams } from './types.js';
import { escapeHtml } from '../utils/pluginFormatters.js';
import { normalizePinnedItems } from '../utils/pinnedItems.js';

interface UserContext {
  username?: string;
  authenticated?: boolean;
  preferences?: Record<string, unknown>;
}

interface ExtendedPluginContext extends PluginContext {
  userContext?: UserContext;
  currentUser?: UserContext;
}

const MyLinksPlugin: SimplePlugin = {
  name: 'MyLinksPlugin',
  description: 'Renders the current user\'s pinned My Links sidebar section',
  author: 'ngdpbase',
  version: '1.0.0',

  execute(context: PluginContext, _params: PluginParams): string {
    const ctx = context as ExtendedPluginContext;
    const user = ctx.userContext ?? ctx.currentUser;

    if (!user?.authenticated || !user.username || user.username === 'anonymous') {
      return '';
    }

    const pinned = normalizePinnedItems(user.preferences?.['nav.pinnedPages']);
    if (pinned.length === 0) return '';

    let html = '<div class="my-links-plugin">\n';
    html += '  <div class="my-links-header d-flex align-items-center justify-content-between mb-1">\n';
    html += '    <span class="text-muted small text-uppercase fw-semibold">My Links</span>\n';
    html += '  </div>\n';
    html += '  <div class="my-links-scroll" style="max-height:200px;overflow-y:auto;">\n';
    html += '    <ul class="nav flex-column">\n';

    for (const item of pinned) {
      const href = escapeHtml(item.url);
      const label = escapeHtml(item.title);
      const ident = escapeHtml(item.url).replace(/'/g, '&#39;');
      html += '      <li class="nav-item d-flex align-items-center">\n';
      html += `        <a class="nav-link flex-grow-1 py-1 ps-0" href="${href}">\n`;
      html += `          <i class="fas fa-bookmark me-1 small text-muted"></i>${label}\n`;
      html += '        </a>\n';
      html += `        <button class="btn btn-link btn-sm p-0 ms-1 text-muted my-links-remove" title="Remove from My Links" onclick="removePinnedItem('${ident}'); return false;">\n`;
      html += '          <i class="fas fa-times small"></i>\n';
      html += '        </button>\n';
      html += '      </li>\n';
    }

    html += '    </ul>\n';
    html += '  </div>\n';
    html += '</div>\n';

    return html;
  },

  initialize(_engine: unknown): void {
    // no-op
  }
};

export default MyLinksPlugin;
