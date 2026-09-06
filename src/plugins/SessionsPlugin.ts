/**
 * SessionsPlugin - JSPWiki-style sessions plugin
 *
 * Usage:
 *   [{INSERT SessionsPlugin property=users}]         — list of authenticated users + anonymous count
 *   [{INSERT SessionsPlugin property=count}]         — total session count (default)
 *   [{INSERT SessionsPlugin property=distinctUsers}] — number of distinct users/sessions
 *
 * Reads the session store in-process through SessionStatsManager (#1246). It
 * used to request this server's own /api/session-count URL through a bare
 * global fetch: an outbound call outside src/http/ that the egress policy
 * refuses (loopback), and a `0` whenever the configured host was not
 * reachable from inside the container.
 *
 * Based on JSPWiki SessionsPlugin:
 * https://jspwiki-wiki.apache.org/Wiki.jsp?page=SessionsPlugin
 */

import type { SimplePlugin, PluginContext, PluginParams } from './types.js';
import { escapeHtml, formatAsList, formatAsCount } from '../utils/pluginFormatters.js';
import type { SessionCount, SessionUsers } from '../managers/SessionStatsManager.js';

interface SessionStats {
  hasStore(): boolean;
  count(): Promise<SessionCount>;
  users(): Promise<SessionUsers>;
}

const SessionsPlugin: SimplePlugin = {
  name: 'SessionsPlugin',
  description: 'Shows active session count or list of authenticated users',
  author: 'ngdpbase',
  version: '3.0.0',

  async execute(context: PluginContext, params: PluginParams = {}): Promise<string> {
    const property = String(params.property || 'count').toLowerCase();
    try {
      const stats = context.engine?.getManager?.('SessionStatsManager') as SessionStats | null | undefined;
      if (!stats?.hasStore?.()) {
        return property === 'users' ? '<span class="sessions-plugin">0</span>' : '0';
      }

      // property=users — list authenticated users + anonymous count
      if (property === 'users') {
        const { users, anonymous } = await stats.users();

        if (users.length === 0 && anonymous === 0) {
          return '<span class="sessions-plugin text-muted">No active sessions</span>';
        }

        let html = '<div class="sessions-plugin">\n';

        if (users.length > 0) {
          const links = users.map(u => ({
            href: `/view/${encodeURIComponent(u)}`,
            text: u,
            cssClass: 'wikipage'
          }));
          html += formatAsList(links);
        }

        if (anonymous > 0) {
          html += `<ul><li class="text-muted">${escapeHtml(`Anonymous (${formatAsCount(anonymous)})`)}` +
                  '</li></ul>\n';
        }

        html += '</div>';
        return html;
      }

      // property=count / property=sessions / property=distinctusers — numeric
      const data = await stats.count();
      if (property === 'distinctusers') {
        return String(data.distinctUsers ?? data.sessionCount ?? 0);
      }
      return String(data.sessionCount ?? 0);
    } catch (e) {
      const error = e as Error;
      context.engine?.logger?.error?.(`SessionsPlugin error: ${error.message}`);
      return property === 'users' ? '<span class="sessions-plugin">0</span>' : '0';
    }
  }
};

export default SessionsPlugin;
