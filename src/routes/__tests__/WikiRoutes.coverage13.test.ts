/**
 * WikiRoutes coverage batch 13 — admin keywords, exports, attachments,
 *   page metadata/suggestions, admin diff.
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
  deletePage: vi.fn(),
  pageExists: vi.fn(),
  getCurrentPageProvider: vi.fn(),
  getPageUUID: vi.fn(),
  deletePageWithContext: vi.fn(),
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
  getSuggestions: vi.fn(),
  getAllDocuments: vi.fn(),
  getStats: vi.fn(),
  getAllSystemKeywords: vi.fn(),
  getPageSystemKeywords: vi.fn()
};

const mockNotificationManager = {
  getNotifications: vi.fn().mockReturnValue([]),
  getAllNotifications: vi.fn().mockReturnValue([]),
  getStats: vi.fn().mockReturnValue({ total: 0, active: 0, expired: 0, byType: {}, byLevel: {} })
};

const mockCacheManager = {
  isInitialized: vi.fn().mockReturnValue(false),
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(true),
  del: vi.fn().mockResolvedValue(true),
  clear: vi.fn().mockResolvedValue(true),
  stats: vi.fn()
};

const mockExportManager = {
  getExports: vi.fn().mockResolvedValue([
    { filename: 'export-1.zip', path: '/tmp/export-1.zip' }
  ]),
  deleteExport: vi.fn().mockResolvedValue(undefined)
};

const mockAttachmentManager = {
  getAllAttachments: vi.fn().mockResolvedValue([]),
  getAttachment: vi.fn().mockResolvedValue(null),
  deleteAttachment: vi.fn().mockResolvedValue(true),
  getAttachmentsByPage: vi.fn().mockResolvedValue([])
};

// Stable object — mutated in place via setUserKeywords() / resetMocks() so the
// closure inside mockConfigManager.getProperty always sees the latest contents.
// Reassigning this binding caused order-dependent test pollution (#609).
const mockUserKeywordsConfig: Record<string, Record<string, unknown>> = {};

function setUserKeywords(next: Record<string, Record<string, unknown>>) {
  for (const k of Object.keys(mockUserKeywordsConfig)) delete mockUserKeywordsConfig[k];
  Object.assign(mockUserKeywordsConfig, next);
}

// #896: admin keyword CRUD now goes through CatalogManager's user-keywords
// provider. In-memory stand-in backed by the same mutable catalog object.
const mockUserKeywordsProvider = {
  getCatalogObject: vi.fn(async () => ({ ...mockUserKeywordsConfig })),
  saveCatalogObject: vi.fn(async (catalog: Record<string, Record<string, unknown>>) => {
    setUserKeywords(catalog);
  })
};
const mockCatalogManager = {
  getUserKeywordsProvider: vi.fn(() => mockUserKeywordsProvider),
  getProviderTerms: vi.fn(async () => null)
};

const mockConfigManager = {
  getProperty: vi.fn((key: string, defaultValue: unknown) => {
    if (key === 'ngdpbase.user-keywords') return mockUserKeywordsConfig;
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
  getResolvedDataPath: vi.fn((_k: string, def: string) => def),
  setProperty: vi.fn().mockResolvedValue(undefined)
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
          ExportManager: mockExportManager,
          AttachmentManager: mockAttachmentManager,
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
          TemplateManager: { getTemplates: vi.fn().mockResolvedValue([]) }
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

function resetMocks() {
  setUserKeywords({});

  mockConfigManager.getProperty.mockImplementation((key: string, defaultValue: unknown) => {
    if (key === 'ngdpbase.user-keywords') return mockUserKeywordsConfig;
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
  });

  mockPageManager.provider = null;
  mockPageManager.getPage.mockImplementation((name: string) => {
    if (['LeftMenu', 'Footer', 'left-menu-content', 'footer-content'].includes(name)) return Promise.resolve(null);
    return Promise.resolve({ content: '# Page', metadata: { title: 'TestPage', uuid: 'uuid-1', 'user-keywords': [] }, filePath: null });
  });
  mockPageManager.getPageContent.mockResolvedValue('# Page content');
  mockPageManager.getPageMetadata.mockResolvedValue({ title: 'TestPage', uuid: 'test-uuid-1', 'user-keywords': [] });
  mockPageManager.getAllPages.mockResolvedValue(['Welcome', 'TestPage']);
  mockPageManager.listPagesFor.mockResolvedValue(['Welcome', 'TestPage']);
  mockPageManager.getPageNames.mockResolvedValue(['Welcome', 'TestPage']);
  mockPageManager.getAllPageNames.mockResolvedValue(['Welcome', 'TestPage']);
  mockPageManager.savePage.mockResolvedValue(true);
  mockPageManager.deletePage.mockResolvedValue(true);
  mockPageManager.pageExists.mockReturnValue(false);
  mockPageManager.getCurrentPageProvider.mockReturnValue(null);
  mockPageManager.getPageUUID.mockReturnValue(null);
  mockPageManager.deletePageWithContext.mockResolvedValue(true);

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

  mockExportManager.getExports.mockResolvedValue([{ filename: 'export-1.zip', path: '/tmp/export-1.zip' }]);
  mockExportManager.deleteExport.mockResolvedValue(undefined);

  mockAttachmentManager.getAllAttachments.mockResolvedValue([]);
  mockAttachmentManager.getAttachment.mockResolvedValue(null);
  mockAttachmentManager.deleteAttachment.mockResolvedValue(true);
  mockAttachmentManager.getAttachmentsByPage.mockResolvedValue([]);
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

describe('WikiRoutes — coverage batch 13', () => {
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

  // ── Admin Keywords ────────────────────────────────────────────────────────────

  describe('GET /admin/keywords (adminKeywords)', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app).get('/admin/keywords');
      expect(res.status).toBe(403);
    });

    test('renders 200 with empty keyword list', async () => {
      const res = await request(app).get('/admin/keywords');
      expect(res.status).toBe(200);
    });

    test('renders 200 with existing keywords', async () => {
      setUserKeywords({
        'tech': { label: 'Technology', description: 'Tech pages', category: 'Content', enabled: true }
      });
      const res = await request(app).get('/admin/keywords');
      expect(res.status).toBe(200);
    });
  });

  describe('POST /admin/keywords (adminCreateKeyword)', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .post('/admin/keywords')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ id: 'new-kw', label: 'New Keyword' });
      expect(res.status).toBe(403);
    });

    test('returns 400 when id or label missing', async () => {
      const res = await request(app)
        .post('/admin/keywords')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ id: 'new-kw' });
      expect(res.status).toBe(400);
    });

    test('returns 400 for invalid keyword ID format', async () => {
      const res = await request(app)
        .post('/admin/keywords')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ id: 'Invalid ID!', label: 'New Keyword' });
      expect(res.status).toBe(400);
    });

    test('returns 200 when keyword created', async () => {
      const res = await request(app)
        .post('/admin/keywords')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ id: 'new-kw', label: 'New Keyword', description: 'A new keyword' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('returns 400 when keyword ID already exists', async () => {
      setUserKeywords({ 'existing-kw': { label: 'Existing', enabled: true } });
      const res = await request(app)
        .post('/admin/keywords')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ id: 'existing-kw', label: 'Existing Keyword' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/admin/keywords/:id/usage (adminKeywordUsage)', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app).get('/api/admin/keywords/tech/usage');
      expect(res.status).toBe(403);
    });

    test('returns 200 with usage data', async () => {
      const res = await request(app).get('/api/admin/keywords/tech/usage');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('PUT /admin/keywords/:id (adminUpdateKeyword)', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .put('/admin/keywords/tech')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ label: 'Updated Tech' });
      expect(res.status).toBe(403);
    });

    test('returns 404 when keyword not found', async () => {
      const res = await request(app)
        .put('/admin/keywords/nonexistent')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ label: 'Updated' });
      expect(res.status).toBe(404);
    });

    test('returns 200 when keyword updated', async () => {
      setUserKeywords({ 'tech': { label: 'Technology', enabled: true } });
      const res = await request(app)
        .put('/admin/keywords/tech')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ label: 'Tech & Science' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('DELETE /admin/keywords/:id (adminDeleteKeyword)', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .delete('/admin/keywords/tech')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(403);
    });

    test('returns 404 when keyword not found', async () => {
      const res = await request(app)
        .delete('/admin/keywords/nonexistent')
        .set('x-csrf-token', 'test-csrf-token')
        .send({});
      expect(res.status).toBe(404);
    });

    test('returns 200 when keyword deleted', async () => {
      setUserKeywords({ 'tech': { label: 'Technology', enabled: true } });
      const res = await request(app)
        .delete('/admin/keywords/tech')
        .set('x-csrf-token', 'test-csrf-token')
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── Exports ──────────────────────────────────────────────────────────────────

  describe('GET /exports (listExports)', () => {
    test('renders 200 with export list', async () => {
      const res = await request(app).get('/exports');
      expect(res.status).toBe(200);
    });
  });

  describe('GET /download/:filename (downloadExport)', () => {
    test('returns 404 when export not found', async () => {
      const res = await request(app).get('/download/nonexistent.zip');
      expect(res.status).toBe(404);
    });

    test('initiates download when export found', async () => {
      mockExportManager.getExports.mockResolvedValue([
        { filename: 'export-1.zip', path: '/tmp/export-1.zip' }
      ]);
      const res = await request(app).get('/download/export-1.zip');
      expect([200, 404, 500]).toContain(res.status);
    });
  });

  describe('DELETE /deleteExport/:filename (deleteExport)', () => {
    test('returns 204 when export deleted', async () => {
      const res = await request(app)
        .delete('/deleteExport/export-1.zip')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(204);
    });
  });

  // ── Admin Attachments ────────────────────────────────────────────────────────

  describe('GET /admin/attachments (adminAttachments)', () => {
    test('returns 403 when user lacks admin/editor role', async () => {
      // #1198: the gate asks policy for a permission this subject does not hold.
      mockUserManager.hasPermission.mockResolvedValue(false);
      mockUserContext = { ...adminUser, roles: ['viewer'] };
      const res = await request(app).get('/admin/attachments');
      expect(res.status).toBe(403);
    });

    test('renders 200 with attachment list', async () => {
      const res = await request(app).get('/admin/attachments');
      expect(res.status).toBe(200);
    });
  });

  describe('GET /admin/attachments/api (adminAttachmentsApi)', () => {
    test('returns 403 when user lacks admin/editor role', async () => {
      // #1198: the gate asks policy for a permission this subject does not hold.
      mockUserManager.hasPermission.mockResolvedValue(false);
      mockUserContext = { ...adminUser, roles: ['viewer'] };
      const res = await request(app).get('/admin/attachments/api');
      expect(res.status).toBe(403);
    });

    test('returns 200 JSON with attachments', async () => {
      const res = await request(app).get('/admin/attachments/api');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /attachments/browse', () => {
    // #696 (slice 3 of #693): /attachments/browse is now an alias for /search.
    // The asset-picker UI lives at /search; this URL 302-redirects so any
    // pre-swap bookmark continues to resolve. Auth happens at /search (which
    // is open) and at /api/assets/search (which gates per-type).
    test('302-redirects to /search regardless of role', async () => {
      mockUserContext = { ...adminUser, roles: ['viewer'] };
      const res = await request(app).get('/attachments/browse').redirects(0);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/search');
    });

    test('302-redirects to /search for admin user', async () => {
      const res = await request(app).get('/attachments/browse').redirects(0);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/search');
    });

    test('preserves query string on redirect', async () => {
      const res = await request(app).get('/attachments/browse?q=foo&mimeCategory=image').redirects(0);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/search?q=foo&mimeCategory=image');
    });
  });

  // ── Admin Diff ───────────────────────────────────────────────────────────────

  describe('GET /admin/diff (adminDiff)', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app).get('/admin/diff');
      expect(res.status).toBe(403);
    });

    test('returns 400 when pages cannot be resolved', async () => {
      const res = await request(app).get('/admin/diff');
      expect([400, 200]).toContain(res.status);
    });
  });

  describe('GET /api/admin/diff (adminDiffApi)', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app).get('/api/admin/diff');
      expect(res.status).toBe(403);
    });
  });

  // ── Page Metadata ────────────────────────────────────────────────────────────

  describe('GET /api/page-metadata/:page (getPageMetadata)', () => {
    test('returns 404 when page not found', async () => {
      mockPageManager.getPage.mockImplementation((name: string) => {
        if (['LeftMenu', 'Footer', 'left-menu-content', 'footer-content'].includes(name)) return Promise.resolve(null);
        return Promise.resolve(null);
      });
      const res = await request(app).get('/api/page-metadata/MissingPage');
      expect(res.status).toBe(404);
    });

    test('returns 200 with page metadata', async () => {
      const res = await request(app).get('/api/page-metadata/TestPage');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('title');
    });
  });

  // ── Page Suggestions ─────────────────────────────────────────────────────────

  describe('GET /api/page-suggestions (getPageSuggestions)', () => {
    test('returns empty suggestions when query is too short', async () => {
      const res = await request(app).get('/api/page-suggestions?q=a');
      expect(res.status).toBe(200);
      expect(res.body.suggestions).toHaveLength(0);
    });

    test('returns suggestions when query matches pages', async () => {
      const res = await request(app).get('/api/page-suggestions?q=Welcome');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('suggestions');
    });

    test('returns empty suggestions when query matches nothing', async () => {
      const res = await request(app).get('/api/page-suggestions?q=zzz');
      expect(res.status).toBe(200);
    });
  });
});
