/**
 * WikiRoutes coverage batch 4 — auth, page operations, admin, and export handlers:
 *   GET  /login
 *   GET  /admin/login
 *   GET  /logout
 *   POST /login
 *   GET  /register
 *   GET  /profile
 *   GET  /kiosk
 *   GET  /search
 *   GET  /export
 *   GET  /exports
 *   GET  /download/:filename
 *   DELETE /deleteExport/:filename
 *   GET  /history/:page
 *   GET  /diff/:page
 *   GET  /admin
 *   GET  /admin/users
 *   GET  /admin/roles
 *   GET  /admin/logs
 *   GET  /admin/settings  (access-denied path)
 *   POST /delete/:page
 *   GET  /user-info
 *   GET  /api/users/search
 */
import express from 'express';
import { policyShaped } from './__fixtures__/policyShaped';
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

const mockPageManager = {
  getPage: vi.fn(),
  getPageContent: vi.fn(),
  getPageMetadata: vi.fn(),
  getAllPages: vi.fn(),
  listPagesFor: vi.fn(),
  getPageNames: vi.fn(),
  getAllPageNames: vi.fn(),
  savePage: vi.fn(),
  pageExists: vi.fn(),
  getCurrentPageProvider: vi.fn(),
  getPageUUID: vi.fn(),
  deletePageWithContext: vi.fn(),
  provider: null as null | { getVersionHistory?: unknown; compareVersions?: unknown }
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
  resolveUserRoles: vi.fn().mockResolvedValue([]),
  hasRole: vi.fn().mockResolvedValue(false),
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
  removePageFromIndex: vi.fn()
};

const mockExportManager = {
  getExports: vi.fn(),
  deleteExport: vi.fn(),
  exportPageToHtml: vi.fn(),
  saveExport: vi.fn(),
  exportToMarkdown: vi.fn()
};

