/**
 * WikiRoutes coverage — branches not exercised by routes.test.ts:
 *   viewPage  : cache HIT, ACL view denied, cache miss + fresh render
 *   savePage  : invalid title chars, missing/invalid system-category, section edit
 *   deletePage: page not found, ACL denied
 *   Footnote API: getFootnotes / addFootnote / updateFootnote / deleteFootnote — all branches
 *   searchPages: category-only, keyword-only, system-keyword, advanced, empty
 *   previewPage: happy path, error
 */
import express from 'express';
import request from 'supertest';
import path from 'path';
import WikiRoutes from '../WikiRoutes';

vi.mock('../../utils/LocaleUtils', () => {
  const methods = {
    getDateFormatOptions: vi.fn().mockReturnValue(['MM/dd/yyyy']),
    getDateFormatFromLocale: vi.fn().mockReturnValue('MM/dd/yyyy')
  };
  return { default: methods, ...methods };
});

let mockUserContext: {
  username: string;
  displayName: string;
  email: string;
  isAuthenticated: boolean;
  roles: string[];
} | null = null;

vi.mock('../../context/WikiContext', async () => {
  const { createMockWikiContext, MOCK_WIKI_CONTEXT_CONSTANTS } = await import('./__fixtures__/createMockWikiContext');
  const MockWikiContext = vi.fn().mockImplementation(function (engine: unknown, options = {}) {
    return createMockWikiContext(options, {
      engine,
      fallbackUserContext: mockUserContext,
      mockUserManager
    });
  });
  (MockWikiContext as unknown as { CONTEXT: typeof MOCK_WIKI_CONTEXT_CONSTANTS }).CONTEXT = MOCK_WIKI_CONTEXT_CONSTANTS;
  return { default: MockWikiContext };
});

// ── per-test mock state (reset in beforeEach) ─────────────────────────────────

const mockFootnoteManager = {
  isEnabled: vi.fn(),
  getFootnotes: vi.fn(),
  addFootnote: vi.fn(),
  updateFootnote: vi.fn(),
  deleteFootnote: vi.fn()
};

const mockPageManager = {
  getPage: vi.fn(),
  getPageContent: vi.fn(),
  getPageMetadata: vi.fn(),
  getAllPages: vi.fn(),
  getPageNames: vi.fn(),
  getAllPageNames: vi.fn(),
  savePage: vi.fn(),
  savePageWithContext: vi.fn(),
  deletePage: vi.fn(),
  deletePageWithContext: vi.fn(),
  pageExists: vi.fn(),
  getCurrentPageProvider: vi.fn(),
  getPageUUID: vi.fn(),
  provider: null,
  refreshPageList: vi.fn()
};

const mockACLManager = {
  checkPagePermission: vi.fn(),
  checkPagePermissionWithContext: vi.fn(),
  removeACLMarkup: vi.fn(),
  parseACL: vi.fn()
};

const mockCacheManager = {
  isInitialized: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  clear: vi.fn()
};

const mockRenderingManager = {
  textToHTML: vi.fn(),
  getReferringPages: vi.fn(),
  updatePageInLinkGraph: vi.fn(),
  addPageToCache: vi.fn(),
  removePageFromLinkGraph: vi.fn(),
  rebuildLinkGraph: vi.fn()
};

const mockSearchManager = {
  search: vi.fn(),
  advancedSearch: vi.fn(),
  advancedSearchWithContext: vi.fn(),
  searchByCategories: vi.fn(),
  searchByCategory: vi.fn(),
  searchByUserKeywordsList: vi.fn(),
  searchByUserKeywords: vi.fn(),
  searchBySystemKeywordsList: vi.fn(),
  getAllDocuments: vi.fn(),
  getAllCategories: vi.fn(),
  getAllUserKeywords: vi.fn(),
  rebuildIndex: vi.fn(),
  updatePageInIndex: vi.fn(),
  removePageFromIndex: vi.fn(),
  getSuggestions: vi.fn()
};

const mockUserManager = {
  getCurrentUser: vi.fn(),
  hasPermission: vi.fn(),
  getUser: vi.fn(),
  getUsers: vi.fn(),
  getRoles: vi.fn(),
  getPermissions: vi.fn(),
  getUserPermissions: vi.fn(),
  searchUsers: vi.fn(),
  createSession: vi.fn(),
  authenticateUser: vi.fn(),
  destroySession: vi.fn()
};

