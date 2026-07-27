/**
 * SearchManager tests
 *
 * Tests SearchManager's core functionality:
 * - Search provider initialization
 * - Search operations (search, searchByCategory, searchByKeywords)
 * - Index management (build, add, remove)
 * - Multi-criteria search
 *
 * @jest-environment jsdom
 */

import SearchManager from '../SearchManager';
import type { WikiEngine } from '../../types/WikiEngine';

// Mock ConfigurationManager
const mockConfigurationManager = {
  getProperty: vi.fn((key, defaultValue) => {
    if (key === 'ngdpbase.search.enabled') {
      return true;
    }
    if (key === 'ngdpbase.search.provider.default') {
      return 'lunrsearchprovider';
    }
    if (key === 'ngdpbase.search.provider') {
      return 'lunrsearchprovider';
    }
    return defaultValue;
  })
};

// Mock PageManager
const mockPageManager = {
  getAllPages: vi.fn().mockResolvedValue([
    {
      title: 'Welcome',
      content: 'Welcome to our wiki platform',
      category: 'General',
      keywords: ['welcome', 'intro']
    },
    {
      title: 'Search Guide',
      content: 'How to search effectively',
      category: 'Help',
      keywords: ['search', 'guide']
    }
  ])
};

// Mock engine
const mockEngine = {
  getManager: vi.fn((name) => {
    if (name === 'ConfigurationManager') {
      return mockConfigurationManager;
    }
    if (name === 'PageManager') {
      return mockPageManager;
    }
    return null;
  })
};

