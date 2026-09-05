'use strict';

/**
 * Tests for ElasticsearchSearchProvider.
 *
 * The @elastic/elasticsearch Client is mocked so no real ES connection is made.
 */

// ---------------------------------------------------------------------------
// Mock @elastic/elasticsearch before any require()
// ---------------------------------------------------------------------------

const mockClientInstance = {
  ping:          vi.fn(),
  close:         vi.fn(),
  index:         vi.fn(),
  delete:        vi.fn(),
  deleteByQuery: vi.fn(),
  count:         vi.fn(),
  bulk:          vi.fn(),
  search:        vi.fn(),
  get:           vi.fn(),
  indices: {
    exists: vi.fn(),
    create: vi.fn(),
    stats:  vi.fn()
  }
};

vi.mock('@elastic/elasticsearch', () => ({
  Client: vi.fn(function () { return mockClientInstance; }),
  // #1188: the guarded factory in src/http names the http connection class.
  HttpConnection: class {}
}));

import ElasticsearchSearchProvider from '../ElasticsearchSearchProvider';
import type { WikiEngine } from '../../types/WikiEngine';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEngine(configOverrides = {}, extraManagers = {}) {
  const defaultConfig = {
    'ngdpbase.search.provider.elasticsearch.url':            'http://localhost:9200',
    'ngdpbase.search.provider.elasticsearch.indexname':      'ngdpbase-pages',
    'ngdpbase.search.provider.elasticsearch.connecttimeout': 5000,
    'ngdpbase.search.provider.elasticsearch.requesttimeout': 30000,
    'ngdpbase.search.provider.lunr.maxresults':              50,
    'ngdpbase.search.provider.lunr.snippetlength':           200,
    ...configOverrides
  };

  const configManager = {
    getProperty: vi.fn((key, def) => defaultConfig[key] ?? def)
  };

  return {
    getManager: vi.fn((name) => {
      if (name === 'ConfigurationManager') return configManager;
      return extraManagers[name] ?? null;
    })
  } as unknown as WikiEngine;
}

function makePageManager(pages = {}) {
  // pages: { pageName: { content, metadata } }
  return {
    getAllPages: vi.fn().mockResolvedValue(Object.keys(pages)),
    getPage: vi.fn((name) => Promise.resolve(pages[name] ?? null))
  };
}

function makePage(overrides = {}) {
  return {
    content: 'Some wiki content',
    metadata: {
      title: 'My Page',
      'system-category': 'general',
      'system-keywords': [],
      'user-keywords': ['default'],
      author: 'jim',
      editor: 'jim',
      lastModified: '2024-01-01T00:00:00.000Z',
      uuid: 'abc-123',
      'system-location': 'regular',
      audience: []
    },
    ...overrides
  };
}

function makeSearchHit(id, src) {
  return { _id: id, _score: 1.0, _source: src };
}

function makeSearchResp(hits, total) {
  return {
    hits: { total: { value: total }, hits }
  };
}

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
  mockClientInstance.indices.exists.mockResolvedValue(true);
  mockClientInstance.indices.create.mockResolvedValue({});
  mockClientInstance.ping.mockResolvedValue(true);
  mockClientInstance.close.mockResolvedValue(undefined);
  mockClientInstance.index.mockResolvedValue({ result: 'indexed' });
  mockClientInstance.delete.mockResolvedValue({ result: 'deleted' });
  mockClientInstance.count.mockResolvedValue({ count: 0 });
  mockClientInstance.bulk.mockResolvedValue({ errors: false, items: [] });
  mockClientInstance.search.mockResolvedValue(makeSearchResp([], 0));
  mockClientInstance.indices.stats.mockResolvedValue({ _all: { total: { store: { size_in_bytes: 1024 } } } });
});

// ---------------------------------------------------------------------------
// initialize()
// ---------------------------------------------------------------------------

