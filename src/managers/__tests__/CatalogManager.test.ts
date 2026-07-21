
// Mock logger before requiring managers
vi.mock('../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })

  }
}));

import CatalogManager from '../CatalogManager';
import type { WikiEngine } from '../../types/WikiEngine';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockEngine(systemKeywords = {}, userKeywords = {}) {
  const configManager = {
    getProperty: vi.fn((key, defaultVal) => {
      if (key === 'ngdpbase.system-keywords') return systemKeywords;
      if (key === 'ngdpbase.user-keywords') return userKeywords;
      if (key === 'ngdpbase.catalog.ai.enabled') return false;
      if (key === 'ngdpbase.catalog.ai.threshold') return 0.7;
      return defaultVal;
    })
  };
  return {
    getManager: vi.fn((name) => name === 'ConfigurationManager' ? configManager : undefined)
  };
}

const DEFAULT_KEYWORDS = {
  general: { label: 'general', category: 'content-type', enabled: true, default: true },
  draft:   { label: 'draft',   category: 'workflow-status', enabled: true },
  geology: { label: 'geology', category: 'subject', enabled: true, uri: 'https://www.wikidata.org/wiki/Q1069' },
  hidden:  { label: 'hidden',  category: 'subject', enabled: false }
};

// ---------------------------------------------------------------------------
// CatalogManager core
// ---------------------------------------------------------------------------

describe('CatalogManager', () => {
  let manager;
  let engine;

  beforeEach(async () => {
    engine = makeMockEngine(DEFAULT_KEYWORDS);
    manager = new CatalogManager(engine as unknown as WikiEngine);
    await manager.initialize();
  });

  test('initializes successfully', () => {
    expect(manager.isInitialized()).toBe(true);
  });

  test('getTerms() returns enabled terms from DefaultCatalogProvider', async () => {
    const terms = await manager.getTerms();
    const labels = terms.map(t => t.term);
    expect(labels).toContain('general');
    expect(labels).toContain('draft');
    expect(labels).toContain('geology');
    // disabled term must be excluded
    expect(labels).not.toContain('hidden');
  });

  test('getTerms() includes uri when config has it', async () => {
    const terms = await manager.getTerms();
    const geo = terms.find(t => t.term === 'geology');
    expect(geo).toBeDefined();
    expect(geo.uri).toBe('https://www.wikidata.org/wiki/Q1069');
  });

  // -------------------------------------------------------------------------
  // #894 (Slice 2 of #869): UserKeywordsCatalogProvider
  // -------------------------------------------------------------------------

  describe('UserKeywordsCatalogProvider (#894)', () => {
    const USER_KEYWORDS = {
      travel: { label: 'travel', description: 'Trips and places', category: 'general', enabled: true },
      hiddenkw: { label: 'hiddenkw', category: 'general', enabled: false }
    };

    beforeEach(async () => {
      engine = makeMockEngine(DEFAULT_KEYWORDS, USER_KEYWORDS);
      manager = new CatalogManager(engine as unknown as WikiEngine);
      await manager.initialize();
    });

    test('is registered at initialize under scheme id user-keywords', async () => {
      const result = await manager.getProviderTerms('user-keywords');
      expect(result).not.toBeNull();
      expect(result.displayName).toBe('User Keywords');
    });

    test('serves enabled config entries with description; disabled excluded', async () => {
      const { terms } = await manager.getProviderTerms('user-keywords');
      const travel = terms.find(t => t.term === 'travel');
      expect(travel).toBeDefined();
      expect(travel.label).toBe('travel');
      expect(travel.description).toBe('Trips and places');
      expect(terms.map(t => t.term)).not.toContain('hiddenkw');
    });

    test('domain-scoped: getTerms("user-keywords") includes only matching + undomained providers', async () => {
      const terms = await manager.getTerms('user-keywords');
      const names = terms.map(t => t.term);
      expect(names).toContain('travel');
    });
  });

  test('resolveUri() returns uri for known term', async () => {
    const uri = await manager.resolveUri('geology');
    expect(uri).toBe('https://www.wikidata.org/wiki/Q1069');
  });

  test('resolveUri() returns null for term with no uri', async () => {
    const uri = await manager.resolveUri('draft');
    expect(uri).toBeNull();
  });

  test('resolveUri() returns null for unknown term', async () => {
    const uri = await manager.resolveUri('nonexistent-term');
    expect(uri).toBeNull();
  });

  test('suggestTerms() returns [] when AI disabled (default)', async () => {
    const suggestions = await manager.suggestTerms('Some page content', 'My Page');
    expect(suggestions).toEqual([]);
  });

  test('getProviderInfo() lists registered providers', () => {
    const info = manager.getProviderInfo();
    const ids = info.map(p => p.id);
    expect(ids).toContain('default');
    expect(ids).toContain('ai');
  });
});

// ---------------------------------------------------------------------------
// Addon provider registration
// ---------------------------------------------------------------------------

