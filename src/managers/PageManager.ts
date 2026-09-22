import path from 'path';
import { systemContext, systemPrincipalOf } from '../context/bootActions.js';
import fse from 'fs-extra';
import matter from 'gray-matter';
import { parsePageFrontmatter } from '../utils/pageFrontmatter.js';
import { defaultShippedPageAccess, evaluateSeededAddonPage, pageSourceHash, REQUIRED_SOURCE_HASH_KEY } from '../utils/addonPageSync.js';
import { SeededShippedPages, type DeclinedShippedPage } from '../utils/seededShippedPages.js';
import BaseManager, { BackupData, type ManagerStats } from './BaseManager.js';
import logger from '../utils/logger.js';
import { WikiEngine } from '../types/WikiEngine.js';
import { PageProvider, ProviderInfo, RecentChangesOptions, RecentChangeEntry, GetPagesByCreatorOptions, PagesScanOptions } from '../types/Provider.js';
import { WikiPage, PageFrontmatter } from '../types/Page.js';
import type { PermissionSubject } from './UserManager.js';
import type {
  CatalogSource,
  CatalogQuery,
  CatalogPage,
  CreativeWork,
  RebuildOpts,
  SchemaType
} from '../types/Schema.js';
import { pageToArticle } from '../utils/pageToArticle.js';
import { dedupeKeywords, normalizeKeywordValue } from '../utils/keywordNormalizer.js';
import { computeFormerTitles, buildFormerTitleIndex, AMBIGUOUS } from '../utils/formerTitles.js';
import { buildPageMutationAuditEvent, recordAuditEvent, type PageMutationOp } from '../utils/auditEvents.js';
import { runFixes, type FixChange, type FixResult, type RunFixesOptions } from '../converters/ncm/fix/index.js';
import { normalizeExistingPageToNcm, type NcmResult } from '../converters/ncm/index.js';
import type ConfigurationManager from './ConfigurationManager.js';
import type { FilterValidationError } from '../parsers/filters/FilterChain.js';
import { actorOf, type ActorContext } from '../context/ActorContext.js';
import { formatPrivatePageName, parsePrivatePageName } from '../utils/privateStorePath.js';
import { mayActInPrivateContainer } from '../utils/privateStoreAccess.js';
import { ANONYMOUS_SUBJECT } from './UserManager.js';

/**
 * A save refused because the content broke a filter rule (#1037).
 *
 * Carries the structured violations so a route can answer with the same
 * `400 { validationErrors }` shape the editor already understands, rather
 * than degrading to a generic 500.
 */
/**
 * Options for the page write methods (#1037).
 */
export interface PageSaveOptions {
  /**
   * Skip content validation. For content the instance ships ITSELF — addon
   * page seeding, required-pages sync, generated profile pages. Never for
   * anything a user supplied.
   */
  skipValidation?: boolean;
  /** Attributed to the validation log line; purely diagnostic. */
  userName?: string;
  /**
   * Skip the uniqueness check (#510) for a write whose whole purpose is to
   * repair what that check refuses: the admin raw editor (#689) exists to fix
   * duplicate slugs and duplicate uuids, and the gate would block the very
   * edit being attempted. Never for an ordinary save.
   */
  skipConflictCheck?: boolean;
  /**
   * Write the frontmatter EXACTLY as given — no sanitisation (#296), no
   * author/editor stamping (#1354), no provenance (#946), no former titles
   * (#1105), no keyword, status or privacy normalisation (#893, #915, #639).
   *
   * For the admin raw editor (#689) and nothing else: there the textarea IS
   * the page's bytes, and the admin is repairing frontmatter the normal path
   * would rewrite — corrupt YAML, a duplicate slug, a stale uuid. Stamping
   * the admin as `editor` would also be wrong: they are fixing a file, not
   * authoring a revision, and the audit log is where that act is recorded.
   *
   * It also lifts the inline ACL-markup refusal, because a page still
   * carrying legacy `[{ALLOW}]` markup is one of the things the raw editor
   * exists to repair.
   */
  rawFrontmatter?: boolean;
  /**
   * Keep the page's `lastModified` from the metadata passed in. For a write
   * that changes no content a reader cares about — e.g. stamping a shipped
   * page's source hash (#1408) — so the page does not jump to the top of
   * Recent Changes.
   */
  preserveLastModified?: boolean;
  /**
   * Request-level detail the manager cannot see, for the audit record (#1121).
   *
   * The event is emitted by the manager either way — a caller that omits this
   * still gets audited, which is the whole point of auditing at the door. This
   * only ENRICHES the record with what lives on the HTTP request (the client
   * IP) or with a semantic the manager cannot infer (a link-rewrite looks
   * exactly like an ordinary edit from inside PageManager).
   */
  audit?: {
    /**
     * Override the derived op. Only `link-rewrite` needs this: create, edit
     * and rename are all derivable here from the existing page and the
     * incoming title, so a caller that passes nothing still gets them right.
     */
    op?: PageMutationOp;
    /** Client IP, when the write arrived over HTTP. */
    ipAddress?: string;
    /** The rename that caused a `link-rewrite`. Ignored for other ops. */
    rewriteOf?: { from: string; to: string } | null;
    /**
     * Suppress the event. For writes that are a side effect of an already
     * audited operation, where a second record would describe the same act
     * twice.
     */
    skip?: boolean;
  };
}

/** What {@link PageManager.savePage} wrote. */
export interface PageSaveResult {
  /** The body as saved — always the caller's text: a save never rewrites it (#1332). */
  content: string;
  /** Where the page landed (#1462): its title, or its private path (#1456). */
  name: string;
  uuid: string;
  /** The name it had before this save; null for a new page. */
  previousName: string | null;
  /** Pages that linked to the old name, read before a rename took it out of the link graph (#1094). */
  previousReferrers: string[];
}

/** {@link PageManager.convertPageToNcm}: the NCM result plus the fix steps that changed the body. */
export interface PageConvertResult extends NcmResult {
  fixes: FixChange[];
}

export class PageContentValidationError extends Error {
  readonly validationErrors: FilterValidationError[];

  constructor(pageName: string, validationErrors: FilterValidationError[]) {
    super(`Content validation failed for "${pageName}": ${validationErrors.map(e => e.message).join('; ')}`);
    this.name = 'PageContentValidationError';
    this.validationErrors = validationErrors;
  }
}
import type CatalogManager from './CatalogManager.js';
import type ValidationManager from './ValidationManager.js';
import type NotificationManager from './NotificationManager.js';
import type RenderingManager from './RenderingManager.js';
import type SearchManager from './SearchManager.js';
import type AttachmentManager from './AttachmentManager.js';
import type AssetManager from './AssetManager.js';
import type CacheManager from './CacheManager.js';

/**
 * Minimal WikiContext interface for type safety
 * TODO: Convert WikiContext.js to TypeScript and import proper type
 */
interface WikiContext {
  pageName: string;
  content: string;
  userContext?: {
    username?: string;
  };
}

/**
 * Provider constructor type for dynamic loading
 */
interface ProviderConstructor {
  new (engine: WikiEngine): PageProvider;
}

/**
 * A folder of pages ngdpbase ships, for `PageManager.seedShippedPages` (#1405).
 */
export interface ShippedPageSource {
  /** Key in the site's seeded-pages record: `required-pages`, or `addon:<name>` */
  id: string;
  /** For log lines */
  label: string;
  /** Folder of `.md` source pages */
  dir: string;
  /** Frontmatter key for the stamped body hash (`required-source-hash`, `addon-source-hash`) */
  stampKey: string;
  /** Reason to never seed a page, or undefined to seed it */
  exclude?: (data: Record<string, unknown>) => string | undefined;
  /** Metadata the source adds to every page it writes (e.g. `addon`, a default category) */
  extraMetadata?: (data: Record<string, unknown>) => Record<string, unknown>;
  /**
   * Called by the boot seed for a source page this site already holds, with the
   * live page and the parsed source — the addon seed's metadata tidy-ups and
   * opt-in reseed (#971, #1003, #920). Not called for removed or trashed pages.
   */
  onPresent?: (live: WikiPage, source: { data: Record<string, unknown>; content: string }, ctx: ActorContext) => Promise<void>;
}

/** Why a shipped page was not seeded. */
export type ShippedPageFailureCode =
  | 'missing-or-invalid-uuid'
  | 'missing-title'
  | 'missing-slug'
  | 'duplicate-uuid'
  | 'save-failed';

/** What `seedShippedPages` did with each source page. */
export interface ShippedPageSeedReport {
  /** Titles saved as new pages */
  seeded: string[];
  /** Source pages already live */
  present: number;
  /** Titles seeded here before (or trashed) and no longer live — left removed */
  removed: string[];
  /** Pages the source excludes */
  excluded: Array<{ file: string; title: string; reason: string }>;
  /** Pages that could not be seeded, with why */
  failed: Array<{ file: string; title: string; reason: string; code: ShippedPageFailureCode }>;
  /** True when this run started the site's record for the source */
  recordStarted: boolean;
  /** Titles of live pages that had no stamp and matched the source, now stamped (#1408) */
  stamped: string[];
  /** Titles of live pages with no stamp whose body differs from the source — left unstamped (#1408) */
  unstamped: string[];
  /** Titles this site declined from the source — never seeded, never reported as a failure (#1412) */
  declined: string[];
}

/** What `syncShippedPages` did with each requested uuid. */
export interface ShippedPageSyncReport {
  /** Uuids saved from the source */
  synced: string[];
  /** Uuids left alone because the live page was edited on this site */
  protected: string[];
  /** Uuids the source does not ship */
  missing: string[];
  /** Uuids that could not be saved, with why */
  failed: Array<{ uuid: string; reason: string }>;
}

/**
 * PageManager - Manages wiki page operations through a pluggable provider system
 *
 * Follows JSPWiki's provider pattern where the actual storage implementation
 * is abstracted behind a provider interface. This allows for different storage
 * backends (filesystem, database, cloud, etc.) to be swapped via configuration.
 *
 * The PageManager acts as a thin coordinator that:
 * - Loads the configured provider (via "ngdpbase.page.provider")
 * - Proxies all page operations to the provider
 * - Maintains the public API for backward compatibility
 *
 * @class PageManager
 * @extends BaseManager
 *
 * @property {PageProvider|null} provider - The active page storage provider
 * @property {string} providerClass - The class name of the loaded provider
 *
 * @see {@link BaseManager} for base functionality
 * @see {@link FileSystemProvider} for default provider implementation
 *
 * @example
 * const pageManager = engine.getManager('PageManager');
 * const page = await pageManager.getPage('Main');
 * console.log(page.content);
 */
class PageManager extends BaseManager implements CatalogSource {
  /** CatalogSource identifier (Slice 4 of #755 / #772). */
  readonly sourceId = 'pages';

  /**
   * Subtypes this source produces. Pages always map to Article (Decision 1).
   * Very-sparse pre-#754 pages still produce Article — `dateCreated` is the
   * only Article-distinctive field and it's now mandatory after the
   * #754 backfill (v3.33.0).
   */
  readonly types: readonly SchemaType[] = ['Article'];

  /**
   * On-disk schema version for the page-frontmatter shape (Decision 6).
   * Bump when the persisted Article-relevant fields on a page change. v1 is
   * the post-#754 (v3.33.0) shape, which adds the required `created`
   * timestamp to every page.
   */
  static readonly CURRENT_SCHEMA_VERSION = 1;
  readonly currentSchemaVersion = PageManager.CURRENT_SCHEMA_VERSION;

  private provider: PageProvider | null = null;

  /**
   * Lowercased former title → current title, or AMBIGUOUS (#1105).
   *
   * Null until first use. Built lazily rather than at boot: it is only ever
   * consulted on the 404 path, so an instance that never serves a stale URL
   * never pays for it. Invalidated on any save that changes `formerTitles`.
   */
  private formerTitleIndex: Map<string, string | typeof AMBIGUOUS> | null = null;
  private providerClass?: string;

  /**
   * Creates a new PageManager instance
   *
   * @constructor
   * @param {WikiEngine} engine - The wiki engine instance
   */
  constructor(engine: WikiEngine) {
    super(engine);
  }

