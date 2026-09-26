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
import { actorOf, isJobContext, type ActorContext } from '../context/ActorContext.js';
import fs from 'fs-extra';
import yaml from 'js-yaml';
import { v4 as uuidv4 } from 'uuid';
import BaseManager, { BackupData } from './BaseManager.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import { IContentConverter, ConversionResult, type ConversionWarning } from '../converters/IContentConverter.js';
import { normalizeToNcm, ncmToConversionResult, DEFAULT_TABLE_CLASSES } from '../converters/ncm/index.js';
import { notifyNcmConversion } from '../utils/ncmNotify.js';
import { writeRunSummary, type ImportRunSummary } from '../utils/importRunSummary.js';
import JSPWikiConverter from '../converters/JSPWikiConverter.js';
import HtmlConverter from '../converters/HtmlConverter.js';
import DocxConverter from '../converters/DocxConverter.js';
import { guardedFetch } from '../http/guardedFetch.js';
import { resolveEgressPolicy } from '../http/egressPolicy.js';
import MarkdownConverter from '../converters/MarkdownConverter.js';
import type ConfigurationManager from './ConfigurationManager.js';
import type ValidationManager from './ValidationManager.js';
import type PageManager from './PageManager.js';
import type { PageSaveResult } from './PageManager.js';
import type AttachmentManager from './AttachmentManager.js';
import logger from '../utils/logger.js';
import { readZip, type ZipReadLimits } from '../utils/zipArchive.js';
import { freeImportTitle, linksToAttachment, readTakeout, rewriteAttachmentLinks } from '../utils/privateStoreImport.js';
import { mayActInPrivateContainer } from '../utils/privateStoreAccess.js';
import { assertContextCanWriteStore } from '../utils/privateStoreUnlock.js';
import { formatPrivatePageName, isValidStoreId, privateStoreLayoutFromConfig } from '../utils/privateStorePath.js';
import { toPermissionSubject } from '../context/JobContext.js';

/**
 * Options for import operations
 */
export interface ImportOptions {
  /** Source directory containing files to import */
  sourceDir: string;

