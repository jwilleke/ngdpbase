/**
 * WikiRoutes coverage batch 10 — media, notifications, organizations, jobs:
 *   GET/POST /media/*         (mediaHome, mediaByYear, mediaByKeyword, etc.)
 *   POST /admin/notifications/* (adminDismissNotification, adminClearAllNotifications)
 *   GET  /admin/notifications  (adminNotifications)
 *   GET  /admin/organizations  (adminOrganizations)
 *   POST /admin/organizations  (adminCreateOrganization)
 *   POST /api/admin/jobs/...   (apiJobEnqueue, apiJobStatus, apiJobsActive)
 *   GET  /api/session-count    (getActiveSesssionCount)
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

const mockMediaManager = {
  getYears: vi.fn(),
  listByYear: vi.fn(),
  listByKeyword: vi.fn(),
  getItem: vi.fn(),
  search: vi.fn(),
  getAll: vi.fn(),
  rescan: vi.fn(),
  rebuild: vi.fn(),
  getTranscodedBuffer: vi.fn(),
  generateThumbnail: vi.fn()
};

const mockPageManager = {
  getPage: vi.fn(),
  getPageContent: vi.fn(),
  getPageMetadata: vi.fn(),
  getAllPages: vi.fn(),
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
  getSuggestions: vi.fn(),
  getAllDocuments: vi.fn(),
  getStats: vi.fn(),
  getAllSystemKeywords: vi.fn(),
  getPageSystemKeywords: vi.fn()
};

const mockNotificationManager = {
  getNotifications: vi.fn().mockReturnValue([]),
  getAllNotifications: vi.fn().mockReturnValue([]),
  getStats: vi.fn().mockReturnValue({ total: 0, active: 0, expired: 0, byType: {}, byLevel: {} }),
  dismissNotification: vi.fn().mockResolvedValue(true),
  clearAllActive: vi.fn().mockResolvedValue(5)
};

const mockBackgroundJobManager = {
  registerJob: vi.fn(),
  enqueue: vi.fn().mockResolvedValue('run-123'),
  getStatus: vi.fn().mockReturnValue({ state: 'pending', runId: 'run-123' }),
  getActiveJobs: vi.fn().mockReturnValue([])
};

const mockAssetService = {
  search: vi.fn().mockResolvedValue({ results: [], total: 0 })
};

const mockSchemaManager = {
  getPerson: vi.fn().mockResolvedValue(null)
  // #624: org CRUD methods removed (they were phantoms here too — never
  // actually existed on SchemaManager). Org tests now use mockOrganizationManager.
};

// #624: OrganizationManager is now the canonical store for org records.
const mockOrganizationManager = {
  list: vi.fn().mockResolvedValue([{ '@type': 'Organization', '@id': 'urn:test', name: 'TestOrg' }]),
  getById: vi.fn().mockResolvedValue(null),
  getByFile: vi.fn().mockResolvedValue(null),
  create: vi.fn().mockResolvedValue({ '@id': 'urn:new', name: 'New' }),
  update: vi.fn().mockResolvedValue({ '@id': 'urn:test', name: 'Updated' }),
  delete: vi.fn().mockResolvedValue(true),
  getInstallOrg: vi.fn().mockResolvedValue(null)
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

let includeMediaManager = false;

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
          SchemaManager: mockSchemaManager,
          OrganizationManager: mockOrganizationManager,
          MediaManager: includeMediaManager ? mockMediaManager : null,
          AssetService: includeMediaManager ? mockAssetService : null,
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
  includeMediaManager = false;
  mockPageManager.provider = null;
  mockPageManager.getPage.mockImplementation((name: string) => {
    if (['LeftMenu', 'Footer', 'left-menu-content', 'footer-content'].includes(name)) return Promise.resolve(null);
    return Promise.resolve({ content: '# Page', metadata: { title: 'TestPage', uuid: 'uuid-1', 'user-keywords': [] }, filePath: null });
  });
  mockPageManager.getPageContent.mockResolvedValue('# Page content');
  mockPageManager.getPageMetadata.mockResolvedValue({ title: 'TestPage', uuid: 'test-uuid-1' });
  mockPageManager.getAllPages.mockResolvedValue(['Welcome', 'TestPage']);
  mockPageManager.getPageNames.mockResolvedValue(['Welcome', 'TestPage']);
  mockPageManager.getAllPageNames.mockResolvedValue(['Welcome', 'TestPage']);
  mockPageManager.savePage.mockResolvedValue(true);
  mockPageManager.deletePage.mockResolvedValue(true);
  mockPageManager.pageExists.mockReturnValue(true);
  mockPageManager.getCurrentPageProvider.mockReturnValue(null);
  mockPageManager.getPageUUID.mockReturnValue(null);
  mockPageManager.deletePageWithContext.mockResolvedValue(true);

  mockMediaManager.getYears.mockResolvedValue([2024, 2023]);
  mockMediaManager.listByYear.mockResolvedValue([]);
  mockMediaManager.listByKeyword.mockResolvedValue([]);
  mockMediaManager.getItem.mockResolvedValue({ id: 'img1', filePath: '/tmp/img.jpg', mimeType: 'image/jpeg', year: 2024, metadata: {} });
  mockMediaManager.search.mockResolvedValue({ items: [], total: 0 });
  mockMediaManager.getAll.mockResolvedValue([]);
  mockMediaManager.rescan.mockResolvedValue({ added: 0, removed: 0 });
  mockMediaManager.rebuild.mockResolvedValue({ rebuilt: 0 });
  mockMediaManager.getTranscodedBuffer.mockResolvedValue(null);
  mockMediaManager.generateThumbnail.mockResolvedValue(null);

  mockACLManager.checkPagePermission.mockResolvedValue(true);
  mockACLManager.checkPagePermissionWithContext.mockResolvedValue(true);
  mockACLManager.removeACLMarkup.mockImplementation((c: string) => c);
  mockACLManager.parseACL.mockReturnValue({ permissions: [] });

  mockCacheManager.isInitialized.mockReturnValue(false);
  mockCacheManager.get.mockResolvedValue(null);
  mockCacheManager.set.mockResolvedValue(true);
  mockCacheManager.del.mockResolvedValue(true);
  mockCacheManager.clear.mockResolvedValue(true);

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
  mockNotificationManager.dismissNotification.mockResolvedValue(true);
  mockNotificationManager.clearAllActive.mockResolvedValue(5);

  mockBackgroundJobManager.registerJob.mockImplementation(() => {});
  mockBackgroundJobManager.enqueue.mockResolvedValue('run-123');
  mockBackgroundJobManager.getStatus.mockReturnValue({ state: 'pending', runId: 'run-123' });
  mockBackgroundJobManager.getActiveJobs.mockReturnValue([]);

  mockAssetService.search.mockResolvedValue({ results: [], total: 0 });

  // #624: org CRUD now flows through OrganizationManager.
  mockOrganizationManager.list.mockResolvedValue([{ '@type': 'Organization', '@id': 'urn:test', name: 'TestOrg' }]);
  mockOrganizationManager.create.mockResolvedValue({ '@id': 'urn:new', name: 'New' });
  mockOrganizationManager.update.mockResolvedValue({ '@id': 'urn:test', name: 'Updated' });
  mockOrganizationManager.delete.mockResolvedValue(true);
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

describe('WikiRoutes — coverage batch 10', () => {
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

  // ── Media handlers (503 when no MediaManager) ─────────────────────────────────

  describe('Media handlers — 503 when MediaManager not enabled', () => {
    test('GET /media returns 503', async () => {
      const res = await request(app).get('/media');
      expect(res.status).toBe(503);
    });

    test('GET /media/year/2024 returns 503', async () => {
      const res = await request(app).get('/media/year/2024');
      expect(res.status).toBe(503);
    });

    test('GET /media/keyword/nature returns 503', async () => {
      const res = await request(app).get('/media/keyword/nature');
      expect(res.status).toBe(503);
    });

    test('GET /media/item/img1 returns 503', async () => {
      const res = await request(app).get('/media/item/img1');
      expect(res.status).toBe(503);
    });

    test('GET /media/search returns 503 (AssetService not available)', async () => {
      const res = await request(app).get('/media/search');
      expect(res.status).toBe(503);
    });

    test('GET /media/api/item/img1 returns 503', async () => {
      const res = await request(app).get('/media/api/item/img1');
      expect(res.status).toBe(503);
    });

    test('GET /media/api/year/2024 returns 503', async () => {
      const res = await request(app).get('/media/api/year/2024');
      expect(res.status).toBe(503);
    });

    test('GET /media/file/img1 returns 503', async () => {
      const res = await request(app).get('/media/file/img1');
      expect(res.status).toBe(503);
    });

    test('GET /media/thumb/img1 returns 503', async () => {
      const res = await request(app).get('/media/thumb/img1');
      expect(res.status).toBe(503);
    });

    test('POST /admin/media/rescan returns 503', async () => {
      const res = await request(app)
        .post('/admin/media/rescan')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(503);
    });

    test('POST /admin/media/rebuild returns 503', async () => {
      const res = await request(app)
        .post('/admin/media/rebuild')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(503);
    });
  });

  // ── Media handlers (happy path with MediaManager) ─────────────────────────────

  describe('Media handlers — happy paths with MediaManager enabled', () => {
    beforeEach(async () => {
      resetMocks();
      includeMediaManager = true;
      app = buildApp();
      const { default: WikiEngine } = await import('../../WikiEngine');
      const engine = new WikiEngine();
      const routes = new WikiRoutes(engine);
      routes.registerRoutes(app);
    });

    test('GET /media returns 200 with media home', async () => {
      const res = await request(app).get('/media');
      expect(res.status).toBe(200);
    });

    test('GET /media/year/2024 returns 200 with items', async () => {
      const res = await request(app).get('/media/year/2024');
      expect(res.status).toBe(200);
    });

    test('GET /media/year/abc returns 400 for invalid year', async () => {
      const res = await request(app).get('/media/year/abc');
      expect(res.status).toBe(400);
    });

    test('GET /media/keyword/nature returns 200', async () => {
      const res = await request(app).get('/media/keyword/nature');
      expect(res.status).toBe(200);
    });

    test('GET /media/search returns 200 with results', async () => {
      const res = await request(app).get('/media/search?q=test');
      expect(res.status).toBe(200);
    });

    test('GET /media/api/item/img1 returns 404 when item not found', async () => {
      mockMediaManager.getItem.mockResolvedValue(null);
      const res = await request(app).get('/media/api/item/img1');
      expect(res.status).toBe(404);
    });

    test('GET /media/api/year/2024 returns 200 JSON', async () => {
      const res = await request(app).get('/media/api/year/2024');
      expect(res.status).toBe(200);
    });

    test('GET /media/file/img1 returns 404 when item not found', async () => {
      mockMediaManager.getItem.mockResolvedValue(null);
      const res = await request(app).get('/media/file/img1');
      expect(res.status).toBe(404);
    });

    test('GET /admin/media returns 200', async () => {
      const res = await request(app).get('/admin/media');
      expect(res.status).toBe(200);
    });

    test('POST /admin/media/rescan returns 202', async () => {
      const res = await request(app)
        .post('/admin/media/rescan')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(202);
    });

    test('POST /admin/media/rebuild returns 202', async () => {
      const res = await request(app)
        .post('/admin/media/rebuild')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(202);
    });
  });

  // ── Notification handlers ────────────────────────────────────────────────────

  describe('POST /admin/notifications/:id/dismiss (adminDismissNotification)', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .post('/admin/notifications/notif-1/dismiss')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(403);
    });

    test('redirects with success when notification dismissed', async () => {
      const res = await request(app)
        .post('/admin/notifications/notif-1/dismiss')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/admin');
    });

    test('redirects with error when dismissal returns false', async () => {
      mockNotificationManager.dismissNotification.mockResolvedValue(false);
      const res = await request(app)
        .post('/admin/notifications/notif-1/dismiss')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('error');
    });
  });

  describe('POST /admin/notifications/clear-all (adminClearAllNotifications)', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .post('/admin/notifications/clear-all')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(403);
    });

    test('redirects with success count after clearing all', async () => {
      const res = await request(app)
        .post('/admin/notifications/clear-all')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('success');
    });
  });

  describe('GET /admin/notifications (adminNotifications)', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app).get('/admin/notifications');
      expect(res.status).toBe(403);
    });

    test('renders 200 for admin user', async () => {
      const res = await request(app).get('/admin/notifications');
      expect(res.status).toBe(200);
    });
  });

  // ── Organization handlers ────────────────────────────────────────────────────

  describe('GET /admin/organizations (adminOrganizations)', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app).get('/admin/organizations');
      expect(res.status).toBe(403);
    });

    test('renders 200 with organizations list', async () => {
      const res = await request(app).get('/admin/organizations');
      expect(res.status).toBe(200);
    });
  });

  describe('POST /admin/organizations (adminCreateOrganization)', () => {
    test('returns 403 when user is not admin', async () => {
      // #609: explicitly deny the permission. Without this the handler's
      // userManager.hasPermission gate (default-true via beforeEach) lets
      // the request through, so the test was relying on mock-state leakage
      // from a prior test — flaky in full-suite runs, broken in isolation.
      mockUserManager.hasPermission.mockResolvedValue(false);
      mockUserContext = { ...adminUser, isAuthenticated: true, isAdmin: false } as typeof adminUser;
      const res = await request(app)
        .post('/admin/organizations')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ name: 'New Org', identifier: 'new-org' });
      expect(res.status).toBe(403);
    });

    test('redirects on success for non-JSON request', async () => {
      const res = await request(app)
        .post('/admin/organizations')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ name: 'New Org', identifier: 'new-org' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/admin/organizations');
    });

    test('returns JSON on success when accept is application/json', async () => {
      const res = await request(app)
        .post('/admin/organizations')
        .set('x-csrf-token', 'test-csrf-token')
        .set('Accept', 'application/json')
        .send({ name: 'New Org', identifier: 'new-org' });
      expect([200, 201]).toContain(res.status);
    });
  });

  // ── Background job handlers ──────────────────────────────────────────────────

  describe('POST /api/admin/jobs/:jobId/enqueue (apiJobEnqueue)', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .post('/api/admin/jobs/pages.reindex/enqueue')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(403);
    });

    test('returns 202 with runId on successful enqueue', async () => {
      const res = await request(app)
        .post('/api/admin/jobs/pages.reindex/enqueue')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(202);
      expect(res.body.runId).toBe('run-123');
    });

    test('returns 404 when job is unknown', async () => {
      mockBackgroundJobManager.enqueue.mockRejectedValue(new Error('unknown job: missing'));
      const res = await request(app)
        .post('/api/admin/jobs/missing/enqueue')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/admin/jobs/active (apiJobsActive)', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app).get('/api/admin/jobs/active');
      expect(res.status).toBe(403);
    });

    test('returns 200 with active jobs list', async () => {
      const res = await request(app).get('/api/admin/jobs/active');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/admin/jobs/:runId/status (apiJobStatus)', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app).get('/api/admin/jobs/run-123/status');
      expect(res.status).toBe(403);
    });

    test('returns 200 with job run status', async () => {
      const res = await request(app).get('/api/admin/jobs/run-123/status');
      expect(res.status).toBe(200);
      expect(res.body.runId).toBe('run-123');
    });

    test('returns 404 when run not found', async () => {
      mockBackgroundJobManager.getStatus.mockReturnValue(null);
      const res = await request(app).get('/api/admin/jobs/unknown-run/status');
      expect(res.status).toBe(404);
    });
  });
});