  /**
   * Initialize the PageManager by loading and initializing the configured provider
   *
   * Reads the page provider configuration and dynamically loads the provider class.
   * The provider name is normalized from lowercase (config) to PascalCase (class name).
   *
   * @async
   * @param {Object} [config={}] - Configuration object (unused, reads from ConfigurationManager)
   * @returns {Promise<void>}
   * @throws {Error} If ConfigurationManager is not available or provider fails to load
   *
   * @example
   * await pageManager.initialize();
   * // Loads FileSystemProvider by default
   */
  async initialize(config: Record<string, unknown> = {}): Promise<void> {
    await super.initialize(config);

    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) {
      throw new Error('PageManager requires ConfigurationManager');
    }

    // Check if page storage is enabled (ALL LOWERCASE)
    const pageEnabled = configManager.getProperty('ngdpbase.page.enabled', true) as boolean;
    if (!pageEnabled) {
      logger.info('📄 PageManager: Page storage disabled by configuration');
      return;
    }

    // Load provider with fallback (ALL LOWERCASE)
    const defaultProvider = configManager.getProperty('ngdpbase.page.provider.default', 'filesystemprovider') as string;
    const providerName = configManager.getProperty('ngdpbase.page.provider', defaultProvider) as string;

    // Normalize provider name to PascalCase for class loading
    this.providerClass = this.normalizeProviderName(providerName);

    logger.info(`📄 Loading page provider: ${providerName} (${this.providerClass})`);

    // Load and initialize provider
    try {
      const mod = await import(/* @vite-ignore */ `../providers/${this.providerClass}.js`) as { default: ProviderConstructor };
      const ProviderClass = mod.default;

      this.provider = new ProviderClass(this.engine);
      if (this.provider) {
        await this.provider.initialize();
      }

      const info = this.getProviderInfo();
      logger.info(`📄 PageManager initialized with ${info.name} v${info.version}`);
      if (info.features && info.features.length > 0) {
        logger.info(`📄 Provider features: ${info.features.join(', ')}`);
      }

    } catch (error) {
      logger.error(`📄 Failed to initialize page provider: ${this.providerClass}`, error);
      throw error;
    }

