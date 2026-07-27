/**
 * WikiRoutes coverage batch 9 — API versioning, cache admin, history/diff:
 *   GET  /api/page-source/:page                  (getPageSource)
 *   GET  /api/page/:id/versions                  (getPageVersions)
 *   GET  /api/page/:id/version/:v                (getPageVersion)
 *   GET  /api/page/:id/compare/:v1/:v2           (comparePageVersions)
 *   POST /api/page/:id/restore/:v               (restorePageVersion)
 *   GET  /api/admin/cache/stats                  (adminCacheStats)
 *   POST /api/admin/cache/clear                  (adminClearCache)
 *   POST /api/admin/cache/clear/page/:id         (adminClearPageCache)
 *   POST /api/admin/cache/clear/:region          (adminClearCacheRegion)
 *   GET  /history/:page                          (pageHistory — happy path)
 *   GET  /diff/:page                             (pageDiff — happy path)
 */
import express from 'express';
import request from 'supertest';
import WikiRoutes from '../WikiRoutes';
import { buildTestApp } from './__fixtures__/buildTestApp';
import { csrfTestHeaders } from '../../middleware/__tests__/__fixtures__/csrfTestHelpers';

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
  preferences?: Record<string, unknown>;
} | null = null;

vi.mock('../../context/WikiContext', async () => {
  const { createMockWikiContext, MOCK_WIKI_CONTEXT_CONSTANTS } = await import('./__fixtures__/createMockWikiContext');
  const MockWikiContext = vi.fn().mockImplementation(function (engine: unknown, options = {}) {
    return createMockWikiContext(options, {
      engine,
      fallbackUserContext: mockUserContext,
      mockUserManager,
      renderMarkdownReturn: '<p>ok</p>',
      toParseOptionsReturn: {}
    });
  });
  (MockWikiContext as unknown as { CONTEXT: typeof MOCK_WIKI_CONTEXT_CONSTANTS }).CONTEXT = MOCK_WIKI_CONTEXT_CONSTANTS;
  return { default: MockWikiContext };
});

vi.mock('../../context/ApiContext', () => ({
  default: {
    from: vi.fn().mockReturnValue({
      requireAuthenticated: vi.fn(),
      requirePermission: vi.fn(),
      hasPermission: vi.fn().mockReturnValue(true)
    })
  },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(msg: string, status = 500) { super(msg); this.status = status; }
  }
}));

// ── mock manager objects ──────────────────────────────────────────────────────

const mockVersionProvider = {
  getVersionHistory: vi.fn(),
  getPageVersion: vi.fn(),
  compareVersions: vi.fn(),
  restoreVersion: vi.fn()
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
  pageExists: vi.fn(),
  getCurrentPageProvider: vi.fn(),
  getPageUUID: vi.fn(),
  deletePageWithContext: vi.fn(),
  provider: null as null | typeof mockVersionProvider
};

const mockCacheManager = {
  isInitialized: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  clear: vi.fn(),
  stats: vi.fn()
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
  updateUser: vi.fn(),
  destroySession: vi.fn(),
  getSession: vi.fn()
};

const mockACLManager = {
  checkPagePermission: vi.fn(),
  checkPagePermissionWithContext: vi.fn(),
  removeACLMarkup: vi.fn(),
  parseACL: vi.fn()
};

const mockRenderingManager = {
  textToHTML: vi.fn(),
  getReferringPages: vi.fn(),
  updatePageInLinkGraph: vi.fn(),
  addPageToCache: vi.fn(),
  removePageFromLinkGraph: vi.fn(),
  renderMarkdown: vi.fn()
};

const mockSearchManager = {
  search: vi.fn(),
  advancedSearch: vi.fn(),
  advancedSearchWithContext: vi.fn(),
  getSuggestions: vi.fn(),
  getAllDocuments: vi.fn(),
  getStats: vi.fn(),
  getAllSystemKeywords: vi.fn(),
  removePageFromIndex: vi.fn(),
  getPageSystemKeywords: vi.fn()
};