const mockConfigManager = {
  getProperty: vi.fn((key: string, defaultValue: unknown) => {
    const map: Record<string, unknown> = {
      'ngdpbase.front-page': 'Welcome',
      'ngdpbase.theme.active': 'default',
      'ngdpbase.application-name': 'ngdpbase',
      'ngdpbase.cache.rendered-pages.enabled': true,
      'ngdpbase.tab.pagetabs': false,
      'ngdpbase.system-category': {
        general:       { label: 'general',       storageLocation: 'regular',  enabled: true },
        system:        { label: 'system',        storageLocation: 'required', enabled: true },
        documentation: { label: 'documentation', storageLocation: 'required', enabled: true },
        developer:     { label: 'developer',     storageLocation: 'github',   enabled: true },
        addon:         { label: 'addon',         storageLocation: 'regular',  enabled: true }
      }
    };
    return key in map ? map[key] : defaultValue;
  }),
  getCustomProperty: vi.fn().mockReturnValue(null),
  getAllProperties: vi.fn().mockReturnValue({}),
  getResolvedDataPath: vi.fn((_k: string, def: string) => def)
};

const mockNotificationManager = {
  getNotifications: vi.fn().mockReturnValue([]),
  getAllNotifications: vi.fn().mockReturnValue([]),
  getStats: vi.fn().mockReturnValue({ total: 0, active: 0, expired: 0, byType: {}, byLevel: {} })
};

const mockMarkupParser = {
  invalidateHandlerCache: vi.fn().mockResolvedValue(undefined)
};

const mockValidationManager = {
  validateContent: vi.fn().mockResolvedValue({ isValid: true }),
  validateMetadata: vi.fn().mockResolvedValue({ isValid: true }),
  generateValidMetadata: vi.fn().mockImplementation((title: string) => ({
    title,
    uuid: 'test-uuid-1',
    'system-category': 'general',
    'user-keywords': [],
    author: 'testuser',
    created: new Date().toISOString(),
    modified: new Date().toISOString()
  }))
};

vi.mock('../../WikiEngine', () => {
  const MockEngine = vi.fn().mockImplementation(function () {
    return {
      getManager: vi.fn((name: string) => {
        const managers: Record<string, unknown> = {
          ConfigurationManager: mockConfigManager,
          PageManager: mockPageManager,
          RenderingManager: mockRenderingManager,
          SearchManager: mockSearchManager,
          ACLManager: mockACLManager,
          CacheManager: mockCacheManager,
          UserManager: mockUserManager,
          NotificationManager: mockNotificationManager,
          FootnoteManager: mockFootnoteManager,
          MarkupParser: mockMarkupParser,
          ValidationManager: mockValidationManager,
          TemplateManager: {
            getTemplates: vi.fn().mockResolvedValue([]),
            applyTemplate: vi.fn().mockResolvedValue('')
          },
          ExportManager: { getExports: vi.fn().mockResolvedValue([]) },
          VariableManager: { expandVariables: vi.fn().mockReturnValue('') },
          BackgroundJobManager: {
            registerJob: vi.fn(),
            enqueue: vi.fn().mockResolvedValue('run-id'),
            getStatus: vi.fn().mockReturnValue(null),
            getActiveJobs: vi.fn().mockReturnValue([])
          },
          SchemaManager: {
            getPerson: vi.fn().mockResolvedValue(null),
            getOrganization: vi.fn().mockResolvedValue(null)
          }
        };
        return managers[name] ?? {};
      }),
      getApplicationName: vi.fn().mockReturnValue('ngdpbase'),
      getCapabilities: vi.fn().mockReturnValue({}),
      config: { features: { maintenance: { enabled: false, allowAdmins: true } } }
    };
  });
  return { default: MockEngine };
});

// ── helpers ───────────────────────────────────────────────────────────────────

const existingPage = {
  content: '# Page',
  metadata: { title: 'TestPage', 'system-category': 'general', uuid: 'test-uuid-1', author: 'testuser' }
};

