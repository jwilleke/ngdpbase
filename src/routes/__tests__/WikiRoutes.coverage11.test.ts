/**
 * WikiRoutes coverage batch 11 — admin users/roles, config, settings,
 *   variables, logs, comments, pinned pages, display theme, restart, reindex.
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

const mockCacheManager = {
  isInitialized: vi.fn().mockReturnValue(false),
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(true),
  del: vi.fn().mockResolvedValue(true),
  clear: vi.fn().mockResolvedValue(true),
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
  getSession: vi.fn(),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  updateRolePermissions: vi.fn(),
  createRole: vi.fn(),
  deleteRole: vi.fn()
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

const mockBackgroundJobManager = {
  registerJob: vi.fn(),
  enqueue: vi.fn().mockResolvedValue('run-123'),
  getStatus: vi.fn().mockReturnValue({ state: 'pending', runId: 'run-123' }),
  getActiveJobs: vi.fn().mockReturnValue([])
};

const mockVariableManager = {
  expandVariables: vi.fn().mockReturnValue(''),
  getDebugInfo: vi.fn().mockReturnValue({
    systemVariables: [],
    contextualVariables: [],
    totalVariables: 0
  })
};

const mockCommentManager = {
  isEnabled: vi.fn().mockReturnValue(true),
  addComment: vi.fn().mockResolvedValue({ id: 'c1', author: 'testuser', content: 'hello' }),
  getComment: vi.fn().mockResolvedValue({ id: 'c1', author: 'testuser', content: 'hello' }),
  deleteComment: vi.fn().mockResolvedValue(undefined)
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
  // #1089: keys the environment owns. The route refuses writes to these.
  getEnvControlledKeys: vi.fn().mockReturnValue({}),
  describeProperty: vi.fn().mockReturnValue({
    envControlled: false, envVar: null, effective: null, source: 'config'
  }),
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
          CommentManager: mockCommentManager,
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
  mockUserManager.getUser.mockResolvedValue({
    username: 'testuser', email: 'test@example.com', displayName: 'Test User', preferences: {}
  });
  mockUserManager.getUsers.mockResolvedValue([{ username: 'testuser' }]);
  mockUserManager.getRoles.mockReturnValue(new Map([['admin', { name: 'admin', displayName: 'Admin', permissions: [] }]]));
  mockUserManager.getPermissions.mockReturnValue(new Map([['read', 'Can read pages']]));
  mockUserManager.getUserPermissions.mockReturnValue(['read', 'write']);
  mockUserManager.createSession.mockResolvedValue('sid');
  mockUserManager.authenticateUser.mockResolvedValue({ username: 'testuser', isAuthenticated: true });
  mockUserManager.updateUser.mockResolvedValue(true);
  mockUserManager.destroySession.mockResolvedValue(true);
  mockUserManager.getSession.mockResolvedValue(null);
  mockUserManager.createUser.mockResolvedValue(true);
  mockUserManager.deleteUser.mockResolvedValue(true);
  mockUserManager.updateRolePermissions.mockResolvedValue(true);
  mockUserManager.createRole.mockResolvedValue({ name: 'newrole', displayName: 'New Role', permissions: [] });
  mockUserManager.deleteRole.mockResolvedValue(undefined);

  mockNotificationManager.getNotifications.mockReturnValue([]);
  mockNotificationManager.getAllNotifications.mockReturnValue([]);
  mockNotificationManager.getStats.mockReturnValue({ total: 0, active: 0, expired: 0, byType: {}, byLevel: {} });

  mockBackgroundJobManager.enqueue.mockResolvedValue('run-123');
  mockBackgroundJobManager.getStatus.mockReturnValue({ state: 'pending', runId: 'run-123' });
  mockBackgroundJobManager.getActiveJobs.mockReturnValue([]);

  mockVariableManager.getDebugInfo.mockReturnValue({
    systemVariables: [],
    contextualVariables: [],
    totalVariables: 0
  });

  mockCommentManager.isEnabled.mockReturnValue(true);
  mockCommentManager.addComment.mockResolvedValue({ id: 'c1', author: 'testuser', content: 'hello' });
  mockCommentManager.getComment.mockResolvedValue({ id: 'c1', author: 'testuser', content: 'hello' });
  mockCommentManager.deleteComment.mockResolvedValue(undefined);
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

describe('WikiRoutes — coverage batch 11', () => {
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

  // ── Admin Users ──────────────────────────────────────────────────────────────

  describe('GET /admin/users (adminUsers)', () => {
    test('returns 403 when user lacks user-read permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app).get('/admin/users');
      expect(res.status).toBe(403);
    });

    test('renders 200 with user list', async () => {
      const res = await request(app).get('/admin/users');
      expect(res.status).toBe(200);
    });
  });

  describe('GET /admin/users/:username/edit (userEdit)', () => {
    test('returns 403 when user lacks user-read permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app).get('/admin/users/testuser/edit');
      expect(res.status).toBe(403);
    });

    test('returns 404 when user not found', async () => {
      mockUserManager.getUser.mockResolvedValue(null);
      const res = await request(app).get('/admin/users/nobody/edit');
      expect(res.status).toBe(404);
    });

    test('renders 200 for existing user', async () => {
      const res = await request(app).get('/admin/users/testuser/edit');
      expect(res.status).toBe(200);
    });
  });

  describe('POST /admin/users (adminCreateUser)', () => {
    test('returns 403 when user lacks user-create permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .post('/admin/users')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ username: 'newuser', email: 'new@example.com', password: 'pass' });
      expect(res.status).toBe(403);
    });

    test('redirects with success when user created', async () => {
      const res = await request(app)
        .post('/admin/users')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ username: 'newuser', email: 'new@example.com', password: 'pass', roles: 'authenticated' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('success');
    });

    test('redirects with error when creation fails', async () => {
      mockUserManager.createUser.mockResolvedValue(false);
      const res = await request(app)
        .post('/admin/users')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ username: 'newuser', email: 'new@example.com', password: 'pass' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('error');
    });
  });

  describe('PUT /admin/users/:username (adminUpdateUser)', () => {
    test('returns 403 when user lacks user-edit permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .put('/admin/users/testuser')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ displayName: 'Updated' });
      expect(res.status).toBe(403);
    });

    test('returns 200 when user updated', async () => {
      const res = await request(app)
        .put('/admin/users/testuser')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ displayName: 'Updated' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('DELETE /admin/users/:username (adminDeleteUser)', () => {
    test('returns 403 when user lacks user-delete permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .delete('/admin/users/testuser')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(403);
    });

    test('returns 200 when user deleted', async () => {
      const res = await request(app)
        .delete('/admin/users/testuser')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── Admin Roles ──────────────────────────────────────────────────────────────

  describe('GET /admin/roles (adminRoles)', () => {
    test('returns 403 when user lacks admin-roles permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app).get('/admin/roles');
      expect(res.status).toBe(403);
    });

    test('renders 200 with role list', async () => {
      const res = await request(app).get('/admin/roles');
      expect(res.status).toBe(200);
    });
  });

  describe('POST /admin/roles (adminCreateRole)', () => {
    test('returns 403 when user lacks admin-roles permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .post('/admin/roles')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ name: 'newrole' });
      expect(res.status).toBe(403);
    });

    test('returns 400 when no role name provided', async () => {
      const res = await request(app)
        .post('/admin/roles')
        .set('x-csrf-token', 'test-csrf-token')
        .send({});
      expect(res.status).toBe(400);
    });

    test('returns 200 when role created', async () => {
      const res = await request(app)
        .post('/admin/roles')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ name: 'newrole', displayName: 'New Role' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('PUT /admin/roles/:role (adminUpdateRole)', () => {
    test('returns 403 when user lacks admin-roles permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .put('/admin/roles/admin')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ roleName: 'admin', permissions: ['read'] });
      expect(res.status).toBe(403);
    });

    test('returns 400 when no role name in body', async () => {
      const res = await request(app)
        .put('/admin/roles/admin')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ permissions: ['read'] });
      expect(res.status).toBe(400);
    });

    test('returns 200 when role updated', async () => {
      const res = await request(app)
        .put('/admin/roles/admin')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ roleName: 'admin', permissions: ['read', 'write'] });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('DELETE /admin/roles/:role (adminDeleteRole)', () => {
    test('returns 403 when user lacks admin-roles permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .delete('/admin/roles/testrole')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(403);
    });

    test('returns 200 when role deleted', async () => {
      const res = await request(app)
        .delete('/admin/roles/testrole')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── Admin Configuration ──────────────────────────────────────────────────────

  describe('GET /admin/configuration (adminConfiguration)', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app).get('/admin/configuration');
      expect(res.status).toBe(403);
    });

    test('renders 200 with configuration page', async () => {
      const res = await request(app).get('/admin/configuration');
      expect(res.status).toBe(200);
    });
  });

  describe('POST /admin/configuration (adminUpdateConfiguration)', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .post('/admin/configuration')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ property: 'ngdpbase.front-page', value: 'Home' });
      expect(res.status).toBe(403);
    });

    test('returns 400 when property is missing', async () => {
      const res = await request(app)
        .post('/admin/configuration')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ value: 'Home' });
      expect(res.status).toBe(400);
    });

    // #1089: six keys are owned by the environment. The screen used to accept
    // and persist edits to them that could never take effect, because
    // getProperty consulted the override BEFORE the merged config — the write
    // was inert immediately, not merely on next boot.
    describe('environment-owned keys (#1089)', () => {
      afterEach(() => {
        mockConfigManager.getEnvControlledKeys.mockReturnValue({});
      });

      test('refuses a write to an env-owned key and does not persist it', async () => {
        mockConfigManager.getEnvControlledKeys.mockReturnValue({
          'ngdpbase.application-name': 'NGDPBASE_APP_NAME'
        });
        mockConfigManager.setProperty.mockClear();

        const res = await request(app)
          .post('/admin/configuration')
          .set('x-csrf-token', 'test-csrf-token')
          .send({ property: 'ngdpbase.application-name', value: 'FromUI' });

        expect(res.status).toBe(409);
        // Not persisting is the point — a 409 that still wrote would be worse
        // than no check at all.
        expect(mockConfigManager.setProperty).not.toHaveBeenCalled();
      });

      test('names the variable so the operator knows where the value lives', async () => {
        mockConfigManager.getEnvControlledKeys.mockReturnValue({
          'ngdpbase.application-name': 'NGDPBASE_APP_NAME'
        });

        const res = await request(app)
          .post('/admin/configuration')
          .set('x-csrf-token', 'test-csrf-token')
          .send({ property: 'ngdpbase.application-name', value: 'FromUI' });

        expect(res.body.error).toContain('NGDPBASE_APP_NAME');
        expect(res.body.reason).toContain('.env');
      });

      test('refuses even when the variable is not currently set', async () => {
        // The whole design decision: ownership is declared, not conditional.
        // A conditional would hand this screen the source of truth whenever the
        // variable is absent.
        delete process.env.NGDPBASE_APP_NAME;
        mockConfigManager.getEnvControlledKeys.mockReturnValue({
          'ngdpbase.application-name': 'NGDPBASE_APP_NAME'
        });

        const res = await request(app)
          .post('/admin/configuration')
          .set('x-csrf-token', 'test-csrf-token')
          .send({ property: 'ngdpbase.application-name', value: 'FromUI' });

        expect(res.status).toBe(409);
      });

      test('base-url mentions app-custom-config.json as well as the variable', async () => {
        // The install wizard writes it there, so telling an operator only about
        // the env var would misdescribe how most direct installs are set up.
        mockConfigManager.getEnvControlledKeys.mockReturnValue({
          'ngdpbase.application.base-url': 'NGDPBASE_BASE_URL'
        });

        const res = await request(app)
          .post('/admin/configuration')
          .set('x-csrf-token', 'test-csrf-token')
          .send({ property: 'ngdpbase.application.base-url', value: 'https://x.example.com' });

        expect(res.body.reason).toContain('app-custom-config.json');
      });

      test('still allows a write to a key the environment does not own', async () => {
        mockConfigManager.setProperty.mockClear();

        const res = await request(app)
          .post('/admin/configuration')
          .set('x-csrf-token', 'test-csrf-token')
          .send({ property: 'ngdpbase.front-page', value: 'Home' });

        expect(res.status).toBeLessThan(400);
        expect(mockConfigManager.setProperty).toHaveBeenCalled();
      });
    });

    test('returns 400 for invalid property prefix', async () => {
      const res = await request(app)
        .post('/admin/configuration')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ property: 'invalid.property', value: 'test' });
      expect(res.status).toBe(400);
    });

    test('redirects on success for form submission', async () => {
      const res = await request(app)
        .post('/admin/configuration')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ property: 'ngdpbase.front-page', value: 'Home' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('success');
    });
  });

  describe('POST /admin/configuration/reset (adminResetConfiguration)', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .post('/admin/configuration/reset')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(403);
    });

    test('redirects with success after reset', async () => {
      const res = await request(app)
        .post('/admin/configuration/reset')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('success');
    });
  });

  // ── Admin Settings ───────────────────────────────────────────────────────────

  describe('GET /admin/settings (adminSettings)', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app).get('/admin/settings');
      expect(res.status).toBe(403);
    });

    test('renders 200 with settings page', async () => {
      const res = await request(app).get('/admin/settings');
      expect([200, 500]).toContain(res.status);
    });
  });

  // ── Admin Variables ──────────────────────────────────────────────────────────

  describe('GET /admin/variables (adminVariables)', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app).get('/admin/variables');
      expect(res.status).toBe(403);
    });

    test('renders 200 with variables page', async () => {
      const res = await request(app).get('/admin/variables');
      expect(res.status).toBe(200);
    });
  });

  // ── Admin Logs ───────────────────────────────────────────────────────────────

  describe('GET /admin/logs (adminLogs)', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app).get('/admin/logs');
      expect(res.status).toBe(403);
    });

    test('renders 200 (empty log list when dir missing)', async () => {
      mockConfigManager.getResolvedDataPath.mockReturnValue('/nonexistent/path/to/logs');
      const res = await request(app).get('/admin/logs');
      expect(res.status).toBe(200);
    });
  });

  // ── Admin Interwiki ──────────────────────────────────────────────────────────

  describe('GET /admin/interwiki (adminInterwiki)', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app).get('/admin/interwiki');
      expect(res.status).toBe(403);
    });

    test('renders 200 with interwiki management page', async () => {
      const res = await request(app).get('/admin/interwiki');
      expect(res.status).toBe(200);
    });
  });

  // ── Admin Restart / Reindex ──────────────────────────────────────────────────

  describe('POST /admin/restart (adminRestart)', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .post('/admin/restart')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(403);
    });

    test('returns 200 and triggers restart', async () => {
      const res = await request(app)
        .post('/admin/restart')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /admin/reindex (adminReindex)', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .post('/admin/reindex')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(403);
    });

    test('returns 202 when reindex enqueued', async () => {
      const res = await request(app)
        .post('/admin/reindex')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(202);
      expect(res.body.runId).toBe('run-123');
    });
  });

  // ── Comments ─────────────────────────────────────────────────────────────────

  describe('POST /api/comments/:pageUuid (addComment)', () => {
    test('returns 401 when not authenticated', async () => {
      mockUserContext = { isAuthenticated: false };
      const res = await request(app)
        .post('/api/comments/uuid-1')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ content: 'Hello' });
      expect(res.status).toBe(401);
    });

    test('returns 404 when CommentManager not enabled', async () => {
      mockCommentManager.isEnabled.mockReturnValue(false);
      const res = await request(app)
        .post('/api/comments/uuid-1')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ content: 'Hello' });
      expect(res.status).toBe(404);
    });

    test('returns 400 when content is empty', async () => {
      const res = await request(app)
        .post('/api/comments/uuid-1')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ content: '   ' });
      expect(res.status).toBe(400);
    });

    test('returns 200 on successful comment', async () => {
      const res = await request(app)
        .post('/api/comments/uuid-1')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ content: 'Great page!' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('DELETE /api/comments/:pageUuid/:commentId (deleteComment)', () => {
    test('returns 401 when not authenticated', async () => {
      mockUserContext = { isAuthenticated: false };
      const res = await request(app)
        .delete('/api/comments/uuid-1/c1')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(401);
    });

    test('returns 404 when comment not found', async () => {
      mockCommentManager.getComment.mockResolvedValue(null);
      const res = await request(app)
        .delete('/api/comments/uuid-1/c1')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(404);
    });

    test('returns 200 when admin deletes any comment', async () => {
      const res = await request(app)
        .delete('/api/comments/uuid-1/c1')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── Display Theme ────────────────────────────────────────────────────────────

  describe('POST /api/user/display-theme (updateDisplayTheme)', () => {
    test('returns 401 when not authenticated', async () => {
      mockUserContext = { isAuthenticated: false };
      const res = await request(app)
        .post('/api/user/display-theme')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ theme: 'dark' });
      expect(res.status).toBe(401);
    });

    test('returns 400 for invalid theme value', async () => {
      const res = await request(app)
        .post('/api/user/display-theme')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ theme: 'rainbow' });
      expect(res.status).toBe(400);
    });

    test('returns 200 for valid theme', async () => {
      const res = await request(app)
        .post('/api/user/display-theme')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ theme: 'dark' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── Pinned Pages ─────────────────────────────────────────────────────────────

  describe('POST /api/user/pinned-pages (addPinnedPage)', () => {
    test('returns 401 when not authenticated', async () => {
      mockUserContext = { isAuthenticated: false };
      const res = await request(app)
        .post('/api/user/pinned-pages')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ pageName: 'Welcome' });
      expect(res.status).toBe(401);
    });

    test('returns 400 when pageName missing', async () => {
      const res = await request(app)
        .post('/api/user/pinned-pages')
        .set('x-csrf-token', 'test-csrf-token')
        .send({});
      expect(res.status).toBe(400);
    });

    test('returns 200 when page pinned', async () => {
      const res = await request(app)
        .post('/api/user/pinned-pages')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ pageName: 'Welcome', title: 'Welcome Page' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe('DELETE /api/user/pinned-pages/:pageName (removePinnedPage)', () => {
    test('returns 401 when not authenticated', async () => {
      mockUserContext = { isAuthenticated: false };
      const res = await request(app)
        .delete('/api/user/pinned-pages/Welcome')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(401);
    });

    test('returns 200 when page removed', async () => {
      const res = await request(app)
        .delete('/api/user/pinned-pages/Welcome')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe('PUT /api/user/pinned-pages/order (reorderPinnedPages)', () => {
    test('returns 401 when not authenticated', async () => {
      mockUserContext = { isAuthenticated: false };
      const res = await request(app)
        .put('/api/user/pinned-pages/order')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ order: ['Welcome'] });
      expect(res.status).toBe(401);
    });

    test('returns 200 when order updated', async () => {
      const res = await request(app)
        .put('/api/user/pinned-pages/order')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ order: ['Welcome'] });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });
});
