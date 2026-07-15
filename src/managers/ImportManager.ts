/**
 * Import Manager
 *
 * Manages the import of content from external wiki formats into ngdpbase.
 * Uses an extensible converter registry pattern to support multiple formats
 * (JSPWiki, MediaWiki, Confluence, etc.).
 *
 * @module ImportManager
 *
 * @example
 * const importManager = engine.getManager('ImportManager');
 *
 * // Register additional converters
 * importManager.registerConverter(new MediaWikiConverter());
 *
 * // Preview import
 * const preview = await importManager.previewImport({
 *   sourceDir: '/path/to/wiki',
 *   format: 'auto'
 * });
 *
 * // Execute import
 * const result = await importManager.importPages({
 *   sourceDir: '/path/to/wiki',
 *   format: 'jspwiki',
 *   dryRun: false
 * });
 */

import path from 'path';
import fs from 'fs-extra';
import { v4 as uuidv4 } from 'uuid';
import BaseManager, { BackupData } from './BaseManager.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import { IContentConverter, ConversionResult } from '../converters/IContentConverter.js';
import { normalizeToNcm, ncmToConversionResult, DEFAULT_TABLE_CLASSES } from '../converters/ncm/index.js';
import { notifyNcmConversion } from '../utils/ncmNotify.js';
import { writeRunSummary, type ImportRunSummary } from '../utils/importRunSummary.js';
import JSPWikiConverter from '../converters/JSPWikiConverter.js';
import HtmlConverter from '../converters/HtmlConverter.js';
import MarkdownConverter from '../converters/MarkdownConverter.js';
import type ConfigurationManager from './ConfigurationManager.js';
import type ValidationManager from './ValidationManager.js';
import type PageManager from './PageManager.js';
import type AttachmentManager from './AttachmentManager.js';
import logger from '../utils/logger.js';

/**
 * Options for import operations
 */
export interface ImportOptions {
  /** Source directory containing files to import */
  sourceDir: string;

  /** Target directory for converted files (default: data/pages) */
  targetDir?: string;

  /** Format ID or 'auto' for auto-detection */
  format?: string;

  /** Keep original files after conversion (default: true) */
  preserveOriginals?: boolean;

  /** Preview only, don't write files (default: false) */
  dryRun?: boolean;

  /** Generate UUIDs for pages that don't have them (default: true) */
  generateUUIDs?: boolean;

  /** File extensions to process (default: determined by format) */
  fileExtensions?: string[];

  /** Maximum files to process (for large imports) */
  limit?: number;

  /** Skip first N files (for resuming imports) */
  offset?: number;

  /** Progress callback for streaming updates */
  onProgress?: (event: ImportProgressEvent) => void;

  /**
   * Categorises this run for the per-run summary (#738). Examples:
   * `'paste'`, `'url'`, `'file'`, `'jspwiki'`, `'ingest:<sourceId>'`.
   * Defaults to `'import'` when caller doesn't specify.
   */
  importType?: string;

  /**
   * Principal that initiated this run (#738 + #631 forward-compat).
   * For request-bound manual imports, the admin's `req.userContext.username`.
   * For scheduled #685 ingestion (when it lands), the system principal's
   * username per #631. Defaults to `'unknown'` when not supplied.
   */
  actor?: string;

  /**
   * True when `actor` is the #631 canonical system principal. Default false.
   * Reserved for non-request code paths (#685 ingestion, background jobs).
   */
  actorIsSystem?: boolean;
}

/**
 * Progress event for streaming import updates
 */
export interface ImportProgressEvent {
  /** Event type */
  type: 'start' | 'progress' | 'complete' | 'error';
  /** Source file path */
  file?: string;
  /** Current file index (0-based) */
  index?: number;
  /** Total files to process */
  total?: number;
  /** Status of the file import */
  status?: 'success' | 'skipped' | 'failed';
  /** Error message if failed */
  error?: string;
  /** Final result (for complete event) */
  result?: unknown;
}

/**
 * Error information for failed imports
 */
export interface ImportError {
  /** Source file path */
  file: string;

  /** Error message */
  message: string;

  /** Error stack trace (optional) */
  stack?: string;
}

/**
 * Information about an imported file
 */
export interface ImportedFile {
  /** Original source file path */
  sourcePath: string;

  /** Target file path */
  targetPath: string;

  /** Format detected/used */
  format: string;

  /** File size in bytes */
  size: number;

  /** Extracted metadata */
  metadata: Record<string, unknown>;

  /** Conversion warnings */
  warnings: string[];

  /** Whether file was actually written (false for dry runs or duplicates) */
  written: boolean;

  /** Reason the file was skipped (e.g. 'duplicate') */
  skippedReason?: string;

  /** UUID of existing page if duplicate */
  existingPageUuid?: string;

  /** Attachment import stats (JSPWiki imports only) */
  attachments?: { imported: number; skipped: number; errors: string[] };
}

/**
 * Result of an import operation
 */
