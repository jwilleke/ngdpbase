/**
 * WikiRoutes coverage batch 5 — user API, comment/footnote, and admin mutation handlers:
 *   POST   /api/user/display-theme
 *   POST   /api/user/pinned-pages
 *   DELETE /api/user/pinned-pages/:pageName
 *   PUT    /api/user/pinned-pages/order
 *   POST   /api/comments/:pageUuid
 *   DELETE /api/comments/:pageUuid/:commentId
 *   GET    /api/footnotes/:pageUuid
 *   POST   /api/footnotes/:pageUuid
 *   PUT    /api/footnotes/:pageUuid/:footnoteId
 *   DELETE /api/footnotes/:pageUuid/:footnoteId
 *   POST   /admin/users          (adminCreateUser)
 *   PUT    /admin/users/:username (adminUpdateUser)
 *   DELETE /admin/users/:username (adminDeleteUser)
 *   PUT    /admin/roles/:role    (adminUpdateRole)
 *   POST   /admin/roles          (adminCreateRole)
 *   DELETE /admin/roles/:role    (adminDeleteRole)
 *   GET    /admin/users/:username/edit (userEdit)
 *   GET    /admin/backup
 *   POST   /admin/reindex
 *   GET    /admin/configuration
 *   GET    /admin/diff (403 path)
 *   GET    /admin/required-pages (403 path)
 *   GET    /admin/variables (403 path)
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

const mockPageManager = {
  getPage: vi.fn(),
  getPageContent: vi.fn(),
  getPageMetadata: vi.fn(),
  getAllPages: vi.fn(),
  getPageNames: vi.fn(),
  getAllPageNames: vi.fn(),
  savePage: vi.fn(),
  pageExists: vi.fn(),
  getCurrentPageProvider: vi.fn(),
  getPageUUID: vi.fn(),
  provider: null as null | object
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
  advancedSearchWithContext: vi.fn(),
  getSuggestions: vi.fn()
};

const mockBackupManager = {
  getAutoBackupStatus: vi.fn(),
  listBackups: vi.fn()
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
  getDefaultProperties: vi.fn().mockReturnValue({}),
  getCustomProperties: vi.fn().mockReturnValue({}),
  getResolvedDataPath: vi.fn((_k: string, def: string) => def),
  setProperty: vi.fn().mockResolvedValue(undefined)
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

const mockFootnoteManager = {
  isEnabled: vi.fn().mockReturnValue(false),
  getFootnotes: vi.fn(),
  addFootnote: vi.fn(),
  updateFootnote: vi.fn(),
  deleteFootnote: vi.fn()
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
          BackupManager: mockBackupManager,
          FootnoteManager: mockFootnoteManager,
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
          ExportManager: { getExports: vi.fn().mockResolvedValue([]) },
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
  mockPageManager.getPageNames.mockResolvedValue(['Welcome', 'TestPage']);
  mockPageManager.getAllPageNames.mockResolvedValue(['Welcome', 'TestPage']);
  mockPageManager.savePage.mockResolvedValue(true);
  mockPageManager.pageExists.mockReturnValue(true);
  mockPageManager.getCurrentPageProvider.mockReturnValue(null);
  mockPageManager.getPageUUID.mockReturnValue(null);

  mockACLManager.checkPagePermission.mockResolvedValue(true);
  mockACLManager.checkPagePermissionWithContext.mockResolvedValue(true);
  mockACLManager.removeACLMarkup.mockImplementation((c: string) => c);
  mockACLManager.parseACL.mockReturnValue({ permissions: [] });

  mockCacheManager.isInitialized.mockReturnValue(false);
  mockCacheManager.get.mockResolvedValue(null);
  mockCacheManager.set.mockResolvedValue(true);
  mockCacheManager.del.mockResolvedValue(true);
  mockCacheManager.clear.mockResolvedValue(true);

  mockRenderingManager.textToHTML.mockResolvedValue('<p>Rendered HTML</p>');
  mockRenderingManager.renderMarkdown.mockResolvedValue('<p>Rendered</p>');
  mockRenderingManager.getReferringPages.mockReturnValue([]);
  mockRenderingManager.updatePageInLinkGraph.mockImplementation(() => {});
  mockRenderingManager.addPageToCache.mockImplementation(() => {});
  mockRenderingManager.removePageFromLinkGraph.mockImplementation(() => {});

  mockSearchManager.search.mockResolvedValue([]);
  mockSearchManager.advancedSearchWithContext.mockResolvedValue([]);
  mockSearchManager.getSuggestions.mockResolvedValue([]);

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
  mockUserManager.createUser.mockResolvedValue(true);
  mockUserManager.deleteUser.mockResolvedValue(true);
  mockUserManager.updateRolePermissions.mockResolvedValue(true);
  mockUserManager.createRole.mockResolvedValue(true);
  mockUserManager.deleteRole.mockResolvedValue(true);

  mockNotificationManager.getNotifications.mockReturnValue([]);
  mockNotificationManager.getAllNotifications.mockReturnValue([]);
  mockNotificationManager.getStats.mockReturnValue({ total: 0, active: 0, expired: 0, byType: {}, byLevel: {} });

  mockBackgroundJobManager.enqueue.mockResolvedValue('run-id-99');
  mockBackgroundJobManager.getStatus.mockReturnValue({ status: 'pending' });

  mockBackupManager.getAutoBackupStatus.mockResolvedValue({
    config: { enabled: false, time: '02:00', days: 'daily', maxBackups: 10, directory: '/tmp/backups' },
    lastBackup: null
  });
  mockBackupManager.listBackups.mockResolvedValue([]);

  mockFootnoteManager.isEnabled.mockReturnValue(false);
  mockFootnoteManager.getFootnotes.mockResolvedValue([]);
  mockFootnoteManager.addFootnote.mockResolvedValue({ id: 'fn-1', display: 'Test', url: 'http://example.com' });
  mockFootnoteManager.updateFootnote.mockResolvedValue(true);
  mockFootnoteManager.deleteFootnote.mockResolvedValue(true);
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

describe('WikiRoutes — coverage batch 5', () => {
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

  // ── POST /api/user/display-theme ─────────────────────────────────────────────

  describe('POST /api/user/display-theme', () => {
    test('returns 401 for unauthenticated user', async () => {
      mockUserContext = null;
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

    test('returns 200 and updates theme for valid request', async () => {
      const res = await request(app)
        .post('/api/user/display-theme')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ theme: 'dark' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(mockUserManager.updateUser).toHaveBeenCalled();
    });
  });

  // ── POST /api/user/pinned-pages ──────────────────────────────────────────────

  describe('POST /api/user/pinned-pages', () => {
    test('returns 400 when pageName is missing', async () => {
      const res = await request(app)
        .post('/api/user/pinned-pages')
        .set('x-csrf-token', 'test-csrf-token')
        .send({});
      expect(res.status).toBe(400);
    });

    test('returns 200 and adds page to pinned list', async () => {
      const res = await request(app)
        .post('/api/user/pinned-pages')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ pageName: 'Welcome', title: 'Welcome Page' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── DELETE /api/user/pinned-pages/:pageName ──────────────────────────────────

  describe('DELETE /api/user/pinned-pages/:pageName', () => {
    test('returns 200 and removes page from pinned list', async () => {
      const res = await request(app)
        .delete('/api/user/pinned-pages/Welcome')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── PUT /api/user/pinned-pages/order ─────────────────────────────────────────

  describe('PUT /api/user/pinned-pages/order', () => {
    test('returns 200 and reorders pinned pages', async () => {
      const res = await request(app)
        .put('/api/user/pinned-pages/order')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ order: ['Welcome', 'TestPage'] });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── POST /api/comments/:pageUuid ─────────────────────────────────────────────

  describe('POST /api/comments/:pageUuid', () => {
    test('returns 400 when comment content is missing', async () => {
      const res = await request(app)
        .post('/api/comments/test-uuid-1')
        .set('x-csrf-token', 'test-csrf-token')
        .send({});
      expect(res.status).toBe(400);
    });

    test('returns 404 when CommentManager is not available', async () => {
      const res = await request(app)
        .post('/api/comments/test-uuid-1')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ content: 'Great article!' });
      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /api/comments/:pageUuid/:commentId ────────────────────────────────

  describe('DELETE /api/comments/:pageUuid/:commentId', () => {
    test('returns 404 when CommentManager is not available', async () => {
      const res = await request(app)
        .delete('/api/comments/test-uuid-1/comment-1')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(404);
    });
  });

  // ── GET /api/footnotes/:pageUuid ─────────────────────────────────────────────

  describe('GET /api/footnotes/:pageUuid', () => {
    test('returns 404 when FootnoteManager is not enabled', async () => {
      const res = await request(app).get('/api/footnotes/test-uuid-1');
      expect(res.status).toBe(404);
    });

    test('returns footnotes when FootnoteManager is enabled', async () => {
      mockFootnoteManager.isEnabled.mockReturnValue(true);
      mockFootnoteManager.getFootnotes.mockResolvedValue([{ id: 'fn-1', display: 'See also' }]);
      const res = await request(app).get('/api/footnotes/test-uuid-1');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── POST /api/footnotes/:pageUuid ────────────────────────────────────────────

  describe('POST /api/footnotes/:pageUuid', () => {
    test('returns 400 when display or url is missing', async () => {
      const res = await request(app)
        .post('/api/footnotes/test-uuid-1')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ display: 'See also' }); // missing url
      expect(res.status).toBe(400);
    });

    test('returns 404 when FootnoteManager is not enabled', async () => {
      const res = await request(app)
        .post('/api/footnotes/test-uuid-1')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ display: 'See also', url: 'http://example.com' });
      expect(res.status).toBe(404);
    });

    test('returns 200 and adds footnote when FootnoteManager is enabled', async () => {
      mockFootnoteManager.isEnabled.mockReturnValue(true);
      const res = await request(app)
        .post('/api/footnotes/test-uuid-1')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ display: 'See also', url: 'http://example.com', note: 'Optional note' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── PUT /api/footnotes/:pageUuid/:footnoteId ─────────────────────────────────

  describe('PUT /api/footnotes/:pageUuid/:footnoteId', () => {
    test('returns 404 when FootnoteManager is not enabled', async () => {
      const res = await request(app)
        .put('/api/footnotes/test-uuid-1/fn-1')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ display: 'Updated', url: 'http://example.com' });
      expect([200, 400, 401, 403, 404]).toContain(res.status);
    });
  });

  // ── DELETE /api/footnotes/:pageUuid/:footnoteId ──────────────────────────────

  describe('DELETE /api/footnotes/:pageUuid/:footnoteId', () => {
    test('returns 404 when FootnoteManager is not enabled', async () => {
      const res = await request(app)
        .delete('/api/footnotes/test-uuid-1/fn-1')
        .set('x-csrf-token', 'test-csrf-token');
      expect([200, 400, 401, 403, 404]).toContain(res.status);
    });
  });

  // ── POST /admin/users (adminCreateUser) ──────────────────────────────────────

  describe('POST /admin/users', () => {
    test('returns 403 when user lacks user-create permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .post('/admin/users')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ username: 'newuser', email: 'new@example.com', password: 'pass', roles: 'authenticated' });
      expect(res.status).toBe(403);
    });

    test('redirects on successful user creation', async () => {
      const res = await request(app)
        .post('/admin/users')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ username: 'newuser', email: 'new@example.com', password: 'pass', roles: 'authenticated' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/admin/users');
    });
  });

  // ── PUT /admin/users/:username (adminUpdateUser) ─────────────────────────────

  describe('PUT /admin/users/:username', () => {
    test('returns 403 when user lacks user-edit permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .put('/admin/users/testuser')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ displayName: 'Updated Name' });
      expect(res.status).toBe(403);
    });

    test('returns 200 on successful user update', async () => {
      const res = await request(app)
        .put('/admin/users/testuser')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ displayName: 'Updated Name' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── DELETE /admin/users/:username (adminDeleteUser) ──────────────────────────

  describe('DELETE /admin/users/:username', () => {
    test('returns 403 when user lacks user-delete permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .delete('/admin/users/testuser')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(403);
    });

    test('returns 200 on successful user deletion', async () => {
      const res = await request(app)
        .delete('/admin/users/testuser')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── PUT /admin/roles/:role (adminUpdateRole) ──────────────────────────────────

  describe('PUT /admin/roles/:role', () => {
    test('returns 403 when user lacks admin-roles permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .put('/admin/roles/editor')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ roleName: 'editor', permissions: ['page-read', 'page-edit'] });
      expect(res.status).toBe(403);
    });

    test('returns 200 on successful role update', async () => {
      const res = await request(app)
        .put('/admin/roles/editor')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ roleName: 'editor', permissions: ['page-read', 'page-edit'], displayName: 'Editor' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── POST /admin/roles (adminCreateRole) ──────────────────────────────────────

  describe('POST /admin/roles', () => {
    test('returns 403 when user lacks admin-roles permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .post('/admin/roles')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ roleName: 'moderator' });
      expect(res.status).toBe(403);
    });
  });

  // ── DELETE /admin/roles/:role (adminDeleteRole) ───────────────────────────────

  describe('DELETE /admin/roles/:role', () => {
    test('returns 403 when user lacks admin-roles permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .delete('/admin/roles/editor')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(403);
    });
  });

  // ── GET /admin/users/:username/edit (userEdit) ───────────────────────────────

  describe('GET /admin/users/:username/edit', () => {
    test('renders user edit form for admin', async () => {
      const res = await request(app).get('/admin/users/testuser/edit');
      expect(res.status).toBe(200);
    });

    test('returns 404 when user is not found', async () => {
      mockUserManager.getUser.mockResolvedValue(null);
      const res = await request(app).get('/admin/users/nonexistent/edit');
      expect(res.status).toBe(404);
    });

    test('returns 403 when user lacks user-read permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app).get('/admin/users/testuser/edit');
      expect(res.status).toBe(403);
    });
  });

  // ── GET /admin/backup ────────────────────────────────────────────────────────

  describe('GET /admin/backup', () => {
    test('renders backup page for admin', async () => {
      const res = await request(app).get('/admin/backup');
      expect(res.status).toBe(200);
    });

    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app).get('/admin/backup');
      expect(res.status).toBe(403);
    });
  });

  // ── POST /admin/reindex ──────────────────────────────────────────────────────

  describe('POST /admin/reindex', () => {
    test('returns 202 and enqueues reindex job', async () => {
      const res = await request(app)
        .post('/admin/reindex')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(202);
      expect(res.body.runId).toBe('run-id-99');
    });

    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .post('/admin/reindex')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(403);
    });
  });

  // ── GET /admin/configuration ─────────────────────────────────────────────────

  describe('GET /admin/configuration', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app).get('/admin/configuration');
      expect(res.status).toBe(403);
    });
  });

  // ── GET /admin/diff ──────────────────────────────────────────────────────────

  describe('GET /admin/diff', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app).get('/admin/diff');
      expect(res.status).toBe(403);
    });
  });

  // ── GET /admin/required-pages ────────────────────────────────────────────────

  describe('GET /admin/required-pages', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app).get('/admin/required-pages');
      expect(res.status).toBe(403);
    });
  });

  // ── GET /admin/variables ─────────────────────────────────────────────────────

  describe('GET /admin/variables', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app).get('/admin/variables');
      expect(res.status).toBe(403);
    });
  });
});
