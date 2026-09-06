import BaseManager, { BackupData, type ManagerStats } from './BaseManager.js';
import { actorOf, isJobContext, type ActorContext } from '../context/ActorContext.js';
import { toPermissionSubject } from '../context/JobContext.js';
import type { JobSubject } from './UserManager.js';
import type { PermissionSubject } from './UserManager.js';
import logger from '../utils/logger.js';

/**
 * Marks an error as "the audit record could not be written", not "the action
 * failed" (#1183). A caller refusing a destructive action needs to say which.
 */
export const AUDIT_WRITE_FAILED = 'EAUDITWRITE';
import { recordAuditEvent, type AuditEventSink } from '../utils/auditEvents.js';
import { AUDIT_EVENT } from '../utils/auditEventNames.js';
import { buildAttachmentAuditEvent } from '../utils/auditEvents.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';
import type PageManager from './PageManager.js';
import type CatalogManager from './CatalogManager.js';
import type {
  CatalogSource,
  CatalogQuery,
  CatalogPage,
  CreativeWork,
  SchemaType,
  RebuildOpts
} from '../types/Schema.js';
import type BasicAttachmentProvider from '../providers/BasicAttachmentProvider.js';

/**
 * Minimal interface for MediaManager — avoids a circular import.
 * Only the method used by resolveAttachmentSrc() is declared here.
 */
interface MediaManagerInterface {
  findByFilename(filename: string): Promise<{ id: string; mimeType: string } | null>;
}

/**
 * Base attachment provider interface
 */
interface BaseAttachmentProvider {
  initialize(): Promise<void>;
  storeAttachment(fileBuffer: Buffer, fileInfo: FileInfo, metadata: AttachmentMetadataInput, user: User | null): Promise<AttachmentMetadata>;
  getAttachment(attachmentId: string): Promise<{ buffer: Buffer; metadata: AttachmentMetadata } | null>;
  getAttachmentMetadata(attachmentId: string): Promise<AttachmentMetadata | null>;
  getAttachmentsForPage(pageName: string): Promise<AttachmentMetadata[]>;
  getAttachmentByFilename(filename: string): Promise<AttachmentMetadata | null>;
  getAllAttachments(): Promise<AttachmentMetadata[]>;
  deleteAttachment(attachmentId: string): Promise<boolean>;
  updateAttachmentMetadata(attachmentId: string, updates: Partial<AttachmentMetadata>): Promise<boolean>;
  attachmentExists(attachmentId: string): Promise<boolean>;
  refreshAttachmentList(): Promise<void>;
  getThumbnail?(id: string, size: string): Promise<Buffer | null>;
  backup(): Promise<unknown>;
  restore(backupData: unknown): Promise<void>;
  shutdown(): Promise<void>;
  getProviderInfo(): { features: string[] };
}

/**
 * File information interface
 */
export interface FileInfo {
  originalName: string;
  mimeType: string;
  size: number;
}

/**
 * Upload options interface
 */
export interface UploadOptions {
  pageName?: string;
  description?: string;
  /** WikiContext for the current request — used to resolve page privacy */
  wikiContext?: import('../context/WikiContext.js').default;
}

// #1179: the acting methods below take an `ActorContext` — the request's
// subject or a JobContext — mandatory and positional. The optional
// `UserContext` this file used to declare recorded `unknown` when omitted;
// a missing context now fails the permission check closed AND cannot be
// omitted at compile time.

/**
 * User object interface
 */
export interface User {
  name: string;
  email?: string;
}

/**
 * Mention object (WebPage reference)
 */
export interface Mention {
  '@type': string;
  name: string;
  url: string;
}

/**
 * Attachment metadata interface
 */
export interface AttachmentMetadata {
  identifier: string;
  name?: string;
  url?: string;
  encodingFormat?: string;
  description?: string;
  isFamilyFriendly?: boolean;
  mentions?: Mention[];
  editor?: {
    '@type': string;
    name: string;
    email?: string;
  };
  // --- PDF / docx embedded document metadata (Slice 5 of #755 / #759) ---
  documentTitle?: string;
  documentAuthor?: string;
  documentSubject?: string;
  documentKeywords?: string[];
  documentDateCreated?: string;
  documentDateModified?: string;
  inLanguage?: string;
  [key: string]: unknown;
}

/**
 * Attachment metadata input (for new uploads)
 */
export interface AttachmentMetadataInput {
  description: string;
  isFamilyFriendly: boolean;
}

/**
 * Attachment backup data
 */
export interface AttachmentBackupData extends BackupData {
  providerClass: string | null;
  providerBackup?: unknown;
  data?: null;
}

/**
 * AttachmentManager - Manages file attachments for wiki pages
 *
 * Following JSPWiki's AttachmentManager pattern, this manager:
 * - Delegates storage to pluggable attachment providers
 * - Enforces permissions via PolicyManager
 * - Tracks attachment-page relationships
 * - Provides high-level attachment operations
 *
 * @class AttachmentManager
 * @extends BaseManager
 *
 * @property {BaseAttachmentProvider|null} attachmentProvider - The active attachment provider
 * @property {string|null} providerClass - The class name of the loaded provider
 *
 * @see {@link BaseManager} for base functionality
 * @see {@link BasicAttachmentProvider} for default provider implementation
 *
 * @example
 * const attachmentManager = engine.getManager('AttachmentManager');
 * await attachmentManager.attachFile('Main', fileBuffer, 'document.pdf');
 *
 * Based on:
 * https://github.com/apache/jspwiki/blob/master/jspwiki-main/src/main/java/org/apache/wiki/attachment/AttachmentManager.java
 */
class AttachmentManager extends BaseManager implements CatalogSource {
  /** CatalogSource identifier (Slice 5 of #755 / #759). */
  readonly sourceId = 'attachments';

  /**
   * Subtypes this source produces. Today only DigitalDocument (PDFs / docx /
   * xlsx / pptx). Image and video attachments emit a `DigitalDocument` stub
   * since the rich ImageObject / VideoObject mapper lives on the media path.
   */
  readonly types: readonly SchemaType[] = ['DigitalDocument'];

  /**
   * On-disk schema version for attachment-metadata.json (Decision 6).
   * Bump when the persisted SchemaCreativeWork shape changes; current v1 is
   * the post-Slice-5 (#759) shape including documentTitle / documentAuthor /
   * documentSubject / documentKeywords / documentDateCreated /
   * documentDateModified / inLanguage.
   */
  static readonly CURRENT_SCHEMA_VERSION = 1;
  readonly currentSchemaVersion = AttachmentManager.CURRENT_SCHEMA_VERSION;

  private attachmentProvider: BaseAttachmentProvider | null;
  private providerClass: string | null;
  private maxSize!: number;
  private allowedTypes!: string;

  /**
   * Creates a new AttachmentManager instance
   *
   * @constructor
   * @param {WikiEngine} engine - The wiki engine instance
   */
  constructor(engine: WikiEngine) {
    super(engine);
    this.attachmentProvider = null;
    this.providerClass = null;
  }