export interface ImportResult {
  /** Overall success status */
  success: boolean;

  /** Number of files converted */
  converted: number;

  /** Number of files skipped */
  skipped: number;

  /** Number of files with errors */
  failed: number;

  /** Total files processed */
  total: number;

  /** Error details */
  errors: ImportError[];

  /** Information about imported files */
  files: ImportedFile[];

  /** Import duration in milliseconds */
  durationMs: number;
}

/**
 * Import Manager class
 *
 * Manages content import with extensible format support via converter registry.
 */
class ImportManager extends BaseManager {
  /** Registry of format converters */
  private converterRegistry: Map<string, IContentConverter>;

  constructor(engine: WikiEngine) {
    super(engine);
    this.converterRegistry = new Map();
  }

  /**
   * Initialize the manager
   */
  async initialize(config: Record<string, unknown> = {}): Promise<void> {
    await super.initialize(config);

    // Register built-in converters
    this.registerConverter(new JSPWikiConverter());
    this.registerConverter(new HtmlConverter());
    this.registerConverter(new MarkdownConverter());

    logger.info('[ImportManager] Initialized with converters:', this.getAvailableFormats());
  }

  /**
   * Register a content converter
   *
   * @param converter - Converter instance implementing IContentConverter
   */
  registerConverter(converter: IContentConverter): void {
    if (this.converterRegistry.has(converter.formatId)) {
      logger.warn(`[ImportManager] Overwriting existing converter: ${converter.formatId}`);
    }
    this.converterRegistry.set(converter.formatId, converter);
  }

  /**
   * Get available format IDs
   *
   * @returns Array of registered format identifiers
   */
  getAvailableFormats(): string[] {
    return Array.from(this.converterRegistry.keys());
  }

  /**
   * Get converter by format ID
   *
   * @param formatId - Format identifier
   * @returns Converter instance or undefined
   */
  getConverter(formatId: string): IContentConverter | undefined {
    return this.converterRegistry.get(formatId);
  }

  /**
   * Get all registered converters with their metadata
   *
   * @returns Array of converter info objects
   */
  getConverterInfo(): Array<{ formatId: string; formatName: string; fileExtensions: string[] }> {
    return Array.from(this.converterRegistry.values()).map(converter => ({
      formatId: converter.formatId,
      formatName: converter.formatName,
      fileExtensions: converter.fileExtensions
    }));
  }

  /**
   * Auto-detect format from file content
   *
   * @param content - File content
   * @param filename - Filename (for extension matching)
   * @returns Format ID or null if no match
   */
  detectFormat(content: string, filename: string): string | null {
    for (const [formatId, converter] of this.converterRegistry.entries()) {
      if (converter.canHandle(content, filename)) {
        return formatId;
      }
    }
    return null;
  }

  /**
   * Preview import without writing files
   *
   * @param options - Import options (dryRun is forced to true)
   * @returns Import result with preview data
   */
  async previewImport(options: ImportOptions): Promise<ImportResult> {
    return this.importPages({ ...options, dryRun: true });
  }

  /**
   * Import pages with streaming progress updates
   * Alias for importPages that makes the progress callback more explicit
   *
   * @param options - Import options with onProgress callback
   * @returns Import result with statistics and file details
   */
  async importPagesWithProgress(options: ImportOptions): Promise<ImportResult> {
    return this.importPages(options);
  }

