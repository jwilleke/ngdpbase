import type { ActorContext } from '../context/ActorContext.js';
import BaseManager from './BaseManager.js';
import fs from 'fs/promises';
import path from 'path';
import LocaleUtils from '../utils/LocaleUtils.js';
import logger from '../utils/logger.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type PageManager from './PageManager.js';
import type RenderingManager from './RenderingManager.js';
import type ConfigurationManager from './ConfigurationManager.js';
import { actorOf } from '../context/ActorContext.js';
import {
  PdfUnavailableError,
  normalizePdfInChild,
  renderPdfInChild,
  resolveChromium,
  resolvePdfOptions,
  type PdfJob,
  type PdfJobResult,
  type PdfOptions,
  type ChromiumResolution
} from '../export/pdfEngine.js';
import { NonePdfProvider, PDF_PROVIDERS, type PdfProvider, type PdfRendered } from '../export/PdfProvider.js';
import { LocalChromePdfProvider } from '../export/LocalChromePdfProvider.js';
import { ChromeServicePdfProvider } from '../export/ChromeServicePdfProvider.js';
import { resolveEgressPolicy } from '../http/egressPolicy.js';
import type { Transport } from '../http/guardedFetch.js';

export { PdfUnavailableError };
export type { PdfOptions, PdfMargin, PdfPageSize } from '../export/pdfEngine.js';

/**
 * The needs-attention reason while PDF export has no engine (#1974). Set only
 * when something asked for a PDF and could not have one; cleared by the next
 * render that works.
 */
export const PDF_UNAVAILABLE_REASON =
  'PDF export unavailable: choose a PDF provider (local-chrome or chrome-service) in ngdpbase.export.pdf.provider, or fix the one chosen (the server log says why)';