  /**
   * Target directory for converted files (default: the live pages dir).
   * When this resolves to the live pages directory, imports go through
   * PageManager save semantics (#880 — indexed, versioned, in Recent
   * Changes). Any other directory means convert-to-files/export mode:
   * raw markdown files are written there instead.
   */
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
   * The identity that initiated this run, forwarded rather than flattened
   * (#1164, #1179, #1236).
   *
   * Until #1236 this sat beside `actor?: string` and `actorIsSystem?`, two
   * more carriers of the same fact that the run summary and the page
   * frontmatter read instead. One identity now: the run's actor, the page's
   * `editor` and its `author` fallback, and the summary's `isSystem` are all
   * derived from this context. A username string cannot carry a
   * delegation. `importPageAttachments` needed a context to authorise an
   * upload, could not get one from a string, and __fabricated__ one:
   *
   *     context: { username: author, name: author, isAuthenticated: true,
   *                roles: ['admin'] }
   *
   * where `author` came from the imported file's own `attachment.properties`.
   * The PDP (then `UserManager.hasPermission`) trusts supplied roles verbatim — it does not
   * re-resolve them — so that object authorised as an admin, attributed the
   * write to a name taken from imported content, and carried no `viaToken`,
   * so an admin's agent token doing an import escaped its scope ceiling.
   *
   * That is P1 twice over: a parameter that could not carry provenance, and a
   * synthetic admin principal invented to fill the gap it left.
   *
   * Mandatory: the upload door records it, the summary names it, the page
   * carries it. A non-request caller passes a JobContext with its reason.
   */
  actorContext: ActorContext;

  /**
   * What to do when a file's title matches an existing page (#874).
   * `'skip'` (default) — leave the existing page untouched, report duplicate.
   * `'overwrite'` — update the existing page in place through PageManager save
   * semantics: UUID, author, created, and slug preserved; version bumped by
   * the provider; `editor` = `actor`; search index and link graph updated
   * in-band (same contract as an edit-form save / the ingest API upsert).
   * Folder import only — URL import keeps hard-skip.
   */
  conflictPolicy?: 'skip' | 'overwrite';

  /**
   * Explicit private-store destination (#1389). Markdown still goes through
   * PageManager. JSON/XML become files in the store via AttachmentManager.
   * Never inferred from a page. Store id from ConfigurationManager when omitted.
   */
  private?: boolean;
  store?: string;
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
  /** Imported page title (success only) — lets the UI link to /view/<title> */
  pageTitle?: string;
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

  /** True when an existing page was (or on dry run: would be) updated in place (#874) */
  overwritten?: boolean;

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
 * Why a takeout import was refused before anything was written (#1472).
 * A refusal is never a partial import.
 */
export class TakeoutImportRefused extends Error {
  constructor(
    readonly reason: 'not-owner' | 'no-such-store' | 'locked' | 'unreadable',
    message: string
  ) {
    super(message);
    this.name = 'TakeoutImportRefused';
  }
}

/** One page's outcome in a takeout import (#1472). */
export type TakeoutPageOutcome =
  | { title: string; outcome: 'imported'; importedAs: string }
  | { title: string; outcome: 'unchanged' }
  | { title: string; outcome: 'changed-since-takeout' }
  /** `where` is named only when the requester may view that page. */
  | { title: string; outcome: 'uuid-elsewhere'; where?: string }
  | { title: string; outcome: 'failed'; message: string };

export type TakeoutImportReport = {
  store: string;
  pages: TakeoutPageOutcome[];
  /** Files stored, or matched to one the store already held. */
  files: number;
  /** Files that could not be stored, by name. */
  fileErrors: Array<{ name: string; message: string }>;
  /**
   * Files stored that no page now in the store links to — typically because
   * the pages that used them were skipped (operator, 2026-09-25: they come
   * in, and are reported). Named here, for the owner; counted in the logs.
   */
  unlinkedFiles: string[];
  /** Archive members that are neither a page nor a file. */
  ignored: string[];
  /**
   * The private page this import's report was saved as, in the target store
   * (operator, 2026-09-25). Absent only when that save failed.
   */
  reportPage?: string;
};

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
    this.registerConverter(new DocxConverter());

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
    // Extension match outranks content sniffing (#879): JSPWiki's content
    // patterns (||table||, %%style) also occur in NCM markdown, and probing
    // in registration order let jspwiki claim .md files — the converter then
    // mangled them. A converter that owns the file's extension wins first;
    // content-based detection is the fallback for extensionless/unknown files.
    const lower = filename.toLowerCase();
    for (const [formatId, converter] of this.converterRegistry.entries()) {
      if (converter.fileExtensions.some(ext => lower.endsWith(ext.toLowerCase()))) {
        return formatId;
      }
    }
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
                status: 'success',
                pageTitle: typeof imported.metadata?.['title'] === 'string' ? imported.metadata['title'] : undefined
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
        // Log it — before this, a failed file's message lived only in the JSON
        // result and the server log showed nothing for the failure.
        logger.error(`[ImportManager] Import failed for ${filePath}: ${errorMessage}`);
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
          // #1236: one identity. A job with no person behind it — boot, a
          // schedule, an operator command — is the system's run; a request,
          // or a request-origin job, is a person's.
          actor: options.actorContext.username,
          isSystem: isJobContext(options.actorContext) && options.actorContext.origin !== 'request',
          origin: actorOf(options.actorContext).metadata.origin as string,
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
    const filename = path.basename(filePath);
    const ext = path.extname(filename).toLowerCase();
    if (options.private === true && (ext === '.json' || ext === '.xml')) {
      return this.importPrivateStoreFile(filePath, options);
    }

    // Read source file
    const content = await fs.readFile(filePath, 'utf-8');

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
    const tableClasses = this.ncmTableClasses();
    let conversionResult: ConversionResult;
    if (converter.convertBuffer) {
      // #1131: a binary source (docx). The utf-8 read above was zip garbage —
      // re-read as a Buffer, let the converter produce intermediate HTML, and
      // route THAT through the same html→NCM path every HTML import takes, so
      // links, tables, images and footnotes all come from the funnel.
      const buffer = await fs.readFile(filePath);
      const intermediate = await converter.convertBuffer(buffer);
      conversionResult = ncmToConversionResult(normalizeToNcm(intermediate.content, 'html', { tableClasses }));
      conversionResult.warnings.unshift(...intermediate.warnings);
      conversionResult.metadata = { ...intermediate.metadata, ...conversionResult.metadata };
    } else if (formatId === 'html' || formatId === 'jspwiki' || formatId === 'markdown') {
      conversionResult = ncmToConversionResult(normalizeToNcm(content, formatId, { tableClasses }));
    } else {
      conversionResult = converter.convert(content);
    }
    // #1332: an imported page gets every Markdown fix step, the same as
    // Convert to NCM. Only the NCM formats: the fix steps read Markdown.
    if (converter.convertBuffer || formatId === 'html' || formatId === 'jspwiki' || formatId === 'markdown') {
      conversionResult.content = this.applyFixSteps(conversionResult.content, conversionResult.warnings);
    }

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

    // Check for duplicate page by title (metadata only - no content needed).
    // conflictPolicy 'overwrite' (#874) falls through instead of returning:
    // the existing page is updated in place at the write step below.
    let pageTitle = conversionResult.metadata['title'] as string;
    let overwriteExistingUuid: string | undefined;
    try {
      const pageManager = this.engine.getManager<PageManager>('PageManager');
      const existingMetadata = await pageManager?.getPageMetadata(pageTitle, options.actorContext);
      if (existingMetadata) {
        const existingUuid = existingMetadata.uuid || '';
        if (options.conflictPolicy === 'overwrite') {
          overwriteExistingUuid = existingUuid;
          logger.info(`[ImportManager] Conflict: "${pageTitle}" exists as ${existingUuid} — overwriting per conflict policy`);
          conversionResult.warnings.push({
            kind: 'import-conflict',
            detail: `Page "${pageTitle}" already exists (${existingUuid}) — ${options.dryRun ? 'will be overwritten' : 'overwritten in place'}`
          });
        } else {
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
      }
    } catch {
      // PageManager lookup failed — proceed with import
    }

    // Import attachments from a sibling `-att/` directory — any format, not
    // just jspwiki (#874: markdown imports carrying sidecar images, e.g.
    // generated route maps, silently lost them). Runs before the page write
    // so relative image refs can be rewritten to the uploaded attachment URLs.
    let attachments: { imported: number; skipped: number; errors: string[] } | undefined;
    let attachmentIds: Record<string, string> = {};
    {
      const attPageTitle = conversionResult.metadata['title'] as string;
      try {
        const attResult = await this.importPageAttachments(filePath, attPageTitle, options);
        attachments = { imported: attResult.imported, skipped: attResult.skipped, errors: attResult.errors };
        attachmentIds = attResult.idsByFilename;
        if (attachments.errors.length > 0) {
          conversionResult.warnings.push({
            kind: 'import-attachment',
            detail: `Attachment errors: ${attachments.errors.join('; ')}`
          });
        }
        if (attachments.imported > 0) {
          logger.info(`[ImportManager] Imported ${attachments.imported} attachment(s) for "${attPageTitle}"`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        conversionResult.warnings.push({ kind: 'import-attachment', detail: `Failed to import attachments: ${msg}` });
      }
    }

    // Rewrite relative refs to imported attachments (markdown images/links and
    // plugin src params) to their serving URLs.
    let rewritten = conversionResult.content;
    for (const [filename, id] of Object.entries(attachmentIds)) {
      const url = `/attachments/${id}`;
      rewritten = rewritten
        .split(`](${filename})`).join(`](${url})`)
        .split(`src='${filename}'`).join(`src='${url}'`)
        .split(`src="${filename}"`).join(`src="${url}"`);
    }
    conversionResult.content = rewritten;

    // #1126: the import path adopts the #1125 footnote transfer — body
    // definitions become sidecar footnote-list records via the ONE
    // implementation in FootnoteManager, the same one convert and ingest
    // use. Dry runs report without writing; a page without a uuid (or a
    // disabled FootnoteManager) is left untouched.
    {
      const targetUuid = overwriteExistingUuid ?? pageUuid;
      const footnoteManager = this.engine.getManager('FootnoteManager') as
        | { isEnabled?: () => boolean; transferFromContent?: (uuid: string, content: string, by: ActorContext, dryRun: boolean) => Promise<{ content: string; warnings: string[] }> }
        | null;
      if (targetUuid && footnoteManager?.isEnabled?.() && footnoteManager.transferFromContent) {
        // #1233: the importer's own context, not a literal 'import'.
        const fn = await footnoteManager.transferFromContent(
          targetUuid, conversionResult.content, options.actorContext, options.dryRun === true
        );
        if (fn.warnings.length > 0) {
          conversionResult.content = fn.content;
          for (const w of fn.warnings) {
            conversionResult.warnings.push({ kind: 'converter-note', detail: w });
          }
        }
      }
    }

    // Build frontmatter if we have metadata
    let finalContent = conversionResult.content;
    if (Object.keys(conversionResult.metadata).length > 0 || options.generateUUIDs !== false) {
      finalContent = this.buildFrontmatter(conversionResult, pageUuid) + '\n\n' + conversionResult.content;
    }

    // Write (unless dry run). Imports targeting the live pages directory go
    // through PageManager save semantics (#874 overwrite, #880 create) so
    // pages come out indexed, link-resolvable, versioned, and visible in
    // Recent Changes. An explicit non-live targetDir keeps the raw file
    // write — that's convert-to-files/export mode.
    const livePagesDir = path.resolve(
      (configManager?.getProperty('ngdpbase.page.provider.filesystem.storagedir', './data/pages') as string) ?? './data/pages'
    );
    const isLivePagesTarget = path.resolve(options.targetDir ?? livePagesDir) === livePagesDir;

    const written = !options.dryRun;
    if (written) {
      if (overwriteExistingUuid !== undefined) {
        const saved = await this.overwriteExistingPage(pageTitle, conversionResult.content, conversionResult.metadata, options);
        pageTitle = this.reportNormalisedTitle(saved, conversionResult, pageTitle);
      } else if (isLivePagesTarget || options.private === true) {
        const saved = await this.createPageThroughPipeline(pageTitle, conversionResult, pageUuid, options);
        pageTitle = this.reportNormalisedTitle(saved, conversionResult, pageTitle);
      } else {
        await fs.ensureDir(path.dirname(targetPath));
        await fs.writeFile(targetPath, finalContent, 'utf-8');
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
      attachments,
      ...(overwriteExistingUuid !== undefined
        ? { overwritten: true, existingPageUuid: overwriteExistingUuid }
        : {})
    };
  }

  /**
   * Update an existing page in place from an import (#874 conflict policy
   * 'overwrite'). Mirrors the edit-form / ingest-API save contract: UUID,
   * author, created, and slug are preserved from the existing page; the
   * provider bumps the version; `editor` is the import actor; the search
   * index, link graph, and render cache are updated in-band so the result
   * is immediately searchable and link-resolvable.
   */
  private async overwriteExistingPage(
    pageTitle: string,
    content: string,
    importMetadata: Record<string, unknown>,
    options: ImportOptions
  ): Promise<PageSaveResult> {
    const pageManager = this.engine.getManager<PageManager>('PageManager');
    if (!pageManager) {
      throw new Error('PageManager unavailable — cannot overwrite existing page');
    }
    const existingPage = await pageManager.getPage(pageTitle, options.actorContext);
    if (!existingPage) {
      throw new Error(`Existing page "${pageTitle}" disappeared during import`);
    }
    const base = { ...(existingPage.metadata as Record<string, unknown>) };
    const merged: Record<string, unknown> = {
      ...base,
      ...importMetadata,
      title: pageTitle,
      // Identity + provenance fields the import must never replace. Pages that
      // predate the save pipeline (raw imports) may lack `author` — fall back
      // to the import actor rather than carrying undefined into the save.
      uuid: base.uuid,
      author: (base.author) || options.actorContext.username,
      ...(base.created !== undefined ? { created: base.created } : {}),
      ...(base.slug !== undefined ? { slug: base.slug } : {}),
      editor: options.actorContext.username
    };
    // js-yaml (via gray-matter) throws "unacceptable kind of an object to
    // dump" on undefined values — strip them so one absent field can't fail
    // the whole save.
    for (const key of Object.keys(merged)) {
      if (merged[key] === undefined) delete merged[key];
    }
    if (options.private === true) {
      merged.private = true;
      if (options.store) merged.store = options.store;
    }
    // #1462: the door indexes the page.
    // #1455: an import converts what somebody else wrote, so a title the rule
    // refuses is normalised and reported, never dropped.
    return pageManager.savePage(pageTitle, content, merged, options.actorContext, { normaliseTitle: true });
  }

  /**
   * A title the save door had to rewrite (#1455) is named in this file's
   * warnings, so the import report says what the source called the page and
   * what it is called here. Returns the title the page actually has.
   */
  private reportNormalisedTitle(
    saved: PageSaveResult,
    conversionResult: ConversionResult,
    pageTitle: string
  ): string {
    if (!saved.normalisedTitleFrom) return pageTitle;
    conversionResult.warnings.push({
      kind: 'title-normalised',
      detail: `"${saved.normalisedTitleFrom}" contains characters a page title may not have; imported as "${saved.name}"`
    });
    logger.info(`[ImportManager] Title normalised "${saved.normalisedTitleFrom}" → "${saved.name}"`);
    return saved.name;
  }

  /**
   * Create a new page from an import through PageManager save semantics
   * (#880): the provider assigns versioning and the page comes out indexed,
   * link-resolvable, and visible in Recent Changes — instead of the raw file
   * write that left pages invisible to search until a manual reindex.
   * `author` and `editor` are the import actor (unless the source frontmatter
   * carries an author).
   */
  private async createPageThroughPipeline(
    pageTitle: string,
    conversionResult: ConversionResult,
    pageUuid: string | undefined,
    options: Pick<ImportOptions, 'actorContext' | 'private' | 'store'>
  ): Promise<PageSaveResult> {
    const pageManager = this.engine.getManager<PageManager>('PageManager');
    if (!pageManager) {
      throw new Error('PageManager unavailable — cannot import page');
    }
    const actorContext = options.actorContext;
    const metadata = this.buildImportMetadata(conversionResult, pageUuid);
    metadata.author = (metadata.author) || actorContext.username;
    metadata.editor = actorContext.username;
    if (options.private === true) {
      metadata.private = true;
      if (options.store) metadata.store = options.store;
    }
    // See overwriteExistingPage: undefined values fail the YAML dump.
    for (const key of Object.keys(metadata)) {
      if (metadata[key] === undefined) delete metadata[key];
    }
    // #1462: the door indexes the page. #1455: a title the rule refuses is
    // normalised and reported (see overwriteExistingPage).
    return pageManager.savePage(pageTitle, conversionResult.content, metadata, actorContext, { normaliseTitle: true });
  }

  /**
   * Import a page from a URL
   *
   * Fetches the URL and imports it like a file import of the same HTML
   * (#1337): the NCM normalizer (links, tables, `ncmVersion`), the #1332 fix
   * steps, then a save through PageManager — validated, audited as the
   * importer, versioned and indexed. The fetched page's schema.org metadata
   * and the source URL are kept in frontmatter.
   *
   * @param url - URL to fetch and import
   * @param options - The importer's context, and optional title and dryRun
   * @returns Imported file info
   */
  async importFromUrl(
    url: string,
    options: { actorContext: ActorContext; title?: string; dryRun?: boolean }
  ): Promise<ImportedFile> {
    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }

    // #1133: an exact allow-list, not startsWith('http') — which accepts
    // `httpfoo:` and happened to be safe only because fetch rejects unknown
    // schemes. guardedFetch checks this too; keeping it here preserves the
    // specific error an operator sees for a mistyped scheme.
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new Error('Only HTTP and HTTPS URLs are supported');
    }

    // Fetch the page
    logger.info(`[ImportManager] Fetching URL: ${url}`);
    const egressConfig = this.engine?.getManager?.<ConfigurationManager>('ConfigurationManager');
    const egress = resolveEgressPolicy((key, fallback) => egressConfig?.getProperty?.(key, fallback));
    const timeoutMs = (egressConfig?.getProperty?.('ngdpbase.fetch-timeout-ms', 30000) as number) || 30000;

    // #1133: admin-system gates this, but an admin who may edit a wiki has not
    // thereby been granted the right to read the host's network position — and
    // the fetched HTML is converted and written as a page, so it is a full-read
    // path. The guard judges the resolved address on every redirect hop.
    const response = await guardedFetch(url, {
      policy: egress.policy,
      headers: {
        'User-Agent': 'ngdpbase/1.0 (URL Import)',
        'Accept': 'text/html,application/xhtml+xml'
      },
      timeoutMs
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Failed to fetch URL: HTTP ${response.status}`);
    }

    const contentTypeHeader = response.headers['content-type'];
    const contentType = (Array.isArray(contentTypeHeader) ? contentTypeHeader[0] : contentTypeHeader) || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      throw new Error(`URL did not return HTML content (got ${contentType})`);
    }

    const html = response.body.toString('utf8');

    // Get the HTML converter
    const converter = this.converterRegistry.get('html');
    if (!converter) {
      throw new Error('HTML converter not registered');
    }

    // #1337: through the NCM funnel, like a file import of the same HTML —
    // links, the table up-convert and the ncmVersion stamp, not the bare
    // converter.
    const conversionResult = ncmToConversionResult(normalizeToNcm(html, 'html', { tableClasses: this.ncmTableClasses() }));

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
      const existingMetadata = await pageManager?.getPageMetadata(pageTitle, options.actorContext);
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
    const sourceCitation = `\n\n----\n- [#1] - [${pageTitle}|${url}|target='_blank'] - based on information obtained ${importDate}\n`;
    // #1332: the same Markdown fix steps as a file import or Convert to NCM.
    conversionResult.content = this.applyFixSteps(conversionResult.content + sourceCitation, conversionResult.warnings);
    conversionResult.metadata['importedFrom'] = 'url';
    const finalContent = this.buildFrontmatter(conversionResult, pageUuid) + '\n\n' + conversionResult.content;

    // Where the provider keeps a new page, for the report.
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const defaultPagesDir = configManager?.getProperty('ngdpbase.page.provider.filesystem.storagedir', './data/pages') as string ?? './data/pages';
    const targetPath = path.join(path.resolve(defaultPagesDir), `${pageUuid}.md`);

    // #1337: saved through PageManager, never a raw file write — so the page is
    // validated, audited as the importer, versioned and indexed, exactly as a
    // file import into the live pages directory (#880).
    const written = !options.dryRun;
    if (written) {
      await this.createPageThroughPipeline(pageTitle, conversionResult, pageUuid, options);
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
   * Run every Markdown fix step over an imported body (#1332), through
   * PageManager — the steps Convert to NCM runs. Each step that changed
   * something is added to `warnings` as a `converter-note`, which the import
   * preview and the run notification already show. Without a PageManager the
   * body is returned unchanged.
   *
   * @param body - Page body, without frontmatter
   * @param warnings - The conversion's warnings, appended to
   * @returns The fixed body
   */
  private applyFixSteps(body: string, warnings: ConversionWarning[]): string {
    const pageManager = this.engine.getManager<PageManager>('PageManager');
    if (typeof pageManager?.normalizePageContent !== 'function') return body;
    const fixed = pageManager.normalizePageContent(body);
    for (const c of fixed.changes) warnings.push({ kind: 'converter-note', detail: `${c.summary} (${c.step})` });
    return fixed.content;
  }

  /** Style classes for up-converted tables (NCM §2.1), operator-configurable. */
  private ncmTableClasses(): string[] {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    return configManager?.getProperty(
      'ngdpbase.markdown.ncm.table.default-classes',
      DEFAULT_TABLE_CLASSES
    ) as string[] ?? DEFAULT_TABLE_CLASSES;
  }

  /**
   * JSON/XML into a private store are files, not pages (#1389).
   */
  private async importPrivateStoreFile(
    filePath: string,
    options: ImportOptions
  ): Promise<ImportedFile> {
    const filename = path.basename(filePath);
    const ext = path.extname(filename).toLowerCase();
    const format = ext === '.xml' ? 'xml' : 'json';
    const fileBuffer = await fs.readFile(filePath);
    const fileInfo = {
      originalName: filename,
      mimeType: this.getMimeType(filename),
      size: fileBuffer.length
    };
    if (options.dryRun) {
      return {
        sourcePath: filePath,
        targetPath: filename,
        format,
        size: fileBuffer.length,
        metadata: { private: true },
        warnings: [],
        written: false
      };
    }
    const attachmentManager = this.engine.getManager('AttachmentManager') as {
      uploadAttachment: (
        buf: Buffer,
        info: typeof fileInfo,
        ctx: ActorContext,
        opts: { private: boolean; store?: string }
      ) => Promise<{ identifier?: string; url?: string }>;
    } | null;
    if (!attachmentManager) {
      throw new Error('AttachmentManager unavailable — cannot import a store file');
    }
    const uploaded = await attachmentManager.uploadAttachment(
      fileBuffer,
      fileInfo,
      options.actorContext,
      { private: true, store: options.store }
    );
    return {
      sourcePath: filePath,
      targetPath: uploaded.url || uploaded.identifier || filename,
      format,
      size: fileBuffer.length,
      metadata: { identifier: uploaded.identifier, private: true },
      warnings: [],
      written: true
    };
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
  ): Promise<{ imported: number; skipped: number; errors: string[]; idsByFilename: Record<string, string> }> {
    const stats = { imported: 0, skipped: 0, errors: [] as string[], idsByFilename: {} as Record<string, string> };

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

        // Read author from attachment.properties if available.
        //
        // METADATA, not an identity (#1179). This used to become the
        // authorising context above; it describes who authored the file in the
        // source system and says nothing about what this import may do.
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

        // #1179: forward the initiator's identity. Never rebuild one, and
        // never invent roles — `author` is read from the imported file, so
        // trusting it was trusting the input.
        const uploaded = await attachmentManager?.uploadAttachment(fileBuffer, fileInfo, options.actorContext, {
          pageName,
          description: originalFilename,
          ...(options.private === true ? { private: true, store: options.store } : {})
        });
        stats.imported++;
        if (uploaded?.identifier) {
          stats.idsByFilename[originalFilename] = uploaded.identifier;
        }
        // The source system's author is logged, not stored as an identity and
        // not written into the description — no metadata field exists for it,
        // and inventing one would change stored data. Recording it here keeps
        // the provenance without either.
        logger.info(
          `[ImportManager] Imported attachment: ${originalFilename} for page "${pageName}"` +
          `${author && author !== 'import' ? ` (source author: ${author})` : ''}`
        );
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
  private buildImportMetadata(
    result: ConversionResult,
    pageUuid?: string
  ): Record<string, unknown> {
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
      frontmatter['system-category'] = (result.metadata['system-category']) || 'general';
      frontmatter['user-keywords'] = (result.metadata['user-keywords']) || [];
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
    frontmatter['importedFrom'] = (result.metadata['importedFrom']) || 'unknown';
    frontmatter['importedAt'] = new Date().toISOString();

    return frontmatter;
  }

  private buildFrontmatter(
    result: ConversionResult,
    pageUuid?: string
  ): string {
    const frontmatter = this.buildImportMetadata(result, pageUuid);

    // #1381: through the YAML library, which quotes any string YAML would
    // otherwise read as something else. The hand-written YAML this replaces
    // quoted only strings with `:`, `#` or `'`, so the page name 2024-11-21
    // came back as a date and `true` as a boolean.
    return `---\n${yaml.dump(frontmatter, { lineWidth: -1, skipInvalid: true })}---`;
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

    // #896: catalog reads/writes go through the vocabulary provider (seed +
    // instance store), never ConfigurationManager.setProperty. Skips (no
    // writes) when CatalogManager is unavailable.
    interface KeywordProviderLike {
      getCatalogObject: () => Promise<Record<string, Record<string, unknown>>>;
      saveCatalogObject: (c: Record<string, Record<string, unknown>>) => Promise<void>;
    }
    const catalogManager = this.engine.getManager('CatalogManager') as {
      getUserKeywordsProvider?: () => KeywordProviderLike | null;
    } | null;
    const kwProvider: KeywordProviderLike | null = catalogManager?.getUserKeywordsProvider?.() ?? null;
    if (!kwProvider) {
      logger.warn('[ImportManager] keyword catalog provider unavailable — skipping keyword auto-registration');
      return 0;
    }
    const existingKeywords = await kwProvider.getCatalogObject();

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
      await kwProvider.saveCatalogObject(updatedKeywords);
      logger.info(`[ImportManager] Added ${addedCount} new user-keywords to the vocabulary store`);
    }

    return addedCount;
  }

  /**
   * Import a takeout into one of the requester's OWN private stores (#1472).
   *
   * The mirror of `PageManager.buildOwnStoreTakeout`, and not `importPages`:
   * that reads a directory on the server, so a decrypted takeout would have to
   * be staged on disk, and it converts every page, which would rewrite bodies
   * that are already this system's own markdown. Here the archive is read in
   * memory and each page and file goes through the same doors an edit and an
   * upload use, so a sealed store encrypts on write with no new crypto.
   *
   * Refused before anything is written — never a partial import — when the
   * requester is not the owner, the store is not theirs, or it is encrypted
   * and locked in this session.
   *
   * Idempotent (operator, 2026-09-25): importing the same takeout twice leaves
   * the store as the first import did.
   *
   *   - Files first, so page links can be pointed at them. The store's upload
   *     finds a file whose bytes it already holds and returns that one, so a
   *     second import stores nothing new.
   *   - A page whose uuid the target store already holds is skipped:
   *     `unchanged` when its body matches, `changed-since-takeout` when not —
   *     the live page wins.
   *   - A page whose uuid is used elsewhere on the site is skipped as
   *     `uuid-elsewhere`, naming the page only when the requester may view it.
   *   - A title held by a DIFFERENT page lands beside it as `Title (imported)`.
   *
   * This is not a restore: a takeout carries no history and no trash.
   *
   * @param ctx - Who is importing; only into their own container
   */
  async importOwnStoreTakeout(
    ctx: ActorContext,
    options: {
      store: string;
      archive: Buffer;
      limits: ZipReadLimits;
      /** The uploaded file's name, for the report page. */
      sourceName?: string;
    }
  ): Promise<TakeoutImportReport> {
    if (!ctx) throw new Error('ImportManager.importOwnStoreTakeout requires an ActorContext');
    const owner = ctx.username;
    if (!owner || !mayActInPrivateContainer(ctx, owner)) {
      throw new TakeoutImportRefused('not-owner', 'Only the owner can import into their store.');
    }

    const pageManager = this.engine.getManager<PageManager>('PageManager');
    const attachmentManager = this.engine.getManager<AttachmentManager>('AttachmentManager');
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const pagesDirectory = configManager?.getResolvedDataPath?.('ngdpbase.page.provider.filesystem.storagedir', './data/pages');
    if (!pageManager || !attachmentManager || !configManager || !pagesDirectory) {
      throw new Error('ImportManager.importOwnStoreTakeout: page, attachment or configuration manager unavailable');
    }
    const layout = privateStoreLayoutFromConfig((key, fallback) => configManager.getProperty(key, fallback));

    // Only a store that exists, or the default one every person has. Making a
    // store is its own door (#1414): an encrypted one needs keys made for it.
    const { store } = options;
    const ownStores = await pageManager.listOwnStoreIds(ctx);
    if (!isValidStoreId(store) || !(ownStores.includes(store) || store === layout.defaultStoreId)) {
      throw new TakeoutImportRefused('no-such-store', 'You have no store of that name.');
    }
    try {
      await assertContextCanWriteStore(ctx, { pagesDirectory, owner, store, layout });
    } catch {
      throw new TakeoutImportRefused('locked', 'That store is encrypted and locked in this session. Unlock it, then import again.');
    }

    let takeout;
    try {
      takeout = readTakeout(readZip(options.archive, options.limits));
    } catch (err) {
      throw new TakeoutImportRefused('unreadable', `That file could not be read as a takeout: ${(err as Error).message}`);
    }

    const report: TakeoutImportReport = {
      store, pages: [], files: 0, fileErrors: [], unlinkedFiles: [], ignored: takeout.ignored
    };

    // ── Files ──────────────────────────────────────────────────────────────
    const newIds = new Map<string, string>();
    const storedFiles: Array<{ name: string; id: string }> = [];
    for (const file of takeout.files) {
      try {
        const stored = await attachmentManager.uploadAttachment(
          file.bytes,
          { originalName: file.name, mimeType: file.encodingFormat || this.getMimeType(file.name), size: file.bytes.length },
          ctx,
          { private: true, store, description: file.description ?? '' }
        );
        if (file.oldId && stored.identifier) newIds.set(file.oldId, stored.identifier);
        if (stored.identifier) storedFiles.push({ name: file.name, id: stored.identifier });
        report.files++;
      } catch (err) {
        report.fileErrors.push({ name: file.name, message: (err as Error).message });
      }
    }

    // ── Pages ──────────────────────────────────────────────────────────────
    const nameIn = (s: string, key: string): string => formatPrivatePageName(owner, s, key);
    // The bodies of this takeout's pages as they now stand in the store —
    // what decides whether a file is linked from anything.
    const bodiesInStore: string[] = [];
    for (const page of takeout.pages) {
      try {
        const body = rewriteAttachmentLinks(page.body, newIds);

        if (page.uuid) {
          const here = await pageManager.getPage(nameIn(store, page.uuid), ctx);
          if (here) {
            bodiesInStore.push(here.content ?? '');
            report.pages.push({
              title: page.title,
              outcome: (here.content ?? '').trim() === body.trim() ? 'unchanged' : 'changed-since-takeout'
            });
            continue;
          }
          const elsewhere = await this.whereUuidLives(pageManager, ctx, page.uuid, ownStores.filter(s => s !== store), nameIn);
          if (elsewhere) {
            report.pages.push({ title: page.title, outcome: 'uuid-elsewhere', ...(elsewhere.where ? { where: elsewhere.where } : {}) });
            continue;
          }
        }

        const title = await freeImportTitle(page.title, async (t) => !!await pageManager.getPage(nameIn(store, t), ctx));
        const metadata: Record<string, unknown> = { ...page.metadata, title, private: true, store };
        for (const key of Object.keys(metadata)) {
          if (metadata[key] === undefined) delete metadata[key];
        }
        const saved = await pageManager.savePage(nameIn(store, title), body, metadata, ctx, { normaliseTitle: true });
        bodiesInStore.push(body);
        report.pages.push({ title: page.title, outcome: 'imported', importedAs: saved.name });
      } catch (err) {
        report.pages.push({ title: page.title, outcome: 'failed', message: (err as Error).message });
      }
    }

    report.unlinkedFiles = storedFiles
      .filter(f => !bodiesInStore.some(b => linksToAttachment(b, f.id)))
      .map(f => f.name);

    // #1461: a private store is logged by owner and store, never by page or file.
    logger.info(`[ImportManager] ${owner} imported a takeout into '${store}': `
      + `${report.pages.filter(p => p.outcome === 'imported').length} page(s), ${report.files} file(s)`
      + (report.unlinkedFiles.length ? `, ${report.unlinkedFiles.length} file(s) no page in the store links to` : ''));

    // The report, kept (operator, 2026-09-25): a page in the store it is about,
    // sealed exactly when the store is, so it can name what a log may not. A
    // failure here costs the record, never the import.
    try {
      const when = new Date();
      const stamp = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}`
        + ` ${when.toTimeString().slice(0, 8)}`;
      const title = await freeImportTitle(`${stamp}-import-report`, async (t) => !!await pageManager.getPage(nameIn(store, t), ctx));
      const saved = await pageManager.savePage(
        nameIn(store, title),
        this.takeoutReportMarkdown(report, { owner, when, sourceName: options.sourceName }),
        { title, private: true, store },
        ctx
      );
      report.reportPage = saved.name;
    } catch (err) {
      logger.warn(`[ImportManager] the import report for ${owner}'s store '${store}' could not be saved: ${(err as Error).message}`);
    }
    return report;
  }

  /** The import report page's markdown. Private links are `[Title|store/Title]` (#1457). */
  private takeoutReportMarkdown(
    report: TakeoutImportReport,
    about: { owner: string; when: Date; sourceName?: string }
  ): string {
    // Link text cannot carry the characters that end or split a link.
    const text = (t: string): string => t.replace(/[|[\]]/g, ' ').trim();
    const inStore = (name: string): string => {
      const title = name.split('/').pop() ?? name;
      return `[${text(title)}|${report.store}/${title}]`;
    };
    const where = (w: string): string => {
      const parts = w.split('/');
      // `private/{owner}/{store}/{title}`, or a public title.
      return parts.length === 4 && parts[0] === 'private'
        ? `[${text(parts[3])}|${parts[2]}/${parts[3]}]`
        : `[${text(w)}]`;
    };
    const count = (o: TakeoutPageOutcome['outcome']): number => report.pages.filter(p => p.outcome === o).length;

    const lines: string[] = [
      `Import of ${about.sourceName ? `**${text(about.sourceName)}**` : 'a download'} into store **${report.store}**,`
        + ` ${about.when.toLocaleString()}, by ${about.owner}.`,
      '',
      `- Pages imported: ${count('imported')}`,
      `- Already here, unchanged: ${count('unchanged')}`,
      `- Changed since the download — the page here was kept: ${count('changed-since-takeout')}`,
      `- Already on this site elsewhere — not imported: ${count('uuid-elsewhere')}`,
      `- Could not be imported: ${count('failed')}`,
      `- Files stored: ${report.files}${report.unlinkedFiles.length ? ` (${report.unlinkedFiles.length} not linked from any page)` : ''}`,
      '',
      'A download holds no history and no trash, so neither came back.',
      ''
    ];

    if (report.pages.length > 0) {
      lines.push('## Pages', '');
      for (const p of report.pages) {
        switch (p.outcome) {
        case 'imported': {
          const as = p.importedAs.split('/').pop() ?? p.importedAs;
          lines.push(`- ${inStore(p.importedAs)} — imported${as !== p.title ? ` (its title "${text(p.title)}" was taken)` : ''}`);
          break;
        }
        case 'unchanged': lines.push(`- ${text(p.title)} — already here, unchanged`); break;
        case 'changed-since-takeout': lines.push(`- ${text(p.title)} — changed since the download; the page here was kept`); break;
        case 'uuid-elsewhere': lines.push(`- ${text(p.title)} — already on this site${p.where ? ` as ${where(p.where)}` : ' elsewhere'}; not imported`); break;
        case 'failed': lines.push(`- ${text(p.title)} — could not be imported: ${text(p.message)}`); break;
        }
      }
      lines.push('');
    }
    if (report.unlinkedFiles.length > 0) {
      lines.push('## Files no page links to', '', 'Stored in this store, but no page here links to them.', '');
      for (const f of report.unlinkedFiles) lines.push(`- ${text(f)}`);
      lines.push('');
    }
    if (report.fileErrors.length > 0) {
      lines.push('## Files that could not be stored', '');
      for (const f of report.fileErrors) lines.push(`- ${text(f.name)}: ${text(f.message)}`);
      lines.push('');
    }
    if (report.ignored.length > 0) {
      lines.push('## Left out of the import', '', 'In the download, but neither a page nor a file.', '');
      for (const i of report.ignored) lines.push(`- \`${i.replace(/`/g, '')}\``);
      lines.push('');
    }
    return lines.join('\n');
  }

  /**
   * Where a uuid is already in use outside the target store, or null.
   *
   * The owner's other stores this session can read, then the public pages.
   * `where` is set only for a page the requester may view: a uuid held by a
   * page they cannot see is reported without naming it, so an import cannot
   * be used to probe for pages.
   */
  private async whereUuidLives(
    pageManager: PageManager,
    ctx: ActorContext,
    uuid: string,
    otherStores: string[],
    nameIn: (store: string, key: string) => string
  ): Promise<{ where?: string } | null> {
    for (const other of otherStores) {
      const found = await pageManager.getPage(nameIn(other, uuid), ctx);
      if (found) return { where: nameIn(other, found.title) };
    }
    const shared = await pageManager.getPage(uuid, ctx);
    if (!shared) return null;
    const pip = this.engine.getManager<{
      canUserAccessPage(subject: unknown, pageName: string, action: string): Promise<boolean>;
        }>('PolicyInformationPoint');
    const subject = isJobContext(ctx) ? toPermissionSubject(ctx) : ctx;
    const visible = !!pip && await pip.canUserAccessPage(subject, shared.title, 'view');
    return visible ? { where: shared.title } : {};
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

