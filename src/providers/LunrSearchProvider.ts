/**
 * LunrSearchProvider - Full-text search provider using Lunr.js
 *
 * Provides client-side full-text search with stemming, stopwords, and field boosting.
 * Suitable for small to medium-sized wikis (<10,000 pages).
 *
 * Configuration keys (all lowercase):
 * - ngdpbase.search.provider.lunr.indexdir - Directory for persisted index
 * - ngdpbase.search.provider.lunr.stemming - Enable/disable stemming
 * - ngdpbase.search.provider.lunr.boost.title - Title field boost factor
 * - ngdpbase.search.provider.lunr.boost.systemcategory - System category boost
 * - ngdpbase.search.provider.lunr.boost.userkeywords - User keywords boost
 * - ngdpbase.search.provider.lunr.boost.tags - Tags boost
 * - ngdpbase.search.provider.lunr.maxresults - Maximum results to return
 * - ngdpbase.search.provider.lunr.snippetlength - Snippet length in characters
 * - ngdpbase.search.provider.lunr.flushinterval - Document persistence flush interval (ms)
 *
 * Related: GitHub Issue #102 - Configuration reorganization
 * Related: GitHub Issue #267 - Incremental search index + document persistence
 */

import BaseSearchProvider, { SearchResult, SearchOptions, SearchCriteria, SearchStatistics, BackupData, WikiEngine } from './BaseSearchProvider.js';
import { WikiPage } from '../types/index.js';
import lunr from 'lunr';
import logger from '../utils/logger.js';
import fs from 'fs-extra';
import path from 'path';
import type MetricsManager from '../managers/MetricsManager.js';

/**
 * Lunr search index type (lunr types not fully typed)
 */
type LunrIndex = ReturnType<typeof lunr>;

/**
 * Lunr search result
 */
type LunrSearchResult = lunr.Index.Result;

/**
 * Document structure for indexing
 */
interface LunrDocument {
  id: string;
  title: string;
  content: string;
  body: string;
  systemCategory: string;
  /** #706: opt-in knowledge-graph role (source|citation|concept|''). Empty
   *  string when the field is absent — the common case for most pages. */
  knowledgeRole: string;
  userKeywords: string;
  tags: string;
  keywords: string;
  lastModified: string;
  /** ISO 8601 page creation timestamp (#754, v3.33.0). Optional because
   *  pre-migration synthetic test data may omit it. Indexed so #774's
   *  `dateField=created` filter can read it without a separate lookup. */
  created?: string;
  uuid: string;
  /** Original page author (from metadata.author frontmatter field) */
  author?: string;
  /** Last editor (from metadata.editor frontmatter field) */
  editor?: string;
  /** True if this page has location === 'private' in the page index */
  isPrivate?: boolean;
  /** Username that created the page (only set when isPrivate === true) */
  creator?: string;
  /** Frontmatter audience principals (#626) — populated for all pages, consulted at search time when isPrivate */
  audience?: string[];
}

/**
 * Provider configuration
 */
interface LunrConfig {
  indexDir: string;
  stemming: boolean;
  boost: {
    title: number;
    systemCategory: number;
    knowledgeRole: number;
    userKeywords: number;
    tags: number;
    keywords: number;
  };
  maxResults: number;
  snippetLength: number;
}

/**
 * Configuration Manager interface
 */
interface ConfigurationManager {
  getProperty<T>(key: string, defaultValue: T): T;
  getResolvedDataPath(key: string, defaultValue: string): string;
}

/**
 * Page Manager interface
 */
interface PageManager {
  getAllPages(): Promise<string[]>;
  getPage(pageName: string): Promise<WikiPage | null>;
}

/**
 * LunrSearchProvider - Full-text search using Lunr.js
 */
class LunrSearchProvider extends BaseSearchProvider {
  private searchIndex: LunrIndex | null;
  private documents: Record<string, LunrDocument>;
  private config: LunrConfig | null;
  private flushInterval: NodeJS.Timeout | null = null;
  private documentsPath: string | null = null;

  constructor(engine: WikiEngine) {
    super(engine);
    this.searchIndex = null;
    this.documents = {};
    this.config = null;
  }

  /**
   * Initialize the Lunr search provider
   * Loads configuration from ConfigurationManager
   * @returns {Promise<void>}
   */
  async initialize(): Promise<void> {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) {
      throw new Error('LunrSearchProvider requires ConfigurationManager');
    }

    // indexDir uses getResolvedDataPath to support INSTANCE_DATA_FOLDER
    const indexDir = configManager.getResolvedDataPath(
      'ngdpbase.search.provider.lunr.indexdir',
      './search-index'
    );

