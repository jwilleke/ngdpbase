/**
 * WikiRoutes coverage batch 16 —
 *   getPageSource, browseAttachmentsApi, adminDeleteAttachmentFromBrowser,
 *   apiUsersSearch, adminNotifications, adminCacheStats/Clear/ClearPage/ClearRegion,
 *   checkForUpdates, userKeywordCreate/Submit/Page, adminConsolidateKeywords
 */
import express from 'express';
import request from 'supertest';
import path from 'path';
import WikiRoutes from '../WikiRoutes';

// ── ApiContext behavior flags (must be module-level lets for closure to work) ──
let shouldApiCtxAllowAuth = true;
let shouldApiCtxAllowPerm = true;

vi.mock('../../utils/LocaleUtils', () => {
  const methods = {
    getDateFormatOptions: vi.fn().mockReturnValue(['MM/dd/yyyy']),
    getDateFormatFromLocale: vi.fn().mockReturnValue('MM/dd/yyyy')
  };
  return { default: methods, ...methods };
});

let mockUserContext: {
  username?: string;
  displayName?: string;
  email?: string;
  isAuthenticated: boolean;
  isAdmin?: boolean;
  roles?: string[];
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

vi.mock('../../context/ApiContext', () => {
  class MockApiError extends Error {
    constructor(public readonly status: number, message: string) {
      super(message);
      this.name = 'ApiError';
    }
  }
  return {
    ApiContext: {
      from: vi.fn().mockImplementation(() => ({
        requireAuthenticated: vi.fn().mockImplementation(() => {
          if (!shouldApiCtxAllowAuth) throw new MockApiError(401, 'Authentication required');
        }),
        requirePermission: vi.fn().mockImplementation(() => {
          if (!shouldApiCtxAllowPerm) throw new MockApiError(403, 'Forbidden');
        }),
        hasPermission: vi.fn().mockReturnValue(true)
      }))
    },
    ApiError: MockApiError
  };
});

// ── mock manager objects ──────────────────────────────────────────────────────

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
  provider: null as null | Record<string, unknown>
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
  getSession: vi.fn(),
  createUser: vi.fn()
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
  getSuggestions: vi.fn(),
  getAllDocuments: vi.fn(),
  getStats: vi.fn(),
  getAllSystemKeywords: vi.fn(),
  getPageSystemKeywords: vi.fn(),
  updatePageInIndex: vi.fn(),
  removePageFromIndex: vi.fn()
};

const mockNotificationManager = {
  getNotifications: vi.fn().mockReturnValue([]),
  getAllNotifications: vi.fn().mockReturnValue([]),
  getStats: vi.fn().mockReturnValue({ total: 0, active: 0, expired: 0, byType: {}, byLevel: {} }),
  createNotification: vi.fn().mockResolvedValue(undefined)
};

// FilterChain mock for #615 adminFilterChainStats. The .current pointer is
// mutated per test so each can install its own shape (or null to simulate
// "FilterChain not available").
const mockFilterChain: { current: unknown } = { current: null };

const mockCacheManager = {
  isInitialized: vi.fn().mockReturnValue(false),
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(true),
  del: vi.fn().mockResolvedValue(true),
  clear: vi.fn().mockResolvedValue(true),
  stats: vi.fn().mockResolvedValue({ hits: 0, misses: 0, size: 0 })
};

const mockAttachmentManager = {
  getAllAttachments: vi.fn().mockResolvedValue([]),
  getAttachment: vi.fn().mockResolvedValue(null),
  deleteAttachment: vi.fn().mockResolvedValue(true),
  getAttachmentsByPage: vi.fn().mockResolvedValue([]),
  getAttachmentsForPage: vi.fn().mockResolvedValue([]),
  syncPageMentions: vi.fn().mockResolvedValue(undefined)
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
      'ngdpbase.timezones': [],
      'ngdpbase.user-keywords': null,
      'ngdpbase.version': '1.0.0',
      'ngdpbase.github.repo': 'jwilleke/ngdpbase'
    };
    return key in map ? map[key] : defaultValue;
  }),
  getCustomProperty: vi.fn().mockReturnValue(null),
  getAllProperties: vi.fn().mockReturnValue({}),
  getResolvedDataPath: vi.fn((_k: string, def: string) => def),
  setProperty: vi.fn().mockResolvedValue(undefined)
};

// #896: keyword CRUD now reads/writes via CatalogManager's user-keywords
// provider. Delegate to mockConfigManager so the existing per-test
// getProperty.mockImplementationOnce(...) injections keep working unchanged.
const mockUserKeywordsProvider = {
  getCatalogObject: vi.fn(async () =>
    (mockConfigManager.getProperty('ngdpbase.user-keywords', {}) || {}) as Record<string, Record<string, unknown>>),
  saveCatalogObject: vi.fn(async (catalog: Record<string, Record<string, unknown>>) => {
    await mockConfigManager.setProperty('ngdpbase.user-keywords', catalog);
  })
};
const mockCatalogManager = {
  getUserKeywordsProvider: vi.fn(() => mockUserKeywordsProvider),
  getProviderTerms: vi.fn(async () => null)
};