const mockConfigManager = {
  getProperty: vi.fn((key: string, defaultValue: unknown) => {
    const map: Record<string, unknown> = {
      'ngdpbase.front-page': 'Welcome',
      'ngdpbase.theme.active': 'default',
      'ngdpbase.application-name': 'ngdpbase',
      'ngdpbase.cache.rendered-pages.enabled': false,
      'ngdpbase.tab.pagetabs': false,
      'ngdpbase.logging.debug.login': false,
      'ngdpbase.page.nofooter': [],
      'ngdpbase.page.notabs': [],
      'ngdpbase.system-category': {
        general: { label: 'general', storageLocation: 'regular', enabled: true }
      },
      'ngdpbase.roles.definitions': {},
      'ngdpbase.maximum.user-keywords': 5,
      'ngdpbase.timezones': []
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
  getStats: vi.fn().mockReturnValue({ total: 0, active: 0, expired: 0, byType: {}, byLevel: {} }),
  dismissNotification: vi.fn(),
  clearAllActive: vi.fn()
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
          FootnoteManager: { isEnabled: vi.fn().mockReturnValue(false) },
          MarkupParser: { invalidateHandlerCache: vi.fn().mockResolvedValue(undefined) },
          ValidationManager: {
            validateContent: vi.fn().mockResolvedValue({ isValid: true }),
            validateMetadata: vi.fn().mockResolvedValue({ isValid: true }),
            generateValidMetadata: vi.fn().mockImplementation((title: string) => ({
              title, uuid: 'test-uuid-1', 'system-category': 'general', 'user-keywords': [],
              author: 'testuser', created: new Date().toISOString(), modified: new Date().toISOString()
            }))
          },
          TemplateManager: { getTemplates: vi.fn().mockResolvedValue([]) },
          VariableManager: { expandVariables: vi.fn().mockReturnValue('') }
        };
        return managers[name] ?? null;
      }),
      getApplicationName: vi.fn().mockReturnValue('ngdpbase'),
      getCapabilities: vi.fn().mockReturnValue({}),
      config: { features: { maintenance: { enabled: false, allowAdmins: true } } }
    };
  });
  return { default: MockEngine };
});

// ── helpers ───────────────────────────────────────────────────────────────────

const existingPageData = {
  content: '# Page content',
  metadata: { title: 'TestPage', 'system-category': 'general', uuid: 'test-uuid-1', 'user-keywords': [], author: 'testuser' },
  filePath: null
};

const adminUser = {
  username: 'adminuser',
  displayName: 'Admin User',
  email: 'admin@example.com',
  isAuthenticated: true,
  roles: ['admin', 'authenticated'],
  preferences: { 'nav.pinnedPages': [] }
};