    // Load provider-specific settings (ALL LOWERCASE)
    this.config = {
      indexDir,
      stemming: configManager.getProperty<boolean>(
        'ngdpbase.search.provider.lunr.stemming',
        true
      ),
      boost: {
        title: configManager.getProperty<number>(
          'ngdpbase.search.provider.lunr.boost.title',
          10
        ),
        systemCategory: configManager.getProperty<number>(
          'ngdpbase.search.provider.lunr.boost.systemcategory',
          8
        ),
        // #706: knowledge-role boost — same weight as system-category since
        // both are short, high-signal axis fields.
        knowledgeRole: configManager.getProperty<number>(
          'ngdpbase.search.provider.lunr.boost.knowledgerole',
          8
        ),
        userKeywords: configManager.getProperty<number>(
          'ngdpbase.search.provider.lunr.boost.userkeywords',
          6
        ),
        tags: configManager.getProperty<number>(
          'ngdpbase.search.provider.lunr.boost.tags',
          5
        ),
        keywords: configManager.getProperty<number>(
          'ngdpbase.search.provider.lunr.boost.keywords',
          4
        )
      },
      maxResults: configManager.getProperty<number>(
        'ngdpbase.search.provider.lunr.maxresults',
        50
      ),
      snippetLength: configManager.getProperty<number>(
        'ngdpbase.search.provider.lunr.snippetlength',
        200
      )
    };

    // Set up documents persistence
    this.documentsPath = path.resolve(indexDir, 'documents.json');
    fs.mkdirSync(indexDir, { recursive: true });
    await this.loadPersistedDocuments();

    // Set up periodic flush (default 5 minutes)
    const intervalMs = configManager.getProperty<number>(
      'ngdpbase.search.provider.lunr.flushinterval',
      300000
    );
    this.flushInterval = setInterval(() => { void this.persistDocuments(); }, intervalMs).unref();

    this.initialized = true;

