/**
 * PageManager Tests
 *
 * PageManager is a thin proxy that delegates all operations to a provider.
 * These tests verify the proxy behavior, not the provider logic itself.
 * Provider logic is tested in provider-specific test files.
 */

import PageManager from '../PageManager';
import { TEST_ACTOR, actor } from '../../test-support/actors';
import { ANONYMOUS_SUBJECT } from '../UserManager';
import type { WikiEngine } from '../../types/WikiEngine';

// Mock ConfigurationManager
const mockConfigurationManager = {
  getProperty: vi.fn((key, defaultValue) => {
    const config = {
      'ngdpbase.page.enabled': true,
      'ngdpbase.page.provider.default': 'filesystemprovider',
      'ngdpbase.page.provider': 'filesystemprovider',
      'ngdpbase.directories.pages': './pages',
      'ngdpbase.directories.required-pages': './required-pages'
    };
    return config[key] !== undefined ? config[key] : defaultValue;
  })
};

// Mock engine
const mockEngine = {
  getManager: vi.fn((name) => {
    if (name === 'ConfigurationManager') return mockConfigurationManager;
    return null;
  }),
  getConfig: vi.fn(() => ({ get: vi.fn() }))
};

describe('PageManager', () => {
  let pageManager;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset mock implementation to default behavior
    mockConfigurationManager.getProperty.mockImplementation((key, defaultValue) => {
      const config = {
        'ngdpbase.page.enabled': true,
        'ngdpbase.page.provider.default': 'filesystemprovider',
        'ngdpbase.page.provider': 'filesystemprovider',
        'ngdpbase.directories.pages': './pages',
        'ngdpbase.directories.required-pages': './required-pages'
      };
      return config[key] !== undefined ? config[key] : defaultValue;
    });

    pageManager = new PageManager(mockEngine);
    await pageManager.initialize();
  });

  afterEach(async () => {
    if (pageManager.provider) {
      await pageManager.shutdown();
    }
  });

  describe('Initialization', () => {
    test('should require ConfigurationManager', async () => {
      const engineWithoutConfig = { getManager: vi.fn(() => null) };
      const manager = new PageManager(engineWithoutConfig);

      await expect(manager.initialize()).rejects.toThrow('PageManager requires ConfigurationManager');
    });

    test('should initialize provider', async () => {
      expect(pageManager.provider).toBeTruthy();
      expect(pageManager.provider.initialized).toBe(true);
    });

    test('should get configuration from ConfigurationManager', async () => {
      expect(mockConfigurationManager.getProperty).toHaveBeenCalledWith('ngdpbase.page.enabled', true);
      expect(mockConfigurationManager.getProperty).toHaveBeenCalledWith('ngdpbase.page.provider', expect.any(String));
    });

    test('should handle disabled page storage', async () => {
      mockConfigurationManager.getProperty.mockImplementation((key, defaultValue) => {
        if (key === 'ngdpbase.page.enabled') return false;
        return defaultValue;
      });

      const disabledManager = new PageManager(mockEngine);
      await disabledManager.initialize();

      expect(disabledManager.provider).toBeNull();
    });
  });

  describe('getCurrentPageProvider()', () => {
    test('should return the provider instance', () => {
      const provider = pageManager.getCurrentPageProvider();
      expect(provider).toBe(pageManager.provider);
      expect(provider).toBeTruthy();
    });

    test('should return provider with correct interface', () => {
      const provider = pageManager.getCurrentPageProvider();
      expect(provider.getProviderInfo).toBeDefined();
      expect(typeof provider.getProviderInfo).toBe('function');
    });
  });

  describe('Proxy Methods', () => {
    test('getPage() should delegate to provider', async () => {
      const mockPage = { title: 'Test', content: '# Test' };
      pageManager.provider.getPage = vi.fn().mockResolvedValue(mockPage);

      const result = await pageManager.getPage('Test', TEST_ACTOR);

      expect(pageManager.provider.getPage).toHaveBeenCalledWith('Test', TEST_ACTOR);
      expect(result).toBe(mockPage);
    });

    test('getPageContent() should delegate to provider', async () => {
      pageManager.provider.getPageContent = vi.fn().mockResolvedValue('# Content');

      const result = await pageManager.getPageContent('Test', TEST_ACTOR);

      expect(pageManager.provider.getPageContent).toHaveBeenCalledWith('Test', TEST_ACTOR);
      expect(result).toBe('# Content');
    });

    test('getPageMetadata() should delegate to provider', async () => {
      const mockMetadata = { title: 'Test', uuid: '123' };
      pageManager.provider.getPageMetadata = vi.fn().mockResolvedValue(mockMetadata);

      const result = await pageManager.getPageMetadata('Test', TEST_ACTOR);

      expect(pageManager.provider.getPageMetadata).toHaveBeenCalledWith('Test', TEST_ACTOR);
      expect(result).toBe(mockMetadata);
    });

    test('savePage() should delegate to provider', async () => {
      pageManager.provider.savePage = vi.fn().mockResolvedValue(undefined);

      await pageManager.savePage('Test', '# Content', { category: 'General' }, TEST_ACTOR);

      expect(pageManager.provider.savePage).toHaveBeenCalledWith('Test', '# Content', { category: 'General' }, TEST_ACTOR);
    });

    test('deletePage() should delegate to provider', async () => {
      pageManager.provider.deletePage = vi.fn().mockResolvedValue(undefined);

      await pageManager.deletePage('Test', TEST_ACTOR);

      expect(pageManager.provider.deletePage).toHaveBeenCalledWith('Test', TEST_ACTOR);
    });

    test('pageExists() should delegate to provider', () => {
      pageManager.provider.pageExists = vi.fn().mockReturnValue(true);

      const result = pageManager.pageExists('Test', TEST_ACTOR);

      expect(pageManager.provider.pageExists).toHaveBeenCalledWith('Test', TEST_ACTOR);
      expect(result).toBe(true);
    });

    test('getAllPages() should delegate to provider', async () => {
      const mockPages = [{ title: 'Page1' }, { title: 'Page2' }];
      pageManager.provider.getAllPages = vi.fn().mockResolvedValue(mockPages);

      const result = await pageManager.getAllPages();

      expect(pageManager.provider.getAllPages).toHaveBeenCalled();
      expect(result).toBe(mockPages);
    });

    test('refreshPageList() should delegate to provider', async () => {
      pageManager.provider.refreshPageList = vi.fn().mockResolvedValue(undefined);

      await pageManager.refreshPageList();

      expect(pageManager.provider.refreshPageList).toHaveBeenCalled();
    });
  });

  describe('WikiContext Methods', () => {
    test('savePageWithContext() should require WikiContext', async () => {
      await expect(pageManager.savePageWithContext(null)).rejects.toThrow(
        'PageManager.savePageWithContext requires a WikiContext'
      );
    });

    test('savePageWithContext() should extract data from WikiContext', async () => {
      pageManager.provider.savePage = vi.fn().mockResolvedValue(undefined);

      const wikiContext = {
        pageName: 'Test Page',
        content: '# Test Content',
        userContext: { username: 'testuser' }
      };

      await pageManager.savePageWithContext(wikiContext, { category: 'General' });

      expect(pageManager.provider.savePage).toHaveBeenCalledWith(
        'Test Page',
        '# Test Content',
        {
          category: 'General',
          author: 'testuser',
          editor: 'testuser'
        },
        // #1179: the save acts as the request's subject.
        expect.objectContaining({ username: 'testuser' })
      );
    });

    test('savePageWithContext() should use anonymous if no user', async () => {
      pageManager.provider.savePage = vi.fn().mockResolvedValue(undefined);

      const wikiContext = {
        pageName: 'Test Page',
        content: '# Test Content'
      };

      await pageManager.savePageWithContext(wikiContext, {});

      expect(pageManager.provider.savePage).toHaveBeenCalledWith(
        'Test Page',
        '# Test Content',
        { author: 'anonymous', editor: 'anonymous' },
        // No subject on the context: the save acts as the anonymous subject.
        expect.objectContaining({ username: expect.any(String) })
      );
    });

    // #1354: `editor` is who made this version, from the save's context.
    test('savePageWithContext() records the signed-in user as editor, not the stored editor (#1354)', async () => {
      pageManager.provider.savePage = vi.fn().mockResolvedValue(undefined);
      pageManager.provider.getPage = vi.fn().mockResolvedValue({
        content: 'old', metadata: { title: 'Cell', author: 'jim', editor: 'system' }
      });

      // The save route carries the stored frontmatter forward, editor included.
      await pageManager.savePageWithContext(
        { pageName: 'Cell', content: 'new', userContext: { username: 'alice' } },
        { title: 'Cell', editor: 'system' }
      );

      const saved = pageManager.provider.savePage.mock.calls[0][2];
      expect(saved.editor).toBe('alice');
      expect(saved.author).toBe('jim');
    });

    test('savePageWithContext() never makes the editor the author of a page that has none (#1354)', async () => {
      pageManager.provider.savePage = vi.fn().mockResolvedValue(undefined);
      pageManager.provider.getPage = vi.fn().mockResolvedValue({
        content: 'old', metadata: { title: 'Year 1925' }
      });

      await pageManager.savePageWithContext(
        { pageName: 'Year 1925', content: 'new', userContext: { username: 'alice' } },
        { title: 'Year 1925', author: 'alice' }
      );

      const saved = pageManager.provider.savePage.mock.calls[0][2];
      expect(saved).not.toHaveProperty('author');
      expect(saved.editor).toBe('alice');
    });

    test('savePageWithContext() keeps the caller\'s editor when the context has no user (#1354)', async () => {
      pageManager.provider.savePage = vi.fn().mockResolvedValue(undefined);

      await pageManager.savePageWithContext({ pageName: 'Migrated', content: 'x' }, { editor: 'system' });

      expect(pageManager.provider.savePage.mock.calls[0][2].editor).toBe('system');
    });

    // ---------------------------------------------------------------------
    // #639 Slice B: privacy normalization on save
    // ---------------------------------------------------------------------

    test('savePageWithContext() — top-level private:true → emits private:true only (#802 Slice 4: system-location retired)', async () => {
      pageManager.provider.savePage = vi.fn().mockResolvedValue(undefined);
      mockConfigurationManager.getProperty.mockImplementation((key, dv) => {
        if (key === 'ngdpbase.user-keywords') return { private: { storageLocation: 'private' } };
        if (key === 'ngdpbase.system-category') return {};
        return dv;
      });

      const wikiContext = {
        pageName: 'Secret', content: 'body',
        userContext: { username: 'alice' }
      };
      await pageManager.savePageWithContext(wikiContext, { private: true });

      const saved = pageManager.provider.savePage.mock.calls[0][2];
      expect(saved.private).toBe(true);
      // #802 Slice 4: PageManager no longer mirrors private:true to the
      // legacy system-location storage hint. Providers route off
      // `metadata.private` directly.
      expect(saved['system-location']).toBeUndefined();
    });

    test('savePageWithContext() — stray user-keywords:[private] is stripped defensively but no longer triggers privacy (#639 Slice E)', async () => {
      // Slice E removed the back-compat that treated 'private' in user-keywords
      // as a privacy signal. The defensive strip remains — if external authoring
      // tools or hand-edits introduce a stray 'private' it gets cleaned out on
      // save. But it does NOT make the page private; only the top-level
      // `private: true` field does.
      pageManager.provider.savePage = vi.fn().mockResolvedValue(undefined);

      const wikiContext = {
        pageName: 'P', content: 'body',
        userContext: { username: 'alice' }
      };
      await pageManager.savePageWithContext(wikiContext, { 'user-keywords': ['private', 'notes'] });

      const saved = pageManager.provider.savePage.mock.calls[0][2];
      expect(saved.private).toBeUndefined();          // not promoted to private
      expect(saved['system-location']).toBeUndefined();
      expect(saved['user-keywords']).toEqual(['notes']); // 'private' stripped defensively
    });

    test('savePageWithContext() — both signals present → strips keyword, keeps top-level', async () => {
      pageManager.provider.savePage = vi.fn().mockResolvedValue(undefined);
      mockConfigurationManager.getProperty.mockImplementation((key, dv) => {
        if (key === 'ngdpbase.user-keywords') return { private: { storageLocation: 'private' } };
        if (key === 'ngdpbase.system-category') return {};
        return dv;
      });

      const wikiContext = {
        pageName: 'P', content: 'body',
        userContext: { username: 'alice' }
      };
      await pageManager.savePageWithContext(wikiContext, {
        private: true,
        'user-keywords': ['private', 'notes']
      });

      const saved = pageManager.provider.savePage.mock.calls[0][2];
      expect(saved.private).toBe(true);
      expect(saved['user-keywords']).toEqual(['notes']);
    });

    test('savePageWithContext() — non-private save does NOT add private or system-location', async () => {
      pageManager.provider.savePage = vi.fn().mockResolvedValue(undefined);

      const wikiContext = {
        pageName: 'Public', content: 'body',
        userContext: { username: 'alice' }
      };
      await pageManager.savePageWithContext(wikiContext, { 'user-keywords': ['notes'] });

      const saved = pageManager.provider.savePage.mock.calls[0][2];
      expect(saved.private).toBeUndefined();
      expect(saved['system-location']).toBeUndefined();
      expect(saved['user-keywords']).toEqual(['notes']); // unchanged
    });

    test('savePageWithContext() — incoming private:false reaches the provider as the move-out signal, adding nothing else (#1456)', async () => {
      pageManager.provider.savePage = vi.fn().mockResolvedValue(undefined);

      const wikiContext = {
        pageName: 'P', content: 'body',
        userContext: { username: 'alice' }
      };
      await pageManager.savePageWithContext(wikiContext, { private: false });

      // An unticked Private box on a private page moves it out of its store,
      // so the provider must see the explicit false (it strips `private` from
      // a public page's frontmatter itself — FileSystemProvider-privateStore).
      const saved = pageManager.provider.savePage.mock.calls[0][2];
      expect(saved.private).toBe(false);
      expect(saved['system-location']).toBeUndefined();
      expect(saved['user-keywords'] ?? []).not.toContain('private');
    });

    test('savePageWithContext() — leaves user-keywords untouched when no `private` to strip', async () => {
      pageManager.provider.savePage = vi.fn().mockResolvedValue(undefined);

      const wikiContext = {
        pageName: 'P', content: 'body',
        userContext: { username: 'alice' }
      };
      await pageManager.savePageWithContext(wikiContext, { 'user-keywords': ['notes', 'wip'] });

      const saved = pageManager.provider.savePage.mock.calls[0][2];
      expect(saved['user-keywords']).toEqual(['notes', 'wip']);
    });

    // ---------------------------------------------------------------------
    // #893 (Slice 1 of #869): vocabulary-bucket normalization on save
    // ---------------------------------------------------------------------

    test('savePageWithContext() — lifecycle keyword in user-keywords becomes status field (#893)', async () => {
      pageManager.provider.savePage = vi.fn().mockResolvedValue(undefined);
      const wikiContext = { pageName: 'P', content: 'body', userContext: { username: 'alice' } };
      await pageManager.savePageWithContext(wikiContext, { 'user-keywords': ['draft', 'travel'] });

      const saved = pageManager.provider.savePage.mock.calls[0][2];
      expect(saved.status).toBe('draft');
      expect(saved['user-keywords']).toEqual(['travel']);
    });

    test('savePageWithContext() — highest lifecycle state wins across both keyword arrays (#893)', async () => {
      pageManager.provider.savePage = vi.fn().mockResolvedValue(undefined);
      const wikiContext = { pageName: 'P', content: 'body', userContext: { username: 'alice' } };
      await pageManager.savePageWithContext(wikiContext, {
        'user-keywords': ['draft'],
        'system-keywords': ['review', 'general']
      });

      const saved = pageManager.provider.savePage.mock.calls[0][2];
      expect(saved.status).toBe('review');
      expect(saved['user-keywords']).toEqual([]);
      expect(saved['system-keywords']).toEqual(['general']);
    });

    test('savePageWithContext() — explicit status wins over keyword-derived lifecycle (#893)', async () => {
      pageManager.provider.savePage = vi.fn().mockResolvedValue(undefined);
      const wikiContext = { pageName: 'P', content: 'body', userContext: { username: 'alice' } };
      await pageManager.savePageWithContext(wikiContext, {
        status: 'review',
        'user-keywords': ['published']
      });

      const saved = pageManager.provider.savePage.mock.calls[0][2];
      expect(saved.status).toBe('review');
      expect(saved['user-keywords']).toEqual([]);
    });

    test('savePageWithContext() — capture moves user-keywords → system-keywords (#893)', async () => {
      pageManager.provider.savePage = vi.fn().mockResolvedValue(undefined);
      const wikiContext = { pageName: 'P', content: 'body', userContext: { username: 'alice' } };
      await pageManager.savePageWithContext(wikiContext, { 'user-keywords': ['capture', 'travel'] });

      const saved = pageManager.provider.savePage.mock.calls[0][2];
      expect(saved['user-keywords']).toEqual(['travel']);
      expect(saved['system-keywords']).toEqual(['capture']);
      expect(saved.status).toBeUndefined();
    });

    test('savePageWithContext() — capture does not duplicate in system-keywords (#893)', async () => {
      pageManager.provider.savePage = vi.fn().mockResolvedValue(undefined);
      const wikiContext = { pageName: 'P', content: 'body', userContext: { username: 'alice' } };
      await pageManager.savePageWithContext(wikiContext, {
        'user-keywords': ['capture'],
        'system-keywords': ['capture']
      });

      const saved = pageManager.provider.savePage.mock.calls[0][2];
      expect(saved['system-keywords']).toEqual(['capture']);
      expect(saved['user-keywords']).toEqual([]);
    });

    test('savePageWithContext() — explicit default status (published) maps to absence (#893)', async () => {
      pageManager.provider.savePage = vi.fn().mockResolvedValue(undefined);
      const wikiContext = { pageName: 'P', content: 'body', userContext: { username: 'alice' } };
      await pageManager.savePageWithContext(wikiContext, { status: 'published', 'user-keywords': ['travel'] });

      const saved = pageManager.provider.savePage.mock.calls[0][2];
      expect(saved.status).toBeUndefined();
      expect(saved['user-keywords']).toEqual(['travel']);
    });

    test('savePageWithContext() — status catalog is config-driven: custom order wins (#893)', async () => {
      pageManager.provider.savePage = vi.fn().mockResolvedValue(undefined);
      mockConfigurationManager.getProperty.mockImplementation((key, dv) => {
        if (key === 'ngdpbase.status') {
          return {
            idea: { label: 'idea', order: 1, enabled: true },
            final: { label: 'final', order: 2, default: true, enabled: true }
          };
        }
        if (key === 'ngdpbase.system-category') return {};
        return dv;
      });
      const wikiContext = { pageName: 'P', content: 'body', userContext: { username: 'alice' } };
      await pageManager.savePageWithContext(wikiContext, { 'user-keywords': ['idea', 'travel'] });

      const saved = pageManager.provider.savePage.mock.calls[0][2];
      expect(saved.status).toBe('idea');
      expect(saved['user-keywords']).toEqual(['travel']);
      // 'draft' is NOT in the custom catalog — stays an ordinary keyword
      pageManager.provider.savePage.mockClear();
      await pageManager.savePageWithContext(wikiContext, { 'user-keywords': ['draft'] });
      expect(pageManager.provider.savePage.mock.calls[0][2]['user-keywords']).toEqual(['draft']);
    });

    test('savePageWithContext() — clean vocabulary passes through untouched (#893)', async () => {
      pageManager.provider.savePage = vi.fn().mockResolvedValue(undefined);
      const wikiContext = { pageName: 'P', content: 'body', userContext: { username: 'alice' } };
      await pageManager.savePageWithContext(wikiContext, {
        status: 'draft',
        'user-keywords': ['travel'],
        'system-keywords': ['general']
      });

      const saved = pageManager.provider.savePage.mock.calls[0][2];
      expect(saved.status).toBe('draft');
      expect(saved['user-keywords']).toEqual(['travel']);
      expect(saved['system-keywords']).toEqual(['general']);
    });

    test('deletePageWithContext() should require WikiContext', async () => {
      await expect(pageManager.deletePageWithContext(null)).rejects.toThrow(
        'PageManager.deletePageWithContext requires a WikiContext'
      );
    });

    test('deletePageWithContext() should extract pageName from WikiContext', async () => {
      pageManager.provider.deletePage = vi.fn().mockResolvedValue(undefined);

      const wikiContext = {
        pageName: 'Test Page',
        userContext: { username: 'testuser' }
      };

      await pageManager.deletePageWithContext(wikiContext);

      // #947: the acting user is passed through so the tombstone records who deleted it
      expect(pageManager.provider.deletePage).toHaveBeenCalledWith(
        'Test Page',
        // #1179: the context names the deleter on the tombstone.
        expect.objectContaining({ username: 'testuser' })
      );
    });
  });

  describe('Backup and Restore', () => {
    test('backup() should delegate to provider and wrap result', async () => {
      const providerBackup = { pages: [{ title: 'Test' }] };
      pageManager.provider.backup = vi.fn().mockResolvedValue(providerBackup);

      const result = await pageManager.backup();

      expect(pageManager.provider.backup).toHaveBeenCalled();
      expect(result.managerName).toBe('PageManager');
      expect(result.timestamp).toBeTruthy();
      expect(result.providerBackup).toBe(providerBackup);
    });

    test('restore() should extract provider backup and delegate', async () => {
      const providerBackup = { pages: [{ title: 'Test' }] };
      const managerBackup = {
        managerName: 'PageManager',
        timestamp: new Date().toISOString(),
        providerBackup: providerBackup
      };

      pageManager.provider.restore = vi.fn().mockResolvedValue(undefined);

      await pageManager.restore(managerBackup);

      expect(pageManager.provider.restore).toHaveBeenCalledWith(providerBackup);
    });

    test('backup() should return null providerBackup if provider lacks backup method', async () => {
      // Remove backup method from provider
      delete pageManager.provider.backup;

      // Should return result with null providerBackup when provider lacks backup method
      const result = await pageManager.backup();
      expect(result.managerName).toBe('PageManager');
      expect(result.providerBackup).toBeNull();
    });
  });

  describe('shutdown()', () => {
    test('should call provider shutdown', async () => {
      // Mock shutdown method
      pageManager.provider.shutdown = vi.fn().mockResolvedValue(undefined);

      await pageManager.shutdown();

      expect(pageManager.provider.shutdown).toHaveBeenCalled();
    });

    test('should handle provider without shutdown method', async () => {
      // Remove shutdown method
      delete pageManager.provider.shutdown;

      // Should still work (provider.shutdown() will be undefined)
      await expect(pageManager.shutdown()).resolves.not.toThrow();
    });
  });

  describe('getPageUUID()', () => {
    test('should delegate to provider', () => {
      pageManager.provider.getPageUUID = vi.fn().mockReturnValue('test-uuid-001');

      const result = pageManager.getPageUUID('My Page', TEST_ACTOR);

      // #1418: the caller's context reaches the provider — a sealed page resolves only through it.
      expect(pageManager.provider.getPageUUID).toHaveBeenCalledWith('My Page', TEST_ACTOR);
      expect(result).toBe('test-uuid-001');
    });

    test('should return null when provider returns null', () => {
      pageManager.provider.getPageUUID = vi.fn().mockReturnValue(null);

      expect(pageManager.getPageUUID('unknown', TEST_ACTOR)).toBeNull();
    });
  });

  describe('isSharedIndexable() (#1419)', () => {
    test('asks the provider as the anonymous subject — stated, not a default', () => {
      pageManager.provider.pageExists = vi.fn().mockReturnValue(false);

      expect(pageManager.isSharedIndexable('Sealed Diary')).toBe(false);
      expect(pageManager.provider.pageExists).toHaveBeenCalledWith('Sealed Diary', ANONYMOUS_SUBJECT);
    });
  });

  describe('invalidatePageCache() — UUID-based clear (#588)', () => {
    test('should clear rendered-pages using UUID not title', () => {
      const mockClear = vi.fn().mockResolvedValue(undefined);
      const mockCacheManager = { clear: mockClear, isInitialized: () => true };

      mockEngine.getManager.mockImplementation((name) => {
        if (name === 'ConfigurationManager') return mockConfigurationManager;
        if (name === 'CacheManager') return mockCacheManager;
        return null;
      });

      pageManager.provider.invalidatePageCache = vi.fn().mockReturnValue('My Page');
      pageManager.provider.getPageUUID = vi.fn().mockReturnValue('page-uuid-xyz');

      pageManager.invalidatePageCache('My Page', TEST_ACTOR);

      expect(pageManager.provider.getPageUUID).toHaveBeenCalledWith('My Page', TEST_ACTOR);
      expect(mockClear).toHaveBeenCalledWith(undefined, 'rendered-pages:page-uuid-xyz:*');
    });

    test('a page in no process cache (a sealed page, #1418) is still cleared by the UUID the caller resolves', () => {
      const mockClear = vi.fn().mockResolvedValue(undefined);
      const mockCacheManager = { clear: mockClear, isInitialized: () => true };

      mockEngine.getManager.mockImplementation((name) => {
        if (name === 'ConfigurationManager') return mockConfigurationManager;
        if (name === 'CacheManager') return mockCacheManager;
        return null;
      });

      const molly = actor('molly');
      // The provider evicts nothing — sealed pages are never in its caches —
      // but the owner's context resolves the page's UUID from her session catalogue.
      pageManager.provider.invalidatePageCache = vi.fn().mockReturnValue(null);
      pageManager.provider.getPageUUID = vi.fn((id: string, ctx: unknown) => (ctx === molly ? 'sealed-uuid' : null));

      pageManager.invalidatePageCache('Sealed Diary', molly);

      expect(pageManager.provider.getPageUUID).toHaveBeenCalledWith('Sealed Diary', molly);
      expect(mockClear).toHaveBeenCalledWith(undefined, 'rendered-pages:sealed-uuid:*');
    });

    test('should fall back to title when provider has no UUID', () => {
      const mockClear = vi.fn().mockResolvedValue(undefined);
      const mockCacheManager = { clear: mockClear, isInitialized: () => true };

      mockEngine.getManager.mockImplementation((name) => {
        if (name === 'ConfigurationManager') return mockConfigurationManager;
        if (name === 'CacheManager') return mockCacheManager;
        return null;
      });

      pageManager.provider.invalidatePageCache = vi.fn().mockReturnValue('My Page');
      pageManager.provider.getPageUUID = vi.fn().mockReturnValue(null);

      pageManager.invalidatePageCache('My Page', TEST_ACTOR);

      expect(mockClear).toHaveBeenCalledWith(undefined, 'rendered-pages:My Page:*');
    });
  });

  describe('savePage() duplicate guard (#587)', () => {
    test('should call validationManager.checkConflicts() and throw on conflict', async () => {
      const mockCheckConflicts = vi.fn().mockResolvedValue({
        hasConflict: true,
        conflictType: 'title-duplicate',
        message: 'A page with title \'Speed\' already exists under UUID other-uuid'
      });
      mockEngine.getManager.mockImplementation((name) => {
        if (name === 'ConfigurationManager') return mockConfigurationManager;
        if (name === 'ValidationManager') return { checkConflicts: mockCheckConflicts };
        return null;
      });

      await expect(
        pageManager.savePage('Speed', '# Speed', { uuid: 'new-uuid' }, TEST_ACTOR)
      ).rejects.toThrow("A page with title 'Speed' already exists");

      expect(mockCheckConflicts).toHaveBeenCalledWith('new-uuid', 'Speed', '', TEST_ACTOR);
    });

    test('should proceed normally when no conflict', async () => {
      const mockCheckConflicts = vi.fn().mockResolvedValue({ hasConflict: false, conflictType: null });
      pageManager.provider.savePage = vi.fn().mockResolvedValue(undefined);
      mockEngine.getManager.mockImplementation((name) => {
        if (name === 'ConfigurationManager') return mockConfigurationManager;
        if (name === 'ValidationManager') return { checkConflicts: mockCheckConflicts };
        return null;
      });

      await pageManager.savePage('New Page', '# Hello', { uuid: 'new-uuid' }, TEST_ACTOR);

      expect(mockCheckConflicts).toHaveBeenCalled();
      expect(pageManager.provider.savePage).toHaveBeenCalledWith('New Page', '# Hello', { uuid: 'new-uuid' }, TEST_ACTOR);
    });
  });

  describe('restore() edge cases', () => {
    test('restore() logs warning on provider class mismatch', async () => {
      const providerBackup = { pages: [] };
      const managerBackup = {
        managerName: 'PageManager',
        timestamp: new Date().toISOString(),
        providerClass: 'OtherProvider',
        providerBackup
      };
      pageManager.provider.restore = vi.fn().mockResolvedValue(undefined);
      // Should not throw — just warns
      await expect(pageManager.restore(managerBackup)).resolves.not.toThrow();
    });

    test('restore() logs warning when no providerBackup in data', async () => {
      const managerBackup = {
        managerName: 'PageManager',
        timestamp: new Date().toISOString(),
        providerBackup: null
      };
      // No providerBackup → else branch
      await expect(pageManager.restore(managerBackup)).resolves.not.toThrow();
    });

    test('restore() logs warning when provider has no restore method', async () => {
      const managerBackup = {
        managerName: 'PageManager',
        timestamp: new Date().toISOString(),
        providerBackup: { pages: [] }
      };
      delete pageManager.provider.restore;
      // provider.restore undefined → else branch
      await expect(pageManager.restore(managerBackup)).resolves.not.toThrow();
    });

    test('restore() rethrows when provider.restore() throws', async () => {
      const managerBackup = {
        managerName: 'PageManager',
        timestamp: new Date().toISOString(),
        providerBackup: { pages: [] }
      };
      pageManager.provider.restore = vi.fn().mockRejectedValue(new Error('restore fail'));
      await expect(pageManager.restore(managerBackup)).rejects.toThrow('restore fail');
    });
  });

  describe('deletePageWithContext() anonymous user logging', () => {
    test('uses anonymous when userContext has no username', async () => {
      pageManager.provider.deletePage = vi.fn().mockResolvedValue(true);
      const ctx = {
        pageName: 'TestPage',
        userContext: { roles: [] } // no username field
      };
      await expect(pageManager.deletePageWithContext(ctx)).resolves.toBe(true);
    });

    test('uses provided username in log', async () => {
      pageManager.provider.deletePage = vi.fn().mockResolvedValue(true);
      const ctx = {
        pageName: 'TestPage',
        userContext: { username: 'alice' }
      };
      await expect(pageManager.deletePageWithContext(ctx)).resolves.toBe(true);
    });
  });

  describe('Provider Normalization', () => {
    test('should normalize filesystemprovider to FileSystemProvider', async () => {
      // This is tested implicitly in initialization
      expect(pageManager.providerClass).toBe('FileSystemProvider');
    });

    test('should normalize versioningfileprovider to VersioningFileProvider', async () => {
      mockConfigurationManager.getProperty.mockImplementation((key, defaultValue) => {
        if (key === 'ngdpbase.page.provider') return 'versioningfileprovider';
        if (key === 'ngdpbase.page.provider.default') return 'filesystemprovider';
        if (key === 'ngdpbase.page.enabled') return true;
        return defaultValue;
      });

      const manager = new PageManager(mockEngine);
      await manager.initialize();

      expect(manager.providerClass).toBe('VersioningFileProvider');
      await manager.shutdown();
    });
  });

  describe('savePage() private store requires ActorContext (#1389)', () => {
    // #1179/#1382: the context is mandatory and positional — not an option bag
    // a caller can leave out — and the provider is handed the one it was given.
    test('savePage refuses without a context', async () => {
      pageManager.provider.savePage = vi.fn().mockResolvedValue(undefined);

      await expect(
        pageManager.savePage('Diary', '# secret', { private: true, author: 'molly' }, undefined)
      ).rejects.toThrow(/ActorContext/);

      expect(pageManager.provider.savePage).not.toHaveBeenCalled();
    });

    test('a store write forwards the caller\'s context to the provider', async () => {
      pageManager.provider.savePage = vi.fn().mockResolvedValue(undefined);
      pageManager.provider.getPage = vi.fn().mockResolvedValue(null);
      const molly = actor('molly');

      await pageManager.savePage('Diary', '# secret', { private: true, author: 'molly' }, molly);

      expect(pageManager.provider.savePage).toHaveBeenCalledWith(
        'Diary',
        '# secret',
        { private: true, author: 'molly' },
        molly
      );
    });
  });
});

