import BaseManager, { BackupData, type ManagerBackupOptions, type ManagerRestoreOptions, type ManagerStats } from './BaseManager.js';
import type { AttachmentFilesBackupData, AttachmentFilesBackupOutcome } from '../providers/attachmentFilesBackup.js';
import type { PartOutcome } from '../utils/siteRestore.js';
import { ANONYMOUS_SUBJECT } from './UserManager.js';
import type PolicyDecisionPoint from '../security/PolicyDecisionPoint.js';
import { actorOf, isJobContext, type ActorContext } from '../context/ActorContext.js';
import { systemContext } from '../context/bootActions.js';
import { toPermissionSubject } from '../context/JobContext.js';
import fs from 'fs-extra';
import path from 'path';
import logger from '../utils/logger.js';

/**
 * Marks an error as "the audit record could not be written", not "the action
 * failed" (#1183). A caller refusing a destructive action needs to say which.
 */
export const AUDIT_WRITE_FAILED = 'EAUDITWRITE';
import { recordAuditEvent, type AuditEventSink } from '../utils/auditEvents.js';
import { AUDIT_EVENT } from '../utils/auditEventNames.js';
import { enabledEntries } from '../utils/configFiles.js';
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
import { formatPrivatePageName, parsePrivatePageName, privateStoreAttachmentsDir, privateStoreLayoutFromConfig, privateStoreRoot } from '../utils/privateStorePath.js';
import { readVaultSealState } from '../utils/privateStoreMeta.js';
import { parsePageFrontmatter } from '../utils/pageFrontmatter.js';
import { listPrivateOwners } from '../utils/privateStoreTakeout.js';
import { shareCoversVaultPage, vaultOfShare } from '../types/Share.js';
import { assertContextCanWriteStore } from '../utils/privateStoreUnlock.js';
import { mayActInPrivateContainer, permitsInVault, type VaultDecider } from '../utils/privateStoreAccess.js';
import { PLAIN_FILE_IO, privateStoreIdsOf, storeFileIO } from '../utils/privateStoreFiles.js';
import { transformImage, parseSize } from '../utils/imageTransform.js';
import { localizeNcmImages, type NcmImageDeps } from '../converters/ncm/index.js';
import { guardedFetch } from '../http/guardedFetch.js';
import { resolveEgressPolicy } from '../http/egressPolicy.js';
import { UNKNOWN_UPLOADER, type AssetProvider, type AssetQuery, type AssetRecord } from '../types/Asset.js';
import type { StoreFileEntry, StoreFileLocation } from '../types/Provider.js';
import { resolveUploadMime } from '../utils/sniffMime.js';
import { ATTACHMENT_DATA_TOPIC } from '../cache/CacheDependencies.js';

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
  initialize(options?: { readOnly?: boolean }): Promise<void>;
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
  /** #1876: the files themselves beside the backup document, and their staged restore. */
  backupFiles?(directory: string, stem: string): Promise<AttachmentFilesBackupOutcome>;
  stageFilesRestore?(providerBackup: Record<string, unknown>, files: AttachmentFilesBackupData, directory: string, siteRestore: string): Promise<{ skippedVaults: string[] }>;
  takeRestoreAtStart?(): PartOutcome | null;
  shutdown(): Promise<void>;
  getProviderInfo(): { features: string[] };
  // #1400 / #1460: files in a private store, listed in the store's own index —
  // an encrypted store's and an unencrypted one's alike.
  storeFileInStore(
    location: StoreFileLocation,
    bytes: Buffer,
    file: { originalName: string; mimeType: string; description: string; author?: string; pageName?: string }
  ): Promise<StoreFileEntry>;
  getFileInStore(location: StoreFileLocation, id: string): Promise<{ entry: StoreFileEntry; bytes: Buffer } | null>;
  listFilesInStore(location: StoreFileLocation): Promise<StoreFileEntry[]>;
  filesInStoreForPage(location: StoreFileLocation, pageName: string): Promise<StoreFileEntry[]>;
  setFileMentionInStore(location: StoreFileLocation, id: string, pageName: string, mentioned: boolean): Promise<boolean>;
  deleteFileInStore(location: StoreFileLocation, id: string): Promise<StoreFileEntry | null>;
  searchFilesInStore(location: StoreFileLocation, query: AssetQuery): Promise<AssetRecord[]>;
  // #1460: the start-up move out of the shared index.
  privateRecordsInSharedIndex(): Array<{ id: string; owner: string | null; store: string | null; pages: string[] }>;
  adoptRecordIntoStore(location: StoreFileLocation, id: string): Promise<StoreFileEntry | null>;
  // #1842: a page's files follow the page.
  copyRecordIntoStore(location: StoreFileLocation, id: string, pageName: string): Promise<StoreFileEntry | null>;
  copyStoreFileToStore(from: StoreFileLocation, to: StoreFileLocation, id: string, pageName: string): Promise<StoreFileEntry | null>;
  copyStoreFileToPool(from: StoreFileLocation, id: string, pageName: string): Promise<boolean>;
  removeRecordFromPool(id: string): Promise<boolean>;
  setPoolMentions(id: string, names: string[]): Promise<boolean>;
}

/**
 * A vault page that still uses files in the shared pool (#1842): `page` is its
 * uuid, or null for the pages a shared record names (whose titles are never
 * repeated).
 */
/** A page as the shared-pool share rule knows it (#1842): its names (now, and before a move) and uuid. */
interface PoolFileSelf {
  names: string[];
  uuid: string | null;
}

export interface VaultPagePoolFiles {
  owner: string;
  vault: string;
  page: string | null;
  files: number;
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
  /** WikiContext for the current request — audit IP fallback */
  wikiContext?: import('../context/WikiContext.js').default;
  /**
   * Private-store destination (#1396): the upload dialog's checkbox. Decides
   * only when `pageName` is not a private page — an upload onto a private page
   * is always private, in that page's author's store (#1398). Absent or false
   * otherwise keeps the public attachments pool.
   */
  private?: boolean;
  /** Store id when private with no private page; default from ConfigurationManager defaultstoreid */
  store?: string;
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
  /** The files themselves, as archives beside the document (#1876). */
  files?: AttachmentFilesBackupData;
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

/** What is done to a file in a private store, and the permission it is (#1539). */
type StoreFileAction = 'view' | 'edit' | 'delete';
const STORE_FILE_PERMISSION: Record<StoreFileAction, string> = { view: 'asset-read', edit: 'asset-edit', delete: 'asset-delete' };

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
  /** What the last check for vault pages using shared-pool files found, and the degraded reason it set (#1842). */
  private poolFileFindings: VaultPagePoolFiles[] = [];
  private poolFileReason: string | null = null;
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
      // #1852: `{ readOnly: true }` opens the provider for an operator report
      // that must change nothing on disk (the files dry run).
      await this.attachmentProvider.initialize(config.readOnly === true ? { readOnly: true } : {});
      // #1876: a staged restore of the files that was set aside is shown, not just logged.
      const restored = this.attachmentProvider.takeRestoreAtStart?.();
      if (restored?.refused) this.markDegraded(`A staged restore of the attachment files was not applied: ${restored.refused}`);

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
    // #1460: the shared pool only. A CatalogQuery carries no requester, and a
    // cross-source catalogue is a shared surface — a private store's files
    // belong in the per-requester reads (`getAllAttachments`), not here.
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
   * Evaluates through the PDP (`PolicyDecisionPoint.permits`), the same
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

    // #1431 step 14: the decision is the PDP's.
    const pdp = this.engine.getManager<PolicyDecisionPoint>('PolicyDecisionPoint');
    if (!pdp) {
      logger.warn(`📎 Permission denied for ${permission}: PolicyDecisionPoint unavailable`);
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
    const allowed = await pdp.permits(isJobContext(userContext) ? toPermissionSubject(userContext) : userContext, permission);
    if (!allowed) {
      logger.warn(`📎 Permission denied: ${userContext.username} lacks ${permission}`);
    }
    return allowed;
  }