/** Shipped defaults of the `ngdpbase.export.pdf.*` keys. */
const PDF_DEFAULTS = { provider: 'none', pageSize: 'Letter', timeoutMs: 30_000, maxConcurrent: 2, serviceMaxBytes: 52_428_800 };

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
 * to HTML and markdown, the one CSV writer, and HTML → PDF (`htmlToPdf`, #1974)
 * through an optional headless Chromium.
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
/** A text cell starting with one of these runs as a spreadsheet formula. */
const CSV_FORMULA_START = /^[=+\-@\t\r]/;

class ExportManager extends BaseManager {
  private exportDirectory: string;

  /** What the providers call out to; replaced in tests. A site never sets these. */
  protected pdfRenderer: (job: PdfJob) => Promise<PdfJobResult> = renderPdfInChild;
  protected chromiumResolver: (configuredPath: string) => Promise<ChromiumResolution> = (p) => resolveChromium(p);
  protected pdfServiceTransport: Transport | undefined = undefined;
  protected pdfNormalizer: (pdf: Uint8Array, timeoutMs: number) => Promise<Uint8Array> = normalizePdfInChild;

  /** Renders running now, and renders waiting for a slot (`ngdpbase.export.pdf.max-concurrent`). */
  private pdfActive = 0;
  private pdfWaiting: Array<() => void> = [];

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
   * One field of the one CSV writer for every export (RFC 4180): quoted when
   * it holds a comma, quote or line break.
   *
   * A cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return is
   * run as a formula by Excel, LibreOffice and Google Sheets ("CSV injection",
   * OWASP), so a text cell starting with one gets a leading `'`. Numbers are
   * written as numbers: a negative amount stays `-12550`.
   *
   * @param value - The cell value
   * @returns The field, ready to join with commas
   */
  csvCell(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') return String(value);
    let text = typeof value === 'string' ? value : JSON.stringify(value);
    if (CSV_FORMULA_START.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  /**
   * A header row and data rows as one CSV document, each line ending CRLF.
   * Every CSV export (the audit log, add-ons) goes through here.
   *
   * @param headers - The header row
   * @param rows - The data rows
   * @returns The CSV document
   */
  toCsv(headers: readonly string[], rows: readonly (readonly unknown[])[]): string {
    return [headers, ...rows].map((row) => row.map((cell) => this.csvCell(cell)).join(',')).join('\r\n') + '\r\n';
  }

  /**
   * A rendered HTML document (print CSS and all) as PDF bytes (#1974).
   *
   * - __A provider renders it:__ `ngdpbase.export.pdf.provider` — `none`
   *   (default), `local-chrome` (a Chromium on this machine) or
   *   `chrome-service` (a Chromium service by URL, e.g. Gotenberg); see
   *   `src/export/PdfProvider.ts`. Read on every render, so a change applies
   *   without a restart.
   * - __Sandboxed:__ `local-chrome` runs Chromium with JavaScript off and every
   *   request refused except `data:` URIs, so images, stylesheets and fonts
   *   must be inlined. A `chrome-service` is reached through the egress policy,
   *   and what its Chromium may load is the service's own setting.
   * - __Deterministic:__ the same HTML on the same core version, provider and
   *   engine version gives the same bytes (no dates, no random ID), so an
   *   add-on can store the document's SHA-256.
   * - __Off the request path:__ a local render, and the metadata pass on a
   *   service's PDF, each run in a child process; everything is bounded by
   *   `ngdpbase.export.pdf.timeout-ms`, and at most
   *   `ngdpbase.export.pdf.max-concurrent` run at once while the rest wait.
   * - __Optional:__ with no engine (provider `none`, or the chosen one cannot
   *   be used) it throws `PdfUnavailableError` (`code: 'PDF_UNAVAILABLE'`),
   *   logs why, and this manager shows "needs attention" on the admin
   *   dashboard until a render works. A site that never asks for a PDF is
   *   never flagged.
   *
   * Records no audit event: it reads nothing and changes nothing. The caller
   * that issues the document records that, with its own event.
   *
   * @param ctx - Who is asking; named in the log line
   * @param html - A complete HTML document
   * @param options - Page size, margins, printBackground; an `@page` rule in the HTML wins
   * @returns The PDF
   */
  async htmlToPdf(ctx: ActorContext, html: string, options?: PdfOptions): Promise<Buffer> {
    if (!ctx) throw new TypeError('htmlToPdf: a context is required (security-posture P1)');
    if (typeof html !== 'string' || html.length === 0) throw new TypeError('htmlToPdf: html must be a non-empty string');
    const config = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const setting = <T>(key: string, fallback: T): T => (config?.getProperty(key, fallback) as T | undefined) ?? fallback;
    const resolved = resolvePdfOptions(options, String(setting('ngdpbase.export.pdf.page-size', PDF_DEFAULTS.pageSize)));
    const timeoutMs = positiveInt(setting('ngdpbase.export.pdf.timeout-ms', PDF_DEFAULTS.timeoutMs), PDF_DEFAULTS.timeoutMs);
    const maxConcurrent = positiveInt(setting('ngdpbase.export.pdf.max-concurrent', PDF_DEFAULTS.maxConcurrent), PDF_DEFAULTS.maxConcurrent);

    const provider = this.pdfProvider(setting);

    const started = Date.now();
    await this.acquirePdfSlot(maxConcurrent);
    let rendered: PdfRendered;
    try {
      rendered = await provider.render({ html, options: resolved, timeoutMs });
    } catch (err) {
      if (err instanceof PdfUnavailableError) this.pdfUnavailable(err.message);
      throw err;
    } finally {
      this.releasePdfSlot();
    }
    this.markReadyIfDegradedBy(PDF_UNAVAILABLE_REASON);
    const pdf = Buffer.from(rendered.pdf);
    logger.info(`[ExportManager] PDF rendered bytes=${pdf.length} ms=${Date.now() - started} engine=${rendered.engine} by=${actorOf(ctx).user}`);
    return pdf;
  }

  /**
   * The provider `ngdpbase.export.pdf.provider` names, built for this render
   * from the current settings. A name that is not a provider is unavailable,
   * with the reason, as `none` is.
   */
  private pdfProvider(setting: <T>(key: string, fallback: T) => T): PdfProvider {
    const name = String(setting('ngdpbase.export.pdf.provider', PDF_DEFAULTS.provider));
    switch (name) {
    case 'none':
      return new NonePdfProvider();
    case 'local-chrome':
      return new LocalChromePdfProvider(String(setting('ngdpbase.export.pdf.provider.local-chrome.chromium-path', '')), {
        render: (job) => this.pdfRenderer(job),
        resolve: (p) => this.chromiumResolver(p)
      });
    case 'chrome-service': {
      const config = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
      const egress = resolveEgressPolicy((key, fallback) => config?.getProperty(key, fallback));
      return new ChromeServicePdfProvider(
        {
          url: String(setting('ngdpbase.export.pdf.provider.chrome-service.url', '')),
          policy: egress.policy,
          maxBytes: positiveInt(setting('ngdpbase.export.pdf.provider.chrome-service.max-bytes', PDF_DEFAULTS.serviceMaxBytes), PDF_DEFAULTS.serviceMaxBytes)
        },
        { ...(this.pdfServiceTransport ? { transport: this.pdfServiceTransport } : {}), normalize: (pdf, ms) => this.pdfNormalizer(pdf, ms) }
      );
    }
    default:
      return new NonePdfProvider(`ngdpbase.export.pdf.provider '${name}' is not a PDF provider: use ${PDF_PROVIDERS.join(', ')}`);
    }
  }

  /**
   * Is a PDF provider chosen (#2120)? The Export action offers PDF only then.
   * Whether the chosen one works is known only by rendering, as before.
   */
  isPdfConfigured(): boolean {
    const name = this.engine.getManager<ConfigurationManager>('ConfigurationManager')?.getProperty('ngdpbase.export.pdf.provider', PDF_DEFAULTS.provider);
    return (name ?? PDF_DEFAULTS.provider) !== 'none';
  }

  /** Log why, flag the manager (unless something worse is already shown), and refuse. */
  private pdfUnavailable(reason: string): never {
    logger.warn(`[ExportManager] PDF export unavailable: ${reason}`);
    const status = this.getManagerStatus();
    if (status.state === 'ready' || status.reason === PDF_UNAVAILABLE_REASON) {
      this.markNeedsAttention(PDF_UNAVAILABLE_REASON, 'ngdpbase.export.pdf.provider');
    }
    throw new PdfUnavailableError(`PDF export unavailable: ${reason}`);
  }

  private async acquirePdfSlot(limit: number): Promise<void> {
    if (this.pdfActive < limit) {
      this.pdfActive++;
      return;
    }
    // The slot is handed over by releasePdfSlot, so pdfActive stays as it is.
    await new Promise<void>((resolve) => this.pdfWaiting.push(resolve));
  }

  private releasePdfSlot(): void {
    const next = this.pdfWaiting.shift();
    if (next) next();
    else this.pdfActive--;
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

    // #1687: exports are files people generate — runtime data, so they live in
    // the instance data folder, never in the checkout (root-owned in the image).
    this.exportDirectory = config.exportDirectory
      || this.engine.getManager<ConfigurationManager>('ConfigurationManager')?.getResolvedDataPath('ngdpbase.directories.exports', '${FAST_STORAGE}/exports')
      || './exports';

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

    const pdfProviderName = this.engine.getManager<ConfigurationManager>('ConfigurationManager')?.getProperty('ngdpbase.export.pdf.provider', PDF_DEFAULTS.provider) as string | undefined;
    logger.info(`ExportManager initialized (PDF provider: ${pdfProviderName ?? PDF_DEFAULTS.provider})`);
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

    return this.renderPageDocument(pageName, page, user);
  }

  /**
   * One page as a complete HTML document: its content rendered, with the
   * export's styling and metadata footer. It reads nothing: the caller has
   * read the page through its door (the page export source, #2120).
   *
   * @param pageName - The page's name, its heading
   * @param page - Its content and metadata
   * @param user - User object for locale-aware formatting
   * @returns The HTML document
   */
  async renderPageDocument(pageName: string, page: PageForExport, user: ExportUser | null = null): Promise<string> {
    const renderingManager = this.engine.getManager<RenderingManager>('RenderingManager');
    if (!renderingManager) {
      throw new Error('Required managers not available');
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
    // Only a plain file name inside the export folder: never a path that
    // reaches another folder.
    if (!filename || filename !== path.basename(filename) || filename === '.' || filename === '..') {
      throw new Error(`Not an export file name: ${filename}`);
    }
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

/** A positive whole number from config, or the shipped default. */
function positiveInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export default ExportManager;