function resetMocks() {
  mockPageManager.provider = null;
  mockPageManager.getPage.mockImplementation((name: string) => {
    if (['LeftMenu', 'Footer', 'left-menu-content', 'footer-content'].includes(name)) return Promise.resolve(null);
    return Promise.resolve(existingPageData);
  });
  mockPageManager.getPageContent.mockResolvedValue('# Page content');
  mockPageManager.getPageMetadata.mockResolvedValue({ title: 'TestPage', uuid: 'test-uuid-1', 'user-keywords': [] });
  mockPageManager.getAllPages.mockResolvedValue(['Welcome', 'TestPage']);
  mockPageManager.getPageNames.mockResolvedValue(['Welcome', 'TestPage']);
  mockPageManager.getAllPageNames.mockResolvedValue(['Welcome', 'TestPage']);
  mockPageManager.savePage.mockResolvedValue(true);
  mockPageManager.savePageWithContext.mockResolvedValue(true);
  mockPageManager.deletePage.mockResolvedValue(true);
  mockPageManager.pageExists.mockReturnValue(true);
  mockPageManager.getCurrentPageProvider.mockReturnValue(null);
  mockPageManager.getPageUUID.mockReturnValue('test-uuid-1');
  mockPageManager.deletePageWithContext.mockResolvedValue(true);

  mockVersionProvider.getVersionHistory.mockResolvedValue([
    { version: 2, timestamp: '2025-01-01T02:00:00Z', author: 'testuser', comment: 'Edit 2' },
    { version: 1, timestamp: '2025-01-01T01:00:00Z', author: 'testuser', comment: 'Initial' }
  ]);
  mockVersionProvider.getPageVersion.mockResolvedValue({
    content: '# Version content',
    metadata: { title: 'TestPage', uuid: 'test-uuid-1' }
  });
  mockVersionProvider.compareVersions.mockResolvedValue({
    version1: 1, version2: 2,
    diff: [{ type: 'add', value: 'new line' }],
    stats: { additions: 1, deletions: 0 }
  });
  mockVersionProvider.restoreVersion.mockResolvedValue(3);

  mockACLManager.checkPagePermission.mockResolvedValue(true);
  mockACLManager.checkPagePermissionWithContext.mockResolvedValue(true);
  mockACLManager.removeACLMarkup.mockImplementation((c: string) => c);
  mockACLManager.parseACL.mockReturnValue({ permissions: [] });

  mockCacheManager.isInitialized.mockReturnValue(true);
  mockCacheManager.get.mockResolvedValue(null);
  mockCacheManager.set.mockResolvedValue(true);
  mockCacheManager.del.mockResolvedValue(true);
  mockCacheManager.clear.mockResolvedValue(true);
  mockCacheManager.stats.mockResolvedValue({ hits: 10, misses: 5, size: 100, memory: '2MB' });

  mockRenderingManager.textToHTML.mockResolvedValue('<p>Rendered</p>');
  mockRenderingManager.renderMarkdown.mockResolvedValue('<p>Rendered</p>');
  mockRenderingManager.getReferringPages.mockReturnValue([]);
  mockRenderingManager.updatePageInLinkGraph.mockImplementation(() => {});
  mockRenderingManager.addPageToCache.mockImplementation(() => {});
  mockRenderingManager.removePageFromLinkGraph.mockImplementation(() => {});

  mockSearchManager.search.mockResolvedValue([]);
  mockSearchManager.getStats.mockReturnValue({ totalDocs: 0, providerName: 'mock' });
  mockSearchManager.getAllSystemKeywords.mockResolvedValue([]);
  mockSearchManager.getPageSystemKeywords.mockResolvedValue([]);

  mockUserManager.getCurrentUser.mockResolvedValue(adminUser);
  mockUserManager.hasPermission.mockResolvedValue(true);
  mockUserManager.getUser.mockResolvedValue({ username: 'testuser', email: 'test@example.com', displayName: 'Test User', preferences: {} });
  mockUserManager.getUsers.mockResolvedValue([]);
  mockUserManager.getRoles.mockReturnValue(new Map());
  mockUserManager.getPermissions.mockReturnValue(new Map());
  mockUserManager.getUserPermissions.mockReturnValue(['read', 'write']);
  mockUserManager.createSession.mockResolvedValue('sid');
  mockUserManager.authenticateUser.mockResolvedValue({ username: 'testuser', isAuthenticated: true });
  mockUserManager.updateUser.mockResolvedValue(true);
  mockUserManager.destroySession.mockResolvedValue(true);
  mockUserManager.getSession.mockResolvedValue(null);

  mockNotificationManager.getNotifications.mockReturnValue([]);
  mockNotificationManager.getAllNotifications.mockReturnValue([]);
  mockNotificationManager.getStats.mockReturnValue({ total: 0, active: 0, expired: 0, byType: {}, byLevel: {} });
}

// #684 — replaced inline buildApp + parallel CSRF check with the shared
// buildTestApp helper that mounts the real csrfMiddleware. Tests submit the
// matching token via csrfTestHeaders() (or csrfTestBodyField()).

// ── tests ─────────────────────────────────────────────────────────────────────