  /**
   * Localize the remote images an NCM body embeds (#728 S5a-ii, #1486): each
   * remote `<img>`/`![](url)` is fetched, checked (size, type, ad deny-list)
   * and stored as an attachment of `pageName`, and the body is rewritten to
   * point at it. With `dryRun` nothing is stored: the fetch and checks run,
   * and the result reports what would be attached.
   *
   * Reached through PageManager.completeNcmConversion, the NCM door, never
   * from a route.
   *
   * #1133: the URL comes from page content, so this fetch is a capability the
   * editor does not otherwise have — making the server issue a request from
   * inside the network. guardedFetch judges the address actually resolved, on
   * every redirect hop.
   */
  async localizeRemoteImages(
    content: string,
    pageName: string,
    ctx: ActorContext,
    dryRun: boolean
  ): Promise<{ content: string; warnings: string[] }> {
    const cm = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const maxBytes = (cm?.getProperty('ngdpbase.attachment.maxsize', 10485760) as number) || 10485760;
    const adDenyList = enabledEntries(cm?.getProperty('ngdpbase.markdown.ncm.image.ad-deny-list', []));
    const fetchTimeoutMs = (cm?.getProperty('ngdpbase.fetch-timeout-ms', 30000) as number) || 30000;
    const egress = resolveEgressPolicy((key, fallback) => cm?.getProperty(key, fallback));

    const deps: NcmImageDeps = {
      fetchBytes: async (url: string, timeoutMs: number): Promise<Buffer> => {
        const r = await guardedFetch(url, {
          policy: egress.policy,
          headers: { 'User-Agent': 'ngdpbase/1.0 (NCM image)' },
          timeoutMs,
          maxBytes
        });
        if (r.status < 200 || r.status >= 300) throw new Error(`HTTP ${r.status}`);
        return r.body;
      },
      storeAttachment: async ({ bytes, mime, sourceUrl }): Promise<string> => {
        const ext = (mime.split('/')[1] || 'bin').toLowerCase();
        const rawBase = (sourceUrl.split('/').pop() || 'image').split(/[?#]/)[0]
          .replace(/[^A-Za-z0-9._-]/g, '_') || 'image';
        const originalName = /\.[A-Za-z0-9]+$/.test(rawBase) ? rawBase : `${rawBase}.${ext}`;
        if (dryRun) return `/attachments/${encodeURIComponent(originalName)}`;
        const meta = await this.uploadAttachment(
          bytes,
          { originalName, mimeType: mime, size: bytes.length },
          ctx,
          { pageName, description: `NCM embedded image from ${sourceUrl}` }
        );
        return (meta.url as string) || `/attachments/${encodeURIComponent((meta.name as string) || originalName)}`;
      }
    };

    const r = await localizeNcmImages(content, { maxBytes, adDenyList, fetchTimeoutMs }, deps);
    return { content: r.content, warnings: r.warnings.map(w => `${w.kind}: ${w.detail}`) };
  }

  /**
   * Every attachment write goes through here (#1751): it writes, then bumps
   * the attachment-data version, so cached renders that list or show
   * attachments re-render.
   */
  private async writeAttachments<T>(write: Promise<T>): Promise<T> {
    const result = await write;
    await this.engine.getManager<{ bump(topic: string): Promise<string> }>('CacheManager')?.bump(ATTACHMENT_DATA_TOPIC);
    return result;
  }

  /**
   * Upload an attachment
   *
   * @param {Buffer} fileBuffer - File data
   * @param {FileInfo} fileInfo - { originalName, mimeType, size }
   * @param {UploadOptions} options - Upload options
   * @param {string} options.pageName - Page uploaded onto (optional). A private page forces the upload private, into its author's store (#1398)
   * @param {string} options.description - File description
   * @param {boolean} options.private - Private-store destination for an upload with no private page (#1396)
   * @param {string} options.store - Store id when private with no private page; else ConfigurationManager defaultstoreid
   * @param ctx - Who is uploading (#1179): the request's subject, or a JobContext for an in-engine caller. Mandatory and positional.
   * @returns {Promise<AttachmentMetadata>} Attachment metadata
   */
  async uploadAttachment(fileBuffer: Buffer, fileInfo: FileInfo, ctx: ActorContext, options: UploadOptions = {}): Promise<AttachmentMetadata> {
    if (!this.attachmentProvider) {
      throw new Error('Attachment provider not initialized');
    }

    // #1624: the type is what the bytes show, not what the browser declared.
    // The allow-list check and the served Content-Type both use this.
    fileInfo = { ...fileInfo, mimeType: resolveUploadMime(fileBuffer, fileInfo.mimeType) };

    // The uploader, from the context. A request subject built from a session
    // carries the account's fields; a JobContext carries a name only.
    const user = {
      name: ctx.username,
      email: (ctx as { email?: string }).email || undefined
    };

    // Destination (#1398): a new upload onto a private page is always private
    // and belongs to that page's author — the author owns the page and every
    // attachment uploaded onto it, whoever uploads. With no private page,
    // options.private === true → the uploader's store; otherwise the public pool.
    const pageName = options.pageName;
    let isPrivatePage = false;
    let pageCreator: string | undefined;
    let pageStore: string | undefined;
    const pageOwner = pageName
      ? await this.engine.getManager<PageManager>('PageManager')?.getPrivatePageOwner(pageName, ctx) ?? null
      : null;
    // A private container is its owner's: nobody else writes into it unless the
    // owner delegated. The decision is the page's own — PolicyInformationPoint Tier 0 via
    // the cross-page check — so the rule has one home and a refusal is recorded
    // (authorization-deny). Refused before any bytes are stored.
    if (pageOwner && pageName) {
      await this.assertMayEditPage(ctx, pageName);
    }
    // A share visitor has no container of their own to put a private file in.
    if (!pageOwner && options.private === true && ctx.viaShare) {
      throw new Error('Permission denied: a shared link cannot store private files');
    }
    // #1539: a private upload is asked with the vault it lands in (below); a
    // public one, site-wide.
    if (!(pageOwner || options.private === true) && !(await this.checkPermission('asset-upload', ctx))) {
      throw new Error('Permission denied: You do not have permission to upload attachments');
    }
    if (pageOwner || options.private === true) {
      const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
      if (!configManager) {
        throw new Error('AttachmentManager requires ConfigurationManager');
      }
      const layout = privateStoreLayoutFromConfig((key, fallback) =>
        configManager.getProperty(key, fallback)
      );
      isPrivatePage = true;
      pageCreator = pageOwner ? pageOwner.creator : ctx.username;
      pageStore = pageOwner ? pageOwner.store : (options.store ?? layout.defaultStoreId);
      if (!(await this.mayInVault(ctx, 'asset-upload', pageCreator, pageStore, 'upload'))) {
        throw new Error('Permission denied: You do not have permission to upload attachments');
      }

      // #1394: sealed-store writes need the session DEK. Not a PageManager field.
      const pagesDirectory = configManager.getResolvedDataPath?.(
        'ngdpbase.page.provider.filesystem.storagedir',
        './data/pages'
      );
      if (pagesDirectory) {
        await assertContextCanWriteStore(ctx, {
          pagesDirectory,
          owner: pageCreator,
          store: pageStore,
          layout
        });
        // #1460: ANY private store keeps its files itself — bytes named
        // {uuid}.ext in the store's `attachments/` folder, listed in the
        // store's own index, never in the global metadata. The condition is
        // "this page is in a private store", not "the store is sealed"
        // (#1400's gate): encryption decides whether the bytes are ciphertext
        // at rest, not whether the store owns its own catalogue.
        //
        // With a plain store there is no key, so nothing about reading it back
        // can lean on one: ownership alone decides, through
        // `mayActInPrivateContainer` / the PIP's container rule, exactly as
        // the page door decides a private page ({@link ownPrivateStores}).
        //
        // Duplicate detection is per store, so a private upload whose bytes
        // match a PUBLIC attachment lands here rather than returning the
        // public record.
        const io = await storeFileIO(ctx, { pagesDirectory, owner: pageCreator, store: pageStore, layout });
        const entry = await this.writeAttachments(this.attachmentProvider.storeFileInStore(
          { owner: pageCreator, store: pageStore, io },
          fileBuffer,
          {
            originalName: fileInfo.originalName,
            mimeType: fileInfo.mimeType,
            description: options.description || '',
            author: user.name,
            ...(pageName ? { pageName } : {})
          }
        ));
        // #1461: a private file is logged by id — never by its filename.
        logger.info(`📎 Uploaded a file into ${pageCreator}'s private store '${pageStore}' (${entry.id})`);
        await this.recordAttachmentEvent('upload', ctx, {
          attachmentId: entry.id,
          filename: fileInfo.originalName,
          pageName: pageName ?? null,
          sizeBytes: fileInfo.size ?? null
        }, options.wikiContext);
        return AttachmentManager.storeFileMetadata(entry, pageCreator, pageStore);
      }
    }

    // Create metadata (include privacy flags for provider). Destination is the
    // page store (#1386); ciphertext of those bytes is later.
    const metadata: AttachmentMetadataInput & {
      isPrivatePage?: boolean;
      pageCreator?: string;
      store?: string;
    } = {
      description: options.description || '',
      isFamilyFriendly: true,
      isPrivatePage,
      pageCreator,
      store: isPrivatePage ? pageStore : undefined
    };

    // Store attachment via provider
    const attachmentMetadata = await this.writeAttachments(this.attachmentProvider.storeAttachment(fileBuffer, fileInfo, metadata, user));

    logger.info(`📎 Uploaded attachment: ${fileInfo.originalName} (${attachmentMetadata.identifier})${isPrivatePage ? ` [private, creator: ${pageCreator ?? 'unknown'}, store: ${pageStore ?? ''}]` : ''}`);

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

  /** A file is added to a private page only by someone who may edit it: the page's own decision (#1398). */
  private async assertMayEditPage(ctx: ActorContext, pageName: string): Promise<void> {
    const acl = this.engine.getManager<{
      canUserAccessPage(subject: unknown, pageName: string, action: string): Promise<boolean>;
        }>('PolicyInformationPoint');
    const subject = isJobContext(ctx) ? toPermissionSubject(ctx) : ctx;
    if (!acl || !(await acl.canUserAccessPage(subject, pageName, 'edit'))) {
      throw new Error('Permission denied: you cannot upload to this page');
    }
  }

  /**
   * One vault as a provider location, opened through `ctx` (#1842). Throws as
   * `storeFileIO` does: a locked vault, or a sealed kind's vault not yet opened.
   */
  private async vaultLocation(ctx: ActorContext, owner: string, store: string): Promise<StoreFileLocation> {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const pagesDirectory = configManager?.getResolvedDataPath?.('ngdpbase.page.provider.filesystem.storagedir', './data/pages');
    if (!configManager || !pagesDirectory) throw new Error('AttachmentManager requires ConfigurationManager');
    const layout = privateStoreLayoutFromConfig((key, fallback) => configManager.getProperty(key, fallback));
    return { owner, store, io: await storeFileIO(ctx, { pagesDirectory, owner, store, layout }) };
  }

  /**
   * Attach an existing attachment to a page
   *
   * @param {string} attachmentId - Attachment identifier
   * @param {string} pageName - Page name to attach to
   * @param ctx - Whose mention this is (#1179). Mandatory and positional.
   * @returns {Promise<boolean>} Success status
   */
  async attachToPage(attachmentId: string, pageName: string, ctx: ActorContext): Promise<boolean> {
    if (!this.attachmentProvider) {
      throw new Error('Attachment provider not initialized');
    }

    // #1460: a file in one of the requester's own private stores is in no
    // shared index — its mentions are its own store index's, changed through
    // the context that owns the container.
    const own = await this.findOwnStoreFile(ctx, attachmentId, 'edit');
    if (own) {
      return await this.writeAttachments(this.attachmentProvider.setFileMentionInStore(own.location, attachmentId, pageName, true));
    }

    const metadata = await this.attachmentProvider.getAttachmentMetadata(attachmentId);
    if (!metadata) {
      throw new Error(`Attachment not found: ${attachmentId}`);
    }

    // #1842: every file a vault page uses is in that vault. A shared-pool file
    // attached to one is copied in — sealed when the vault is — under the same
    // id; the shared record is not told about the vault page, and the public
    // copy stays for the pages that use it.
    if (parsePrivatePageName(pageName)) {
      const where = await this.engine.getManager<PageManager>('PageManager')?.getPrivatePageOwner(pageName, ctx) ?? null;
      if (!where) throw new Error('Page not found');
      await this.assertMayEditPage(ctx, pageName);
      if (!(await this.mayInVault(ctx, 'asset-upload', where.creator, where.store, attachmentId))) {
        throw new Error('Permission denied: You do not have permission to upload attachments');
      }
      const location = await this.vaultLocation(ctx, where.creator, where.store);
      const copied = await this.writeAttachments(this.attachmentProvider.copyRecordIntoStore(location, attachmentId, pageName));
      if (!copied) throw new Error(`Attachment not found: ${attachmentId}`);
      logger.info(`📎 Copied a shared file into ${where.creator}'s vault '${where.store}' for one of its pages (${attachmentId})`);
      return true;
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

    await this.writeAttachments(this.attachmentProvider.updateAttachmentMetadata(attachmentId, { mentions }));

    logger.info(`📎 Attached ${attachmentId} to page ${pageName}`);
    return true;
  }

  /**
   * Detach an attachment from a page
   *
   * @param {string} attachmentId - Attachment identifier
   * @param {string} pageName - Page name to detach from
   * @param ctx - Whose mention this is (#1179). Mandatory and positional.
   * @returns {Promise<boolean>} Success status
   */
  async detachFromPage(attachmentId: string, pageName: string, ctx: ActorContext): Promise<boolean> {
    if (!this.attachmentProvider) {
      throw new Error('Attachment provider not initialized');
    }

    // #1460: as in attachToPage — a private store's file keeps its own mentions.
    const own = await this.findOwnStoreFile(ctx, attachmentId, 'edit');
    if (own) {
      return await this.writeAttachments(this.attachmentProvider.setFileMentionInStore(own.location, attachmentId, pageName, false));
    }

    const metadata = await this.attachmentProvider.getAttachmentMetadata(attachmentId);
    if (!metadata) {
      throw new Error(`Attachment not found: ${attachmentId}`);
    }

    // Remove page from mentions
    const mentions = (metadata.mentions || []).filter((m) => m.name !== pageName);
    await this.writeAttachments(this.attachmentProvider.updateAttachmentMetadata(attachmentId, { mentions }));

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

  // ── Files in a private store (#1400, every store since #1460) ─────────────
  //
  // A private file is reached only through the context whose container it is
  // in: the requester's own stores. The decision is the PIP's
  // (canAccessPrivateContainer — owner or delegate, never a role, admin
  // included), and a refusal is recorded there.
  //
  // What encryption does, and what it does not: an encrypted store's bytes and
  // index are ciphertext until its DEK is in the session, so a locked one
  // contributes nothing here. An UNENCRYPTED store has no key at all — its
  // bytes sit readable on disk — so nothing may serve them on the strength of
  // "the file exists". Ownership is the whole of the decision, and it is
  // applied below before a store is opened and again at the PIP before a byte
  // is handed back.

  /**
   * The requester's own private stores, as provider locations (#1460).
   *
   * The container rule first: a context that may not act in its own container
   * — anonymous, or a share visitor, whose `viaShare` issuer is someone else
   * — reaches no store at all. Then every store in that container, plain or
   * sealed: `privateStoreIdsOf` answers from the folder, because which stores
   * EXIST does not depend on keys. `storeFileIO` refuses an encrypted store
   * this context holds no DEK for, and that store is skipped rather than read
   * in the clear.
   */
  private async ownPrivateStores(ctx: ActorContext): Promise<StoreFileLocation[]> {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const pagesDirectory = configManager?.getResolvedDataPath?.('ngdpbase.page.provider.filesystem.storagedir', './data/pages');
    if (!configManager || !pagesDirectory || !ctx?.username) return [];
    if (!mayActInPrivateContainer(ctx, ctx.username)) return [];
    const layout = privateStoreLayoutFromConfig((key, fallback) => configManager.getProperty(key, fallback));
    const out: StoreFileLocation[] = [];
    for (const store of await privateStoreIdsOf(pagesDirectory, ctx.username, layout)) {
      try {
        const io = await storeFileIO(ctx, { pagesDirectory, owner: ctx.username, store, layout });
        out.push({ owner: ctx.username, store, io });
      } catch {
        // An encrypted store whose DEK this context does not hold: locked, so
        // it lists nothing. Never a fall back to reading it in the clear.
      }
    }
    return out;
  }

  private mayReach(ctx: ActorContext, owner: string, resource: string, action: string): boolean {
    const pip = this.engine.getManager<{
      canAccessPrivateContainer(subject: unknown, owner: string, resource: string, action: string): boolean;
        }>('PolicyInformationPoint');
    return Boolean(pip?.canAccessPrivateContainer(ctx, owner, resource, action));
  }

  /**
   * How a store file is shown to callers that expect attachment metadata.
   * The legacy aliases (`id`, `filename`, `mimeType`, `size`, …) are here so a
   * merged list renders through the same templates the shared pool does
   * (#1460); `filePath` is not, because where a private file sits on disk is
   * not something a listing carries.
   */
  private static storeFileMetadata(entry: StoreFileEntry, owner: string, store: string): AttachmentMetadata {
    return {
      identifier: entry.id,
      id: entry.id,
      name: entry.name,
      filename: entry.name,
      url: `/attachments/${entry.id}`,
      encodingFormat: entry.encodingFormat,
      mimeType: entry.encodingFormat,
      contentSize: entry.contentSize,
      size: entry.contentSize,
      description: entry.description,
      dateCreated: entry.dateCreated,
      dateModified: entry.dateModified,
      uploadedAt: entry.dateCreated,
      uploadedBy: entry.author ?? UNKNOWN_UPLOADER,
      pageUuid: entry.mentions[0] ?? '',
      mentions: entry.mentions.map((name) => ({ '@type': 'WebPage', name, url: `/view/${encodeURIComponent(name)}` })),
      isPrivate: true,
      creator: owner,
      store
    };
  }

  /**
   * The requester's own store that lists `attachmentId`, with its entry — or
   * null when none of them does, or the PIP refuses (#1460). Metadata only:
   * the bytes are read by the caller that needs them, so a listing, a delete
   * and a mention change do not decrypt a file to look at its name.
   */
  private async findOwnStoreFile(
    ctx: ActorContext,
    attachmentId: string,
    action: StoreFileAction
  ): Promise<{ location: StoreFileLocation; entry: StoreFileEntry } | null> {
    const found = await this.locateOwnStoreFile(ctx, attachmentId, action);
    if (!found) return null;
    return (await this.mayInVault(ctx, STORE_FILE_PERMISSION[action], found.location.owner, found.location.store, attachmentId)) ? found : null;
  }

  /**
   * May `ctx` do `permission` to `what` in `owner`'s vault `store` (#1539)?
   * The container rule, then the capability asked with the vault, so
   * `vault-owner` decides — the same rule as a vault page.
   */
  private mayInVault(ctx: ActorContext, permission: string, owner: string, store: string, what: string): Promise<boolean> {
    return permitsInVault(this.engine.getManager<VaultDecider>('PolicyDecisionPoint'), ctx, permission,
      { owner, vault: store, resource: formatPrivatePageName(owner, store, `attachment:${what}`) });
  }

  /** The requester's own store file and its entry, before the capability is asked — see {@link findOwnStoreFile}. */
  private async locateOwnStoreFile(
    ctx: ActorContext,
    attachmentId: string,
    action: StoreFileAction
  ): Promise<{ location: StoreFileLocation; entry: StoreFileEntry } | null> {
    if (!this.attachmentProvider) return null;
    for (const location of await this.ownPrivateStores(ctx)) {
      const entry = (await this.attachmentProvider.listFilesInStore(location)).find((f) => f.id === attachmentId);
      if (!entry) continue;
      if (!this.mayReach(ctx, location.owner, `attachment:${attachmentId}`, action)) return null;
      return { location, entry };
    }
    return null;
  }

  /**
   * A file from the requester's own private stores — or null when none of the
   * stores it can open lists it, or the PIP refuses. An encrypted store's
   * bytes come back decrypted; a plain store's come back as they are, and in
   * both cases the caller got here only by owning the container.
   */
  async getPrivateStoreAttachment(
    attachmentId: string,
    ctx: ActorContext
  ): Promise<{ buffer: Buffer; metadata: AttachmentMetadata } | null> {
    if (!this.attachmentProvider) {
      throw new Error('Attachment provider not initialized');
    }
    const found = await this.findOwnStoreFile(ctx, attachmentId, 'view');
    if (!found) return null;
    const bytes = await this.attachmentProvider.getFileInStore(found.location, attachmentId);
    if (!bytes) return null;
    return {
      buffer: bytes.bytes,
      metadata: AttachmentManager.storeFileMetadata(found.entry, found.location.owner, found.location.store)
    };
  }

  /**
   * A file served through a vault link (#1388): from the one vault the link
   * names, and only when a current page the link covers uses it. A file no
   * covered page uses — including a copy nobody uses any more (#1517) — is
   * not shared. `ctx` is the link's subject; the container rule and the share
   * ceiling decide as for every other door.
   */
  async getVaultShareAttachment(
    attachmentId: string,
    ctx: ActorContext
  ): Promise<{ buffer: Buffer; metadata: AttachmentMetadata } | null> {
    const grant = ctx?.viaShare;
    const target = grant ? vaultOfShare(grant.resources) : null;
    if (!this.attachmentProvider || !grant || !target) return null;
    const { owner, vault } = target;
    if (!this.mayReachVault(ctx, owner, vault, `attachment:${attachmentId}`)) return null;
    const pdp = this.engine.getManager<{ ceiling(s: unknown, r: { action: string }): Promise<{ permit: boolean } | null> }>('PolicyDecisionPoint');
    if (!(await pdp?.ceiling(ctx, { action: 'asset-read' }))?.permit) return null;

    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const pagesDirectory = configManager?.getResolvedDataPath?.('ngdpbase.page.provider.filesystem.storagedir', './data/pages');
    if (!configManager || !pagesDirectory) return null;
    const layout = privateStoreLayoutFromConfig((key, fallback) => configManager.getProperty(key, fallback));
    let location: StoreFileLocation;
    try {
      location = { owner, store: vault, io: await storeFileIO(ctx, { pagesDirectory, owner, store: vault, layout }) };
    } catch {
      // An encrypted vault: a link carries no key yet (#1388's encrypted slices).
      return null;
    }
    const entry = (await this.attachmentProvider.listFilesInStore(location)).find((f) => f.id === attachmentId);
    if (!entry) return null;

    const pageManager = this.engine.getManager<{ getPageMetadata(name: string, c: ActorContext): Promise<{ uuid?: string } | null> }>('PageManager');
    let covered = false;
    for (const mention of entry.mentions) {
      const page = parsePrivatePageName(mention);
      if (!page || page.owner !== owner || page.store !== vault) continue;
      const meta = await pageManager?.getPageMetadata(mention, ctx).catch(() => null);
      if (meta?.uuid && shareCoversVaultPage(grant.resources, owner, vault, meta.uuid)) { covered = true; break; }
    }
    if (!covered) return null;

    const bytes = await this.attachmentProvider.getFileInStore(location, attachmentId);
    if (!bytes) return null;
    return { buffer: bytes.bytes, metadata: AttachmentManager.storeFileMetadata(entry, owner, vault) };
  }

  /** The container rule for one vault, as the link's subject may enter it (#1388). */
  private mayReachVault(ctx: ActorContext, owner: string, vault: string, resource: string): boolean {
    const pip = this.engine.getManager<{
      canAccessPrivateContainer(subject: unknown, owner: string, resource: string, action: string, vault?: string): boolean;
        }>('PolicyInformationPoint');
    return Boolean(pip?.canAccessPrivateContainer(ctx, owner, resource, 'view', vault));
  }

  /**
   * The files in the requester's own vaults that no page in that vault uses
   * (#1517) — for their profile page, so a copy kept for a page that left the vault,
   * or a file whose page was deleted, can be seen and removed.
   *
   * Only the requester's own vaults, through the container rule. "Used" is a
   * current page of that vault in the file's mentions, which every save keeps
   * in step. An encrypted vault this session cannot open is reported as
   * locked rather than as empty.
   *
   * @returns One entry per vault with unused files, or locked; `canDelete` is
   *   whether this context may delete files there — the delete's own question
   *   (#1539), so the page offers the button exactly when the delete would work
   */
  async listOwnUnusedVaultFiles(ctx: ActorContext): Promise<Array<{
    vault: string;
    locked: boolean;
    canDelete: boolean;
    files: Array<{ id: string; name: string; contentSize: number; dateCreated: string }>;
  }>> {
    const owner = ctx?.username;
    if (!this.attachmentProvider || !owner || !mayActInPrivateContainer(ctx, owner)) return [];
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const pagesDirectory = configManager?.getResolvedDataPath?.('ngdpbase.page.provider.filesystem.storagedir', './data/pages');
    if (!configManager || !pagesDirectory) return [];
    const layout = privateStoreLayoutFromConfig((key, fallback) => configManager.getProperty(key, fallback));
    const pageManager = this.engine.getManager<{ listVaultPages(c: ActorContext, o: string, v: string): Promise<Array<{ name: string }>> }>('PageManager');

    const out: Array<{ vault: string; locked: boolean; canDelete: boolean; files: Array<{ id: string; name: string; contentSize: number; dateCreated: string }> }> = [];
    for (const vault of await privateStoreIdsOf(pagesDirectory, owner, layout)) {
      let io: StoreFileLocation['io'];
      try {
        io = await storeFileIO(ctx, { pagesDirectory, owner, store: vault, layout });
      } catch {
        out.push({ vault, locked: true, canDelete: false, files: [] });
        continue;
      }
      const pages = new Set((pageManager ? await pageManager.listVaultPages(ctx, owner, vault) : []).map((p) => p.name));
      const unused = (await this.attachmentProvider.listFilesInStore({ owner, store: vault, io }))
        .filter((f) => !f.mentions.some((m) => pages.has(m)))
        .map((f) => ({ id: f.id, name: f.name, contentSize: f.contentSize, dateCreated: f.dateCreated }))
        .sort((a, b) => b.contentSize - a.contentSize);
      if (unused.length > 0) {
        out.push({ vault, locked: false, canDelete: await this.mayInVault(ctx, 'asset-delete', owner, vault, 'unused'), files: unused });
      }
    }
    return out;
  }

  /**
   * Is `attachmentId` a file in one of the requester's own private stores?
   * An index read, no bytes — for a caller that has to treat a private file
   * differently without reading it twice (#1460).
   */
  async isOwnPrivateStoreFile(attachmentId: string, ctx: ActorContext): Promise<boolean> {
    return (await this.findOwnStoreFile(ctx, attachmentId, 'view')) !== null;
  }

  /** The requester's own private-store files uploaded onto `pageName`. */
  async getPrivateStoreAttachmentsForPage(pageName: string, ctx: ActorContext): Promise<AttachmentMetadata[]> {
    if (!this.attachmentProvider) return [];
    const out: AttachmentMetadata[] = [];
    for (const location of await this.ownPrivateStores(ctx)) {
      if (!this.mayReach(ctx, location.owner, `page-files:${pageName}`, 'view')) continue;
      for (const entry of await this.attachmentProvider.filesInStoreForPage(location, pageName)) {
        out.push(AttachmentManager.storeFileMetadata(entry, location.owner, location.store));
      }
    }
    return out;
  }

  /**
   * Everything the requester's own private stores hold (#1460) — the half of
   * a browse or a list that is in no shared index. Another user's stores, and
   * an admin's view of anyone's, are not here: this reads `ctx`'s container
   * and no other.
   */
  async getPrivateStoreAttachments(ctx: ActorContext): Promise<AttachmentMetadata[]> {
    if (!this.attachmentProvider) return [];
    const out: AttachmentMetadata[] = [];
    for (const location of await this.ownPrivateStores(ctx)) {
      if (!this.mayReach(ctx, location.owner, `store-files:${location.store}`, 'view')) continue;
      for (const entry of await this.attachmentProvider.listFilesInStore(location)) {
        out.push(AttachmentManager.storeFileMetadata(entry, location.owner, location.store));
      }
    }
    return out;
  }

  /**
   * The requester's own private-store files as asset-search results (#1460).
   *
   * AssetManager fans a search out over the provider registry, and no provider
   * can see a store it was given no context for — so the store half is merged
   * by the one caller that holds the requester's context. The matching rules
   * are the provider's own, applied to the store's entries, so a private file
   * is findable exactly as a public one is.
   */
  async searchPrivateStoreAttachments(query: AssetQuery, ctx: ActorContext): Promise<AssetRecord[]> {
    return (await this.readableVaultAssetRecords(ctx, query)).flatMap((v) => v.files);
  }

  /**
   * {@link searchPrivateStoreAttachments}, kept apart by vault (#1852): the
   * files layer needs to say which vault each file is in. The same stores,
   * the same container rule, the same matching.
   */
  async readableVaultAssetRecords(
    ctx: ActorContext,
    query: AssetQuery = {}
  ): Promise<Array<{ owner: string; vault: string; files: AssetRecord[] }>> {
    if (!this.attachmentProvider) return [];
    const out: Array<{ owner: string; vault: string; files: AssetRecord[] }> = [];
    for (const location of await this.ownPrivateStores(ctx)) {
      if (!this.mayReach(ctx, location.owner, `store-files:${location.store}`, 'view')) continue;
      out.push({ owner: location.owner, vault: location.store, files: await this.attachmentProvider.searchFilesInStore(location, query) });
    }
    return out;
  }

  /**
   * The shared pool as asset records (#1852), every one of them: the
   * provider's own mapping, so the files layer and asset search show a
   * public file the same way. Whether the requester may read the pool is the
   * caller's question (`asset-read`).
   */
  async sharedPoolAssetRecords(): Promise<AssetRecord[]> {
    const provider = this.attachmentProvider as unknown as Partial<AssetProvider> | null;
    if (!provider || typeof provider.search !== 'function') return [];
    return (await provider.search({ pageSize: Number.MAX_SAFE_INTEGER })).results;
  }

  /**
   * Every vault's files, for an operator inventory with no viewer (#1852,
   * the files migration dry run), the way {@link findVaultPagesUsingPoolFiles}
   * walks them: an unsealed vault's index entries; for any other vault
   * (sealed, or not yet opened) only the files on disk and their size, since
   * its index can't be read without its owner's key. Reads only. The entries
   * are for the files layer to count; they are never shown.
   */
  async vaultFileInventory(): Promise<Array<{
    owner: string;
    vault: string;
    /** Whether its index could be read: an unsealed vault. */
    readable: boolean;
    entries: StoreFileEntry[] | null;
    filesOnDisk: number;
    bytesOnDisk: number;
  }>> {
    const provider = this.attachmentProvider;
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const pagesDirectory = configManager?.getResolvedDataPath?.('ngdpbase.page.provider.filesystem.storagedir', './data/pages');
    if (!provider || !configManager || !pagesDirectory) return [];
    const layout = privateStoreLayoutFromConfig((key, fallback) => configManager.getProperty(key, fallback));
    const out: Array<{ owner: string; vault: string; readable: boolean; entries: StoreFileEntry[] | null; filesOnDisk: number; bytesOnDisk: number }> = [];
    for (const owner of await listPrivateOwners(pagesDirectory, layout)) {
      for (const vault of await privateStoreIdsOf(pagesDirectory, owner, layout)) {
        const dir = privateStoreAttachmentsDir(pagesDirectory, owner, vault, layout);
        let filesOnDisk = 0;
        let bytesOnDisk = 0;
        for (const d of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
          if (!d.isFile()) continue;
          filesOnDisk++;
          bytesOnDisk += (await fs.stat(path.join(dir, d.name))).size;
        }
        const plain = (await readVaultSealState(pagesDirectory, owner, vault, layout).catch(() => null))?.state === 'plain';
        const entries = plain ? await provider.listFilesInStore({ owner, store: vault, io: PLAIN_FILE_IO }).catch(() => null) : null;
        if ((entries?.length ?? 0) === 0 && filesOnDisk === 0) continue;
        out.push({ owner, vault, readable: entries !== null, entries, filesOnDisk, bytesOnDisk });
      }
    }
    return out;
  }

  // ── The move out of the shared index (#1460) ──────────────────────────────

  /**
   * Move every unencrypted private file record out of the global
   * `attachment-metadata.json` and into its store's own index, at start-up.
   *
   * Best-effort: a failure is logged and never blocks start-up, the shape
   * `migratePrivateLinksAtBoot` uses.
   */
  async migratePrivateFilesAtBoot(): Promise<void> {
    const ctx = systemContext(
      this.engine,
      'private-file migration at boot (#1460) — move unencrypted private files out of attachment-metadata.json into their store'
    );
    try {
      await this.migratePrivateFilesIntoStores(ctx);
    } catch (err) {
      logger.warn(`📎 Private-file migration at boot did not complete: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Move the private file records still in the shared index into their stores.
   *
   * __Which files are private__ is decided from the record itself first — the
   * `isPrivate` / `creator` / `store` fields #1398 writes — and, where that is
   * not enough, from the page it is attached to: a mention naming
   * `private/{owner}/{store}/{title}` says whose store the file belongs in,
   * confirmed through `PageManager.getPrivatePageOwner`. A record that is
   * neither is a public attachment and stays where it is.
   *
   * __What moves__: the bytes, into `{store}/attachments/`, KEEPING their
   * existing file name — nothing on disk is renamed — and the record, into
   * the store's own index under the id it already had, because that id is its
   * `/attachments/{id}` URL on every page that references it.
   *
   * __No unlock split__, unlike #1457's link migration and #1458's search
   * indexes. Those needed one because a page's TEXT is sealed; here an
   * unencrypted store needs no key at all, so this boot job finishes the whole
   * job for the stores it is about. A record pointing at an ENCRYPTED store is
   * skipped, with a line saying so: #1400 already keeps those files in their
   * store, and one predating it cannot be re-sealed without its owner's DEK.
   *
   * __Idempotent__: a second run finds nothing left in the shared index, and a
   * record whose store already lists the id moves no bytes.
   *
   * @param ctx - Whose reading and writing this is (#1179). Mandatory and positional.
   * @returns how many records moved
   */
  async migratePrivateFilesIntoStores(ctx: ActorContext): Promise<number> {
    if (!this.attachmentProvider) return 0;
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const pagesDirectory = configManager?.getResolvedDataPath?.('ngdpbase.page.provider.filesystem.storagedir', './data/pages');
    if (!configManager || !pagesDirectory) return 0;
    const layout = privateStoreLayoutFromConfig((key, fallback) => configManager.getProperty(key, fallback));
    const pageManager = this.engine.getManager<PageManager>('PageManager');

    let moved = 0;
    for (const record of this.attachmentProvider.privateRecordsInSharedIndex()) {
      let owner = record.owner;
      let store = record.store;

      if (!owner) {
        for (const page of record.pages) {
          const where = await pageManager?.getPrivatePageOwner(page, ctx).catch(() => null);
          if (where) { owner = where.creator; store = where.store; break; }
        }
      }
      if (!owner) continue;
      const storeId = store ?? layout.defaultStoreId;

      try {
        const io = await storeFileIO(ctx, { pagesDirectory, owner, store: storeId, layout });
        if (io.sealed) {
          // #1461: the store is named, the file only by id.
          logger.info(`📎 Leaving a private file in place: ${owner}'s store '${storeId}' is encrypted and this job holds no key (${record.id})`);
          continue;
        }
        if (await this.writeAttachments(this.attachmentProvider.adoptRecordIntoStore({ owner, store: storeId, io }, record.id))) moved++;
      } catch (err) {
        logger.warn(`📎 Could not move a private file into ${owner}'s store '${storeId}' (${record.id}): ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (moved > 0) {
      logger.info(`📎 Private files: moved ${moved} record(s) out of the shared attachment index into their own store (#1460)`);
    }
    return moved;
  }

  // ── A page's files follow the page (#1842) ────────────────────────────────

  /**
   * Move the files a page uses when the page changes place — into a vault, out
   * of one, or between two — so that every file a vault page uses is in that
   * vault (operator, 2026-10-16). Called by the page door after the page moved.
   *
   * __Which files__: those whose mentions name the page where it was, and
   * those its content references (`[{Image src='…'}]`, `[{ATTACH src='…'}]`,
   * `/attachments/{id}`), resolved in the vault it left first, then the shared
   * pool.
   *
   * __How__: each file is copied to the destination under the same id (its
   * `/attachments/{id}` URL in the page), through both sides' store I/O —
   * sealed going into a sealed vault, opened coming out. Then the source: a
   * file no other page there uses is removed; one another page still uses is
   * left for it, without this page's mention. A shared-pool file is removed
   * from the pool only when no public page that exists now is among its
   * mentions ({@link poolFileShare}): a file other public pages use is copied
   * in, never taken from them, and a stale mention (a page renamed, made
   * private or deleted, often this page's own former title) keeps nothing.
   *
   * __Refusal__: both sides' I/O is resolved before any file moves, so a locked
   * vault, or a sealed kind's vault not yet opened, moves nothing — the same
   * refusal the page's own save meets first.
   *
   * @param previousName - The page's name before: a public title, or `vaults/{owner}/{store}/{title}`
   * @param name - Its name now
   * @param content - Its content
   * @param ctx - Whose move this is (#1179): the page door already let it move the page
   * @returns how many files moved or were copied
   */
  async movePageAttachments(previousName: string, name: string, content: string, ctx: ActorContext): Promise<number> {
    const provider = this.attachmentProvider;
    if (!provider) return 0;
    const fromVault = parsePrivatePageName(previousName);
    const toVault = parsePrivatePageName(name);
    const sameVault = fromVault && toVault && fromVault.owner === toVault.owner && fromVault.store === toVault.store;
    if ((!fromVault && !toVault) || sameVault) return 0;

    const from = fromVault ? await this.vaultLocation(ctx, fromVault.owner, fromVault.store) : null;
    const to = toVault ? await this.vaultLocation(ctx, toVault.owner, toVault.store) : null;

    const { refNames, refIds } = AttachmentManager.contentRefs(content);

    // The vault it left: files this page is named by, or that its content references.
    const vaultFiles = from
      ? (await provider.listFilesInStore(from)).filter((f) =>
        f.mentions.includes(previousName) || refIds.has(f.id) || refNames.has(f.name))
      : [];
    const taken = new Set(vaultFiles.map((f) => f.id));
    const inVaultByName = new Set(vaultFiles.map((f) => f.name));

    // The shared pool: records naming the page, and references the vault did not answer.
    const poolIds = await this.poolFilesOfPage(provider, previousName, content, { ids: new Set(), names: inVaultByName });
    const self: PoolFileSelf = { names: [previousName, name], uuid: this.pageUuidOf(name, ctx) };
    const heldThere = new Set(to ? (await provider.listFilesInStore(to)).map((f) => f.id) : []);

    let moved = 0;
    await this.writeAttachments((async () => {
      for (const file of vaultFiles) {
        if (!from) break;
        const copied = to
          ? await provider.copyStoreFileToStore(from, to, file.id, name)
          : await provider.copyStoreFileToPool(from, file.id, name);
        if (!copied) continue;
        const others = file.mentions.filter((m) => m !== previousName);
        if (others.length > 0) await provider.setFileMentionInStore(from, file.id, previousName, false);
        else await provider.deleteFileInStore(from, file.id);
        moved++;
      }

      for (const id of poolIds) {
        if (taken.has(id)) continue;
        if (!to) {
          // Out to the public space: the pool copy is the page's now. Only the
          // vault name (and stale names) leave the shared record; the save adds the public one.
          const share = await this.poolFileShare(provider, id, self);
          if (share && share.keep.length !== share.mentionNames.length) await provider.setPoolMentions(id, share.keep);
          continue;
        }
        if (await this.takePoolFileIntoVault(provider, to, id, self, name, heldThere.has(id))) moved++;
      }
    })());

    if (moved > 0) {
      // #1461: a vault is named, never a page title or a file name.
      const place = (v: typeof fromVault): string => (v ? `${v.owner}'s vault '${v.store}'` : 'the shared pool');
      logger.info(`📎 Moved ${moved} file(s) with their page from ${place(fromVault)} to ${place(toVault)} (#1842)`);
    }
    return moved;
  }

  /** The file names (with their basenames) and `/attachments/{id}` ids `content` references. */
  private static contentRefs(content: string): { refNames: Set<string>; refIds: Set<string> } {
    const names = AttachmentManager.extractLocalAttachmentRefs(content);
    return {
      refNames: new Set([...names, ...[...names].map((n) => AttachmentManager.basenameOf(n))]),
      refIds: new Set([...content.matchAll(/\/attachments\/([A-Za-z0-9-]+)/g)].map((m) => m[1]))
    };
  }

  /**
   * The shared-pool files page `pageName` uses: records whose mentions name it,
   * and those `content` references that `held` (a vault's own files) does not
   * answer.
   */
  private async poolFilesOfPage(
    provider: BaseAttachmentProvider,
    pageName: string,
    content: string,
    held: { ids: Set<string>; names: Set<string> }
  ): Promise<Set<string>> {
    const { refNames, refIds } = AttachmentManager.contentRefs(content);
    const poolIds = new Set<string>();
    for (const a of await provider.getAttachmentsForPage(pageName)) {
      // The provider also matches a page whose URL merely contains the name.
      const record = await provider.getAttachmentMetadata(a.identifier);
      if ((record?.mentions ?? []).some((m) => m.name === pageName)) poolIds.add(a.identifier);
    }
    for (const ref of refNames) {
      if (held.names.has(ref)) continue;
      const hit = await provider.getAttachmentByFilename(ref);
      if (hit?.identifier) poolIds.add(hit.identifier);
    }
    for (const id of refIds) {
      if (await provider.attachmentExists(id)) poolIds.add(id);
    }
    for (const id of held.ids) poolIds.delete(id);
    return poolIds;
  }

  /**
   * Who else uses shared-pool file `id`, besides the page itself — known by
   * `self.names` (its name now, and before a move) and `self.uuid` (#1842).
   *
   * Each mention is one of:
   *
   * - __the page itself__: dropped from the record
   * - __a public page that exists now__ (asked of PageManager by exact title,
   *   slug or uuid, never by role): a sharer, for which the pool copy is kept
   * - __another vault page__: kept until that page's own repair takes the
   *   file (the startup check names that vault meanwhile), so its bytes are
   *   never removed from under it
   * - __stale__, a public name no page has any more (renamed, made private,
   *   deleted; often this page's own former public title): dropped, and it
   *   keeps nothing
   *
   * `alone` is true when the mentions name no one but the page and stale
   * names: the pool copy should go. A record with no mentions at all, which
   * only content references, is never `alone`, so it is never taken from a
   * page whose mention was never recorded.
   */
  private async poolFileShare(
    provider: BaseAttachmentProvider,
    id: string,
    self: PoolFileSelf
  ): Promise<{ mentionNames: string[]; keep: string[]; alone: boolean } | null> {
    const record = await provider.getAttachmentMetadata(id);
    if (!record) return null;
    const mentionNames = (record.mentions ?? []).map((m) => m.name ?? '').filter(Boolean);
    const keep: string[] = [];
    for (const m of mentionNames) {
      if (self.names.includes(m) || (self.uuid !== null && m === self.uuid)) continue;
      if (parsePrivatePageName(m) || await this.isLivePublicPage(m, self.uuid)) keep.push(m);
    }
    return { mentionNames, keep, alone: mentionNames.length > 0 && keep.length === 0 };
  }

  /**
   * Is `name` a public page that exists now, other than page `selfUuid`
   * (#1842)? By exact title (any case), slug or uuid: a fuzzy match is not
   * that page. Without a PageManager nothing can be told, so every name counts.
   */
  private async isLivePublicPage(name: string, selfUuid: string | null): Promise<boolean> {
    const pageManager = this.engine.getManager<PageManager>('PageManager');
    if (!pageManager) return true;
    if (parsePrivatePageName(name)) return false;
    let meta: Awaited<ReturnType<PageManager['getPageMetadata']>>;
    try {
      meta = await pageManager.getPageMetadata(name, ANONYMOUS_SUBJECT);
    } catch {
      // Pages not readable yet (no provider): can't tell, so it counts.
      return true;
    }
    if (!meta) return false;
    const lower = name.toLowerCase();
    const same = String(meta.title ?? '').toLowerCase() === lower || meta.uuid === name ||
      (typeof meta.slug === 'string' && meta.slug.toLowerCase() === lower);
    return same && (selfUuid === null || meta.uuid !== selfUuid);
  }

  /** The uuid of page `name` as `ctx` finds it; null when it can't be told. */
  private pageUuidOf(name: string, ctx: ActorContext): string | null {
    try {
      return this.engine.getManager<PageManager>('PageManager')?.getPageUUID(name, ctx) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * What taking shared-pool file `id` into a vault does (#1842): 'moved', the
   * pool copy goes; 'copied', copied in with the pool copy left for its
   * sharers; null, nothing, because the vault already holds it and public
   * pages still use the pool copy.
   */
  private static poolPlan(share: { alone: boolean }, held: boolean): 'moved' | 'copied' | null {
    if (share.alone) return 'moved';
    return held ? null : 'copied';
  }

  /**
   * Take shared-pool file `id` into vault `to` for page `name`, under the same
   * id, through the vault's I/O; then the pool copy: removed (record, bytes,
   * thumbnails) when no public page uses it, otherwise left for those that do,
   * without this page's mention or stale ones. Copy first, so a failure leaves
   * two copies, never none. A vault that already holds the id (`held`: an
   * earlier repair copied it) just gains the mention, so running the repair
   * again removes a pool copy left behind.
   *
   * @returns 'moved' (no pool copy left), 'copied' (left for other pages), or null when nothing was copied
   */
  private async takePoolFileIntoVault(
    provider: BaseAttachmentProvider,
    to: StoreFileLocation,
    id: string,
    self: PoolFileSelf,
    name: string,
    held: boolean
  ): Promise<'moved' | 'copied' | null> {
    const share = await this.poolFileShare(provider, id, self);
    if (!share) return null;
    if (!(await provider.copyRecordIntoStore(to, id, name))) return null;
    const plan = AttachmentManager.poolPlan(share, held);
    if (plan === 'moved') {
      await provider.removeRecordFromPool(id);
      return 'moved';
    }
    if (share.keep.length !== share.mentionNames.length) await provider.setPoolMentions(id, share.keep);
    return plan;
  }

  /**
   * Bring the shared-pool files vault page `name` still uses into its vault
   * (#1842's repair, for files a move before #1842 left in the pool): the
   * files its mentions name and those `content` references that the vault
   * doesn't hold, each by {@link movePageAttachments}'s rule — copied in under
   * the same id, sealed when the vault is, and removed from the pool only
   * when no public page that exists now uses it ({@link poolFileShare}).
   * A file the vault already holds under the same id whose pool copy no
   * public page uses loses that copy too, so running the repair again on a
   * page whose files were copied in removes what was left behind.
   *
   * The vault's I/O is resolved first, so a locked vault, or a sealed kind's
   * vault not yet opened, throws and nothing moves. Who may ask is the
   * caller's (`PageManager.repairVaultPage`) to decide.
   *
   * @param name - The page's vault name, `vaults/{owner}/{store}/{title}`
   * @param content - Its content; '' when only its mentions are to be followed
   * @param ctx - Whose I/O this is: the owner's session for a sealed vault
   * @param opts.dryRun - Count what would happen, and change nothing
   * @returns how many files were (or would be) moved out of the pool, and copied with a pool copy left for other pages
   */
  async movePoolFilesIntoVault(
    name: string,
    content: string,
    ctx: ActorContext,
    opts: { dryRun?: boolean } = {}
  ): Promise<{ moved: number; copied: number }> {
    const provider = this.attachmentProvider;
    const vault = parsePrivatePageName(name);
    if (!provider || !vault) return { moved: 0, copied: 0 };
    const { to, self, files } = await this.vaultPagePoolIds(provider, name, content, ctx);
    const counts = { moved: 0, copied: 0 };
    if (opts.dryRun) {
      for (const f of files) counts[f.plan]++;
      return counts;
    }
    await this.writeAttachments((async () => {
      for (const f of files) {
        const took = await this.takePoolFileIntoVault(provider, to, f.id, self, name, f.held);
        if (took) counts[took]++;
      }
    })());
    if (counts.moved + counts.copied > 0) {
      // #1461: a vault is named, never a page title or a file name.
      logger.info(`📎 Repair: ${counts.moved} file(s) moved and ${counts.copied} copied from the shared pool into ${vault.owner}'s vault '${vault.store}' (#1842)`);
    }
    return counts;
  }

  /**
   * The shared-pool files {@link movePoolFilesIntoVault} would bring into
   * vault page `name`'s vault, by id with their file name and the URL that
   * serves them today (#1842's repair list, for the owner to check what will
   * move). Changes nothing and logs nothing. The vault's I/O is resolved as
   * for the move, so a locked vault throws. Whether `ctx` may see these is the
   * caller's (`PageManager.vaultRepairDetails`) to decide: names are shown to
   * the page's reader only, never logged or recorded.
   */
  async poolFilesOfVaultPage(
    name: string,
    content: string,
    ctx: ActorContext
  ): Promise<Array<{ id: string; name: string; url: string }>> {
    const provider = this.attachmentProvider;
    if (!provider || !parsePrivatePageName(name)) return [];
    const ids = (await this.vaultPagePoolIds(provider, name, content, ctx)).files.map((f) => f.id);
    const out: Array<{ id: string; name: string; url: string }> = [];
    for (const id of ids) {
      const record = await provider.getAttachmentMetadata(id);
      if (!record) continue;
      out.push({ id, name: typeof record.filename === 'string' && record.filename ? record.filename : id, url: this.getAttachmentUrl(id) });
    }
    return out;
  }

  /**
   * The vault page's location, and the shared-pool files it uses that the
   * repair has work for (#1842), each with what the repair would do:
   *
   * - those its vault does not hold: its mentions name the page, or its
   *   content references them
   * - those its vault already holds under the same id (an earlier repair, or
   *   a move, copied them in) and that still have a pool copy no public page
   *   uses, so a repair run again removes it
   *
   * A file the vault holds whose pool copy public pages still use is not
   * listed: there is nothing to do.
   */
  private async vaultPagePoolIds(
    provider: BaseAttachmentProvider,
    name: string,
    content: string,
    ctx: ActorContext
  ): Promise<{ to: StoreFileLocation; self: PoolFileSelf; files: Array<{ id: string; held: boolean; plan: 'moved' | 'copied' }> }> {
    const vault = parsePrivatePageName(name);
    if (!vault) throw new Error('AttachmentManager: not a vault page name');
    const to = await this.vaultLocation(ctx, vault.owner, vault.store);
    const own = await provider.listFilesInStore(to);
    const self: PoolFileSelf = { names: [name], uuid: this.pageUuidOf(name, ctx) };
    const outside = await this.poolFilesOfPage(provider, name, content, {
      ids: new Set(own.map((f) => f.id)),
      names: new Set(own.map((f) => f.name))
    });
    const { refNames, refIds } = AttachmentManager.contentRefs(content);
    const held = new Set<string>();
    for (const f of own) {
      if (!(f.mentions.includes(name) || refIds.has(f.id) || refNames.has(f.name))) continue;
      if (await provider.attachmentExists(f.id)) held.add(f.id);
    }
    const files: Array<{ id: string; held: boolean; plan: 'moved' | 'copied' }> = [];
    for (const id of [...outside, ...held]) {
      const share = await this.poolFileShare(provider, id, self);
      const plan = share ? AttachmentManager.poolPlan(share, held.has(id)) : null;
      if (plan) files.push({ id, held: held.has(id), plan });
    }
    return { to, self, files };
  }

  /**
   * The vault page names in `owner`'s vault `store` that shared-pool records
   * still mention (#1842), and, in a vault that is not sealed, those its own
   * files name whose pool copy should be gone ({@link heldPoolLeftovers}):
   * what the startup check reports as "pages named by shared records". Used
   * by the repair; never logged.
   */
  async poolMentionedVaultPages(owner: string, store: string): Promise<string[]> {
    const provider = this.attachmentProvider;
    if (!provider) return [];
    const names = new Set<string>();
    for (const record of await provider.getAllAttachments()) {
      const meta = await provider.getAttachmentMetadata(record.identifier);
      for (const m of meta?.mentions ?? []) {
        const vault = parsePrivatePageName(m.name ?? '');
        if (vault && vault.owner === owner && vault.store === store) names.add(m.name);
      }
    }
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const pagesDirectory = configManager?.getResolvedDataPath?.('ngdpbase.page.provider.filesystem.storagedir', './data/pages');
    if (configManager && pagesDirectory) {
      const layout = privateStoreLayoutFromConfig((key, fallback) => configManager.getProperty(key, fallback));
      if ((await readVaultSealState(pagesDirectory, owner, store, layout).catch(() => null))?.state === 'plain') {
        const own = await provider.listFilesInStore({ owner, store, io: PLAIN_FILE_IO }).catch(() => []);
        for (const f of (await this.heldPoolLeftovers(provider, own)).values()) {
          for (const m of f.mentions) if (parsePrivatePageName(m)) names.add(m);
        }
      }
    }
    return [...names];
  }

  /**
   * A vault's own files (`own`) that the shared pool still has under the same
   * id with no public page using that copy (#1842): an earlier repair or move
   * copied them in and the pool copy stayed, served to anyone with the id. By
   * {@link poolFileShare}, with the vault pages each file names as the page
   * itself. A pool copy a public page that exists now still names is not one.
   */
  private async heldPoolLeftovers(provider: BaseAttachmentProvider, own: StoreFileEntry[]): Promise<Map<string, StoreFileEntry>> {
    const out = new Map<string, StoreFileEntry>();
    for (const f of own) {
      if (!(await provider.attachmentExists(f.id))) continue;
      const share = await this.poolFileShare(provider, f.id, { names: f.mentions, uuid: null });
      if (share?.alone) out.set(f.id, f);
    }
    return out;
  }

  /**
   * Vault pages that still use files in the shared pool (#1842): left by moves
   * into a vault before #1842, when the page went and its files stayed. Such a
   * file is served like any public attachment. Read only, and no key is used:
   *
   * - a shared record whose mentions name a vault page (`page: null`, so the
   *   title in that mention is never repeated)
   * - in each vault that is not sealed, a page (`{uuid}.md`) whose content
   *   references a shared-pool file the vault does not hold itself
   * - in each vault that is not sealed, a page using a file the vault holds
   *   whose pool copy under the same id no public page that exists now uses
   *   (its mentions are stale, or name only vault pages): the copy an earlier
   *   repair left behind, which a repair run again removes. Such a file no
   *   page's content or title claims is counted for the vault (`page: null`)
   *
   * A sealed vault's pages can't be read without their owner's key, so they are
   * not checked here.
   */
  async findVaultPagesUsingPoolFiles(): Promise<VaultPagePoolFiles[]> {
    const provider = this.attachmentProvider;
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const pagesDirectory = configManager?.getResolvedDataPath?.('ngdpbase.page.provider.filesystem.storagedir', './data/pages');
    if (!provider || !configManager || !pagesDirectory) return [];
    const layout = privateStoreLayoutFromConfig((key, fallback) => configManager.getProperty(key, fallback));
    const found: VaultPagePoolFiles[] = [];

    const mentioned = new Map<string, number>();
    for (const record of await provider.getAllAttachments()) {
      const meta = await provider.getAttachmentMetadata(record.identifier);
      const vaults = new Set((meta?.mentions ?? [])
        .map((m) => parsePrivatePageName(m.name ?? ''))
        .filter((p): p is NonNullable<typeof p> => p !== null)
        .map((p) => `${p.owner}/${p.store}`));
      for (const v of vaults) mentioned.set(v, (mentioned.get(v) ?? 0) + 1);
    }
    for (const [v, files] of mentioned) {
      const [owner, vault] = v.split('/');
      found.push({ owner, vault, page: null, files });
    }

    for (const owner of await listPrivateOwners(pagesDirectory, layout)) {
      for (const vault of await privateStoreIdsOf(pagesDirectory, owner, layout)) {
        if ((await readVaultSealState(pagesDirectory, owner, vault, layout).catch(() => null))?.state !== 'plain') continue;
        const own = await provider.listFilesInStore({ owner, store: vault, io: PLAIN_FILE_IO }).catch(() => []);
        const ownIds = new Set(own.map((f) => f.id));
        const ownNames = new Set(own.map((f) => f.name));
        const leftovers = await this.heldPoolLeftovers(provider, own);
        const claimed = new Set<string>();
        const root = privateStoreRoot(pagesDirectory, owner, vault, layout);
        const pageFiles = (await fs.readdir(root, { withFileTypes: true }).catch(() => []))
          .filter((d) => d.isFile() && d.name.endsWith('.md'));
        for (const pageFile of pageFiles) {
          const content = await fs.readFile(path.join(root, pageFile.name), 'utf8').catch(() => '');
          const pool = new Set<string>();
          for (const ref of AttachmentManager.extractLocalAttachmentRefs(content)) {
            const base = AttachmentManager.basenameOf(ref);
            if (ownNames.has(ref) || ownNames.has(base)) continue;
            const hit = (await provider.getAttachmentByFilename(ref)) ?? (await provider.getAttachmentByFilename(base));
            if (hit?.identifier) pool.add(hit.identifier);
          }
          for (const m of content.matchAll(/\/attachments\/([A-Za-z0-9-]+)/g)) {
            if (!ownIds.has(m[1]) && await provider.attachmentExists(m[1])) pool.add(m[1]);
          }
          // A held file whose pool copy should be gone: this page uses it by
          // its content (as the repair finds it), or the vault's entry names it.
          if (leftovers.size > 0) {
            const { refNames, refIds } = AttachmentManager.contentRefs(content);
            let title = '';
            try {
              const parsed = parsePageFrontmatter(content).data.title;
              title = typeof parsed === 'string' ? parsed : '';
            } catch { /* no title: its content references only */ }
            const pageName = title ? formatPrivatePageName(owner, vault, title) : null;
            for (const f of leftovers.values()) {
              if (refIds.has(f.id) || refNames.has(f.name) || (pageName !== null && f.mentions.includes(pageName))) {
                pool.add(f.id);
                claimed.add(f.id);
              }
            }
          }
          if (pool.size > 0) found.push({ owner, vault, page: pageFile.name.slice(0, -3), files: pool.size });
        }
        const unclaimed = [...leftovers.values()].filter((f) => !claimed.has(f.id) && f.mentions.some((m) => parsePrivatePageName(m)));
        if (unclaimed.length > 0) {
          const listed = found.find((x) => x.owner === owner && x.vault === vault && x.page === null);
          if (listed) listed.files += unclaimed.length;
          else found.push({ owner, vault, page: null, files: unclaimed.length });
        }
      }
    }
    return found;
  }

  /**
   * The startup report for {@link findVaultPagesUsingPoolFiles}, made the way
   * the unsealed-vault and notes checks report (#1834, #1839): an error in the
   * log naming each owner, vault and page uuid, the degraded state (the
   * subsystem banner) and a system notification. Nothing is moved or deleted.
   * A failing check is logged, never thrown. Run after the boot migration, so
   * what it moved into plain stores is not reported.
   */
  async reportVaultPagesUsingPoolFilesAtBoot(): Promise<void> {
    await this.checkVaultPagesUsingPoolFiles({ notify: true });
  }

  /**
   * Run that check again (#1842): after a repair, so the subsystem banner
   * clears once nothing is left. No notification.
   */
  async recheckVaultPagesUsingPoolFiles(): Promise<VaultPagePoolFiles[]> {
    return this.checkVaultPagesUsingPoolFiles({ notify: false });
  }

  /** What the last check found (#1842): owner, vault, page uuid (null: pages named by shared records), file count. */
  vaultPagesUsingPoolFiles(): VaultPagePoolFiles[] {
    return [...this.poolFileFindings];
  }

  private async checkVaultPagesUsingPoolFiles(opts: { notify: boolean }): Promise<VaultPagePoolFiles[]> {
    try {
      this.poolFileFindings = await this.findVaultPagesUsingPoolFiles();
    } catch (err) {
      logger.error('📎 The check for vault pages using shared-pool files could not run (#1842):', err);
      return this.vaultPagesUsingPoolFiles();
    }
    if (this.poolFileFindings.length === 0) {
      if (this.poolFileReason !== null) this.markReadyIfDegradedBy(this.poolFileReason);
      this.poolFileReason = null;
      return [];
    }
    const detail = this.poolFileFindings
      .map((f) => `${f.owner}/${f.vault} ${f.page ? `page ${f.page}` : 'pages named by shared records'} (${f.files} file(s))`)
      .join(', ');
    const reason = `Vault pages use files in the shared attachment pool, which is served like any public attachment: ${detail}. ` +
      'They were left as they are; "Move into vault" on the admin dashboard, or on the owner\'s profile for a sealed vault, moves them in (#1842)';
    logger.error(`📎 ${reason}`);
    this.poolFileReason = reason;
    if (this.markDegraded(reason) && opts.notify) {
      try {
        await this.engine.getManager<{ addNotification(n: { type: 'system'; level: 'error'; title: string; message: string }): Promise<string> }>('NotificationManager')
          ?.addNotification({ type: 'system', level: 'error', title: 'Vault pages use files outside their vault', message: `${reason}.` });
      } catch (err) {
        logger.error('📎 The notification for vault pages using shared-pool files could not be sent (#1842):', err);
      }
    }
    return this.vaultPagesUsingPoolFiles();
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
   * Every file attached to a page that this requester may see: the shared
   * pool's records, plus the requester's own private-store files that name
   * the page (#1460). Another user's, and an admin's view of anyone's, are
   * not merged — {@link ownPrivateStores} reads `ctx`'s container and no other.
   *
   * @param pageName - Page name
   * @param ctx - Whose reading this is (#1179). Mandatory and positional.
   */
  async getAttachmentsForPage(pageName: string, ctx: ActorContext): Promise<AttachmentMetadata[]> {
    if (!this.attachmentProvider) {
      return [];
    }

    return [
      ...await this.attachmentProvider.getAttachmentsForPage(pageName),
      ...await this.getPrivateStoreAttachmentsForPage(pageName, ctx)
    ];
  }

  /**
   * Find an attachment by its original filename.
   *
   * The shared pool first, then the requester's own stores (#1460): a public
   * page's markup must resolve to the same file for everyone who can read it,
   * so a private file of the reader's never shadows a public record of the
   * same name. A private file uploaded ONTO a page is still found before
   * either, by {@link resolveAttachmentSrc}, which asks the page's own files.
   *
   * @param filename - Original filename to search for
   * @param ctx - Whose reading this is (#1179). Mandatory and positional.
   */
  async getAttachmentByFilename(filename: string, ctx: ActorContext): Promise<AttachmentMetadata | null> {
    if (!this.attachmentProvider) {
      return null;
    }

    const shared = await this.attachmentProvider.getAttachmentByFilename(filename);
    if (shared) return shared;
    return (await this.getPrivateStoreAttachments(ctx)).find((a) => a.name === filename) ?? null;
  }

  /** #1006: how many attachments this instance holds. Count only, never metadata. */
  async getManagerStats(): Promise<ManagerStats> {
    // #1460: the shared pool, deliberately. An instance-wide count has no
    // requester, and a private store's contents are not an instance statistic.
    const n = (await this.getSharedPoolAttachments()).length;
    return { ...(await super.getManagerStats()), count: n, summary: `${n} attachment(s)` };
  }

  /**
   * Every attachment this requester may see: the shared pool, plus their own
   * private stores' files (#1460).
   *
   * @param ctx - Whose reading this is (#1179). Mandatory and positional.
   */
  async getAllAttachments(ctx: ActorContext): Promise<AttachmentMetadata[]> {
    if (!this.attachmentProvider) {
      return [];
    }

    return [
      ...await this.attachmentProvider.getAllAttachments(),
      ...await this.getPrivateStoreAttachments(ctx)
    ];
  }

  /**
   * The shared pool alone — what `attachment-metadata.json` holds (#1460).
   *
   * For the surfaces that have no requester to merge for: an instance count,
   * and the CatalogSource fan-out, whose results are a shared catalogue. A
   * surface that DOES have one asks {@link getAllAttachments} instead.
   */
  async getSharedPoolAttachments(): Promise<AttachmentMetadata[]> {
    if (!this.attachmentProvider) {
      return [];
    }

    return await this.attachmentProvider.getAllAttachments();
  }

  /**
   * The shared pool's record with this filename, with nothing merged (#1460).
   *
   * For `AssetManager.syncPageAssets`, which keeps a SHARED index of what each
   * public page references: nothing private may enter it, so it must not be
   * given the per-requester merge {@link getAttachmentByFilename} does.
   */
  async getSharedPoolAttachmentByFilename(filename: string): Promise<AttachmentMetadata | null> {
    if (!this.attachmentProvider) return null;
    return await this.attachmentProvider.getAttachmentByFilename(filename);
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

    // #1539: a file in the requester's own vault is asked with that vault —
    // vault-owner decides; anything else, site-wide.
    const own = await this.locateOwnStoreFile(context, attachmentId, 'delete');
    const allowed = own
      ? await this.mayInVault(context, 'asset-delete', own.location.owner, own.location.store, attachmentId)
      : await this.checkPermission('asset-delete', context);
    if (!allowed) {
      throw new Error('Permission denied: You do not have permission to delete attachments');
    }

    // #1080: read the filename BEFORE the delete — afterwards it is gone, and
    // a record naming only an opaque id does not answer "what was lost?".
    // Best-effort: a metadata read failure must not block the delete, so the
    // record degrades to the id alone.
    let meta: Awaited<ReturnType<AttachmentManager['getAttachmentMetadata']>> = null;
    try {
      meta = await this.getAttachmentMetadata(attachmentId);
    } catch {
      // keep the id-only fallback
    }

    // #1460: a file in one of the requester's own private stores is not in the
    // global metadata — it is deleted from its store, recorded first as below.
    // The container rule refuses anyone else, which is the whole of the
    // decision for a plain store: there is no key to fail to hold.
    if (!meta) {
      if (own) {
        await this.recordAttachmentEvent('delete', context, {
          attachmentId,
          filename: own.entry.name,
          sizeBytes: own.entry.contentSize
        }, wikiContext);
        return (await this.writeAttachments(this.attachmentProvider.deleteFileInStore(own.location, attachmentId))) !== null;
      }
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
    const filename = typeof meta?.filename === 'string' ? meta.filename : attachmentId;
    const sizeBytes = typeof meta?.size === 'number' ? meta.size : null;
    await this.recordAttachmentEvent('delete', context, { attachmentId, filename, sizeBytes }, wikiContext);

    return await this.writeAttachments(this.attachmentProvider.deleteAttachment(attachmentId));
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
      viaToken: context.viaToken,
      viaProxy: context.viaProxy
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
      ...who,
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

    const ok = await this.writeAttachments(this.attachmentProvider.updateAttachmentMetadata(attachmentId, updates));
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
  async resolveAttachmentSrc(src: string, pageName: string, ctx: ActorContext): Promise<{ url: string; mimeType: string } | null> {
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

    // #1460: a file the viewer uploaded onto this page in one of their OWN
    // private stores, encrypted or not. Only their own — anyone else resolves
    // nothing here and falls through to the public lookups below, so the same
    // markup on the same page shows the owner their file and shows everyone
    // else whatever is public, or a red link.
    const own = await this.getPrivateStoreAttachmentsForPage(pageName, ctx);
    const baseName = src.split('/').pop() ?? src;
    const ownHit = own.find((a) => a.name === src) ?? own.find((a) => a.name === baseName);
    if (ownHit) {
      return { url: String(ownHit.url), mimeType: String(ownHit.encodingFormat ?? '') };
    }

    // Steps 3 & 4: page-scoped, then global, by exact name.
    const exact = await this.lookupAttachmentByName(src, pageName, ctx);
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
      const byBasename = await this.lookupAttachmentByName(basename, pageName, ctx);
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
    pageName: string,
    ctx: ActorContext
  ): Promise<{ url: string; mimeType: string } | null> {
    if (!this.attachmentProvider) return null;

    try {
      const pageAttachments = await this.getAttachmentsForPage(pageName, ctx);
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
      const globalMatch = await this.getAttachmentByFilename(name, ctx);
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
   * #1460: a file in one of the requester's own private stores has no record
   * in the shared index and no bytes in the shared pool, so the provider's
   * cache-on-disk path cannot make its thumbnail. It is rendered from the
   * bytes in memory and deliberately NOT written to the shared `.thumbs`
   * folder: a thumbnail of a private file is the private file, smaller, and
   * putting one in a shared directory would undo the move this issue is.
   *
   * @param {string} attachmentId - Attachment identifier
   * @param {string} size         - Size string e.g. "150x150"
   * @param ctx - Whose reading this is (#1179). Mandatory and positional.
   * @returns {Promise<Buffer|null>}
   */
  async getThumbnail(attachmentId: string, size: string, ctx: ActorContext): Promise<Buffer | null> {
    if (!this.attachmentProvider) return null;

    const own = await this.findOwnStoreFile(ctx, attachmentId, 'view');
    if (own) {
      if (!own.entry.encodingFormat.startsWith('image/')) return null;
      const dims = parseSize(size);
      if (!dims) return null;
      const bytes = await this.attachmentProvider.getFileInStore(own.location, attachmentId);
      if (!bytes) return null;
      try {
        return await transformImage(bytes.bytes, {
          width: dims.width, height: dims.height, fit: 'inside', format: 'jpeg', quality: 85
        });
      } catch (err) {
        // #1461: named by id, never by filename.
        logger.warn(`📎 Thumbnail generation failed for a private file (${attachmentId}): ${String(err)}`);
        return null;
      }
    }

    if (!this.attachmentProvider.getThumbnail) return null;
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

  /**
   * @param ctx - Whose save this is (#1179). Mandatory and positional: the
   *   requester's own private-store files take part in this too (#1460) —
   *   a file uploaded into their store from a public page's editor is
   *   mentioned by that page, and its mentions live in its store's own index.
   */
  async syncPageMentions(pageName: string, content: string, ctx: ActorContext): Promise<void> {
    if (!this.attachmentProvider) return;

    const referencedFilenames = AttachmentManager.extractLocalAttachmentRefs(content);

    // Resolve filenames → attachment identifiers
    const currentIds = new Set<string>();
    for (const filename of referencedFilenames) {
      try {
        let attachment = await this.getAttachmentByFilename(filename, ctx);

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
            attachment = await this.getAttachmentByFilename(basename, ctx);
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
        if (meta) { currentIds.add(id); continue; }
        // #1460: a record #1460's migration moved into a store keeps its id, so
        // an existing `/attachments/<id>` reference still names it — it is just
        // no longer in the shared index.
        if (await this.findOwnStoreFile(ctx, id, 'view')) currentIds.add(id);
      } catch { /* unknown id — skip */ }
    }

    // Get identifiers currently mentioning this page — the shared pool's, plus
    // the saver's own store files that name it (#1460), so a private file of
    // theirs is neither missed nor detached as if it had vanished.
    const previousMentions = await this.getAttachmentsForPage(pageName, ctx);
    const previousIds = new Set<string>(
      previousMentions.map(a => a.identifier).filter(Boolean)
    );

    // Add mentions for newly referenced attachments
    for (const id of currentIds) {
      if (!previousIds.has(id)) {
        await this.attachToPage(id, pageName, ctx).catch(() => {});
      }
    }

    // Remove mentions for attachments no longer referenced
    for (const id of previousIds) {
      if (!currentIds.has(id)) {
        await this.detachFromPage(id, pageName, ctx).catch(() => {});
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
   *
   * #1460: the requester's OWN private-store files are merged into the record
   * set, so one of their files is not reported as a broken reference merely
   * because it is in no shared index. `recordlessFiles` and `missingFiles`
   * stay shared-pool questions — they compare the shared index against the
   * shared storage folder, which a store's files are not in.
   *
   * @param ctx - Whose report this is (#1179). Mandatory and positional; an
   *   admin sees their own stores merged, never anyone else's.
   */
  async getHealthReport(ctx: ActorContext): Promise<{
    totals: { records: number; diskFiles: number; pagesScanned: number };
    orphans: Array<{ identifier: string; name?: string; contentSize?: number; dateCreated?: string; author?: string }>;
    recordlessFiles: string[];
    missingFiles: Array<{ identifier: string; name?: string; storageLocation?: string }>;
    brokenRefs: Array<{ ref: string; pages: string[] }>;
    looseTextRefs: string[];
  }> {
    const sharedRecords = this.attachmentProvider ? await this.attachmentProvider.getAllAttachments() : [];
    // #1460: the requester's own store files answer "is this reference broken?"
    // and "is this record an orphan?" for the files that are theirs.
    const ownStoreRecords = await this.getPrivateStoreAttachments(ctx);
    const records = [...sharedRecords, ...ownStoreRecords];
    const provider = this.attachmentProvider as unknown as { listStorageFiles?: () => Promise<string[]> } | null;
    const diskFiles = provider?.listStorageFiles ? await provider.listStorageFiles() : [];

    const byFilename = new Map<string, AttachmentMetadata>();
    for (const r of records) if (r.name) byFilename.set(r.name, r);

    const storageBasenames = new Set(
      sharedRecords
        .map(r => (r as { storageLocation?: string }).storageLocation)
        .filter((s): s is string => typeof s === 'string')
        .map(s => s.split('/').pop() as string)
    );
    const diskSet = new Set(diskFiles);
    const recordlessFiles = diskFiles.filter(f => !storageBasenames.has(f)).sort();
    const missingFiles = sharedRecords
      .filter(r => {
        const loc = (r as { storageLocation?: string }).storageLocation;
        return typeof loc === 'string' && !diskSet.has(loc.split('/').pop() as string);
      })
      .map(r => ({ identifier: r.identifier, name: r.name, storageLocation: (r as { storageLocation?: string }).storageLocation }));

    // Page scan for broken / loose references
    const pageManager = this.engine.getManager('PageManager') as {
      getAllPages?: () => Promise<string[]>;
      // #1422: the caller's context. This is a health scan with no caller, so
      // it reads as ANONYMOUS_SUBJECT by name — a sealed page is not its business.
      getPage?: (n: string, ctx: unknown) => Promise<{ content?: string } | null>;
    } | null;
    const brokenMap = new Map<string, Set<string>>();
    const looseTextRefs = new Set<string>();
    let pagesScanned = 0;
    if (pageManager?.getAllPages && pageManager.getPage) {
      const pageNames = await pageManager.getAllPages();
      for (const pageName of pageNames) {
        let content: string;
        try {
          content = (await pageManager.getPage(pageName, ANONYMOUS_SUBJECT))?.content ?? '';
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
   *
   * #1460: only the SHARED POOL's orphans are selected. The quarantine folder
   * is a shared directory, so moving a private-store file into it would carry
   * it out of its store and put its name back in shared storage — the exact
   * move this issue undoes. A store's own files are its owner's to delete,
   * through `deleteAttachment`.
   *
   * @param ctx - Whose run this is (#1179). Mandatory and positional.
   */
  async quarantineOrphans(options: { dryRun: boolean; includeOrphans: boolean; includeRecordless: boolean }, ctx: ActorContext): Promise<{
    dryRun: boolean;
    orphansSelected: Array<{ identifier: string; name?: string; contentSize?: number }>;
    recordlessSelected: string[];
    quarantined: number;
    skipped: number;
    manifestPath: string | null;
  }> {
    const report = await this.getHealthReport(ctx);
    const inStore = new Set((await this.getPrivateStoreAttachments(ctx)).map(a => a.identifier));
    const orphansSelected = options.includeOrphans ? report.orphans
      .filter(o => !inStore.has(o.identifier))
      .map(o => ({ identifier: o.identifier, name: o.name, contentSize: o.contentSize })) : [];
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

    await this.writeAttachments(this.attachmentProvider.refreshAttachmentList());
    logger.info('📎 Attachment list refreshed');
  }

  /**
   * Backup manager data
   * Delegates to provider's backup method
   *
   * @returns {Promise<AttachmentBackupData>}
   */
  async backup(options?: ManagerBackupOptions): Promise<AttachmentBackupData> {
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

    // #1876: the files themselves, beside the document, never in it.
    if (!options?.directory || !options.stem) {
      throw new Error('AttachmentManager writes the attachment files beside the backup document, so it is backed up through BackupManager (#1876)');
    }
    if (!this.attachmentProvider.backupFiles) {
      throw new Error(`${this.providerClass} cannot write its files into a backup, so the attachment files are not backed up (#1876)`);
    }
    const { data: files, warnings } = await this.attachmentProvider.backupFiles(options.directory, options.stem);
    for (const w of warnings) logger.error(`📎 [AttachmentManager] ${w}`);
    logger.info(`📎 Backed up ${files.pool.files} shared file(s) and ${files.vaults.files} vault file(s) (${files.vaults.stores.length} vault(s)) beside the document (#1876)`);

    return {
      managerName: 'AttachmentManager',
      timestamp: new Date().toISOString(),
      providerClass: this.providerClass,
      providerBackup: providerBackup,
      files,
      ...(warnings.length > 0 ? { warnings } : {})
    };
  }

  /**
   * Restore manager data from backup
   * Delegates to provider's restore method
   *
   * @param {AttachmentBackupData} backupData - Backup data from backup() method
   * @returns {Promise<void>}
   */
  async restore(backupData: AttachmentBackupData, options?: ManagerRestoreOptions): Promise<void> {
    if (!backupData) {
      throw new Error('AttachmentManager: No backup data provided for restore');
    }

    if (!this.attachmentProvider) {
      throw new Error('AttachmentManager: Provider not initialized, cannot restore');
    }

    // #1876: staged for the next start with the rest of the site, never written live.
    if (!options?.siteRestore || !options.directory) {
      throw new Error('AttachmentManager\'s restore is staged with the rest of the site, so it is restored through BackupManager (#1876)');
    }
    if (backupData.providerClass !== this.providerClass) {
      throw new Error(`The backup's attachments were kept by ${backupData.providerClass}, and this site uses ${this.providerClass}; nothing was staged (#1876)`);
    }
    if (!backupData.providerBackup || !backupData.files) {
      throw new Error('The backup holds no attachment files (it was taken before they were backed up, #1876); nothing was staged');
    }
    if (!this.attachmentProvider.stageFilesRestore) {
      throw new Error(`${this.providerClass} cannot stage a restore of its files; nothing was staged (#1876)`);
    }
    const { skippedVaults } = await this.attachmentProvider.stageFilesRestore(backupData.providerBackup as Record<string, unknown>, backupData.files, options.directory, options.siteRestore);
    logger.warn('📎 Attachment files and metadata staged — applied at the next start with the rest of the site restore (#1876)');
    if (skippedVaults.length > 0) {
      const message = `The backup holds files of vaults this site no longer has (${skippedVaults.join(', ')}), so they were not staged. Their pages are not on this site either.`;
      logger.error(`📎 [AttachmentManager] ${message}`);
      try {
        await this.engine.getManager<{ addNotification(n: object): Promise<string> }>('NotificationManager')
          ?.addNotification({ type: 'system', level: 'error', title: 'Some vault files in the backup were not restored', message });
      } catch (err) {
        logger.error('📎 [AttachmentManager] The notification could not be sent:', err);
      }
    }
  }

  /** Its restore is staged for the next start with the rest of a site restore (#1876). */
  override restoreIsStaged(): boolean {
    return true;
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

