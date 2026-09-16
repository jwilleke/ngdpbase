import type { ActorContext } from '../context/ActorContext.js';
import BaseManager from './BaseManager.js';
import fs from 'fs/promises';
import path from 'path';
import LocaleUtils from '../utils/LocaleUtils.js';
import logger from '../utils/logger.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type PageManager from './PageManager.js';
import type RenderingManager from './RenderingManager.js';

/**
 * Export file metadata interface
 */
export interface ExportFileInfo {
  filename: string;
  path: string;
  size: number;
  created: Date;
  modified: Date;
}

/**
 * Export configuration interface
 */
export interface ExportConfig extends Record<string, unknown> {
  exportDirectory?: string;
}

/**
 * User preferences interface (for locale support)
 */
export interface UserPreferences {
  locale?: string;
}

/**
 * User object interface (for locale-aware formatting)
 */
export interface ExportUser {
  preferences?: UserPreferences;
}

/**
 * Page object interface (minimal fields needed for export)
 */
export interface PageForExport {
  content: string;
  lastModified?: string;
  'system-category'?: string;
  'user-keywords'?: string[];
  name?: string;
}

/**
 * ExportManager - Handles page exports to multiple formats
 *
 * Similar to JSPWiki's export functionality, provides page export capabilities
 * to HTML, PDF, markdown, and other formats.
 *
 * @class ExportManager
 * @extends BaseManager
 *
 * @property {string} exportDirectory - Directory for exported files
 *
 * @see {@link BaseManager} for base functionality
 *
 * @example
 * const exportManager = engine.getManager('ExportManager');
 * const html = await exportManager.exportPageToHtml('Main');
 */
class ExportManager extends BaseManager {
  private exportDirectory: string;

  /**
   * Creates a new ExportManager instance
   *
   * @constructor
   * @param {any} engine - The wiki engine instance
   */

  constructor(engine: WikiEngine) {
    super(engine);
    this.exportDirectory = './exports';
  }

  /**
   * Initialize the ExportManager
   *
   * @async
   * @param {ExportConfig} [config={}] - Configuration object
   * @param {string} [config.exportDirectory] - Export directory path
   * @returns {Promise<void>}
   */
  async initialize(config: ExportConfig = {}): Promise<void> {
    await super.initialize(config);

    this.exportDirectory = config.exportDirectory || './exports';

    const preflight = this.preflightConfiguredPath(
      'exportDirectory',
      this.exportDirectory
    );
    if (!preflight.ok) {
      this.exportDirectory = '';
      logger.info('ExportManager initialized (degraded — exports disabled)');
      return;
    }

    // Create exports directory
    await fs.mkdir(this.exportDirectory, { recursive: true });

    logger.info('ExportManager initialized');
  }

  /**
   * Export a single page to HTML
   * @param {string} pageName - Page name to export
   * @param {ExportUser|null} user - User object for locale-aware formatting
   * @returns {Promise<string>} HTML content
   */
  async exportPageToHtml(pageName: string, ctx: ActorContext, user: ExportUser | null = null): Promise<string> {
    const pageManager = this.engine.getManager<PageManager>('PageManager');
    const renderingManager = this.engine.getManager<RenderingManager>('RenderingManager');

    if (!pageManager || !renderingManager) {
      throw new Error('Required managers not available');
    }

    const page = (await pageManager.getPage(pageName, ctx)) as PageForExport | null;
    if (!page) {
      throw new Error(`Page '${pageName}' not found`);
    }

    // Render the page content (without user context for exports)
    const renderedContent = await renderingManager.renderMarkdown(page.content, pageName, null);

    // Create full HTML document
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${pageName} - ngdpbase Export</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem;
            line-height: 1.6;
        }
        h1, h2, h3, h4, h5, h6 {
            color: #333;
            margin-top: 2rem;
            margin-bottom: 1rem;
        }
        pre {
            background: #f8f9fa;
            padding: 1rem;
            border-radius: 4px;
            overflow-x: auto;
        }
        code {
            background: #f8f9fa;
            padding: 0.2rem 0.4rem;
            border-radius: 3px;
            font-size: 0.9em;
        }
        blockquote {
            border-left: 4px solid #ddd;
            padding-left: 1rem;
            margin-left: 0;
            color: #666;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 1rem 0;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 0.75rem;
            text-align: left;
        }
        th {
            background: #f8f9fa;
            font-weight: 600;
        }
        .export-meta {
            border-top: 1px solid #eee;
            margin-top: 3rem;
            padding-top: 1rem;
            color: #666;
            font-size: 0.9em;
        }
    </style>
</head>
<body>
    <h1>${pageName}</h1>
    ${renderedContent}