describe('PageManager.getPrivatePageOwner (#1398)', () => {
  const OWNER_CTX = { username: 'alice', roles: ['editor'], isAuthenticated: true };
  const withProvider = (provider: Record<string, unknown>): PageManager => {
    const pm = new PageManager(mockEngine);
    (pm as unknown as { provider: unknown }).provider = provider;
    return pm;
  };

  test('private page: owner and store come from the name, not frontmatter author (#1456)', async () => {
    const getPageMetadata = vi.fn().mockResolvedValue({ uuid: 'u1', private: true, author: 'renamed', store: 'other' });
    const pm = withProvider({ getPageMetadata });
    await expect(pm.getPrivatePageOwner('private/alice/yourphr/Diary', OWNER_CTX))
      .resolves.toEqual({ creator: 'alice', store: 'yourphr' });
    expect(getPageMetadata).toHaveBeenCalledWith('private/alice/yourphr/Diary', OWNER_CTX);
  });

  test('a private name whose page does not exist: null', async () => {
    const pm = withProvider({ getPageMetadata: vi.fn().mockResolvedValue(null) });
    await expect(pm.getPrivatePageOwner('private/alice/default/Nope', OWNER_CTX)).resolves.toBeNull();
  });

  test('public or missing page: null', async () => {
    const pm = withProvider({
      getPageMetadata: vi.fn()
        .mockResolvedValueOnce({ uuid: 'u2' })
        .mockResolvedValueOnce(null)
    });
    await expect(pm.getPrivatePageOwner('Main', OWNER_CTX)).resolves.toBeNull();
    await expect(pm.getPrivatePageOwner('Nope', OWNER_CTX)).resolves.toBeNull();
  });

  test('a public page with private frontmatter is still public: null', async () => {
    const pm = withProvider({
      getPageMetadata: vi.fn().mockResolvedValue({ uuid: 'u4', private: true, author: 'alice' })
    });
    await expect(pm.getPrivatePageOwner('Diary', OWNER_CTX)).resolves.toBeNull();
  });

  test('the page is confirmed through the caller\'s context, not an ambient session', async () => {
    // A sealed store's page is found only by a context holding its handle (P1).
    const pm = withProvider({
      getPageMetadata: vi.fn((_name: string, ctx: { privateStoreHandle?: string }) =>
        Promise.resolve(ctx.privateStoreHandle === 'sid-1' ? { uuid: 'u3' } : null))
    });
    await expect(
      pm.getPrivatePageOwner('private/alice/yourphr/Labs', { ...OWNER_CTX, privateStoreHandle: 'sid-1' })
    ).resolves.toEqual({ creator: 'alice', store: 'yourphr' });
    await expect(pm.getPrivatePageOwner('private/alice/yourphr/Labs', OWNER_CTX)).resolves.toBeNull();
  });
});

