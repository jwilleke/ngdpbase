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
import { escapeHtml, formatAsList } from '../utils/pluginFormatters.js';
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
    // #1306: this hand-rolled its whole list for one remove button. The
    // vocabulary now carries a per-item action, so the list is the shared one
    // and only the button is this plugin's own markup.
    html += formatAsList(
      pinned.map((item) => ({
        href: escapeHtml(item.url),
        text: item.title,
        cssClass: 'nav-link flex-grow-1 py-1 ps-0',
        icon: 'fas fa-bookmark me-1 small text-muted',
        trailingHtml:
          '<button class="btn btn-link btn-sm p-0 ms-1 text-muted my-links-remove" '
          + 'title="Remove from My Links" '
          + `onclick="removePinnedItem('${escapeHtml(item.url).replace(/'/g, '&#39;')}'); return false;">`
          + '<i class="fas fa-times small"></i></button>'
      })),
      { listClass: 'nav flex-column', itemClass: 'nav-item' }
    );
    html += '  </div>\n';
    html += '</div>\n';

    return html;
  },

  initialize(_engine: unknown): void {
    // no-op
  }
};

export default MyLinksPlugin;