  /**
   * Import pages from source directory
   *
   * @param options - Import options
   * @returns Import result with statistics and file details
   */
  async importPages(options: ImportOptions): Promise<ImportResult> {
    const startTime = Date.now();
    const startedAtIso = new Date(startTime).toISOString();
    const result: ImportResult = {
      success: true,
      converted: 0,
      skipped: 0,
      failed: 0,
      total: 0,
      errors: [],
      files: [],
      durationMs: 0
    };
    // #738: aggregate ConversionWarning.kind counts across all files in this run
    // so the per-run summary can drive the trend view + metric emit.
    const runKindCounts: Record<string, number> = {};

    // Validate source path exists
    if (!await fs.pathExists(options.sourceDir)) {
      result.success = false;
      result.errors.push({
        file: options.sourceDir,
        message: 'Source path does not exist (paths are resolved on the server, not your browser\'s machine)'
      });
      result.durationMs = Date.now() - startTime;
      return result;
    }

    // Get target directory (default to data/pages)
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const defaultPagesDir = configManager?.getProperty('ngdpbase.page.provider.filesystem.storagedir', './data/pages') as string ?? './data/pages';
    const targetDir = options.targetDir ?? path.resolve(defaultPagesDir);

    // Determine file extensions to process
    const fileExtensions = this.getFileExtensions(options);

    // Support both single file and directory imports
    const sourceStat = await fs.stat(options.sourceDir);
    let files: string[];

    if (sourceStat.isFile()) {
      // Single file import — use it directly
      files = [options.sourceDir];
    } else if (sourceStat.isDirectory()) {
      // Directory import — find matching files
      files = await this.findFiles(options.sourceDir, fileExtensions);
    } else {
      result.success = false;
      result.errors.push({
        file: options.sourceDir,
        message: 'Source path is neither a file nor a directory'
      });
      result.durationMs = Date.now() - startTime;
      return result;
    }
    result.total = files.length;

    // Apply limit and offset
    const offset = options.offset ?? 0;
    const limit = options.limit ?? files.length;
    const filesToProcess = files.slice(offset, offset + limit);

    logger.info(`[ImportManager] Processing ${filesToProcess.length} of ${files.length} files`);

    // Send start event if progress callback provided
    if (options.onProgress) {
      options.onProgress({
        type: 'start',
        total: filesToProcess.length
      });
    }

    // Process each file
    for (let i = 0; i < filesToProcess.length; i++) {
      const filePath = filesToProcess[i];
      try {
        const imported = await this.importSinglePage(filePath, {
          ...options,
          targetDir
        });

        if (imported) {
          result.files.push(imported);
          // #738: re-derive the kind from the flattened `${kind}: ${detail}` strings
          // emitted by importSinglePage. (Keeping the flatten boundary as-is for
          // back-compat with existing ImportedFile consumers.)
          for (const w of imported.warnings ?? []) {
            const sep = w.indexOf(': ');
            const kind = sep > 0 ? w.slice(0, sep) : w;
            if (kind) runKindCounts[kind] = (runKindCounts[kind] ?? 0) + 1;
          }
          if (imported.skippedReason) {
            result.skipped++;
            // Send progress event for skipped file
            if (options.onProgress) {
              options.onProgress({
                type: 'progress',
                file: filePath,
                index: i,
                total: filesToProcess.length,
                status: 'skipped'
              });
            }
          } else {
            result.converted++;
            // Send progress event for successful import
            if (options.onProgress) {
              options.onProgress({
                type: 'progress',
                file: filePath,
                index: i,
                total: filesToProcess.length,
                status: 'success'
              });
            }
          }
        } else {
          result.skipped++;
          // Send progress event for skipped file
          if (options.onProgress) {
            options.onProgress({
              type: 'progress',
              file: filePath,
              index: i,
              total: filesToProcess.length,
              status: 'skipped'
            });
          }
        }
      } catch (error) {
        result.failed++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        result.errors.push({
          file: filePath,
          message: errorMessage,
          stack: error instanceof Error ? error.stack : undefined
        });
        // Send progress event for failed file
        if (options.onProgress) {
          options.onProgress({
            type: 'progress',
            file: filePath,
            index: i,
            total: filesToProcess.length,
            status: 'failed',
            error: errorMessage
          });
        }
      }
    }

    // Set success based on error rate
    result.success = result.failed === 0 || (result.failed / result.total < 0.1);
    result.durationMs = Date.now() - startTime;

    // Refresh page index so imported pages are immediately visible
    if (!options.dryRun && result.converted > 0) {
      try {
        const pageManager = this.engine.getManager<PageManager>('PageManager');
        await pageManager?.refreshPageList();
        logger.info(`[ImportManager] Page index refreshed after importing ${result.converted} pages`);
      } catch (refreshErr) {
        logger.warn('[ImportManager] Failed to refresh page index after import:', refreshErr);
      }
    }

    logger.info('[ImportManager] Import complete:', {
      converted: result.converted,
      skipped: result.skipped,
      failed: result.failed,
      durationMs: result.durationMs
    });

    // #738: emit per-kind metrics + persist per-run summary so the operator
    // can answer "is this failure systemic and worth fixing?" Best-effort —
    // observability failures must not bubble back into the import result.
    if (!options.dryRun) {
      try {
        type MetricsRecorder = { recordImportConversion?: (a: { kind: string; outcome: 'warning' | 'error' }) => void };
        const metricsManager = this.engine.getManager<MetricsRecorder>('MetricsManager');
        for (const [kind, count] of Object.entries(runKindCounts)) {
          for (let i = 0; i < count; i++) {
            // outcome is always 'warning' today — ConversionWarning is the only
            // structured emit. Hard errors land in result.errors[] (unstructured).
            // The outcome label reserves room for an error-kind enum without a
            // breaking metric change later (#738 design notes).
            metricsManager?.recordImportConversion?.({ kind, outcome: 'warning' });
          }
        }
      } catch (metricErr) {
        logger.warn('[ImportManager] Failed to record import conversion metrics:', metricErr);
      }

      try {
        const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
        const runsDir = configManager?.getResolvedDataPath?.('ngdpbase.import.runs-dir', './data/import-runs')
          ?? path.resolve('./data/import-runs');
        const finishedAtIso = new Date().toISOString();
        const summary: ImportRunSummary = {
          runId: startedAtIso.replace(/:/g, '-').replace(/\.\d+Z$/, 'Z'),
          startedAt: startedAtIso,
          finishedAt: finishedAtIso,
          importType: options.importType ?? 'import',
          actor: options.actor ?? 'unknown',
          isSystem: options.actorIsSystem === true,
          total: result.total,
          converted: result.converted,
          skipped: result.skipped,
          failed: result.failed,
          kindCounts: runKindCounts
        };
        await writeRunSummary(runsDir, summary);
      } catch (persistErr) {
        logger.warn('[ImportManager] Failed to persist import run summary:', persistErr);
      }
    }

    return result;
  }

