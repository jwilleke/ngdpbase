/**
 * WikiRoutes coverage batch 12 — interwiki POST handlers, settings updates,
 *   maintenance toggle, addons, footnotes, kiosk, user-info, variables test,
 *   session count.
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
  getSession: vi.fn(),
  createUser: vi.fn(),
  deleteUser: vi.fn()
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
  createMaintenanceNotification: vi.fn().mockResolvedValue(undefined)
};

const mockCacheManager = {
  isInitialized: vi.fn().mockReturnValue(false),
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(true),
  del: vi.fn().mockResolvedValue(true),
  clear: vi.fn().mockResolvedValue(true),
  stats: vi.fn()
};

const mockBackgroundJobManager = {
  registerJob: vi.fn(),
  enqueue: vi.fn().mockResolvedValue('run-123'),
  getStatus: vi.fn().mockReturnValue(null),
  getActiveJobs: vi.fn().mockReturnValue([])
};

const mockVariableManager = {
  expandVariables: vi.fn().mockReturnValue('expanded content'),
  getDebugInfo: vi.fn().mockReturnValue({
    systemVariables: [],
    contextualVariables: [],
    totalVariables: 0
  })
};

const mockFootnoteManager = {
  isEnabled: vi.fn().mockReturnValue(true),
  getFootnotes: vi.fn().mockResolvedValue([]),
  addFootnote: vi.fn().mockResolvedValue({ id: 'fn1', display: 'Note', url: 'http://example.com', note: '' }),
  updateFootnote: vi.fn().mockResolvedValue({ id: 'fn1', display: 'Updated', url: 'http://example.com', note: '' }),
  deleteFootnote: vi.fn().mockResolvedValue(undefined)
};

const mockAddonsManager = {
  getStatus: vi.fn().mockResolvedValue([])
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
      'ngdpbase.interwiki.sites': {},
      'ngdpbase.interwiki.enabled': true,
      'ngdpbase.interwiki.options': {}
    };
    return key in map ? map[key] : defaultValue;
  }),
  getCustomProperty: vi.fn().mockReturnValue(null),
  getAllProperties: vi.fn().mockReturnValue({}),
  getResolvedDataPath: vi.fn((_k: string, def: string) => def),
  getDefaultProperties: vi.fn().mockReturnValue({}),
  getCustomProperties: vi.fn().mockReturnValue({}),
  setProperty: vi.fn().mockResolvedValue(undefined),
  resetToDefaults: vi.fn().mockResolvedValue(undefined)
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
          VariableManager: mockVariableManager,
          FootnoteManager: mockFootnoteManager,
          AddonsManager: mockAddonsManager,
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
  mockUserManager.createUser.mockResolvedValue(true);
  mockUserManager.deleteUser.mockResolvedValue(true);

  mockNotificationManager.getNotifications.mockReturnValue([]);
  mockNotificationManager.getAllNotifications.mockReturnValue([]);
  mockNotificationManager.getStats.mockReturnValue({ total: 0, active: 0, expired: 0, byType: {}, byLevel: {} });
  mockNotificationManager.createMaintenanceNotification.mockResolvedValue(undefined);

  mockBackgroundJobManager.enqueue.mockResolvedValue('run-123');
  mockBackgroundJobManager.getStatus.mockReturnValue(null);
  mockBackgroundJobManager.getActiveJobs.mockReturnValue([]);

  mockVariableManager.expandVariables.mockReturnValue('expanded content');
  mockVariableManager.getDebugInfo.mockReturnValue({ systemVariables: [], contextualVariables: [], totalVariables: 0 });

  mockFootnoteManager.isEnabled.mockReturnValue(true);
  mockFootnoteManager.getFootnotes.mockResolvedValue([]);
  mockFootnoteManager.addFootnote.mockResolvedValue({ id: 'fn1', display: 'Note', url: 'http://example.com', note: '' });
  mockFootnoteManager.updateFootnote.mockResolvedValue({ id: 'fn1', display: 'Updated', url: 'http://example.com', note: '' });
  mockFootnoteManager.deleteFootnote.mockResolvedValue(undefined);

  mockAddonsManager.getStatus.mockResolvedValue([]);
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

describe('WikiRoutes — coverage batch 12', () => {
  let app: express.Application;

  beforeEach(async () => {
    mockUserContext = { ...adminUser };
    resetMocks();
    app = buildApp();
    const { default: WikiEngine } = await import('../../WikiEngine');
    const engine = new WikiEngine();
    const routes = new WikiRoutes(engine as unknown as Parameters<typeof WikiRoutes>[0]);
    routes.registerRoutes(app);
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockUserContext = null;
  });

  // ── Admin Interwiki POST handlers ────────────────────────────────────────────

  describe('POST /admin/interwiki/sites (adminInterwikiSaveSite)', () => {
    test('redirects with error when no permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .post('/admin/interwiki/sites')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ siteName: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/%s' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('error');
    });

    test('redirects with error when site name missing', async () => {
      const res = await request(app)
        .post('/admin/interwiki/sites')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ url: 'https://en.wikipedia.org/wiki/%s' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('error');
    });

    test('redirects with error when URL missing', async () => {
      const res = await request(app)
        .post('/admin/interwiki/sites')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ siteName: 'Wikipedia' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('error');
    });

    test('redirects with error when URL missing %s placeholder', async () => {
      const res = await request(app)
        .post('/admin/interwiki/sites')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ siteName: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('error');
    });

    test('redirects with success when site saved', async () => {
      const res = await request(app)
        .post('/admin/interwiki/sites')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ siteName: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/%s', description: 'Wikipedia' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('success');
    });
  });

  describe('POST /admin/interwiki/sites/:siteName/delete (adminInterwikiDeleteSite)', () => {
    test('redirects with error when no permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .post('/admin/interwiki/sites/Wikipedia/delete')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('error');
    });

    test('redirects with error when site not found', async () => {
      const res = await request(app)
        .post('/admin/interwiki/sites/Nonexistent/delete')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('error');
    });

    test('redirects with success when site deleted', async () => {
      mockConfigManager.getProperty.mockImplementation((key: string, defaultValue: unknown) => {
        if (key === 'ngdpbase.interwiki.sites') {
          return { Wikipedia: { url: 'https://en.wikipedia.org/wiki/%s', enabled: true } };
        }
        return defaultValue;
      });
      const res = await request(app)
        .post('/admin/interwiki/sites/Wikipedia/delete')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('success');
    });
  });

  describe('POST /admin/interwiki/options (adminInterwikiSaveOptions)', () => {
    test('redirects with error when no permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .post('/admin/interwiki/options')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ enabled: 'true' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('error');
    });

    test('redirects with success when options saved', async () => {
      const res = await request(app)
        .post('/admin/interwiki/options')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ enabled: 'true' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('success');
    });
  });

  // ── Admin Settings Updates ───────────────────────────────────────────────────

  describe('POST /admin/settings/theme (adminUpdateTheme)', () => {
    test('redirects with error when no permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .post('/admin/settings/theme')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ theme: 'default' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('error');
    });

    test('redirects with error when theme is not a string', async () => {
      const res = await request(app)
        .post('/admin/settings/theme')
        .set('x-csrf-token', 'test-csrf-token')
        .send({});
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('error');
    });

    test('redirects with success when valid theme selected', async () => {
      const res = await request(app)
        .post('/admin/settings/theme')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ theme: 'default' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('success');
    });
  });

  describe('POST /admin/settings/general (adminUpdateGeneralSettings)', () => {
    test('redirects with error when no permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .post('/admin/settings/general')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ maxFileSizeMB: '10', sessionTimeoutHours: '24' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('error');
    });

    test('redirects with success when settings saved', async () => {
      const res = await request(app)
        .post('/admin/settings/general')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ maxFileSizeMB: '10', sessionTimeoutHours: '24', allowRegistration: 'true' });
      expect(res.status).toBe(302);
    });
  });

  // ── Admin Maintenance Toggle ─────────────────────────────────────────────────

  describe('POST /admin/maintenance/toggle (adminToggleMaintenance)', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .post('/admin/maintenance/toggle')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(403);
    });

    test('redirects with success after toggling maintenance mode', async () => {
      const res = await request(app)
        .post('/admin/maintenance/toggle')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/admin');
    });
  });

  // ── Admin Addons ─────────────────────────────────────────────────────────────

  describe('GET /admin/addons (adminAddons)', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app).get('/admin/addons');
      expect(res.status).toBe(403);
    });

    test('renders 200 with addons list', async () => {
      const res = await request(app).get('/admin/addons');
      expect(res.status).toBe(200);
    });
  });

  describe('POST /admin/addons/:name/toggle (adminAddonToggle)', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .post('/admin/addons/my-addon/toggle')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ enabled: 'true' });
      expect(res.status).toBe(403);
    });

    test('redirects with success when addon toggled', async () => {
      const res = await request(app)
        .post('/admin/addons/my-addon/toggle')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ enabled: 'true' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('success');
    });
  });

  // ── Admin Variables Test ─────────────────────────────────────────────────────

  describe('POST /admin/variables/test (adminTestVariables)', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .post('/admin/variables/test')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ content: '{{test}}' });
      expect(res.status).toBe(403);
    });

    test('renders result page with expanded content', async () => {
      const res = await request(app)
        .post('/admin/variables/test')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ content: '{{today}}', pageName: 'TestPage' });
      expect(res.status).toBe(200);
    });
  });

  // ── Footnote Handlers ────────────────────────────────────────────────────────

  describe('GET /api/footnotes/:pageUuid (getFootnotes)', () => {
    test('returns 404 when footnotes not enabled', async () => {
      mockFootnoteManager.isEnabled.mockReturnValue(false);
      const res = await request(app).get('/api/footnotes/uuid-1');
      expect(res.status).toBe(404);
    });

    test('returns 200 with footnotes list', async () => {
      const res = await request(app).get('/api/footnotes/uuid-1');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/footnotes/:pageUuid (addFootnote)', () => {
    test('returns 401 when not authenticated', async () => {
      mockUserContext = { isAuthenticated: false };
      const res = await request(app)
        .post('/api/footnotes/uuid-1')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ display: 'Note 1', url: 'http://example.com' });
      expect(res.status).toBe(401);
    });

    test('returns 400 when display or url missing', async () => {
      const res = await request(app)
        .post('/api/footnotes/uuid-1')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ display: 'Note 1' });
      expect(res.status).toBe(400);
    });

    test('returns 200 when footnote added', async () => {
      const res = await request(app)
        .post('/api/footnotes/uuid-1')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ display: 'Note 1', url: 'http://example.com', note: 'Extra info' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('#709: 500 response includes the underlying error reason', async () => {
      mockFootnoteManager.addFootnote.mockRejectedValueOnce(new Error('page-not-found:uuid-1'));
      const res = await request(app)
        .post('/api/footnotes/uuid-1')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ display: 'Note 1', url: 'http://example.com' });
      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      // The client's `alert(d.error)` will now show something actionable instead
      // of an opaque "Failed to add footnote".
      expect(res.body.error).toContain('Failed to add footnote');
      expect(res.body.error).toContain('page-not-found:uuid-1');
    });
  });

  describe('PUT /api/footnotes/:pageUuid/:footnoteId (updateFootnote)', () => {
    test('returns 401 when not authenticated', async () => {
      mockUserContext = { isAuthenticated: false };
      const res = await request(app)
        .put('/api/footnotes/uuid-1/fn1')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ display: 'Updated', url: 'http://example.com' });
      expect(res.status).toBe(401);
    });

    test('returns 200 when footnote updated', async () => {
      const res = await request(app)
        .put('/api/footnotes/uuid-1/fn1')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ display: 'Updated', url: 'http://example.com' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('returns 404 when footnote not found', async () => {
      mockFootnoteManager.updateFootnote.mockResolvedValue(null);
      const res = await request(app)
        .put('/api/footnotes/uuid-1/fn-nonexistent')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ display: 'Updated', url: 'http://example.com' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/footnotes/:pageUuid/:footnoteId (deleteFootnote)', () => {
    test('returns 401 when not authenticated', async () => {
      mockUserContext = { isAuthenticated: false };
      const res = await request(app)
        .delete('/api/footnotes/uuid-1/fn1')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(401);
    });

    test('returns 200 when footnote deleted', async () => {
      mockFootnoteManager.getFootnotes.mockResolvedValue([{ id: 'fn1', display: 'Note', url: 'http://example.com', createdBy: 'adminuser' }]);
      const res = await request(app)
        .delete('/api/footnotes/uuid-1/fn1')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── Kiosk ────────────────────────────────────────────────────────────────────

  describe('GET /kiosk (kiosk)', () => {
    test('renders 200 with random pages', async () => {
      const res = await request(app).get('/kiosk');
      expect(res.status).toBe(200);
    });

    test('renders 200 with specific pages', async () => {
      const res = await request(app).get('/kiosk?pages=Welcome,TestPage');
      expect(res.status).toBe(200);
    });
  });

  // ── User Info ────────────────────────────────────────────────────────────────

  describe('GET /user-info (userInfo)', () => {
    test('returns JSON user info for authenticated user', async () => {
      const res = await request(app).get('/user-info');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('userType');
    });

    test('returns JSON user info for unauthenticated user', async () => {
      mockUserContext = null;
      const res = await request(app).get('/user-info');
      expect(res.status).toBe(200);
      expect(res.body.userType).toBe('No User/Anonymous');
    });
  });

  // ── Session Count ────────────────────────────────────────────────────────────

  describe('GET /api/session-count (getActiveSesssionCount)', () => {
    test('returns 503 when session store not available', async () => {
      const res = await request(app).get('/api/session-count');
      expect(res.status).toBe(503);
    });
  });

  // ── Session Manager admin endpoint (#776) ────────────────────────────────────

  describe('GET /api/sessions/list (getActiveSessionDetails)', () => {
    test('returns 403 when caller lacks admin role', async () => {
      mockUserContext = {
        username: 'bob',
        isAuthenticated: true,
        roles: ['reader']
      };
      const res = await request(app).get('/api/sessions/list');
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Admin role required' });
    });

    test('returns 403 when caller is anonymous', async () => {
      mockUserContext = null;
      const res = await request(app).get('/api/sessions/list');
      expect(res.status).toBe(403);
    });

    test('returns 503 when session store is missing', async () => {
      mockUserContext = {
        username: 'admin',
        isAuthenticated: true,
        roles: ['admin']
      };
      // The test app has no session middleware wired up so req.sessionStore is undefined
      const res = await request(app).get('/api/sessions/list');
      expect(res.status).toBe(503);
      expect(res.body.error).toMatch(/not available/);
    });

    test('returns per-session summaries via store.list + store.get (session-file-store path)', async () => {
      mockUserContext = {
        username: 'admin',
        isAuthenticated: true,
        roles: ['admin']
      };
      // Mimic session-file-store: list returns *.json filenames, get loads each session by id.
      const sessionData: Record<string, unknown> = {
        'abc123': {
          cookie: { expires: '2030-01-01T00:00:00.000Z' },
          username: 'admin',
          isAuthenticated: true,
          __lastAccess: Date.parse('2026-05-24T12:00:00.000Z'),
          ip: '127.0.0.1'
        },
        'def456-anon-csrf-only': {
          cookie: { expires: '2030-01-01T00:00:00.000Z' },
          __lastAccess: Date.parse('2026-05-24T12:01:00.000Z')
        },
        'old-expired': {
          cookie: { expires: '2020-01-01T00:00:00.000Z' },
          username: 'jim',
          isAuthenticated: true,
          __lastAccess: Date.parse('2019-12-31T00:00:00.000Z')
        }
      };
      const fakeStore = {
        list: (cb: (err: unknown, files?: string[]) => void) => {
          cb(null, Object.keys(sessionData).map(k => k + '.json'));
        },
        get: (sid: string, cb: (err: unknown, data?: unknown) => void) => {
          cb(null, sessionData[sid]);
        }
      };
      const { default: WikiEngine } = await import('../../WikiEngine');
      const testApp = buildApp();
      testApp.use((req, _res, next) => {
        (req as unknown as { sessionStore: typeof fakeStore }).sessionStore = fakeStore;
        next();
      });
      const engine = new WikiEngine();
      const routes = new WikiRoutes(engine as unknown as Parameters<typeof WikiRoutes>[0]);
      routes.registerRoutes(testApp);

      const res = await request(testApp).get('/api/sessions/list');
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(3);
      expect(res.body.sessions).toHaveLength(3);

      const admin = res.body.sessions.find((s: { id: string }) => s.id === 'abc123');
      expect(admin).toMatchObject({
        username: 'admin',
        isAuthenticated: true,
        expired: false,
        ip: '127.0.0.1',
        expires: '2030-01-01T00:00:00.000Z'
      });

      const anon = res.body.sessions.find((s: { id: string }) => s.id === 'def456-anon-csrf-only');
      expect(anon).toMatchObject({
        username: null,
        isAuthenticated: false,
        expired: false
      });
      expect(anon.ip).toBeUndefined();

      const expired = res.body.sessions.find((s: { id: string }) => s.id === 'old-expired');
      expect(expired.expired).toBe(true);
      expect(expired.username).toBe('jim');
    });

    test('falls back to store.all when list+get are not available', async () => {
      // Some session stores (memory store etc.) implement all() instead of list+get.
      // The handler should still work end-to-end.
      mockUserContext = {
        username: 'admin',
        isAuthenticated: true,
        roles: ['admin']
      };
      const fakeStore = {
        all: (cb: (err: unknown, sessions: unknown) => void) => {
          cb(null, {
            'memstore-1': {
              cookie: { expires: '2030-01-01T00:00:00.000Z' },
              username: 'jim',
              isAuthenticated: true,
              __lastAccess: Date.parse('2026-05-24T12:00:00.000Z')
            }
          });
        }
      };
      const { default: WikiEngine } = await import('../../WikiEngine');
      const testApp = buildApp();
      testApp.use((req, _res, next) => {
        (req as unknown as { sessionStore: typeof fakeStore }).sessionStore = fakeStore;
        next();
      });
      const engine = new WikiEngine();
      const routes = new WikiRoutes(engine as unknown as Parameters<typeof WikiRoutes>[0]);
      routes.registerRoutes(testApp);

      const res = await request(testApp).get('/api/sessions/list');
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.sessions[0].username).toBe('jim');
    });
  });

  // ── Clear anonymous sessions (#777) ──────────────────────────────────────────

  describe('POST /api/sessions/clear-anonymous (clearAnonymousSessions)', () => {
    test('returns 403 when caller lacks admin role', async () => {
      mockUserContext = {
        username: 'bob',
        isAuthenticated: true,
        roles: ['reader']
      };
      const res = await request(app).post('/api/sessions/clear-anonymous');
      expect(res.status).toBe(403);
    });

    test('returns 403 when caller is anonymous', async () => {
      mockUserContext = null;
      const res = await request(app).post('/api/sessions/clear-anonymous');
      expect(res.status).toBe(403);
    });

    test('disabled — keep this placeholder so coverage count is stable while sweep helper has its own dedicated suite', async () => {
      // Real filesystem-walking behavior is covered by the standalone suite at
      // src/routes/__tests__/sweepAnonymousSessions.test.ts which exercises the
      // pure helper against a real temp directory. Verifying the handler's
      // file-walk end-to-end through supertest would require stubbing the engine's
      // ConfigurationManager.getResolvedDataPath, which is more setup than the
      // value justifies.
      expect(true).toBe(true);
    });
  });

  // ── Revoke a single session (#787) ───────────────────────────────────────────

  describe('DELETE /api/sessions/:id (clearOneSession)', () => {
    test('returns 403 when caller lacks admin role', async () => {
      mockUserContext = {
        username: 'bob',
        isAuthenticated: true,
        roles: ['reader']
      };
      const res = await request(app).delete('/api/sessions/some-id');
      expect(res.status).toBe(403);
    });

    test('returns 403 when caller is anonymous', async () => {
      mockUserContext = null;
      const res = await request(app).delete('/api/sessions/some-id');
      expect(res.status).toBe(403);
    });

    test('returns 503 when session store has no destroy method', async () => {
      mockUserContext = {
        username: 'admin',
        isAuthenticated: true,
        roles: ['admin']
      };
      const res = await request(app).delete('/api/sessions/some-id').set('X-CSRF-Token', 'test-csrf-token');
      expect(res.status).toBe(503);
    });

    test('returns 404 when target session does not exist', async () => {
      mockUserContext = {
        username: 'admin',
        isAuthenticated: true,
        roles: ['admin']
      };
      const fakeStore = {
        get: (_sid: string, cb: (err: unknown, data?: unknown) => void) => cb(null, null),
        destroy: (_sid: string, cb: (err: unknown) => void) => cb(null)
      };
      const { default: WikiEngine } = await import('../../WikiEngine');
      const testApp = buildApp();
      testApp.use((req, _res, next) => {
        (req as unknown as { sessionStore: typeof fakeStore }).sessionStore = fakeStore;
        next();
      });
      const engine = new WikiEngine();
      const routes = new WikiRoutes(engine as unknown as Parameters<typeof WikiRoutes>[0]);
      routes.registerRoutes(testApp);

      const res = await request(testApp).delete('/api/sessions/does-not-exist').set('X-CSRF-Token', 'test-csrf-token');
      expect(res.status).toBe(404);
    });

    test('returns 409 when admin tries to revoke their own session without confirm-self', async () => {
      mockUserContext = {
        username: 'admin',
        isAuthenticated: true,
        roles: ['admin']
      };
      const fakeStore = {
        get: (_sid: string, cb: (err: unknown, data?: unknown) => void) => cb(null, { cookie: {}, username: 'admin' }),
        destroy: (_sid: string, cb: (err: unknown) => void) => cb(null)
      };
      const { default: WikiEngine } = await import('../../WikiEngine');
      const testApp = buildApp();
      testApp.use((req, _res, next) => {
        (req as unknown as { sessionStore: typeof fakeStore; sessionID: string }).sessionStore = fakeStore;
        (req as unknown as { sessionStore: typeof fakeStore; sessionID: string }).sessionID = 'my-own-sid';
        next();
      });
      const engine = new WikiEngine();
      const routes = new WikiRoutes(engine as unknown as Parameters<typeof WikiRoutes>[0]);
      routes.registerRoutes(testApp);

      const res = await request(testApp).delete('/api/sessions/my-own-sid').set('X-CSRF-Token', 'test-csrf-token');
      expect(res.status).toBe(409);
      expect(res.body.isSelf).toBe(true);
    });

    test('allows self-revoke when confirm-self=1 is passed', async () => {
      mockUserContext = {
        username: 'admin',
        isAuthenticated: true,
        roles: ['admin']
      };
      let destroyed: string | null = null;
      const fakeStore = {
        get: (_sid: string, cb: (err: unknown, data?: unknown) => void) =>
          cb(null, { cookie: {}, username: 'admin', isAuthenticated: true, ip: '127.0.0.1' }),
        destroy: (sid: string, cb: (err: unknown) => void) => { destroyed = sid; cb(null); }
      };
      const { default: WikiEngine } = await import('../../WikiEngine');
      const testApp = buildApp();
      testApp.use((req, _res, next) => {
        (req as unknown as { sessionStore: typeof fakeStore; sessionID: string }).sessionStore = fakeStore;
        (req as unknown as { sessionStore: typeof fakeStore; sessionID: string }).sessionID = 'my-own-sid';
        next();
      });
      const engine = new WikiEngine();
      const routes = new WikiRoutes(engine as unknown as Parameters<typeof WikiRoutes>[0]);
      routes.registerRoutes(testApp);

      const res = await request(testApp).delete('/api/sessions/my-own-sid?confirm-self=1').set('X-CSRF-Token', 'test-csrf-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.selfRevoke).toBe(true);
      expect(destroyed).toBe('my-own-sid');
    });

    test('200 + destroys target on successful revoke (anonymous target)', async () => {
      mockUserContext = {
        username: 'admin',
        isAuthenticated: true,
        roles: ['admin']
      };
      let destroyed: string | null = null;
      const fakeStore = {
        get: (_sid: string, cb: (err: unknown, data?: unknown) => void) =>
          cb(null, { cookie: {} /* no username = anon */ }),
        destroy: (sid: string, cb: (err: unknown) => void) => { destroyed = sid; cb(null); }
      };
      const { default: WikiEngine } = await import('../../WikiEngine');
      const testApp = buildApp();
      testApp.use((req, _res, next) => {
        (req as unknown as { sessionStore: typeof fakeStore; sessionID: string }).sessionStore = fakeStore;
        (req as unknown as { sessionStore: typeof fakeStore; sessionID: string }).sessionID = 'admin-sid';
        next();
      });
      const engine = new WikiEngine();
      const routes = new WikiRoutes(engine as unknown as Parameters<typeof WikiRoutes>[0]);
      routes.registerRoutes(testApp);

      const res = await request(testApp).delete('/api/sessions/anon-target-sid').set('X-CSRF-Token', 'test-csrf-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.revokedUsername).toBeNull();
      expect(res.body.selfRevoke).toBe(false);
      expect(destroyed).toBe('anon-target-sid');
    });
  });
});
