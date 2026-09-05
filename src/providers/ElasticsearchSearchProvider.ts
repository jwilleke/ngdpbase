/**
 * ElasticsearchSearchProvider — full-text search provider backed by Elasticsearch.
 *
 * An optional replacement for LunrSearchProvider suitable for wikis with tens of
 * thousands of pages or multi-node deployments. Lunr remains the default; opt in
 * by setting:
 *   "ngdpbase.search.provider": "elasticsearchsearchprovider"
 *
 * Configuration keys (all lowercase):
 *   ngdpbase.search.provider.elasticsearch.url            — ES base URL (default: http://localhost:9200)
 *   ngdpbase.search.provider.elasticsearch.indexname      — ES index name (default: ngdpbase-pages)
 *   ngdpbase.search.provider.elasticsearch.connecttimeout — connect timeout ms (default: 5000)
 *   ngdpbase.search.provider.elasticsearch.requesttimeout — request timeout ms (default: 30000)
 *
 * Index: `ngdpbase-pages` (distinct from the sist2 addon's ES index).
 * Created automatically on first buildIndex() call.
 *
 * Field mapping:
 *   systemCategory  ← metadata['system-category']  (storage routing)
 *   systemKeywords  ← metadata['system-keywords']   (system-assigned classification; #507 auto-tags)
 *   userKeywords    ← metadata['user-keywords']      (user-assigned from vocabulary)
 *
 * Related: #189 (Lunr alternatives), #504 (ES search integration), #507 (auto-tagging)
 */

import type { Client, estypes } from '@elastic/elasticsearch';
import { createGuardedElasticsearchClient, refusedNodeMessage } from '../http/guardedElasticsearch.js';
import { resolveEgressPolicy } from '../http/egressPolicy.js';
import { validateUrl } from '../http/ssrf.js';

// Type aliases for commonly used ES types (estypes namespace is the stable export path)
type AggregationsStringTermsBucket = estypes.AggregationsStringTermsBucket;
type QueryDslQueryContainer = estypes.QueryDslQueryContainer;
type SearchHit<T> = estypes.SearchHit<T>;
import BaseSearchProvider, {
  type SearchResult,
  type SearchOptions,
  type SearchCriteria,
  type SearchStatistics,
  type BackupData,
  type WikiEngine
} from './BaseSearchProvider.js';
import logger from '../utils/logger.js';
import { TaggingService } from '../utils/TaggingService.js';

// ---------------------------------------------------------------------------
// Internal document shape stored in ES
// ---------------------------------------------------------------------------

interface EsPageDocument {
  name: string;
  title: string;
  slug: string;
  content: string;
  systemCategory: string;
  /** #706: opt-in knowledge-graph role (source|citation|concept). Empty
   *  string when the field is absent — the common case for most pages. */
  knowledgeRole: string;
  systemKeywords: string[];
  userKeywords: string[];
  author: string;
  editor: string;
  lastModified: string;
  /** ISO 8601 page creation timestamp (#754, v3.33.0). Optional because
   *  pre-migration documents may have been indexed without it; a re-index
   *  populates it. Used by #774's `dateField=created` filter. */
  created?: string;
  uuid: string;
  /** True when the page lives in the private storage location */
  isPrivate: boolean;
  /** Audience principals that may view this page when isPrivate is true */
  audience: string[];
}

// ---------------------------------------------------------------------------
// ES index mapping
// ---------------------------------------------------------------------------

