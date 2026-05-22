/**
 * WikiRoutes coverage batch 2 — handlers not yet exercised:
 *   editPage     : unauthenticated, ACL denied, author-lock, new-page no-permission, success
 *   processLogin : auth failure, success
 *   processRegister: missing fields, password mismatch, short password, success
 *   updateProfile  : unauthenticated, wrong current password, password too short,
 *                    password mismatch, external-user password block, success
 *   updatePreferences: unauthenticated, success
 *   addComment   : all branches
 *   deleteComment: all branches
 *   userInfo     : authenticated, anonymous
 *   getPageMetadata : not found, success
 *   getPageSuggestions: short query, matching query
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
      mockUserManager
    });
  });
  (MockWikiContext as unknown as { CONTEXT: typeof MOCK_WIKI_CONTEXT_CONSTANTS }).CONTEXT = MOCK_WIKI_CONTEXT_CONSTANTS;
  return { default: MockWikiContext };
});

// ── mock manager objects (implementations reset in beforeEach) ────────────────

const mockAuthManager = {
  authenticate: vi.fn()
};

const mockCommentManager = {
  isEnabled: vi.fn(),
  addComment: vi.fn(),
  getComment: vi.fn(),
  deleteComment: vi.fn()
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
  // #714 Slice F rich-return form. Tests can override per-scenario to
  // surface specific reasons (e.g. `author_lock_deny`).
  evaluatePagePermission: vi.fn(),
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
  getSuggestions: vi.fn(),
  getPageSystemKeywords: vi.fn()
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
  createUser: vi.fn(),
  updateUser: vi.fn(),
  destroySession: vi.fn(),
  getSession: vi.fn()
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
          AuthManager: mockAuthManager,
          CommentManager: mockCommentManager,
          NotificationManager: {
            getNotifications: vi.fn().mockReturnValue([]),
            getAllNotifications: vi.fn().mockReturnValue([]),
            getStats: vi.fn().mockReturnValue({ total: 0, active: 0, expired: 0, byType: {}, byLevel: {} })
          },
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
          TemplateManager: { getTemplates: vi.fn().mockResolvedValue([]), applyTemplate: vi.fn().mockResolvedValue('') },
          ExportManager: { getExports: vi.fn().mockResolvedValue([]) },
          VariableManager: { expandVariables: vi.fn().mockReturnValue('') },
          BackgroundJobManager: { registerJob: vi.fn(), enqueue: vi.fn().mockResolvedValue('run-id'), getStatus: vi.fn().mockReturnValue(null), getActiveJobs: vi.fn().mockReturnValue([]) },
          SchemaManager: { getPerson: vi.fn().mockResolvedValue(null), getOrganization: vi.fn().mockResolvedValue(null) }
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
  mockPageManager.getPage.mockImplementation((name: string) => {
    if (['LeftMenu', 'Footer', 'left-menu-content'].includes(name)) return Promise.resolve(null);
    return Promise.resolve(existingPage);
  });
  mockPageManager.getPageContent.mockResolvedValue('# Page content');
  mockPageManager.getPageMetadata.mockResolvedValue({ title: 'TestPage', uuid: 'test-uuid-1', 'system-category': 'general' });
  mockPageManager.getAllPages.mockResolvedValue(['Welcome', 'TestPage', 'AnotherPage']);
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

  mockACLManager.checkPagePermission.mockResolvedValue(true);
  mockACLManager.checkPagePermissionWithContext.mockResolvedValue(true);
  mockACLManager.removeACLMarkup.mockImplementation((c: string) => c);
  mockACLManager.parseACL.mockReturnValue({ permissions: [] });

  mockCacheManager.isInitialized.mockReturnValue(true);
  mockCacheManager.get.mockResolvedValue(null);
  mockCacheManager.set.mockResolvedValue(true);
  mockCacheManager.del.mockResolvedValue(true);
  mockCacheManager.clear.mockResolvedValue(true);

  mockRenderingManager.textToHTML.mockResolvedValue('<p>Rendered HTML</p>');
  mockRenderingManager.getReferringPages.mockReturnValue([]);
  mockRenderingManager.updatePageInLinkGraph.mockImplementation(() => {});
  mockRenderingManager.addPageToCache.mockImplementation(() => {});
  mockRenderingManager.removePageFromLinkGraph.mockImplementation(() => {});
  mockRenderingManager.rebuildLinkGraph.mockResolvedValue(true);

  mockSearchManager.search.mockResolvedValue([]);
  mockSearchManager.advancedSearch.mockResolvedValue([]);
  mockSearchManager.advancedSearchWithContext.mockResolvedValue([]);
  mockSearchManager.searchByCategories.mockResolvedValue([]);
  mockSearchManager.searchByCategory.mockResolvedValue([]);
  mockSearchManager.searchByUserKeywordsList.mockResolvedValue([]);
  mockSearchManager.searchByUserKeywords.mockResolvedValue([]);
  mockSearchManager.searchBySystemKeywordsList.mockResolvedValue([]);
  mockSearchManager.getAllDocuments.mockResolvedValue([]);
  mockSearchManager.getAllCategories.mockResolvedValue([]);
  mockSearchManager.getAllUserKeywords.mockResolvedValue([]);
  mockSearchManager.rebuildIndex.mockResolvedValue(true);
  mockSearchManager.updatePageInIndex.mockResolvedValue(true);
  mockSearchManager.removePageFromIndex.mockResolvedValue(true);
  mockSearchManager.getSuggestions.mockResolvedValue([]);
  mockSearchManager.getPageSystemKeywords.mockResolvedValue([]);

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
  mockUserManager.createUser.mockResolvedValue(true);
  mockUserManager.updateUser.mockResolvedValue(true);
  mockUserManager.destroySession.mockResolvedValue(true);
  mockUserManager.getSession.mockResolvedValue(null);

  mockAuthManager.authenticate.mockResolvedValue({ success: true, username: 'testuser' });

  mockCommentManager.isEnabled.mockReturnValue(true);
  mockCommentManager.addComment.mockResolvedValue({ id: 'c-1', content: 'Hello', author: 'testuser' });
  mockCommentManager.getComment.mockResolvedValue({ id: 'c-1', content: 'Hello', author: 'testuser' });
  mockCommentManager.deleteComment.mockResolvedValue(true);
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '../views'));

  app.use((_req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.render = (_view: string, _data: unknown, cb?: (err: Error | null, str?: string) => void) => {
      if (cb) cb(null, '<html>stub</html>');
      else res.send('<html>stub</html>');
    };
    next();
  });

  app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const sess: Record<string, unknown> = {
      csrfToken: 'test-csrf-token',
      user: mockUserContext ? { username: mockUserContext.username } : null,
      destroy: (cb: () => void) => cb?.(),
      save: (cb: (err?: unknown) => void) => cb?.()
    };
    (req as unknown as Record<string, unknown>).session = sess;
    (req as unknown as Record<string, unknown>).userContext = mockUserContext;
    (req as unknown as Record<string, unknown>).cookies = {};
    next();
  });

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

describe('WikiRoutes — coverage batch 2', () => {
  let app: express.Application;
  let wikiRoutes: WikiRoutes;

  beforeEach(async () => {
    mockUserContext = { username: 'testuser', displayName: 'Test User', email: 'test@example.com', isAuthenticated: true, roles: ['authenticated', 'All'] };
    resetMocks();
    app = buildApp();
    const { default: WikiEngine } = await import('../../WikiEngine');
    const engine = new WikiEngine();
    wikiRoutes = new WikiRoutes(engine as unknown as Parameters<typeof WikiRoutes>[0]);
    wikiRoutes.registerRoutes(app);
  });

  afterEach(() => { vi.clearAllMocks(); });

  // ── editPage ──────────────────────────────────────────────────────────────

  describe('GET /edit/:page — editPage', () => {
    test('redirects unauthenticated user to login', async () => {
      mockUserContext = null;

      const res = await request(app).get('/edit/TestPage');

      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/\/login/);
    });

    test('returns 403 when ACL edit check fails', async () => {
      mockACLManager.checkPagePermissionWithContext.mockResolvedValue(false);
      // #714 Slice F: editPage prefers evaluatePagePermission; mirror
      // the deny in the rich-return shape.
      mockACLManager.evaluatePagePermission.mockResolvedValue({ allowed: false, reason: 'default_deny' });

      const res = await request(app).get('/edit/TestPage');

      expect(res.status).toBe(403);
    });

    test('returns 403 when page is author-locked and user is neither author nor admin', async () => {
      mockUserContext = { username: 'otheruser', displayName: 'Other', email: 'other@x.com', isAuthenticated: true, roles: ['authenticated'] };
      mockPageManager.getPage.mockImplementation((name: string) => {
        if (['LeftMenu', 'Footer', 'left-menu-content'].includes(name)) return Promise.resolve(null);
        return Promise.resolve({
          content: '# Page',
          metadata: { title: 'TestPage', 'system-category': 'general', uuid: 'test-uuid-1', author: 'testuser', 'author-lock': true }
        });
      });
      // #714 Slice F: deny via the rich-return form with the
      // `author_lock_deny` reason — the route consumes it to render
      // the specific "This page is author-locked..." 403.
      mockACLManager.checkPagePermissionWithContext.mockResolvedValue(false);
      mockACLManager.evaluatePagePermission.mockResolvedValue({
        allowed: false,
        reason: 'author_lock_deny'
      });

      const res = await request(app).get('/edit/TestPage');

      expect(res.status).toBe(403);
    });

    test('returns 403 when new page requires page-create permission and user lacks it', async () => {
      mockPageManager.getPage.mockImplementation((name: string) => {
        if (['LeftMenu', 'Footer', 'left-menu-content'].includes(name)) return Promise.resolve(null);
        return Promise.resolve(null); // page does not exist
      });
      mockPageManager.getPageMetadata.mockResolvedValue(null); // not a required page
      mockUserManager.hasPermission.mockImplementation((_username: string, perm: string) => {
        if (perm === 'page-create') return Promise.resolve(false);
        return Promise.resolve(true);
      });

      const res = await request(app).get('/edit/NewPage');

      expect(res.status).toBe(403);
    });

    test('returns 200 for authorised edit of existing page', async () => {
      mockACLManager.checkPagePermissionWithContext.mockResolvedValue(true);
      // #714 Slice F: also surface allow via the rich-return form.
      mockACLManager.evaluatePagePermission.mockResolvedValue({ allowed: true, reason: 'legacy_allow' });

      const res = await request(app).get('/edit/TestPage');

      expect(res.status).toBe(200);
    });
  });

  // ── processLogin ──────────────────────────────────────────────────────────

  describe('POST /login — processLogin', () => {
    const csrf = 'test-csrf-token';

    test('redirects to /login?error on auth failure', async () => {
      mockAuthManager.authenticate.mockResolvedValue({ success: false });

      const res = await request(app)
        .post('/login')
        .send({ username: 'bad', password: 'bad', _csrf: csrf });

      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/\/login\?error/);
    });

    test('redirects to / on success', async () => {
      mockUserManager.authenticateUser.mockResolvedValue({ username: 'testuser', isAuthenticated: true });

      const res = await request(app)
        .post('/login')
        .send({ username: 'testuser', password: 'pass', _csrf: csrf });

      expect(res.status).toBe(302);
      expect(res.headers.location).not.toMatch(/error/);
    });
  });

  // ── processRegister ───────────────────────────────────────────────────────

  describe('POST /register — processRegister', () => {
    const csrf = 'test-csrf-token';

    test('redirects with error when required fields are missing', async () => {
      const res = await request(app)
        .post('/register')
        .send({ username: '', email: '', password: '', _csrf: csrf });

      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/error=All(%20|\+)fields(%20|\+)are(%20|\+)required/i);
    });

    test('redirects with error when passwords do not match', async () => {
      const res = await request(app)
        .post('/register')
        .send({ username: 'newuser', email: 'new@x.com', password: 'pass123', confirmPassword: 'different', _csrf: csrf });

      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/error/);
    });

    test('redirects with error when password is too short', async () => {
      const res = await request(app)
        .post('/register')
        .send({ username: 'newuser', email: 'new@x.com', password: 'abc', confirmPassword: 'abc', _csrf: csrf });

      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/error/);
    });

    test('redirects to login on successful registration', async () => {
      mockUserManager.createUser.mockResolvedValue(true);

      const res = await request(app)
        .post('/register')
        .send({ username: 'newuser', email: 'new@x.com', password: 'pass123', confirmPassword: 'pass123', _csrf: csrf });

      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/\/login\?success/);
    });
  });

  // ── registration disabled (ngdpbase.application.registration: false) ─────

  describe('/register — when registration is disabled', () => {
    const originalGetProperty = mockConfigManager.getProperty.getMockImplementation();

    beforeEach(() => {
      mockConfigManager.getProperty.mockImplementation((key: string, defaultValue: unknown) => {
        if (key === 'ngdpbase.application.registration') return false;
        return originalGetProperty?.(key, defaultValue);
      });
    });

    afterEach(() => {
      if (originalGetProperty) {
        mockConfigManager.getProperty.mockImplementation(originalGetProperty);
      }
    });

    test('GET /register returns 404', async () => {
      const res = await request(app).get('/register');
      expect(res.status).toBe(404);
    });

    test('POST /register returns 404 without inspecting body', async () => {
      // Registration-disabled gate runs before any body validation, so no
      // password fixture is needed (and avoiding one keeps secret-scanners
      // happy — registration is closed; the handler never reaches the
      // userManager.createUser() call).
      const res = await request(app)
        .post('/register')
        .send({ _csrf: 'test-csrf-token' });
      expect(res.status).toBe(404);
    });
  });

  // ── updateProfile ─────────────────────────────────────────────────────────

  describe('POST /profile — updateProfile', () => {
    const csrf = 'test-csrf-token';

    test('redirects unauthenticated user to login', async () => {
      mockUserContext = null;

      const res = await request(app)
        .post('/profile')
        .send({ displayName: 'New Name', _csrf: csrf });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/login');
    });

    test('redirects with error when current password is missing for password change', async () => {
      const res = await request(app)
        .post('/profile')
        .send({ newPassword: 'newpass123', _csrf: csrf });

      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/error/);
    });

    test('redirects with error when new passwords do not match', async () => {
      const res = await request(app)
        .post('/profile')
        .send({ currentPassword: 'old', newPassword: 'newpass1', confirmPassword: 'newpass2', _csrf: csrf });

      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/error/);
    });

    test('redirects with error when new password is too short', async () => {
      const res = await request(app)
        .post('/profile')
        .send({ currentPassword: 'old', newPassword: 'abc', confirmPassword: 'abc', _csrf: csrf });

      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/error/);
    });

    test('redirects with error when current password is wrong', async () => {
      mockUserManager.authenticateUser.mockResolvedValue(null);

      const res = await request(app)
        .post('/profile')
        .send({ currentPassword: 'wrongpass', newPassword: 'newpass123', confirmPassword: 'newpass123', _csrf: csrf });

      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/error/);
    });

    test('redirects with error when external user tries to change password', async () => {
      mockUserContext = { username: 'oauthuser', displayName: 'OAuth', email: 'o@x.com', isAuthenticated: true, isExternal: true, roles: ['authenticated'] };

      const res = await request(app)
        .post('/profile')
        .send({ newPassword: 'newpass123', confirmPassword: 'newpass123', _csrf: csrf });

      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/error/);
    });

    test('updates profile and redirects on success (no password change)', async () => {
      mockUserManager.updateUser.mockResolvedValue(true);

      const res = await request(app)
        .post('/profile')
        .send({ displayName: 'New Name', email: 'new@x.com', _csrf: csrf });

      expect(res.status).toBe(302);
      expect(res.headers.location).not.toMatch(/error/);
    });
  });

  // ── updatePreferences ─────────────────────────────────────────────────────

  describe('POST /preferences — updatePreferences', () => {
    const csrf = 'test-csrf-token';

    test('redirects unauthenticated user to login', async () => {
      mockUserContext = null;

      const res = await request(app)
        .post('/preferences')
        .send({ _csrf: csrf });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/login');
    });

    test('saves preferences and redirects on success', async () => {
      mockUserManager.updateUser.mockResolvedValue(true);

      const res = await request(app)
        .post('/preferences')
        .send({ 'editor.theme': 'dark', _csrf: csrf });

      expect(res.status).toBe(302);
    });
  });

  // ── addComment ────────────────────────────────────────────────────────────

  describe('POST /api/comments/:pageUuid — addComment', () => {
    const csrf = 'test-csrf-token';

    test('returns 401 when user is not authenticated', async () => {
      mockUserContext = null;

      const res = await request(app)
        .post('/api/comments/uuid-123')
        .send({ content: 'Hello!', _csrf: csrf });

      expect(res.status).toBe(401);
    });

    test('returns 400 when content is empty', async () => {
      const res = await request(app)
        .post('/api/comments/uuid-123')
        .send({ content: '', _csrf: csrf });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/content is required/i);
    });

    test('returns 400 when content exceeds 2000 characters', async () => {
      const res = await request(app)
        .post('/api/comments/uuid-123')
        .send({ content: 'x'.repeat(2001), _csrf: csrf });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/2000/);
    });

    test('returns 404 when comments are disabled', async () => {
      mockCommentManager.isEnabled.mockReturnValue(false);

      const res = await request(app)
        .post('/api/comments/uuid-123')
        .send({ content: 'Hello!', _csrf: csrf });

      expect(res.status).toBe(404);
    });

    test('creates comment and returns it on success', async () => {
      mockCommentManager.addComment.mockResolvedValue({ id: 'c-1', content: 'Hello!', author: 'testuser' });

      const res = await request(app)
        .post('/api/comments/uuid-123')
        .send({ content: 'Hello!', _csrf: csrf });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.comment.id).toBe('c-1');
    });
  });

  // ── deleteComment ─────────────────────────────────────────────────────────

  describe('DELETE /api/comments/:pageUuid/:commentId — deleteComment', () => {
    const csrf = 'test-csrf-token';

    test('returns 401 when user is not authenticated', async () => {
      mockUserContext = null;

      const res = await request(app)
        .delete('/api/comments/uuid-123/c-1')
        .send({ _csrf: csrf });

      expect(res.status).toBe(401);
    });

    test('returns 404 when comments are disabled', async () => {
      mockCommentManager.isEnabled.mockReturnValue(false);

      const res = await request(app)
        .delete('/api/comments/uuid-123/c-1')
        .send({ _csrf: csrf });

      expect(res.status).toBe(404);
    });

    test('returns 404 when comment does not exist', async () => {
      mockCommentManager.getComment.mockResolvedValue(null);

      const res = await request(app)
        .delete('/api/comments/uuid-123/c-missing')
        .send({ _csrf: csrf });

      expect(res.status).toBe(404);
    });

    test('returns 403 when non-owner non-admin tries to delete', async () => {
      mockUserContext = { username: 'other', displayName: 'Other', email: 'o@x.com', isAuthenticated: true, roles: ['authenticated'] };
      mockCommentManager.getComment.mockResolvedValue({ id: 'c-1', content: 'Hi', author: 'testuser' });

      const res = await request(app)
        .delete('/api/comments/uuid-123/c-1')
        .send({ _csrf: csrf });

      expect(res.status).toBe(403);
    });

    test('allows owner to delete their own comment', async () => {
      mockCommentManager.getComment.mockResolvedValue({ id: 'c-1', content: 'Hi', author: 'testuser' });

      const res = await request(app)
        .delete('/api/comments/uuid-123/c-1')
        .send({ _csrf: csrf });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('allows admin to delete any comment', async () => {
      mockUserContext = { username: 'admin', displayName: 'Admin', email: 'admin@x.com', isAuthenticated: true, roles: ['admin'] };
      mockCommentManager.getComment.mockResolvedValue({ id: 'c-1', content: 'Hi', author: 'someoneelse' });

      const res = await request(app)
        .delete('/api/comments/uuid-123/c-1')
        .send({ _csrf: csrf });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── userInfo ──────────────────────────────────────────────────────────────

  describe('GET /user-info — userInfo', () => {
    test('returns Authenticated userType for logged-in user', async () => {
      mockUserManager.getUserPermissions.mockResolvedValue(['read', 'write']);

      const res = await request(app).get('/user-info');

      expect(res.status).toBe(200);
      expect(res.body.userType).toBe('Authenticated');
    });

    test('returns No User/Anonymous when userContext is null', async () => {
      mockUserContext = null;
      mockUserManager.hasPermission.mockResolvedValue(false);

      const res = await request(app).get('/user-info');

      expect(res.status).toBe(200);
      expect(res.body.userType).toBe('No User/Anonymous');
    });
  });

  // ── getPageMetadata ───────────────────────────────────────────────────────

  describe('GET /api/page-metadata/:page — getPageMetadata', () => {
    test('returns 404 when page does not exist', async () => {
      mockPageManager.getPage.mockResolvedValue(null);

      const res = await request(app).get('/api/page-metadata/NonExistent');

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });

    test('returns metadata and content stats for existing page', async () => {
      mockPageManager.getPage.mockResolvedValue({
        content: 'Hello world this is a test',
        metadata: { title: 'TestPage', uuid: 'test-uuid-1', 'system-category': 'general' },
        filePath: null
      });

      const res = await request(app).get('/api/page-metadata/TestPage');

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('TestPage');
      expect(res.body.stats.wordCount).toBeGreaterThan(0);
    });
  });

  // ── getPageSuggestions ────────────────────────────────────────────────────

  describe('GET /api/page-suggestions — getPageSuggestions', () => {
    test('returns empty suggestions for query shorter than 2 chars', async () => {
      const res = await request(app).get('/api/page-suggestions?q=T');

      expect(res.status).toBe(200);
      expect(res.body.suggestions).toHaveLength(0);
    });

    test('returns matching page names for valid query', async () => {
      mockPageManager.getAllPages.mockResolvedValue(['TestPage', 'Welcome', 'TestingNotes']);
      mockPageManager.getPageMetadata.mockResolvedValue({ title: 'TestPage', slug: 'testpage', 'system-category': 'general' });

      const res = await request(app).get('/api/page-suggestions?q=Test');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.suggestions)).toBe(true);
      expect(res.body.suggestions.length).toBeGreaterThan(0);
    });

    test('returns empty when no pages match query', async () => {
      mockPageManager.getAllPages.mockResolvedValue(['Welcome', 'HomePage']);

      const res = await request(app).get('/api/page-suggestions?q=xyz');

      expect(res.status).toBe(200);
      expect(res.body.suggestions).toHaveLength(0);
    });
  });
});