function resetMocks() {
  // PageManager
  mockPageManager.getPage.mockImplementation((name: string) => {
    // LeftMenu / Footer / left-menu-content return null so sidebar is empty
    if (['LeftMenu', 'Footer', 'left-menu-content'].includes(name)) return Promise.resolve(null);
    return Promise.resolve(existingPage);
  });
  mockPageManager.getPageContent.mockResolvedValue('# Page content');
  mockPageManager.getPageMetadata.mockResolvedValue({ title: 'TestPage', uuid: 'test-uuid-1', 'system-category': 'general' });
  mockPageManager.getAllPages.mockResolvedValue([]);
  mockPageManager.getPageNames.mockResolvedValue(['Welcome', 'TestPage']);
  mockPageManager.getAllPageNames.mockResolvedValue(['Welcome', 'TestPage']);
  mockPageManager.savePage.mockResolvedValue(true);
  mockPageManager.savePageWithContext.mockResolvedValue(true);
  mockPageManager.deletePage.mockResolvedValue(true);
  mockPageManager.deletePageWithContext.mockResolvedValue(true);
  mockPageManager.pageExists.mockReturnValue(true);
  mockPageManager.getCurrentPageProvider.mockReturnValue(null);
  mockPageManager.getPageUUID.mockReturnValue(null);
  mockPageManager.refreshPageList.mockResolvedValue(undefined);

  // ACL
  mockACLManager.checkPagePermission.mockResolvedValue(true);
  mockACLManager.checkPagePermissionWithContext.mockResolvedValue(true);
  mockACLManager.removeACLMarkup.mockImplementation((c: string) => c);
  mockACLManager.parseACL.mockReturnValue({ permissions: [] });

  // Cache
  mockCacheManager.isInitialized.mockReturnValue(true);
  mockCacheManager.get.mockResolvedValue(null);
  mockCacheManager.set.mockResolvedValue(true);
  mockCacheManager.del.mockResolvedValue(true);
  mockCacheManager.clear.mockResolvedValue(true);

  // Rendering
  mockRenderingManager.textToHTML.mockResolvedValue('<p>Rendered HTML</p>');
  mockRenderingManager.getReferringPages.mockReturnValue([]);
  mockRenderingManager.updatePageInLinkGraph.mockImplementation(() => {});
  mockRenderingManager.addPageToCache.mockImplementation(() => {});
  mockRenderingManager.removePageFromLinkGraph.mockImplementation(() => {});
  mockRenderingManager.rebuildLinkGraph.mockResolvedValue(true);

  // Search
  mockSearchManager.search.mockResolvedValue([]);
  mockSearchManager.advancedSearch.mockResolvedValue([]);
  mockSearchManager.advancedSearchWithContext.mockResolvedValue([{ title: 'Result', pageName: 'ResultPage' }]);
  mockSearchManager.searchByCategories.mockResolvedValue([{ title: 'Cat Result', pageName: 'CatPage' }]);
  mockSearchManager.searchByCategory.mockResolvedValue([]);
  mockSearchManager.searchByUserKeywordsList.mockResolvedValue([{ title: 'KW Result', pageName: 'KwPage' }]);
  mockSearchManager.searchByUserKeywords.mockResolvedValue([]);
  mockSearchManager.searchBySystemKeywordsList.mockResolvedValue([{ title: 'SK Result', pageName: 'SkPage' }]);
  mockSearchManager.getAllDocuments.mockResolvedValue([]);
  mockSearchManager.getAllCategories.mockResolvedValue(['general']);
  mockSearchManager.getAllUserKeywords.mockResolvedValue([]);
  mockSearchManager.rebuildIndex.mockResolvedValue(true);
  mockSearchManager.updatePageInIndex.mockResolvedValue(true);
  mockSearchManager.removePageFromIndex.mockResolvedValue(true);
  mockSearchManager.getSuggestions.mockResolvedValue([]);

  // User
  mockUserManager.getCurrentUser.mockResolvedValue({ username: 'testuser', displayName: 'Test User', email: 'test@example.com', isAuthenticated: true, roles: ['authenticated'] });
  mockUserManager.hasPermission.mockResolvedValue(true);
  mockUserManager.getUser.mockResolvedValue({ username: 'testuser', email: 'test@example.com', displayName: 'Test User', preferences: {} });
  mockUserManager.getUsers.mockResolvedValue([]);
  mockUserManager.getRoles.mockResolvedValue([]);
  mockUserManager.getPermissions.mockReturnValue(new Map());
  mockUserManager.getUserPermissions.mockResolvedValue(['read', 'write']);
  mockUserManager.searchUsers.mockResolvedValue([]);
  mockUserManager.createSession.mockResolvedValue('sid');
  mockUserManager.authenticateUser.mockResolvedValue({ username: 'testuser', isAuthenticated: true, roles: ['authenticated'] });
  mockUserManager.destroySession.mockResolvedValue(true);

  // Footnote
  mockFootnoteManager.isEnabled.mockReturnValue(true);
  mockFootnoteManager.getFootnotes.mockResolvedValue([]);
  mockFootnoteManager.addFootnote.mockResolvedValue({ id: 'fn-1', display: 'Note', url: 'http://example.com', note: '' });
  mockFootnoteManager.updateFootnote.mockResolvedValue({ id: 'fn-1', display: 'Updated', url: 'http://example.com', note: '' });
  mockFootnoteManager.deleteFootnote.mockResolvedValue(true);
}

