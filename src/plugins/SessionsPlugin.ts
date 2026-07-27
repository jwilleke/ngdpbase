/**
 * SessionsPlugin - JSPWiki-style sessions plugin
 *
 * Usage:
 *   [{INSERT SessionsPlugin property=users}]         — list of authenticated users + anonymous count
 *   [{INSERT SessionsPlugin property=count}]         — total session count (default)
 *   [{INSERT SessionsPlugin property=distinctUsers}] — number of distinct users/sessions
 *
 * Based on JSPWiki SessionsPlugin:
 * https://jspwiki-wiki.apache.org/Wiki.jsp?page=SessionsPlugin
 */

import type { SimplePlugin, PluginContext, PluginParams } from './types.js';
import { escapeHtml, formatAsList, formatAsCount } from '../utils/pluginFormatters.js';

interface ConfigManager {
  getProperty(key: string, defaultValue: string | number): string | number;
}

interface SessionCountData {
  sessionCount?: number;
  distinctUsers?: number;
}

interface SessionUsersData {
  users?: string[];
  anonymous?: number;
  total?: number;
}

interface FetchResponse {
  ok: boolean;
  json(): Promise<unknown>;
}

type FetchFunction = (url: string, init?: { method: string }) => Promise<FetchResponse>;

const SessionsPlugin: SimplePlugin = {
  name: 'SessionsPlugin',
  description: 'Shows active session count or list of authenticated users',
  author: 'ngdpbase',
  version: '2.0.0',

  async execute(context: PluginContext, params: PluginParams = {}): Promise<string> {
    try {
      let host = 'localhost';
      let port = 3000;

      try {
        const cfgMgr = (
          context.engine?.getManager?.('ConfigurationManager') ||
          context.engine?.getManager?.('ConfigManager')
        ) as ConfigManager | undefined;

        if (cfgMgr?.getProperty) {
          host = cfgMgr.getProperty('ngdpbase.server.host', host) as string;
          port = cfgMgr.getProperty('ngdpbase.server.port', port) as number;
        } else if (typeof context.engine?.getConfig === 'function') {
          const config = context.engine.getConfig() as { get?: (key: string, defaultValue: unknown) => unknown } | undefined;
          if (config?.get) {
            host = config.get('ngdpbase.server.host', host) as string;
            port = config.get('ngdpbase.server.port', port) as number;
          }
        }
      } catch {
        // use defaults
      }

      const baseUrl = `http://${host}:${port}`;
      const fetchFn: FetchFunction = fetch;
      const property = String(params.property || 'count').toLowerCase();

      // property=users — list authenticated users + anonymous count
      if (property === 'users') {
        const resp = await fetchFn(`${baseUrl}/api/session-users`, { method: 'GET' });
        if (!resp?.ok) return '<span class="sessions-plugin">0</span>';

        const data = await resp.json() as SessionUsersData;
        const users = data.users ?? [];
        const anonymous = data.anonymous ?? 0;

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
      const resp = await fetchFn(`${baseUrl}/api/session-count`, { method: 'GET' });
      if (!resp?.ok) return '0';

      let data: SessionCountData;
      try {
        data = await resp.json() as SessionCountData;
      } catch {
        data = { sessionCount: 0, distinctUsers: 0 };
      }

      if (property === 'distinctusers') {
        return String(data.distinctUsers ?? data.sessionCount ?? 0);
      }
      return String(data.sessionCount ?? 0);

    } catch (e) {
      const error = e as Error;
      if (error.message?.includes('Config instance is invalid')) return '0';
      context.engine?.logger?.error?.(`SessionsPlugin error: ${error.message}`);
      return '0';
    }
  }
};

export default SessionsPlugin;