  /**
   * Import a single page
   *
   * @param filePath - Source file path
   * @param options - Import options
   * @returns Imported file info or null if skipped
   */
  async importSinglePage(
    filePath: string,
    options: ImportOptions
  ): Promise<ImportedFile | null> {
    // Read source file
    const content = await fs.readFile(filePath, 'utf-8');
    const filename = path.basename(filePath);

    // Detect or use specified format
    let formatId: string | undefined = options.format;
    if (!formatId || formatId === 'auto') {
      const detected = this.detectFormat(content, filename);
      if (!detected) {
        // No converter can handle this file
        return null;
      }
      formatId = detected;
    }

    const converter = this.converterRegistry.get(formatId);
    if (!converter) {
      throw new Error(`Unknown format: ${formatId}`);
    }

    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');

    // Convert content. #728: HTML/JSPWiki/Markdown imports route through the
    // NCM normalizer (NCM extends the registry — it delegates to these same
    // converters internally, then applies §2.4 links, the §2.1 table
    // up-convert, and stamps ncmVersion), bridged back to ConversionResult.
    // Any other format (e.g. test mocks) keeps the direct converter path.
    // Table style classes are operator-configurable (§2.1, NCM v2).
    const tableClasses = configManager?.getProperty(
      'ngdpbase.markdown.ncm.table.default-classes',
      DEFAULT_TABLE_CLASSES
    ) as string[] ?? DEFAULT_TABLE_CLASSES;
    const conversionResult: ConversionResult =
      (formatId === 'html' || formatId === 'jspwiki' || formatId === 'markdown')
        ? ncmToConversionResult(normalizeToNcm(content, formatId, { tableClasses }))
        : converter.convert(content);

    // The NCM markdown path does not stamp provenance the way MarkdownConverter
    // does; preserve `importedFrom: markdown` for parity with the JSPWiki/HTML
    // converters (which set it internally).
    if (formatId === 'markdown' && !conversionResult.metadata['importedFrom']) {
      conversionResult.metadata['importedFrom'] = 'markdown';
    }

    // Register any extracted user-keywords (e.g., from JSPWiki %%category%% blocks) to config
    const extractedKeywords = conversionResult.metadata['user-keywords'] as string[] | undefined;
    if (extractedKeywords && extractedKeywords.length > 0) {
      await this.registerUserKeywordsToConfig(extractedKeywords);
    }

    // Determine UUID for filename
    const baseName = path.basename(filename, path.extname(filename));
    let pageUuid: string | undefined;
    if (options.generateUUIDs !== false) {
      pageUuid = (conversionResult.metadata['uuid'] as string) || uuidv4();
    }

    // Use UUID as filename when available, otherwise fall back to baseName
    const targetFilename = pageUuid ? `${pageUuid}.md` : `${baseName}.md`;
    const targetPath = path.join(options.targetDir ?? './data/pages', targetFilename);

    // Store the original page name as title if not already set
    // JSPWiki encodes page names: + for space, %XX for special chars
    if (!conversionResult.metadata['title']) {
      try {
        conversionResult.metadata['title'] = decodeURIComponent(baseName.replace(/\+/g, ' '));
      } catch {
        // Fall back to simple + replacement if decodeURIComponent fails
        conversionResult.metadata['title'] = baseName.replace(/\+/g, ' ');
      }
    }

    // Check for duplicate page by title (metadata only - no content needed)
    const pageTitle = conversionResult.metadata['title'] as string;
    try {
      const pageManager = this.engine.getManager<PageManager>('PageManager');
      const existingMetadata = await pageManager?.getPageMetadata(pageTitle);
      if (existingMetadata) {
        const existingUuid = existingMetadata.uuid || '';
        logger.info(`[ImportManager] Duplicate detected: "${pageTitle}" already exists as ${existingUuid}`);
        return {
          sourcePath: filePath,
          targetPath,
          format: formatId,
          size: 0,
          metadata: conversionResult.metadata,
          warnings: [`Page "${pageTitle}" already exists (${existingUuid})`],
          written: false,
          skippedReason: 'duplicate',
          existingPageUuid: existingUuid
        };
      }
    } catch {
      // PageManager lookup failed — proceed with import
    }

    // Build frontmatter if we have metadata
    let finalContent = conversionResult.content;
    if (Object.keys(conversionResult.metadata).length > 0 || options.generateUUIDs !== false) {
      finalContent = this.buildFrontmatter(conversionResult, pageUuid) + '\n\n' + conversionResult.content;
    }

    // Write file (unless dry run)
    const written = !options.dryRun;
    if (written) {
      await fs.ensureDir(path.dirname(targetPath));
      await fs.writeFile(targetPath, finalContent, 'utf-8');
    }

    // Import attachments for JSPWiki pages
    let attachments: { imported: number; skipped: number; errors: string[] } | undefined;
    if (formatId === 'jspwiki') {
      const pageTitle = conversionResult.metadata['title'] as string;
      try {
        attachments = await this.importPageAttachments(filePath, pageTitle, options);
        if (attachments.errors.length > 0) {
          conversionResult.warnings.push({
            kind: 'import-attachment',
            detail: `Attachment errors: ${attachments.errors.join('; ')}`
          });
        }
        if (attachments.imported > 0) {
          logger.info(`[ImportManager] Imported ${attachments.imported} attachment(s) for "${pageTitle}"`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        conversionResult.warnings.push({ kind: 'import-attachment', detail: `Failed to import attachments: ${msg}` });
      }
    }

    // #728 S3: ConversionResult.warnings is structured; ImportResult.warnings
    // stays string[] (its public surface, rendered by admin-import.ejs) —
    // flatten at this boundary.
    const flatWarnings = conversionResult.warnings.map(w => `${w.kind}: ${w.detail}`);

    // #728 S5d: non-preview NCM-routed imports (html/jspwiki) push a
    // conversion-warning summary to /admin/notifications.
    if (written && (formatId === 'html' || formatId === 'jspwiki') && flatWarnings.length > 0) {
      notifyNcmConversion(this.engine, `Import ${formatId}`, pageTitle, flatWarnings);
    }

    return {
      sourcePath: filePath,
      targetPath,
      format: formatId,
      size: Buffer.byteLength(finalContent, 'utf-8'),
      metadata: conversionResult.metadata,
      warnings: flatWarnings,
      written,
      attachments
    };
  }

  /**
   * Import a page from a URL
   *
   * Fetches the URL, converts HTML to Markdown using the html converter,
   * and writes the page file with schema.org metadata in frontmatter.
   *
   * @param url - URL to fetch and import
   * @param options - Optional overrides (title, dryRun)
   * @returns Imported file info
   */
  async importFromUrl(
    url: string,
    options: { title?: string; dryRun?: boolean } = {}
  ): Promise<ImportedFile> {
    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }

    if (!parsedUrl.protocol.startsWith('http')) {
      throw new Error('Only HTTP and HTTPS URLs are supported');
    }

    // Fetch the page
    logger.info(`[ImportManager] Fetching URL: ${url}`);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ngdpbase/1.0 (URL Import)',
        'Accept': 'text/html,application/xhtml+xml'
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch URL: HTTP ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      throw new Error(`URL did not return HTML content (got ${contentType})`);
    }

    const html = await response.text();

    // Get the HTML converter
    const converter = this.converterRegistry.get('html');
    if (!converter) {
      throw new Error('HTML converter not registered');
    }

    // Convert HTML to Markdown
    const conversionResult = converter.convert(html);

    // Override title if provided
    if (options.title) {
      conversionResult.metadata['title'] = options.title;
    }

    // Ensure title exists
    if (!conversionResult.metadata['title']) {
      // Derive from URL path
      const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
      conversionResult.metadata['title'] = pathSegments.length > 0
        ? decodeURIComponent(pathSegments[pathSegments.length - 1]).replace(/[-_]/g, ' ')
        : parsedUrl.hostname;
    }

    // Add URL import metadata
    conversionResult.metadata['sourceUrl'] = url;
    conversionResult.metadata['importedAt'] = new Date().toISOString();

    // Set system-category
    if (!conversionResult.metadata['system-category']) {
      conversionResult.metadata['system-category'] = 'general';
    }

    // Generate UUID
    const pageUuid = uuidv4();

    // Check for duplicate page by title (metadata only - no content needed)
    const pageTitle = conversionResult.metadata['title'] as string;
    try {
      const pageManager = this.engine.getManager<PageManager>('PageManager');
      const existingMetadata = await pageManager?.getPageMetadata(pageTitle);
      if (existingMetadata) {
        const existingUuid = existingMetadata.uuid || '';
        return {
          sourcePath: url,
          targetPath: '',
          format: 'html',
          size: 0,
          metadata: conversionResult.metadata,
          warnings: [`Page "${pageTitle}" already exists (${existingUuid})`],
          written: false,
          skippedReason: 'duplicate',
          existingPageUuid: existingUuid
        };
      }
    } catch {
      // PageManager lookup failed — proceed with import
    }

    // Build frontmatter and content with source citation
    const importDate = (conversionResult.metadata['importedAt'] as string).split('T')[0];
    const sourceCitation = `\n\n----\n* [#1] - [${pageTitle}|${url}|target='_blank'] - based on information obtained ${importDate}\n`;
    const finalContent = this.buildUrlFrontmatter(conversionResult, pageUuid)
      + '\n\n' + conversionResult.content + sourceCitation;

    // Determine target path
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const defaultPagesDir = configManager?.getProperty('ngdpbase.page.provider.filesystem.storagedir', './data/pages') as string ?? './data/pages';
    const targetPath = path.join(path.resolve(defaultPagesDir), `${pageUuid}.md`);

    // Write file (unless dry run)
    const written = !options.dryRun;
    if (written) {
      await fs.ensureDir(path.dirname(targetPath));
      await fs.writeFile(targetPath, finalContent, 'utf-8');

      // Refresh page index
      try {
        const pageManager = this.engine.getManager<PageManager>('PageManager');
        await pageManager?.refreshPageList();
        logger.info('[ImportManager] Page index refreshed after URL import');
      } catch (refreshErr) {
        logger.warn('[ImportManager] Failed to refresh page index after URL import:', refreshErr);
      }
    }

    logger.info(`[ImportManager] URL import ${options.dryRun ? 'preview' : 'complete'}: "${pageTitle}" from ${url}`);

    return {
      sourcePath: url,
      targetPath,
      format: 'html',
      size: Buffer.byteLength(finalContent, 'utf-8'),
      metadata: conversionResult.metadata,
      // #728 S3: flatten structured ConversionResult.warnings → ImportResult string[].
      warnings: conversionResult.warnings.map(w => `${w.kind}: ${w.detail}`),
      written
    };
  }

