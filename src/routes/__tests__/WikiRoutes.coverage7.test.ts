/**
 * WikiRoutes coverage batch 7 — high-value handlers:
 *   GET  /view/:page        (viewPage)
 *   GET  /edit/:page        (editPage)
 *   POST /register          (processRegister)
 *   POST /profile           (updateProfile)
 *   POST /preferences       (updatePreferences)
 *   GET  /admin/backup      (adminBackupPage)
 *   POST /admin/backup/config (adminBackupConfig)
 *   POST /export/html/:page (exportPageHtml — error path)
 *   POST /export/markdown/:page (exportPageMarkdown — error path)
 */
import express from 'express';
import request from 'supertest';
import path from 'path';
import WikiRoutes, { signupRateLimiter } from '../WikiRoutes';
import { UserCreateError } from '../../utils/userCreateError';

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
  isExternal?: boolean;
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
  provider: null as null | { getVersionHistory?: unknown; compareVersions?: unknown; pageIndex?: unknown }
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
  advancedSearchWithContext: vi.fn(),
  getSuggestions: vi.fn(),
  getAllDocuments: vi.fn(),
  getStats: vi.fn(),
  getAllSystemKeywords: vi.fn(),
  removePageFromIndex: vi.fn(),
  getPageSystemKeywords: vi.fn()
};

const mockExportManager = {
  getExports: vi.fn(),
  deleteExport: vi.fn(),
  exportPageToHtml: vi.fn(),
  saveExport: vi.fn(),
  exportToMarkdown: vi.fn()
};

const mockBackupManager = {
  getAutoBackupStatus: vi.fn(),
  listBackups: vi.fn(),
  updateAutoBackupConfig: vi.fn()
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
          ExportManager: mockExportManager,
          BackupManager: mockBackupManager,
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
  metadata: { title: 'TestPage', 'system-category': 'general', uuid: 'test-uuid-1', 'user-keywords': [], 'system-keywords': [] },
  filePath: null
};

const adminUser = {
  username: 'adminuser',
  displayName: 'Admin User',
  email: 'admin@example.com',
  isAuthenticated: true,
  isExternal: false,
  roles: ['admin', 'authenticated'],
  preferences: { 'nav.pinnedPages': [] }
};