  /** Return the active attachment provider for use by AssetManager. */
  get provider(): BaseAttachmentProvider | null {
    return this.attachmentProvider;
  }

  /**
   * Initialize AttachmentManager and load the configured provider
   *
   * @async
   * @param {Record<string, unknown>} [config={}] - Configuration object (unused, reads from ConfigurationManager)
   * @returns {Promise<void>}
   * @throws {Error} If ConfigurationManager is not available or provider fails to load
   */
  async initialize(config: Record<string, unknown> = {}): Promise<void> {
    await super.initialize(config);

    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) {
      throw new Error('AttachmentManager requires ConfigurationManager');
    }

    // Check if attachments are enabled (ALL LOWERCASE)
    const attachmentsEnabled = configManager.getProperty('ngdpbase.attachment.enabled', true) as boolean;
    if (!attachmentsEnabled) {
      logger.info('📎 AttachmentManager: Attachments disabled by configuration');
      return;
    }

    // Load provider with fallback (ALL LOWERCASE)
    const defaultProvider = configManager.getProperty('ngdpbase.attachment.provider.default', 'basicattachmentprovider') as string;
    const providerName = configManager.getProperty('ngdpbase.attachment.provider', defaultProvider) as string;

    // Normalize provider name to PascalCase for class loading
    // basicattachmentprovider -> BasicAttachmentProvider
    this.providerClass = this.normalizeProviderName(providerName);

    // Load shared attachment settings
    this.maxSize = configManager.getProperty('ngdpbase.attachment.maxsize', 10485760) as number;
    this.allowedTypes = configManager.getProperty('ngdpbase.attachment.allowedtypes', 'image/*,text/*,application/pdf') as string;

    logger.info(`📎 Loading attachment provider: ${providerName} (${this.providerClass})`);

    // Load and initialize provider
    try {
      type AttachmentProviderConstructor = new (engine: WikiEngine) => BaseAttachmentProvider;
      const mod = await import(/* @vite-ignore */ `../providers/${this.providerClass}.js`) as { default: AttachmentProviderConstructor };
      this.attachmentProvider = new mod.default(this.engine);
      await this.attachmentProvider.initialize();

      logger.info(`📎 AttachmentManager initialized with ${this.providerClass}`);
      logger.info(`📎 Max attachment size: ${this.formatSize(this.maxSize)}`);
      logger.info(`📎 Allowed types: ${this.allowedTypes}`);

      const providerInfo = this.attachmentProvider.getProviderInfo();
      logger.info(`📎 Provider features: ${providerInfo.features.join(', ')}`);
    } catch (error) {
      logger.error(`📎 Failed to initialize attachment provider: ${this.providerClass}`, error);
      throw error;
    }