const INDEX_MAPPING = {
  mappings: {
    properties: {
      name:           { type: 'keyword' as const },
      title:          { type: 'text' as const, analyzer: 'english', fields: { keyword: { type: 'keyword' as const } } },
      slug:           { type: 'keyword' as const },
      content:        { type: 'text' as const, analyzer: 'english' },
      systemCategory: { type: 'keyword' as const },
      // #706: knowledge-role as a keyword field — supports exact-match
      // filtering (e.g. role=source) and term aggregations for facet UIs.
      knowledgeRole:  { type: 'keyword' as const },
      systemKeywords: { type: 'keyword' as const },
      userKeywords:   { type: 'keyword' as const },
      author:         { type: 'keyword' as const },
      editor:         { type: 'keyword' as const },
      lastModified:   { type: 'date' as const },
      // #774: per-page creation timestamp (added via #754 / v3.33.0). Once
      // this mapping ships, existing indexes need a one-time reindex to
      // populate `created` on already-indexed documents. Until then the
      // `dateField=created` filter will only match docs indexed AFTER the
      // re-index — pre-existing docs lack the field and ES will exclude
      // them from the `range: { created }` query.
      created:        { type: 'date' as const },
      uuid:           { type: 'keyword' as const },
      isPrivate:      { type: 'boolean' as const },
      audience:       { type: 'keyword' as const }
    }
  }
};

// ---------------------------------------------------------------------------
// Interfaces for engine managers
// ---------------------------------------------------------------------------

interface ConfigurationManager {
  getProperty<T>(key: string, defaultValue: T): T;
}

interface PageManager {
  getAllPages(): Promise<string[]>;
  getPage(pageName: string): Promise<{ content?: string; metadata: Record<string, unknown> } | null>;
}

interface CatalogManager {
  getTerms(domain?: string): Promise<{ term: string; label: string; category?: string }[]>;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

class ElasticsearchSearchProvider extends BaseSearchProvider {
  private client: Client | null = null;
  private indexName: string = 'ngdpbase-pages';
  private maxResults: number = 50;
  private snippetLength: number = 200;
  private taggingService: TaggingService | null = null;

  constructor(engine: WikiEngine) {
    super(engine);
  }

  // -------------------------------------------------------------------------
  // initialize
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    const cfg = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!cfg) throw new Error('ElasticsearchSearchProvider requires ConfigurationManager');

    const url = cfg.getProperty<string>('ngdpbase.search.provider.elasticsearch.url', 'http://localhost:9200');
    this.indexName = cfg.getProperty<string>('ngdpbase.search.provider.elasticsearch.indexname', 'ngdpbase-pages');
    const connectTimeout = cfg.getProperty<number>('ngdpbase.search.provider.elasticsearch.connecttimeout', 5000);
    const requestTimeout = cfg.getProperty<number>('ngdpbase.search.provider.elasticsearch.requesttimeout', 30000);
    this.maxResults = cfg.getProperty<number>('ngdpbase.search.provider.lunr.maxresults', 50);
    this.snippetLength = cfg.getProperty<number>('ngdpbase.search.provider.lunr.snippetlength', 200);

    // #1188: the client is built inside the boundary, so every socket it
    // opens is judged by the egress policy at connect time. Say at boot when
    // the configured node can never pass, rather than "connection refused"
    // on every request.
    const read = (key: string, fallback?: unknown): unknown => cfg.getProperty(key, fallback);
    const verdict = validateUrl(url, resolveEgressPolicy(read).policy);
    if (!verdict.ok) logger.error(refusedNodeMessage('ElasticsearchSearchProvider', url, verdict.reason));
    this.client = createGuardedElasticsearchClient(url, read, { requestTimeout });
    void connectTimeout; // read from config for future use

    // Create index if it does not exist yet
    await this._ensureIndex();

    // Auto-tagging (#507): load vocabulary from CatalogManager if enabled
    const autoTagEnabled = cfg.getProperty<boolean>('ngdpbase.search.provider.elasticsearch.autotagging.enabled', false);
    if (autoTagEnabled) {
      const catalogManager = this.engine.getManager<CatalogManager>('CatalogManager');
      if (catalogManager) {
        const terms = await catalogManager.getTerms();
        this.taggingService = new TaggingService();
        this.taggingService.setVocabulary(terms);
        logger.info(`[ElasticsearchSearchProvider] Auto-tagging enabled — vocabulary: ${this.taggingService.vocabularySize} terms`);
      } else {
        logger.warn('[ElasticsearchSearchProvider] Auto-tagging enabled but CatalogManager not available');
      }
    }