describe('WikiRoutes — coverage batch 9', () => {
  let app: express.Application;

  beforeEach(async () => {
    mockUserContext = { ...adminUser };
    resetMocks();
    app = buildTestApp({
      withCsrf: true,
      userContext: () => mockUserContext
    });
    const { default: WikiEngine } = await import('../../WikiEngine');
    const engine = new WikiEngine();
    const routes = new WikiRoutes(engine);
    routes.registerRoutes(app);
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockUserContext = null;
  });

  // ── GET /api/page-source/:page (getPageSource) ───────────────────────────────

  describe('GET /api/page-source/:page (getPageSource)', () => {
    test('returns 200 plain text for existing page', async () => {
      const res = await request(app).get('/api/page-source/TestPage');
      expect(res.status).toBe(200);
      expect(res.text).toBeDefined();
    });

    test('returns 404 when page does not exist', async () => {
      mockPageManager.getPage.mockResolvedValue(null);
      const res = await request(app).get('/api/page-source/NonExistent');
      expect(res.status).toBe(404);
    });
  });

  // ── GET /api/page/:id/versions (getPageVersions) ─────────────────────────────

  describe('GET /api/page/:id/versions (getPageVersions)', () => {
    test('returns 501 when provider does not support versioning (null provider)', async () => {
      mockPageManager.provider = null;
      const res = await request(app).get('/api/page/TestPage/versions');
      expect(res.status).toBe(501);
      expect(res.body.error).toBeTruthy();
    });

    test('returns 200 with version list when provider supports versioning', async () => {
      mockPageManager.provider = mockVersionProvider;
      const res = await request(app).get('/api/page/TestPage/versions');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.versions).toHaveLength(2);
    });

    test('returns 404 when provider throws "not found" error', async () => {
      mockPageManager.provider = mockVersionProvider;
      mockVersionProvider.getVersionHistory.mockRejectedValue(new Error('Page not found'));
      const res = await request(app).get('/api/page/MissingPage/versions');
      expect(res.status).toBe(404);
    });
  });

  // ── GET /api/page/:id/version/:v (getPageVersion) ────────────────────────────

  describe('GET /api/page/:id/version/:v (getPageVersion)', () => {
    test('returns 400 for invalid version number (0)', async () => {
      const res = await request(app).get('/api/page/TestPage/version/0');
      expect(res.status).toBe(400);
    });

    test('returns 400 for non-numeric version', async () => {
      const res = await request(app).get('/api/page/TestPage/version/abc');
      expect(res.status).toBe(400);
    });

    test('returns 501 when provider does not support versioning', async () => {
      mockPageManager.provider = null;
      const res = await request(app).get('/api/page/TestPage/version/1');
      expect(res.status).toBe(501);
    });

    test('returns 200 with version content when provider supports versioning', async () => {
      mockPageManager.provider = mockVersionProvider;
      const res = await request(app).get('/api/page/TestPage/version/1');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.content).toBeDefined();
    });
  });

  // ── GET /api/page/:id/compare/:v1/:v2 (comparePageVersions) ─────────────────

  describe('GET /api/page/:id/compare/:v1/:v2 (comparePageVersions)', () => {
    test('returns 400 for invalid version numbers', async () => {
      const res = await request(app).get('/api/page/TestPage/compare/0/abc');
      expect(res.status).toBe(400);
    });

    test('returns 501 when provider does not support comparison', async () => {
      mockPageManager.provider = null;
      const res = await request(app).get('/api/page/TestPage/compare/1/2');
      expect(res.status).toBe(501);
    });

    test('returns 200 with comparison when provider supports it', async () => {
      mockPageManager.provider = mockVersionProvider;
      const res = await request(app).get('/api/page/TestPage/compare/1/2');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── POST /api/page/:id/restore/:v (restorePageVersion) ───────────────────────

  describe('POST /api/page/:id/restore/:v (restorePageVersion)', () => {
    test('returns 400 for invalid version number', async () => {
      const res = await request(app)
        .post('/api/page/TestPage/restore/0')
        .set(csrfTestHeaders());
      expect(res.status).toBe(400);
    });

    test('returns 401 when unauthenticated', async () => {
      mockUserContext = null;
      const res = await request(app)
        .post('/api/page/TestPage/restore/2')
        .set(csrfTestHeaders());
      expect(res.status).toBe(401);
    });

    test('returns 501 when provider does not support restore', async () => {
      mockPageManager.provider = null;
      const res = await request(app)
        .post('/api/page/TestPage/restore/2')
        .set(csrfTestHeaders());
      expect(res.status).toBe(501);
    });

    test('returns 200 with new version on successful restore', async () => {
      mockPageManager.provider = mockVersionProvider;
      const res = await request(app)
        .post('/api/page/TestPage/restore/1')
        .set(csrfTestHeaders())
        .send({ comment: 'Restore to initial version' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.newVersion).toBe(3);
    });
  });

  // ── GET /api/admin/cache/stats (adminCacheStats) ─────────────────────────────

  describe('GET /api/admin/cache/stats (adminCacheStats)', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app).get('/api/admin/cache/stats');
      expect(res.status).toBe(403);
    });

    test('returns 503 when CacheManager not initialized', async () => {
      mockCacheManager.isInitialized.mockReturnValue(false);
      const res = await request(app).get('/api/admin/cache/stats');
      expect(res.status).toBe(503);
    });

    test('returns 200 with stats when CacheManager initialized', async () => {
      const res = await request(app).get('/api/admin/cache/stats');
      expect(res.status).toBe(200);
      expect(res.body.hits).toBeDefined();
    });
  });

  // ── POST /api/admin/cache/clear (adminClearCache) ────────────────────────────

  describe('POST /api/admin/cache/clear (adminClearCache)', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .post('/api/admin/cache/clear')
        .set(csrfTestHeaders());
      expect(res.status).toBe(403);
    });

    test('returns 503 when CacheManager not initialized', async () => {
      mockCacheManager.isInitialized.mockReturnValue(false);
      const res = await request(app)
        .post('/api/admin/cache/clear')
        .set(csrfTestHeaders());
      expect(res.status).toBe(503);
    });

    test('returns 200 success when cache cleared', async () => {
      const res = await request(app)
        .post('/api/admin/cache/clear')
        .set(csrfTestHeaders());
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── POST /api/admin/cache/clear/page/:id (adminClearPageCache) ───────────────

  describe('POST /api/admin/cache/clear/page/:id (adminClearPageCache)', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .post('/api/admin/cache/clear/page/TestPage')
        .set(csrfTestHeaders());
      expect(res.status).toBe(403);
    });

    test('returns 200 success for valid identifier', async () => {
      const res = await request(app)
        .post('/api/admin/cache/clear/page/TestPage')
        .set(csrfTestHeaders());
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── POST /api/admin/cache/clear/:region (adminClearCacheRegion) ──────────────

  describe('POST /api/admin/cache/clear/:region (adminClearCacheRegion)', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .post('/api/admin/cache/clear/rendered-pages')
        .set(csrfTestHeaders());
      expect(res.status).toBe(403);
    });

    test('returns 503 when CacheManager not initialized', async () => {
      mockCacheManager.isInitialized.mockReturnValue(false);
      const res = await request(app)
        .post('/api/admin/cache/clear/rendered-pages')
        .set(csrfTestHeaders());
      expect(res.status).toBe(503);
    });

    test('returns 200 success when region cleared', async () => {
      const res = await request(app)
        .post('/api/admin/cache/clear/rendered-pages')
        .set(csrfTestHeaders());
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── GET /history/:page (pageHistory — happy path) ────────────────────────────

  describe('GET /history/:page (pageHistory — happy path)', () => {
    test('renders page history when provider supports versioning', async () => {
      mockPageManager.provider = mockVersionProvider;
      mockPageManager.pageExists.mockReturnValue(true);
      const res = await request(app).get('/history/TestPage');
      expect(res.status).toBe(200);
    });

    test('returns 404 when page does not exist', async () => {
      mockPageManager.provider = mockVersionProvider;
      mockPageManager.pageExists.mockReturnValue(false);
      const res = await request(app).get('/history/NonExistent');
      expect(res.status).toBe(404);
    });
  });

  // ── GET /diff/:page (pageDiff — happy path) ──────────────────────────────────

  describe('GET /diff/:page (pageDiff — happy path)', () => {
    test('renders diff view when provider supports comparison', async () => {
      mockPageManager.provider = mockVersionProvider;
      mockPageManager.pageExists.mockReturnValue(true);
      const res = await request(app).get('/diff/TestPage?v1=1&v2=2');
      expect(res.status).toBe(200);
    });

    test('returns 404 when page does not exist', async () => {
      mockPageManager.provider = mockVersionProvider;
      mockPageManager.pageExists.mockReturnValue(false);
      const res = await request(app).get('/diff/NonExistent?v1=1&v2=2');
      expect(res.status).toBe(404);
    });
  });

  // ── CSRF middleware wiring (#684) ────────────────────────────────────────────
  // Locks in the coverage gain from migrating off the inline buildApp's
  // parallel CSRF check. If a future change drops `withCsrf: true` from the
  // buildTestApp call (or the production middleware stops rejecting bare
  // POSTs), these assertions break — exactly the regression #684 was filed
  // to catch at the unit-test layer.
  describe('CSRF middleware wiring', () => {
    test('POST without a CSRF token is rejected by the real middleware', async () => {
      mockPageManager.provider = mockVersionProvider;
      const res = await request(app)
        .post('/api/page/TestPage/restore/1')
        .send({ comment: 'no token submitted' });
      expect(res.status).toBe(403);
      expect(res.text).toContain('CSRF');
    });
  });
});