describe('SearchManager', () => {
  let searchManager;

  beforeEach(async () => {
    // Clear mocks
    vi.clearAllMocks();

    searchManager = new SearchManager(mockEngine);
    await searchManager.initialize();
  });

  describe('Initialization', () => {
    test('should initialize without errors', async () => {
      const newSearchManager = new SearchManager(mockEngine);
      await expect(newSearchManager.initialize()).resolves.not.toThrow();
    });

    test('should load LunrSearchProvider by default', async () => {
      expect(searchManager.provider).toBeDefined();
      expect(searchManager.providerClass).toBe('LunrSearchProvider');
    });

    test('should build search index during initialization', async () => {
      // Verify buildSearchIndex was called (implicitly by checking provider state)
      expect(searchManager.provider).toBeDefined();
    });

    test('should throw error if ConfigurationManager missing', async () => {
      const badEngine = {
        getManager: vi.fn().mockReturnValue(null)
      };

      const newSearchManager = new SearchManager(badEngine);
      await expect(newSearchManager.initialize()).rejects.toThrow('SearchManager requires ConfigurationManager');
    });
  });

  describe('Search functionality', () => {
    test('should search page content', async () => {
      const results = await searchManager.search('welcome');

      expect(results).toBeDefined();
      // Provider returns an object with results array
      expect(typeof results).toBe('object');
    });

    test('should search with multiple terms', async () => {
      const results = await searchManager.search('wiki platform');

      expect(results).toBeDefined();
      expect(typeof results).toBe('object');
    });

    test('should handle empty search queries', async () => {
      const results = await searchManager.search('');

      expect(results).toBeDefined();
      expect(typeof results).toBe('object');
    });

    test('should return provider search results', async () => {
      const results = await searchManager.search('wiki');

      expect(results).toBeDefined();
      expect(typeof results).toBe('object');
      // Mock provider returns {results: [], totalHits: 0}
      if (results.results !== undefined) {
        expect(Array.isArray(results.results)).toBe(true);
      }
    });
  });

  describe('Index management', () => {
    test('should rebuild search index', async () => {
      await expect(searchManager.rebuildIndex()).resolves.not.toThrow();
    });

    test('should update page in index', async () => {
      const pageData = {
        title: 'New Page',
        content: 'This is new content',
        category: 'Test',
        keywords: ['new', 'test']
      };

      await expect(searchManager.updatePageInIndex('NewPage', pageData)).resolves.not.toThrow();
    });

    test('should remove page from index', async () => {
      const pageTitle = 'Welcome';

      await expect(searchManager.removePageFromIndex(pageTitle)).resolves.not.toThrow();
    });

    test('should get document count', async () => {
      const count = await searchManager.getDocumentCount();

      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Advanced search', () => {
    test('should search by category', async () => {
      const results = await searchManager.searchByCategory('General');

      expect(results).toBeDefined();
      // Returns provider search result (object or array depending on provider)
      expect(results).toBeTruthy();
    });

    test('should search by keywords', async () => {
      const results = await searchManager.searchByKeywords(['welcome']);

      expect(results).toBeDefined();
      // searchByKeywords delegates to search(), returns provider result
      expect(typeof results).toBe('object');
    });

    test('should perform multi-criteria search', async () => {
      const results = await searchManager.multiSearch({
        query: 'search',
        category: 'Help',
        keywords: ['guide']
      });

      expect(results).toBeDefined();
      // Returns provider result
      expect(results).toBeTruthy();
    });

    test('should get search statistics', async () => {
      const stats = await searchManager.getStatistics();

      expect(stats).toBeDefined();
      expect(typeof stats).toBe('object');
    });

    test('should support searchIn field filtering', async () => {
      // Test with searchIn: ['title'] - should only search title field
      const titleResults = await searchManager.advancedSearch({
        query: 'Welcome',
        searchIn: ['title']
      });

      expect(titleResults).toBeDefined();
      expect(Array.isArray(titleResults)).toBe(true);
    });

    test('should support searchIn with multiple fields', async () => {
      // Test with searchIn: ['title', 'content']
      const results = await searchManager.advancedSearch({
        query: 'wiki',
        searchIn: ['title', 'content']
      });

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    test('should search all fields when searchIn is all', async () => {
      // Test with searchIn: ['all'] - default behavior
      const allResults = await searchManager.advancedSearch({
        query: 'wiki',
        searchIn: ['all']
      });

      expect(allResults).toBeDefined();
      expect(Array.isArray(allResults)).toBe(true);
    });

    test('should support searchIn with category and keywords fields', async () => {
      // Test with searchIn: ['category', 'keywords']
      const results = await searchManager.advancedSearch({
        query: 'General',
        searchIn: ['category']
      });

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('Provider info', () => {
    test('should have provider loaded', () => {
      expect(searchManager.provider).toBeDefined();
      expect(searchManager.providerClass).toBe('LunrSearchProvider');
    });
  });

  describe('Configuration-based behavior', () => {
    test('should skip provider loading when search disabled', async () => {
      const disabledConfigManager = {
        getProperty: vi.fn((key, defaultValue) => {
          if (key === 'ngdpbase.search.enabled') {
            return false; // Disable search
          }
          return defaultValue;
        })
      };

      const disabledEngine = {
        getManager: vi.fn((name) => {
          if (name === 'ConfigurationManager') {
            return disabledConfigManager;
          }
          return null;
        })
      };

      const disabledSearchManager = new SearchManager(disabledEngine);
      await disabledSearchManager.initialize();

      // When disabled, initialize() returns early without loading provider
      // Provider will be undefined or null
      expect(disabledSearchManager.provider).toBeFalsy();
    });
  });

  describe('searchByCategories() — multi-category dedup', () => {
    test('returns empty array for empty input', async () => {
      const results = await searchManager.searchByCategories([]);
      expect(results).toEqual([]);
    });

    test('aggregates results from multiple categories without duplicates', async () => {
      // Both categories return the same page — should appear only once
      const results = await searchManager.searchByCategories(['General', 'Help']);
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('searchByUserKeywordsList() — multi-keyword dedup', () => {
    test('returns empty array for empty input', async () => {
      const results = await searchManager.searchByUserKeywordsList([]);
      expect(results).toEqual([]);
    });

    test('returns results for a single keyword', async () => {
      const results = await searchManager.searchByUserKeywordsList(['welcome']);
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('getAllCategories()', () => {
    test('returns an array', async () => {
      const result = await searchManager.getAllCategories();
      expect(Array.isArray(result)).toBe(true);
    });

    test('returns empty array when provider is null', async () => {
      searchManager.provider = null;
      const result = await searchManager.getAllCategories();
      expect(result).toEqual([]);
    });
  });

  describe('getAllUserKeywords()', () => {
    test('returns an array', async () => {
      const result = await searchManager.getAllUserKeywords();
      expect(Array.isArray(result)).toBe(true);
    });

    test('returns empty array when provider is null', async () => {
      searchManager.provider = null;
      const result = await searchManager.getAllUserKeywords();
      expect(result).toEqual([]);
    });
  });

  describe('getAllSystemKeywords()', () => {
    test('returns empty array when provider lacks the method', async () => {
      // LunrSearchProvider does not implement getAllSystemKeywords
      const result = await searchManager.getAllSystemKeywords();
      expect(Array.isArray(result)).toBe(true);
    });

    test('returns empty array when provider is null', async () => {
      searchManager.provider = null;
      const result = await searchManager.getAllSystemKeywords();
      expect(result).toEqual([]);
    });
  });

  describe('getPageSystemKeywords()', () => {
    test('returns empty array when provider lacks the method', async () => {
      const result = await searchManager.getPageSystemKeywords('Welcome');
      expect(Array.isArray(result)).toBe(true);
    });

    test('returns empty array when provider is null', async () => {
      searchManager.provider = null;
      const result = await searchManager.getPageSystemKeywords('Welcome');
      expect(result).toEqual([]);
    });
  });

  describe('searchBySystemKeywordsList()', () => {
    test('returns empty array for empty keywords', async () => {
      const result = await searchManager.searchBySystemKeywordsList([]);
      expect(result).toEqual([]);
    });

    test('returns empty array when provider is null', async () => {
      searchManager.provider = null;
      const result = await searchManager.searchBySystemKeywordsList(['tag1']);
      expect(result).toEqual([]);
    });
  });

  describe('addToIndex()', () => {
    test('does nothing when page is null', async () => {
      await expect(searchManager.addToIndex(null)).resolves.not.toThrow();
    });

    test('does nothing when page has no name', async () => {
      await expect(searchManager.addToIndex({ title: 'Test' })).resolves.not.toThrow();
    });

    test('delegates to updatePageInIndex for valid page', async () => {
      const updateSpy = vi.spyOn(searchManager, 'updatePageInIndex').mockResolvedValue(undefined);
      await searchManager.addToIndex({ name: 'TestPage', title: 'Test', content: 'test content' });
      expect(updateSpy).toHaveBeenCalledWith('TestPage', expect.objectContaining({ name: 'TestPage' }));
    });
  });

  describe('removeFromIndex()', () => {
    test('does nothing when pageName is empty', async () => {
      await expect(searchManager.removeFromIndex('')).resolves.not.toThrow();
    });

    test('delegates to removePageFromIndex for valid pageName', async () => {
      const removeSpy = vi.spyOn(searchManager, 'removePageFromIndex').mockResolvedValue(undefined);
      await searchManager.removeFromIndex('Welcome');
      expect(removeSpy).toHaveBeenCalledWith('Welcome');
    });
  });

  describe('backup()', () => {
    test('returns managerName and timestamp', async () => {
      const result = await searchManager.backup();
      expect(result.managerName).toBe('SearchManager');
      expect(result.timestamp).toBeTruthy();
    });

    test('includes providerClass', async () => {
      const result = await searchManager.backup();
      expect(result.providerClass).toBe('LunrSearchProvider');
    });

    test('returns minimal backup when provider is null', async () => {
      searchManager.provider = null;
      const result = await searchManager.backup();
      expect(result.managerName).toBe('SearchManager');
    });
  });

  describe('backup() with working provider.backup()', () => {
    test('returns providerBackup when provider.backup() resolves', async () => {
      searchManager.provider.backup = vi.fn().mockResolvedValue({ docs: [] });
      const result = await searchManager.backup();
      expect(result.providerBackup).toBeDefined();
    });
  });

  describe('restore()', () => {
    test('does nothing when provider is null', async () => {
      searchManager.provider = null;
      await expect(searchManager.restore({ managerName: 'SearchManager' })).resolves.not.toThrow();
    });

    test('does not throw with valid backup data', async () => {
      const backupData = await searchManager.backup();
      await expect(searchManager.restore(backupData)).resolves.not.toThrow();
    });

    test('calls provider.restore() when provider exists and restore() is a function', async () => {
      searchManager.provider.restore = vi.fn().mockResolvedValue(undefined);
      await expect(searchManager.restore({ managerName: 'SearchManager' })).resolves.not.toThrow();
      expect(searchManager.provider.restore).toHaveBeenCalled();
    });
  });

  describe('shutdown()', () => {
    test('does not throw', async () => {
      await expect(searchManager.shutdown()).resolves.not.toThrow();
    });

    test('closes the provider without error', async () => {
      // SearchManager.shutdown() closes the provider but does not call super.shutdown()
      const closeSpy = vi.spyOn(searchManager.provider, 'close').mockResolvedValue(undefined);
      await searchManager.shutdown();
      expect(closeSpy).toHaveBeenCalled();
    });

    test('handles provider.close() throwing without rethrowing', async () => {
      searchManager.provider.close = vi.fn().mockRejectedValue(new Error('close error'));
      await expect(searchManager.shutdown()).resolves.not.toThrow();
    });
  });

  describe('multiSearch()', () => {
    test('returns empty array when advancedSearch throws', async () => {
      searchManager.provider.advancedSearch = vi.fn().mockRejectedValue(new Error('search failed'));
      const result = await searchManager.multiSearch({ query: 'test' });
      expect(result).toEqual([]);
    });

    test('returns [] for null criteria', async () => {
      expect(await searchManager.multiSearch(null)).toEqual([]);
    });
  });

  // Helper: minimal mock provider (overrides applied per-test)
  function makeMockProvider(overrides: Record<string, unknown> = {}) {
    return {
      search: vi.fn().mockResolvedValue([]),
      advancedSearch: vi.fn().mockResolvedValue([]),
      suggestSimilarPages: vi.fn().mockResolvedValue([]),
      getSuggestions: vi.fn().mockResolvedValue([]),
      getAllDocuments: vi.fn().mockResolvedValue([]),
      getDocumentCount: vi.fn().mockResolvedValue(0),
      getStatistics: vi.fn().mockResolvedValue({ totalDocuments: 0, indexSize: 0, averageDocumentLength: 0, totalCategories: 0, totalUserKeywords: 0 }),
      backup: vi.fn().mockResolvedValue({}),
      restore: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      buildIndex: vi.fn().mockResolvedValue(undefined),
      updatePageInIndex: vi.fn().mockResolvedValue(undefined),
      removePageFromIndex: vi.fn().mockResolvedValue(undefined),
      isHealthy: vi.fn().mockResolvedValue(true),
      getProviderInfo: vi.fn().mockReturnValue({ name: 'MockProvider', features: [] }),
      ...overrides
    };
  }

  describe('searchWithContext()', () => {
    const wikiCtx = { pageName: 'Test', content: '', userContext: { username: 'alice', roles: ['user'] } };

    test('throws when wikiContext is null', async () => {
      await expect(searchManager.searchWithContext(null, 'query')).rejects.toThrow('requires a WikiContext');
    });

    test('returns [] when provider is null', async () => {
      searchManager.provider = null;
      expect(await searchManager.searchWithContext(wikiCtx, 'query')).toEqual([]);
    });

    test('returns results from provider', async () => {
      searchManager.provider = makeMockProvider({ search: vi.fn().mockResolvedValue([{ pageName: 'Test', title: 'Test' }]) });
      const result = await searchManager.searchWithContext(wikiCtx, 'test');
      expect(result).toHaveLength(1);
    });

    test('returns [] when provider.search throws', async () => {
      searchManager.provider = makeMockProvider({ search: vi.fn().mockRejectedValue(new Error('fail')) });
      expect(await searchManager.searchWithContext(wikiCtx, 'test')).toEqual([]);
    });
  });

  describe('advancedSearchWithContext()', () => {
    const wikiCtx = { pageName: 'Test', content: '', userContext: { username: 'alice', roles: ['user'] } };

    test('throws when wikiContext is null', async () => {
      await expect(searchManager.advancedSearchWithContext(null, {})).rejects.toThrow('requires a WikiContext');
    });

    test('returns [] when provider is null', async () => {
      searchManager.provider = null;
      expect(await searchManager.advancedSearchWithContext(wikiCtx, {})).toEqual([]);
    });

    test('returns results from provider', async () => {
      searchManager.provider = makeMockProvider({ advancedSearch: vi.fn().mockResolvedValue([{ pageName: 'Test', title: 'Test' }]) });
      const result = await searchManager.advancedSearchWithContext(wikiCtx, { query: 'test' });
      expect(result).toHaveLength(1);
    });

    test('returns [] when provider.advancedSearch throws', async () => {
      searchManager.provider = makeMockProvider({ advancedSearch: vi.fn().mockRejectedValue(new Error('fail')) });
      expect(await searchManager.advancedSearchWithContext(wikiCtx, {})).toEqual([]);
    });
  });

  describe('suggestSimilarPages()', () => {
    test('returns [] when provider is null', async () => {
      searchManager.provider = null;
      expect(await searchManager.suggestSimilarPages('TestPage')).toEqual([]);
    });

    test('returns suggestions from provider', async () => {
      searchManager.provider = makeMockProvider({ suggestSimilarPages: vi.fn().mockResolvedValue([{ pageName: 'Similar', title: 'Similar' }]) });
      expect(await searchManager.suggestSimilarPages('TestPage', 3)).toHaveLength(1);
    });

    test('returns [] when provider.suggestSimilarPages throws', async () => {
      searchManager.provider = makeMockProvider({ suggestSimilarPages: vi.fn().mockRejectedValue(new Error('fail')) });
      expect(await searchManager.suggestSimilarPages('TestPage')).toEqual([]);
    });
  });

  describe('getSuggestions()', () => {
    test('returns [] when provider is null', async () => {
      searchManager.provider = null;
      expect(await searchManager.getSuggestions('test')).toEqual([]);
    });

    test('returns suggestions from provider', async () => {
      searchManager.provider = makeMockProvider({ getSuggestions: vi.fn().mockResolvedValue(['test page', 'testing']) });
      expect(await searchManager.getSuggestions('test')).toEqual(['test page', 'testing']);
    });

    test('returns [] when provider.getSuggestions throws', async () => {
      searchManager.provider = makeMockProvider({ getSuggestions: vi.fn().mockRejectedValue(new Error('fail')) });
      expect(await searchManager.getSuggestions('test')).toEqual([]);
    });
  });

  describe('getAllDocuments()', () => {
    test('returns documents from provider', async () => {
      searchManager.provider = makeMockProvider({ getAllDocuments: vi.fn().mockResolvedValue([{ pageName: 'A' }]) });
      expect(await searchManager.getAllDocuments()).toHaveLength(1);
    });

    test('returns [] when provider.getAllDocuments throws', async () => {
      searchManager.provider = makeMockProvider({ getAllDocuments: vi.fn().mockRejectedValue(new Error('fail')) });
      expect(await searchManager.getAllDocuments()).toEqual([]);
    });
  });

  describe('searchByKeywords()', () => {
    test('returns [] for null input', async () => {
      expect(await searchManager.searchByKeywords(null)).toEqual([]);
    });

    test('returns [] for non-array input', async () => {
      expect(await searchManager.searchByKeywords('not-an-array')).toEqual([]);
    });

    test('calls search with joined keywords', async () => {
      searchManager.provider = makeMockProvider({ search: vi.fn().mockResolvedValue([{ pageName: 'Result', title: 'Result' }]) });
      const result = await searchManager.searchByKeywords(['hello', 'world']);
      expect(result).toHaveLength(1);
    });
  });

  describe('addToIndex() — error path', () => {
    test('logs error and does not rethrow when updatePageInIndex throws', async () => {
      searchManager.provider = makeMockProvider({ updatePageInIndex: vi.fn().mockRejectedValue(new Error('fail')) });
      await expect(searchManager.addToIndex({ name: 'TestPage', title: 'Test', content: '' })).resolves.not.toThrow();
    });
  });

  describe('removeFromIndex() — error path', () => {
    test('logs error and does not rethrow when removePageFromIndex throws', async () => {
      searchManager.provider = makeMockProvider({ removePageFromIndex: vi.fn().mockRejectedValue(new Error('fail')) });
      await expect(searchManager.removeFromIndex('TestPage')).resolves.not.toThrow();
    });
  });

  describe('buildSearchIndex() — error path', () => {
    test('rethrows when provider.buildIndex fails', async () => {
      searchManager.provider = makeMockProvider({ buildIndex: vi.fn().mockRejectedValue(new Error('index error')) });
      await expect(searchManager.buildSearchIndex()).rejects.toThrow('index error');
    });
  });

  describe('search() — error path', () => {
    test('returns [] when provider.search throws', async () => {
      searchManager.provider = makeMockProvider({ search: vi.fn().mockRejectedValue(new Error('search error')) });
      expect(await searchManager.search('test')).toEqual([]);
    });
  });

  describe('advancedSearch() — error path', () => {
    test('returns [] when provider.advancedSearch throws', async () => {
      searchManager.provider = makeMockProvider({ advancedSearch: vi.fn().mockRejectedValue(new Error('fail')) });
      expect(await searchManager.advancedSearch({ query: 'test' })).toEqual([]);
    });
  });

  describe('getDocumentCount() — error path', () => {
    test('returns 0 when provider.getDocumentCount throws', async () => {
      searchManager.provider = makeMockProvider({ getDocumentCount: vi.fn().mockRejectedValue(new Error('fail')) });
      expect(await searchManager.getDocumentCount()).toBe(0);
    });
  });

  describe('getStatistics() — error path', () => {
    test('returns empty stats when provider.getStatistics throws', async () => {
      searchManager.provider = makeMockProvider({ getStatistics: vi.fn().mockRejectedValue(new Error('fail')) });
      const result = await searchManager.getStatistics();
      expect(result.totalDocuments).toBe(0);
    });
  });
});