    this.initialized = true;
    logger.info(`[ElasticsearchSearchProvider] Initialized — index: ${this.indexName}, url: ${url}`);
  }

  // -------------------------------------------------------------------------
  // buildIndex — bulk-index all pages in 200-document batches
  // -------------------------------------------------------------------------

  async buildIndex(): Promise<void> {
    if (!this.client) throw new Error('Not initialized');

    const pageManager = this.engine.getManager<PageManager>('PageManager');
    if (!pageManager) {
      logger.warn('[ElasticsearchSearchProvider] PageManager not available for indexing');
      return;
    }

    const pageNames = await pageManager.getAllPages();
    logger.info(`[ElasticsearchSearchProvider] Building index for ${pageNames.length} pages`);

    const BATCH = 200;
    let indexed = 0;

    for (let i = 0; i < pageNames.length; i += BATCH) {
      const batch = pageNames.slice(i, i + BATCH);
      const ops: unknown[] = [];

      for (const name of batch) {
        const page = await pageManager.getPage(name);
        if (!page) continue;
        const doc = this._pageToDoc(name, page.content ?? '', page.metadata);
        // Use UUID as ES _id — UUIDs are guaranteed unique across the system
        // (ValidationManager.checkConflicts enforces this on every page save).
        // Falling back to page name only for legacy pages that pre-date UUID enforcement.
        const esId = doc.uuid || name;
        ops.push({ index: { _index: this.indexName, _id: esId } });
        ops.push(doc);
      }

      if (ops.length === 0) continue;

      const { errors } = await this.client.bulk({ body: ops as object[] });
      if (errors) {
        logger.warn(`[ElasticsearchSearchProvider] Bulk index batch ${i}–${i + BATCH} had errors`);
      }
      indexed += batch.length;
    }

    logger.info(`[ElasticsearchSearchProvider] Index built — ${indexed} pages indexed`);
  }

  // -------------------------------------------------------------------------
  // search
  // -------------------------------------------------------------------------

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    if (!this.client) return [];

    const maxResults = options.maxResults ?? this.maxResults;
    const { isPrivate: privateFilter, audience: audienceFilter } = this._buildPrivacyFilter(options.wikiContext);

    const mustClause: QueryDslQueryContainer = query.trim()
      ? {
        multi_match: {
          query: query.trim(),
          fields: ['title^10', 'content', 'userKeywords^6', 'systemKeywords^5'],
          type: 'best_fields',
          fuzziness: 'AUTO'
        }
      }
      : { match_all: {} };

    const esQuery = this._wrapWithPrivacy(mustClause, privateFilter, audienceFilter);

    const resp = await this.client.search<EsPageDocument>({
      index: this.indexName,
      query: esQuery,
      size: maxResults,
      highlight: {
        fields: { content: { fragment_size: this.snippetLength, number_of_fragments: 1 } }
      }
    });

    return resp.hits.hits
      .filter((h: SearchHit<EsPageDocument>) => h._source !== undefined)
      .map((h: SearchHit<EsPageDocument>) => this._hitToResult(h._id ?? '', h._source as EsPageDocument, query, h.highlight));
  }

  // -------------------------------------------------------------------------
  // advancedSearch
  // -------------------------------------------------------------------------

  async advancedSearch(criteria: SearchCriteria = {}): Promise<SearchResult[]> {
    if (!this.client) return [];

    const {
      query = '',
      categories = [],
      knowledgeRoles = [],
      userKeywords = [],
      systemKeywords = [],
      author = '',
      editor = '',
      dateRange,
      dateField,
      maxResults: maxR
    } = criteria as SearchCriteria & { systemKeywords?: string[]; dateField?: 'modified' | 'created' };

    const maxResults = (maxR) ?? this.maxResults;
    const { isPrivate: privateFilter, audience: audienceFilter } = this._buildPrivacyFilter(
      (criteria.wikiContext as SearchOptions['wikiContext']) ?? undefined
    );

    // must — text query
    const must: QueryDslQueryContainer = query.trim()
      ? {
        multi_match: {
          query: query.trim(),
          fields: ['title^10', 'content', 'userKeywords^6', 'systemKeywords^5'],
          type: 'best_fields',
          fuzziness: 'AUTO'
        }
      }
      : { match_all: {} };

    // filter clauses
    const filter: QueryDslQueryContainer[] = [];

    if (categories.length > 0) {
      filter.push({ terms: { systemCategory: categories } });
    }

    // #706: knowledge-role filter — exact terms match on the keyword field.
    // Pages without a role are excluded when this filter has entries.
    if (knowledgeRoles.length > 0) {
      filter.push({ terms: { knowledgeRole: knowledgeRoles } });
    }

    if (userKeywords.length > 0) {
      filter.push({ terms: { userKeywords } });
    }

    if ((systemKeywords).length > 0) {
      filter.push({ terms: { systemKeywords: systemKeywords } });
    }

    if (author) {
      filter.push({ term: { author } });
    }

    if (editor) {
      filter.push({ term: { editor } });
    }

    if (dateRange?.from || dateRange?.to) {
      const range: Record<string, string> = {};
      if (dateRange.from) range['gte'] = dateRange.from;
      if (dateRange.to)   range['lte'] = dateRange.to;
      // #774: branch the filter field on `dateField`. Default `modified` is
      // back-compat with the pre-#774 contract. `created` requires the new
      // mapping above + a re-index for existing documents.
      const field = dateField === 'created' ? 'created' : 'lastModified';
      filter.push({ range: { [field]: range } });
    }

    const esQuery = this._wrapWithPrivacy(must, privateFilter, audienceFilter, filter);

    const resp = await this.client.search<EsPageDocument>({
      index: this.indexName,
      query: esQuery,
      size: maxResults,
      highlight: {
        fields: { content: { fragment_size: this.snippetLength, number_of_fragments: 1 } }
      }
    });

    return resp.hits.hits
      .filter((h: SearchHit<EsPageDocument>) => h._source !== undefined)
      .map((h: SearchHit<EsPageDocument>) => this._hitToResult(h._id ?? '', h._source as EsPageDocument, query, h.highlight));
  }

  // -------------------------------------------------------------------------
  // updatePageInIndex
  // -------------------------------------------------------------------------

  async updatePageInIndex(pageName: string, pageData: Record<string, unknown>): Promise<void> {
    if (!this.client) return;

    const metadata = (pageData.metadata as Record<string, unknown>) ?? {};
    const content = typeof pageData.content === 'string' ? pageData.content : '';
    const doc = this._pageToDoc(pageName, content, metadata);
    const esId = doc.uuid || pageName;

    await this.client.index({
      index: this.indexName,
      id: esId,
      document: doc
    });

    logger.debug(`[ElasticsearchSearchProvider] Indexed page: ${pageName}`);
  }

  // -------------------------------------------------------------------------
  // removePageFromIndex
  // -------------------------------------------------------------------------

  async removePageFromIndex(pageName: string): Promise<void> {
    if (!this.client) return;
    // Delete by name field because _id is now UUID — pageName is not the document ID
    await this.client.deleteByQuery({
      index: this.indexName,
      query: { term: { name: pageName } },
      conflicts: 'proceed'
    });
  }

  // -------------------------------------------------------------------------
  // getPageSystemKeywords — fetch systemKeywords for a single page from ES
  // Used by WikiRoutes to show auto-tagged keywords on page view (#507)
  // -------------------------------------------------------------------------

  async getPageSystemKeywords(pageName: string): Promise<string[]> {
    if (!this.client) return [];
    try {
      // Search by name field because _id is now UUID — pageName is not the document ID
      const resp = await this.client.search<EsPageDocument>({
        index: this.indexName,
        query: { term: { name: pageName } },
        size: 1,
        _source: ['systemKeywords'] as unknown as boolean
      });
      return resp.hits.hits[0]?._source?.systemKeywords ?? [];
    } catch {
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // getAllCategories / getAllUserKeywords / getAllSystemKeywords
  // -------------------------------------------------------------------------

  async getAllCategories(): Promise<string[]> {
    return this._termsAgg('systemCategory', 100);
  }

  async getAllUserKeywords(): Promise<string[]> {
    return this._termsAgg('userKeywords', 500);
  }

  async getAllSystemKeywords(): Promise<string[]> {
    return this._termsAgg('systemKeywords', 500);
  }

  // -------------------------------------------------------------------------
  // searchByCategory / searchByUserKeywords
  // -------------------------------------------------------------------------

  async searchByCategory(category: string): Promise<SearchResult[]> {
    if (!this.client || !category) return [];

    const resp = await this.client.search<EsPageDocument>({
      index: this.indexName,
      query: { term: { systemCategory: category } },
      size: this.maxResults
    });

    return resp.hits.hits
      .filter((h: SearchHit<EsPageDocument>) => h._source !== undefined)
      .map((h: SearchHit<EsPageDocument>) => this._hitToResult(h._id ?? '', h._source as EsPageDocument, category));
  }

  async searchByUserKeywords(keyword: string): Promise<SearchResult[]> {
    if (!this.client || !keyword) return [];

    const resp = await this.client.search<EsPageDocument>({
      index: this.indexName,
      query: { term: { userKeywords: keyword } },
      size: this.maxResults
    });

    return resp.hits.hits
      .filter((h: SearchHit<EsPageDocument>) => h._source !== undefined)
      .map((h: SearchHit<EsPageDocument>) => this._hitToResult(h._id ?? '', h._source as EsPageDocument, keyword));
  }

  // -------------------------------------------------------------------------
  // getSuggestions
  // -------------------------------------------------------------------------

  async getSuggestions(partial: string): Promise<string[]> {
    if (!this.client || !partial || partial.length < 2) return [];

    const resp = await this.client.search<EsPageDocument>({
      index: this.indexName,
      query: { match_phrase_prefix: { 'title.keyword': { query: partial } } },
      size: 10,
      _source: ['title']
    });

    return resp.hits.hits
      .filter((h: SearchHit<EsPageDocument>) => h._source?.title)
      .map((h: SearchHit<EsPageDocument>) => h._source!.title);
  }

  // -------------------------------------------------------------------------
  // suggestSimilarPages
  // -------------------------------------------------------------------------

  async suggestSimilarPages(pageName: string, limit: number = 5): Promise<SearchResult[]> {
    if (!this.client) return [];

    // more_like_this requires a document reference — look up the UUID (_id) first
    const docResp = await this.client.search<EsPageDocument>({
      index: this.indexName,
      query: { term: { name: pageName } },
      size: 1,
      _source: ['uuid']
    });
    const docId = docResp.hits.hits[0]?._id;
    if (!docId) return [];

    const resp = await this.client.search<EsPageDocument>({
      index: this.indexName,
      query: {
        more_like_this: {
          fields: ['title', 'content'],
          like: [{ _index: this.indexName, _id: docId }],
          min_term_freq: 1,
          min_doc_freq: 1
        }
      },
      size: limit + 1
    });

    return resp.hits.hits
      .filter((h: SearchHit<EsPageDocument>) => h._source?.name !== pageName && h._source !== undefined)
      .slice(0, limit)
      .map((h: SearchHit<EsPageDocument>) => this._hitToResult(h._id ?? '', h._source as EsPageDocument, ''));
  }

  // -------------------------------------------------------------------------
  // getStatistics
  // -------------------------------------------------------------------------

  async getStatistics(): Promise<SearchStatistics> {
    if (!this.client) return { documentCount: 0 };

    const [countResp, statsResp] = await Promise.all([
      this.client.count({ index: this.indexName }),
      this.client.indices.stats({ index: this.indexName }).catch(() => null)
    ]);

    const indexSize = statsResp?._all?.total?.store?.size_in_bytes ?? undefined;
    const categories = await this.getAllCategories();
    const userKeywords = await this.getAllUserKeywords();

    return {
      documentCount: countResp.count,
      indexSize,
      totalCategories: categories.length,
      totalUserKeywords: userKeywords.length,
      providerName: 'ElasticsearchSearchProvider',
      providerVersion: '1.0.0'
    };
  }

  // -------------------------------------------------------------------------
  // getDocumentCount
  // -------------------------------------------------------------------------

  async getDocumentCount(): Promise<number> {
    if (!this.client) return 0;
    const resp = await this.client.count({ index: this.indexName });
    return resp.count;
  }

  // -------------------------------------------------------------------------
  // isHealthy
  // -------------------------------------------------------------------------

  async isHealthy(): Promise<boolean> {
    if (!this.client) return false;
    try {
      await this.client.ping();
      return true;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // close
  // -------------------------------------------------------------------------

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
    this.initialized = false;
    logger.info('[ElasticsearchSearchProvider] Closed');
  }

  // -------------------------------------------------------------------------
  // backup / restore
  // -------------------------------------------------------------------------

  async backup(): Promise<BackupData> {
    const base = await super.backup();
    if (!this.client) return base;

    // Scroll all documents
    const docs: unknown[] = [];
    const resp = await this.client.search<EsPageDocument>({
      index: this.indexName,
      size: 10000,
      query: { match_all: {} }
    });
    resp.hits.hits.forEach((h: SearchHit<EsPageDocument>) => {
      if (h._source) docs.push({ id: h._id, doc: h._source });
    });

    return { ...base, indexName: this.indexName, documents: docs };
  }

  async restore(backupData: BackupData): Promise<void> {
    if (!this.client) return;
    const docs = backupData.documents as Array<{ id: string; doc: EsPageDocument }> | undefined;
    if (!docs || docs.length === 0) return;

    const ops: unknown[] = [];
    for (const { id, doc } of docs) {
      ops.push({ index: { _index: this.indexName, _id: id } });
      ops.push(doc);
    }

    await this.client.bulk({ body: ops as object[] });
    logger.info(`[ElasticsearchSearchProvider] Restored ${docs.length} documents from backup`);
  }

  // -------------------------------------------------------------------------
  // getProviderInfo
  // -------------------------------------------------------------------------

  getProviderInfo(): { name: string; version: string; description: string; features: string[] } {
    return {
      name: 'ElasticsearchSearchProvider',
      version: '1.0.0',
      description: 'Full-text search using Elasticsearch — suitable for large wikis',
      features: ['full-text', 'stemming', 'field-boosting', 'snippets', 'suggestions', 'aggregations', 'private-page-access-control']
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /** Convert page content + metadata to an ES document */
  private _pageToDoc(
    name: string,
    content: string,
    metadata: Record<string, unknown>
  ): EsPageDocument {
    const toStr = (v: unknown): string =>
      typeof v === 'string' ? v : '';

    const toStrArr = (v: unknown): string[] => {
      if (Array.isArray(v)) return v.map(String).filter(s => s);
      if (typeof v === 'string' && v) return [v];
      return [];
    };

    // #802 Slice 4: `private:true` is the sole privacy signal. Legacy
    // `system-location:'private'` fallback retired after the migration.
    const isPrivate = metadata.private === true;
    const audienceRaw = metadata['audience'];
    const audience = toStrArr(audienceRaw);

    const existingSystemKeywords = toStrArr(metadata['system-keywords']);
    const existingUserKeywords = toStrArr(metadata['user-keywords']);
    const autoTagged = this.taggingService
      ? this.taggingService.tag(content, toStr(metadata.title) || name, [...existingSystemKeywords, ...existingUserKeywords])
      : [];

    return {
      name,
      title: toStr(metadata.title) || name,
      slug: toStr(metadata.slug),
      content,
      systemCategory: toStr(metadata['system-category']),
      knowledgeRole: toStr(metadata['knowledge-role']),
      systemKeywords: [...existingSystemKeywords, ...autoTagged],
      userKeywords: toStrArr(metadata['user-keywords']),
      author: toStr(metadata.author),
      editor: toStr(metadata.editor),
      lastModified: toStr(metadata.lastModified),
      created: toStr(metadata.created) || undefined,
      uuid: toStr(metadata.uuid),
      isPrivate,
      audience
    };
  }

  /** Convert an ES hit to a SearchResult */
  private _hitToResult(
    _id: string,
    src: EsPageDocument,
    _query: string,
    highlight?: Record<string, string[]>
  ): SearchResult {
    const snippet = highlight?.content?.[0]
      ?? src.content.substring(0, this.snippetLength);

    return {
      name: src.name,
      title: src.title || src.name,
      score: 1.0,
      snippet,
      metadata: {
        systemCategory: src.systemCategory,
        systemKeywords: src.systemKeywords,
        userKeywords: src.userKeywords,
        lastModified: src.lastModified,
        author: src.author,
        editor: src.editor,
        uuid: src.uuid
      }
    };
  }

  /**
   * Build the private-page visibility predicate from the current WikiContext.
   * Returns the two clauses needed by _wrapWithPrivacy.
   */
  private _buildPrivacyFilter(wikiContext?: SearchOptions['wikiContext']): {
    isPrivate: boolean;
    audience: string[];
  } {
    const principals = wikiContext?.getPrincipals?.() ?? [];
    return { isPrivate: principals.length > 0, audience: principals };
  }

  /**
   * Wrap a must clause with a boolean that enforces private-page visibility.
   *
   * Visibility rule (mirrors LunrSearchProvider):
   *   - Show if isPrivate === false, OR
   *   - Show if audience contains any of the current user's principals
   *
   * #628: AuthorLocked is intentionally NOT part of this filter. It is an *edit*
   * constraint (parallel to git branch protection) — locked pages remain freely
   * readable. Conflating edit and read on different axes weakens the model.
   * Closed wontfix; see issue for discussion. Mirrors #627 for the Lunr side.
   */
  private _wrapWithPrivacy(
    must: QueryDslQueryContainer,
    hasUser: boolean,
    principals: string[],
    extraFilter: QueryDslQueryContainer[] = []
  ): QueryDslQueryContainer {
    const privacyFilter: QueryDslQueryContainer = hasUser && principals.length > 0
      ? {
        bool: {
          should: [
            { term: { isPrivate: false } },
            { terms: { audience: principals } }
          ],
          minimum_should_match: 1
        }
      }
      : { term: { isPrivate: false } };

    const filter: QueryDslQueryContainer[] = [privacyFilter, ...extraFilter];

    return {
      bool: {
        must,
        filter
      }
    };
  }

  /** Run a terms aggregation and return the bucket keys */
  private async _termsAgg(field: string, size: number): Promise<string[]> {
    if (!this.client) return [];

    const resp = await this.client.search({
      index: this.indexName,
      size: 0,
      aggs: { result: { terms: { field, size } } }
    });

    const buckets = (resp.aggregations?.result as { buckets?: AggregationsStringTermsBucket[] } | undefined)?.buckets ?? [];
    return buckets.map(b => b.key as string).filter(Boolean);
  }

  /** Create the ES index if it does not exist */
  private async _ensureIndex(): Promise<void> {
    if (!this.client) return;

    const exists = await this.client.indices.exists({ index: this.indexName });
    if (exists) {
      logger.debug(`[ElasticsearchSearchProvider] Index '${this.indexName}' already exists`);
      return;
    }

    await this.client.indices.create({
      index: this.indexName,
      ...INDEX_MAPPING
    });

    logger.info(`[ElasticsearchSearchProvider] Created index '${this.indexName}'`);
  }
}

export default ElasticsearchSearchProvider;