describe('CatalogManager — registerProvider', () => {
  let manager;

  beforeEach(async () => {
    const engine = makeMockEngine({ general: { label: 'general', enabled: true } });
    manager = new CatalogManager(engine as unknown as WikiEngine);
    await manager.initialize();
  });

  test('registerProvider() adds a third-party provider', async () => {
    const addonProvider = {
      id: 'geology-addon',
      displayName: 'Geology Addon Provider',
      domain: 'geoscience',
      getTerms: async () => [{ term: 'igneous', label: 'Igneous', category: 'subject', enabled: true }],
      resolveUri: async (term) => term === 'igneous' ? 'https://example.com/igneous' : null
    };

    manager.registerProvider(addonProvider);
    const terms = await manager.getTerms();
    const termNames = terms.map(t => t.term);
    expect(termNames).toContain('igneous');
  });

  test('getTerms(domain) filters by domain', async () => {
    const addonProvider = {
      id: 'geo-provider',
      displayName: 'Geo',
      domain: 'geoscience',
      getTerms: async () => [{ term: 'volcano', label: 'Volcano', enabled: true }]
    };
    const otherProvider = {
      id: 'med-provider',
      displayName: 'Med',
      domain: 'medicine',
      getTerms: async () => [{ term: 'pathogen', label: 'Pathogen', enabled: true }]
    };

    manager.registerProvider(addonProvider);
    manager.registerProvider(otherProvider);

    const geoTerms = await manager.getTerms('geoscience');
    const termNames = geoTerms.map(t => t.term);
    expect(termNames).toContain('volcano');
    expect(termNames).not.toContain('pathogen');
  });

  test('registerProvider() with same id replaces prior provider', async () => {
    const v1 = {
      id: 'custom',
      displayName: 'v1',
      getTerms: async () => [{ term: 'foo', label: 'Foo', enabled: true }]
    };
    const v2 = {
      id: 'custom',
      displayName: 'v2',
      getTerms: async () => [{ term: 'bar', label: 'Bar', enabled: true }]
    };

    manager.registerProvider(v1);
    manager.registerProvider(v2);

    const terms = await manager.getTerms();
    const names = terms.map(t => t.term);
    expect(names).toContain('bar');
    expect(names).not.toContain('foo');
  });

  test('resolveUri() walks providers in order, returns first hit', async () => {
    const p1 = {
      id: 'p1',
      displayName: 'P1',
      getTerms: async () => [],
      resolveUri: async (term) => term === 'shared' ? 'https://p1.example/shared' : null
    };
    const p2 = {
      id: 'p2',
      displayName: 'P2',
      getTerms: async () => [],
      resolveUri: async (term) => term === 'shared' ? 'https://p2.example/shared' : null
    };

    manager.registerProvider(p1);
    manager.registerProvider(p2);

    const uri = await manager.resolveUri('shared');
    // p1 was registered first after default — should win
    expect(uri).toBe('https://p1.example/shared');
  });
});

// ---------------------------------------------------------------------------
// ValidationManager — loadSystemKeywords
// ---------------------------------------------------------------------------

