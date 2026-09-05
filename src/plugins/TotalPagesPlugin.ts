/**
 * TotalPagesPlugin - JSPWiki-style total pages plugin
 * Returns the total number of pages in the wiki
 */

import type { SimplePlugin, PluginContext, PluginParams } from './types.js';
import { formatAsCount } from '../utils/pluginFormatters.js';

interface PageManager {
  getAllPages(): Promise<unknown[]>;
  listPagesFor(subject: unknown, action?: string): Promise<string[]>;
}

const TotalPagesPlugin: SimplePlugin = {
  name: 'TotalPagesPlugin',
  description: 'Shows the total number of pages',
  author: 'ngdpbase',
  version: '1.0.0',

  /**
   * Execute the plugin
   * @param context - Wiki context
   * @param params - Plugin parameters
   * @returns HTML output
   */
  async execute(context: PluginContext, _params: PluginParams): Promise<string> {
    const engine = context.engine;
    if (!engine) {
      return '0';
    }

    try {
      const pageManager = engine.getManager('PageManager') as PageManager | undefined;
      if (pageManager && pageManager.listPagesFor) {
        // #1219: the count of pages this viewer may read. A total that
        // includes pages the viewer cannot open still says they exist.
        const viewer = (context as { userContext?: unknown }).userContext ?? null;
        const pages = await pageManager.listPagesFor(viewer, 'view');
        return Array.isArray(pages) ? formatAsCount(pages.length) : '0';
      }
      return '0';
    } catch (err) {
      const logger = context.engine?.logger;
      if (logger?.error) {
        logger.error('TotalPagesPlugin error:', err);
      }
      return '0';
    }
  }
};

export default TotalPagesPlugin;