    <div class="export-meta">
        <p>Exported from ngdpbase on ${this.getFormattedTimestamp(user)}</p>
        <p>Last modified: ${page.lastModified || 'Unknown'}</p>
    ${page['system-category'] ? `<p>System Category: ${page['system-category']}</p>` : ''}
    ${page['user-keywords'] && page['user-keywords'].length > 0 ? `<p>User Keywords: ${page['user-keywords'].join(', ')}</p>` : ''}
    </div>
</body>
</html>`;

    return html;
  }

  /**
   * Export multiple pages to a single HTML file
   * @param {string[]} pageNames - Array of page names
   * @param {ExportUser|null} user - User object for locale-aware formatting
   * @returns {Promise<string>} Combined HTML content
   */
  async exportPagesToHtml(pageNames: string[], ctx: ActorContext, user: ExportUser | null = null): Promise<string> {
    const pageManager = this.engine.getManager<PageManager>('PageManager');
    const renderingManager = this.engine.getManager<RenderingManager>('RenderingManager');

    if (!pageManager || !renderingManager) {
      throw new Error('Required managers not available');
    }

    let combinedContent = '';
    const validPages: (PageForExport & { name: string })[] = [];

    for (const pageName of pageNames) {
      const page = (await pageManager.getPage(pageName, ctx)) as PageForExport | null;
      if (page) {
        const renderedContent = await renderingManager.renderMarkdown(page.content, pageName, null);
        combinedContent += `
          <div class="page-section" id="page-${pageName.replace(/[^a-zA-Z0-9]/g, '-')}">
            <h1>${pageName}</h1>
            ${renderedContent}
            <hr style="margin: 3rem 0; border: none; border-top: 1px solid #eee;">
          </div>
        `;
        validPages.push({ name: pageName, ...page });
      }
    }

    // Create table of contents
    const toc = validPages.map((page) => `<li><a href="#page-${page.name.replace(/[^a-zA-Z0-9]/g, '-')}">${page.name}</a></li>`).join('\n');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ngdpbase Export - ${validPages.length} Pages</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            max-width: 900px;
            margin: 0 auto;
            padding: 2rem;
            line-height: 1.6;
        }
        .toc {
            background: #f8f9fa;
            padding: 2rem;
            border-radius: 8px;
            margin-bottom: 3rem;
        }
        .toc h2 {
            margin-top: 0;
        }
        .toc ul {
            columns: 2;
            column-gap: 2rem;
        }
        .page-section {
            margin-bottom: 4rem;
        }
        h1, h2, h3, h4, h5, h6 {
            color: #333;
            margin-top: 2rem;
            margin-bottom: 1rem;
        }
        pre {
            background: #f8f9fa;
            padding: 1rem;
            border-radius: 4px;
            overflow-x: auto;
        }
        code {
            background: #f8f9fa;
            padding: 0.2rem 0.4rem;
            border-radius: 3px;
            font-size: 0.9em;
        }
        blockquote {
            border-left: 4px solid #ddd;
            padding-left: 1rem;
            margin-left: 0;
            color: #666;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 1rem 0;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 0.75rem;
            text-align: left;
        }
        th {
            background: #f8f9fa;
            font-weight: 600;
        }
        .export-meta {
            border-top: 1px solid #eee;
            margin-top: 3rem;
            padding-top: 1rem;
            color: #666;
            font-size: 0.9em;
        }
        @media print {
            .page-section {
                break-inside: avoid;
            }
        }
    </style>
</head>
<body>
    <div class="toc">
        <h2>Table of Contents</h2>
        <ul>
            ${toc}
        </ul>
        <p><strong>${validPages.length}</strong> pages exported on ${this.getFormattedTimestamp(user)}</p>
    </div>

    ${combinedContent}

    <div class="export-meta">
        <p>Exported from ngdpbase on ${this.getFormattedTimestamp(user)}</p>
        <p>Total pages: ${validPages.length}</p>
    </div>
</body>
</html>`;