describe('ValidationManager — loadSystemKeywords', () => {
  let ValidationManager;
  let validationManager;

  beforeEach(async () => {
    const mod = await import('../ValidationManager');
    ValidationManager = mod.default ?? mod;
    validationManager = new ValidationManager({ getManager: vi.fn() });
  });

  test('loadSystemKeywords() populates validSystemKeywords from config', () => {
    const mockCfg = {
      getProperty: vi.fn((key, def) => {
        if (key === 'ngdpbase.system-keywords') {
          return {
            draft: { label: 'draft', enabled: true },
            archived: { label: 'archived', enabled: false }
          };
        }
        if (key === 'ngdpbase.maximum.user-keywords') return 5;
        if (key === 'ngdpbase.system-category') return null;
        return def;
      })
    };

    validationManager.loadSystemKeywords(mockCfg);
    const keywords = validationManager.getValidSystemKeywords();
    expect(keywords).toContain('draft');
    expect(keywords).not.toContain('archived');
  });

  test('loadSystemKeywords() handles missing config gracefully', () => {
    validationManager.loadSystemKeywords(undefined);
    expect(validationManager.getValidSystemKeywords()).toEqual([]);
  });

  test('loadSystemKeywords() handles empty system-keywords object', () => {
    const mockCfg = {
      getProperty: vi.fn((key, def) => key === 'ngdpbase.system-keywords' ? {} : def)
    };
    validationManager.loadSystemKeywords(mockCfg);
    expect(validationManager.getValidSystemKeywords()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Asset-source registry (Slice 3 of #755 / #758)
// ---------------------------------------------------------------------------

describe('CatalogManager — asset-source registry (#758)', () => {
  let manager;

  beforeEach(async () => {
    const engine = makeMockEngine({});
    manager = new CatalogManager(engine as unknown as WikiEngine);
    await manager.initialize();
  });

  function makeFakeSource(overrides = {}) {
    return {
      sourceId: 'fake',
      types: ['Article'],
      currentSchemaVersion: 1,
      list: vi.fn(async () => ({ items: [], total: 0 })),
      get: vi.fn(async () => null),
      rebuild: vi.fn(async () => undefined),
      ...overrides
    };
  }

  test('registerSource() adds a source; getSourceInfo() lists it', () => {
    const src = makeFakeSource();
    manager.registerSource(src);
    const info = manager.getSourceInfo();
    expect(info).toHaveLength(1);
    expect(info[0]).toMatchObject({ sourceId: 'fake', currentSchemaVersion: 1 });
    expect(info[0].types).toEqual(['Article']);
  });

  test('registerSource() replaces a source with the same id (last write wins)', () => {
    manager.registerSource(makeFakeSource({ currentSchemaVersion: 1 }));
    manager.registerSource(makeFakeSource({ currentSchemaVersion: 5 }));
    expect(manager.getSourceInfo()[0].currentSchemaVersion).toBe(5);
  });

  test('getCreativeWork() returns null when no source has the id', async () => {
    manager.registerSource(makeFakeSource());
    const work = await manager.getCreativeWork('unknown-id');
    expect(work).toBeNull();
  });

  test('getCreativeWork() returns the first non-null hit', async () => {
    const fakeWork = {
      '@type': 'Article', '@id': '/view/X', identifier: 'x-1', name: 'X', url: '/view/X'
    };
    const a = makeFakeSource({ sourceId: 'a', get: vi.fn(async () => null) });
    const b = makeFakeSource({ sourceId: 'b', get: vi.fn(async () => fakeWork) });
    manager.registerSource(a);
    manager.registerSource(b);
    const work = await manager.getCreativeWork('x-1');
    expect(work).toBe(fakeWork);
    expect(a.get).toHaveBeenCalledWith('x-1');
    expect(b.get).toHaveBeenCalledWith('x-1');
  });

  test('getCreativeWork() with sourceId opt restricts to that source', async () => {
    const fakeWork = {
      '@type': 'Article', '@id': '/view/X', identifier: 'x-1', name: 'X', url: '/view/X'
    };
    const a = makeFakeSource({ sourceId: 'a', get: vi.fn(async () => fakeWork) });
    const b = makeFakeSource({ sourceId: 'b', get: vi.fn(async () => null) });
    manager.registerSource(a);
    manager.registerSource(b);
    const work = await manager.getCreativeWork('x-1', { sourceId: 'b' });
    expect(work).toBeNull();
    expect(a.get).not.toHaveBeenCalled();
    expect(b.get).toHaveBeenCalledWith('x-1');
  });

  test('getCreativeWork() handles a source that throws — logs and continues', async () => {
    const fakeWork = {
      '@type': 'Article', '@id': '/view/X', identifier: 'x-1', name: 'X', url: '/view/X'
    };
    const broken = makeFakeSource({ sourceId: 'broken', get: vi.fn(async () => { throw new Error('boom'); }) });
    const good = makeFakeSource({ sourceId: 'good', get: vi.fn(async () => fakeWork) });
    manager.registerSource(broken);
    manager.registerSource(good);
    const work = await manager.getCreativeWork('x-1');
    expect(work).toBe(fakeWork);
  });

  test('listCreativeWorks() fans out and concatenates', async () => {
    const w1 = { '@type': 'Article', '@id': '/view/A', identifier: 'a', name: 'A', url: '/view/A' };
    const w2 = { '@type': 'ImageObject', '@id': '/media/file/i', name: 'i', url: '/media/file/i' };
    manager.registerSource(makeFakeSource({
      sourceId: 'pages', types: ['Article'],
      list: vi.fn(async () => ({ items: [w1], total: 1 }))
    }));
    manager.registerSource(makeFakeSource({
      sourceId: 'media', types: ['ImageObject', 'VideoObject', 'AudioObject'],
      list: vi.fn(async () => ({ items: [w2], total: 1 }))
    }));
    const page = await manager.listCreativeWorks({});
    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(2);
  });

  test('listCreativeWorks() with types filter only queries matching sources', async () => {
    const pagesList = vi.fn(async () => ({ items: [], total: 0 }));
    const mediaList = vi.fn(async () => ({ items: [], total: 0 }));
    manager.registerSource(makeFakeSource({ sourceId: 'pages', types: ['Article'], list: pagesList }));
    manager.registerSource(makeFakeSource({ sourceId: 'media', types: ['ImageObject'], list: mediaList }));
    await manager.listCreativeWorks({ types: ['ImageObject'] });
    expect(pagesList).not.toHaveBeenCalled();
    expect(mediaList).toHaveBeenCalled();
  });

  test('checkSchemaVersions() reports current vs on-disk per source (initial slice: equal)', () => {
    manager.registerSource(makeFakeSource({ sourceId: 'pages', currentSchemaVersion: 1 }));
    manager.registerSource(makeFakeSource({ sourceId: 'media', currentSchemaVersion: 2 }));
    const report = manager.checkSchemaVersions();
    expect(report).toHaveLength(2);
    expect(report.every(r => !r.isStale)).toBe(true);
    expect(report.map(r => r.sourceId).sort()).toEqual(['media', 'pages']);
  });
});