// ── app factory ───────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '../views'));

  // Stub EJS render
  app.use((_req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.render = (_view: string, _data: unknown, cb?: (err: Error | null, str?: string) => void) => {
      if (cb) cb(null, '<html>stub</html>');
      else res.send('<html>stub</html>');
    };
    next();
  });

  // Session + userContext
  app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as Record<string, unknown>).session = {
      csrfToken: 'test-csrf-token',
      user: mockUserContext ? { username: mockUserContext.username } : null,
      destroy: (cb: () => void) => cb?.(),
      save: (cb: () => void) => cb?.()
    };
    (req as unknown as Record<string, unknown>).userContext = mockUserContext;
    (req as unknown as Record<string, unknown>).cookies = {};
    next();
  });

  // CSRF
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    (req as unknown as Record<string, unknown>).csrfToken = () => 'test-csrf-token';
    if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
      const body = req.body as Record<string, string>;
      const token = body?._csrf ?? (req.headers['x-csrf-token'] as string) ?? (req.headers['csrf-token'] as string);
      if (!token || token !== 'test-csrf-token') {
        return res.status(403).json({ error: 'Invalid CSRF token' });
      }
    }
    next();
  });

  return app;
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('WikiRoutes — additional coverage', () => {
  let app: express.Application;
  let wikiRoutes: WikiRoutes;

  beforeEach(async () => {
    mockUserContext = {
      username: 'testuser',
      displayName: 'Test User',
      email: 'test@example.com',
      isAuthenticated: true,
      roles: ['authenticated', 'All']
    };

    resetMocks();
    app = buildApp();

    const { default: WikiEngine } = await import('../../WikiEngine');
    const engine = new WikiEngine();
    wikiRoutes = new WikiRoutes(engine);
    wikiRoutes.registerRoutes(app);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── viewPage ──────────────────────────────────────────────────────────────

  describe('GET /view/:page — viewPage', () => {
    test('serves cached render on cache HIT (skips main-page textToHTML call)', async () => {
      mockCacheManager.get.mockResolvedValue({ html: '<p>cached</p>', tabSectionHtml: '' });
      mockACLManager.checkPagePermissionWithContext.mockResolvedValue(true);

      const res = await request(app).get('/view/TestPage');

      expect(res.status).toBe(200);
      // textToHTML should NOT be called for TestPage content; it may be called for
      // LeftMenu / sidebar content but our mock returns null for those pages.
      expect(mockCacheManager.set).not.toHaveBeenCalled();
    });

    test('returns 403 when ACL view check fails', async () => {
      mockACLManager.checkPagePermissionWithContext.mockResolvedValue(false);

      const res = await request(app).get('/view/TestPage');

      expect(res.status).toBe(403);
    });

    test('returns 404 when page content is not found', async () => {
      mockPageManager.getPageContent.mockRejectedValue(new Error('Page "Missing" not found'));

      const res = await request(app).get('/view/Missing');

      expect(res.status).toBe(404);
    });

    test('renders page on cache MISS and populates cache', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockACLManager.checkPagePermissionWithContext.mockResolvedValue(true);

      const res = await request(app).get('/view/TestPage');

      expect(res.status).toBe(200);
      expect(mockRenderingManager.textToHTML).toHaveBeenCalled();
      expect(mockCacheManager.set).toHaveBeenCalled();
    });
  });

  // ── savePage ──────────────────────────────────────────────────────────────

  describe('POST /save/:page — savePage', () => {
    const csrf = 'test-csrf-token';

    test('returns 400 for title with / in it', async () => {
      const res = await request(app)
        .post('/save/TestPage')
        .send({ title: 'Bad/Title', content: '# hi', 'system-category': 'general', _csrf: csrf });

      expect(res.status).toBe(400);
      expect(res.text).toMatch(/invalid characters/i);
    });

    test('returns 400 for title with < in it', async () => {
      const res = await request(app)
        .post('/save/TestPage')
        .send({ title: 'Bad<Title>', content: '# hi', 'system-category': 'general', _csrf: csrf });

      expect(res.status).toBe(400);
    });

    test('returns 400 when system-category is missing', async () => {
      const res = await request(app)
        .post('/save/TestPage')
        .send({ content: '# hi', _csrf: csrf });

      expect(res.status).toBe(400);
      expect(res.text).toMatch(/system-category is required/i);
    });

    test('returns 400 when system-category is not a recognised value', async () => {
      const res = await request(app)
        .post('/save/TestPage')
        .send({ content: '# hi', 'system-category': 'notacategory', _csrf: csrf });

      expect(res.status).toBe(400);
      expect(res.text).toMatch(/invalid system-category/i);
    });

    test('splices section edit into full page content', async () => {
      mockPageManager.getPage.mockImplementation((name: string) => {
        if (['LeftMenu', 'Footer', 'left-menu-content'].includes(name)) return Promise.resolve(null);
        return Promise.resolve({
          content: '== Section 1 ==\nOriginal text\n\n== Section 2 ==\nOther text',
          metadata: { title: 'TestPage', 'system-category': 'general', uuid: 'test-uuid-1', author: 'testuser' }
        });
      });

      const res = await request(app)
        .post('/save/TestPage')
        .send({ content: 'Updated section text', section: '0', 'system-category': 'general', _csrf: csrf });

      expect([200, 302]).toContain(res.status);
      expect(mockACLManager.removeACLMarkup).toHaveBeenCalled();
    });

    test('saves successfully and redirects', async () => {
      const res = await request(app)
        .post('/save/TestPage')
        .send({ content: '# Content', 'system-category': 'general', _csrf: csrf });

      expect(res.status).toBe(302);
    });
  });

  // ── deletePage ────────────────────────────────────────────────────────────

  describe('POST /delete/:page — deletePage', () => {
    const csrf = 'test-csrf-token';

    test('returns 404 when page does not exist', async () => {
      mockPageManager.getPage.mockResolvedValue(null);

      const res = await request(app)
        .post('/delete/NonExistent')
        .set('Accept', 'application/json')
        .send({ _csrf: csrf });

      expect(res.status).toBe(404);
    });

    test('returns 403 when ACL delete check fails', async () => {
      mockPageManager.getPageMetadata.mockResolvedValue({ title: 'TestPage', 'system-category': 'general' });
      mockACLManager.checkPagePermissionWithContext.mockResolvedValue(false);
      mockUserManager.hasPermission.mockResolvedValue(false);

      const res = await request(app)
        .post('/delete/TestPage')
        .set('Accept', 'application/json')
        .send({ _csrf: csrf });

      expect(res.status).toBe(403);
    });

    test('deletes page and returns JSON success', async () => {
      mockPageManager.getPageMetadata.mockResolvedValue({ title: 'TestPage', 'system-category': 'general' });
      mockACLManager.checkPagePermissionWithContext.mockResolvedValue(true);
      mockPageManager.deletePageWithContext.mockResolvedValue(true);

      const res = await request(app)
        .post('/delete/TestPage')
        .set('Accept', 'application/json')
        .send({ _csrf: csrf });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── getFootnotes ──────────────────────────────────────────────────────────

  describe('GET /api/footnotes/:pageUuid — getFootnotes', () => {
    test('returns 404 when footnotes are disabled', async () => {
      mockFootnoteManager.isEnabled.mockReturnValue(false);

      const res = await request(app).get('/api/footnotes/uuid-123');

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not enabled/i);
    });

    test('returns footnote list on success', async () => {
      mockFootnoteManager.getFootnotes.mockResolvedValue([
        { id: 'fn-1', display: 'Note 1', url: 'http://a.com', note: '' }
      ]);

      const res = await request(app).get('/api/footnotes/uuid-123');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.footnotes).toHaveLength(1);
    });

    test('returns 500 on unexpected error', async () => {
      mockFootnoteManager.getFootnotes.mockRejectedValue(new Error('db error'));

      const res = await request(app).get('/api/footnotes/uuid-123');

      expect(res.status).toBe(500);
    });
  });

  // ── addFootnote ───────────────────────────────────────────────────────────

  describe('POST /api/footnotes/:pageUuid — addFootnote', () => {
    const csrf = 'test-csrf-token';

    test('returns 401 when user is not authenticated', async () => {
      mockUserContext = null;

      const res = await request(app)
        .post('/api/footnotes/uuid-123')
        .send({ display: 'Note', url: 'http://a.com', _csrf: csrf });

      expect(res.status).toBe(401);
    });

    test('returns 403 when user lacks page-edit permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);

      const res = await request(app)
        .post('/api/footnotes/uuid-123')
        .send({ display: 'Note', url: 'http://a.com', _csrf: csrf });

      expect(res.status).toBe(403);
    });

    test('returns 400 when display or url is missing', async () => {
      const res = await request(app)
        .post('/api/footnotes/uuid-123')
        .send({ display: '', url: '', _csrf: csrf });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/display and url are required/i);
    });

    test('returns 404 when footnotes are disabled', async () => {
      mockFootnoteManager.isEnabled.mockReturnValue(false);

      const res = await request(app)
        .post('/api/footnotes/uuid-123')
        .send({ display: 'Note', url: 'http://a.com', _csrf: csrf });

      expect(res.status).toBe(404);
    });

    test('creates footnote and returns it on success', async () => {
      mockFootnoteManager.addFootnote.mockResolvedValue({ id: 'fn-1', display: 'Note', url: 'http://a.com', note: '' });

      const res = await request(app)
        .post('/api/footnotes/uuid-123')
        .send({ display: 'Note', url: 'http://a.com', _csrf: csrf });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.footnote.id).toBe('fn-1');
    });
  });

  // ── updateFootnote ────────────────────────────────────────────────────────

  describe('PUT /api/footnotes/:pageUuid/:footnoteId — updateFootnote', () => {
    const csrf = 'test-csrf-token';

    test('returns 401 when user is not authenticated', async () => {
      mockUserContext = null;

      const res = await request(app)
        .put('/api/footnotes/uuid-123/fn-1')
        .send({ display: 'Note', url: 'http://a.com', _csrf: csrf });

      expect(res.status).toBe(401);
    });

    test('returns 403 when user lacks page-edit permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);

      const res = await request(app)
        .put('/api/footnotes/uuid-123/fn-1')
        .send({ display: 'Note', url: 'http://a.com', _csrf: csrf });

      expect(res.status).toBe(403);
    });

    test('returns 400 when display or url is missing', async () => {
      const res = await request(app)
        .put('/api/footnotes/uuid-123/fn-1')
        .send({ display: '', url: '', _csrf: csrf });

      expect(res.status).toBe(400);
    });

    test('returns 404 when footnote is not found', async () => {
      mockFootnoteManager.updateFootnote.mockResolvedValue(null);

      const res = await request(app)
        .put('/api/footnotes/uuid-123/fn-missing')
        .send({ display: 'Note', url: 'http://a.com', _csrf: csrf });

      expect(res.status).toBe(404);
    });

    test('updates footnote and returns it on success', async () => {
      mockFootnoteManager.updateFootnote.mockResolvedValue({ id: 'fn-1', display: 'Updated', url: 'http://a.com', note: '' });

      const res = await request(app)
        .put('/api/footnotes/uuid-123/fn-1')
        .send({ display: 'Updated', url: 'http://a.com', _csrf: csrf });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.footnote.display).toBe('Updated');
    });
  });

  // ── deleteFootnote ────────────────────────────────────────────────────────

  describe('DELETE /api/footnotes/:pageUuid/:footnoteId — deleteFootnote', () => {
    const csrf = 'test-csrf-token';

    test('returns 401 when user is not authenticated', async () => {
      mockUserContext = null;

      const res = await request(app)
        .delete('/api/footnotes/uuid-123/fn-1')
        .send({ _csrf: csrf });

      expect(res.status).toBe(401);
    });

    test('returns 404 when footnote does not exist', async () => {
      mockFootnoteManager.getFootnotes.mockResolvedValue([]);

      const res = await request(app)
        .delete('/api/footnotes/uuid-123/fn-missing')
        .send({ _csrf: csrf });

      expect(res.status).toBe(404);
    });

    test('returns 403 when non-owner non-admin tries to delete', async () => {
      mockUserContext = { username: 'other', displayName: 'Other', email: 'other@x.com', isAuthenticated: true, roles: ['authenticated'] };
      mockFootnoteManager.getFootnotes.mockResolvedValue([
        { id: 'fn-1', display: 'Note', url: 'http://a.com', note: '', createdBy: 'testuser' }
      ]);

      const res = await request(app)
        .delete('/api/footnotes/uuid-123/fn-1')
        .send({ _csrf: csrf });

      expect(res.status).toBe(403);
    });

    test('allows owner to delete their own footnote', async () => {
      mockFootnoteManager.getFootnotes.mockResolvedValue([
        { id: 'fn-1', display: 'Note', url: 'http://a.com', note: '', createdBy: 'testuser' }
      ]);
      mockFootnoteManager.deleteFootnote.mockResolvedValue(true);

      const res = await request(app)
        .delete('/api/footnotes/uuid-123/fn-1')
        .send({ _csrf: csrf });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('allows admin to delete any footnote', async () => {
      mockUserContext = { username: 'admin', displayName: 'Admin', email: 'admin@x.com', isAuthenticated: true, roles: ['admin', 'authenticated'] };
      mockFootnoteManager.getFootnotes.mockResolvedValue([
        { id: 'fn-1', display: 'Note', url: 'http://a.com', note: '', createdBy: 'someoneelse' }
      ]);
      mockFootnoteManager.deleteFootnote.mockResolvedValue(true);

      const res = await request(app)
        .delete('/api/footnotes/uuid-123/fn-1')
        .send({ _csrf: csrf });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── searchPages ───────────────────────────────────────────────────────────

  describe('GET /search — searchPages', () => {
    // #696 (slice 3 of #693): /search is now a minimal renderer that hands
    // initial state to the asset-picker UI. The picker JS calls
    // /api/assets/search to do the actual querying. So SearchManager is no
    // longer called from this handler — see WikiRoutes.searchPages.test.ts
    // for direct unit coverage of the URL-param → init-state translation.
    test.each(['', '?q=hello', '?q=', '?category=general', '?keywords=foo', '?systemKeywords=bar'])(
      'returns 200 and does not query SearchManager directly for /search%s',
      async (qs) => {
        mockSearchManager.advancedSearchWithContext.mockClear();
        mockSearchManager.getAllDocuments.mockClear();
        mockSearchManager.searchByCategories.mockClear();
        mockSearchManager.searchByUserKeywordsList.mockClear();
        mockSearchManager.searchBySystemKeywordsList.mockClear();

        const res = await request(app).get('/search' + qs);

        expect(res.status).toBe(200);
        expect(mockSearchManager.advancedSearchWithContext).not.toHaveBeenCalled();
        expect(mockSearchManager.getAllDocuments).not.toHaveBeenCalled();
        expect(mockSearchManager.searchByCategories).not.toHaveBeenCalled();
        expect(mockSearchManager.searchByUserKeywordsList).not.toHaveBeenCalled();
        expect(mockSearchManager.searchBySystemKeywordsList).not.toHaveBeenCalled();
      }
    );
  });

  // ── previewPage ───────────────────────────────────────────────────────────

  describe('POST /api/preview — previewPage', () => {
    const csrf = 'test-csrf-token';

    test('returns rendered HTML on success', async () => {
      mockRenderingManager.textToHTML.mockResolvedValue('<p>Preview HTML</p>');

      const res = await request(app)
        .post('/api/preview')
        .send({ content: '# Hello', pageName: 'TestPage', _csrf: csrf });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.html).toBe('<p>Preview HTML</p>');
    });

    test('returns 500 when rendering throws', async () => {
      mockRenderingManager.textToHTML.mockRejectedValue(new Error('parse error'));

      const res = await request(app)
        .post('/api/preview')
        .send({ content: '# Bad', pageName: 'TestPage', _csrf: csrf });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });
});