    // Slice 5 of #755 (#759) — register as a CatalogSource so CatalogManager
    // can fan out cross-source queries. CatalogManager is initialised before
    // AttachmentManager in WikiEngine bootstrap (see WikiEngine.ts:178).
    const catalog = this.engine.getManager<CatalogManager>('CatalogManager');
    if (catalog) {
      catalog.registerSource(this);
    } else {
      logger.warn('📎 CatalogManager not available at initialize — skipping CatalogSource registration');
    }
  }

  // ===========================================================================
  // CatalogSource interface (Slice 5 of #755 / #759)
  // ===========================================================================

  /**
   * CatalogSource.list — query attachments and emit CreativeWork shapes.
   *
   * Routes `query.text` through the provider's `getAttachmentsForPage` /
   * `getAllAttachments` surface, applies the (DigitalDocument-restricted)
   * `types` filter, and converts each match via the provider's
   * `toCreativeWork()`. Cursor pagination not yet implemented (initial
   * slice); `limit` caps page size.
   */
  async list(query: CatalogQuery): Promise<CatalogPage> {
    if (!this.attachmentProvider) return { items: [], total: 0 };
    const provider = this.attachmentProvider as unknown as BasicAttachmentProvider;
    if (typeof provider.toCreativeWork !== 'function') {
      // Provider hasn't been updated to expose toCreativeWork — return empty.
      // This can happen if an addon ships a custom provider that pre-dates Slice 5.
      logger.debug('[AttachmentManager.list] provider does not implement toCreativeWork — returning empty page');
      return { items: [], total: 0 };
    }

    // Pull all attachments via the existing flattened accessor (which now
    // includes the Slice-5 documentTitle / documentAuthor / etc. fields).
    let all = await this.attachmentProvider.getAllAttachments();

    // Filter by free-text against name + description + doc fields.
    if (query.text) {
      const lower = query.text.toLowerCase();
      all = all.filter(m => {
        if ((m.name ?? '').toLowerCase().includes(lower)) return true;
        if ((m.description ?? '').toLowerCase().includes(lower)) return true;
        if ((m.documentTitle ?? '').toLowerCase().includes(lower)) return true;
        if ((m.documentAuthor ?? '').toLowerCase().includes(lower)) return true;
        if ((m.documentSubject ?? '').toLowerCase().includes(lower)) return true;
        if (m.documentKeywords?.some(k => k.toLowerCase().includes(lower))) return true;
        return false;
      });
    }

    // Filter by keywords (intersect with documentKeywords).
    if (query.keywords && query.keywords.length > 0) {
      const wanted = new Set(query.keywords);
      all = all.filter(m => m.documentKeywords?.some(k => wanted.has(k)));
    }

    const total = all.length;
    const limit = typeof query.limit === 'number' && query.limit > 0 ? query.limit : all.length;
    const sliced = all.slice(0, limit);
    const items = sliced.map(m => provider.toCreativeWork(m as never));

    // Apply types filter post-conversion since the provider produces either
    // DigitalDocument or a base CW stub today.
    const filtered = (query.types && query.types.length > 0)
      ? items.filter(work => query.types?.includes(work['@type']))
      : items;

    return { items: filtered, total };
  }

  /**
   * CatalogSource.get — fetch a single attachment by stable identifier.
   * Returns null for not-found.
   *
   * Note: this does NOT enforce private-page ACL. CatalogManager callers
   * should layer ACL on top (mirroring `getAttachment()` which goes through
   * the request path with full WikiContext).
   */
  async get(identifier: string): Promise<CreativeWork | null> {
    if (!this.attachmentProvider) return null;
    const provider = this.attachmentProvider as unknown as BasicAttachmentProvider;
    if (typeof provider.toCreativeWork !== 'function') return null;

    const meta = await this.attachmentProvider.getAttachmentMetadata(identifier);
    if (!meta) return null;
    return provider.toCreativeWork(meta as never);
  }

  /**
   * CatalogSource.rebuild — re-extract embedded document metadata on every
   * stored attachment. Walks the entire metadata store, for each
   * doc-MIME attachment re-runs exiftool extraction on the stored file and
   * backfills the seven Slice-5 fields (documentTitle / documentAuthor /
   * documentSubject / documentKeywords / documentDateCreated /
   * documentDateModified / inLanguage). Backfills pre-v3.27.0 records that
   * never went through the Slice-5 extraction path at upload time.
   *
   * Per-file failures are non-fatal — logged and counted. Non-document
   * MIMEs are skipped. Wired into the `attachments.rebuild` background job
   * for operator-triggered runs from the admin dashboard. Slice 5b of #760
   * (#763).
   */
  async rebuild(opts?: RebuildOpts): Promise<void> {
    const onProgress = (opts as { onProgress?: (processed: number, total: number) => void } | undefined)?.onProgress;
    await this.backfillDocMetadata(onProgress);
  }

  /**
   * Re-extract embedded document metadata across every stored attachment.
   * Same operation as {@link rebuild} but returns the summary so the
   * `attachments.rebuild` background job can produce a per-run report.
   * Returns `{scanned, updated, skipped, errors}` zeros when the provider
   * isn't initialised yet (caller can branch on this).
   */
  async backfillDocMetadata(
    onProgress?: (processed: number, total: number) => void
  ): Promise<{ scanned: number; updated: number; skipped: number; errors: number }> {
    if (!this.attachmentProvider) {
      logger.warn('[AttachmentManager] backfillDocMetadata() called before initialization');
      return { scanned: 0, updated: 0, skipped: 0, errors: 0 };
    }
    const provider = this.attachmentProvider as unknown as BasicAttachmentProvider;
    if (typeof provider.backfillDocMetadata !== 'function') {
      logger.warn('[AttachmentManager] backfillDocMetadata() — provider does not support it; skipping');
      return { scanned: 0, updated: 0, skipped: 0, errors: 0 };
    }
    return provider.backfillDocMetadata(onProgress);
  }

  /**
   * Get current attachment provider
   * @returns {BaseAttachmentProvider | null} Current provider instance
   */
  getCurrentAttachmentProvider(): BaseAttachmentProvider | null {
    return this.attachmentProvider;
  }

  /**
   * Check a registry permission for an attachment operation (#1059).
   *
   * Evaluates through UserManager.hasPermission → PolicyEvaluator, the same
   * path WikiContext.hasPermission takes. Until #1059 this was a stub that
   * ignored its argument and granted any authenticated user, which made every
   * permission passed to it decorative — asset-delete sat on the editor role
   * while any logged-in account could delete any attachment.
   *
   * Fails closed when UserManager is unavailable: an attachment mutation with
   * no policy engine to consult is denied, not waved through.
   *
   * @param {string} permission - Registry permission ({target}-{action}, e.g. 'asset-upload')
   * @param userContext - The caller's context, forwarded (#1179)
   * @returns {Promise<boolean>} True if allowed
   * @private
   */
  private async checkPermission(permission: string, userContext: ActorContext | undefined): Promise<boolean> {
    // #1198: no `isAuthenticated` gate ahead of policy. This one refused the
    // system principal (#631) and turned #1181's thumbnail path into a silent
    // null — before policy was ever asked. Allow or deny is policy's answer;
    // the anonymous role's policy says what an unauthenticated subject may
    // do. A MISSING context still fails closed: that is "nothing runs
    // without a context" (#1179), not an authentication check.
    if (!userContext) {
      logger.warn(`📎 Permission denied for ${permission}: no context supplied`);
      return false;
    }

    const userManager = this.engine.getManager<{
      // #1164: the context form only. The inline string|object type here was a
      // second copy of the signature that let this file drop the token ceiling.
      hasPermission(subject: PermissionSubject | JobSubject, action: string): Promise<boolean>;
        }>('UserManager');
    if (!userManager) {
      logger.warn(`📎 Permission denied for ${permission}: UserManager unavailable`);
      return false;
    }

    // #1164: forward the context, never rebuild one.
    //
    // Both branches here used to drop the agent-token ceiling, and the first
    // one is the instructive half: it passed an OBJECT, so it looked like the
    // safe path and satisfied the declared type exactly — but the object was
    // BUILT from three fields, so it carried no `viaToken` for the ceiling to
    // find. The comment was about role resolution; nobody was thinking about
    // tokens, and nothing made the omission visible.
    //
    // Forwarding the caller's own context keeps the role fast-path (roles ride
    // along when present) and carries the token when there is one.
    // A JobContext carries identity and provenance, not authority: it is
    // handed over as a JobSubject whose roles policy resolves now (#631).
    const allowed = await userManager.hasPermission(isJobContext(userContext) ? toPermissionSubject(userContext) : userContext, permission);
    if (!allowed) {
      logger.warn(`📎 Permission denied: ${userContext.username} lacks ${permission}`);
    }
    return allowed;
  }

  /**
   * Upload an attachment
   *
   * @param {Buffer} fileBuffer - File data
   * @param {FileInfo} fileInfo - { originalName, mimeType, size }
   * @param {UploadOptions} options - Upload options
   * @param {string} options.pageName - Page to attach to (optional)
   * @param {string} options.description - File description
   * @param ctx - Who is uploading (#1179): the request's subject, or a JobContext for an in-engine caller. Mandatory and positional.
   * @returns {Promise<AttachmentMetadata>} Attachment metadata
   */
  async uploadAttachment(fileBuffer: Buffer, fileInfo: FileInfo, ctx: ActorContext, options: UploadOptions = {}): Promise<AttachmentMetadata> {
    if (!this.attachmentProvider) {
      throw new Error('Attachment provider not initialized');
    }

    // Check permission
    const allowed = await this.checkPermission('asset-upload', ctx);
    if (!allowed) {
      throw new Error('Permission denied: You do not have permission to upload attachments');
    }

    // The uploader, from the context. A request subject built from a session
    // carries the account's fields; a JobContext carries a name only.
    const user = {
      name: ctx.username,
      email: (ctx as { email?: string }).email || undefined
    };

    // Resolve page privacy from the page context entry.
    // pageName is used for storage-location decisions (private/ dir) only —
    // it does NOT create a mention. Page-asset linkage is driven by content
    // scanning on page save (Phase 4 / #403).
    const pageName = options.pageName;
    let isPrivatePage = false;
    let pageCreator: string | undefined;
    if (pageName) {
      try {
        const pageManager = this.engine.getManager<PageManager>('PageManager');
        const page = pageManager ? await pageManager.getPage(pageName) : null;
        // page metadata is dynamic
        const indexEntry = page?.metadata?.['index-entry'] as { location?: string; creator?: string } | undefined;
        if (indexEntry?.location === 'private') {
          isPrivatePage = true;
          pageCreator = indexEntry.creator;
        }
      } catch (err) {
        logger.warn(`📎 Could not resolve page privacy for "${pageName}": ${String(err)}`);
      }
    }

    // Create metadata (include privacy flags for provider)
    const metadata: AttachmentMetadataInput & { isPrivatePage?: boolean; pageCreator?: string } = {
      description: options.description || '',
      isFamilyFriendly: true,
      isPrivatePage,
      pageCreator
    };

    // Store attachment via provider
    const attachmentMetadata = await this.attachmentProvider.storeAttachment(fileBuffer, fileInfo, metadata, user);

    logger.info(`📎 Uploaded attachment: ${fileInfo.originalName} (${attachmentMetadata.identifier})${isPrivatePage ? ` [private page: ${pageName ?? ''}, creator: ${pageCreator ?? 'unknown'}]` : ''}`);

    // #1183 — at the door. Four write paths (NCM localization, bulk import,
    // thumbnail render, media browser) produced no record while this lived in
    // WikiRoutes. on-failure: continue, so a failed record is logged, not fatal.
    await this.recordAttachmentEvent('upload', ctx, {
      attachmentId: String(attachmentMetadata.identifier ?? ''),
      filename: fileInfo.originalName,
      pageName: pageName ?? null,
      sizeBytes: fileInfo.size ?? null
    }, options.wikiContext);

    return attachmentMetadata;
  }

  /**
   * Attach an existing attachment to a page
   *
   * @param {string} attachmentId - Attachment identifier
   * @param {string} pageName - Page name to attach to
   * @returns {Promise<boolean>} Success status
   */
  async attachToPage(attachmentId: string, pageName: string): Promise<boolean> {
    if (!this.attachmentProvider) {
      throw new Error('Attachment provider not initialized');
    }

    const metadata = await this.attachmentProvider.getAttachmentMetadata(attachmentId);
    if (!metadata) {
      throw new Error(`Attachment not found: ${attachmentId}`);
    }

    // Check if already attached
    const mentions = metadata.mentions || [];
    const alreadyAttached = mentions.some((m) => m.name === pageName);
    if (alreadyAttached) {
      logger.info(`📎 Attachment ${attachmentId} already attached to ${pageName}`);
      return true;
    }

    // Add page to mentions
    mentions.push({
      '@type': 'WebPage',
      name: pageName,
      url: `/view/${encodeURIComponent(pageName)}`
    });

    await this.attachmentProvider.updateAttachmentMetadata(attachmentId, { mentions });

    logger.info(`📎 Attached ${attachmentId} to page ${pageName}`);
    return true;
  }

  /**
   * Detach an attachment from a page
   *
   * @param {string} attachmentId - Attachment identifier
   * @param {string} pageName - Page name to detach from
   * @returns {Promise<boolean>} Success status
   */
  async detachFromPage(attachmentId: string, pageName: string): Promise<boolean> {
    if (!this.attachmentProvider) {
      throw new Error('Attachment provider not initialized');
    }

    const metadata = await this.attachmentProvider.getAttachmentMetadata(attachmentId);
    if (!metadata) {
      throw new Error(`Attachment not found: ${attachmentId}`);
    }

    // Remove page from mentions
    const mentions = (metadata.mentions || []).filter((m) => m.name !== pageName);
    await this.attachmentProvider.updateAttachmentMetadata(attachmentId, { mentions });

    logger.info(`📎 Detached ${attachmentId} from page ${pageName}`);
    return true;
  }

  /**
   * Get an attachment by ID
   *
   * @param {string} attachmentId - Attachment identifier
   * @returns {Promise<{buffer: Buffer, metadata: AttachmentMetadata}|null>}
   */
  async getAttachment(attachmentId: string): Promise<{ buffer: Buffer; metadata: AttachmentMetadata } | null> {
    if (!this.attachmentProvider) {
      throw new Error('Attachment provider not initialized');
    }

    return await this.attachmentProvider.getAttachment(attachmentId);
  }

  /**
   * Get attachment metadata only
   *
   * @param {string} attachmentId - Attachment identifier
   * @returns {Promise<AttachmentMetadata|null>}
   */
  async getAttachmentMetadata(attachmentId: string): Promise<AttachmentMetadata | null> {
    if (!this.attachmentProvider) {
      throw new Error('Attachment provider not initialized');
    }

    return await this.attachmentProvider.getAttachmentMetadata(attachmentId);
  }

  /**
   * Get all attachments for a page
   *
   * @param {string} pageName - Page name
   * @returns {Promise<AttachmentMetadata[]>}
   */
  async getAttachmentsForPage(pageName: string): Promise<AttachmentMetadata[]> {
    if (!this.attachmentProvider) {
      return [];
    }

    return await this.attachmentProvider.getAttachmentsForPage(pageName);
  }

  /**
   * Find an attachment by its original filename across all attachments
   *
   * @param {string} filename - Original filename to search for
   * @returns {Promise<AttachmentMetadata|null>}
   */
  async getAttachmentByFilename(filename: string): Promise<AttachmentMetadata | null> {
    if (!this.attachmentProvider) {
      return null;
    }

    return await this.attachmentProvider.getAttachmentByFilename(filename);
  }

  /**
   * Get all attachments
   *
   * @returns {Promise<AttachmentMetadata[]>}
   */
  /** #1006: how many attachments this instance holds. Count only, never metadata. */
  async getManagerStats(): Promise<ManagerStats> {
    const n = (await this.getAllAttachments()).length;
    return { ...(await super.getManagerStats()), count: n, summary: `${n} attachment(s)` };
  }

  async getAllAttachments(): Promise<AttachmentMetadata[]> {
    if (!this.attachmentProvider) {
      return [];
    }

    return await this.attachmentProvider.getAllAttachments();
  }

  /**
   * Delete an attachment
   *
   * @param {string} attachmentId - Attachment identifier
   * @param context - Who is acting (#1179): the request's subject, or a JobContext
   * @returns {Promise<boolean>} Success status
   */
  async deleteAttachment(
    attachmentId: string,
    context: ActorContext,
    wikiContext?: { request?: { ip?: string } | null }
  ): Promise<boolean> {
    if (!this.attachmentProvider) {
      throw new Error('Attachment provider not initialized');
    }

    // Check permission
    const allowed = await this.checkPermission('asset-delete', context);
    if (!allowed) {
      throw new Error('Permission denied: You do not have permission to delete attachments');
    }

    // #1183 — recorded HERE, at the door, not at the caller.
    //
    // `asset-delete` is declared on-failure: refuse with description 'destruction'
    // in auditRegistry. The emit used to live in WikiRoutes, so only the two
    // routes that remembered to call the helper produced a record — and
    // `adminDeleteAttachmentFromBrowser` destroyed attachments silently.
    // Every caller passes through here, so recording here covers all of them
    // and a new caller cannot be added without one.
    //
    // AWAITED and not caught: critical means the action must not complete when
    // the record cannot be written (#1158).
    // #1080: read the filename BEFORE the delete — afterwards it is gone, and
    // a record naming only an opaque id does not answer "what was lost?".
    // Best-effort: a metadata read failure must not block the delete, so the
    // record degrades to the id alone.
    let filename = attachmentId;
    let sizeBytes: number | null = null;
    try {
      const meta = await this.getAttachmentMetadata(attachmentId);
      if (typeof meta?.filename === 'string') filename = meta.filename;
      if (typeof meta?.size === 'number') sizeBytes = meta.size;
    } catch {
      // keep the id-only fallback
    }
    await this.recordAttachmentEvent('delete', context, { attachmentId, filename, sizeBytes }, wikiContext);

    return await this.attachmentProvider.deleteAttachment(attachmentId);
  }

  /**
   * Emit an attachment audit event from the manager that owns the resource.
   *
   * `docs/audit-posture.md` states the rule this implements: an action is
   * "emitted through `recordAuditEvent` (or the manager door that calls it)".
   * The door is here. Placing it at a route means every future caller has to
   * remember, which is the thing #1120 exists to end — being audited must not
   * depend on a producer recalling a method.
   *
   * `critical` decides whether a failure to record stops the action.
   */
  private async recordAttachmentEvent(
    op: 'upload' | 'delete',
    context: ActorContext,
    detail: { attachmentId: string; filename: string; pageName?: string | null; sizeBytes?: number | null },
    wikiContext?: { request?: { ip?: string } | null }
  ): Promise<void> {
    // Lazily resolved, matching ConfigurationManager: absent during early boot,
    // which recordAuditEvent treats as a configuration state, not a failure.
    const sink = this.engine?.getManager?.('AuditManager') as AuditEventSink | null;
    if (!sink) return;

    // #1179: read from the context — who, and the address it came from. The
    // WikiContext's request IP remains as the fallback for a caller whose
    // subject predates the address riding on it.
    const who = actorOf(context);
    const event = buildAttachmentAuditEvent({
      op,
      username: who.user,
      ipAddress: who.ipAddress ?? wikiContext?.request?.ip,
      attachmentId: detail.attachmentId,
      filename: detail.filename,
      pageName: detail.pageName,
      sizeBytes: detail.sizeBytes,
      // Forwarded, never rebuilt — the delegation rides on the caller's
      // context (P1). Without it a token-driven upload records as its owner
      // with no sign a token was involved.
      viaToken: context.viaToken
    });

    if (op === 'delete') {
      // critical: rethrows, tagged so a caller can tell an unwritable RECORD
      // from a failed DELETE. Without the tag the route reported every delete
      // failure as an audit failure, which sends an operator to the wrong
      // subsystem.
      try {
        await recordAuditEvent(sink, event);
      } catch (err) {
        const tagged = err instanceof Error ? err : new Error(String(err));
        (tagged as Error & { code?: string }).code = AUDIT_WRITE_FAILED;
        throw tagged;
      }
    } else {
      await recordAuditEvent(sink, event, (err) =>
        logger.warn(`Audit log failed for attachment.${op} of '${detail.filename}':`, err)
      );
    }
  }

  /** #1204: an attachment's metadata changed; field NAMES only, at the door both edit paths pass through. */
  private async recordAssetEdit(attachmentId: string, fields: string[], context: ActorContext): Promise<void> {
    const sink = this.engine.getManager('AuditManager') as AuditEventSink | null;
    const who = actorOf(context);
    await recordAuditEvent(sink, {
      eventType: AUDIT_EVENT.ASSET_EDIT,
      user: who.user,
      ipAddress: who.ipAddress,
      action: 'asset-edit',
      result: 'success',
      severity: 'low',
      resource: attachmentId,
      resourceType: 'attachment',
      metadata: { ...who.metadata, attachmentId, fields }
    }, (err) => logger.warn(`[AttachmentManager] Audit record failed for asset-edit of ${attachmentId}:`, err));
  }

  /**
   * Update attachment metadata
   *
   * @param {string} attachmentId - Attachment identifier
   * @param {Partial<AttachmentMetadata>} updates - Metadata updates
   * @param context - Who is acting (#1179): the request's subject, or a JobContext
   * @returns {Promise<boolean>} Success status
   */
  async updateAttachmentMetadata(attachmentId: string, updates: Partial<AttachmentMetadata>, context: ActorContext): Promise<boolean> {
    if (!this.attachmentProvider) {
      throw new Error('Attachment provider not initialized');
    }

    // Check permission (requires upload permission to edit metadata)
    const allowed = await this.checkPermission('asset-upload', context);
    if (!allowed) {
      throw new Error('Permission denied: You do not have permission to update attachment metadata');
    }

    // The record names the fields the CALLER changed; the editor stamp added
    // below is this door's own doing, not one of them.
    const fields = Object.keys(updates);

    // The editor, from the context (#1179).
    updates.editor = {
      '@type': 'Person',
      name: context.username,
      email: (context as { email?: string }).email || undefined
    };

    const ok = await this.attachmentProvider.updateAttachmentMetadata(attachmentId, updates);
    if (ok) await this.recordAssetEdit(attachmentId, fields, context);
    return ok;
  }

  /**
   * Edit an attachment's descriptive metadata (#999).
   *
   * Distinct from `updateAttachmentMetadata`, which takes an
   * `AttachmentMetadata` shape and returns a boolean. This takes the same
   * `AssetMetadataPatch` the media route uses — absent means keep, explicit
   * `null` means clear — and returns the refreshed record.
   *
   * **Sidecar only for attachments.** Unlike the media equivalent, this does
   * not write into the file: attachment IDs are content hashes, so an embedded
   * write would break the id↔bytes invariant. See
   * `BasicAttachmentProvider.updateMetadata` for the full reasoning.
   *
   * Gated on `asset-edit`, the same permission `PATCH /media/api/item/:id`
   * uses — this is asset metadata editing, and it should not require a
   * *different* right depending on whether the file happens to be a page
   * attachment or a media-library item.
   *
   * Note the older `updateAttachmentMetadata` still gates on
   * `asset-upload`. Two paths edit attachment metadata under two different
   * permissions; that divergence predates this method and is left alone rather
   * than changed as a side effect of adding a route.
   *
   * @param attachmentId - Attachment identifier
   * @param patch - Fields to change; `null` clears, omission leaves alone
   * @param context - Caller, for the permission check
   * @returns The refreshed record, or null when the attachment is unknown
   * @throws Error when the caller lacks `asset-edit`, or the provider cannot edit
   */
  async updateAssetMetadata(
    attachmentId: string,
    patch: import('../types/Asset.js').AssetMetadataPatch,
    context: ActorContext
  ): Promise<import('../types/Asset.js').AssetRecord | null> {
    if (!this.attachmentProvider) {
      throw new Error('Attachment provider not initialized');
    }

    const allowed = await this.checkPermission('asset-edit', context);
    if (!allowed) {
      throw new Error('Permission denied: You do not have permission to edit attachment metadata');
    }

    const provider = this.attachmentProvider as BaseAttachmentProvider & {
      updateMetadata?: (
        id: string,
        patch: import('../types/Asset.js').AssetMetadataPatch
      ) => Promise<import('../types/Asset.js').AssetRecord | null>;
    };

    if (typeof provider.updateMetadata !== 'function') {
      // Optional capability — a provider without it must say so rather than
      // silently accepting an edit that goes nowhere.
      throw new Error('Attachment provider does not support metadata editing');
    }

    const updated = await provider.updateMetadata(attachmentId, patch);
    if (updated) await this.recordAssetEdit(attachmentId, Object.keys(patch), context);
    return updated;
  }

  /**
   * Check if an attachment exists
   *
   * @param {string} attachmentId - Attachment identifier
   * @returns {Promise<boolean>}
   */
  async attachmentExists(attachmentId: string): Promise<boolean> {
    if (!this.attachmentProvider) {
      return false;
    }

    return await this.attachmentProvider.attachmentExists(attachmentId);
  }

  /**
   * Get attachment URL
   *
   * @param {string} attachmentId - Attachment identifier
   * @returns {string} URL path
   */
  getAttachmentUrl(attachmentId: string): string {
    return `/attachments/${attachmentId}`;
  }

  /**
   * Resolve an attachment src value (from plugin syntax) to a serving URL and MIME type.
   *
   * This is the canonical resolution method used by all plugins (ImagePlugin,
   * AttachPlugin, and future media plugins). Centralising here means Media
   * Manager (#273), private folders (#122), and any other media source only
   * need to be wired in once.
   *
   * Resolution order:
   *   0. media:// URI — resolved via MediaManager.findByFilename(); never touches attachment store
   *   1. External URL (starts with http:// or https://) — returned as-is, mimeType: ''
   *   2. Absolute path (starts with /) — returned as-is, mimeType: ''
   *   3. Filename lookup on the current page's attachments (exact name match)
   *   4. Global filename search across all attachments
   *   5. Returns null if unresolvable (caller decides how to render the error)
   *
   * @param {string} src - The raw src value from plugin syntax
   * @param {string} pageName - Page name for step 3 context
   * @returns {Promise<{ url: string; mimeType: string } | null>} Resolved result or null
   */
  async resolveAttachmentSrc(src: string, pageName: string): Promise<{ url: string; mimeType: string } | null> {
    if (!src) return null;

    // Step 0: media:// URI scheme — route to MediaManager without touching attachment store.
    // Authors use this to reference media library photos directly, e.g.:
    //   [{Image src='media://IMG_1234.jpg'}]
    //   [{ATTACH src='media://family-trip.jpg'}]
    if (src.startsWith('media://')) {
      const filename = src.slice('media://'.length);
      const mediaManager = this.engine.getManager<MediaManagerInterface>('MediaManager');
      if (mediaManager) {
        const item = await mediaManager.findByFilename(filename).catch(() => null);
        if (item) {
          return { url: `/media/file/${item.id}`, mimeType: item.mimeType };
        }
      }
      return null;
    }

    // Steps 1 & 2: external URLs and absolute paths are already resolved
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('/')) {
      return { url: src, mimeType: '' };
    }

    if (!this.attachmentProvider) return null;

    // Steps 3 & 4: page-scoped, then global, by exact name.
    const exact = await this.lookupAttachmentByName(src, pageName);
    if (exact) return exact;

    // Step 5 (#1051): retry with the basename when the src carries a path.
    //
    // Records are named by bare filename, so `Some Page/photo.jpg` matched
    // nothing here and — worse — nothing in syncPageMentions either, which
    // DROPS a mention it cannot resolve. A referenced attachment could lose
    // its last mention on an unrelated save and become a #865 quarantine
    // candidate while the page still pointed at it.
    //
    // Last resort, deliberately: a record genuinely named `Odd/name.jpg` is
    // found by the exact pass above and is never shadowed by a `name.jpg`.
    // The fallback is global for the same reason step 4 is — a bare filename
    // already resolves across pages, so scoping the stripped form more
    // tightly than the unstripped one would be the odd choice.
    const basename = AttachmentManager.basenameOf(src);
    if (basename && basename !== src) {
      const byBasename = await this.lookupAttachmentByName(basename, pageName);
      if (byBasename) return byBasename;
    }

    // Future steps (e.g. private folders #122) go here

    return null;
  }

  /**
   * Page-scoped then global lookup for one exact name (#1051 extraction).
   * Both call sites need the same two steps; nothing else changed.
   */
  private async lookupAttachmentByName(
    name: string,
    pageName: string
  ): Promise<{ url: string; mimeType: string } | null> {
    if (!this.attachmentProvider) return null;

    try {
      const pageAttachments = await this.attachmentProvider.getAttachmentsForPage(pageName);
      const match = pageAttachments.find(a => a.name === name);
      if (match) {
        return {
          url: match.url || `/attachments/${match.identifier}`,
          mimeType: match.encodingFormat || ''
        };
      }
    } catch {
      // continue
    }

    try {
      const globalMatch = await this.attachmentProvider.getAttachmentByFilename(name);
      if (globalMatch) {
        return {
          url: globalMatch.url || `/attachments/${globalMatch.identifier}`,
          mimeType: globalMatch.encodingFormat || ''
        };
      }
    } catch {
      // continue
    }

    return null;
  }

  /**
   * Final path segment of a reference, or '' when there is none (#1051).
   *
   * Returns '' for a trailing slash so callers can skip rather than searching
   * for an empty filename, which `getAttachmentByFilename` would answer
   * unpredictably.
   */
  static basenameOf(src: string): string {
    if (typeof src !== 'string' || !src.includes('/')) return src ?? '';
    return src.slice(src.lastIndexOf('/') + 1);
  }

  /**
   * Generate (or return cached) thumbnail for an image attachment.
   *
   * Delegates to the provider's getThumbnail() implementation.
   * Returns null for non-image attachments or when the provider has no
   * thumbnail capability.
   *
   * @param {string} attachmentId - Attachment identifier
   * @param {string} size         - Size string e.g. "150x150"
   * @returns {Promise<Buffer|null>}
   */
  async getThumbnail(attachmentId: string, size: string): Promise<Buffer | null> {
    if (!this.attachmentProvider?.getThumbnail) return null;
    return this.attachmentProvider.getThumbnail(attachmentId, size);
  }

  /**
   * Scan page content for local attachment references and synchronise mentions.
   *
   * Parses [{Image src='...'}] and [{ATTACH src='...'}] directives, resolves
   * each filename to an attachment identifier, then diffs against the current
   * mentions stored on each attachment:
   *   - newly referenced attachments gain a mention for pageName
   *   - previously referenced attachments that are no longer in content lose it
   *
   * Replaces the lazy attachToPage() side-effect in resolveAttachmentSrc() with
   * a deterministic, save-time update. See #405 Phase 4 / #403.
   *
   * @param {string} pageName - Name of the page being saved
   * @param {string} content  - Raw wiki markup content
   * @returns {Promise<void>}
   */
  /**
   * Canonical local-attachment reference extraction — `[{Image src='…'}]` /
   * `[{ATTACH src='…'}]` filenames, skipping media:// URIs, external URLs,
   * and absolute paths. Shared by save-time mention sync, the batch
   * reconciler (scripts/reconcile-attachment-mentions.ts mirrors it), and the
   * #865 health report.
   */
  static extractLocalAttachmentRefs(content: string): Set<string> {
    const srcPattern = /\[\{(?:Image|ATTACH)\s[^}]*?src='([^']+)'/gi;
    const refs = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = srcPattern.exec(content)) !== null) {
      const src = match[1];
      if (src.startsWith('media://') || src.startsWith('http://') ||
          src.startsWith('https://') || src.startsWith('/')) continue;
      refs.add(src);
    }
    return refs;
  }

  /**
   * #865: identifier-URL references — `/attachments/<sha256>` anywhere in
   * content (markdown images/links, raw URLs). Storybook-generated day pages
   * embed route maps this way (`![Day 4 route](/attachments/<id>)`); these
   * are real render-time references and count as mentions.
   */
  static extractAttachmentIdRefs(content: string): Set<string> {
    const idPattern = /\/attachments\/([a-f0-9]{64})\b/g;
    const ids = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = idPattern.exec(content)) !== null) ids.add(match[1]);
    return ids;
  }

  async syncPageMentions(pageName: string, content: string): Promise<void> {
    if (!this.attachmentProvider) return;

    const referencedFilenames = AttachmentManager.extractLocalAttachmentRefs(content);

    // Resolve filenames → attachment identifiers
    const currentIds = new Set<string>();
    for (const filename of referencedFilenames) {
      try {
        let attachment = await this.attachmentProvider.getAttachmentByFilename(filename);

        // #1051: a ref carrying a path (`Some Page/photo.jpg`) matches no
        // record, since records are named by bare filename. Falling through to
        // "unresolvable" here is not neutral — the ref is then absent from
        // currentIds, so the detach loop below REMOVES an existing mention,
        // orphaning an attachment the page still references and handing it to
        // #865's cleanup as a quarantine candidate.
        //
        // Exact match first, so a record genuinely named `Odd/photo.jpg` wins.
        if (!attachment) {
          const basename = AttachmentManager.basenameOf(filename);
          if (basename && basename !== filename) {
            attachment = await this.attachmentProvider.getAttachmentByFilename(basename);
          }
        }

        if (attachment) currentIds.add(attachment.identifier);
      } catch {
        // unresolvable filename — skip
      }
    }

    // #865: identifier-URL references (/attachments/<id> — markdown embeds,
    // e.g. storybook route maps) also count. Verify each id exists before
    // treating it as current.
    for (const id of AttachmentManager.extractAttachmentIdRefs(content)) {
      if (currentIds.has(id)) continue;
      try {
        const meta = await this.attachmentProvider.getAttachmentMetadata(id);
        if (meta) currentIds.add(id);
      } catch { /* unknown id — skip */ }
    }

    // Get identifiers currently mentioning this page
    const previousMentions = await this.attachmentProvider.getAttachmentsForPage(pageName);
    const previousIds = new Set<string>(
      previousMentions.map(a => a.identifier).filter(Boolean)
    );

    // Add mentions for newly referenced attachments
    for (const id of currentIds) {
      if (!previousIds.has(id)) {
        await this.attachToPage(id, pageName).catch(() => {});
      }
    }

    // Remove mentions for attachments no longer referenced
    for (const id of previousIds) {
      if (!currentIds.has(id)) {
        await this.detachFromPage(id, pageName).catch(() => {});
      }
    }
  }

  /**
   * #865 Slice 2: attachment health report — computed fresh on demand
   * (admin-triggered; walks every page's content, a few seconds on large
   * instances). Read-only. Trustworthy only after mentions reconciliation
   * (run `npm run reconcile:mentions` / rely on save-time sync).
   *
   * Sections:
   *  - orphans:         records no page references (empty mentions)
   *  - recordlessFiles: disk files with no metadata record
   *  - missingFiles:    records whose storage file is gone from disk
   *  - brokenRefs:      page markup references naming no record (ref → pages)
   *  - looseTextRefs:   record filenames appearing in content OUTSIDE
   *                     canonical markup (never tracked as mentions)
   */
  async getHealthReport(): Promise<{
    totals: { records: number; diskFiles: number; pagesScanned: number };
    orphans: Array<{ identifier: string; name?: string; contentSize?: number; dateCreated?: string; author?: string }>;
    recordlessFiles: string[];
    missingFiles: Array<{ identifier: string; name?: string; storageLocation?: string }>;
    brokenRefs: Array<{ ref: string; pages: string[] }>;
    looseTextRefs: string[];
  }> {
    const records = this.attachmentProvider ? await this.attachmentProvider.getAllAttachments() : [];
    const provider = this.attachmentProvider as unknown as { listStorageFiles?: () => Promise<string[]> } | null;
    const diskFiles = provider?.listStorageFiles ? await provider.listStorageFiles() : [];

    const byFilename = new Map<string, AttachmentMetadata>();
    for (const r of records) if (r.name) byFilename.set(r.name, r);

    const storageBasenames = new Set(
      records
        .map(r => (r as { storageLocation?: string }).storageLocation)
        .filter((s): s is string => typeof s === 'string')
        .map(s => s.split('/').pop() as string)
    );
    const diskSet = new Set(diskFiles);
    const recordlessFiles = diskFiles.filter(f => !storageBasenames.has(f)).sort();
    const missingFiles = records
      .filter(r => {
        const loc = (r as { storageLocation?: string }).storageLocation;
        return typeof loc === 'string' && !diskSet.has(loc.split('/').pop() as string);
      })
      .map(r => ({ identifier: r.identifier, name: r.name, storageLocation: (r as { storageLocation?: string }).storageLocation }));

    // Page scan for broken / loose references
    const pageManager = this.engine.getManager('PageManager') as {
      getAllPages?: () => Promise<string[]>;
      getPage?: (n: string) => Promise<{ content?: string } | null>;
    } | null;
    const brokenMap = new Map<string, Set<string>>();
    const looseTextRefs = new Set<string>();
    let pagesScanned = 0;
    if (pageManager?.getAllPages && pageManager.getPage) {
      const pageNames = await pageManager.getAllPages();
      for (const pageName of pageNames) {
        let content: string;
        try {
          content = (await pageManager.getPage(pageName))?.content ?? '';
        } catch { continue; }
        if (!content) continue;
        pagesScanned++;
        const refs = AttachmentManager.extractLocalAttachmentRefs(content);
        for (const ref of refs) {
          if (byFilename.has(ref)) continue;
          // #1051: a path-prefixed ref resolves via its basename at render and
          // sync time, so reporting it as broken here would contradict both —
          // and send someone hunting a reference that actually works.
          if (byFilename.has(AttachmentManager.basenameOf(ref))) continue;
          if (!brokenMap.has(ref)) brokenMap.set(ref, new Set());
          brokenMap.get(ref)!.add(pageName);
        }
        for (const [filename] of byFilename) {
          if (!refs.has(filename) && content.includes(filename)) looseTextRefs.add(filename);
        }
      }
    }

    const orphans = records
      .filter(r => !r.mentions || r.mentions.length === 0)
      .map(r => ({
        identifier: r.identifier,
        name: r.name,
        contentSize: (r as { contentSize?: number }).contentSize,
        dateCreated: (r as { dateCreated?: string }).dateCreated,
        author: typeof (r as { author?: { name?: string } }).author === 'object'
          ? (r as { author?: { name?: string } }).author?.name
          : undefined
      }))
      .sort((a, b) => (b.contentSize ?? 0) - (a.contentSize ?? 0));

    return {
      totals: { records: records.length, diskFiles: diskFiles.length, pagesScanned },
      orphans,
      recordlessFiles,
      missingFiles,
      brokenRefs: [...brokenMap.entries()]
        .map(([ref, pages]) => ({ ref, pages: [...pages].sort() }))
        .sort((a, b) => b.pages.length - a.pages.length),
      looseTextRefs: [...looseTextRefs].sort()
    };
  }

  /**
   * #865 Slice 3: guarded orphan cleanup — quarantine, never hard-delete.
   *
   * Recomputes the health report FRESH (never trusts a client-supplied list),
   * then moves verified orphan records (+ their files) and recordless disk
   * files into `<storage>/quarantine/`. Removed records are appended to a
   * per-run manifest in the quarantine dir so the operation is reversible.
   * `dryRun: true` returns exactly what WOULD move, touching nothing.
   */
  async quarantineOrphans(options: { dryRun: boolean; includeOrphans: boolean; includeRecordless: boolean }): Promise<{
    dryRun: boolean;
    orphansSelected: Array<{ identifier: string; name?: string; contentSize?: number }>;
    recordlessSelected: string[];
    quarantined: number;
    skipped: number;
    manifestPath: string | null;
  }> {
    const report = await this.getHealthReport();
    const orphansSelected = options.includeOrphans ? report.orphans.map(o => ({
      identifier: o.identifier, name: o.name, contentSize: o.contentSize
    })) : [];
    const recordlessSelected = options.includeRecordless ? [...report.recordlessFiles] : [];

    const provider = this.attachmentProvider as unknown as {
      quarantineAttachment?: (id: string, manifestPath: string) => Promise<boolean>;
      quarantineFile?: (basename: string) => Promise<boolean>;
      getQuarantineDir?: () => string | null;
    } | null;

    if (options.dryRun) {
      return { dryRun: true, orphansSelected, recordlessSelected, quarantined: 0, skipped: 0, manifestPath: null };
    }
    if (!provider?.quarantineAttachment || !provider.quarantineFile || !provider.getQuarantineDir) {
      throw new Error('Attachment provider does not support quarantine');
    }
    const qDir = provider.getQuarantineDir();
    if (!qDir) throw new Error('Quarantine directory unavailable');
    const manifestPath = `${qDir}/quarantined-records-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

    let quarantined = 0, skipped = 0;
    for (const o of orphansSelected) {
      if (await provider.quarantineAttachment(o.identifier, manifestPath)) quarantined++; else skipped++;
    }
    for (const f of recordlessSelected) {
      if (await provider.quarantineFile(f)) quarantined++; else skipped++;
    }
    logger.info(`📎 [AttachmentManager] quarantine run: ${quarantined} moved, ${skipped} skipped (manifest: ${manifestPath})`);
    return { dryRun: false, orphansSelected, recordlessSelected, quarantined, skipped, manifestPath };
  }

  /**
   * Refresh attachment list (rescan storage)
   *
   * @returns {Promise<void>}
   */
  async refreshAttachmentList(): Promise<void> {
    if (!this.attachmentProvider) {
      return;
    }

    await this.attachmentProvider.refreshAttachmentList();
    logger.info('📎 Attachment list refreshed');
  }

  /**
   * Backup manager data
   * Delegates to provider's backup method
   *
   * @returns {Promise<AttachmentBackupData>}
   */
  async backup(): Promise<AttachmentBackupData> {
    if (!this.attachmentProvider) {
      return {
        managerName: 'AttachmentManager',
        timestamp: new Date().toISOString(),
        providerClass: null,
        data: null,
        note: 'No provider initialized'
      };
    }

    const providerBackup = await this.attachmentProvider.backup();

    return {
      managerName: 'AttachmentManager',
      timestamp: new Date().toISOString(),
      providerClass: this.providerClass,
      providerBackup: providerBackup
    };
  }

  /**
   * Restore manager data from backup
   * Delegates to provider's restore method
   *
   * @param {AttachmentBackupData} backupData - Backup data from backup() method
   * @returns {Promise<void>}
   */
  async restore(backupData: AttachmentBackupData): Promise<void> {
    if (!backupData) {
      throw new Error('AttachmentManager: No backup data provided for restore');
    }

    if (!this.attachmentProvider) {
      throw new Error('AttachmentManager: Provider not initialized, cannot restore');
    }

    if (backupData.providerClass !== this.providerClass) {
      logger.warn(`📎 Provider mismatch: backup has ${backupData.providerClass}, current is ${this.providerClass}`);
    }

    if (backupData.providerBackup) {
      await this.attachmentProvider.restore(backupData.providerBackup);
      logger.info('📎 AttachmentManager restored from backup');
    }
  }

  /**
   * Shutdown the manager
   * @returns {Promise<void>}
   */
  async shutdown(): Promise<void> {
    if (this.attachmentProvider) {
      await this.attachmentProvider.shutdown();
    }
    await super.shutdown();
    logger.info('📎 AttachmentManager shut down');
  }

  /**
   * Normalize provider name to PascalCase class name
   * @param {string} providerName - Lowercase provider name (e.g., 'basicattachmentprovider')
   * @returns {string} PascalCase class name (e.g., 'BasicAttachmentProvider')
   * @private
   */
  private normalizeProviderName(providerName: string): string {
    if (!providerName) {
      throw new Error('Provider name cannot be empty');
    }

    // Convert to lowercase first to ensure consistency
    const lower = providerName.toLowerCase();

    // Handle special cases for known provider names
    const knownProviders: Record<string, string> = {
      basicattachmentprovider: 'BasicAttachmentProvider',
      databaseattachmentprovider: 'DatabaseAttachmentProvider',
      s3attachmentprovider: 'S3AttachmentProvider',
      azureblobattachmentprovider: 'AzureBlobAttachmentProvider'
    };

    if (knownProviders[lower]) {
      return knownProviders[lower];
    }

    // Fallback: Split on common separators and capitalize each word
    const words = lower.split(/[-_]/);
    const pascalCase = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join('');

    return pascalCase;
  }

  /**
   * Format byte size to human-readable string
   * @param {number} bytes - Size in bytes
   * @returns {string} Formatted size (e.g., "10 MB")
   * @private
   */
  private formatSize(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  }
}

export default AttachmentManager;