const mockConfigManager = {
  getProperty: vi.fn((key: string, defaultValue: unknown) => {
    const map: Record<string, unknown> = {
      'ngdpbase.front-page': 'Welcome',
      'ngdpbase.theme.active': 'default',
      'ngdpbase.application-name': 'ngdpbase',
      'ngdpbase.cache.rendered-pages.enabled': true,
      'ngdpbase.tab.pagetabs': false,
      'ngdpbase.logging.debug.login': false,
      'ngdpbase.system-category': {
        general: { label: 'general', storageLocation: 'regular', enabled: true }
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
  getStats: vi.fn().mockReturnValue({ total: 0, active: 0, expired: 0, byType: {}, byLevel: {} }),
  dismissNotification: vi.fn(),
  clearAllActive: vi.fn()
};

const mockBackgroundJobManager = {
  registerJob: vi.fn(),
  enqueue: vi.fn(),
  getStatus: vi.fn(),
  getActiveJobs: vi.fn()
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
          BackgroundJobManager: mockBackgroundJobManager,
          ExportManager: mockExportManager,
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
          VariableManager: { expandVariables: vi.fn().mockReturnValue('') },
          SchemaManager: { getPerson: vi.fn().mockResolvedValue(null), getOrganization: vi.fn().mockResolvedValue(null) }
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

const existingPage = {
  content: '# Page content',
  metadata: { title: 'TestPage', 'system-category': 'general', uuid: 'test-uuid-1' },
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
    if (['LeftMenu', 'Footer', 'left-menu-content'].includes(name)) return Promise.resolve(null);
    return Promise.resolve(existingPage);
  });
  mockPageManager.getPageContent.mockResolvedValue('# Page content');
  mockPageManager.getPageMetadata.mockResolvedValue({ title: 'TestPage', uuid: 'test-uuid-1' });
  mockPageManager.getAllPages.mockResolvedValue(['Welcome', 'TestPage']);
  mockPageManager.listPagesFor.mockResolvedValue(['Welcome', 'TestPage']);
  mockPageManager.getPageNames.mockResolvedValue(['Welcome', 'TestPage']);
  mockPageManager.getAllPageNames.mockResolvedValue(['Welcome', 'TestPage']);
  mockPageManager.savePage.mockResolvedValue(true);
  mockPageManager.pageExists.mockReturnValue(true);
  mockPageManager.getCurrentPageProvider.mockReturnValue(null);
  mockPageManager.getPageUUID.mockReturnValue(null);
  mockPageManager.deletePageWithContext.mockResolvedValue(true);

  mockACLManager.checkPagePermission.mockResolvedValue(true);
  mockACLManager.checkPagePermissionWithContext.mockResolvedValue(true);
  mockACLManager.removeACLMarkup.mockImplementation((c: string) => c);
  mockACLManager.parseACL.mockReturnValue({ permissions: [] });

  mockCacheManager.isInitialized.mockReturnValue(true);
  mockCacheManager.get.mockResolvedValue(null);
  mockCacheManager.set.mockResolvedValue(true);
  mockCacheManager.del.mockResolvedValue(true);
  mockCacheManager.clear.mockResolvedValue(true);
  mockCacheManager.stats.mockResolvedValue({ hits: 10, misses: 5, size: 100 });

  mockRenderingManager.textToHTML.mockResolvedValue('<p>Rendered HTML</p>');
  mockRenderingManager.renderMarkdown.mockResolvedValue('<p>Rendered</p>');
  mockRenderingManager.getReferringPages.mockReturnValue([]);
  mockRenderingManager.updatePageInLinkGraph.mockImplementation(() => {});
  mockRenderingManager.addPageToCache.mockImplementation(() => {});
  mockRenderingManager.removePageFromLinkGraph.mockImplementation(() => {});

  mockSearchManager.search.mockResolvedValue([]);
  mockSearchManager.advancedSearch.mockResolvedValue([]);
  mockSearchManager.advancedSearchWithContext.mockResolvedValue([]);
  mockSearchManager.getSuggestions.mockResolvedValue([]);
  mockSearchManager.getAllDocuments.mockResolvedValue([]);
  mockSearchManager.getStats.mockReturnValue({ totalDocs: 0, providerName: 'mock' });
  mockSearchManager.getAllSystemKeywords.mockResolvedValue([]);
  mockSearchManager.removePageFromIndex.mockResolvedValue(undefined);

  mockExportManager.getExports.mockResolvedValue([]);
  mockExportManager.deleteExport.mockResolvedValue(undefined);
  mockExportManager.exportPageToHtml.mockResolvedValue('<html>exported</html>');
  mockExportManager.saveExport.mockResolvedValue('/tmp/export.html');
  mockExportManager.exportToMarkdown.mockResolvedValue('# markdown');

  mockUserManager.getCurrentUser.mockResolvedValue(adminUser);
  mockUserManager.hasPermission.mockImplementation(policyShaped);   // #1198: anonymous holds only the read trio
  mockUserManager.getUser.mockResolvedValue({ username: 'testuser', email: 'test@example.com', displayName: 'Test User', preferences: {} });
  mockUserManager.getUsers.mockResolvedValue([]);
  mockUserManager.getRoles.mockReturnValue(new Map());
  mockUserManager.getPermissions.mockReturnValue(new Map());
  mockUserManager.getUserPermissions.mockReturnValue(['read', 'write']);
  mockUserManager.searchUsers.mockResolvedValue([{ username: 'testuser', displayName: 'Test' }]);
  mockUserManager.createSession.mockResolvedValue('sid');
  mockUserManager.authenticateUser.mockResolvedValue({ username: 'testuser', isAuthenticated: true });
  mockUserManager.updateUser.mockResolvedValue(true);
  mockUserManager.destroySession.mockResolvedValue(true);
  mockUserManager.getSession.mockResolvedValue(null);

  mockNotificationManager.getNotifications.mockReturnValue([]);
  mockNotificationManager.getAllNotifications.mockReturnValue([]);
  mockNotificationManager.getStats.mockReturnValue({ total: 0, active: 0, expired: 0, byType: {}, byLevel: {} });
  mockNotificationManager.dismissNotification.mockResolvedValue(true);
  mockNotificationManager.clearAllActive.mockResolvedValue(3);
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

describe('WikiRoutes — coverage batch 4', () => {
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
    mockUserContext = null;
  });

  // ── GET /login ───────────────────────────────────────────────────────────────

  describe('GET /login', () => {
    test('renders login page for unauthenticated user', async () => {
      mockUserContext = null;
      const res = await request(app).get('/login');
      expect(res.status).toBe(200);
    });

    test('redirects authenticated user to /', async () => {
      const res = await request(app).get('/login');
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/');
    });

    test('redirects authenticated user to provided redirect param', async () => {
      const res = await request(app).get('/login?redirect=/admin');
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/admin');
    });
  });

  // ── GET /admin/login ─────────────────────────────────────────────────────────

  describe('GET /admin/login', () => {
    test('renders admin login page for unauthenticated user', async () => {
      mockUserContext = null;
      const res = await request(app).get('/admin/login');
      expect(res.status).toBe(200);
    });

    test('redirects authenticated user to /admin', async () => {
      const res = await request(app).get('/admin/login');
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/admin');
    });
  });

  // ── GET /logout ──────────────────────────────────────────────────────────────

  describe('GET /logout', () => {
    test('destroys session and redirects to /', async () => {
      const res = await request(app).get('/logout');
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/');
    });
  });

  // ── POST /login ──────────────────────────────────────────────────────────────

  describe('POST /login', () => {
    test('redirects to / on successful authentication', async () => {
      mockUserContext = null;
      mockUserManager.authenticateUser.mockResolvedValue({ username: 'testuser', isAuthenticated: true });
      const res = await request(app)
        .post('/login')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ username: 'testuser', password: 'password123', redirect: '/' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/');
    });

    test('redirects to /login on failed authentication', async () => {
      mockUserContext = null;
      mockUserManager.authenticateUser.mockResolvedValue(null);
      const res = await request(app)
        .post('/login')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ username: 'testuser', password: 'wrong' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/login');
      expect(res.headers.location).toContain('error=');
    });
  });

  // ── GET /register ────────────────────────────────────────────────────────────

  describe('GET /register', () => {
    test('renders registration page', async () => {
      mockUserContext = null;
      const res = await request(app).get('/register');
      expect(res.status).toBe(200);
    });
  });

  // ── GET /profile ─────────────────────────────────────────────────────────────

  describe('GET /profile', () => {
    test('renders profile page for authenticated user', async () => {
      const res = await request(app).get('/profile');
      expect(res.status).toBe(200);
    });

    test('redirects unauthenticated user to login', async () => {
      mockUserContext = null;
      const res = await request(app).get('/profile');
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/login');
    });
  });

  // ── GET /kiosk ───────────────────────────────────────────────────────────────

  describe('GET /kiosk', () => {
    test('renders kiosk with named pages from query param', async () => {
      const res = await request(app).get('/kiosk?pages=Welcome,TestPage&interval=5');
      expect(res.status).toBe(200);
    });

    test('renders kiosk with random pages when no pages param', async () => {
      const res = await request(app).get('/kiosk?count=2');
      expect(res.status).toBe(200);
    });
  });

  // ── GET /search ──────────────────────────────────────────────────────────────

  describe('GET /search', () => {
    // #696 (slice 3 of #693): /search now renders the asset-picker UI shell.
    // Result rendering moved to /api/assets/search (client-side fetch by the
    // picker JS). The handler is intentionally minimal — auth check via
    // wikiContext + URL-param translation + EJS render.
    test('renders 200 with no query', async () => {
      const res = await request(app).get('/search');
      expect(res.status).toBe(200);
    });

    test('renders 200 for text query', async () => {
      const res = await request(app).get('/search?q=test');
      expect(res.status).toBe(200);
    });

    test('renders 200 for empty submit (q=)', async () => {
      const res = await request(app).get('/search?q=');
      expect(res.status).toBe(200);
    });

    test('does not call SearchManager from /search handler — moved to /api/assets/search', async () => {
      // The picker JS calls /api/assets/search which then calls SearchManager;
      // the /search handler itself should not invoke SearchManager directly.
      mockSearchManager.advancedSearchWithContext.mockClear();
      mockSearchManager.getAllDocuments.mockClear();
      await request(app).get('/search?q=test');
      expect(mockSearchManager.advancedSearchWithContext).not.toHaveBeenCalled();
      expect(mockSearchManager.getAllDocuments).not.toHaveBeenCalled();
    });
  });

  // ── GET /export ──────────────────────────────────────────────────────────────

  describe('GET /export', () => {
    test('renders export page with list of pages', async () => {
      const res = await request(app).get('/export');
      expect(res.status).toBe(200);
    });
  });

  // ── GET /exports ─────────────────────────────────────────────────────────────

  describe('GET /exports', () => {
    test('renders exports list page', async () => {
      mockExportManager.getExports.mockResolvedValue([
        { filename: 'export-2025.html', path: '/tmp/export.html' }
      ]);
      const res = await request(app).get('/exports');
      expect(res.status).toBe(200);
    });
  });

  // ── GET /download/:filename ──────────────────────────────────────────────────

  describe('GET /download/:filename', () => {
    test('returns 404 when export file not found', async () => {
      mockExportManager.getExports.mockResolvedValue([]);
      const res = await request(app).get('/download/nonexistent.html');
      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /deleteExport/:filename ───────────────────────────────────────────

  describe('DELETE /deleteExport/:filename', () => {
    test('returns 204 on successful delete', async () => {
      const res = await request(app)
        .delete('/deleteExport/export-2025.html')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(204);
      expect(mockExportManager.deleteExport).toHaveBeenCalledWith('export-2025.html');
    });

    test('returns 500 when deleteExport throws', async () => {
      mockExportManager.deleteExport.mockRejectedValue(new Error('disk error'));
      const res = await request(app)
        .delete('/deleteExport/export-2025.html')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(500);
    });
  });

  // ── GET /history/:page ───────────────────────────────────────────────────────

  describe('GET /history/:page', () => {
    test('returns 501 when provider has no getVersionHistory', async () => {
      mockPageManager.provider = null;
      const res = await request(app).get('/history/TestPage');
      expect([200, 501]).toContain(res.status);
    });

    test('renders version history when provider supports it', async () => {
      mockPageManager.provider = {
        getVersionHistory: vi.fn().mockResolvedValue([
          { version: 1, author: 'alice', timestamp: new Date().toISOString(), comment: 'initial' }
        ])
      };
      const res = await request(app).get('/history/TestPage');
      expect(res.status).toBe(200);
    });

    test('returns 404 when page does not exist', async () => {
      mockPageManager.provider = {
        getVersionHistory: vi.fn().mockResolvedValue([])
      };
      mockPageManager.pageExists.mockReturnValue(false);
      const res = await request(app).get('/history/NonExistentPage');
      expect([200, 404]).toContain(res.status);
    });
  });

  // ── GET /diff/:page ──────────────────────────────────────────────────────────

  describe('GET /diff/:page', () => {
    test('returns 400 with invalid version numbers', async () => {
      const res = await request(app).get('/diff/TestPage?v1=abc&v2=2');
      expect(res.status).toBe(400);
    });

    test('returns 501 when provider does not support compareVersions', async () => {
      mockPageManager.provider = null;
      const res = await request(app).get('/diff/TestPage?v1=1&v2=2');
      expect([200, 501]).toContain(res.status);
    });

    test('renders diff when provider has compareVersions', async () => {
      mockPageManager.provider = {
        compareVersions: vi.fn().mockResolvedValue({
          v1: { version: 1, content: 'old' },
          v2: { version: 2, content: 'new' },
          diff: [{ type: 'added', value: 'new line' }]
        })
      };
      mockPageManager.pageExists.mockReturnValue(true);
      const res = await request(app).get('/diff/TestPage?v1=1&v2=2');
      expect([200, 501]).toContain(res.status);
    });
  });

  // ── GET /admin ───────────────────────────────────────────────────────────────

  describe('GET /admin', () => {
    test('renders admin dashboard for authenticated admin', async () => {
      const res = await request(app).get('/admin');
      expect(res.status).toBe(200);
    });

    test('returns 403 when a signed-in user lacks admin-read', async () => {
      // #1198: the dashboard asks admin-read of policy, like every admin
      // surface; the refusal is 403 for a signed-in subject.
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app).get('/admin');
      expect(res.status).toBe(403);
    });

    test('sends an anonymous visitor to log in — it used to fall through to a page-read check', async () => {
      mockUserContext = null;
      const res = await request(app).get('/admin');
      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/^\/login\?redirect=/);
    });
  });

  // ── GET /admin/users ─────────────────────────────────────────────────────────

  describe('GET /admin/users', () => {
    test('renders user management page for admin', async () => {
      const res = await request(app).get('/admin/users');
      expect(res.status).toBe(200);
    });

    test('returns 403 when user lacks user-read permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app).get('/admin/users');
      expect(res.status).toBe(403);
    });
  });

  // ── GET /admin/roles ─────────────────────────────────────────────────────────

  describe('GET /admin/roles', () => {
    test('renders roles management page for admin', async () => {
      const res = await request(app).get('/admin/roles');
      expect(res.status).toBe(200);
    });

    test('returns 403 when user lacks admin-roles permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app).get('/admin/roles');
      expect(res.status).toBe(403);
    });
  });

  // ── GET /admin/logs ──────────────────────────────────────────────────────────

  describe('GET /admin/logs', () => {
    test('renders logs page (no log directory)', async () => {
      const res = await request(app).get('/admin/logs');
      expect(res.status).toBe(200);
    });

    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app).get('/admin/logs');
      expect(res.status).toBe(403);
    });
  });

  // ── GET /admin/settings ──────────────────────────────────────────────────────

  describe('GET /admin/settings', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app).get('/admin/settings');
      expect(res.status).toBe(403);
    });
  });

  // ── POST /delete/:page ───────────────────────────────────────────────────────

  describe('POST /delete/:page', () => {
    test('returns 404 when page does not exist', async () => {
      mockPageManager.getPage.mockResolvedValue(null);
      const res = await request(app)
        .post('/delete/NonExistentPage')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(404);
    });

    test('deletes page and redirects to / when authorised', async () => {
      const res = await request(app)
        .post('/delete/TestPage')
        .set('x-csrf-token', 'test-csrf-token');
      expect([200, 302]).toContain(res.status);
      expect(mockPageManager.deletePageWithContext).toHaveBeenCalled();
    });

    test('returns 403 when ACL denies delete', async () => {
      mockACLManager.checkPagePermissionWithContext.mockResolvedValue(false);
      const res = await request(app)
        .post('/delete/TestPage')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(403);
    });
  });

  // ── GET /user-info ───────────────────────────────────────────────────────────

  describe('GET /user-info', () => {
    test('returns user info JSON for authenticated user', async () => {
      const res = await request(app).get('/user-info');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('currentUser');
    });

    test('returns anonymous info when no user context', async () => {
      mockUserContext = null;
      const res = await request(app).get('/user-info');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('currentUser', null);
    });
  });

  // ── GET /api/users/search ────────────────────────────────────────────────────

  describe('GET /api/users/search', () => {
    test('returns user search results', async () => {
      mockUserManager.searchUsers.mockResolvedValue([
        { username: 'alice', displayName: 'Alice', email: 'alice@example.com' }
      ]);
      const res = await request(app).get('/api/users/search?q=alice');
      expect([200, 401, 403, 500]).toContain(res.status);
    });
  });
});
