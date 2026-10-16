/**
 * ReferringPagesPlugin - JSPWiki-style plugin for ngdpbase
 * Lists pages that link to the current (or specified) page.
 *
 * Syntax:
 *   [{ReferringPagesPlugin}]
 *   [{ReferringPagesPlugin page='OtherPage'}]
 *   [{ReferringPagesPlugin max='5'}]
 *   [{ReferringPagesPlugin format='count'}]
 *   [{ReferringPagesPlugin before='* ' after='\n'}]
 *
 * Parameters:
 *   page   - Target page name (default: current page)
 *   max    - Maximum number of results (default: 0 = unlimited)
 *   format - Output format: 'list' (default), 'count'
 *   show   - Legacy alias for format (JSPWiki: show='count')
 *   before - Text/markup before each item (list format only)
 *   after  - Text/markup after each item (list format only)
 */

import type { SimplePlugin, PluginContext, PluginParams } from './types.js';
import type { PageLink } from '../utils/pluginFormatters.js';

interface ReferringParams extends PluginParams {
  page?:   string;
  max?:    string | number;
  before?: string;
  after?:  string;
  format?: string;
  show?:   string; // legacy JSPWiki alias for format
}

type LinkGraph = Record<string, string[]>;

const ReferringPagesPlugin: SimplePlugin = {
  name: 'ReferringPagesPlugin',
  description: 'Lists pages that refer to the current page',
  author: 'ngdpbase',
  version: '1.0.0',

  execute(context: PluginContext, params: PluginParams = {}): string {
    const { parseMaxParam, applyMax, formatAsList, formatAsCount } = context.formatters;
    const opts = (params ?? {}) as ReferringParams;
    const pageName  = context?.pageName ?? '';
    const linkGraph = (context?.linkGraph ?? {}) as LinkGraph;

    const targetPage = String(opts.page || pageName);

    // Collect referring pages (copy so we can mutate safely)
    const referring: string[] = (linkGraph[targetPage] ?? []).slice();

    // Support both 'format' and the legacy 'show' parameter (JSPWiki compat)
    const format = String(opts.format ?? opts.show ?? 'list').toLowerCase();

    if (format === 'count') {
      return formatAsCount(referring.length);
    }

    // Domain-specific empty message (more helpful than the generic one)
    if (referring.length === 0) {
      return '<p><em>No pages currently refer to this page.</em></p>';
    }

    const limited = applyMax(referring, parseMaxParam(opts.max));

    const links: PageLink[] = limited.map(p => ({
      href:     `/view/${encodeURIComponent(p)}`,
      text:     p,
      cssClass: 'wikipage'
    }));

    return formatAsList(links, {
      before: opts.before ? String(opts.before) : '',
      after:  opts.after  ? String(opts.after)  : ''
    });
  },

  initialize(_engine: unknown): void {
    // No initialization required
  }
};

export default ReferringPagesPlugin;