  /**
   * Build YAML frontmatter for URL imports with schema.org namespace
   */
  private buildUrlFrontmatter(
    result: ConversionResult,
    pageUuid: string
  ): string {
    const lines = ['---'];

    // Title
    if (result.metadata['title']) {
      lines.push(`title: ${this.yamlValue(result.metadata['title'] as string)}`);
    }

    // UUID
    lines.push(`uuid: ${pageUuid}`);

    // Source URL
    if (result.metadata['sourceUrl']) {
      lines.push(`sourceUrl: "${result.metadata['sourceUrl'] as string}"`);
    }

    // Import timestamp
    if (result.metadata['importedAt']) {
      lines.push(`importedAt: "${result.metadata['importedAt'] as string}"`);
    }

    // System category
    lines.push(`system-category: ${(result.metadata['system-category'] as string) || 'general'}`);

    // Schema.org metadata (nested under schema key)
    const schema = result.metadata['schema'] as Record<string, unknown> | undefined;
    if (schema && Object.keys(schema).length > 0) {
      lines.push('schema:');
      for (const [key, value] of Object.entries(schema)) {
        if (value === undefined || value === null || value === '') continue;
        if (Array.isArray(value)) {
          lines.push(`  ${key}:`);
          for (const item of value) {
            lines.push(`    - ${this.yamlValue(String(item))}`);
          }
        } else {
          const strValue = typeof value === 'string' ? value : JSON.stringify(value);
          lines.push(`  ${key}: ${this.yamlValue(strValue)}`);
        }
      }
    }

    lines.push('---');
    return lines.join('\n');
  }