describe('initialize()', () => {
  test('creates index when it does not exist', async () => {
    mockClientInstance.indices.exists.mockResolvedValue(false);

    const engine = makeEngine();
    const provider = new ElasticsearchSearchProvider(engine);
    await provider.initialize();

    expect(mockClientInstance.indices.exists).toHaveBeenCalledWith({ index: 'ngdpbase-pages' });
    expect(mockClientInstance.indices.create).toHaveBeenCalledWith(
      expect.objectContaining({ index: 'ngdpbase-pages' })
    );
  });

  test('skips index creation when index already exists', async () => {
    mockClientInstance.indices.exists.mockResolvedValue(true);

    const engine = makeEngine();
    const provider = new ElasticsearchSearchProvider(engine);
    await provider.initialize();

    expect(mockClientInstance.indices.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// buildIndex()
// ---------------------------------------------------------------------------

describe('buildIndex()', () => {
  test('bulk-indexes all pages from PageManager', async () => {
    const pages = {
      'page-a': makePage({ metadata: { ...makePage().metadata, title: 'Page A' } }),
      'page-b': makePage({ metadata: { ...makePage().metadata, title: 'Page B' } })
    };
    const pageManager = makePageManager(pages);
    const engine = makeEngine({}, { PageManager: pageManager });

    const provider = new ElasticsearchSearchProvider(engine);
    await provider.initialize();
    await provider.buildIndex();

    expect(mockClientInstance.bulk).toHaveBeenCalledTimes(1);
    const { body } = mockClientInstance.bulk.mock.calls[0][0];
    // 2 pages → 4 ops (index + doc for each)
    expect(body).toHaveLength(4);
  });

  test('batches in chunks of 200', async () => {
    const pages = {};
    for (let i = 0; i < 350; i++) {
      pages[`page-${i}`] = makePage();
    }
    const pageManager = makePageManager(pages);
    const engine = makeEngine({}, { PageManager: pageManager });

    const provider = new ElasticsearchSearchProvider(engine);
    await provider.initialize();
    await provider.buildIndex();

    // 350 pages → ceil(350/200) = 2 bulk calls
    expect(mockClientInstance.bulk).toHaveBeenCalledTimes(2);
  });

  test('uses UUID as ES _id, not page name', async () => {
    const pages = {
      'my-page': makePage({ metadata: { ...makePage().metadata, uuid: 'uuid-aaa-111' } })
    };
    const pageManager = makePageManager(pages);
    const engine = makeEngine({}, { PageManager: pageManager });

    const provider = new ElasticsearchSearchProvider(engine);
    await provider.initialize();
    await provider.buildIndex();

    const { body } = mockClientInstance.bulk.mock.calls[0][0];
    // First op is the index action — its _id must be the UUID, not 'my-page'
    expect(body[0]).toEqual({ index: { _index: 'ngdpbase-pages', _id: 'uuid-aaa-111' } });
  });

  test('stores slug field in document', async () => {
    const pages = {
      'my-page': makePage({ metadata: { ...makePage().metadata, slug: 'my-page-slug' } })
    };
    const pageManager = makePageManager(pages);
    const engine = makeEngine({}, { PageManager: pageManager });

    const provider = new ElasticsearchSearchProvider(engine);
    await provider.initialize();
    await provider.buildIndex();

    const { body } = mockClientInstance.bulk.mock.calls[0][0];
    // Second op is the document itself
    expect(body[1].slug).toBe('my-page-slug');
  });

  test('skips pages that getPage returns null for', async () => {
    const pageManager = {
      getAllPages: vi.fn().mockResolvedValue(['exists', 'missing']),
      getPage: vi.fn((name) => Promise.resolve(name === 'exists' ? makePage() : null))
    };
    const engine = makeEngine({}, { PageManager: pageManager });

    const provider = new ElasticsearchSearchProvider(engine);
    await provider.initialize();
    await provider.buildIndex();

    const { body } = mockClientInstance.bulk.mock.calls[0][0];
    // only 1 page → 2 ops
    expect(body).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// search()
// ---------------------------------------------------------------------------

describe('search()', () => {
  test('builds multi_match query for non-empty query', async () => {
    const engine = makeEngine();
    const provider = new ElasticsearchSearchProvider(engine);
    await provider.initialize();

    await provider.search('wiki pages');

    const { query } = mockClientInstance.search.mock.calls[0][0];
    expect(query.bool.must.multi_match.query).toBe('wiki pages');
    expect(query.bool.must.multi_match.fields).toContain('title^10');
  });

  test('uses match_all for empty query', async () => {
    const engine = makeEngine();
    const provider = new ElasticsearchSearchProvider(engine);
    await provider.initialize();

    await provider.search('');

    const { query } = mockClientInstance.search.mock.calls[0][0];
    expect(query.bool.must).toEqual({ match_all: {} });
  });

  test('applies isPrivate:false filter when no user context', async () => {
    const engine = makeEngine();
    const provider = new ElasticsearchSearchProvider(engine);
    await provider.initialize();

    await provider.search('test');

    const { query } = mockClientInstance.search.mock.calls[0][0];
    const privacyClause = query.bool.filter.find(f => f.term?.isPrivate !== undefined);
    expect(privacyClause).toEqual({ term: { isPrivate: false } });
  });

  test('returns mapped SearchResult array from hits', async () => {
    const hit = makeSearchHit('my-page', {
      name: 'my-page', title: 'My Page', content: 'hello world',
      systemCategory: 'general', systemKeywords: [], userKeywords: ['default'],
      author: 'jim', editor: 'jim', lastModified: '2024-01-01T00:00:00.000Z',
      uuid: 'abc', isPrivate: false, audience: []
    });
    mockClientInstance.search.mockResolvedValue(makeSearchResp([hit], 1));

    const engine = makeEngine();
    const provider = new ElasticsearchSearchProvider(engine);
    await provider.initialize();

    const results = await provider.search('hello');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('my-page');
    expect(results[0].title).toBe('My Page');
  });
});

// ---------------------------------------------------------------------------
// advancedSearch()
// ---------------------------------------------------------------------------

describe('advancedSearch()', () => {
  test('adds term filter for category', async () => {
    const engine = makeEngine();
    const provider = new ElasticsearchSearchProvider(engine);
    await provider.initialize();

    await provider.advancedSearch({ categories: ['addon'] });

    const { query } = mockClientInstance.search.mock.calls[0][0];
    const catFilter = query.bool.filter.find(f => f.terms?.systemCategory);
    expect(catFilter).toEqual({ terms: { systemCategory: ['addon'] } });
  });

  test('adds range filter for dateRange (defaults to lastModified — back-compat #643)', async () => {
    const engine = makeEngine();
    const provider = new ElasticsearchSearchProvider(engine);
    await provider.initialize();

    await provider.advancedSearch({ dateRange: { from: '2024-01-01', to: '2024-12-31' } });

    const { query } = mockClientInstance.search.mock.calls[0][0];
    const rangeFilter = query.bool.filter.find(f => f.range?.lastModified);
    expect(rangeFilter.range.lastModified).toEqual({ gte: '2024-01-01', lte: '2024-12-31' });
  });

  test('#774 — dateField=created switches the range filter to the `created` field', async () => {
    const engine = makeEngine();
    const provider = new ElasticsearchSearchProvider(engine);
    await provider.initialize();

    await provider.advancedSearch({
      dateRange: { from: '2024-01-01', to: '2024-12-31' },
      dateField: 'created'
    });

    const { query } = mockClientInstance.search.mock.calls[0][0];
    const rangeFilter = query.bool.filter.find(f => f.range?.created);
    expect(rangeFilter.range.created).toEqual({ gte: '2024-01-01', lte: '2024-12-31' });
    // And the lastModified range should NOT be present
    const lmFilter = query.bool.filter.find(f => f.range?.lastModified);
    expect(lmFilter).toBeUndefined();
  });

  test('#774 — dateField=modified is the explicit equivalent of the default', async () => {
    const engine = makeEngine();
    const provider = new ElasticsearchSearchProvider(engine);
    await provider.initialize();

    await provider.advancedSearch({
      dateRange: { from: '2024-01-01', to: '2024-12-31' },
      dateField: 'modified'
    });

    const { query } = mockClientInstance.search.mock.calls[0][0];
    const rangeFilter = query.bool.filter.find(f => f.range?.lastModified);
    expect(rangeFilter.range.lastModified).toEqual({ gte: '2024-01-01', lte: '2024-12-31' });
    const createdFilter = query.bool.filter.find(f => f.range?.created);
    expect(createdFilter).toBeUndefined();
  });

  test('private page filter allows audience members', async () => {
    const engine = makeEngine();
    const provider = new ElasticsearchSearchProvider(engine);
    await provider.initialize();

    await provider.advancedSearch({
      wikiContext: {
        userContext: { roles: ['editor'], username: 'jim' },
        getPrincipals: () => ['editor', 'jim']
      }
    });

    const { query } = mockClientInstance.search.mock.calls[0][0];
    const privacyFilter = query.bool.filter.find(f => f.bool?.should);
    expect(privacyFilter.bool.should).toContainEqual({ term: { isPrivate: false } });
    expect(privacyFilter.bool.should).toContainEqual({ terms: { audience: ['editor', 'jim'] } });
  });
});

// ---------------------------------------------------------------------------
// advancedSearch() — no-query / browse-all ACL parity (#731 / #732)
// ---------------------------------------------------------------------------
// #731 Slice 1 found a no-query private-page leak in LunrSearchProvider and
// added 6 guards (LunrSearchProvider.privateFilter.test.ts). ES enforces ACL
// inside the ES query itself, so its no-query/`match_all` path cannot have
// that leak — these guard that it stays so. ES's model collapses Lunr's
// creator/admin/audience cases into "principals present → public-OR-in-
// audience", so this mirrors the *intent* (browse-all / category-only is
// always privacy-wrapped), not Lunr's case list 1:1. The authed no-query
// case is already covered by 'private page filter allows audience members'
// above; these add the anon, match_all-structure, and category-only gaps.
describe('advancedSearch() — no-query/browse-all ACL parity (#731/#732)', () => {
  test('no query + anon: match_all wrapped public-only, NO audience escape hatch', async () => {
    const provider = new ElasticsearchSearchProvider(makeEngine());
    await provider.initialize();

    await provider.advancedSearch({}); // browse-all, no wikiContext

    const { query } = mockClientInstance.search.mock.calls[0][0];
    expect(query.bool.must).toEqual({ match_all: {} });
    expect(query.bool.filter).toContainEqual({ term: { isPrivate: false } });
    // anon must NOT receive the audience should-clause anywhere
    expect(query.bool.filter.some(f => f.bool?.should)).toBe(false);
    expect(JSON.stringify(query)).not.toContain('audience');
  });

  test('no query + authed: match_all wrapped public-OR-audience, minimum_should_match:1', async () => {
    const provider = new ElasticsearchSearchProvider(makeEngine());
    await provider.initialize();

    await provider.advancedSearch({
      wikiContext: { userContext: { roles: ['editor'], username: 'jim' }, getPrincipals: () => ['editor', 'jim'] }
    });

    const { query } = mockClientInstance.search.mock.calls[0][0];
    expect(query.bool.must).toEqual({ match_all: {} });
    const priv = query.bool.filter.find(f => f.bool?.should);
    expect(priv.bool.minimum_should_match).toBe(1);
    expect(priv.bool.should).toContainEqual({ term: { isPrivate: false } });
    expect(priv.bool.should).toContainEqual({ terms: { audience: ['editor', 'jim'] } });
  });

  test('category-only (no text query) is STILL privacy-filtered — the #731 broader-leak class', async () => {
    const provider = new ElasticsearchSearchProvider(makeEngine());
    await provider.initialize();

    await provider.advancedSearch({ categories: ['docs'] }); // no query, anon

    const { query } = mockClientInstance.search.mock.calls[0][0];
    expect(query.bool.must).toEqual({ match_all: {} });
    expect(query.bool.filter).toContainEqual({ terms: { systemCategory: ['docs'] } });
    expect(query.bool.filter).toContainEqual({ term: { isPrivate: false } });
  });
});

// ---------------------------------------------------------------------------
// updatePageInIndex()
// ---------------------------------------------------------------------------

describe('updatePageInIndex()', () => {
  test('calls client.index with correct document shape', async () => {
    const engine = makeEngine();
    const provider = new ElasticsearchSearchProvider(engine);
    await provider.initialize();

    await provider.updatePageInIndex('my-page', {
      content: 'Page content here',
      metadata: {
        title: 'My Page',
        'system-category': 'documentation',
        'system-keywords': ['guide'],
        'user-keywords': ['default'],
        author: 'jim',
        editor: 'jim',
        lastModified: '2024-06-01T00:00:00.000Z',
        uuid: 'uuid-1',
        'system-location': 'regular',
        audience: []
      }
    });

    // _id is now UUID, not page name
    expect(mockClientInstance.index).toHaveBeenCalledWith(
      expect.objectContaining({
        index: 'ngdpbase-pages',
        id: 'uuid-1',
        document: expect.objectContaining({
          title: 'My Page',
          systemCategory: 'documentation',
          systemKeywords: ['guide'],
          userKeywords: ['default'],
          isPrivate: false
        })
      })
    );
    // tags field must be absent
    const { document } = mockClientInstance.index.mock.calls[0][0];
    expect(document).not.toHaveProperty('tags');
  });

  test('systemKeywords populated from metadata[system-keywords]', async () => {
    const engine = makeEngine();
    const provider = new ElasticsearchSearchProvider(engine);
    await provider.initialize();

    await provider.updatePageInIndex('p', {
      content: '',
      metadata: { 'system-keywords': ['biology', 'health'], 'user-keywords': [] }
    });

    const { document } = mockClientInstance.index.mock.calls[0][0];
    expect(document.systemKeywords).toEqual(['biology', 'health']);
    expect(document.userKeywords).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// removePageFromIndex()
// ---------------------------------------------------------------------------

describe('removePageFromIndex()', () => {
  test('calls client.deleteByQuery with name term (not _id)', async () => {
    const engine = makeEngine();
    const provider = new ElasticsearchSearchProvider(engine);
    await provider.initialize();

    await provider.removePageFromIndex('old-page');

    // Uses deleteByQuery on name field — _id is now UUID, not page name
    expect(mockClientInstance.deleteByQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        index: 'ngdpbase-pages',
        query: { term: { name: 'old-page' } }
      })
    );
  });

  test('resolves without error when page not found', async () => {
    mockClientInstance.deleteByQuery.mockResolvedValue({ deleted: 0 });

    const engine = makeEngine();
    const provider = new ElasticsearchSearchProvider(engine);
    await provider.initialize();

    await expect(provider.removePageFromIndex('ghost')).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// searchByCategory()
// ---------------------------------------------------------------------------

describe('searchByCategory()', () => {
  test('queries term on systemCategory field', async () => {
    const engine = makeEngine();
    const provider = new ElasticsearchSearchProvider(engine);
    await provider.initialize();

    await provider.searchByCategory('addon');

    const { query } = mockClientInstance.search.mock.calls[0][0];
    expect(query).toEqual({ term: { systemCategory: 'addon' } });
  });
});

// ---------------------------------------------------------------------------
// getAllCategories() / getAllUserKeywords() / getAllSystemKeywords()
// ---------------------------------------------------------------------------

describe('aggregation methods', () => {
  function makeAggsResp(buckets) {
    return {
      hits: { total: { value: 0 }, hits: [] },
      aggregations: { result: { buckets } }
    };
  }

  test('getAllCategories() extracts bucket keys from systemCategory agg', async () => {
    mockClientInstance.search.mockResolvedValue(
      makeAggsResp([{ key: 'addon', doc_count: 5 }, { key: 'general', doc_count: 20 }])
    );

    const engine = makeEngine();
    const provider = new ElasticsearchSearchProvider(engine);
    await provider.initialize();

    const cats = await provider.getAllCategories();
    expect(cats).toEqual(['addon', 'general']);
  });

  test('getAllUserKeywords() extracts bucket keys from userKeywords agg', async () => {
    mockClientInstance.search.mockResolvedValue(
      makeAggsResp([{ key: 'default', doc_count: 10 }, { key: 'private', doc_count: 3 }])
    );

    const engine = makeEngine();
    const provider = new ElasticsearchSearchProvider(engine);
    await provider.initialize();

    const kws = await provider.getAllUserKeywords();
    expect(kws).toEqual(['default', 'private']);
  });

  test('getAllSystemKeywords() extracts bucket keys from systemKeywords agg', async () => {
    mockClientInstance.search.mockResolvedValue(
      makeAggsResp([{ key: 'biology', doc_count: 2 }])
    );

    const engine = makeEngine();
    const provider = new ElasticsearchSearchProvider(engine);
    await provider.initialize();

    const kws = await provider.getAllSystemKeywords();
    expect(kws).toEqual(['biology']);
  });
});

// ---------------------------------------------------------------------------
// getDocumentCount()
// ---------------------------------------------------------------------------

describe('getDocumentCount()', () => {
  test('returns count from ES count API', async () => {
    mockClientInstance.count.mockResolvedValue({ count: 17280 });

    const engine = makeEngine();
    const provider = new ElasticsearchSearchProvider(engine);
    await provider.initialize();

    const n = await provider.getDocumentCount();
    expect(n).toBe(17280);
  });
});

// ---------------------------------------------------------------------------
// isHealthy()
// ---------------------------------------------------------------------------
// Auto-tagging (#507)
// ---------------------------------------------------------------------------

describe('Auto-tagging via TaggingService', () => {
  const mockCatalogManager = {
    getTerms: vi.fn().mockResolvedValue([
      { term: 'geology',      label: 'Geology',      category: 'subject' },
      { term: 'medicine',     label: 'Medicine',     category: 'subject' },
      { term: 'oceanography', label: 'Oceanography', category: 'subject' },
      { term: 'draft',        label: 'Draft',        category: 'workflow-status' }
    ])
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClientInstance.indices.exists.mockResolvedValue(true);
    mockClientInstance.indices.stats.mockResolvedValue({ indices: {} });
  });

  test('auto-tagging disabled by default — systemKeywords unchanged', async () => {
    const engine = makeEngine({}, { CatalogManager: mockCatalogManager });
    const provider = new ElasticsearchSearchProvider(engine);
    await provider.initialize();

    mockClientInstance.index.mockResolvedValue({});
    await provider.updatePageInIndex('RockyPage', {
      content: 'This page covers geology and volcanic rock formations.',
      metadata: { title: 'Rocky Page', 'system-keywords': [], 'user-keywords': [] }
    });

    const indexed = mockClientInstance.index.mock.calls[0][0].document;
    expect(indexed.systemKeywords).toEqual([]);
  });

  test('auto-tagging enabled — tags geology page with geology term', async () => {
    const engine = makeEngine(
      { 'ngdpbase.search.provider.elasticsearch.autotagging.enabled': true },
      { CatalogManager: mockCatalogManager }
    );
    const provider = new ElasticsearchSearchProvider(engine);
    await provider.initialize();

    mockClientInstance.index.mockResolvedValue({});
    await provider.updatePageInIndex('RockyPage', {
      content: 'This page covers geology and volcanic rock formations.',
      metadata: { title: 'Rocky Page', 'system-keywords': [], 'user-keywords': [] }
    });

    const indexed = mockClientInstance.index.mock.calls[0][0].document;
    expect(indexed.systemKeywords).toContain('geology');
  });

  test('auto-tagging does not duplicate existing system-keywords', async () => {
    const engine = makeEngine(
      { 'ngdpbase.search.provider.elasticsearch.autotagging.enabled': true },
      { CatalogManager: mockCatalogManager }
    );
    const provider = new ElasticsearchSearchProvider(engine);
    await provider.initialize();

    mockClientInstance.index.mockResolvedValue({});
    await provider.updatePageInIndex('RockyPage', {
      content: 'Geology is the study of rocks.',
      metadata: { title: 'Rocky Page', 'system-keywords': ['geology'], 'user-keywords': [] }
    });

    const indexed = mockClientInstance.index.mock.calls[0][0].document;
    const geologyCount = indexed.systemKeywords.filter(k => k === 'geology').length;
    expect(geologyCount).toBe(1);
  });

  test('auto-tagging excludes workflow-status terms', async () => {
    const engine = makeEngine(
      { 'ngdpbase.search.provider.elasticsearch.autotagging.enabled': true },
      { CatalogManager: mockCatalogManager }
    );
    const provider = new ElasticsearchSearchProvider(engine);
    await provider.initialize();

    mockClientInstance.index.mockResolvedValue({});
    await provider.updatePageInIndex('DraftPage', {
      content: 'This is a draft document under review for publication.',
      metadata: { title: 'Draft Page', 'system-keywords': [], 'user-keywords': [] }
    });

    const indexed = mockClientInstance.index.mock.calls[0][0].document;
    expect(indexed.systemKeywords).not.toContain('draft');
  });

  test('auto-tagging works gracefully when CatalogManager absent', async () => {
    const engine = makeEngine(
      { 'ngdpbase.search.provider.elasticsearch.autotagging.enabled': true }
      // no CatalogManager in extraManagers
    );
    const provider = new ElasticsearchSearchProvider(engine);
    await provider.initialize();

    mockClientInstance.index.mockResolvedValue({});
    await provider.updatePageInIndex('RockyPage', {
      content: 'Geology rocks.',
      metadata: { title: 'Rocky Page', 'system-keywords': [], 'user-keywords': [] }
    });

    const indexed = mockClientInstance.index.mock.calls[0][0].document;
    expect(indexed.systemKeywords).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('isHealthy()', () => {
  test('returns true when ping succeeds', async () => {
    const engine = makeEngine();
    const provider = new ElasticsearchSearchProvider(engine);
    await provider.initialize();

    expect(await provider.isHealthy()).toBe(true);
  });

  test('returns false when ping throws', async () => {
    mockClientInstance.ping.mockRejectedValue(new Error('connection refused'));

    const engine = makeEngine();
    const provider = new ElasticsearchSearchProvider(engine);
    await provider.initialize();

    expect(await provider.isHealthy()).toBe(false);
  });
});
