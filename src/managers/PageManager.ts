import path from 'path';
import { systemContext, systemPrincipalOf } from '../context/bootActions.js';
import fse from 'fs-extra';
import matter from 'gray-matter';
import { parsePageFrontmatter } from '../utils/pageFrontmatter.js';
import { evaluateSeededAddonPage, pageSourceHash, REQUIRED_SOURCE_HASH_KEY } from '../utils/addonPageSync.js';
import { SeededShippedPages } from '../utils/seededShippedPages.js';
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
import type { ActorContext } from '../context/ActorContext.js';
import { DEFAULT_PRIVATE_STORE, privateStoreLayoutFromConfig } from '../utils/privateStorePath.js';
import { userIndexFor } from '../utils/privateStoreUnlock.js';
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

/** What {@link PageManager.savePageWithContext} wrote. */
export interface PageSaveResult {
  /** The body as saved — always the caller's text: a save never rewrites it (#1332). */
  content: string;
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
}

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
  failed: Array<{ file: string; title: string; reason: string }>;
  /** True when this run started the site's record for the source */
  recordStarted: boolean;
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
    const report: ShippedPageSeedReport = { seeded: [], present: 0, removed: [], excluded: [], failed: [], recordStarted: false };
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

        if (!uuidPattern.test(uuid) || !title || !slug) {
          report.failed.push({ file, title: title || file, reason: 'missing or invalid uuid, title or slug in frontmatter' });
          continue;
        }
        const duplicateOf = seen.get(uuid.toLowerCase());
        if (duplicateOf) {
          report.failed.push({ file, title, reason: `uuid ${uuid} is already used by ${duplicateOf}` });
          continue;
        }
        seen.set(uuid.toLowerCase(), file);

        const exclusion = source.exclude?.(parsed.data);
        if (exclusion) {
          report.excluded.push({ file, title, reason: exclusion });
          continue;
        }

        const live = Boolean(await this.storeCopyByUUID(uuid, source, ctx));
        if (record.has(source.id, uuid)) {
          if (live) report.present++;
          else report.removed.push(title);
          continue;
        }
        if (live) {
          record.add(source.id, uuid);
          report.present++;
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
          report.failed.push({ file, title, reason: err instanceof Error ? err.message : String(err) });
          continue;
        }
        record.add(source.id, uuid);
        report.seeded.push(title);
      } catch (err) {
        report.failed.push({ file, title: file, reason: err instanceof Error ? err.message : String(err) });
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
        await this.saveShippedPage(source, uuid, parsed, title, liveTitle || title, ctx);
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
      }
    };
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
    ctx: ActorContext
  ): Promise<void> {
    const metadata: Record<string, unknown> = {
      ...parsed.data,
      ...source.extraMetadata?.(parsed.data),
      uuid,
      title,
      [source.stampKey]: pageSourceHash(parsed.content),
      editor: systemPrincipalOf(this.engine)
    };
    delete metadata['user-modified'];

    await this.savePage(saveAs, parsed.content, metadata, ctx, { skipValidation: true });

    const searchManager = this.engine.getManager<{ updatePageInIndex?: (name: string, data: Record<string, unknown>) => Promise<void> }>('SearchManager');
    await searchManager?.updatePageInIndex?.(saveAs, { name: saveAs, content: parsed.content, metadata })
      .catch((err: unknown) => logger.warn(`[PageManager] Saved '${saveAs}' but could not index it for search:`, err));
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
        `${report.removed.length} removed on this site, ${report.excluded.length} github-only, ${report.failed.length} not seeded`
      );
      if (report.seeded.length > 0) {
        logger.info(`[PageManager] Seeded required pages: ${report.seeded.join(', ')}`);
        if (report.recordStarted) {
          logger.info(
            '[PageManager] This site had no seeded-pages record yet; it was started from the live and trashed ' +
            'required pages. Pages above were missing: new in this release, or removed before the record existed.'
          );
        }
      }
      if (report.failed.length > 0) {
        const lines = report.failed.map((f) => `${f.title} (${f.file}): ${f.reason}`);
        logger.warn(`[PageManager] Required pages not seeded: ${lines.join('; ')}`);
        const notificationManager = this.engine.getManager<NotificationManager>('NotificationManager');
        await notificationManager?.createNotification?.({
          type: 'system',
          level: 'warning',
          title: 'Required pages not seeded',
          message:
            `${report.failed.length} required page${report.failed.length === 1 ? '' : 's'} could not be added: ` +
            `${report.failed.map((f) => f.title).join(', ')}. See Admin → Required Pages Sync.`
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

  getPageUUID(identifier: string): string | null {
    return this.provider?.getPageUUID?.(identifier) ?? null;
  }

  invalidatePageCache(identifier: string): void {
    const resolvedTitle = this.provider?.invalidatePageCache?.(identifier) ?? null;
    const renderingManager = this.engine.getManager<{ invalidateHandlerCache(): void }>('RenderingManager');
    if (renderingManager) {
      renderingManager.invalidateHandlerCache();
    }
    if (resolvedTitle) {
      const uuid = this.provider?.getPageUUID?.(resolvedTitle) ?? resolvedTitle;
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
   * Admin-override save (#689): parse the raw file content (frontmatter +
   * body) with gray-matter and persist via provider.savePage, bypassing
   * ValidationManager.sanitizeMetadata and checkConflicts entirely. Used
   * by the admin "Edit raw" UI to fix pages where those gates would block
   * the very edit being attempted (corrupted YAML, duplicate-slug repairs,
   * etc.). The admin's identity does NOT propagate to the `editor` /
   * `lastModifiedBy` fields — that's audit-log territory (recorded by the
   * route handler, not here). The textarea is the source of truth.
   *
   * Versioning, indexing, and cache invalidation still fire via
   * provider.savePage. Throws if the textarea content isn't parseable YAML.
   */
  async saveRawPageWithAdminOverride(
    pageName: string,
    rawFileContent: string,
    ctx: ActorContext
  ): Promise<void> {
    if (!this.provider) throw new Error('PageManager: Provider not initialized');
    const parsed = parsePageFrontmatter(rawFileContent);
    const metadata = parsed.data as Partial<PageFrontmatter>;
    const content = parsed.content;
    return this.provider.savePage(pageName, content, metadata, ctx);
  }

  /**
   * Save page content and metadata using WikiContext
   *
   * Creates a new page or updates an existing one using WikiContext as the
   * single source of truth. Extracts page name, content, and author from context.
   *
   * @async
   * @param {WikiContext} wikiContext - The wiki context containing page and user info
   * @param {Partial<PageFrontmatter>} [metadata={}] - Additional frontmatter metadata
   * @returns {Promise<void>}
   *
   * @example
   * await pageManager.savePageWithContext(wikiContext, {
   *   tags: ['tutorial']
   * });
   */

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

  async savePageWithContext(
    wikiContext: WikiContext,
    metadata: Partial<PageFrontmatter> = {},
    options: PageSaveOptions = {}
  ): Promise<PageSaveResult> {
    if (!wikiContext) {
      throw new Error('PageManager.savePageWithContext requires a WikiContext');
    }

    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }

    // The save acts as the request's subject (#1179); a store write reaches
    // this session's keys through it (#1382).
    const saveContext = (wikiContext.userContext as ActorContext | undefined) ?? ANONYMOUS_SUBJECT;

    const pageName = wikiContext.pageName;

    // #1332: a save writes exactly what was typed. Converting page text —
    // JSPWiki syntax included — happens only in the NCM funnel (import,
    // ingest, Convert to NCM, migrations), never here: saves must stay fast
    // (#1333) and conversion has one owner.
    const content = wikiContext.content;

    await this.assertContentPasses(pageName, content, {
      userName: (wikiContext as unknown as { userContext?: { username?: string } }).userContext?.username,
      ...options
    });

    // Reject deprecated inline ACL markup — authors must use the audience front matter field instead
    if (content && /\[\{\s*(ALLOW|DENY)\b[^}]*\}\]/i.test(content)) {
      throw new Error(
        'Inline [{ALLOW}] / [{DENY}] markup is no longer supported. ' +
        'Use the Audience field in the page editor to control access.'
      );
    }

    // author — immutable original creator, set on ALL pages, never changes.
    // Used for both attribution display and private-page ACL ownership (see ACLManager).
    // Preserve from the existing page — must never be overwritten on edit.
    // For documentation/system category pages, default to 'system' if no user is present.
    const existingPage = pageName ? await this.provider.getPage(pageName, saveContext) : null;
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
    const viaToken = (wikiContext.userContext as { viaToken?: { name: string } } | undefined)?.viaToken;
    const existingCreatedVia = (existingPage?.metadata as Record<string, unknown> | undefined)?.['created-via-token'];

    // #1354: the author is the page's creator. An edit keeps it, and never
    // fills it in — the person editing a page that has no author did not create
    // it. Only a new page takes its author from the save.
    const rawMetadata: Partial<PageFrontmatter> = {
      ...metadata,
      author: existingPage
        ? originalAuthor
        : (wikiContext.userContext?.username || metadata.author || defaultAuthor)
    };
    if (!rawMetadata.author) delete rawMetadata.author;

    // #1354: `editor` is who made THIS version — the provider records it in the
    // version history and the page shows it as the last editor. It comes from
    // the save's context. Callers carry the page's stored frontmatter forward
    // (the save route's #803 step), and a stored `editor: system` from one
    // migration was stamped on every later human edit. A caller's own value is
    // used only when the context has no user (a system job).
    rawMetadata.editor = wikiContext.userContext?.username || metadata.editor || rawMetadata.author;

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
    // pass the OLD name as wikiContext.pageName with the new one in
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
      (rawMetadata.title) ?? pageName
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
      ...(wantsPrivate ? { private: true } : {})
    };

    // Sanitize all string fields — trims Unicode whitespace and decodes percent-encoded
    // characters (e.g. %09 → tab) before they reach the provider (#296)
    const validationManager = this.engine.getManager<ValidationManager>('ValidationManager');
    const enrichedMetadata = validationManager
      ? validationManager.sanitizeMetadata(metadataWithLocation) as Partial<PageFrontmatter>
      : metadataWithLocation;

    // Enforce uniqueness before delegating to provider — PageManager is the single
    // authority on uuid/title/slug uniqueness across the system (#510 architecture)
    if (validationManager) {
      const uuid = (enrichedMetadata as Record<string, unknown>).uuid as string | undefined ?? '';
      const slug = (enrichedMetadata as Record<string, unknown>).slug as string | undefined ?? '';
      const conflict = await validationManager.checkConflicts(uuid, pageName, slug, saveContext);
      if (conflict.hasConflict) {
        throw new Error(conflict.message ?? `Page conflict: ${conflict.conflictType}`);
      }
    }

    // If the page is private and the author changed (shouldn't happen normally), move the file.
    if (wantsPrivate && originalAuthor) {
      const incomingAuthor = (enrichedMetadata as Record<string, unknown>).author as string | undefined ?? '';
      if (incomingAuthor && incomingAuthor !== originalAuthor) {
        const uuid = (enrichedMetadata as Record<string, unknown>).uuid as string | undefined ?? '';
        if (uuid) await this.provider.movePrivatePage(uuid, originalAuthor, incomingAuthor);
      }
    }

    await this.provider.savePage(pageName, content, enrichedMetadata, saveContext);

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
      const finalTitle = (enrichedMetadata as Record<string, unknown>).title as string | undefined || pageName;
      const derivedOp: PageMutationOp = !existingPage
        ? 'create'
        : finalTitle !== pageName ? 'rename' : 'edit';
      const op = options.audit?.op ?? derivedOp;

      void recordAuditEvent(
        this.engine.getManager('AuditManager'),
        buildPageMutationAuditEvent({
          op,
          username: wikiContext.userContext?.username,
          ipAddress: options.audit?.ipAddress,
          pageName: op === 'rename' ? finalTitle : pageName,
          uuid: (enrichedMetadata as Record<string, unknown>).uuid as string | undefined,
          fromPageName: op === 'rename' ? pageName : null,
          rewriteOf: options.audit?.rewriteOf ?? null,
          viaToken: viaToken
        }),
        (err) => logger.warn(`Audit log failed for page.${op} of '${pageName}':`, err)
      );
    }

    return { content };
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
   * Save page content and metadata
   *
   * Creates a new page or updates an existing one. Handles UUID generation
   * for new pages and version management automatically.
   *
   * @async
   * @param {string} pageName - Page title
   * @param {string} content - Markdown content
   * @param {Partial<PageFrontmatter>} [metadata={}] - Frontmatter metadata
   * @returns {Promise<void>}
   * @deprecated Use savePageWithContext() with WikiContext instead
   *
   * @example
   * await pageManager.savePage('New Page', '# Hello World', {
   *   author: 'admin',
   *   tags: ['tutorial']
   * });
   */
  async savePage(
    pageName: string,
    content: string,
    metadata: Partial<PageFrontmatter> = {},
    ctx: ActorContext,
    options: PageSaveOptions = {}
  ): Promise<void> {
    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }
    if (!ctx) {
      throw new Error('PageManager.savePage requires an ActorContext');
    }
    await this.assertContentPasses(pageName, content, options);
    const validationManager = this.engine.getManager<ValidationManager>('ValidationManager');
    if (validationManager) {
      const uuid = (metadata as Record<string, unknown>).uuid as string ?? '';
      const slug = (metadata as Record<string, unknown>).slug as string ?? '';
      const conflict = await validationManager.checkConflicts(uuid, pageName, slug, ctx);
      if (conflict.hasConflict) {
        throw new Error(conflict.message ?? `Page conflict: ${conflict.conflictType}`);
      }
    }

    // Best-effort create-vs-edit. A provider without getPage, or a read that
    // fails, must not break the save — the distinction is a nicety and the
    // record is worth more than the accuracy of one field.
    const existed = typeof this.provider.getPage === 'function'
      ? Boolean(await this.provider.getPage(pageName, ctx).catch(() => null))
      : true;

    await this.provider.savePage(pageName, content, metadata, ctx);

    // #1121 gap C: this path produces NO audit event from the route layer,
    // because it has no request to audit from. Five callers use it —
    // UserManager profile pages, ImportManager, AddonsManager seeding — and
    // every one of them wrote content that appeared in no audit log at all.
    //
    // Emitted from the MANAGER rather than the caller, which is the point of
    // the gap: a record written here cannot be forgotten by the next caller.
    // The actor is 'system' because there is no user behind these, which is a
    // fact worth recording rather than a reason to record nothing.
    void recordAuditEvent(
      this.engine.getManager('AuditManager'),
      buildPageMutationAuditEvent({
        op: existed ? 'edit' : 'create',
        username: (metadata as Record<string, unknown>).editor as string | undefined ?? 'system',
        ipAddress: undefined,
        pageName,
        uuid: (metadata as Record<string, unknown>).uuid as string | undefined ?? null
      }),
      (err) => logger.warn(`[PageManager] Audit log failed for a system page write of '${pageName}':`, err)
    );
  }

  /**
   * Delete a page using WikiContext
   *
   * Removes a page from storage using WikiContext as the single source of truth.
   * Extracts the page name from the context.
   *
   * @async
   * @param {WikiContext} wikiContext - The wiki context containing page info
   * @returns {Promise<boolean>} True if deleted, false if not found
   *
   * @example
   * const deleted = await pageManager.deletePageWithContext(wikiContext);
   * if (deleted) console.log('Page removed');
   */
  async deletePageWithContext(wikiContext: WikiContext): Promise<boolean> {
    if (!wikiContext) {
      throw new Error('PageManager.deletePageWithContext requires a WikiContext');
    }

    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }

    const identifier = wikiContext.pageName;
    const deletedBy = wikiContext.userContext?.username || 'anonymous';

    logger.info(`[PageManager] Deleting page: ${identifier} by user: ${deletedBy}`);

    // #947: the context names who deleted the page on the tombstone (#1179).
    const ctx = (wikiContext.userContext as ActorContext | undefined) ?? ANONYMOUS_SUBJECT;
    return this.provider.deletePage(identifier, ctx);
  }

  /**
   * Delete a page
   *
   * Removes a page from storage. The page can be identified by UUID, title, or slug.
   *
   * @async
   * @param {string} identifier - Page UUID, title, or slug
   * @returns {Promise<boolean>} True if deleted, false if not found
   * @deprecated Use deletePageWithContext() with WikiContext instead
   *
   * @example
   * const deleted = await pageManager.deletePage('Old Page');
   * if (deleted) console.log('Page removed');
   */
  async deletePage(identifier: string, ctx: ActorContext): Promise<boolean> {
    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }
    if (!ctx) {
      throw new Error('PageManager.deletePage requires an ActorContext');
    }
    return this.provider.deletePage(identifier, ctx);
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
   * (`ACLManager.filterAccessiblePages`). Without an ACLManager nothing is
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
        }>('ACLManager');
    if (!acl) {
      logger.warn('[PageManager] listPagesFor: ACLManager unavailable — listing nothing');
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
  async getRecentChanges(options: RecentChangesOptions = {}): Promise<RecentChangeEntry[]> {
    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }
    return this.provider.getRecentChanges(options);
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
  async getPagesByCreator(username: string, options: GetPagesByCreatorOptions = {}): Promise<RecentChangeEntry[]> {
    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }
    return this.provider.getPagesByCreator(username, options);
  }

  /**
   * Pages most recently edited by a user (#640 Phase 2).
   */
  async getPagesByEditor(username: string, options: PagesScanOptions = {}): Promise<RecentChangeEntry[]> {
    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }
    return this.provider.getPagesByEditor(username, options);
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
   * Access). ACLManager's Tier 0 asks this, so every `canAccess` on a page —
   * view, edit, lists, the attachment door — reaches the same rule.
   *
   * `pages/private/{user}/` and every store below it is owned by that user.
   * Nobody else acts in it unless the owner delegated (a share the owner
   * issued, once the store's Share switch exists — #1388). No role reaches in,
   * admin included (security-posture P2: no `hasRole` as an allow).
   *
   * Owner is the page-index `creator` (sticky), not frontmatter `author`, so
   * reassigning `author` cannot move ownership (#711).
   *
   * Returns:
   *   - `null`  — the page is not private (or does not exist); the caller
   *               falls through to its next tier
   *   - `true`  — private, and the caller is the owner or the owner's delegate
   *   - `false` — private, and the caller is neither; also when privacy
   *               cannot be established (conservative, the #714 convention)
   */
  async checkPrivatePageAccess(wikiContext: WikiContext, pageNameOrUuid: string): Promise<boolean | null> {
    try {
      if (!this.provider) return null;
      const subject = wikiContext.userContext as ActorContext | undefined;
      const pageMetadata = await this.provider.getPageMetadata(pageNameOrUuid, subject ?? ANONYMOUS_SUBJECT);
      if (!pageMetadata?.uuid) return null;

      const owner = subject
        ? await this.getPrivatePageOwner(pageNameOrUuid, subject)
        : await this.getPrivatePageOwner(pageNameOrUuid, ANONYMOUS_SUBJECT);
      // Defensive: frontmatter says private but no owner is known — refuse.
      if (!owner) return (pageMetadata as Record<string, unknown>).private === true ? false : null;
      if (!subject) return false;
      return mayActInPrivateContainer(subject, owner.creator);
    } catch (err) {
      logger.warn(`[PageManager] private-access check failed for '${pageNameOrUuid}' — refusing: ${String(err)}`);
      return false;
    }
  }

  /**
   * Owner and store of a private page, or `null` when the page is not private
   * or does not exist (#1398). The author owns the page and every attachment
   * uploaded onto it, so AttachmentManager uses this to route a new upload into
   * that author's store.
   *
   * Owner is the page-index `creator` (sticky), not frontmatter `author`.
   * Unlocked sealed-store pages are not in the global index; they come from the
   * caller's session catalog, through `ctx` (#1385). Frontmatter is the last
   * resort for a provider without a page index.
   */
  async getPrivatePageOwner(
    pageNameOrUuid: string,
    ctx: ActorContext
  ): Promise<{ creator: string; store: string } | null> {
    if (!this.provider) return null;
    const pageMetadata = await this.provider.getPageMetadata(pageNameOrUuid, ctx);
    if (!pageMetadata?.uuid) return null;

    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const defaultStoreId = configManager
      ? privateStoreLayoutFromConfig((key, fallback) => configManager.getProperty(key, fallback)).defaultStoreId
      : DEFAULT_PRIVATE_STORE;

    const provider = this.provider as unknown as {
      pageIndex?: { pages: Record<string, { location?: string; creator?: string; store?: string }> }
    };
    const entry = provider.pageIndex?.pages[pageMetadata.uuid];
    if (entry?.location === 'private' && entry.creator) {
      return { creator: entry.creator, store: entry.store ?? defaultStoreId };
    }

    // An unlocked sealed page is in the caller's own session catalog, reached
    // through the context it was given — never an ambient session (P1).
    const sealed = userIndexFor(ctx)?.pages[pageMetadata.uuid];
    if (sealed) {
      return { creator: sealed.creator, store: sealed.store };
    }

    const md = pageMetadata as Record<string, unknown>;
    if (!entry && md.private === true && typeof md.author === 'string' && md.author) {
      return {
        creator: md.author,
        store: typeof md.store === 'string' && md.store ? md.store : defaultStoreId
      };
    }
    return null;
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