vi.mock('../../WikiEngine', () => {
  const MockEngine = vi.fn().mockImplementation(function () {
    return {
      getManager: vi.fn((name: string) => {
        const managers: Record<string, unknown> = {
          ConfigurationManager: mockConfigManager,
          CatalogManager: mockCatalogManager,
          PageManager: mockPageManager,
          RenderingManager: mockRenderingManager,
          SearchManager: mockSearchManager,
          ACLManager: mockACLManager,
          CacheManager: mockCacheManager,
          UserManager: mockUserManager,
          NotificationManager: mockNotificationManager,
          AttachmentManager: mockAttachmentManager,
          FootnoteManager: { isEnabled: vi.fn().mockReturnValue(false) },
          MarkupParser: {
            invalidateHandlerCache: vi.fn().mockResolvedValue(undefined),
            // #615 — getFilterChain returns the mock chain when set, null otherwise.
            getFilterChain: vi.fn(() => mockFilterChain.current)
          },
          ValidationManager: {
            validateContent: vi.fn().mockResolvedValue({ isValid: true }),
            validateMetadata: vi.fn().mockResolvedValue({ isValid: true }),
            generateValidMetadata: vi.fn().mockImplementation((title: string) => ({
              title, uuid: 'test-uuid-1', 'system-category': 'general', 'user-keywords': [],
              author: 'testuser', created: new Date().toISOString(), modified: new Date().toISOString()
            })),
            getDefaultSystemCategory: vi.fn().mockReturnValue('general')
          },
          TemplateManager: {
            getTemplates: vi.fn().mockReturnValue([]),
            applyTemplate: vi.fn().mockReturnValue('# Template Content')
          },
          ExportManager: {
            getExports: vi.fn().mockResolvedValue([]),
            deleteExport: vi.fn().mockResolvedValue(undefined)
          }
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

const adminUser = {
  username: 'adminuser',
  displayName: 'Admin User',
  email: 'admin@example.com',
  isAuthenticated: true,
  isAdmin: true,
  roles: ['admin', 'authenticated'],
  preferences: { 'nav.pinnedPages': [] }
};

const editorUser = {
  username: 'editoruser',
  displayName: 'Editor User',
  email: 'editor@example.com',
  isAuthenticated: true,
  isAdmin: false,
  roles: ['editor', 'authenticated'],
  preferences: { 'nav.pinnedPages': [] }
};

const guestUser = {
  username: 'guestuser',
  displayName: 'Guest User',
  email: 'guest@example.com',
  isAuthenticated: true,
  isAdmin: false,
  roles: ['viewer'],
  preferences: {}
};

const existingPageData = {
  content: '# Existing Page',
  metadata: {
    title: 'TestPage',
    uuid: 'uuid-1',
    'system-category': 'general',
    'user-keywords': [],
    author: 'adminuser'
  },
  filePath: '/data/pages/TestPage.md'
};

function resetMocks() {
  shouldApiCtxAllowAuth = true;
  shouldApiCtxAllowPerm = true;

  mockPageManager.provider = null;
  mockPageManager.getPage.mockImplementation((name: string) => {
    if (['LeftMenu', 'Footer', 'left-menu-content', 'footer-content'].includes(name)) return Promise.resolve(null);
    return Promise.resolve({ ...existingPageData });
  });
  mockPageManager.getPageContent.mockResolvedValue('# Page content');
  mockPageManager.getPageMetadata.mockResolvedValue({ title: 'TestPage', uuid: 'test-uuid-1', 'user-keywords': [] });
  mockPageManager.getAllPages.mockResolvedValue([]);
  mockPageManager.getPageNames.mockResolvedValue(['Welcome', 'TestPage']);
  mockPageManager.getAllPageNames.mockResolvedValue(['Welcome', 'TestPage']);
  mockPageManager.savePage.mockResolvedValue(true);
  mockPageManager.savePageWithContext.mockResolvedValue(true);
  mockPageManager.deletePage.mockResolvedValue(true);
  mockPageManager.deletePageWithContext.mockResolvedValue(true);
  mockPageManager.pageExists.mockReturnValue(false);
  mockPageManager.getCurrentPageProvider.mockReturnValue(null);
  mockPageManager.getPageUUID.mockReturnValue(null);

  mockACLManager.checkPagePermission.mockResolvedValue(true);
  mockACLManager.checkPagePermissionWithContext.mockResolvedValue(true);
  mockACLManager.removeACLMarkup.mockImplementation((c: string) => c);
  mockACLManager.parseACL.mockReturnValue({ permissions: [] });

  mockRenderingManager.textToHTML.mockResolvedValue('<p>Rendered</p>');
  mockRenderingManager.getReferringPages.mockReturnValue([]);
  mockRenderingManager.updatePageInLinkGraph.mockImplementation(() => {});
  mockRenderingManager.addPageToCache.mockImplementation(() => {});
  mockRenderingManager.removePageFromLinkGraph.mockImplementation(() => {});

  mockSearchManager.search.mockResolvedValue([]);
  mockSearchManager.getSuggestions.mockResolvedValue([]);
  mockSearchManager.getAllDocuments.mockResolvedValue([]);
  mockSearchManager.getStats.mockReturnValue({ totalDocs: 0, providerName: 'mock' });
  mockSearchManager.getAllSystemKeywords.mockResolvedValue([]);
  mockSearchManager.getPageSystemKeywords.mockResolvedValue([]);
  mockSearchManager.updatePageInIndex.mockResolvedValue(undefined);
  mockSearchManager.removePageFromIndex.mockResolvedValue(undefined);

  mockUserManager.getCurrentUser.mockResolvedValue(adminUser);
  mockUserManager.hasPermission.mockResolvedValue(true);
  mockUserManager.getUser.mockResolvedValue({ username: 'testuser', email: 'test@example.com', displayName: 'Test User', preferences: {} });
  mockUserManager.getUsers.mockResolvedValue([]);
  mockUserManager.getRoles.mockReturnValue(new Map());
  mockUserManager.getPermissions.mockReturnValue(new Map());
  mockUserManager.getUserPermissions.mockReturnValue(['read', 'write']);
  mockUserManager.searchUsers.mockResolvedValue([
    { username: 'alice', displayName: 'Alice', email: 'alice@example.com', roles: ['viewer'] },
    { username: 'bob', displayName: 'Bob', email: 'bob@example.com', roles: ['editor'] }
  ]);
  mockUserManager.createSession.mockResolvedValue('sid');
  mockUserManager.authenticateUser.mockResolvedValue({ username: 'testuser', isAuthenticated: true });
  mockUserManager.updateUser.mockResolvedValue(true);
  mockUserManager.destroySession.mockResolvedValue(true);
  mockUserManager.getSession.mockResolvedValue(null);
  mockUserManager.createUser.mockResolvedValue(true);

  mockNotificationManager.getNotifications.mockReturnValue([]);
  mockNotificationManager.getAllNotifications.mockReturnValue([]);
  mockNotificationManager.getStats.mockReturnValue({ total: 0, active: 0, expired: 0, byType: {}, byLevel: {} });
  mockNotificationManager.createNotification.mockResolvedValue(undefined);

  mockCacheManager.isInitialized.mockReturnValue(false);
  mockCacheManager.stats.mockResolvedValue({ hits: 0, misses: 0, size: 0 });
  mockCacheManager.clear.mockResolvedValue(true);

  mockFilterChain.current = null;

  mockAttachmentManager.getAllAttachments.mockResolvedValue([]);
  mockAttachmentManager.getAttachmentsForPage.mockResolvedValue([]);
  mockAttachmentManager.getAttachmentsByPage.mockResolvedValue([]);
  mockAttachmentManager.deleteAttachment.mockResolvedValue(true);

  mockConfigManager.getProperty.mockImplementation((key: string, defaultValue: unknown) => {
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
      'ngdpbase.timezones': [],
      'ngdpbase.user-keywords': null,
      'ngdpbase.version': '1.0.0',
      'ngdpbase.github.repo': 'jwilleke/ngdpbase'
    };
    return key in map ? map[key] : defaultValue;
  });
  mockConfigManager.setProperty.mockResolvedValue(undefined);
}

function buildApp() {
  const appInstance = express();
  appInstance.use(express.json());
  appInstance.use(express.urlencoded({ extended: true }));
  appInstance.set('view engine', 'ejs');
  appInstance.set('views', path.join(__dirname, '../views'));

  appInstance.use((_req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.render = (_view: string, _data: unknown, cb?: (err: Error | null, str?: string) => void) => {
      if (cb) cb(null, '<html>stub</html>');
      else res.send('<html>stub</html>');
    };
    next();
  });

  appInstance.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const sess: Record<string, unknown> = {
      csrfToken: 'test-csrf-token',
      isAuthenticated: mockUserContext?.isAuthenticated ?? false,
      user: mockUserContext ? { username: mockUserContext.username } : null,
      destroy: (cb: () => void) => cb?.(),
      save: (cb: (err?: unknown) => void) => cb?.()
    };
    (req as unknown as Record<string, unknown>).session = sess;
    (req as unknown as Record<string, unknown>).userContext = mockUserContext;
    (req as unknown as Record<string, unknown>).sessionID = 'test-session-id';
    next();
  });

  appInstance.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    const token = (req.body as Record<string, unknown>)?._csrf ||
      (req.headers as Record<string, unknown>)?.['x-csrf-token'];
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      if (token !== 'test-csrf-token') {
        return res.status(403).json({ error: 'Invalid CSRF token' });
      }
    }
    (req as unknown as Record<string, unknown>).csrfToken = () => 'test-csrf-token';
    next();
  });

  return appInstance;
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('WikiRoutes — coverage batch 16', () => {
  let app: express.Application;

  beforeEach(async () => {
    mockUserContext = { ...adminUser };
    resetMocks();
    app = buildApp();
    const { default: WikiEngine } = await import('../../WikiEngine');
    const engine = new WikiEngine();
    const routes = new WikiRoutes(engine);
    routes.registerRoutes(app);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    mockUserContext = null;
  });

  // ── getPageSource ─────────────────────────────────────────────────────────────

  describe('GET /api/page-source/:page (getPageSource)', () => {
    test('returns 404 when page does not exist', async () => {
      mockPageManager.getPage.mockResolvedValue(null);
      const res = await request(app).get('/api/page-source/NonExistentPage');
      expect(res.status).toBe(404);
    });

    test('returns 200 with raw markdown content', async () => {
      mockPageManager.getPage.mockResolvedValue({ content: '# Hello World\n\nSome content.', metadata: {} });
      const res = await request(app).get('/api/page-source/TestPage');
      expect(res.status).toBe(200);
      expect(res.text).toContain('# Hello World');
    });
  });

  // ── browseAttachmentsApi ──────────────────────────────────────────────────────

  describe('GET /attachments/browse/api (browseAttachmentsApi)', () => {
    test('returns 403 when user has no authorized role', async () => {
      mockUserContext = { ...guestUser };
      const res = await request(app).get('/attachments/browse/api');
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    test('returns 403 when no user context', async () => {
      mockUserContext = null;
      const res = await request(app).get('/attachments/browse/api');
      expect(res.status).toBe(403);
    });

    test('returns 200 with attachments for admin user', async () => {
      mockAttachmentManager.getAllAttachments.mockResolvedValue([
        { id: 'att1', filename: 'image.png', page: 'TestPage' }
      ]);
      const res = await request(app).get('/attachments/browse/api');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.attachments).toHaveLength(1);
    });

    test('returns 200 with attachments for editor user', async () => {
      mockUserContext = { ...editorUser };
      const res = await request(app).get('/attachments/browse/api');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('returns 500 on error', async () => {
      mockAttachmentManager.getAllAttachments.mockRejectedValue(new Error('DB error'));
      const res = await request(app).get('/attachments/browse/api');
      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  // ── adminDeleteAttachmentFromBrowser ──────────────────────────────────────────

  describe('DELETE /admin/attachments/:attachmentId (adminDeleteAttachmentFromBrowser)', () => {
    test('returns 403 when user is not admin', async () => {
      mockUserContext = { ...editorUser };
      const res = await request(app)
        .delete('/admin/attachments/att123')
        .set('x-csrf-token', 'test-csrf-token')
        .send({});
      expect(res.status).toBe(403);
    });

    test('returns 403 when no user context', async () => {
      mockUserContext = null;
      const res = await request(app)
        .delete('/admin/attachments/att123')
        .set('x-csrf-token', 'test-csrf-token')
        .send({});
      expect(res.status).toBe(403);
    });

    test('returns 404 when attachment not found', async () => {
      mockAttachmentManager.deleteAttachment.mockResolvedValue(false);
      const res = await request(app)
        .delete('/admin/attachments/nonexistent')
        .set('x-csrf-token', 'test-csrf-token')
        .send({});
      expect(res.status).toBe(404);
    });

    test('returns 200 when attachment deleted', async () => {
      mockAttachmentManager.deleteAttachment.mockResolvedValue(true);
      const res = await request(app)
        .delete('/admin/attachments/att123')
        .set('x-csrf-token', 'test-csrf-token')
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('returns 500 on deletion error', async () => {
      mockAttachmentManager.deleteAttachment.mockRejectedValue(new Error('Disk error'));
      const res = await request(app)
        .delete('/admin/attachments/att123')
        .set('x-csrf-token', 'test-csrf-token')
        .send({});
      expect(res.status).toBe(500);
    });
  });

  // ── apiUsersSearch ────────────────────────────────────────────────────────────

  describe('GET /api/users/search (apiUsersSearch)', () => {
    test('returns 401 when not authenticated', async () => {
      shouldApiCtxAllowAuth = false;
      const res = await request(app).get('/api/users/search?q=alice');
      expect(res.status).toBe(401);
    });

    test('returns 403 when user lacks search-user permission', async () => {
      shouldApiCtxAllowPerm = false;
      const res = await request(app).get('/api/users/search?q=alice');
      expect(res.status).toBe(403);
    });

    test('returns 200 with search results', async () => {
      const res = await request(app).get('/api/users/search?q=ali');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('results');
      expect(res.body).toHaveProperty('total');
    });

    test('returns 200 with limit and role query params', async () => {
      const res = await request(app).get('/api/users/search?q=&role=editor&limit=10&activeOnly=true');
      expect(res.status).toBe(200);
    });
  });

  // ── adminNotifications ────────────────────────────────────────────────────────

  describe('GET /admin/notifications (adminNotifications)', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app).get('/admin/notifications');
      expect(res.status).toBe(403);
    });

    test('returns 200 with notification data', async () => {
      mockNotificationManager.getAllNotifications.mockReturnValue([
        { id: 'n1', type: 'info', message: 'Test notification', expiresAt: null }
      ]);
      mockNotificationManager.getStats.mockReturnValue({ total: 1, active: 1, expired: 0 });
      const res = await request(app).get('/admin/notifications');
      expect(res.status).toBe(200);
    });

    test('returns 500 on error', async () => {
      mockNotificationManager.getAllNotifications.mockImplementation(() => { throw new Error('Manager error'); });
      const res = await request(app).get('/admin/notifications');
      expect(res.status).toBe(500);
    });
  });

  // ── adminCacheStats ───────────────────────────────────────────────────────────

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

    test('returns 200 with cache stats when initialized', async () => {
      mockCacheManager.isInitialized.mockReturnValue(true);
      mockCacheManager.stats.mockResolvedValue({ hits: 42, misses: 8, size: 1000 });
      const res = await request(app).get('/api/admin/cache/stats');
      expect(res.status).toBe(200);
      expect(res.body.hits).toBe(42);
    });
  });

  // ── adminFilterChainStats (#615) ─────────────────────────────────────────────

  describe('GET /api/admin/filter-chain/stats (adminFilterChainStats)', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app).get('/api/admin/filter-chain/stats');
      expect(res.status).toBe(403);
    });

    test('returns 503 when FilterChain is not available', async () => {
      mockFilterChain.current = null;
      const res = await request(app).get('/api/admin/filter-chain/stats');
      expect(res.status).toBe(503);
    });

    test('returns 200 with chain + filters when available', async () => {
      mockFilterChain.current = {
        getFilters: vi.fn(() => ([
          { filterId: 'ValidationFilter', isEnabled: () => true, priority: 90 },
          { filterId: 'SecurityFilter',   isEnabled: () => false, priority: 110 }
        ])),
        getStats: vi.fn(() => ({
          chain: { executionCount: 7, totalTime: 21, averageTime: 3, errorCount: 0,
            lastExecution: null, filterCount: 2, enabledFilterCount: 1 },
          filters: {
            ValidationFilter: { executionCount: 7, totalTime: 21, averageTime: 3,
              errorCount: 0, lastExecuted: null }
          },
          configuration: { enabled: true, maxFilters: 50, timeout: 10000,
            enableProfiling: true, failOnError: false }
        }))
      };
      const res = await request(app).get('/api/admin/filter-chain/stats');
      expect(res.status).toBe(200);
      expect(res.body.chain.executionCount).toBe(7);
      expect(res.body.configuration.enabled).toBe(true);
      expect(Array.isArray(res.body.filters)).toBe(true);
      expect(res.body.filters).toHaveLength(2);

      // Each filter row carries metadata + runtime stats merged.
      const validation = res.body.filters.find(
        (f: { filterId: string }) => f.filterId === 'ValidationFilter'
      );
      expect(validation.enabled).toBe(true);
      expect(validation.priority).toBe(90);
      expect(validation.executionCount).toBe(7);

      // Filters with no runtime stats (e.g. SecurityFilter never ran) still appear with zeros.
      const security = res.body.filters.find(
        (f: { filterId: string }) => f.filterId === 'SecurityFilter'
      );
      expect(security.enabled).toBe(false);
      expect(security.priority).toBe(110);
      expect(security.executionCount).toBe(0);
    });
  });

  // ── adminClearCache ───────────────────────────────────────────────────────────

  describe('POST /api/admin/cache/clear (adminClearCache)', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .post('/api/admin/cache/clear')
        .set('x-csrf-token', 'test-csrf-token')
        .send({});
      expect(res.status).toBe(403);
    });

    test('returns 503 when CacheManager not initialized', async () => {
      mockCacheManager.isInitialized.mockReturnValue(false);
      const res = await request(app)
        .post('/api/admin/cache/clear')
        .set('x-csrf-token', 'test-csrf-token')
        .send({});
      expect(res.status).toBe(503);
    });

    test('returns 200 on successful cache clear', async () => {
      mockCacheManager.isInitialized.mockReturnValue(true);
      const res = await request(app)
        .post('/api/admin/cache/clear')
        .set('x-csrf-token', 'test-csrf-token')
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── adminClearPageCache ───────────────────────────────────────────────────────

  describe('POST /api/admin/cache/clear/page/:identifier (adminClearPageCache)', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .post('/api/admin/cache/clear/page/TestPage')
        .set('x-csrf-token', 'test-csrf-token')
        .send({});
      expect(res.status).toBe(403);
    });

    test('returns 200 with eviction result (no provider)', async () => {
      mockPageManager.getCurrentPageProvider.mockReturnValue(null);
      const res = await request(app)
        .post('/api/admin/cache/clear/page/TestPage')
        .set('x-csrf-token', 'test-csrf-token')
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.evicted).toBeNull();
    });

    test('returns 200 with eviction result (with provider)', async () => {
      mockPageManager.getCurrentPageProvider.mockReturnValue({
        invalidatePageCache: vi.fn().mockReturnValue(true)
      });
      mockCacheManager.isInitialized.mockReturnValue(false);
      const res = await request(app)
        .post('/api/admin/cache/clear/page/TestPage')
        .set('x-csrf-token', 'test-csrf-token')
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.evicted).toBe(true);
    });
  });

  // ── adminClearCacheRegion ─────────────────────────────────────────────────────

  describe('POST /api/admin/cache/clear/:region (adminClearCacheRegion)', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .post('/api/admin/cache/clear/rendered-pages')
        .set('x-csrf-token', 'test-csrf-token')
        .send({});
      expect(res.status).toBe(403);
    });

    test('returns 503 when CacheManager not initialized', async () => {
      mockCacheManager.isInitialized.mockReturnValue(false);
      const res = await request(app)
        .post('/api/admin/cache/clear/rendered-pages')
        .set('x-csrf-token', 'test-csrf-token')
        .send({});
      expect(res.status).toBe(503);
    });

    test('returns 200 on successful region clear', async () => {
      mockCacheManager.isInitialized.mockReturnValue(true);
      const res = await request(app)
        .post('/api/admin/cache/clear/rendered-pages')
        .set('x-csrf-token', 'test-csrf-token')
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.region).toBe('rendered-pages');
    });
  });

  // ── adminToggleMaintenance ────────────────────────────────────────────────────

  describe('POST /admin/maintenance/toggle (#1147)', () => {
    test('persists the documented key so the state survives a restart', async () => {
      // The defect: the handler mutated engine.config.features.maintenance and
      // never saved, so a restart during maintenance brought the instance back
      // live with nobody told.
      const res = await request(app)
        .post('/admin/maintenance/toggle')
        .set('x-csrf-token', 'test-csrf-token')
        .send({});
      expect(res.status).toBe(302);
      // #1150: the actor travels with the change, so the audit record can say
      // who closed the instance rather than attributing it to the system.
      expect(mockConfigManager.setProperty).toHaveBeenCalledWith(
        'ngdpbase.features.maintenance.enabled',
        true,
        'adminuser'
      );
    });

    test('toggles off again from the persisted value, not from memory', async () => {
      mockConfigManager.getProperty.mockImplementation((key: string, def: unknown) =>
        key === 'ngdpbase.features.maintenance.enabled' ? true : def
      );
      await request(app)
        .post('/admin/maintenance/toggle')
        .set('x-csrf-token', 'test-csrf-token')
        .send({});
      expect(mockConfigManager.setProperty).toHaveBeenCalledWith(
        'ngdpbase.features.maintenance.enabled',
        false,
        'adminuser'
      );
    });

    test('refuses a caller without admin-system', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .post('/admin/maintenance/toggle')
        .set('x-csrf-token', 'test-csrf-token')
        .send({});
      expect(res.status).toBe(403);
      expect(mockConfigManager.setProperty).not.toHaveBeenCalled();
    });
  });

  // ── adminPostureIngredient ────────────────────────────────────────────────────

  describe('POST /admin/configuration/posture (#1159)', () => {
    const postureOf = (call: unknown[]) => call[1] as Record<string, unknown>;

    test('adding writes one entry and leaves the rest alone', async () => {
      mockConfigManager.getProperty.mockImplementation((key: string, def: unknown) =>
        key === 'ngdpbase.security.posture' ? { 'existing.key': { group: 'Audit' } } : def
      );
      const res = await request(app)
        .post('/admin/configuration/posture')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ action: 'add', key: 'ngdpbase.session.secure', group: 'Session' });
      expect(res.status).toBe(302);
      const written = postureOf(mockConfigManager.setProperty.mock.calls[0]);
      expect(written['ngdpbase.session.secure']).toEqual({ group: 'Session', restart: false });
      // The merge is per entry; a map that replaced wholesale would silently
      // drop every other ingredient.
      expect(written['existing.key']).toEqual({ group: 'Audit' });
    });

    test('removing writes an explicit null, not a delete', async () => {
      // The shipped posture lives in app-default-config.json, and a merge
      // cannot express a deletion any other way.
      mockConfigManager.getProperty.mockImplementation((key: string, def: unknown) =>
        key === 'ngdpbase.security.posture' ? { 'ngdpbase.session.secure': { group: 'Session' } } : def
      );
      await request(app)
        .post('/admin/configuration/posture')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ action: 'remove', key: 'ngdpbase.session.secure' });
      expect(postureOf(mockConfigManager.setProperty.mock.calls[0])['ngdpbase.session.secure']).toBeNull();
    });

    test('a secret key is REFUSED, not added and masked', async () => {
      // resolvePosture() masks defensively, but offering to add a secret
      // invites the mistake.
      mockConfigManager.getProperty.mockImplementation((key: string, def: unknown) =>
        key === 'ngdpbase.config.secret-keys' ? ['ngdpbase.session.secret'] : def
      );
      const res = await request(app)
        .post('/admin/configuration/posture')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ action: 'add', key: 'ngdpbase.session.secret' });
      expect(res.headers.location).toMatch(/error=/);
      expect(mockConfigManager.setProperty).not.toHaveBeenCalled();
    });

    test('an unknown key is added with a warning rather than refused', async () => {
      // A typo should be visible at once, but an addon may legitimately
      // contribute a key this instance does not ship.
      const res = await request(app)
        .post('/admin/configuration/posture')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ action: 'add', key: 'ngdpbase.not.a.real.key' });
      expect(mockConfigManager.setProperty).toHaveBeenCalled();
      expect(decodeURIComponent(res.headers.location)).toMatch(/check the spelling/i);
    });

    test('an empty key changes nothing', async () => {
      const res = await request(app)
        .post('/admin/configuration/posture')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ action: 'add', key: '   ' });
      expect(mockConfigManager.setProperty).not.toHaveBeenCalled();
      expect(res.headers.location).toMatch(/error=/);
    });

    test('admin-read is refused — this needs admin-system (D18)', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .post('/admin/configuration/posture')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ action: 'add', key: 'ngdpbase.session.secure' });
      expect(res.status).toBe(403);
      expect(mockConfigManager.setProperty).not.toHaveBeenCalled();
    });

    test('the change carries the actor, so the audit record names who did it', async () => {
      await request(app)
        .post('/admin/configuration/posture')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ action: 'add', key: 'ngdpbase.session.secure' });
      expect(mockConfigManager.setProperty.mock.calls[0][2]).toBe('adminuser');
    });
  });

  // ── checkForUpdates ───────────────────────────────────────────────────────────

  describe('GET /api/check-updates (checkForUpdates)', () => {
    test('returns 200 with current version when fetch fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
      const res = await request(app).get('/api/check-updates');
      expect(res.status).toBe(200);
      expect(res.body.currentVersion).toBe('1.0.0');
      expect(res.body.latestVersion).toBeNull();
      expect(res.body.updateAvailable).toBe(false);
    });

    test('returns 200 with update available when newer version found', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ tag_name: 'v2.0.0', html_url: 'https://github.com/example/releases/v2.0.0' })
      }));
      const res = await request(app).get('/api/check-updates');
      expect(res.status).toBe(200);
      expect(res.body.currentVersion).toBe('1.0.0');
      expect(res.body.latestVersion).toBe('2.0.0');
      expect(res.body.updateAvailable).toBe(true);
    });

    test('returns 200 with no update when already at latest', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ tag_name: 'v1.0.0', html_url: 'https://github.com/example/releases/v1.0.0' })
      }));
      const res = await request(app).get('/api/check-updates');
      expect(res.status).toBe(200);
      expect(res.body.updateAvailable).toBe(false);
    });

    test('returns 200 when fetch returns non-ok response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
      const res = await request(app).get('/api/check-updates');
      expect(res.status).toBe(200);
      expect(res.body.latestVersion).toBeNull();
    });

    // #1140 — the route was reachable anonymously and its fetch had no deadline.
    test('refuses an anonymous caller without making an outbound request', async () => {
      mockUserContext = null;
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);
      const res = await request(app).get('/api/check-updates');
      expect(res.status).toBe(403);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    test('refuses a signed-in caller holding neither admin-read nor admin-system', async () => {
      mockUserContext = { ...editorUser };
      mockUserManager.hasPermission.mockResolvedValue(false);
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);
      const res = await request(app).get('/api/check-updates');
      expect(res.status).toBe(403);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    test('gives the fetch a deadline read from ngdpbase.fetch-timeout-ms', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ tag_name: 'v1.0.0', html_url: 'https://example.test/r' })
      });
      vi.stubGlobal('fetch', fetchSpy);
      const res = await request(app).get('/api/check-updates');
      expect(res.status).toBe(200);
      expect(mockConfigManager.getProperty).toHaveBeenCalledWith('ngdpbase.fetch-timeout-ms', 30000);
      const opts = fetchSpy.mock.calls[0]?.[1] as { signal?: unknown };
      expect(opts?.signal).toBeInstanceOf(AbortSignal);
    });

    test('an aborted fetch degrades to the current version rather than 500', async () => {
      const abort = new DOMException('The operation was aborted.', 'TimeoutError');
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort));
      const res = await request(app).get('/api/check-updates');
      expect(res.status).toBe(200);
      expect(res.body.currentVersion).toBe('1.0.0');
      expect(res.body.latestVersion).toBeNull();
    });
  });

  // ── userKeywordCreate ─────────────────────────────────────────────────────────

  describe('GET /user-keywords/create (userKeywordCreate)', () => {
    test('returns 403 when user lacks page-edit permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app).get('/user-keywords/create');
      expect(res.status).toBe(403);
    });

    test('returns 200 for editor user', async () => {
      mockUserContext = { ...editorUser };
      const res = await request(app).get('/user-keywords/create');
      expect(res.status).toBe(200);
    });
  });

  // ── userKeywordCreateSubmit ───────────────────────────────────────────────────

  describe('POST /user-keywords/create (userKeywordCreateSubmit)', () => {
    test('returns 403 when user lacks page-edit permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .post('/user-keywords/create')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ label: 'New Topic', description: 'A new topic' });
      expect(res.status).toBe(403);
    });

    test('redirects with error when label is missing', async () => {
      const res = await request(app)
        .post('/user-keywords/create')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ description: 'Some description' });
      expect(res.status).toBe(302);
      expect(decodeURIComponent(res.headers.location)).toContain('Label is required');
    });

    test('redirects with error when description is missing', async () => {
      const res = await request(app)
        .post('/user-keywords/create')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ label: 'New Topic' });
      expect(res.status).toBe(302);
      expect(decodeURIComponent(res.headers.location)).toContain('Description is required');
    });

    test('redirects with error when keyword already exists', async () => {
      mockConfigManager.getProperty.mockImplementationOnce(() => ({
        'new-topic': { label: 'New Topic', description: 'Existing', enabled: true }
      }));
      const res = await request(app)
        .post('/user-keywords/create')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ label: 'New Topic', description: 'A description' });
      expect(res.status).toBe(302);
      expect(decodeURIComponent(res.headers.location)).toContain('already exists');
    });

    test('redirects to edit page on success when no existing page', async () => {
      mockPageManager.pageExists.mockReturnValue(false);
      const res = await request(app)
        .post('/user-keywords/create')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ label: 'New Topic', description: 'A new topic about things' });
      expect(res.status).toBe(302);
      expect(decodeURIComponent(res.headers.location)).toContain('New Topic');
      expect(decodeURIComponent(res.headers.location)).toContain('created');
    });

    test('redirects to edit page on success when page already exists', async () => {
      mockPageManager.pageExists.mockReturnValue(true);
      const res = await request(app)
        .post('/user-keywords/create')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ label: 'Existing Topic', description: 'A description' });
      expect(res.status).toBe(302);
      expect(mockPageManager.savePage).not.toHaveBeenCalled();
    });
  });

  // ── userKeywordCreatePage ─────────────────────────────────────────────────────

  describe('POST /user-keywords/create-page/:keywordId (userKeywordCreatePage)', () => {
    test('returns 403 when user lacks page-edit permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .post('/user-keywords/create-page/some-keyword')
        .set('x-csrf-token', 'test-csrf-token')
        .send({});
      expect(res.status).toBe(403);
    });

    test('redirects with error when keyword config not found', async () => {
      // ngdpbase.user-keywords returns null → {} → no keywordId key
      const res = await request(app)
        .post('/user-keywords/create-page/nonexistent-kw')
        .set('x-csrf-token', 'test-csrf-token')
        .send({});
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('User');
    });

    test('redirects to existing page when page already exists', async () => {
      mockConfigManager.getProperty.mockImplementationOnce(() => ({
        'my-keyword': { label: 'My Keyword', description: 'A keyword page', enabled: true }
      }));
      mockPageManager.pageExists.mockReturnValue(true);
      const res = await request(app)
        .post('/user-keywords/create-page/my-keyword')
        .set('x-csrf-token', 'test-csrf-token')
        .send({});
      expect(res.status).toBe(302);
      expect(decodeURIComponent(res.headers.location)).toContain('My Keyword');
      expect(mockPageManager.savePage).not.toHaveBeenCalled();
    });

    test('creates page and redirects to edit on success', async () => {
      mockConfigManager.getProperty.mockImplementationOnce(() => ({
        'my-keyword': { label: 'My Keyword', description: 'A keyword page', enabled: true }
      }));
      mockPageManager.pageExists.mockReturnValue(false);
      const res = await request(app)
        .post('/user-keywords/create-page/my-keyword')
        .set('x-csrf-token', 'test-csrf-token')
        .send({});
      expect(res.status).toBe(302);
      expect(mockPageManager.savePage).toHaveBeenCalled();
      expect(decodeURIComponent(res.headers.location)).toContain('My Keyword');
    });
  });

  // ── adminConsolidateKeywords ──────────────────────────────────────────────────

  describe('POST /admin/keywords/consolidate (adminConsolidateKeywords)', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .post('/admin/keywords/consolidate')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ sourceId: 'src', targetId: 'tgt' });
      expect(res.status).toBe(403);
    });

    test('returns 400 when sourceId or targetId missing', async () => {
      const res = await request(app)
        .post('/admin/keywords/consolidate')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ sourceId: 'src' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('required');
    });

    test('returns 400 when sourceId equals targetId', async () => {
      const res = await request(app)
        .post('/admin/keywords/consolidate')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ sourceId: 'same', targetId: 'same' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('different');
    });

    test('returns 404 when source keyword not found', async () => {
      mockConfigManager.getProperty.mockImplementationOnce(() => ({
        'target-kw': { label: 'Target', description: 'Target keyword', enabled: true }
      }));
      const res = await request(app)
        .post('/admin/keywords/consolidate')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ sourceId: 'source-kw', targetId: 'target-kw' });
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Source');
    });

    test('returns 404 when target keyword not found', async () => {
      mockConfigManager.getProperty.mockImplementationOnce(() => ({
        'source-kw': { label: 'Source', description: 'Source keyword', enabled: true }
      }));
      const res = await request(app)
        .post('/admin/keywords/consolidate')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ sourceId: 'source-kw', targetId: 'target-kw' });
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Target');
    });

    test('returns 200 on successful consolidation (no pages to update)', async () => {
      mockConfigManager.getProperty.mockImplementationOnce(() => ({
        'source-kw': { label: 'Source', description: 'Source keyword', enabled: true },
        'target-kw': { label: 'Target', description: 'Target keyword', enabled: true }
      }));
      mockPageManager.getAllPages.mockResolvedValue([]);
      const res = await request(app)
        .post('/admin/keywords/consolidate')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ sourceId: 'source-kw', targetId: 'target-kw', deleteSource: false });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.pagesUpdated).toBe(0);
    });

    test('returns 200 and updates pages with matching keyword', async () => {
      mockConfigManager.getProperty.mockImplementationOnce(() => ({
        'source-kw': { label: 'Source', description: 'Source keyword', enabled: true },
        'target-kw': { label: 'Target', description: 'Target keyword', enabled: true }
      }));
      mockPageManager.getAllPages.mockResolvedValue(['PageWithKeyword']);
      mockPageManager.getPage.mockResolvedValueOnce({
        content: '# Page',
        metadata: { 'user-keywords': ['source-kw', 'other-kw'] }
      });
      const res = await request(app)
        .post('/admin/keywords/consolidate')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ sourceId: 'source-kw', targetId: 'target-kw', deleteSource: true });
      expect(res.status).toBe(200);
      expect(res.body.pagesUpdated).toBe(1);
      expect(res.body.sourceDeleted).toBe(true);
      expect(mockPageManager.savePage).toHaveBeenCalled();
    });
  });
});