  /**
   * Quote a YAML string value if needed
   */
  private yamlValue(value: string): string {
    if (
      value.includes(':') ||
      value.includes('#') ||
      value.includes("'") ||
      value.includes('"') ||
      value.includes('\n') ||
      value.startsWith(' ') ||
      value.startsWith('[') ||
      value.startsWith('{') ||
      // Quote numeric-only strings to prevent YAML parsing as numbers
      /^-?\d+(\.\d+)?$/.test(value)
    ) {
      return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }
    return value;
  }

  /**
   * Import attachments from a JSPWiki `-att/` directory alongside a page file.
   *
   * @param sourceFilePath - Path to the source `.txt` page file
   * @param pageName - Decoded page name (used to link attachments)
   * @param options - Import options (dryRun support)
   * @returns Stats about imported attachments
   */
  private async importPageAttachments(
    sourceFilePath: string,
    pageName: string,
    options: ImportOptions
  ): Promise<{ imported: number; skipped: number; errors: string[] }> {
    const stats = { imported: 0, skipped: 0, errors: [] as string[] };

    // Derive the -att/ directory from the source file path
    const ext = path.extname(sourceFilePath);
    const attDir = sourceFilePath.replace(ext, '-att');

    if (!await fs.pathExists(attDir)) {
      return stats;
    }

    const attDirStat = await fs.stat(attDir);
    if (!attDirStat.isDirectory()) {
      return stats;
    }

    // Each subdirectory is `filename.ext-dir/` containing versioned files
    const entries = await fs.readdir(attDir, { withFileTypes: true });
    const subdirs = entries.filter(e => e.isDirectory() && e.name.endsWith('-dir'));

    const attachmentManager = this.engine.getManager<AttachmentManager>('AttachmentManager');

    for (const subdir of subdirs) {
      const originalFilename = subdir.name.replace(/-dir$/, '');
      const versionDir = path.join(attDir, subdir.name);

      try {
        // Find the latest version file (highest numbered prefix)
        const versionFiles = await fs.readdir(versionDir);
        const versionedFiles = versionFiles
          .filter((f: string) => f !== 'attachment.properties' && !f.startsWith('.'))
          .sort((a: string, b: string) => {
            // Extract numeric prefix: "3.jpg" → 3
            const numA = parseInt(a.split('.')[0], 10) || 0;
            const numB = parseInt(b.split('.')[0], 10) || 0;
            return numB - numA; // Descending — highest version first
          });

        if (versionedFiles.length === 0) {
          stats.errors.push(`No version files found for ${originalFilename}`);
          continue;
        }

        const latestFile = versionedFiles[0];
        const latestFilePath = path.join(versionDir, latestFile);

        // Read author from attachment.properties if available
        let author = 'import';
        const propsPath = path.join(versionDir, 'attachment.properties');
        if (await fs.pathExists(propsPath)) {
          try {
            const propsContent = await fs.readFile(propsPath, 'utf-8');
            const authorMatch = propsContent.match(/author\s*=\s*(.+)/i);
            if (authorMatch) {
              author = authorMatch[1].trim();
            }
          } catch {
            // Ignore properties read errors
          }
        }

        if (options.dryRun) {
          stats.imported++;
          logger.info(`[ImportManager] (dry-run) Would import attachment: ${originalFilename} for page "${pageName}"`);
          continue;
        }

        // Read file and upload
        const fileBuffer = await fs.readFile(latestFilePath);
        const mimeType = this.getMimeType(originalFilename);

        const fileInfo = {
          originalName: originalFilename,
          mimeType,
          size: fileBuffer.length
        };

        const uploadOptions = {
          pageName,
          description: originalFilename,
          context: {
            username: author,
            name: author,
            isAuthenticated: true,
            roles: ['admin']
          }
        };

        await attachmentManager?.uploadAttachment(fileBuffer, fileInfo, uploadOptions);
        stats.imported++;
        logger.info(`[ImportManager] Imported attachment: ${originalFilename} for page "${pageName}"`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        stats.errors.push(`${originalFilename}: ${message}`);
        logger.warn(`[ImportManager] Failed to import attachment ${originalFilename}:`, err);
      }
    }

    return stats;
  }

  /**
   * Get MIME type from file extension
   */
  private getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.ico': 'image/x-icon',
      '.tiff': 'image/tiff',
      '.tif': 'image/tiff',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.csv': 'text/csv',
      '.html': 'text/html',
      '.htm': 'text/html',
      '.xml': 'text/xml',
      '.json': 'application/json',
      '.zip': 'application/zip',
      '.gz': 'application/gzip',
      '.tar': 'application/x-tar',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.mp4': 'video/mp4',
      '.avi': 'video/x-msvideo'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Get file extensions to process based on options
   */
  private getFileExtensions(options: ImportOptions): string[] {
    if (options.fileExtensions && options.fileExtensions.length > 0) {
      return options.fileExtensions;
    }

    if (options.format && options.format !== 'auto') {
      const converter = this.converterRegistry.get(options.format);
      if (converter) {
        return converter.fileExtensions;
      }
    }

    // Default: collect all extensions from all converters
    const extensions = new Set<string>();
    for (const converter of this.converterRegistry.values()) {
      converter.fileExtensions.forEach(ext => extensions.add(ext));
    }
    return Array.from(extensions);
  }

  /**
   * Find all files with matching extensions in directory
   */
  private async findFiles(dir: string, extensions: string[]): Promise<string[]> {
    const files: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Recursively search subdirectories
        const subFiles = await this.findFiles(fullPath, extensions);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        // Check if file matches any extension
        const ext = path.extname(entry.name).toLowerCase();
        if (extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }

    return files;
  }

  /**
   * Build YAML frontmatter from conversion result
   */
  private buildFrontmatter(
    result: ConversionResult,
    pageUuid?: string
  ): string {
    const frontmatter: Record<string, unknown> = {};

    // Normalize keyword fields to arrays before any processing.
    // JSPWiki pages (and some URL imports) store these as space-separated scalar
    // strings (e.g. `user-keywords: foo bar baz`). Normalizing here ensures
    // the written frontmatter is always a proper YAML list.
    const toKeywordArray = (val: unknown): string[] => {
      if (Array.isArray(val)) return (val as unknown[]).map(String).filter(Boolean);
      if (typeof val === 'string' && val.trim()) return val.trim().split(/[\s,]+/).filter(Boolean);
      return [];
    };
    result.metadata['user-keywords'] = toKeywordArray(result.metadata['user-keywords']);
    result.metadata['system-keywords'] = toKeywordArray(result.metadata['system-keywords']);

    const title = ((result.metadata['title'] as string) || 'Untitled').trim();
    const uuid = pageUuid || (result.metadata['uuid'] as string) || '';

    // Use ValidationManager to generate complete metadata with defaults
    const validationManager = this.engine.getManager<ValidationManager>('ValidationManager');
    if (validationManager && typeof validationManager.generateValidMetadata === 'function') {
      const opts: Record<string, unknown> = { uuid };
      if (result.metadata['system-category']) {
        opts['system-category'] = result.metadata['system-category'];
      }
      if (result.metadata['user-keywords']) {
        opts['user-keywords'] = result.metadata['user-keywords'];
      }
      const validMeta = validationManager.generateValidMetadata(title, opts);
      frontmatter['title'] = validMeta.title;
      frontmatter['uuid'] = validMeta.uuid;
      frontmatter['slug'] = validMeta.slug;
      frontmatter['system-category'] = validMeta['system-category'];
      frontmatter['user-keywords'] = validMeta['user-keywords'];
      frontmatter['lastModified'] = validMeta.lastModified;
    } else {
      // Fallback when ValidationManager is not available
      frontmatter['title'] = title;
      if (uuid) {
        frontmatter['uuid'] = uuid;
      }
      frontmatter['slug'] = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      frontmatter['system-category'] = (result.metadata['system-category'] as string) || 'general';
      frontmatter['user-keywords'] = (result.metadata['user-keywords'] as string[]) || [];
      frontmatter['lastModified'] = new Date().toISOString();
    }

    // Emit system-keywords as a proper array (already normalized above)
    const systemKeywords = result.metadata['system-keywords'] as string[];
    if (systemKeywords.length > 0) {
      frontmatter['system-keywords'] = systemKeywords;
    }

    // Add other metadata from conversion (aliases, etc.) excluding already-handled keys
    const handledKeys = new Set(['title', 'uuid', 'slug', 'system-category', 'user-keywords', 'system-keywords', 'lastModified', 'jspwiki']);
    for (const [key, value] of Object.entries(result.metadata)) {
      if (!handledKeys.has(key)) {
        frontmatter[key] = value;
      }
    }

    // Add import metadata
    frontmatter['importedFrom'] = (result.metadata['importedFrom'] as string) || 'unknown';
    frontmatter['importedAt'] = new Date().toISOString();

    // Build YAML
    const lines = ['---'];
    for (const [key, value] of Object.entries(frontmatter)) {
      if (typeof value === 'string') {
        // Quote strings that might cause YAML issues
        if (value.includes(':') || value.includes('#') || value.includes("'")) {
          lines.push(`${key}: "${value.replace(/"/g, '\\"')}"`);
        } else {
          lines.push(`${key}: ${value}`);
        }
      } else if (Array.isArray(value)) {
        lines.push(`${key}:`);
        for (const item of value) {
          lines.push(`  - ${item}`);
        }
      } else {
        lines.push(`${key}: ${JSON.stringify(value)}`);
      }
    }
    lines.push('---');

    return lines.join('\n');
  }

  /**
   * Register new user-keywords to the custom configuration
   *
   * When importing JSPWiki pages with %%category%% blocks, this method
   * adds extracted categories to the config so they appear in the
   * user-keywords picker when editing pages.
   *
   * @param keywords - Array of keyword names to register
   * @returns Number of new keywords added
   */
  private async registerUserKeywordsToConfig(keywords: string[]): Promise<number> {
    if (!keywords || keywords.length === 0) {
      return 0;
    }

    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) {
      logger.warn('[ImportManager] ConfigurationManager not available, cannot register user-keywords');
      return 0;
    }

    // Get existing user-keywords from config
    const existingKeywords = (configManager.getProperty('ngdpbase.user-keywords') || {}) as Record<
      string,
      Record<string, unknown>
    >;

    let addedCount = 0;
    const updatedKeywords = { ...existingKeywords };

    for (const keyword of keywords) {
      const normalizedKeyword = keyword.toLowerCase().trim();
      if (!normalizedKeyword) continue;

      // Skip if keyword already exists
      if (updatedKeywords[normalizedKeyword]) {
        continue;
      }

      // Add new keyword with default structure
      updatedKeywords[normalizedKeyword] = {
        label: normalizedKeyword,
        description: `Imported from JSPWiki category: ${keyword}`,
        category: 'imported',
        enabled: true,
        restrictEditing: false
      };
      addedCount++;
      logger.info(`[ImportManager] Registered new user-keyword: ${normalizedKeyword}`);
    }

    if (addedCount > 0) {
      await configManager.setProperty('ngdpbase.user-keywords', updatedKeywords);
      logger.info(`[ImportManager] Added ${addedCount} new user-keywords to config`);
    }

    return addedCount;
  }

  /**
   * Backup manager data (no persistent data to backup)
   */
  async backup(): Promise<BackupData> {
    return {
      managerName: 'ImportManager',
      timestamp: new Date().toISOString(),
      data: {
        registeredFormats: this.getAvailableFormats()
      }
    };
  }

  /**
   * Restore manager data (no persistent data to restore)
   */
  async restore(backupData: BackupData): Promise<void> {
    await super.restore(backupData);
    // ImportManager doesn't have persistent state to restore
  }

  /**
   * Shutdown the manager
   */
  async shutdown(): Promise<void> {
    this.converterRegistry.clear();
    await super.shutdown();
  }
}

export default ImportManager;