function resetMocks() {
  mockPageManager.provider = null;
  mockPageManager.getPage.mockImplementation((name: string) => {
    if (['LeftMenu', 'Footer', 'left-menu-content', 'footer-content'].includes(name)) return Promise.resolve(null);
    return Promise.resolve(existingPage);
  });
  mockPageManager.getPageContent.mockResolvedValue('# Page content');
  mockPageManager.getPageMetadata.mockResolvedValue({ title: 'TestPage', uuid: 'test-uuid-1', 'user-keywords': [], 'system-keywords': [] });
  mockPageManager.getAllPages.mockResolvedValue(['Welcome', 'TestPage']);
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

  mockCacheManager.isInitialized.mockReturnValue(false);
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
  mockSearchManager.getPageSystemKeywords.mockResolvedValue([]);

  mockExportManager.getExports.mockResolvedValue([]);
  mockExportManager.deleteExport.mockResolvedValue(undefined);
  mockExportManager.exportPageToHtml.mockResolvedValue('<html>exported</html>');
  mockExportManager.saveExport.mockResolvedValue('/tmp/test-export.html');
  mockExportManager.exportToMarkdown.mockResolvedValue('# markdown');

  mockBackupManager.getAutoBackupStatus.mockResolvedValue({ enabled: false, time: '02:00', days: 'daily' });
  mockBackupManager.listBackups.mockResolvedValue([]);
  mockBackupManager.updateAutoBackupConfig.mockResolvedValue(undefined);

  mockUserManager.getCurrentUser.mockResolvedValue(adminUser);
  mockUserManager.hasPermission.mockResolvedValue(true);
  mockUserManager.getUser.mockResolvedValue({ username: 'testuser', email: 'test@example.com', displayName: 'Test User', preferences: {} });
  mockUserManager.getUsers.mockResolvedValue([]);
  mockUserManager.getRoles.mockReturnValue(new Map());
  mockUserManager.getPermissions.mockReturnValue(new Map());
  mockUserManager.getUserPermissions.mockReturnValue(['read', 'write']);
  mockUserManager.searchUsers.mockResolvedValue([]);
  mockUserManager.createSession.mockResolvedValue('sid');
  mockUserManager.authenticateUser.mockResolvedValue({ username: 'testuser', isAuthenticated: true });
  mockUserManager.updateUser.mockResolvedValue(true);
  mockUserManager.destroySession.mockResolvedValue(true);
  mockUserManager.getSession.mockResolvedValue(null);
  mockUserManager.createUser.mockResolvedValue({ username: 'newuser' });

  mockNotificationManager.getNotifications.mockReturnValue([]);
  mockNotificationManager.getAllNotifications.mockReturnValue([]);
  mockNotificationManager.getStats.mockReturnValue({ total: 0, active: 0, expired: 0, byType: {}, byLevel: {} });
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
    (res as unknown as Record<string, unknown>).download = (
      _filePath: string, _filename: string,
      cb?: (err?: Error) => void
    ) => {
      res.status(200).send('file-download');
      if (cb) cb();
      return res;
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

describe('WikiRoutes — coverage batch 7', () => {
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

  // ── GET /view/:page (viewPage) ───────────────────────────────────────────────

  describe('GET /view/:page (viewPage)', () => {
    test('renders 200 for existing page with ACL allowed', async () => {
      const res = await request(app).get('/view/TestPage');
      expect(res.status).toBe(200);
    });

    test('returns 404 when page content throws "not found"', async () => {
      mockPageManager.getPageContent.mockRejectedValue(new Error('Page not found'));
      const res = await request(app).get('/view/MissingPage');
      expect(res.status).toBe(404);
    });

    test('returns 403 when ACL denies view', async () => {
      mockACLManager.checkPagePermissionWithContext.mockResolvedValue(false);
      const res = await request(app).get('/view/TestPage');
      expect(res.status).toBe(403);
    });

    test('renders 200 with cache enabled and cache hit', async () => {
      mockConfigManager.getProperty.mockImplementation((key: string, defaultValue: unknown) => {
        if (key === 'ngdpbase.cache.rendered-pages.enabled') return true;
        const map: Record<string, unknown> = {
          'ngdpbase.front-page': 'Welcome', 'ngdpbase.theme.active': 'default',
          'ngdpbase.application-name': 'ngdpbase', 'ngdpbase.tab.pagetabs': false,
          'ngdpbase.page.nofooter': [], 'ngdpbase.page.notabs': [],
          'ngdpbase.system-category': { general: { label: 'general', storageLocation: 'regular', enabled: true } },
          'ngdpbase.roles.definitions': {}, 'ngdpbase.maximum.user-keywords': 5,
          'ngdpbase.timezones': []
        };
        return key in map ? map[key] : defaultValue;
      });
      mockCacheManager.isInitialized.mockReturnValue(true);
      mockCacheManager.get.mockResolvedValue({ html: '<p>cached</p>', tabSectionHtml: '' });
      const res = await request(app).get('/view/TestPage');
      expect(res.status).toBe(200);
      expect(mockCacheManager.get).toHaveBeenCalled();
    });

    test('returns 200 with unauthenticated user when ACL allows', async () => {
      mockUserContext = null;
      const res = await request(app).get('/view/TestPage');
      expect(res.status).toBe(200);
    });

    test('returns 500 when textToHTML throws', async () => {
      mockRenderingManager.textToHTML.mockRejectedValue(new Error('render error'));
      const res = await request(app).get('/view/TestPage');
      expect(res.status).toBe(500);
    });
  });

  // ── GET /edit/:page (editPage) ───────────────────────────────────────────────

  describe('GET /edit/:page (editPage)', () => {
    test('redirects unauthenticated user to login', async () => {
      mockUserContext = null;
      const res = await request(app).get('/edit/TestPage');
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/login');
    });

    test('renders 200 for authenticated user with edit permission', async () => {
      const res = await request(app).get('/edit/TestPage');
      expect(res.status).toBe(200);
    });

    test('returns 403 when ACL denies edit', async () => {
      mockACLManager.checkPagePermissionWithContext.mockResolvedValue(false);
      const res = await request(app).get('/edit/TestPage');
      expect(res.status).toBe(403);
    });

    test('renders 200 for new page (getPage returns null)', async () => {
      mockPageManager.getPage.mockImplementation((name: string) => {
        if (['LeftMenu', 'Footer', 'left-menu-content'].includes(name)) return Promise.resolve(null);
        if (name === 'NewPage') return Promise.resolve(null);
        return Promise.resolve(existingPage);
      });
      mockUserManager.hasPermission.mockResolvedValue(true);
      const res = await request(app).get('/edit/NewPage');
      expect(res.status).toBe(200);
    });

    test('returns 403 when no permission to create new page', async () => {
      mockPageManager.getPage.mockImplementation((name: string) => {
        if (['LeftMenu', 'Footer', 'left-menu-content'].includes(name)) return Promise.resolve(null);
        if (name === 'BrandNewPage') return Promise.resolve(null);
        return Promise.resolve(existingPage);
      });
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app).get('/edit/BrandNewPage');
      expect(res.status).toBe(403);
    });
  });

  // ── POST /register (processRegister) ────────────────────────────────────────

  describe('POST /register (processRegister)', () => {
    test('redirects with error when required fields are missing', async () => {
      const res = await request(app)
        .post('/register')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ username: 'newuser' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/register');
      expect(res.headers.location).toContain('error');
    });

    test('redirects with error when passwords do not match', async () => {
      const res = await request(app)
        .post('/register')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ username: 'newuser', email: 'new@example.com', password: 'abc123', confirmPassword: 'xyz789' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('Passwords');
    });

    test('redirects with error when password is too short', async () => {
      const res = await request(app)
        .post('/register')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ username: 'newuser', email: 'new@example.com', password: 'abc', confirmPassword: 'abc' });
      expect(res.status).toBe(302);
      expect(decodeURIComponent(res.headers.location)).toContain('6 characters');
    });

    test('redirects to login on successful registration', async () => {
      const res = await request(app)
        .post('/register')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ username: 'newuser', email: 'new@example.com', password: 'securepass', confirmPassword: 'securepass' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/login');
    });

    // #1086: POST /register disclosed every username on the instance to an
    // unauthenticated visitor. `createUser` joined `getAllUsernames()` into its
    // error and the route forwarded `getErrorMessage(err)` straight into the
    // redirect the register page renders. Reproduced on jimstest as:
    //   /register?error=Username already exists: "admin".
    //             Existing users: admin, jim, molly
    describe('error messages never leak internal detail (#1086)', () => {
      // The signup limiter is module-level and allows 5 per 15 minutes per IP.
      // This block posts four times on top of the tests above it, which
      // exhausts the budget and turns later responses into 429s with no
      // Location header — the assertions then pass vacuously against
      // `undefined`. Reset per test so each one exercises the real path.
      beforeEach(() => signupRateLimiter.reset());

      const post = () => request(app)
        .post('/register')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ username: 'admin', email: 'x@example.com', password: 'securepass', confirmPassword: 'securepass' });

      test('a username list in the thrown message never reaches the visitor', async () => {
        mockUserManager.createUser.mockRejectedValue(
          new UserCreateError('username-taken', 'Username already exists: "admin". Existing users: admin, jim, molly')
        );

        const location = decodeURIComponent((await post()).headers.location);

        expect(location).not.toContain('jim');
        expect(location).not.toContain('molly');
        expect(location).not.toContain('Existing users');
      });

      test('the visitor is still told the username is unavailable', async () => {
        // Registration cannot hide THIS fact — the visitor has to pick another
        // name. It can hide everything else.
        mockUserManager.createUser.mockRejectedValue(
          new UserCreateError('username-taken', 'internal detail')
        );

        const location = decodeURIComponent((await post()).headers.location);

        expect(location).toContain('That username is not available');
      });

      test('a display-name conflict does not reveal that a page exists', async () => {
        // The internal cause names the colliding page, which would tell an
        // anonymous visitor whether it exists — including a private one.
        mockUserManager.createUser.mockRejectedValue(
          new UserCreateError('display-name-conflict', 'Display name "Secret Project" conflicts with an existing page')
        );

        const location = decodeURIComponent((await post()).headers.location);

        expect(location).not.toContain('Secret Project');
        expect(location).not.toContain('page');
        expect(location).toContain('That display name is not available');
      });

      test('an arbitrary internal error becomes the generic failure', async () => {
        // The structural half: the route must not treat exception text as
        // user-facing copy, or the next internal throw re-creates this bug.
        mockUserManager.createUser.mockRejectedValue(
          new Error('ENOSPC: no space left on device, open /Volumes/hd2/secret/path')
        );

        const location = decodeURIComponent((await post()).headers.location);

        expect(location).not.toContain('ENOSPC');
        expect(location).not.toContain('/Volumes');
        expect(location).toContain('Registration failed');
      });
    });

    test('redirects with error when createUser throws', async () => {
      mockUserManager.createUser.mockRejectedValue(new Error('Username already taken'));
      const res = await request(app)
        .post('/register')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ username: 'existing', email: 'ex@example.com', password: 'securepass', confirmPassword: 'securepass' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/register');
    });
  });

  // ── POST /profile (updateProfile) ───────────────────────────────────────────

  describe('POST /profile (updateProfile)', () => {
    test('redirects to login when unauthenticated', async () => {
      mockUserContext = null;
      const res = await request(app)
        .post('/profile')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ displayName: 'New Name' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/login');
    });

    test('redirects to profile on successful update (no password change)', async () => {
      const res = await request(app)
        .post('/profile')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ displayName: 'Updated Name', email: 'updated@example.com' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/profile');
      expect(res.headers.location).toContain('success');
    });

    test('redirects with error when current password missing for password change', async () => {
      const res = await request(app)
        .post('/profile')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ newPassword: 'newpass123', confirmPassword: 'newpass123' });
      expect(res.status).toBe(302);
      expect(decodeURIComponent(res.headers.location)).toContain('Current password required');
    });

    test('redirects with error when new passwords do not match', async () => {
      const res = await request(app)
        .post('/profile')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ currentPassword: 'old123', newPassword: 'newpass123', confirmPassword: 'different' });
      expect(res.status).toBe(302);
      expect(decodeURIComponent(res.headers.location)).toContain('do not match');
    });

    test('redirects with error when new password too short', async () => {
      const res = await request(app)
        .post('/profile')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ currentPassword: 'old123', newPassword: 'abc', confirmPassword: 'abc' });
      expect(res.status).toBe(302);
      expect(decodeURIComponent(res.headers.location)).toContain('6 characters');
    });

    test('redirects with error when current password is incorrect', async () => {
      mockUserManager.authenticateUser.mockResolvedValue(null);
      const res = await request(app)
        .post('/profile')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ currentPassword: 'wrongpass', newPassword: 'newpass123', confirmPassword: 'newpass123' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('incorrect');
    });

    test('redirects with error for external OAuth user trying to change password', async () => {
      mockUserContext = { ...adminUser, isExternal: true };
      const res = await request(app)
        .post('/profile')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ newPassword: 'newpass123', confirmPassword: 'newpass123' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('OAuth');
    });

    // #662 follow-up: profile-page rename demotes old page to general rather
    // than deleting it. Preserves the user's prior content as a regular page
    // they can later edit or delete themselves. (Test mock nests fields
    // under `metadata`; real WikiPage has `uuid`/`title` flat — UUID-
    // preservation behavior is exercised against the provider, not asserted
    // at this layer.)
    test('rename profile page: demotes old page to system-category=general instead of deleting', async () => {
      const oldProfilePage = {
        title: 'OldName',
        uuid: 'old-profile-uuid',
        content: '# My old profile content',
        metadata: {
          title: 'OldName',
          uuid: 'old-profile-uuid',
          slug: 'oldname',
          'system-category': 'user-profile',
          'author-lock': true,
          description: "Admin User's profile page",
          badge: 'Profile Admin User',
          author: 'adminuser'
        },
        filePath: '/data/pages/old-profile-uuid.md'
      };
      mockPageManager.getPage.mockImplementation((name: string) => {
        if (name === 'OldName') return Promise.resolve(oldProfilePage);
        return Promise.resolve(null);
      });
      mockPageManager.pageExists.mockReturnValue(false);

      const res = await request(app)
        .post('/profile')
        .set('x-csrf-token', 'test-csrf-token')
        .send({
          profilePage: 'NewName',
          originalProfilePage: 'OldName',
          renameProfilePage: 'on'
        });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('success');

      // savePage called twice: new page (NewName) + demoted old page (OldName)
      expect(mockPageManager.savePage).toHaveBeenCalledTimes(2);
      const calls = mockPageManager.savePage.mock.calls;
      const newSave = calls.find(c => c[0] === 'NewName');
      const oldSave = calls.find(c => c[0] === 'OldName');
      expect(newSave).toBeDefined();
      expect(oldSave).toBeDefined();

      // New page: full profile metadata; uuid/slug stripped so the provider
      // mints fresh ones (avoids UUID collision with the still-present old).
      expect(newSave?.[2]['system-category']).toBe('user-profile');
      expect(newSave?.[2]['author-lock']).toBe(true);
      expect(newSave?.[2].description).toBe("Admin User's profile page");
      expect(newSave?.[2].badge).toBe('Profile Admin User');
      expect(newSave?.[2].uuid).toBeUndefined();
      expect(newSave?.[2].slug).toBeUndefined();

      // Old page: demoted to general; profile-only fields stripped;
      // author-lock preserved so write access stays with original author.
      expect(oldSave?.[2]['system-category']).toBe('general');
      expect(oldSave?.[2]['author-lock']).toBe(true);
      expect(oldSave?.[2].description).toBeUndefined();
      expect(oldSave?.[2].badge).toBeUndefined();

      // Old page is NOT deleted — the whole point of the demote.
      expect(mockPageManager.deletePage).not.toHaveBeenCalled();
    });
  });

  // ── POST /preferences (updatePreferences) ───────────────────────────────────

  describe('POST /preferences (updatePreferences)', () => {
    test('redirects to login when unauthenticated', async () => {
      mockUserContext = null;
      const res = await request(app)
        .post('/preferences')
        .set('x-csrf-token', 'test-csrf-token')
        .send({});
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/login');
    });

    test('redirects to profile with success on save', async () => {
      const res = await request(app)
        .post('/preferences')
        .set('x-csrf-token', 'test-csrf-token')
        .send({
          'editor.plain.smartpairs': 'on',
          'display.theme': 'dark',
          'display.pagesize': '50'
        });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/profile');
      expect(res.headers.location).toContain('success');
    });

    test('saves locale-based dateFormat when preferences.dateFormat is "auto"', async () => {
      const res = await request(app)
        .post('/preferences')
        .set('x-csrf-token', 'test-csrf-token')
        .send({
          'preferences.locale': 'en-US',
          'preferences.dateFormat': 'auto'
        });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('success');
    });
  });

  // ── GET /admin/backup (adminBackupPage) ─────────────────────────────────────

  describe('GET /admin/backup (adminBackupPage)', () => {
    test('renders 200 for admin with BackupManager', async () => {
      const res = await request(app).get('/admin/backup');
      expect(res.status).toBe(200);
    });

    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app).get('/admin/backup');
      expect(res.status).toBe(403);
    });
  });

  // ── POST /admin/backup/config (adminBackupConfig) ────────────────────────────

  describe('POST /admin/backup/config (adminBackupConfig)', () => {
    test('redirects with success after saving config', async () => {
      const res = await request(app)
        .post('/admin/backup/config')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ autoBackup: 'on', autoBackupTime: '03:00', autoBackupDays: 'daily', maxBackups: '7' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/admin/backup');
      expect(res.headers.location).toContain('success');
    });

    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .post('/admin/backup/config')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ autoBackup: 'on' });
      expect(res.status).toBe(403);
    });
  });

  // ── POST /export/html/:page (exportPageHtml — error path) ───────────────────

  describe('POST /export/html/:page (exportPageHtml)', () => {
    test('returns 500 when exportPageToHtml throws', async () => {
      mockExportManager.exportPageToHtml.mockRejectedValue(new Error('export failed'));
      const res = await request(app)
        .post('/export/html/TestPage')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(500);
    });

    test('returns 200 (download) when export succeeds', async () => {
      const res = await request(app)
        .post('/export/html/TestPage')
        .set('x-csrf-token', 'test-csrf-token');
      expect([200, 204]).toContain(res.status);
    });
  });

  // ── POST /export/markdown/:page (exportPageMarkdown — error path) ────────────

  describe('POST /export/markdown/:page (exportPageMarkdown)', () => {
    test('returns 500 when exportToMarkdown throws', async () => {
      mockExportManager.exportToMarkdown.mockRejectedValue(new Error('export failed'));
      const res = await request(app)
        .post('/export/markdown/TestPage')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(500);
    });

    test('returns 200 (download) when export succeeds', async () => {
      const res = await request(app)
        .post('/export/markdown/TestPage')
        .set('x-csrf-token', 'test-csrf-token');
      expect([200, 204]).toContain(res.status);
    });
  });
});