describe('PageManager.checkPrivatePageAccess — the private container rule (#1382)', () => {
  const withProvider = (provider: Record<string, unknown>): PageManager => {
    const pm = new PageManager(mockEngine);
    (pm as unknown as { provider: unknown }).provider = provider;
    return pm;
  };
  const DIARY = 'private/alice/default/Diary';
  const privatePage = () => withProvider({
    getPageMetadata: vi.fn().mockResolvedValue({ uuid: 'u1', private: true, author: 'alice' })
  });
  const ctx = (userContext: Record<string, unknown> | undefined) => ({ pageName: DIARY, content: '', userContext });

  test('the owner is allowed', async () => {
    await expect(privatePage().checkPrivatePageAccess(
      ctx({ username: 'alice', roles: ['editor'], isAuthenticated: true }), DIARY
    )).resolves.toBe(true);
  });

  test('admin, another user and anonymous are refused — no role reaches in', async () => {
    const pm = privatePage();
    for (const who of [
      { username: 'root', roles: ['admin'], isAuthenticated: true },
      { username: 'bob', roles: ['editor'], isAuthenticated: true },
      undefined
    ]) {
      await expect(pm.checkPrivatePageAccess(ctx(who), DIARY)).resolves.toBe(false);
    }
  });

  test('ownership is the owner in the name, not frontmatter author (#1456)', async () => {
    const pm = withProvider({
      getPageMetadata: vi.fn().mockResolvedValue({ uuid: 'u1', private: true, author: 'mallory' })
    });
    await expect(pm.checkPrivatePageAccess(ctx({ username: 'mallory', roles: [], isAuthenticated: true }), DIARY)).resolves.toBe(false);
    await expect(pm.checkPrivatePageAccess(ctx({ username: 'alice', roles: [], isAuthenticated: true }), DIARY)).resolves.toBe(true);
  });

  test('a public or missing page is not decided here (null)', async () => {
    const pm = withProvider({
      getPageMetadata: vi.fn().mockResolvedValueOnce({ uuid: 'u2' }).mockResolvedValueOnce(null)
    });
    const who = ctx({ username: 'bob', roles: [], isAuthenticated: true });
    await expect(pm.checkPrivatePageAccess(who, 'Main')).resolves.toBeNull();
    await expect(pm.checkPrivatePageAccess(who, 'Nope')).resolves.toBeNull();
  });

  test('decided from the name alone, so a refusal never reveals whether the page exists (#1456)', async () => {
    // Neither a missing page nor a failing store changes the answer.
    for (const getPageMetadata of [vi.fn().mockResolvedValue(null), vi.fn().mockRejectedValue(new Error('disk'))]) {
      const pm = withProvider({ getPageMetadata });
      await expect(pm.checkPrivatePageAccess(
        ctx({ username: 'bob', roles: [], isAuthenticated: true }), 'private/alice/default/Nope'
      )).resolves.toBe(false);
      await expect(pm.checkPrivatePageAccess(
        ctx({ username: 'alice', roles: [], isAuthenticated: true }), 'private/alice/default/Nope'
      )).resolves.toBe(true);
      expect(getPageMetadata).not.toHaveBeenCalled();
    }
  });
});