    // Slice 4 of #755 (#772) — register as a CatalogSource so CatalogManager
    // can fan out cross-source queries. Mirrors MediaManager (Slice 3 / #758)
    // and AttachmentManager (Slice 5 / #759). CatalogManager is initialised
    // before PageManager in WikiEngine bootstrap.
    const catalog = this.engine.getManager<CatalogManager>('CatalogManager');
    if (catalog) {
      catalog.registerSource(this);
    } else {
      logger.warn('📄 CatalogManager not available at initialize — skipping CatalogSource registration');
    }
  }

  // ===========================================================================
  // CatalogSource interface (Slice 4 of #755 / #772)
  // ===========================================================================

  /**
   * Convert a single page (frontmatter + name) to its schema.org `Article`
   * record. Public so view-page / API consumers can build the same shape
   * without rerouting through `CatalogManager`.
   *
   * The render mapper for the `<script type="application/ld+json">` block on
   * `view.ejs` is a separate utility (`src/utils/buildPageJsonLd.ts`) — it
   * adds `@context` and a couple of JSON-LD-render conventions on top of this
   * internal record. Per `docs/schemas.md` Decision 11.
   */
  toCreativeWork(
    pageName: string,
    metadata: PageFrontmatter | null | undefined,
    options?: { baseUrl?: string; autoTaggedKeywords?: string[] }
  ): CreativeWork {
    return pageToArticle(pageName, metadata, options);
  }

  /**
   * CatalogSource.get — fetch a single page by UUID and return its `Article`.
   *
   * Returns null for unknown UUIDs. ACL filtering is **not** applied here —
   * callers needing the full WikiContext path should go through `getPage()`.
   * (Same convention as `MediaManager.get` / `AttachmentManager.get`.)
   */
  async get(identifier: string): Promise<CreativeWork | null> {
    if (!this.provider) return null;
    // A catalog read has no caller behind it: public pages only, never a sealed one.
    const page = await this.provider.getPageByUUID(identifier, ANONYMOUS_SUBJECT);
    if (!page) return null;
    return pageToArticle(page.title, page.metadata);
  }

  /**
   * CatalogSource.list — paginated list of CreativeWorks across all pages.
   *
   * Initial implementation: pulls `getAllPageInfo()`, applies text / keyword
   * / type / dateRange filters in-process, returns up to `query.limit`
   * items. Cursor pagination is not implemented yet — the existing
   * search-provider path (Lunr / ES) is the production query surface;
   * this method exists so cross-source CatalogManager fan-out works.
   */
  async list(query: CatalogQuery): Promise<CatalogPage> {
    if (!this.provider) return { items: [], total: 0 };

    // Type filter: PageManager only produces Article. If the caller asked
    // for a non-Article type, short-circuit.
    if (query.types && query.types.length > 0 && !query.types.includes('Article')) {
      return { items: [], total: 0 };
    }

    const allInfo = await this.provider.getAllPageInfo();

    // Convert to Articles upfront so filters can match against the
    // schema-shaped fields (keywords, dateCreated, etc.).
    let articles = allInfo.map(info => pageToArticle(info.title, info.metadata));

    if (query.text) {
      const lower = query.text.toLowerCase();
      articles = articles.filter(a =>
        a.name.toLowerCase().includes(lower) ||
        (a.description ?? '').toLowerCase().includes(lower) ||
        (a.keywords ?? []).some(k => k.toLowerCase().includes(lower))
      );
    }

    if (query.keywords && query.keywords.length > 0) {
      const wanted = new Set(query.keywords);
      articles = articles.filter(a => (a.keywords ?? []).some(k => wanted.has(k)));
    }

    if (query.dateRange) {
      const { from, to } = query.dateRange;
      articles = articles.filter(a => {
        const dc = a.dateCreated;
        if (!dc) return false;
        if (from && dc < from) return false;
        if (to && dc > to) return false;
        return true;
      });
    }

    const total = articles.length;
    const limit = typeof query.limit === 'number' && query.limit > 0 ? query.limit : articles.length;
    const items: CreativeWork[] = articles.slice(0, limit);
    return { items, total };
  }

  /**
   * CatalogSource.rebuild — re-scan storage and rebuild the page-index. Wraps
   * `provider.refreshPageList()`. The `force` option is accepted for
   * `RebuildOpts` compatibility but doesn't change behavior — the underlying
   * provider always does a full rescan.
   */
  async rebuild(_opts?: RebuildOpts): Promise<void> {
    if (!this.provider) return;
    await this.provider.refreshPageList();
  }

  /**
   * Seed the pages a source ships into this site (#1405, epic #1404).
   *
   * The one place shipped pages are seeded. For each source page, in order:
   *
   * - no valid uuid, no title or no slug: skipped and reported
   * - a uuid already used by another file of the same source: skipped and reported
   * - excluded by the source (e.g. github-only categories): skipped
   * - **in this site's seeded record**: never seeded again. If it is no longer
   *   live it was removed here, and it stays removed.
   * - live already: added to the record
   * - in the trash: added to the record and skipped (#1403)
   * - otherwise: saved through `savePage` with the source's stamp, indexed for
   *   search, and added to the record
   *
   * A save the ValidationManager refuses (a title or slug held by another uuid)
   * is reported, not retried; Required Pages Sync shows it as a UUID mismatch.
   *
   * A source this site has no record for yet starts it from the uuids that are
   * live or in the trash, so an established site does not treat its shipped
   * pages as new.
   *
   * @param source - Where the pages come from and how they are stamped
   * @param ctx - Who seeds; a boot job's system context
   * @returns What happened to each source page
   */
  async seedShippedPages(source: ShippedPageSource, ctx: ActorContext): Promise<ShippedPageSeedReport> {
    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }
    const report: ShippedPageSeedReport = { seeded: [], present: 0, removed: [], excluded: [], failed: [], recordStarted: false, stamped: [], unstamped: [], declined: [] };
    if (!(await fse.pathExists(source.dir))) return report;

    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) {
      throw new Error('PageManager: ConfigurationManager not available');
    }
    const record = await SeededShippedPages.load(configManager.getInstanceDataFolder());
    report.recordStarted = !record.hasSource(source.id);
    record.startSource(source.id);

    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const seen = new Map<string, string>();
    const files = (await fse.readdir(source.dir)).filter((f: string) => f.endsWith('.md')).sort();

    for (const file of files) {
      try {
        const raw = await fse.readFile(path.join(source.dir, file), 'utf8');
        const parsed = parsePageFrontmatter(raw);
        const uuid = typeof parsed.data.uuid === 'string' ? parsed.data.uuid.trim() : '';
        const title = typeof parsed.data.title === 'string' ? parsed.data.title.trim() : '';
        const slug = typeof parsed.data.slug === 'string' ? parsed.data.slug.trim() : '';

        if (!uuidPattern.test(uuid)) {
          report.failed.push({ file, title: title || file, reason: 'missing or invalid uuid in frontmatter', code: 'missing-or-invalid-uuid' });
          continue;
        }
        if (!title) {
          report.failed.push({ file, title: file, reason: 'missing title in frontmatter', code: 'missing-title' });
          continue;
        }
        if (!slug) {
          report.failed.push({ file, title, reason: 'missing slug in frontmatter', code: 'missing-slug' });
          continue;
        }
        const duplicateOf = seen.get(uuid.toLowerCase());
        if (duplicateOf) {
          report.failed.push({
            file,
            title,
            reason: `uuid ${uuid} is already used by ${duplicateOf}. Two source pages cannot share a uuid: one of them would never appear`,
            code: 'duplicate-uuid'
          });
          continue;
        }
        seen.set(uuid.toLowerCase(), file);

        const exclusion = source.exclude?.(parsed.data);
        if (exclusion) {
          report.excluded.push({ file, title, reason: exclusion });
          continue;
        }

        let livePage = await this.storeCopyByUUID(uuid, source, ctx);
        if (livePage) {
          record.add(source.id, uuid);
          report.present++;
          if (await this.backfillShippedPageStamp(source, livePage, parsed, ctx, report)) {
            livePage = await this.storeCopyByUUID(uuid, source, ctx) ?? livePage;
          }
          await source.onPresent?.(livePage, parsed, ctx);
          continue;
        }
        if (record.has(source.id, uuid)) {
          report.removed.push(title);
          continue;
        }
        // #1412: this site was told not to take this page from this source. It
        // is not missing and not a failure; an admin can undo it in Required
        // Pages Sync.
        if (record.isDeclined(source.id, uuid)) {
          report.declined.push(title);
          continue;
        }
        if (this.provider.isPageDeleted?.(uuid)) {
          record.add(source.id, uuid);
          report.removed.push(title);
          continue;
        }
        try {
          await this.saveShippedPage(source, uuid, parsed, title, title, ctx);
        } catch (err) {
          report.failed.push({ file, title, reason: err instanceof Error ? err.message : String(err), code: 'save-failed' });
          continue;
        }
        record.add(source.id, uuid);
        report.seeded.push(title);
      } catch (err) {
        report.failed.push({ file, title: file, reason: err instanceof Error ? err.message : String(err), code: 'save-failed' });
      }
    }

    await record.save();
    return report;
  }

  /**
   * Save the source's copy of the given uuids as this site's pages (#1406) —
   * the explicit sync behind Admin → Required Pages Sync.
   *
   * Unlike the boot seed this overwrites a live page, and it ignores the
   * seeded-pages record: an admin's Sync is how a page removed on the site is
   * brought back. Without `force`, a live page edited on this site (the
   * `user-modified` flag, or a body that no longer matches its stamp) is left
   * alone and reported as protected.
   *
   * A live page under another title is saved under that title, with the
   * source title in the metadata — a rename, not a second page (#1376).
   *
   * @param source - Where the pages come from and how they are stamped
   * @param uuids - Pages to sync
   * @param options - `force` overwrites pages edited on this site
   * @param ctx - Who asked
   * @returns What happened to each uuid
   */
  async syncShippedPages(
    source: ShippedPageSource,
    uuids: string[],
    options: { force?: boolean },
    ctx: ActorContext
  ): Promise<ShippedPageSyncReport> {
    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }
    const report: ShippedPageSyncReport = { synced: [], protected: [], missing: [], failed: [] };
    if (uuids.length === 0) return report;

    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) {
      throw new Error('PageManager: ConfigurationManager not available');
    }

    // uuid → source page, by frontmatter uuid (first file wins, as in the seed)
    const sourcePages = new Map<string, { data: Record<string, unknown>; content: string }>();
    if (await fse.pathExists(source.dir)) {
      for (const file of (await fse.readdir(source.dir)).filter((f: string) => f.endsWith('.md')).sort()) {
        const parsed = parsePageFrontmatter(await fse.readFile(path.join(source.dir, file), 'utf8'));
        const uuid = typeof parsed.data.uuid === 'string' ? parsed.data.uuid.trim().toLowerCase() : '';
        if (uuid && !sourcePages.has(uuid)) sourcePages.set(uuid, parsed);
      }
    }

    const record = await SeededShippedPages.load(configManager.getInstanceDataFolder());
    for (const uuid of uuids) {
      const parsed = sourcePages.get(uuid.toLowerCase());
      const title = typeof parsed?.data.title === 'string' ? parsed.data.title.trim() : '';
      if (!parsed) {
        report.missing.push(uuid);
        continue;
      }
      if (!title) {
        report.failed.push({ uuid, reason: 'source page has no title' });
        continue;
      }
      try {
        // A page in the trash comes back from the trash, keeping its history,
        // before the source is saved over it — never a second live copy beside
        // its own trash entry (#1406, #1403).
        if (!(await this.storeCopyByUUID(uuid, source, ctx)) && this.provider.isPageDeleted?.(uuid)) {
          const restored = await this.provider.restoreDeletedPage?.(uuid);
          if (!restored?.ok) {
            const why = restored ? `${restored.reason}${restored.detail ? ` (${restored.detail})` : ''}` : 'not supported by this provider';
            report.failed.push({ uuid, reason: `in the trash and could not be restored: ${why}` });
            continue;
          }
        }
        const live = await this.storeCopyByUUID(uuid, source, ctx);
        if (live && !options.force) {
          const liveMeta = (live.metadata ?? {}) as Record<string, unknown>;
          const stamp = liveMeta[source.stampKey];
          const edited = liveMeta['user-modified'] === true || evaluateSeededAddonPage({
            sourceContent: parsed.content,
            liveContent: live.content ?? '',
            storedHash: typeof stamp === 'string' ? stamp : undefined
          }) === 'locally-modified';
          if (edited) {
            report.protected.push(uuid);
            continue;
          }
        }
        const liveTitle = typeof live?.metadata?.title === 'string' ? live.metadata.title : '';
        // #1411: an operator's access on the live page survives a Sync.
        const liveAccess = (live?.metadata as Record<string, unknown> | undefined)?.access;
        await this.saveShippedPage(source, uuid, parsed, title, liveTitle || title, ctx, liveAccess !== undefined ? { access: liveAccess } : undefined);
        // #1412: asking for the page plainly overrides an earlier "not here".
        record.allow(source.id, uuid);
        record.add(source.id, uuid);
        report.synced.push(uuid);
      } catch (err) {
        report.failed.push({ uuid, reason: err instanceof Error ? err.message : String(err) });
      }
    }
    await record.save();
    return report;
  }

  /**
   * Record that this site will not take a shipped page from a source (#1412).
   *
   * For a page whose title or slug belongs to a page the site would rather
   * keep: the seeder skips it from then on, so the conflict stops being
   * reported at every start-up. Nothing is written to any page, and the entry
   * is per source — an addon shipping the same uuid is still offered.
   *
   * @param sourceId - `required-pages`, or `addon:<name>`
   * @param uuid - The shipped page's uuid
   * @param reason - The conflict that prompted it
   * @param ctx - Who decided
   * @returns True when it was not already declined
   */
  async declineShippedPage(sourceId: string, uuid: string, reason: string, ctx: ActorContext): Promise<boolean> {
    const record = await this.loadSeededRecord();
    const declined = record.decline(sourceId, uuid, {
      at: new Date().toISOString(),
      by: actorOf(ctx).user,
      reason
    });
    if (declined) {
      await record.save();
      logger.info(`[PageManager] ${sourceId} page ${uuid} declined by ${actorOf(ctx).user}: ${reason}`);
    }
    return declined;
  }

  /**
   * Undo a decline (#1412), so the page is offered again at the next start-up
   * or Sync.
   *
   * @param sourceId - `required-pages`, or `addon:<name>`
   * @param uuid - The shipped page's uuid
   * @param ctx - Who decided
   * @returns True when there was a decline to undo
   */
  async allowShippedPage(sourceId: string, uuid: string, ctx: ActorContext): Promise<boolean> {
    const record = await this.loadSeededRecord();
    const allowed = record.allow(sourceId, uuid);
    if (allowed) {
      await record.save();
      logger.info(`[PageManager] ${sourceId} page ${uuid} is no longer declined (by ${actorOf(ctx).user})`);
    }
    return allowed;
  }

  /**
   * Every shipped page this site has declined, as source id → uuid → entry
   * (#1412). Read by Required Pages Sync to list them.
   */
  async declinedShippedPages(): Promise<Record<string, Record<string, DeclinedShippedPage>>> {
    return (await this.loadSeededRecord()).allDeclined();
  }

  /** The site's seeded-pages record. */
  private async loadSeededRecord(): Promise<SeededShippedPages> {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) {
      throw new Error('PageManager: ConfigurationManager not available');
    }
    return SeededShippedPages.load(configManager.getInstanceDataFolder());
  }

  /**
   * The source for the required pages this release ships (#1405, #1406).
   * Pages in a category whose `storageLocation` is `github` are excluded.
   */
  requiredPagesSource(): ShippedPageSource {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) {
      throw new Error('PageManager: ConfigurationManager not available');
    }
    const requiredDirRaw = configManager.getProperty(
      'ngdpbase.page.provider.filesystem.requiredpagesdir',
      './required-pages'
    ) as string;
    const dir = path.isAbsolute(requiredDirRaw) ? requiredDirRaw : path.join(process.cwd(), requiredDirRaw);
    const systemCategories = configManager.getProperty('ngdpbase.system-category', {}) as
      Record<string, { storageLocation?: string }>;
    const githubOnly = new Set(
      Object.entries(systemCategories)
        .filter(([, cfg]) => cfg.storageLocation === 'github')
        .map(([key]) => key)
    );
    return {
      id: 'required-pages',
      label: 'required-pages',
      dir,
      stampKey: REQUIRED_SOURCE_HASH_KEY,
      exclude: (data) => {
        const category = data['system-category'];
        return typeof category === 'string' && githubOnly.has(category)
          ? `github-only category '${category}'`
          : undefined;
      },
      // #1411: administrator-edit only, the rule addon pages follow (#971). A
      // source that declares its own `access` keeps it.
      extraMetadata: (data) => {
        const access = data['access'] ?? defaultShippedPageAccess(data['system-category']);
        return access ? { access } : {};
      },
      onPresent: (live, parsed, ctx) => this.backfillShippedPageAccess(live, parsed, ctx)
    };
  }

  /**
   * One-time access backfill for a live required page (#1411): a page with no
   * `access` gets the default for its category, as a metadata-only save that
   * keeps `lastModified`. A page that has any `access` — an operator's choice —
   * is left alone.
   */
  private async backfillShippedPageAccess(
    live: WikiPage,
    parsed: { data: Record<string, unknown>; content: string },
    ctx: ActorContext
  ): Promise<void> {
    const meta = (live.metadata ?? {}) as Record<string, unknown>;
    if (meta.access !== undefined) return;
    const access = parsed.data['access'] ?? defaultShippedPageAccess(meta['system-category'] ?? parsed.data['system-category']);
    if (!access) return;
    const title = typeof meta.title === 'string' && meta.title ? meta.title : String(parsed.data.title);
    try {
      await this.savePage(title, live.content ?? '', { ...meta, access } as Partial<PageFrontmatter>, ctx, { skipValidation: true, preserveLastModified: true });
    } catch (err) {
      logger.warn(`[PageManager] Could not set access on required page '${title}':`, err);
    }
  }

  /**
   * The source for the pages an addon ships (#1406). Pages it writes carry
   * `addon` and, when the source names none, the `addon` category (#931).
   *
   * @param addonName - The addon's name
   * @param pagesDir - The addon's `pages/` folder
   */
  addonPagesSource(addonName: string, pagesDir: string): ShippedPageSource {
    return {
      id: `addon:${addonName}`,
      label: `${addonName}/pages`,
      dir: pagesDir,
      stampKey: 'addon-source-hash',
      extraMetadata: (data) => ({
        addon: addonName,
        'system-category': data['system-category'] ?? 'addon'
      })
    };
  }

  /**
   * Stamp a live shipped page that has no stamp, when its body matches the
   * source (#1408). Its hash then equals the source's, so the stamp records
   * exactly what the site holds; without one, a later source change cannot be
   * told from a local edit. A page whose body differs cannot be proven
   * unedited and is left unstamped, reported for an admin.
   *
   * A metadata-only save: no version is written for the unchanged body
   * (#1407), and `lastModified` is kept so Recent Changes stays quiet.
   *
   * @returns True when the page was stamped
   */
  private async backfillShippedPageStamp(
    source: ShippedPageSource,
    live: WikiPage,
    parsed: { data: Record<string, unknown>; content: string },
    ctx: ActorContext,
    report: ShippedPageSeedReport
  ): Promise<boolean> {
    const meta = (live.metadata ?? {}) as Record<string, unknown>;
    const stamp = meta[source.stampKey];
    if (typeof stamp === 'string' && stamp.length > 0) return false;

    const title = typeof meta.title === 'string' && meta.title ? meta.title : String(parsed.data.title);
    const sourceHash = pageSourceHash(parsed.content);
    if (pageSourceHash(live.content ?? '') !== sourceHash) {
      report.unstamped.push(title);
      return false;
    }
    try {
      await this.savePage(
        title,
        live.content ?? '',
        { ...meta, [source.stampKey]: sourceHash },
        ctx,
        { skipValidation: true, preserveLastModified: true }
      );
      report.stamped.push(title);
      return true;
    } catch (err) {
      logger.warn(`[PageManager] Could not stamp '${title}' from ${source.label}:`, err);
      return false;
    }
  }

  /**
   * This site's own copy of a shipped page, or null. A page served from the
   * source folder is the source, not the site's page.
   */
  private async storeCopyByUUID(uuid: string, source: ShippedPageSource, ctx: ActorContext): Promise<WikiPage | null> {
    if (!this.provider) return null;
    const page = await this.provider.getPageByUUID(uuid, ctx);
    const filePath = (page as { filePath?: string } | null)?.filePath;
    if (page && filePath && path.resolve(filePath).startsWith(path.resolve(source.dir) + path.sep)) return null;
    return page;
  }

  /**
   * Write one shipped page through `savePage`, stamped, as the system
   * principal, then index it for search. Throws when the save is refused.
   */
  private async saveShippedPage(
    source: ShippedPageSource,
    uuid: string,
    parsed: { data: Record<string, unknown>; content: string },
    title: string,
    saveAs: string,
    ctx: ActorContext,
    keep?: Record<string, unknown>
  ): Promise<void> {
    const metadata: Record<string, unknown> = {
      ...parsed.data,
      ...source.extraMetadata?.(parsed.data),
      ...keep,
      uuid,
      title,
      [source.stampKey]: pageSourceHash(parsed.content),
      editor: systemPrincipalOf(this.engine)
    };
    delete metadata['user-modified'];

    // #1462: the save indexes the page, as every save does.
    await this.savePage(saveAs, parsed.content, metadata, ctx, { skipValidation: true });
  }

  /**
   * Seed the required pages this release ships (#1405). Runs at the end of
   * engine start-up, once ValidationManager and SearchManager exist, so a
   * seeded page gets the conflict check and search indexing a save gets.
   *
   * A required page is seeded once per site: pages new in a release appear at
   * restart, and a page removed on the site stays removed (#954). Pages in a
   * category whose `storageLocation` is `github` are never seeded.
   *
   * Best-effort: a failure is logged and never blocks start-up.
   */
  async seedRequiredPages(): Promise<void> {
    const ctx = systemContext(this.engine, 'required-pages seed at boot — add shipped pages this site has never had');
    try {
      if (!this.provider) return;
      const report = await this.seedShippedPages(this.requiredPagesSource(), ctx);

      logger.info(
        `[PageManager] Required pages: ${report.seeded.length} seeded, ${report.present} present, ` +
        `${report.removed.length} removed on this site, ${report.declined.length} declined, ` +
        `${report.excluded.length} github-only, ${report.failed.length} not seeded`
      );
      if (report.stamped.length > 0) {
        logger.info(`[PageManager] Stamped ${report.stamped.length} required page(s) whose text matches the source (#1408)`);
      }
      if (report.unstamped.length > 0) {
        logger.info(
          `[PageManager] ${report.unstamped.length} required page(s) have no stamp and differ from the source, so they cannot be ` +
          `proven unedited; review them in Admin → Required Pages Sync: ${report.unstamped.join(', ')}`
        );
      }
      if (report.seeded.length > 0) {
        logger.info(`[PageManager] Seeded required pages: ${report.seeded.join(', ')}`);
        if (report.recordStarted) {
          logger.info(
            '[PageManager] This site had no seeded-pages record yet; it was started from the live and trashed ' +
            'required pages. Pages above were missing: new in this release, or removed before the record existed.'
          );
        }
      }
      // #1412: a page whose title or slug is held by another page is a status an
      // admin settles in Required Pages Sync (decline it, or reconcile the
      // identities), not a boot failure worth a notification at every start-up.
      // An authoring error in the shipped page still warns and notifies.
      const conflicts = report.failed.filter((f) => f.code === 'save-failed');
      const authoringErrors = report.failed.filter((f) => f.code !== 'save-failed');
      if (conflicts.length > 0) {
        const lines = conflicts.map((f) => `${f.title} (${f.file}): ${f.reason}`);
        logger.info(`[PageManager] Shipped pages could not be seeded: ${lines.join('; ')}`);
      }
      if (authoringErrors.length > 0) {
        const lines = authoringErrors.map((f) => `${f.title} (${f.file}): ${f.reason}`);
        logger.warn(`[PageManager] Required pages not seeded: ${lines.join('; ')}`);
        const notificationManager = this.engine.getManager<NotificationManager>('NotificationManager');
        await notificationManager?.createNotification?.({
          type: 'system',
          level: 'warning',
          title: 'Required pages not seeded',
          message:
            `${authoringErrors.length} required page${authoringErrors.length === 1 ? '' : 's'} could not be added: ` +
            `${authoringErrors.map((f) => f.title).join(', ')}. See Admin → Required Pages Sync.`
        })?.catch?.(() => { /* non-fatal */ });
      }
    } catch (err) {
      logger.error('[PageManager] Failed to seed required pages:', err);
    }
  }

  /**
   * Get provider information
   * @private
   */
  private getProviderInfo(): ProviderInfo {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }
    if (this.provider.getProviderInfo) {
      return this.provider.getProviderInfo();
    }
    return {
      name: 'UnknownProvider',
      version: '1.0.0'
    };
  }

  /**
   * Normalize provider name from configuration (lowercase) to class name (PascalCase)
   * @param {string} providerName - Provider name from configuration (e.g., 'filesystemprovider')
   * @returns {string} Normalized class name (e.g., 'FileSystemProvider')
   * @private
   */
  private normalizeProviderName(providerName: string): string {
    if (!providerName) {
      throw new Error('Provider name cannot be empty');
    }

    const lower = providerName.toLowerCase();

    // Handle special cases for known provider names
    const knownProviders: Record<string, string> = {
      filesystemprovider: 'FileSystemProvider',
      versioningfileprovider: 'VersioningFileProvider',
      databaseprovider: 'DatabaseProvider',
      databasepageprovider: 'DatabasePageProvider',
      s3provider: 'S3Provider',
      s3pageprovider: 'S3PageProvider',
      cloudstorageprovider: 'CloudStorageProvider'
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
   * Get the current page provider instance
   *
   * @returns {PageProvider} The active provider instance
   *
   * @example
   * const provider = pageManager.getCurrentPageProvider();
   * const info = provider.getProviderInfo();
   * console.log('Using:', info.name);
   */
  getCurrentPageProvider(): PageProvider | null {
    return this.provider;
  }

  getPageUUID(identifier: string, ctx: ActorContext): string | null {
    return this.provider?.getPageUUID?.(identifier, ctx) ?? null;
  }

  /**
   * Evict a page's cached content and rendered output. `ctx` is who changed
   * it (#1418): a sealed page is in no process cache, so its UUID — the
   * rendered-pages key — resolves only through the owner's context.
   */
  invalidatePageCache(identifier: string, ctx: ActorContext): void {
    const resolvedTitle = this.provider?.invalidatePageCache?.(identifier) ?? null;
    const renderingManager = this.engine.getManager<{ invalidateHandlerCache(): void }>('RenderingManager');
    if (renderingManager) {
      renderingManager.invalidateHandlerCache();
    }
    const uuid = this.provider?.getPageUUID?.(resolvedTitle ?? identifier, ctx) ?? resolvedTitle;
    if (uuid) {
      const cacheManager = this.engine.getManager<{ clear(region: string | undefined, pattern?: string): Promise<void> }>('CacheManager');
      if (cacheManager) {
        cacheManager.clear(undefined, `rendered-pages:${uuid}:*`).catch(() => {});
      }
    }
  }

  // ============================================================================
  // Proxy Methods - All page operations are delegated to the provider
  // ============================================================================

  /**
   * Get complete page with content and metadata
   *
   * Retrieves a page by UUID, title, or slug. Returns the full page object
   * including content, metadata, and file path information.
   *
   * @async
   * @param {string} identifier - Page UUID, title, or slug
   * @returns {Promise<WikiPage|null>} Page object or null if not found
   *
   * @example
   * const page = await pageManager.getPage('Main');
   * console.log(page.title, page.metadata.author);
   */
  async getPage(identifier: string, ctx: ActorContext): Promise<WikiPage | null> {
    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }
    return this.provider.getPage(identifier, ctx);
  }

  /**
   * Get only page content (without metadata)
   *
   * More efficient than getPage() when only content is needed.
   *
   * @async
   * @param {string} identifier - Page UUID, title, or slug
   * @returns {Promise<string>} Markdown content
   *
   * @example
   * const content = await pageManager.getPageContent('Main');
   * console.log(content);
   */
  async getPageContent(identifier: string, ctx: ActorContext): Promise<string> {
    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }
    return this.provider.getPageContent(identifier, ctx);
  }

  /**
   * Get only page metadata (without content)
   *
   * More efficient than getPage() when only metadata is needed.
   *
   * @async
   * @param {string} identifier - Page UUID, title, or slug
   * @returns {Promise<PageFrontmatter|null>} Metadata object or null if not found
   *
   * @example
   * const meta = await pageManager.getPageMetadata('Main');
   * console.log('Author:', meta.author);
   */
  /**
   * #915: map of canonical keyword value → registry display title, from the
   * user-keywords catalog. Used to snap page keywords to the vocabulary's
   * display form on save. Best-effort — empty map when CatalogManager is
   * unavailable, so dedup still runs (just without title-snapping).
   */
  private async getUserKeywordCanonicalMap(): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    try {
      const cm = this.engine.getManager<CatalogManager>('CatalogManager') as {
        getProviderTerms?: (domain: string) => Promise<Array<{ term: string; label?: string }>>;
      } | undefined;
      if (!cm?.getProviderTerms) return map;
      const terms = await cm.getProviderTerms('user-keywords');
      for (const t of terms) {
        const title = t.label ?? t.term;
        const value = normalizeKeywordValue(title);
        if (value && !map.has(value)) map.set(value, title);
      }
    } catch (err) {
      logger.warn('[PageManager] getUserKeywordCanonicalMap failed:', err);
    }
    return map;
  }

  /**
   * Resolve a former page title to the page that holds it now, or null (#1105).
   *
   * **Callers must have already failed live resolution.** This is a fallback, not
   * a lookup: answering for a title that still exists would let a stale name
   * shadow a real page. `viewPage` calls it only on the not-found path.
   *
   * Returns null on ambiguity rather than guessing. A confidently wrong redirect
   * to a page that merely once shared a name is worse than the 404 it replaces —
   * a 404 is visibly broken, and the wrong page is not.
   *
   * @param formerTitle - The title that failed to resolve
   * @returns The current title of the page that was renamed from it, or null
   */
  async resolveFormerTitle(formerTitle: string): Promise<string | null> {
    const key = (formerTitle ?? '').trim().toLowerCase();
    if (!key || !this.provider) return null;

    if (!this.formerTitleIndex) {
      this.formerTitleIndex = await this.buildFormerTitleIndexFromPages();
    }

    const hit = this.formerTitleIndex.get(key);
    if (hit === undefined || hit === AMBIGUOUS) return null;
    return hit;
  }

  /**
   * Walk the page set and derive the former-title index.
   *
   * Metadata comes from the provider's already-loaded cache, so this is memory
   * work rather than I/O. A page whose metadata cannot be read is skipped — a
   * single unreadable page must not deny resolution for every other.
   *
   * @private
   */
  private async buildFormerTitleIndexFromPages(): Promise<Map<string, string | typeof AMBIGUOUS>> {
    const sources: Array<{ title: string; formerTitles?: unknown }> = [];
    try {
      const titles = await this.getAllPages();
      for (const title of titles) {
        try {
          const metadata = await this.provider?.getPageMetadata(title, ANONYMOUS_SUBJECT);
          sources.push({
            title: (metadata?.title) ?? title,
            formerTitles: (metadata as Record<string, unknown> | null | undefined)?.formerTitles
          });
        } catch {
          sources.push({ title });
        }
      }
    } catch (err) {
      logger.warn('[PageManager] Could not build former-title index:', err);
      return new Map();
    }
    const index = buildFormerTitleIndex(sources);
    logger.info(`[PageManager] Former-title index built: ${index.size} entries from ${sources.length} pages`);
    return index;
  }

  async getPageMetadata(identifier: string, ctx: ActorContext): Promise<PageFrontmatter | null> {
    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }
    return this.provider.getPageMetadata(identifier, ctx);
  }

  /**
   * Read the literal raw file content for a page — frontmatter YAML + body
   * markdown together, exactly as it appears on disk. Backs the admin
   * "Edit raw" UI (#689); intended for recovery of pages whose frontmatter
   * the normal getPage() path sanitises or normalises away. Returns null
   * when the page is unknown or the provider doesn't support raw reads.
   */
  async getRawPageContent(identifier: string): Promise<{ filePath: string; content: string } | null> {
    // `getRawFile` is an optional capability declared on the PageProvider
    // interface — feature-detect, never assume.
    const provider = this.provider;
    if (!provider?.getRawFile) return null;
    return provider.getRawFile(identifier);
  }

  /**
   * Admin-override save (#689): the admin "Edit raw" textarea, split into
   * frontmatter and body and written through the door (#1462).
   *
   * It goes through `savePage` like every other write — so it versions, keeps
   * the shared indexes in step and is audited — with the three opt-outs that
   * make raw editing what it is, stated at this one call site:
   *
   *   rawFrontmatter    the file's bytes are the point: no sanitisation, no
   *                     stamping. The admin is repairing a file, not authoring
   *                     a revision, so they do NOT become its `editor`.
   *   skipConflictCheck a duplicate slug or uuid is what it was opened to fix.
   *   skipValidation    so is content a filter rule refuses.
   *
   * The audit op is pinned to `edit`: the raw editor writes an existing file
   * in place, and the identifier in its URL may be a uuid, so a difference
   * between it and the frontmatter title is not a rename. The route adds its
   * own `page.raw-edit` record, which carries what this one cannot — the
   * admin override, the file path and the byte count.
   *
   * Throws if the textarea content isn't parseable YAML.
   */
  async saveRawPageWithAdminOverride(
    pageName: string,
    rawFileContent: string,
    ctx: ActorContext
  ): Promise<PageSaveResult> {
    const parsed = parsePageFrontmatter(rawFileContent);
    return this.savePage(pageName, parsed.content, parsed.data, ctx, {
      rawFrontmatter: true,
      skipConflictCheck: true,
      skipValidation: true,
      audit: { op: 'edit' }
    });
  }

  /**
   * Refuse a save whose content breaks a filter rule (#1037).
   *
   * Lives here, not in the route handlers, because that is where it kept
   * getting forgotten: `/save/:page` had the check, `POST /create` — the
   * "Create New Page" item in the header — did not, and neither did
   * `/api/page/ingest`. Every write path reaches PageManager, so putting the
   * gate here means a new caller inherits it instead of having to remember.
   *
   * `skipValidation` is for TRUSTED content the instance ships itself —
   * addon page seeding, required-pages sync, generated profile pages. Those
   * run at startup, and a rule aimed at user input must never be able to stop
   * the instance booting. It is an explicit opt-out precisely so that reading
   * a call site tells you which kind of content it writes.
   *
   * A failure inside ValidationManager is NOT a failure to save: it already
   * degrades to "no errors" internally, and this method must not turn an
   * infrastructure problem into a refused edit.
   *
   * @throws PageContentValidationError when a filter reports severity 'error'
   */
  private async assertContentPasses(
    pageName: string,
    content: string | undefined,
    options: PageSaveOptions
  ): Promise<void> {
    if (options.skipValidation || !content) return;

    const validationManager = this.engine.getManager<ValidationManager & {
      collectContentErrors?: (
        c: string,
        ctx: Record<string, unknown>
      ) => Promise<FilterValidationError[]>;
        }>('ValidationManager');
    if (!validationManager?.collectContentErrors) return;

    let errors: FilterValidationError[];
    try {
      errors = await validationManager.collectContentErrors(content, {
        pageName,
        userName: options.userName
      });
    } catch (err) {
      // Infrastructure fault, not a content fault. Refusing the edit would be
      // worse than the rule going unenforced for this one save — and the
      // author has no way to act on it either way.
      logger.warn(
        `⚠️  Content validation errored for "${pageName}"; saving unvalidated: ` +
        (err instanceof Error ? err.message : String(err))
      );
      return;
    }

    if (errors.length === 0) return;

    // Name the rules and the author. A count alone cannot distinguish
    // `no-raw-br` — routine, and expected on ~205 existing pages — from
    // `no-script-tag`, which is someone trying to inject a script. The noisy
    // rule will vastly outnumber the interesting one, so the interesting one
    // has to be greppable.
    const rules = [...new Set(errors.map((e) => e.rule))].join(', ');
    const who = options.userName ?? 'unknown';
    logger.info(
      `🛑 save("${pageName}") blocked for ${who}: ${errors.length} error(s) — ${rules}`
    );

    // Security rules also go to the audit trail. `no-raw-br` is a markup
    // convention and does not belong there; a script tag does. Without this a
    // genuine injection attempt produced one info line and nothing durable —
    // the least visible thing the app does, despite being the reason the gate
    // exists (#1037).
    const securityRules = errors.filter((e) => e.rule !== 'no-raw-br');
    if (securityRules.length > 0) {
      try {
        const auditManager = this.engine.getManager<{
          logSecurityEvent?: (
            ctx: Record<string, unknown>,
            eventType: string,
            severity: 'low' | 'medium' | 'high' | 'critical',
            description: string
          ) => Promise<string>;
            }>('AuditManager');
        await auditManager?.logSecurityEvent?.(
          { user: { username: who } },
          'content_blocked_on_save',
          'high',
          `Refused save of "${pageName}": ${securityRules.map((e) => `${e.rule} (line ${e.line ?? '?'})`).join(', ')}`
        );
      } catch (err) {
        // Never let an audit failure block, or turn into, a save failure.
        logger.warn(
          '⚠️  Could not audit a blocked save: ' +
          (err instanceof Error ? err.message : String(err))
        );
      }
    }

    throw new PageContentValidationError(pageName, errors);
  }

  /**
   * The frontmatter a save writes, from the frontmatter it was given (#1462).
   *
   * Everything a write must not be able to forget about metadata, in one
   * place: author preservation and the editor of record (#1354), agent
   * provenance (#946), former titles (#1105), the privacy and vocabulary
   * rules (#639, #893, #915) and sanitisation (#296).
   *
   * Only the admin raw editor skips it (`rawFrontmatter`, #689): there the
   * file's bytes are the point, and every rule here would rewrite them.
   *
   * @param pageName - The page being written: its title, or a private path
   * @param metadata - The frontmatter as the caller gave it
   * @param existingPage - The page as stored, or null when this save creates it
   * @param actingUser - Who is writing this revision, from the context (#1164)
   * @param viaToken - The agent token this write came through (#946), if any
   * @returns The frontmatter to hand the provider
   */
  private async normalizeSaveMetadata(
    pageName: string,
    metadata: Partial<PageFrontmatter>,
    existingPage: WikiPage | null,
    actingUser: string,
    viaToken: { name: string } | undefined
  ): Promise<Partial<PageFrontmatter>> {
    // author — immutable original creator, set on ALL pages, never changes.
    // Used for both attribution display and private-page ACL ownership (see PolicyInformationPoint).
    // Preserve from the existing page — must never be overwritten on edit.
    // For documentation/system category pages, default to 'system' if no user is present.
    const originalAuthor = existingPage?.metadata?.author;

    const incomingCategory = ((metadata as Record<string, unknown>)['system-category'] as string | undefined)
      || ((existingPage?.metadata as Record<string, unknown> | undefined)?.['system-category'] as string | undefined)
      || '';
    const isSystemCategory = ['documentation', 'system'].includes(incomingCategory.toLowerCase());
    const defaultAuthor = isSystemCategory ? 'system' : 'anonymous';

    // #946: agent provenance. Two axes — creation and latest revision.
    //
    //   created-via-token  set on create only, NEVER changes. A durable fact
    //                      about the page's origin: an agent made it.
    //   via-token          reflects the LATEST write, and is CLEARED when a
    //                      human writes. Without clearing, a page a person has
    //                      since taken over would read as permanently
    //                      agent-written.
    //
    // Both are server-owned: any value supplied by the caller is discarded,
    // never merged. A provenance marker a user can forge or strip is not a
    // provenance marker. (Same rule as `addon` — see docs/planning/addons.md.)
    const existingCreatedVia = (existingPage?.metadata as Record<string, unknown> | undefined)?.['created-via-token'];

    // #1354: the author is the page's creator. An edit keeps it, and never
    // fills it in — the person editing a page that has no author did not create
    // it. Only a new page takes its author from the save.
    const rawMetadata: Partial<PageFrontmatter> = {
      ...metadata,
      author: existingPage
        ? originalAuthor
        : (actingUser || metadata.author || defaultAuthor)
    };
    if (!rawMetadata.author) delete rawMetadata.author;

    // #1354: `editor` is who made THIS version — the provider records it in the
    // version history and the page shows it as the last editor. It comes from
    // the save's context. Callers carry the page's stored frontmatter forward
    // (the save route's #803 step), and a stored `editor: system` from one
    // migration was stamped on every later human edit. A caller's own value is
    // used only when the context has no user (a system job).
    rawMetadata.editor = actingUser || metadata.editor || rawMetadata.author;

    // Strip caller-supplied provenance before stamping our own.
    delete (rawMetadata as Record<string, unknown>)['via-token'];
    delete (rawMetadata as Record<string, unknown>)['created-via-token'];

    if (typeof existingCreatedVia === 'string' && existingCreatedVia) {
      // Immutable — carry the original creation stamp forward untouched.
      (rawMetadata as Record<string, unknown>)['created-via-token'] = existingCreatedVia;
    } else if (!existingPage && viaToken) {
      (rawMetadata as Record<string, unknown>)['created-via-token'] = viaToken.name;
    }

    if (viaToken) {
      (rawMetadata as Record<string, unknown>)['via-token'] = viaToken.name;
    }
    // else: left absent — a human wrote this revision, so any prior stamp is
    // deliberately not carried forward.

    // #1105: record the outgoing title so the page stays reachable by its old
    // name. Both rename paths — the editor form and POST /api/page/:id/rename —
    // pass the OLD name as `pageName` with the new one in
    // metadata.title, so detecting it here covers both without either knowing.
    //
    // Frontmatter is the store on purpose: the page is its own durable record,
    // so this survives restart, backup/restore and a full index rebuild. Nothing
    // seeds the field, so the #803 carry-forward preserves it on ordinary saves
    // (#1106 closed the class of bug that would otherwise have eaten it).
    const previousTitle = (existingPage?.metadata as Record<string, unknown> | undefined)?.title as string | undefined
      ?? existingPage?.title;
    const formerTitles = computeFormerTitles(
      (existingPage?.metadata as Record<string, unknown> | undefined)?.formerTitles,
      previousTitle,
      // #1456: a private page's name is its path; its title is the last part.
      (rawMetadata.title) ?? parsePrivatePageName(pageName)?.title ?? pageName
    );
    if (formerTitles) {
      (rawMetadata as Record<string, unknown>).formerTitles = formerTitles;
      // The index is derived state; keep it in step rather than rebuilding.
      this.formerTitleIndex = null;
    } else {
      delete (rawMetadata as Record<string, unknown>).formerTitles;
    }

    // Determine if this is a required page by checking the system-category config.
    // Required pages (storageLocation === 'required') cannot be marked private.
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const systemCategoriesConfig = (configManager
      ? configManager.getProperty('ngdpbase.system-category', {}) as Record<string, { label?: string; storageLocation?: string }>
      : {}) as Record<string, { label?: string; storageLocation?: string }>;
    const pageSystemCategory = ((rawMetadata as Record<string, unknown>)['system-category'] as string | undefined)
      || ((existingPage?.metadata as Record<string, unknown> | undefined)?.['system-category'] as string | undefined)
      || '';
    const isRequiredPage = Object.values(systemCategoriesConfig).some(
      (cfg) => ((cfg.label || '').toLowerCase() === pageSystemCategory.toLowerCase() && cfg.storageLocation === 'required')
    );

    // #639 Slice E: top-level `private: true` is the canonical privacy signal.
    // The Slice B back-compat path that scanned user-keywords for 'private' (or
    // for any keyword whose vocabulary entry had storageLocation: 'private')
    // was dropped after data migration completed (Slices A–D, v3.7.0). Defensive
    // strip of any stray 'private' from user-keywords is preserved — cheap
    // insurance against external authoring tools that might still emit it.
    const userKeywords = (rawMetadata['user-keywords'] || []);
    const wantsPrivate = !isRequiredPage && (rawMetadata as Record<string, unknown>).private === true;
    const keywordsHadPrivate = userKeywords.includes('private');
    let normalizedKeywords = userKeywords.filter(kw => kw !== 'private');

    // #893 (Slice 1 of #869): vocabulary-bucket normalization on every save.
    // - Lifecycle terms leave BOTH keyword arrays and become the single-valued
    //   `status:` field. An explicit status in the incoming metadata wins;
    //   otherwise the highest state found wins (catalog `order` ascending).
    // - 'capture' is machine provenance: it moves from user-keywords into
    //   system-keywords (the automation bucket).
    // Status catalog is config-driven (`ngdpbase.status`); the trio below is
    // only the fallback when config is unavailable.
    const statusCatalog = (configManager
      ? configManager.getProperty('ngdpbase.status', null)
      : null) as Record<string, { label?: string; order?: number; enabled?: boolean }> | null;
    const _statusEntries = statusCatalog && typeof statusCatalog === 'object'
      ? Object.entries(statusCatalog as Record<string, { label?: string; order?: number; default?: boolean; enabled?: boolean }>)
        .filter(([, cfg]) => cfg.enabled !== false)
        .sort(([, a], [, b]) => (a.order ?? 0) - (b.order ?? 0))
      : [];
    const LIFECYCLE_ORDER = _statusEntries.length > 0
      ? _statusEntries.map(([key, cfg]) => (cfg.label ?? key).toLowerCase())
      : ['draft', 'review', 'published'];
    const _defaultStatusEntry = _statusEntries.find(([, cfg]) => cfg.default === true);
    const DEFAULT_STATUS = _defaultStatusEntry
      ? (_defaultStatusEntry[1].label ?? _defaultStatusEntry[0]).toLowerCase()
      : LIFECYCLE_ORDER[LIFECYCLE_ORDER.length - 1];
    const rawSystemKeywords = ((rawMetadata as Record<string, unknown>)['system-keywords'] as string[] | undefined) || [];
    const foundLifecycle = [...normalizedKeywords, ...rawSystemKeywords]
      .map(kw => String(kw).toLowerCase())
      .filter(kw => LIFECYCLE_ORDER.includes(kw));
    const explicitStatus = (rawMetadata as Record<string, unknown>).status;
    const derivedStatus = typeof explicitStatus === 'string' && explicitStatus !== ''
      ? explicitStatus
      : foundLifecycle.length > 0
        ? foundLifecycle.sort((a, b) => LIFECYCLE_ORDER.indexOf(b) - LIFECYCLE_ORDER.indexOf(a))[0]
        : undefined;
    // The catalog default maps to ABSENCE — never write it to frontmatter
    // (explicit caller-provided status is kept as-is only when non-default).
    const migratedStatus = derivedStatus?.toLowerCase() === DEFAULT_STATUS ? undefined : derivedStatus;
    const keywordsHadLifecycle = normalizedKeywords.some(kw => LIFECYCLE_ORDER.includes(String(kw).toLowerCase()));
    const keywordsHadCapture = normalizedKeywords.some(kw => String(kw).toLowerCase() === 'capture');
    const systemHadLifecycle = rawSystemKeywords.some(kw => LIFECYCLE_ORDER.includes(String(kw).toLowerCase()));
    normalizedKeywords = normalizedKeywords.filter(kw => {
      const lower = String(kw).toLowerCase();
      return !LIFECYCLE_ORDER.includes(lower) && lower !== 'capture';
    });
    const normalizedSystemKeywords = rawSystemKeywords.filter(kw => !LIFECYCLE_ORDER.includes(String(kw).toLowerCase()));
    if (keywordsHadCapture && !normalizedSystemKeywords.some(kw => String(kw).toLowerCase() === 'capture')) {
      normalizedSystemKeywords.push('capture');
    }

    // #915 (dedup enforcement, #869): collapse case/space/accent variants of a
    // user-keyword to one entry, snapping to the registry's canonical title when
    // catalogued. Runs on every save so `Dining` and `dining` can never coexist
    // on a page, and pages converge on the catalog's display form over time.
    const keywordsBeforeDedup = normalizedKeywords;
    const canonicalByValue = await this.getUserKeywordCanonicalMap();
    normalizedKeywords = dedupeKeywords(normalizedKeywords, canonicalByValue);
    const keywordsDeduped =
      normalizedKeywords.length !== keywordsBeforeDedup.length ||
      normalizedKeywords.some((k, i) => k !== keywordsBeforeDedup[i]);

    const vocabChanged = keywordsHadLifecycle || keywordsHadCapture || systemHadLifecycle;

    // Strip the existing top-level `private` so the spread below can't carry a
    // stale value when wantsPrivate is false (e.g. unsetting on a required page).
    // Also strip any legacy `system-location` — #802 Slice 4 retired the field;
    // providers now route off `metadata.private` directly. Defensive in case a
    // caller passes the legacy field in.
    const rawMetadataCopy = { ...rawMetadata } as Record<string, unknown>;
    delete rawMetadataCopy.private;
    delete rawMetadataCopy['system-location'];
    // #893: status is re-added below from migratedStatus only — deleting here
    // keeps an explicit caller-provided default (e.g. status: published) from
    // slipping through the spread; the default state is represented by absence.
    delete rawMetadataCopy.status;

    const metadataWithLocation: Partial<PageFrontmatter> & Record<string, unknown> = {
      ...rawMetadataCopy,
      // Only override the keyword arrays if normalization actually changed them —
      // otherwise leave the fields exactly as the caller provided (including absent).
      ...(keywordsHadPrivate || keywordsHadLifecycle || keywordsHadCapture || keywordsDeduped ? { 'user-keywords': normalizedKeywords } : {}),
      ...(vocabChanged && (systemHadLifecycle || keywordsHadCapture) ? { 'system-keywords': normalizedSystemKeywords } : {}),
      ...(migratedStatus !== undefined ? { status: migratedStatus } : {}),
      // #1456: an unticked Private box on a private page is a move out of its
      // store, so the provider must see the explicit false.
      ...(wantsPrivate ? { private: true } : rawMetadata.private === false ? { private: false } : {})
    };

    // Sanitize all string fields — trims Unicode whitespace and decodes percent-encoded
    // characters (e.g. %09 → tab) before they reach the provider (#296)
    const validationManager = this.engine.getManager<ValidationManager>('ValidationManager');
    const enrichedMetadata = validationManager
      ? validationManager.sanitizeMetadata(metadataWithLocation) as Partial<PageFrontmatter>
      : metadataWithLocation;
    return enrichedMetadata;
  }

  /**
   * Save a page — the one door every write goes through (#1462 slice 2).
   *
   * Creates a page or updates one, and owns everything a write must not be
   * able to forget: content validation (#1037), the ACL-markup refusal,
   * author preservation and the editor of record (#1354), agent provenance
   * (#946), former titles (#1105), the privacy and vocabulary rules (#639,
   * #893, #915), metadata sanitisation (#296), the uniqueness check (#510),
   * the shared indexes (#1462) and the audit event (#1121).
   *
   * `ctx` is mandatory and positional: the save acts as the caller's subject
   * (#1179), a private-store write reaches that session's keys through it
   * (#1382), and the audit record names it. A caller forwards the context it
   * was given — a request's subject, or the job's for boot and scheduled
   * work — and never invents one.
   *
   * @param pageName - The page to write: its title, or a private path (#1456)
   * @param content - The body, written exactly as given — a save never rewrites it (#1332)
   * @param metadata - Frontmatter; server-owned fields in it are discarded, not merged
   * @param ctx - Who is acting (#1179)
   * @param options - Validation and conflict-check opt-outs, `rawFrontmatter` (#689),
   *   `preserveLastModified`, audit enrichment
   * @returns Where the page landed, and what it was called before
   *
   * @example
   * await pageManager.savePage('New Page', '# Hello World', { 'user-keywords': ['tutorial'] }, req.userContext);
   */
  async savePage(
    pageName: string,
    content: string,
    metadata: Partial<PageFrontmatter> = {},
    ctx: ActorContext,
    options: PageSaveOptions = {}
  ): Promise<PageSaveResult> {
    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }
    if (!ctx) {
      throw new Error('PageManager.savePage requires an ActorContext');
    }

    // The save acts as the caller's subject (#1179); a store write reaches
    // this session's keys through it (#1382), and the provider, the conflict
    // check and the index work are all handed the very context given here.
    //
    // Who is writing this revision, read from the context and never guessed
    // (#1164). A job context answers with its principal, so a context-free
    // system write is still named rather than falling back to a literal.
    const actingUser = actorOf(ctx).user;

    await this.assertContentPasses(pageName, content, {
      userName: actingUser,
      ...options
    });

    // Reject deprecated inline ACL markup — authors must use the audience front matter field instead.
    // `rawFrontmatter` lifts it: repairing a page that still carries the legacy
    // markup is exactly what the admin raw editor is for (#689).
    if (!options.rawFrontmatter && content && /\[\{\s*(ALLOW|DENY)\b[^}]*\}\]/i.test(content)) {
      throw new Error(
        'Inline [{ALLOW}] / [{DENY}] markup is no longer supported. ' +
        'Use the Audience field in the page editor to control access.'
      );
    }

    const existingPage = pageName ? await this.provider.getPage(pageName, ctx) : null;

    // #946: the agent this write came through, if any — stamped on the page by
    // the normalisation below and named in the audit record at the end.
    const viaToken = (ctx as { viaToken?: { name: string } }).viaToken;

    // #689: the raw editor's textarea IS the file — its frontmatter is written
    // exactly as typed, with none of the stamping or normalisation below.
    const enrichedMetadata = options.rawFrontmatter
      ? metadata
      : await this.normalizeSaveMetadata(pageName, metadata, existingPage, actingUser, viaToken);

    // Enforce uniqueness before delegating to provider — PageManager is the single
    // authority on uuid/title/slug uniqueness across the system (#510 architecture).
    // `skipConflictCheck` is the raw editor's repair path (#689): the duplicate
    // is what it was opened to fix.
    const validationManager = this.engine.getManager<ValidationManager>('ValidationManager');
    if (validationManager && !options.skipConflictCheck) {
      const uuid = (enrichedMetadata as Record<string, unknown>).uuid as string | undefined ?? '';
      const slug = (enrichedMetadata as Record<string, unknown>).slug as string | undefined ?? '';
      const conflict = await validationManager.checkConflicts(uuid, pageName, slug, ctx);
      if (conflict.hasConflict) {
        throw new Error(conflict.message ?? `Page conflict: ${conflict.conflictType}`);
      }
    }

    // `preserveLastModified` reaches the provider: a metadata-only write, such
    // as stamping a shipped page's source hash (#1408), must not push the page
    // to the top of Recent Changes.
    const saved = options.preserveLastModified
      ? await this.provider.savePage(pageName, content, enrichedMetadata, ctx, { preserveLastModified: true })
      : await this.provider.savePage(pageName, content, enrichedMetadata, ctx);

    // #1462: the shared indexes follow the save here, and nowhere else.
    const previousName = existingPage ? this.nameOf(pageName, existingPage) : null;
    const previousReferrers = await this.reconcileSharedIndexes({
      ctx,
      name: saved.name,
      uuid: saved.uuid,
      previousName,
      content,
      metadata: enrichedMetadata
    });

    // #1121 gap C: audit at the DOOR, not at the caller.
    //
    // This used to be emitted by WikiRoutes, and the result is the reason the
    // gap was worth closing: of the eight route paths that save a page, four
    // simply forgot — createPageFromTemplate, appendAttachDirective,
    // captureSubmit and ingestPageMarkdown all wrote pages that appeared in no
    // audit log at all. ingestPageMarkdown is the MCP write path, so an agent
    // could create pages and leave no trace, which is precisely the
    // attribution the audit trail exists to provide.
    //
    // Emitted from here, a caller cannot forget. The op is derived from state
    // the manager already had to compute anyway (existingPage for the author
    // carry-forward, the title change for #1105 formerTitles), so the routes
    // are not trusted to classify their own writes either.
    if (!options.audit?.skip) {
      // #1456: a private page's name is its path — compare titles, and name a
      // renamed private page by its new path, never its bare title (#1461).
      const privateName = parsePrivatePageName(pageName);
      const currentTitle = privateName?.title ?? pageName;
      const finalTitle = (enrichedMetadata as Record<string, unknown>).title as string | undefined || currentTitle;
      const renamedTo = privateName ? formatPrivatePageName(privateName.owner, privateName.store, finalTitle) : finalTitle;
      const derivedOp: PageMutationOp = !existingPage
        ? 'create'
        : finalTitle !== currentTitle ? 'rename' : 'edit';
      const op = options.audit?.op ?? derivedOp;

      void recordAuditEvent(
        this.engine.getManager('AuditManager'),
        buildPageMutationAuditEvent({
          op,
          username: actingUser,
          ipAddress: options.audit?.ipAddress,
          pageName: op === 'rename' ? renamedTo : pageName,
          uuid: (enrichedMetadata as Record<string, unknown>).uuid as string | undefined,
          fromPageName: op === 'rename' ? pageName : null,
          rewriteOf: options.audit?.rewriteOf ?? null,
          viaToken: viaToken
        }),
        (err) => logger.warn(`Audit log failed for page.${op} of '${pageName}':`, err)
      );
    }

    return { content, name: saved.name, uuid: saved.uuid, previousName, previousReferrers };
  }

  /**
   * Put an old version's body back, as a new version (#1462 slice 3).
   *
   * A restore is a save: it writes the page. It used to call the provider's
   * own `restoreVersion`, which saved underneath the door — no content
   * validation, no uniqueness check, no audit record and no shared-index
   * work, so a restored page kept the RESTORED body on disk while search, the
   * link graph and the rendered cache still described the one it replaced.
   * Here the version is read and the body goes back through `savePage`.
   *
   * Nothing is destroyed: the newer versions stay in the history, and the
   * restore is simply the newest one.
   *
   * @param identifier - Page UUID, title or slug
   * @param version - The version whose body to restore
   * @param ctx - Who is acting (#1179); the restore is attributed to them
   * @returns Where the page landed, and the version number this created
   * @throws When the page, the version or the provider's history is missing
   */
  async restoreVersion(
    identifier: string,
    version: number,
    ctx: ActorContext
  ): Promise<PageSaveResult & { version: number | null }> {
    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }
    if (!ctx) {
      throw new Error('PageManager.restoreVersion requires an ActorContext');
    }
    // Version history is an optional provider capability — feature-detect it,
    // as `getRawPageContent` does, never assume.
    const provider = this.provider as PageProvider & {
      getPageVersion?(identifier: string, version: number, ctx: ActorContext): Promise<{ content: string }>;
      getVersionHistory?(identifier: string, ctx: ActorContext, limit?: number): Promise<Array<{ version: number }>>;
    };
    if (!provider.getPageVersion) {
      throw new Error('PageManager: this page provider keeps no version history');
    }

    const past = await provider.getPageVersion(identifier, version, ctx);
    const current = await provider.getPage(identifier, ctx);
    if (!current) {
      throw new Error(`Page not found: ${identifier}`);
    }
    const pageName = current.title || identifier;

    // The same metadata the provider-level restore wrote: the page's uuid, the
    // restorer as editor (#1179), and the version note the history shows.
    const saved = await this.savePage(pageName, past.content, {
      uuid: current.uuid,
      editor: actorOf(ctx).user,
      comment: `Restored from v${version}`,
      changeType: 'restored'
    }, ctx);

    // The version this restore created, for the caller to report.
    let newVersion: number | null = null;
    try {
      const history = await provider.getVersionHistory?.(current.uuid || identifier, ctx, 1);
      newVersion = history?.[0]?.version ?? null;
    } catch (err) {
      logger.warn(`[PageManager] Restored '${pageName}' but could not read its new version number: ${String(err)}`);
    }

    logger.info(
      `[PageManager] Restored page '${pageName}' to v${version} as v${newVersion ?? '?'} by ${actorOf(ctx).user}`
    );
    return { ...saved, version: newVersion };
  }

  /**
   * Bring a page back from the trash (#947), and back into the shared
   * indexes (#1462 slice 3).
   *
   * The provider moves the file and its history back; a restore is then a
   * save-shaped change — the page is there again, under its restored title —
   * so the link graph, search, mentions, assets and the rendered cache are
   * brought in step here, where every other write has them done. The route
   * used to do a partial job of this itself (search and the link graph only).
   *
   * @param uuid - The trashed page's UUID
   * @param ctx - Who is acting (#1179); the restored page is read as them
   * @returns The provider's result, unchanged — `ok`, or why not
   */
  async restoreDeletedPage(
    uuid: string,
    ctx: ActorContext
  ): Promise<{ ok: true; title: string } | { ok: false; reason: string; detail?: string }> {
    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }
    if (!ctx) {
      throw new Error('PageManager.restoreDeletedPage requires an ActorContext');
    }
    if (!this.provider.restoreDeletedPage) {
      throw new Error('PageManager: this page provider has no trash');
    }

    const result = await this.provider.restoreDeletedPage(uuid);
    if (!result.ok) return result;

    const restored = await this.provider.getPage(result.title, ctx).catch(() => null);
    await this.reconcileSharedIndexes({
      ctx,
      name: result.title,
      uuid,
      // It is back where it was, under the name it had: nothing to take out.
      previousName: null,
      content: restored?.content,
      metadata: restored?.metadata
    });
    return result;
  }

  /**
   * Convert a stored page (frontmatter + body) to NCM, with every fix step
   * (#1332) — the one implementation behind Convert to NCM, agent ingest and
   * the MCP create/update tools.
   *
   * The fix steps run on the body first, then `normalizeExistingPageToNcm`
   * (links, table up-convert, `ncmVersion`), so NCM's determinism stays owned
   * in one place. Each step that changed something is also reported as a
   * `converter-note` warning, so the existing preview and notification
   * surfaces show it without knowing about steps.
   *
   * Pure: nothing is saved.
   *
   * @param raw - Full page text, YAML frontmatter and body
   * @returns The NCM result and the fix steps that changed the body
   */
  convertPageToNcm(raw: string): PageConvertResult {
    const parsed = parsePageFrontmatter(raw);
    const fixed = this.normalizePageContent(parsed.content);
    const source = fixed.changes.length ? matter.stringify(fixed.content, parsed.data) : raw;
    const ncm = normalizeExistingPageToNcm(source);
    return {
      ...ncm,
      warnings: [
        ...fixed.changes.map((c) => ({ kind: 'converter-note' as const, detail: `${c.summary} (${c.step})` })),
        ...ncm.warnings
      ],
      fixes: fixed.changes
    };
  }

  /**
   * Run the Markdown fix steps over a page body (#1332).
   *
   * The one entry point for rewriting page text, so Convert to NCM, ingest,
   * import and migrations cannot disagree about what a page should become.
   * Every step runs, in registry order; `steps` picks steps by id instead.
   * An ordinary save never calls this.
   *
   * Pure: nothing is saved. The result lists what each step changed, so the
   * caller can report it.
   *
   * @param content - Page body, without frontmatter
   * @param options - `steps` by id; default every step
   * @returns The fixed body and the changes, empty when nothing changed
   *
   * @example
   * const { content, changes } = pageManager.normalizePageContent(body);
   */
  normalizePageContent(content: string, options: RunFixesOptions = {}): FixResult {
    return runFixes(content, options);
  }

  /**
   * Delete a page — the one door every delete goes through (#1462 slice 3).
   *
   * There were two: this one and `deletePageWithContext`, which took a whole
   * WikiContext to read two fields off it and, when the context carried no
   * user, deleted as the anonymous subject — a caller that HAD a subject could
   * lose it on the way in. The context is mandatory and positional here, as it
   * is for a save.
   *
   * The delete is soft (#947): the page goes to the trash with its history,
   * and the context names who put it there. Afterwards the page is taken out
   * of every shared index, here and nowhere else (#1462).
   *
   * @param identifier - Page UUID, title, or slug
   * @param ctx - Who is acting (#1179)
   * @returns True if deleted, false if not found
   *
   * @example
   * const deleted = await pageManager.deletePage('Old Page', req.userContext);
   */
  async deletePage(identifier: string, ctx: ActorContext): Promise<boolean> {
    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }
    if (!ctx) {
      throw new Error('PageManager.deletePage requires an ActorContext');
    }
    logger.info(`[PageManager] Deleting page: ${identifier} by user: ${actorOf(ctx).user}`);

    const before = await this.provider.getPage(identifier, ctx).catch(() => null);
    const deleted = await this.provider.deletePage(identifier, ctx);
    if (deleted && before) {
      await this.reconcileSharedIndexes({
        ctx,
        name: null,
        uuid: before.uuid,
        previousName: this.nameOf(identifier, before)
      });
    }
    return deleted;
  }

  /**
   * The name a page was reached by, as the shared indexes key it: a private
   * page's path (#1456), else its title — the caller may have used a uuid or
   * slug.
   */
  private nameOf(identifier: string, page: { title?: string }): string {
    return parsePrivatePageName(identifier) ? identifier : (page.title ?? identifier);
  }

  /**
   * The shared indexes after a page changed (#1462) — the one place they are
   * kept in step: the link graph, search, attachment mentions, page assets,
   * and the rendered-page cache of the page and of the pages linking to it.
   * A private page (#1456) is in none of them; a page that left the public
   * space, or was deleted or renamed, is taken out under its old name.
   *
   * A failure here is logged, not thrown: the page is already saved, and the
   * indexes are rebuilt by the reindex job. It is never silent.
   *
   * @returns the pages that linked to the old name, read before it left the
   *   link graph — what a rename rewrites (#1094)
   */
  private async reconcileSharedIndexes(change: {
    ctx: ActorContext;
    /** The page's name after the change; null when it was deleted. */
    name: string | null;
    uuid?: string;
    /** Its name before the change, when it existed. */
    previousName: string | null;
    content?: string;
    metadata?: Record<string, unknown>;
  }): Promise<string[]> {
    const rendering = this.engine.getManager<RenderingManager>('RenderingManager');
    const search = this.engine.getManager<SearchManager>('SearchManager');
    const attachments = this.engine.getManager<AttachmentManager>('AttachmentManager');
    const assets = this.engine.getManager<AssetManager>('AssetManager');
    const cache = this.engine.getManager<CacheManager>('CacheManager');
    const { name, previousName } = change;
    const isPublic = (n: string | null): n is string => n !== null && parsePrivatePageName(n) === null;
    const step = async (what: string, run: () => unknown): Promise<void> => {
      try {
        await run();
      } catch (err) {
        logger.error(`[PageManager] Shared index step '${what}' failed after a page change: ${String(err)}`);
      }
    };

    const referrers = new Set<string>();
    const previousReferrers = isPublic(previousName) ? (rendering?.getReferringPages(previousName) ?? []) : [];
    previousReferrers.forEach((r) => referrers.add(r));

    // Out under the old name: deleted, renamed, or moved into a store.
    if (isPublic(previousName) && previousName !== name) {
      await step('link graph remove', () => rendering?.removePageFromLinkGraph(previousName));
      await step('search remove', () => search?.removePageFromIndex(previousName));
    }

    // In under the new name — a public page only.
    if (isPublic(name) && change.content !== undefined) {
      const content = change.content;
      if (previousName !== name) await step('link graph add', () => rendering?.addPageToCache(name));
      await step('link graph', () => rendering?.updatePageInLinkGraph(name, content));
      await step('search', () => search?.updatePageInIndex(name, { name, content, metadata: change.metadata ?? {} }));
      await step('mentions', () => attachments?.syncPageMentions(name, content));
      await step('assets', () => assets?.syncPageAssets(name, content));
      (rendering?.getReferringPages(name) ?? []).forEach((r) => referrers.add(r));
    }

    // The rendered page, and every page whose links to it changed colour or target.
    if (cache?.isInitialized?.()) {
      const uuids = new Set<string>();
      if (change.uuid) uuids.add(change.uuid);
      for (const r of referrers) uuids.add(this.getPageUUID(r, change.ctx) ?? r);
      for (const uuid of uuids) await step('rendered cache', () => cache.clear(undefined, `rendered-pages:${uuid}:*`));
    }
    return previousReferrers;
  }

  /**
   * Whether a page may go into an index that every reader of this process or
   * its disk shares — the search index, the page-assets index, the link graph
   * and the known-page-name list (#1419).
   *
   * Such an index is built as the anonymous subject (docs/planning/
   * private-stores.md, Context): the question is asked with that subject
   * stated, not with a default. A private page never qualifies (#1456): it
   * is listed only in its own store's indexes, encrypted or not.
   */
  isSharedIndexable(identifier: string): boolean {
    // #1456: a private page is in no shared index, whether or not its store is sealed.
    return parsePrivatePageName(identifier) === null && this.pageExists(identifier, ANONYMOUS_SUBJECT);
  }

  /**
   * Check if page exists
   *
   * Fast existence check without loading page content.
   *
   * @param {string} identifier - Page UUID, title, or slug
   * @returns {boolean} True if page exists
   *
   * @example
   * if (pageManager.pageExists('Main')) {
   *   console.log('Main page exists');
   * }
   */
  pageExists(identifier: string, ctx: ActorContext): boolean {
    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }
    return this.provider.pageExists(identifier, ctx);
  }

  /**
   * Whether a page uuid is in the trash (#1403).
   *
   * A seed of shipped pages must treat a trashed uuid as deliberately removed,
   * not missing. `pageExists` sees live pages only. A provider without soft
   * delete has no trash, so this is false there.
   *
   * @param uuid - Page UUID
   * @param _ctx - Who is asking
   * @returns True if the uuid has a trash entry
   */
  isPageDeleted(uuid: string, _ctx: ActorContext): boolean {
    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }
    return this.provider.isPageDeleted?.(uuid) ?? false;
  }

  /**
   * Get all page titles
   *
   * Returns a sorted list of all page titles in the wiki.
   *
   * @async
   * @returns {Promise<string[]>} Sorted array of page titles
   *
   * @example
   * const pages = await pageManager.getAllPages();
   * console.log('Total pages:', pages.length);
   */
  async getAllPages(): Promise<string[]> {
    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }
    return this.provider.getAllPages();
  }

  /**
   * The pages `subject` may perform `action` on — the door for anything that
   * lists pages to a reader (#1219, guiding-framework rule 10).
   *
   * A title is content: a private page named for what it holds discloses by
   * appearing in a list. `getAllPages()` above is the unfiltered index and
   * stays for callers with no reader — indexing, link graphs, jobs, and admin
   * surfaces already gated by `admin-system`. Anything rendered to a request
   * goes through here, so the listing and `canAccess` are the same evaluator
   * (`PolicyInformationPoint.filterAccessiblePages`). Without an PolicyInformationPoint nothing is
   * listed — never the unfiltered index by accident.
   *
   * @param subject - The reader's own context, forwarded (viaToken / viaShare ride on it)
   * @param action  - Legacy verb (`view`, `edit`) or policy action; default `view`
   */
  async listPagesFor(subject: PermissionSubject | null | undefined, action: string = 'view'): Promise<string[]> {
    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }
    const acl = this.engine.getManager<{
      filterAccessiblePages(subject: PermissionSubject | null | undefined, action: string, candidates: Array<{ title: string; metadata: PageFrontmatter | null }>): Promise<string[]>;
        }>('PolicyInformationPoint');
    if (!acl) {
      logger.warn('[PageManager] listPagesFor: PolicyInformationPoint unavailable — listing nothing');
      return [];
    }
    const infos = await this.provider.getAllPageInfo();
    const titles = await acl.filterAccessiblePages(subject, action, infos.map((i) => ({ title: i.title, metadata: i.metadata ?? null })));
    return titles.sort((a, b) => a.localeCompare(b));
  }

  /**
   * Get all page titles (explicit alias for getAllPages)
   * Prefer this for new code that only needs page names.
   * Use getAllPageInfo() when you need uuid/slug/author etc.
   */
  /**
   * #1006: how many pages this instance holds.
   *
   * Names, not pages: `getAllPageNames()` reads the index, where
   * `getAllPages()` would load every page's content to count them.
   */
  async getManagerStats(): Promise<ManagerStats> {
    const n = (await this.getAllPageNames()).length;
    return { ...(await super.getManagerStats()), count: n, summary: `${n} page(s)` };
  }

  async getAllPageNames(): Promise<string[]> {
    return this.getAllPages();
  }

  /**
   * Get a page by its UUID
   * @param {string} uuid - Page UUID
   * @returns {Promise<WikiPage | null>} Page or null if not found
   */
  async getPageByUUID(uuid: string, ctx: ActorContext): Promise<WikiPage | null> {
    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }
    return this.provider.getPageByUUID(uuid, ctx);
  }

  /**
   * Get a page by its slug
   * @param {string} slug - URL-friendly slug
   * @returns {Promise<WikiPage | null>} Page or null if not found
   */
  async getPageBySlug(slug: string, ctx: ActorContext): Promise<WikiPage | null> {
    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }
    return this.provider.getPageBySlug(slug, ctx);
  }

  /**
   * Refresh internal cache/index
   *
   * Forces the provider to rebuild its internal caches and indices.
   * Useful after external file system changes.
   *
   * @async
   * @returns {Promise<void>}
   *
   * @example
   * await pageManager.refreshPageList();
   * console.log('Page list refreshed');
   */
  /**
   * Return pages most recently modified, sorted descending by lastModified (#635).
   *
   * Delegates to the provider's in-memory state (pageIndex / pageCache) — no
   * direct disk I/O. Honors private-page visibility based on `options.principals`;
   * the provider derives the admin bypass from an `admin` principal (#1116).
   *
   * Used by RecentChangesPlugin and any other consumer that needs a "recent edits"
   * feed. New code should prefer this over enumerating getAllPages().
   */
  async getRecentChanges(ctx: ActorContext, options: RecentChangesOptions = {}): Promise<RecentChangeEntry[]> {
    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }
    return this.provider.getRecentChanges(ctx, options);
  }

  /**
   * Every indexed page carrying an `addon` provenance stamp.
   * Used by addon orphan detection; reads the in-memory index, no disk I/O.
   * Returns [] on providers that do not maintain a page index.
   */
  getAddonSeededIndexEntries(): Array<{ uuid: string; addon: string; slug?: string; title: string }> {
    const p = this.provider as unknown as {
      getAddonSeededIndexEntries?: () => Array<{ uuid: string; addon: string; slug?: string; title: string }>;
    } | null;
    return p?.getAddonSeededIndexEntries?.() ?? [];
  }

  /**
   * Set the `addon` stamp on an existing index entry without rewriting the page.
   * Used by the boot-time back-fill. Returns false when unsupported or unchanged.
   */
  async setIndexAddon(uuid: string, addonName: string): Promise<boolean> {
    const p = this.provider as unknown as {
      setIndexAddon?: (uuid: string, addonName: string) => Promise<boolean>;
    } | null;
    return (await p?.setIndexAddon?.(uuid, addonName)) ?? false;
  }

  /**
   * Pages owned by a given user (#640).
   *
   * Authorization: callers MUST verify the requesting user is allowed to ask
   * about `username` (typically only their own username, or admin asking about
   * another). The provider does not enforce this — it filters by `author` /
   * `creator` only.
   */
  async getPagesByCreator(username: string, ctx: ActorContext, options: GetPagesByCreatorOptions = {}): Promise<RecentChangeEntry[]> {
    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }
    return this.provider.getPagesByCreator(username, ctx, options);
  }

  /**
   * Pages most recently edited by a user (#640 Phase 2).
   */
  async getPagesByEditor(username: string, ctx: ActorContext, options: PagesScanOptions = {}): Promise<RecentChangeEntry[]> {
    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }
    return this.provider.getPagesByEditor(username, ctx, options);
  }

  /**
   * Pages whose frontmatter audience matches any of the caller's principals,
   * excluding pages the caller already owns (#640 Phase 2).
   */
  async getPagesSharedWith(principals: string[], options: PagesScanOptions = {}): Promise<RecentChangeEntry[]> {
    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }
    return this.provider.getPagesSharedWith(principals, options);
  }

  /**
   * The private-container decision for a page (docs/planning/private-stores.md,
   * Access). PolicyInformationPoint's Tier 0 asks this, so every `canAccess` on a page —
   * view, edit, lists, the attachment door — reaches the same rule.
   *
   * `pages/private/{user}/` and every store below it is owned by that user.
   * Nobody else acts in it unless the owner delegated (a share the owner
   * issued, once the store's Share switch exists — #1388). No role reaches in,
   * admin included (security-posture P2: no `hasRole` as an allow).
   *
   * The owner is the one in the page's name (#1456), not frontmatter
   * `author`, so reassigning `author` cannot move ownership (#711).
   *
   * Returns:
   *   - `null`  — a public name; the caller falls through to its next tier
   *   - `true`  — a private name, and the caller is the owner or the owner's delegate
   *   - `false` — a private name, and the caller is neither — whether or not
   *               the page exists
   */
  async checkPrivatePageAccess(wikiContext: WikiContext, pageNameOrUuid: string): Promise<boolean | null> {
    // #1456: a private page is named by its path, and the path names its
    // owner — decided from the name alone, so a refusal never depends on
    // whether the page exists. A plain name is a public page.
    const name = parsePrivatePageName(pageNameOrUuid);
    if (!name) return null;
    const subject = wikiContext.userContext as ActorContext | undefined;
    if (!subject) return false;
    return mayActInPrivateContainer(subject, name.owner);
  }

  /**
   * Owner and store of a private page, or `null` when the page is not private
   * or does not exist (#1398). The owner owns the page and every attachment
   * uploaded onto it, so AttachmentManager uses this to route a new upload into
   * that owner's store.
   *
   * #1456: both come from the page's name, `private/{owner}/{store}/{title}`;
   * the page is looked up in that store through `ctx` only to confirm it exists.
   */
  async getPrivatePageOwner(
    pageNameOrUuid: string,
    ctx: ActorContext
  ): Promise<{ creator: string; store: string } | null> {
    if (!this.provider) return null;
    const name = parsePrivatePageName(pageNameOrUuid);
    if (!name) return null;
    const pageMetadata = await this.provider.getPageMetadata(pageNameOrUuid, ctx);
    if (!pageMetadata?.uuid) return null;
    return { creator: name.owner, store: name.store };
  }

  async refreshPageList(): Promise<void> {
    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }
    return this.provider.refreshPageList();
  }

  /**
   * #1374: rewrite the provider's persistent page index from its last disk scan
   * (run {@link refreshPageList} first). Null when the provider keeps no such
   * index.
   */
  async rebuildPageIndex(): Promise<{ pages: number; changed: number; removed: string[]; keptUnscanned: number; historyInRequiredPages: number } | null> {
    const provider = this.provider as unknown as {
      rebuildPageIndexFromDisk?: () => Promise<{ pages: number; changed: number; removed: string[]; keptUnscanned: number; historyInRequiredPages: number }>;
    } | null;
    if (!provider || typeof provider.rebuildPageIndexFromDisk !== 'function') return null;
    return provider.rebuildPageIndexFromDisk();
  }

  /**
   * At unlock (#1456): the owner's sealed pages move from their user-level
   * catalog into each encrypted store's own page index. Idempotent.
   *
   * @param ctx - The owner's context, holding the unlocked store keys
   */
  async adoptUserPageCatalog(ctx: ActorContext): Promise<number> {
    if (!this.provider?.adoptUserPageCatalog) return 0;
    return this.provider.adoptUserPageCatalog(ctx);
  }

  /**
   * Flush any pending write queues in the provider (e.g. page-index writes).
   * Call before process exit to prevent data loss on unclean shutdown.
   */
  async flushWriteQueue(): Promise<void> {
    const provider = this.provider as { flushWriteQueue?: () => Promise<void> } | null;
    if (provider?.flushWriteQueue) {
      await provider.flushWriteQueue();
    }
  }

  /**
   * Shutdown the PageManager and its provider
   *
   * Cleanly shuts down the provider, closing connections and flushing caches.
   *
   * @async
   * @returns {Promise<void>}
   */
  async shutdown(): Promise<void> {
    if (this.provider && this.provider.shutdown) {
      await this.provider.shutdown();
    }
    logger.info('PageManager shut down');
  }

  /**
   * Backup all pages through the provider
   *
   * Delegates to the provider's backup() method to serialize all page data.
   * The backup includes all page content, metadata, and directory structure.
   *
   * @returns {Promise<BackupData>} Backup data from provider
   */
  async backup(): Promise<BackupData> {
    logger.info('[PageManager] Starting backup...');

    if (!this.provider) {
      logger.warn('[PageManager] No provider available for backup');
      return {
        managerName: 'PageManager',
        timestamp: new Date().toISOString(),
        providerClass: null,
        data: null,
        note: 'No provider initialized'
      };
    }

    try {
      let providerBackup: Record<string, unknown> | null = null;
      if (this.provider.backup) {
        providerBackup = await this.provider.backup();
      }

      return {
        managerName: 'PageManager',
        timestamp: new Date().toISOString(),
        providerClass: this.providerClass,
        providerBackup: providerBackup
      };
    } catch (error) {
      logger.error('[PageManager] Backup failed:', error);
      throw error;
    }
  }

  /**
   * Restore pages from backup data
   *
   * Delegates to the provider's restore() method to recreate all pages
   * from the backup data.
   *
   * @param {BackupData} backupData - Backup data from backup() method
   * @returns {Promise<void>}
   */
  async restore(backupData: BackupData): Promise<void> {
    logger.info('[PageManager] Starting restore...');

    if (!backupData) {
      throw new Error('PageManager: No backup data provided for restore');
    }

    if (!this.provider) {
      throw new Error('PageManager: No provider available for restore');
    }

    // Check for provider mismatch
    if (backupData.providerClass && typeof backupData.providerClass === 'string' && backupData.providerClass !== this.providerClass) {
      logger.warn(`[PageManager] Provider mismatch: backup has ${backupData.providerClass}, current is ${this.providerClass}`);
    }

    try {
      if (backupData.providerBackup && this.provider.restore) {
        await this.provider.restore(backupData.providerBackup as Record<string, unknown>);
        logger.info('[PageManager] Restore completed successfully');
      } else {
        logger.warn('[PageManager] No provider backup data found in backup or provider does not support restore');
      }
    } catch (error) {
      logger.error('[PageManager] Restore failed:', error);
      throw error;
    }
  }
}

export default PageManager;