    logger.info('[LunrSearchProvider] Initialized with stemming=' +
      this.config.stemming + ', maxResults=' + this.config.maxResults);
    logger.info(`[LunrSearchProvider] Documents path: ${this.documentsPath}, flush interval: ${intervalMs}ms`);
  }

  /**
   * Load persisted documents from disk
   */
  private async loadPersistedDocuments(): Promise<void> {
    if (!this.documentsPath) return;
    try {
      const raw = await fs.readFile(this.documentsPath, 'utf8');
      const data = JSON.parse(raw) as { savedAt: string; documents: Record<string, LunrDocument> };
      this.documents = data.documents;
      logger.info(`[LunrSearchProvider] Loaded ${Object.keys(this.documents).length} documents from disk`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.info('[LunrSearchProvider] No persisted documents found, will build from pages');
      } else {
        logger.warn('[LunrSearchProvider] Failed to load persisted documents:', (err as Error).message);
      }
    }
  }

  /**
   * Persist documents to disk
   */
  private async persistDocuments(): Promise<void> {
    if (!this.documentsPath || Object.keys(this.documents).length === 0) return;
    try {
      const data = { savedAt: new Date().toISOString(), documents: this.documents };
      await fs.writeFile(this.documentsPath, JSON.stringify(data, null, 2), 'utf8');
      logger.debug(`[LunrSearchProvider] Persisted ${Object.keys(this.documents).length} documents to disk`);
    } catch (err) {
      logger.error('[LunrSearchProvider] Failed to persist documents:', (err as Error).message);
    }
  }

  /**
   * Rebuild the Lunr index from in-memory documents — no NAS reads, pure CPU
   */
  private rebuildLunrFromDocuments(): void {
    if (!this.config) return;
    const boostConfig = this.config.boost;
    const docs = this.documents;
    this.searchIndex = lunr(function () {
      this.ref('id');
      this.field('title', { boost: boostConfig.title });
      this.field('content');
      this.field('systemCategory', { boost: boostConfig.systemCategory });
      this.field('knowledgeRole', { boost: boostConfig.knowledgeRole });
      this.field('userKeywords', { boost: boostConfig.userKeywords });
      this.field('tags', { boost: boostConfig.tags });
      this.field('keywords', { boost: boostConfig.keywords });
      Object.values(docs).forEach(doc => { this.add(doc); });
    });
  }

  /**
   * Convert page data from WikiRoutes into a LunrDocument
   */
  private buildDocumentFromPageData(pageName: string, pageData: Record<string, unknown>): LunrDocument {
    const toStr = (val: unknown, fallback = ''): string => {
      if (typeof val === 'string') return val;
      if (typeof val === 'number' || typeof val === 'boolean') return String(val);
      return fallback;
    };
    const toStrArr = (v: unknown): string[] => {
      if (Array.isArray(v)) return v.map(String).filter(Boolean);
      if (typeof v === 'string' && v) return [v];
      return [];
    };

    const metadata = (pageData.metadata as Record<string, unknown>) || {};
    const userKeywordsRaw = metadata['user-keywords'];
    const userKeywords = Array.isArray(userKeywordsRaw)
      ? userKeywordsRaw.join(',')
      : toStr(userKeywordsRaw);
    const tagsRaw = metadata['tags'];
    const tags = Array.isArray(tagsRaw) ? tagsRaw.join(' ') : toStr(tagsRaw);
    const content = toStr(pageData.content);

    // #802 Slice 4: `private:true` is the sole privacy signal. Legacy
    // `system-location:'private'` fallback retired after the migration.
    // `pageData.isPrivate` is kept as a caller-level convenience for callers
    // that pre-derived the flag from frontmatter (back-compat for in-memory data).
    const isPrivate = metadata.private === true || pageData.isPrivate === true;
    const creator = typeof pageData.creator === 'string' ? pageData.creator
      : typeof metadata.author === 'string' ? metadata.author
        : undefined;
    // #626: denormalize frontmatter audience for all pages so the search-time
    // filter can honor it (mirrors ElasticsearchSearchProvider). Populated
    // unconditionally; consulted only when isPrivate at search time.
    const audience = toStrArr(metadata['audience']);

    return {
      id: pageName,
      title: toStr(metadata.title) || pageName,
      content,
      body: content,
      systemCategory: toStr(metadata['system-category']),
      knowledgeRole: toStr(metadata['knowledge-role']),
      userKeywords,
      tags,
      keywords: `${userKeywords} ${tags}`,
      lastModified: toStr(metadata.lastModified),
      created: toStr(metadata.created) || undefined,
      uuid: toStr(metadata.uuid),
      author: toStr(metadata.author) || undefined,
      editor: toStr(metadata.editor) || undefined,
      isPrivate: isPrivate || undefined,
      creator: isPrivate ? creator : undefined,
      audience: audience.length > 0 ? audience : undefined
    };
  }

  /**
   * Get provider information
   * @returns {Object} Provider metadata
   */
  getProviderInfo(): { name: string; version: string; description: string; features: string[] } {
    return {
      name: 'LunrSearchProvider',
      version: '1.0.0',
      description: 'Full-text search using Lunr.js',
      features: ['full-text', 'stemming', 'field-boosting', 'snippets', 'suggestions']
    };
  }

  /**
   * Build search index from all pages
   * @returns {Promise<void>}
   */
  async buildIndex(): Promise<void> {
    const metricsStart = Date.now();

    // Fast path: documents already loaded from disk — skip NAS reads entirely
    if (Object.keys(this.documents).length > 0) {
      this.rebuildLunrFromDocuments();
      this.engine.getManager<MetricsManager>('MetricsManager')
        ?.recordSearchRebuild?.(Date.now() - metricsStart);
      logger.info(`[LunrSearchProvider] Index rebuilt from ${Object.keys(this.documents).length} persisted documents (no NAS reads)`);
      return;
    }

    // Cold path: no documents in memory — read all pages from NAS (existing logic)
    const pageManager = this.engine.getManager<PageManager>('PageManager');
    if (!pageManager) {
      logger.warn('[LunrSearchProvider] PageManager not available for indexing');
      return;
    }

    try {
      const pageNames = await pageManager.getAllPages();
      const documents: Record<string, LunrDocument> = {};

      // #626: cold path now uses buildDocumentFromPageData so isPrivate /
      // creator / audience are populated for all pages. Pre-#626 the cold
      // path inlined a partial doc shape that omitted these fields, leaving
      // a window after first index where private pages were searchable as
      // public until the next savePage triggered an incremental re-index.
      for (const pageName of pageNames) {
        const pageData = await pageManager.getPage(pageName);
        if (!pageData) {
          continue; // Skip if page can't be loaded
        }
        documents[pageName] = this.buildDocumentFromPageData(
          pageName,
          pageData as unknown as Record<string, unknown>
        );
      }

      this.documents = documents;
      this.rebuildLunrFromDocuments();

      this.engine.getManager<MetricsManager>('MetricsManager')?.recordSearchRebuild?.(Date.now() - metricsStart);
      logger.info(`[LunrSearchProvider] Index built with ${Object.keys(documents).length} documents`);
      await this.persistDocuments();
    } catch (err) {
      this.engine.getManager<MetricsManager>('MetricsManager')?.recordSearchRebuild?.(Date.now() - metricsStart);
      logger.error('[LunrSearchProvider] Failed to build search index:', err);
      throw err;
    }
  }

  /**
   * Search for pages matching the query
   * @param {string} query - Search query
   * @param {SearchOptions} options - Search options
   * @returns {Promise<SearchResult[]>} Search results
   */
  search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    if (!this.searchIndex || !query) {
      return Promise.resolve([] as SearchResult[]);
    }

    try {
      const maxResults = options.maxResults || this.config?.maxResults || 50;
      const results: LunrSearchResult[] = this.searchIndex.search(query);

      // Extract user context for private-page filtering
      const wikiContext = options.wikiContext;
      const isAdmin = wikiContext?.hasRole?.('admin') ?? false;
      const username = wikiContext?.userContext?.username;
      // #626: principals from WikiContext.getPrincipals() — same source ES uses
      // for its audience filter. Mirrors ElasticsearchSearchProvider semantics.
      const principals = wikiContext?.getPrincipals?.() ?? [];

      const searchResults = results
        .map(result => {
          const doc = this.documents[result.ref];
          if (!doc) return null;

          // Filter out private pages the current user cannot access
          if (doc.isPrivate) {
            const isCreator = username !== undefined && username === doc.creator;
            // #626: honor frontmatter audience — the user can see a private
            // page if any of their principals appears in the page's audience.
            const inAudience = Array.isArray(doc.audience)
              && principals.some(p => doc.audience!.includes(p));
            if (!isAdmin && !isCreator && !inAudience) return null;
          }

          // #627: AuthorLocked is intentionally NOT a search-visibility filter.
          // It is an *edit* constraint (parallel to git branch protection) —
          // locked pages remain freely readable. Search is a discovery surface
          // for read access; conflating edit and read on different axes weakens
          // the model. Closed wontfix; see issue for the discussion.

          // Generate snippet
          const snippet = this.generateSnippet(doc.content, query);

          return {
            name: result.ref,
            title: doc.title,
            score: result.score,
            snippet: snippet,
            metadata: {
              wordCount: doc.content.split(/\s+/).length,
              tags: doc.tags,
              systemCategory: doc.systemCategory,
              knowledgeRole: doc.knowledgeRole,
              userKeywords: doc.userKeywords,
              lastModified: doc.lastModified,
              created: doc.created,
              author: doc.author,
              editor: doc.editor
            }
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .slice(0, maxResults);

      return Promise.resolve(searchResults);
    } catch (err) {
      logger.error('[LunrSearchProvider] Search failed:', err);
      return Promise.resolve([] as SearchResult[]);
    }
  }

  /**
   * Private-page visibility check (#731/#716). Mirrors the inline filter in
   * search() (the text path). Used by the no-text advancedSearch branch,
   * which would otherwise return private pages to any caller. A page is
   * visible if it is not private, or the caller is admin / its creator /
   * in its frontmatter audience.
   */
  private isDocVisible(doc: LunrDocument, wikiContext?: SearchOptions['wikiContext']): boolean {
    if (!doc.isPrivate) return true;
    if (wikiContext?.hasRole?.('admin')) return true;
    const username = wikiContext?.userContext?.username;
    if (username !== undefined && username === doc.creator) return true;
    const principals = wikiContext?.getPrincipals?.() ?? [];
    return Array.isArray(doc.audience) && principals.some(p => doc.audience!.includes(p));
  }

  /**
   * Advanced search with multiple criteria
   * @param {SearchCriteria} options - Search criteria
   * @returns {Promise<SearchResult[]>} Search results
   */
  async advancedSearch(options: SearchCriteria = {}): Promise<SearchResult[]> {
    const {
      query = '',
      categories = [],
      knowledgeRoles = [],
      userKeywords = [],
      searchIn = ['all'],
      author = '',
      editor = ''
    } = options;
    const maxResults: number = (options.maxResults as number) ?? this.config?.maxResults ?? 50;

    // Normalize arrays
    const categoryList = Array.isArray(categories) ? categories : (categories ? [categories] : []);
    const roleList = Array.isArray(knowledgeRoles) ? knowledgeRoles : (knowledgeRoles ? [knowledgeRoles] : []);
    const keywordList = Array.isArray(userKeywords) ? userKeywords : (userKeywords ? [userKeywords] : []);
    const searchInList = Array.isArray(searchIn) ? searchIn : (searchIn ? [searchIn] : ['all']);

    let results: SearchResult[] = [];

    if (query.trim()) {
      // Build field-specific query based on searchIn option
      let searchQuery = query;

      // If not searching all fields, construct field-specific query
      if (!searchInList.includes('all') && searchInList.length > 0) {
        // Map searchIn values to Lunr field names
        const fieldMap: Record<string, string> = {
          'title': 'title',
          'content': 'content',
          'category': 'systemCategory',
          'keywords': 'userKeywords'
        };

        const fields = searchInList
          .filter(field => fieldMap[field])
          .map(field => fieldMap[field]);

        // #740: tokenize the user query, stripping quote/punctuation chars
        // Lunr does not understand (it has no phrase syntax — `"a b"` would
        // otherwise leave a stray `"a`/`b"` term).
        const tokens = query.toLowerCase().split(/[^a-z0-9]+/i).filter(Boolean);

        if (fields.length === 1 && tokens.length > 0) {
          // Single field (the #739 title-default common case): require EVERY
          // token in that field. `+field:tok` = presence-required + field-
          // scoped → AND. Fixes #740: a multi-word query like
          // "Public Education" no longer matches a page that merely has the
          // words scattered across other fields (the Boise-ID example), and
          // each term is genuinely title-scoped (Lunr's `field:` prefix only
          // binds the next term, so the old `title:Public Education` left
          // "Education" unscoped + OR'd).
          searchQuery = tokens.map(t => `+${fields[0]}:${t}`).join(' ');
          logger.debug(`[LunrSearchProvider] Field-scoped AND search: "${searchQuery}"`);
        } else if (fields.length > 0) {
          // Multi-field: keep the prior best-effort field:query form (not the
          // reported #740 case; avoid over-engineering the multi-field query).
          searchQuery = fields.map(f => `${f}:${query}`).join(' ');
          logger.debug(`[LunrSearchProvider] Field-specific search: "${searchQuery}" (searchIn: [${searchInList.join(', ')}])`);
        }
      }

      // Start with text search. #731/#716: pass wikiContext so search()'s
      // private-page filter uses the real caller (previously dropped here,
      // which both over-hid private pages from authorized users and, on the
      // no-text branch below, leaked them).
      results = await this.search(searchQuery, {
        maxResults: maxResults * 2,
        wikiContext: options.wikiContext as SearchOptions['wikiContext']
      });
    } else {
      // No text query, get all documents — ACL-filtered (#731/#716): the
      // raw documents map has no private filter; apply the same visibility
      // rule search() uses so browse-all / category-only / keyword-only
      // page searches never expose private pages.
      const wc = options.wikiContext as SearchOptions['wikiContext'];
      results = Object.keys(this.documents)
        .filter(name => this.isDocVisible(this.documents[name], wc))
        .map(name => ({
          name,
          title: this.documents[name].title || name,
          score: 1.0,
          snippet: this.documents[name].content.substring(0, this.config?.snippetLength ?? 200),
          metadata: {
            systemCategory: this.documents[name].systemCategory,
            knowledgeRole: this.documents[name].knowledgeRole,
            userKeywords: this.documents[name].userKeywords,
            tags: this.documents[name].tags,
            lastModified: this.documents[name].lastModified,
            created: this.documents[name].created,
            author: this.documents[name].author,
            editor: this.documents[name].editor
          }
        }));
    }

    // Filter by categories if specified (case-insensitive)
    if (categoryList.length > 0) {
      const beforeCount = results.length;
      results = results.filter(result => {
        const docCategory = result.metadata.systemCategory;
        if (!docCategory || typeof docCategory !== 'string') {
          logger.debug(`[LunrSearchProvider] No category for: ${result.name}`);
          return false;
        }

        // Case-insensitive comparison
        const docCategoryStr = docCategory;
        const docCategoryLower = docCategoryStr.toLowerCase();
        const matches = categoryList.some(cat => cat.toLowerCase() === docCategoryLower);

        if (!matches) {
          logger.debug(`[LunrSearchProvider] Filtered out ${result.name}: category "${docCategoryStr}" not in [${categoryList.join(', ')}]`);
        }

        return matches;
      });
      logger.info(`[LunrSearchProvider] Category filter: ${beforeCount} -> ${results.length} results (filter: [${categoryList.join(', ')}])`);
    }

    // #706: Filter by knowledge-role if specified (case-insensitive). Pages
    // without a role are excluded when this filter is active — that's the
    // whole point of opting in.
    if (roleList.length > 0) {
      const beforeCount = results.length;
      const roleListLower = roleList.map(r => r.toLowerCase());
      results = results.filter(result => {
        const docRole = result.metadata.knowledgeRole;
        if (!docRole || typeof docRole !== 'string') return false;
        return roleListLower.includes(docRole.toLowerCase());
      });
      logger.info(`[LunrSearchProvider] Knowledge-role filter: ${beforeCount} -> ${results.length} results (filter: [${roleList.join(', ')}])`);
    }

    // Filter by user keywords if specified (exact word matching)
    if (keywordList.length > 0) {
      results = results.filter(result => {
        const rawKeywords = result.metadata.userKeywords;
        const docKeywords = typeof rawKeywords === 'string' ? rawKeywords : '';
        const docKeywordList = docKeywords.toLowerCase().split(',').map(k => k.trim()).filter(k => k);
        return keywordList.some(keyword =>
          docKeywordList.includes(keyword.toLowerCase().trim())
        );
      });
    }

    // Filter by author if specified (case-insensitive exact match against metadata.author)
    if (author) {
      const authorLower = author.toLowerCase();
      results = results.filter(result => {
        const docAuthor = typeof result.metadata.author === 'string' ? result.metadata.author : '';
        return docAuthor.toLowerCase() === authorLower;
      });
    }

    // Filter by editor if specified (case-insensitive exact match against metadata.editor)
    if (editor) {
      const editorLower = editor.toLowerCase();
      results = results.filter(result => {
        const docEditor = typeof result.metadata.editor === 'string' ? result.metadata.editor : '';
        return docEditor.toLowerCase() === editorLower;
      });
    }

    // #643 / #774: filter by date range (inclusive, whole-day). `dateField`
    // selects the source field — `'modified'` (default) reads
    // `metadata.lastModified`; `'created'` reads `metadata.created` (per-page
    // creation timestamp added in #754, v3.33.0). Honours the existing
    // SearchCriteria.dateRange contract (ES already does the same).
    // Bounds are YYYY-MM-DD day edges (UTC). Missing-`created` rows are
    // treated as non-matches under `dateField=created` (every production
    // page carries `created` post-#754 backfill — the no-match path only
    // hits synthetic test data).
    const dateRange = options.dateRange;
    if (dateRange && (dateRange.from || dateRange.to)) {
      const fromTs = dateRange.from ? Date.parse(`${dateRange.from}T00:00:00.000Z`) : -Infinity;
      const toTs = dateRange.to ? Date.parse(`${dateRange.to}T23:59:59.999Z`) : Infinity;
      const dateField = options.dateField === 'created' ? 'created' : 'lastModified';
      results = results.filter(result => {
        const raw = result.metadata[dateField];
        if (typeof raw !== 'string' || !raw) return false;
        const ts = Date.parse(raw);
        return !Number.isNaN(ts) && ts >= fromTs && ts <= toTs;
      });
    }

    // Limit results
    return results.slice(0, maxResults);
  }

  /**
   * Generate a snippet with highlighted search terms
   * @param {string} content - Full content
   * @param {string} query - Search query
   * @returns {string} Content snippet
   */
  private generateSnippet(content: string, query: string): string {
    const maxLength = this.config?.snippetLength ?? 200;
    // #740: `query` may be a Lunr query string (e.g. `+title:public`), not a
    // bare phrase. Strip Lunr operators (presence +/-, `field:` prefix,
    // trailing wildcard/fuzzy/boost) and regex-escape each term before it is
    // used to build a highlight RegExp — otherwise `new RegExp('+title:...')`
    // throws "Nothing to repeat" and the whole search returns no results.
    const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchTerms = query
      .toLowerCase()
      .split(/\s+/)
      .map(t => t
        .replace(/^[+-]/, '')
        .replace(/^[a-z]+:/i, '')
        .replace(/[*~^].*$/, ''))
      .filter(Boolean);

    // Find best position for snippet
    let bestPosition = 0;
    let bestScore = 0;

    const words = content.split(/\s+/);
    for (let i = 0; i < words.length - 20; i++) {
      const window = words.slice(i, i + 20).join(' ').toLowerCase();
      let score = 0;

      searchTerms.forEach(term => {
        const matches = (window.match(new RegExp(escapeRe(term), 'gi')) || []).length;
        score += matches;
      });

      if (score > bestScore) {
        bestScore = score;
        bestPosition = i;
      }
    }

    // Extract snippet
    const snippetWords = words.slice(bestPosition, bestPosition + 30);
    let snippet = snippetWords.join(' ');

    if (snippet.length > maxLength) {
      snippet = snippet.substring(0, maxLength) + '...';
    }

    // Highlight search terms
    searchTerms.forEach(term => {
      const regex = new RegExp(`(${escapeRe(term)})`, 'gi');
      snippet = snippet.replace(regex, '<mark>$1</mark>');
    });

    return snippet;
  }

  /**
   * Get search suggestions for autocomplete
   * @param {string} partial - Partial search term
   * @returns {Promise<string[]>} Suggested completions
   */
  getSuggestions(partial: string): Promise<string[]> {
    if (!partial || partial.length < 2) {
      return Promise.resolve([] as string[]);
    }

    const suggestions = new Set<string>();
    const partialLower = partial.toLowerCase();

    // Get page name suggestions
    Object.keys(this.documents).forEach(pageName => {
      if (pageName.toLowerCase().includes(partialLower)) {
        suggestions.add(pageName);
      }
    });

    // Get content-based suggestions (extract common words)
    Object.values(this.documents).forEach(doc => {
      const words = doc.content.toLowerCase().match(/\b\w{3,}\b/g) || [];
      words.forEach(word => {
        if (word.startsWith(partialLower) && suggestions.size < 10) {
          suggestions.add(word);
        }
      });
    });

    return Promise.resolve(Array.from(suggestions).slice(0, 10));
  }

  /**
   * Suggest similar pages based on content
   * @param {string} pageName - Source page name
   * @param {number} limit - Maximum suggestions
   * @returns {Promise<SearchResult[]>} Suggested pages
   */
  async suggestSimilarPages(pageName: string, limit: number = 5): Promise<SearchResult[]> {
    if (!this.searchIndex || !this.documents[pageName]) {
      return [];
    }

    try {
      const sourceDoc = this.documents[pageName];

      // Extract key terms from source page
      const words = sourceDoc.content.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 3);

      // Get most frequent words as search terms
      const wordCounts: Record<string, number> = {};
      words.forEach(word => {
        wordCounts[word] = (wordCounts[word] || 0) + 1;
      });

      const keyTerms = Object.entries(wordCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(entry => entry[0]);

      // Search for similar pages
      const query = keyTerms.join(' ');
      const results = await this.search(query, { maxResults: limit + 1 });

      // Filter out the source page
      return results.filter(result => result.name !== pageName).slice(0, limit);
    } catch (err) {
      logger.error('[LunrSearchProvider] Similar page suggestion failed:', err);
      return [];
    }
  }

  /**
   * Add or update a page in the search index incrementally
   * @param {string} pageName - Page name
   * @param {Record<string, unknown>} pageData - Page data
   * @returns {Promise<void>}
   */
  async updatePageInIndex(pageName: string, pageData: Record<string, unknown>): Promise<void> {
    this.documents[pageName] = this.buildDocumentFromPageData(pageName, pageData);
    this.rebuildLunrFromDocuments();
    await this.persistDocuments();
    logger.debug(`[LunrSearchProvider] Incrementally updated index for page: ${pageName}`);
  }

  /**
   * Remove a page from the search index
   * @param {string} pageName - Page name to remove
   * @returns {Promise<void>}
   */
  async removePageFromIndex(pageName: string): Promise<void> {
    if (!this.documents[pageName]) {
      return;
    }

    delete this.documents[pageName];
    this.rebuildLunrFromDocuments();
    await this.persistDocuments();
  }

  /**
   * True rebuild from disk — mirrors MediaManager.rebuildIndex().
   *
   * #724: buildIndex() has a fast path that, when this.documents is
   * non-empty (always, in steady state), rebuilds Lunr from the persisted
   * map WITHOUT re-reading pages from disk. That makes a deleted page's
   * index entry ("ghost") unkillable — a normal reindex can never drop it.
   * rebuild() is the missing "Rebuild" half (vs the "Reindex"/rescan that
   * buildIndex provides): it clears the in-memory map AND deletes the
   * persisted documents.json, then forces the cold disk-scan path. Pages
   * that no longer exist on disk are dropped by construction.
   *
   * documents.json is a derived cache (regenerated here from PageManager),
   * never source data — deleting it is safe and not the data/-tree rule.
   */
  async rebuild(): Promise<void> {
    logger.info('[LunrSearchProvider] rebuild() — clearing index + persisted documents, rescanning all pages from disk');
    this.documents = {};
    try {
      if (this.documentsPath && await fs.pathExists(this.documentsPath)) {
        await fs.remove(this.documentsPath);
        logger.debug(`[LunrSearchProvider] Deleted persisted documents: ${this.documentsPath}`);
      }
    } catch (err) {
      logger.warn(`[LunrSearchProvider] Could not delete persisted documents: ${err instanceof Error ? err.message : String(err)}`);
    }
    // this.documents is now empty → buildIndex() takes the cold path:
    // re-scan every page from PageManager and re-persist. Ghosts gone.
    await this.buildIndex();
  }

  /**
   * Get all unique categories from indexed documents
   * @returns {Promise<string[]>} List of categories
   */
  getAllCategories(): Promise<string[]> {
    const categories = new Set<string>();
    Object.values(this.documents).forEach(doc => {
      if (doc.systemCategory && doc.systemCategory.trim()) {
        categories.add(doc.systemCategory.trim());
      }
    });
    return Promise.resolve(Array.from(categories).sort());
  }

  /**
   * Get all unique user keywords from indexed documents
   * @returns {Promise<string[]>} List of user keywords
   */
  getAllUserKeywords(): Promise<string[]> {
    const keywords = new Set<string>();
    Object.values(this.documents).forEach(doc => {
      if (doc.userKeywords && doc.userKeywords.trim()) {
        doc.userKeywords.split(/[,\s]+/).forEach(keyword => {
          const clean = keyword.trim();
          if (clean) {
            keywords.add(clean);
          }
        });
      }
    });
    return Promise.resolve(Array.from(keywords).sort());
  }

  /**
   * Search by category only
   * @param {string} category - Category to search for
   * @returns {Promise<SearchResult[]>} Pages in category
   */
  getAllDocuments(): Promise<SearchResult[]> {
    const results = Object.values(this.documents).map(doc => ({
      name: doc.id,
      title: doc.title,
      score: 1,
      snippet: '',
      metadata: {
        wordCount: doc.content.split(/\s+/).length,
        systemCategory: doc.systemCategory,
        userKeywords: doc.userKeywords.split(' ').filter((k: string) => k.trim()),
        tags: doc.tags.split(' ').filter((t: string) => t.trim()),
        lastModified: doc.lastModified
      }
    }));
    return Promise.resolve(results);
  }

  searchByCategory(category: string): Promise<SearchResult[]> {
    if (!category) return Promise.resolve([] as SearchResult[]);

    const results = Object.values(this.documents)
      .filter(doc => doc.systemCategory &&
        doc.systemCategory.toLowerCase().includes(category.toLowerCase()))
      .map(doc => ({
        name: doc.id,
        title: doc.title,
        score: 1,
        snippet: this.generateSnippet(doc.content, category),
        metadata: {
          wordCount: doc.content.split(/\s+/).length,
          systemCategory: doc.systemCategory,
          userKeywords: doc.userKeywords.split(' ').filter(k => k.trim()),
          tags: doc.tags.split(' ').filter(t => t.trim()),
          lastModified: doc.lastModified
        }
      }));
    return Promise.resolve(results);
  }

  /**
   * Search by user keywords only
   * @param {string} keyword - Keyword to search for
   * @returns {Promise<SearchResult[]>} Pages with keyword
   */
  searchByUserKeywords(keyword: string): Promise<SearchResult[]> {
    if (!keyword) return Promise.resolve([] as SearchResult[]);

    const keywordLower = keyword.toLowerCase();
    const results = Object.values(this.documents)
      .filter(doc => {
        const docKeywordList = doc.userKeywords.toLowerCase().split(/\s+/).filter(k => k);
        return docKeywordList.includes(keywordLower);
      })
      .map(doc => ({
        name: doc.id,
        title: doc.title,
        score: 1,
        snippet: this.generateSnippet(doc.content, keyword),
        metadata: {
          wordCount: doc.content.split(/\s+/).length,
          systemCategory: doc.systemCategory,
          userKeywords: doc.userKeywords.split(' ').filter(k => k.trim()),
          tags: doc.tags.split(' ').filter(t => t.trim()),
          lastModified: doc.lastModified
        }
      }));
    return Promise.resolve(results);
  }

  /**
   * Get search statistics
   * @returns {Promise<SearchStatistics>} Search statistics
   */
  async getStatistics(): Promise<SearchStatistics> {
    const categories = await this.getAllCategories();
    const userKeywords = await this.getAllUserKeywords();
    return {
      totalDocuments: Object.keys(this.documents).length,
      indexSize: this.searchIndex ? JSON.stringify(this.searchIndex).length : 0,
      averageDocumentLength: Object.values(this.documents).reduce((sum, doc) =>
        sum + doc.content.length, 0) / Object.keys(this.documents).length || 0,
      totalCategories: categories.length,
      totalUserKeywords: userKeywords.length,
      providerName: 'LunrSearchProvider',
      providerVersion: this.getProviderInfo().version,
      documentCount: Object.keys(this.documents).length
    };
  }

  /**
   * Get the total number of indexed documents
   * @returns {Promise<number>} Number of documents
   */
  getDocumentCount(): Promise<number> {
    return Promise.resolve(Object.keys(this.documents).length);
  }

  /**
   * Check if the search provider is healthy/functional
   * @returns {Promise<boolean>} True if healthy
   */
  isHealthy(): Promise<boolean> {
    try {
      // Check if index exists and has documents
      const healthy = this.initialized && this.searchIndex !== null &&
        Object.keys(this.documents).length > 0;
      return Promise.resolve(healthy);
    } catch (error) {
      logger.error('[LunrSearchProvider] Health check failed:', error);
      return Promise.resolve(false);
    }
  }

  /**
   * Close/cleanup the search provider, flushing documents to disk
   * @returns {Promise<void>}
   */
  async close(): Promise<void> {
    try {
      if (this.flushInterval) {
        clearInterval(this.flushInterval);
        this.flushInterval = null;
      }
      await this.persistDocuments();
      this.searchIndex = null;
      this.documents = {};
      this.initialized = false;
      logger.info('[LunrSearchProvider] Closed and documents flushed to disk');
    } catch (error) {
      logger.error('[LunrSearchProvider] Close error:', error);
    }
  }

  /**
   * Backup search index and configuration
   * @returns {Promise<BackupData>} Backup data
   */
  async backup(): Promise<BackupData> {
    const baseBackup = await super.backup();
    return {
      ...baseBackup,
      config: { ...this.config },
      documentCount: Object.keys(this.documents).length,
      documents: { ...this.documents },
      statistics: await this.getStatistics()
    };
  }

  /**
   * Restore search index from backup
   * @param {BackupData} backupData - Backup data
   * @returns {Promise<void>}
   */
  async restore(backupData: BackupData): Promise<void> {
    if (backupData.documents) {
      this.documents = backupData.documents as Record<string, LunrDocument>;
      await this.buildIndex();
      logger.info(`[LunrSearchProvider] Restored ${Object.keys(this.documents).length} documents from backup`);
    }
  }
}

export default LunrSearchProvider;

