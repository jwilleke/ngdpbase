/**
 * IndexPlugin - JSPWiki-style plugin for ngdpbase
 * Generates an alphabetical index of all wiki pages
 *
 * Based on JSPWiki's IndexPlugin:
 * https://github.com/apache/jspwiki/blob/master/jspwiki-main/src/main/java/org/apache/wiki/plugin/IndexPlugin.java
 */

import type { SimplePlugin, PluginContext, PluginParams } from './types.js';
import { escapeHtml } from '../utils/pluginFormatters.js';

interface PageManager {
  getAllPages(): Promise<string[]>;
  listPagesFor(subject: unknown, action?: string): Promise<string[]>;
}

interface IndexParams extends PluginParams {
  include?: string;
  exclude?: string;
}

const IndexPlugin: SimplePlugin = {
  name: 'IndexPlugin',
  description: 'Generates an alphabetical index of all wiki pages',
  author: 'ngdpbase',
  version: '1.0.0',

  /**
   * Execute the plugin
   * @param context - Wiki context containing engine reference
   * @param params - Plugin parameters
   * @returns HTML output
   */
  async execute(context: PluginContext, params: PluginParams): Promise<string> {
    const opts = (params || {}) as IndexParams;

    try {
      // Get PageManager from engine
      const pageManager = context?.engine?.getManager?.('PageManager') as PageManager | undefined;
      if (!pageManager) {
        return '<p class="error">PageManager not available</p>';
      }

      // #1219: the pages this viewer may read — the plugin renders inside any
      // page its viewer can reach, so an unfiltered index here named private
      // pages to whoever loaded the page.
      const viewer = (context as { userContext?: unknown }).userContext ?? null;
      const allPageNames = await pageManager.listPagesFor(viewer, 'view');

      // Filter pages based on include/exclude patterns
      let filteredPages = allPageNames;

      // Apply include filter (regex)
      if (opts.include) {
        try {
          const includeRegex = new RegExp(String(opts.include));
          filteredPages = filteredPages.filter(name => includeRegex.test(name));
        } catch {
          return `<p class="error">Invalid include pattern: ${opts.include}</p>`;
        }
      }

      // Apply exclude filter (regex)
      if (opts.exclude) {
        try {
          const excludeRegex = new RegExp(String(opts.exclude));
          filteredPages = filteredPages.filter(name => !excludeRegex.test(name));
        } catch {
          return `<p class="error">Invalid exclude pattern: ${opts.exclude}</p>`;
        }
      }

      // Sort pages alphabetically (case-insensitive)
      filteredPages.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

      // Group pages by first letter
      // Note: '#' is used as the display label for non-letter pages but 'num' is used as the
      // safe ID key — Bootstrap's data-bs-target is a CSS selector, and '#' inside a selector
      // (e.g. "#collapse-uid-#") is invalid and causes Bootstrap collapse to silently fail.
      const NON_LETTER_KEY = 'num';
      const NON_LETTER_LABEL = '#';
      const groupedPages: Record<string, string[]> = {};
      for (const page of filteredPages) {
        const firstLetter = page.charAt(0).toUpperCase();
        const key = /[A-Z]/.test(firstLetter) ? firstLetter : NON_LETTER_KEY;

        if (!groupedPages[key]) {
          groupedPages[key] = [];
        }
        groupedPages[key].push(page);
      }

      const sections = Object.keys(groupedPages).sort((a, b) => {
        // 'num' sorts before A–Z to mirror '#' < 'A' in ASCII
        if (a === NON_LETTER_KEY) return -1;
        if (b === NON_LETTER_KEY) return 1;
        return a.localeCompare(b);
      });

      // Unique prefix so multiple [{IndexPlugin}] on one page don't collide
      const uid = Math.random().toString(36).slice(2, 8);

      // Jump-to nav
      let html = '<div class="index-plugin">\n';
      if (sections.length > 1) {
        html += '<div class="index-sections mb-2">\n';
        html += '<strong>Jump to:</strong> ';
        html += sections.map(key => {
          const label = key === NON_LETTER_KEY ? NON_LETTER_LABEL : key;
          return `<a href="#index-${uid}-${key}" ` +
            `onclick="var el=document.getElementById('collapse-${uid}-${key}');` +
            'if(el&&!el.classList.contains(\'show\')){bootstrap.Collapse.getOrCreateInstance(el).show();}"' +
            `>${label}</a>`;
        }).join(' | ');
        html += '\n</div>\n';
      }

      // Expand / Collapse all controls
      html +=
        '<div class="mb-3 d-flex gap-2 align-items-center">\n' +
        '  <button type="button" class="btn btn-sm btn-outline-secondary" ' +
        `onclick="document.querySelectorAll('.index-plugin-${uid} .collapse').forEach(` +
        'el=>bootstrap.Collapse.getOrCreateInstance(el).show())">' +
        'Expand all</button>\n' +
        '  <button type="button" class="btn btn-sm btn-outline-secondary" ' +
        `onclick="document.querySelectorAll('.index-plugin-${uid} .collapse').forEach(` +
        'el=>bootstrap.Collapse.getOrCreateInstance(el).hide())">' +
        'Collapse all</button>\n' +
        `  <span class="text-muted small">${filteredPages.length} page${filteredPages.length !== 1 ? 's' : ''}</span>\n` +
        '</div>\n';

      html = html.replace('class="index-plugin"', `class="index-plugin index-plugin-${uid}"`);

      // Collapsible letter sections
      for (const key of sections) {
        const label      = key === NON_LETTER_KEY ? NON_LETTER_LABEL : key;
        const collapseId = `collapse-${uid}-${key}`;
        const headingId  = `index-${uid}-${key}`;
        const count = groupedPages[key].length;
        html += `<div class="index-section mb-1" id="${headingId}">\n`;
        html +=
          '  <button class="btn btn-sm btn-outline-secondary w-100 text-start d-flex justify-content-between align-items-center" ' +
          `type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}" ` +
          `aria-expanded="false" aria-controls="${collapseId}">\n` +
          `    <strong>${label}</strong>\n` +
          `    <span class="text-muted small">${count} page${count !== 1 ? 's' : ''}</span>\n` +
          '  </button>\n';
        html += `  <div class="collapse" id="${collapseId}">\n`;
        html += '    <ul class="list-unstyled ps-3 pt-1 mb-1">\n';
        for (const page of groupedPages[key]) {
          html += `      <li><a class="wikipage" href="/view/${encodeURIComponent(page)}">${escapeHtml(page)}</a></li>\n`;
        }
        html += '    </ul>\n  </div>\n</div>\n';
      }

      html += '</div>';

      return html;

    } catch (error) {
      const err = error as Error;
      return `<p class="error">Error generating index: ${err.message}</p>`;
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

export default IndexPlugin;