    return html;
  }

  /**
   * Export page(s) to markdown
   * @param {string|string[]} pageNames - Single page name or array of page names
   * @param {ExportUser|null} user - User object for locale-aware formatting
   * @returns {Promise<string>} Markdown content
   */
  async exportToMarkdown(pageNames: string | string[], ctx: ActorContext, user: ExportUser | null = null): Promise<string> {
    const pageManager = this.engine.getManager<PageManager>('PageManager');
    if (!pageManager) {
      throw new Error('PageManager not available');
    }
    const names = Array.isArray(pageNames) ? pageNames : [pageNames];

    let markdown = '';

    if (names.length > 1) {
      markdown += '# ngdpbase Export\n\n';
      markdown += `*Exported on ${this.getFormattedTimestamp(user)}*\n\n`;
      markdown += '## Table of Contents\n\n';

      for (const pageName of names) {
        markdown += `- [${pageName}](#${pageName.toLowerCase().replace(/[^a-z0-9]/g, '-')})\n`;
      }
      markdown += '\n---\n\n';
    }

    for (const pageName of names) {
      const page = (await pageManager.getPage(pageName, ctx)) as PageForExport | null;
      if (page) {
        if (names.length > 1) {
          markdown += `# ${pageName}\n\n`;
        }
        markdown += page.content;
        if (names.length > 1) {
          markdown += '\n\n---\n\n';
        }
      }
    }

    return markdown;
  }

  /**
   * Save export to file
   * @param {string} content - Content to save
   * @param {string} filename - Filename
   * @param {string} format - File format
   * @returns {Promise<string>} File path
   */
  async saveExport(content: string, filename: string, format: string): Promise<string> {
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9\-_]/g, '-');
    const timestamp = new Date().toISOString().slice(0, 10);
    const fullFilename = `${sanitizedFilename}_${timestamp}.${format}`;
    const filePath = path.join(this.exportDirectory, fullFilename);

    await fs.writeFile(filePath, content, 'utf8');

    logger.info(`Exported to: ${fullFilename}`);
    return filePath;
  }

  /**
   * Get list of available exports
   * @returns {Promise<ExportFileInfo[]>} List of export files
   */
  async getExports(): Promise<ExportFileInfo[]> {
    try {
      const files = await fs.readdir(this.exportDirectory);
      const exports: ExportFileInfo[] = [];

      for (const file of files) {
        const filePath = path.join(this.exportDirectory, file);
        const stats = await fs.stat(filePath);

        exports.push({
          filename: file,
          path: filePath,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime
        });
      }

      return exports.sort((a, b) => b.created.getTime() - a.created.getTime());
    } catch (err) {
      logger.error('Error getting exports:', err);
      return [];
    }
  }

  /**
   * Delete an export file
   * @param {string} filename - Export filename
   * @returns {Promise<void>}
   */
  async deleteExport(filename: string): Promise<void> {
    const filePath = path.join(this.exportDirectory, filename);
    await fs.unlink(filePath);
    logger.info(`Deleted export: ${filename}`);
  }

  /**
   * Get formatted timestamp using user's locale
   * @param {ExportUser|null} user - User object (optional)
   * @returns {string} Formatted timestamp
   */
  getFormattedTimestamp(user: ExportUser | null = null): string {
    const date = new Date();

    if (user && user.preferences && user.preferences.locale) {
      return LocaleUtils.formatDate(date, user.preferences.locale) + ' ' + LocaleUtils.formatTime(date, user.preferences.locale);
    }

    // Fallback to system default
    return date.toLocaleString();
  }
}

export default ExportManager;

