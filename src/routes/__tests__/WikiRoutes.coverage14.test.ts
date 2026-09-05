/**
 * WikiRoutes coverage batch 14 — login/auth, register/profile, page versions,
 *   page history/diff, preview, export.
 */
import express from 'express';
import { policyShaped } from './__fixtures__/policyShaped';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import path from 'path';
import WikiRoutes, { signupRateLimiter } from '../WikiRoutes';

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
  isExternal?: boolean;
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
  getExports: vi.fn().mockResolvedValue([{ filename: 'export-1.zip', path: '/tmp/export-1.zip' }]),
  deleteExport: vi.fn().mockResolvedValue(undefined),
  exportPageToHtml: vi.fn().mockRejectedValue(new Error('Export failed')),
  exportToMarkdown: vi.fn().mockRejectedValue(new Error('Export failed')),
  saveExport: vi.fn().mockResolvedValue('/tmp/export.html')
};

// #1049: the four provider-specific methods collapsed into three dispatchers
// taking a providerId, so the two redirect mocks are now one — which is the
// point of the change. Assertions that care which flow was asked must check
// the first argument rather than relying on separate mock identities.
const mockAuthManager = {
  isEnabled: vi.fn().mockReturnValue(false),
  authenticate: vi.fn().mockResolvedValue({ success: true, username: 'testuser' }),
  initiate: vi.fn().mockResolvedValue(undefined),
  getFlowRedirect: vi.fn().mockReturnValue('/'),
  // #1022: the state recorded when the link was requested. null = a token
  // issued before binding existed, which must not read as a mismatch.
  getDeviceState: vi.fn().mockReturnValue(null),
  provisionIfNew: vi.fn().mockResolvedValue(undefined),
  // #1021: consumeToken returns whether THIS caller consumed the token, and
  // the routes gate session creation on it. A mock returning undefined reads
  // as "another request got there first" and blocks every sign-in.
  consumeToken: vi.fn().mockReturnValue(true),
  startFlow: vi.fn().mockReturnValue('https://accounts.google.com/o/oauth2/auth')
};

let includeAuthManager = true;

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
      'ngdpbase.server.port': 3000,
      'ngdpbase.auth.magic-link.base-url': ''
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
          PageManager: mockPageManager,
          RenderingManager: mockRenderingManager,
          SearchManager: mockSearchManager,
          ACLManager: mockACLManager,
          CacheManager: mockCacheManager,
          UserManager: mockUserManager,
          NotificationManager: mockNotificationManager,
          ExportManager: mockExportManager,
          AuthManager: includeAuthManager ? mockAuthManager : null,
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
  includeAuthManager = true;

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
  mockUserManager.hasPermission.mockImplementation(policyShaped);   // #1198: anonymous holds only the read trio
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

  mockNotificationManager.getNotifications.mockReturnValue([]);
  mockNotificationManager.getAllNotifications.mockReturnValue([]);
  mockNotificationManager.getStats.mockReturnValue({ total: 0, active: 0, expired: 0, byType: {}, byLevel: {} });

  mockExportManager.getExports.mockResolvedValue([{ filename: 'export-1.zip', path: '/tmp/export-1.zip' }]);
  mockExportManager.deleteExport.mockResolvedValue(undefined);
  mockExportManager.exportPageToHtml.mockRejectedValue(new Error('Export failed'));
  mockExportManager.exportToMarkdown.mockRejectedValue(new Error('Export failed'));
  mockExportManager.saveExport.mockResolvedValue('/tmp/export.html');

  mockAuthManager.isEnabled.mockReturnValue(false);
  mockAuthManager.authenticate.mockResolvedValue({ success: true, username: 'testuser' });
  mockAuthManager.initiate.mockResolvedValue(undefined);
  mockAuthManager.getFlowRedirect.mockReturnValue('/');
  mockAuthManager.getDeviceState.mockReturnValue(null);
  mockAuthManager.consumeToken.mockImplementation(() => true);

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
      'ngdpbase.server.port': 3000,
      'ngdpbase.auth.magic-link.base-url': ''
    };
    return key in map ? map[key] : defaultValue;
  });
}

function buildApp() {
  const appInstance = express();
  // #1022 reads the device-state cookie off req.cookies, which the real app
  // populates via cookieParser in app.ts.
  appInstance.use(cookieParser());
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

describe('WikiRoutes — coverage batch 14', () => {
  let app: express.Application;

  beforeEach(async () => {
    mockUserContext = { ...adminUser };
    resetMocks();
    // #1026: the signup limiter is module-scope, so budget spent by one case
    // would otherwise 429 the next one in this file.
    signupRateLimiter.reset();
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

  // ── Login page ────────────────────────────────────────────────────────────────

  describe('GET /login (loginPage)', () => {
    test('redirects when user is already authenticated', async () => {
      const res = await request(app).get('/login');
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/');
    });

    test('renders login page when not authenticated', async () => {
      mockUserContext = null;
      const res = await request(app).get('/login');
      expect(res.status).toBe(200);
    });

    test('renders login page with redirect query param', async () => {
      mockUserContext = null;
      const res = await request(app).get('/login?redirect=/admin');
      expect(res.status).toBe(200);
    });
  });

  // ── Admin login page ──────────────────────────────────────────────────────────

  describe('GET /admin/login (adminLoginPage)', () => {
    test('redirects to /admin when user is already authenticated', async () => {
      const res = await request(app).get('/admin/login');
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/admin');
    });

    test('renders login page when not authenticated', async () => {
      mockUserContext = null;
      const res = await request(app).get('/admin/login');
      expect(res.status).toBe(200);
    });
  });

  // ── Process login ─────────────────────────────────────────────────────────────

  describe('POST /login (processLogin)', () => {
    test('redirects to login with error when authentication fails', async () => {
      mockUserContext = null;
      mockAuthManager.authenticate.mockResolvedValue({ success: false });
      const res = await request(app)
        .post('/login')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ username: 'baduser', password: 'wrong', redirect: '/' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/login?error=');
    });

    test('redirects to destination when authentication succeeds', async () => {
      mockUserContext = null;
      mockAuthManager.authenticate.mockResolvedValue({ success: true, username: 'testuser' });
      const res = await request(app)
        .post('/login')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ username: 'testuser', password: 'correct', redirect: '/dashboard' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/dashboard');
    });

    test('falls back to userManager when no AuthManager', async () => {
      mockUserContext = null;
      includeAuthManager = false;
      mockUserManager.authenticateUser.mockResolvedValue({ username: 'testuser', isAuthenticated: true });
      const res = await request(app)
        .post('/login')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ username: 'testuser', password: 'correct' });
      expect(res.status).toBe(302);
    });
  });

  // ── Magic link ────────────────────────────────────────────────────────────────

  describe('POST /auth/magic-link (requestMagicLink)', () => {
    test('always redirects with magic=sent even when AuthManager disabled', async () => {
      mockUserContext = null;
      mockAuthManager.isEnabled.mockReturnValue(false);
      const res = await request(app)
        .post('/auth/magic-link')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ email: 'test@example.com' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('magic=sent');
    });

    test('initiates magic link when AuthManager has it enabled', async () => {
      mockUserContext = null;
      mockAuthManager.isEnabled.mockReturnValue(true);
      const res = await request(app)
        .post('/auth/magic-link')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ email: 'test@example.com', redirect: '/dashboard' });
      expect(res.status).toBe(302);
    });
  });

  describe('GET /auth/magic-link/verify (verifyMagicLink)', () => {
    // #1022: a magic link is bearer-only — a forwarded mail or a link pasted
    // into a chat is an account takeover with no second factor. These cover
    // the binding decision and, critically, that enforcement defaults OFF so
    // the ordinary "request on laptop, open on phone" flow still works.
    describe('device binding (#1022)', () => {
      const STATE = 'a'.repeat(64);
      const OTHER = 'b'.repeat(64);

      const withEnforcement = (on: boolean) => {
        mockConfigManager.getProperty.mockImplementation((key: string, dflt: unknown) => {
          if (key === 'ngdpbase.auth.magic-link.bind-to-requesting-device') return on;
          if (key === 'ngdpbase.auth.magic-link.ttl-minutes') return 15;
          return dflt;
        });
      };

      afterEach(() => {
        mockConfigManager.getProperty.mockReset();
        mockAuthManager.getDeviceState.mockReturnValue(null);
      });

      test('a mismatched browser still signs in when enforcement is off (the default)', async () => {
        // The observability half ships alone: recorded, not blocked.
        withEnforcement(false);
        mockAuthManager.getDeviceState.mockReturnValue(STATE);

        const res = await request(app)
          .post('/auth/magic-link/verify')
          .set('x-csrf-token', 'test-csrf-token')
          .set('Cookie', `ngdp_ml_state=${OTHER}`)
          .send({ token: 'valid-token' });

        expect(res.headers.location).not.toContain('error=');
      });

      test('a mismatched browser is refused when enforcement is on', async () => {
        withEnforcement(true);
        mockAuthManager.getDeviceState.mockReturnValue(STATE);

        const res = await request(app)
          .post('/auth/magic-link/verify')
          .set('x-csrf-token', 'test-csrf-token')
          .set('Cookie', `ngdp_ml_state=${OTHER}`)
          .send({ token: 'valid-token' });

        expect(res.headers.location).toContain('error=');
      });

      test('a missing cookie is refused under enforcement — the forwarded-link case', async () => {
        // A forwarded link arrives with no cookie at all. If absence read as a
        // pass, the setting would do nothing against the attacker it targets.
        withEnforcement(true);
        mockAuthManager.getDeviceState.mockReturnValue(STATE);

        const res = await request(app)
          .post('/auth/magic-link/verify')
          .set('x-csrf-token', 'test-csrf-token')
          .send({ token: 'valid-token' });

        expect(res.headers.location).toContain('error=');
      });

      test('the matching browser signs in under enforcement', async () => {
        withEnforcement(true);
        mockAuthManager.getDeviceState.mockReturnValue(STATE);

        const res = await request(app)
          .post('/auth/magic-link/verify')
          .set('x-csrf-token', 'test-csrf-token')
          .set('Cookie', `ngdp_ml_state=${STATE}`)
          .send({ token: 'valid-token' });

        expect(res.headers.location).not.toContain('error=');
      });

      test('a token issued before binding existed is allowed even under enforcement', async () => {
        // Tokens live ~15 minutes in memory, so the deploy that ships this has
        // live tokens with no stored state. Refusing them would sign people
        // out mid-flow for no security gain.
        withEnforcement(true);
        mockAuthManager.getDeviceState.mockReturnValue(null);

        const res = await request(app)
          .post('/auth/magic-link/verify')
          .set('x-csrf-token', 'test-csrf-token')
          .send({ token: 'valid-token' });

        expect(res.headers.location).not.toContain('error=');
      });

      test('the state cookie is cleared after redemption', async () => {
        withEnforcement(false);
        mockAuthManager.getDeviceState.mockReturnValue(STATE);

        const res = await request(app)
          .post('/auth/magic-link/verify')
          .set('x-csrf-token', 'test-csrf-token')
          .set('Cookie', `ngdp_ml_state=${STATE}`)
          .send({ token: 'valid-token' });

        const setCookie = String(res.headers['set-cookie'] ?? '');
        expect(setCookie).toContain('ngdp_ml_state=;');
      });
    });

    test('redirects to login when no token provided', async () => {
      mockUserContext = null;
      const res = await request(app).get('/auth/magic-link/verify');
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/login?error=');
    });

    test('redirects to login when AuthManager not available', async () => {
      mockUserContext = null;
      includeAuthManager = false;
      const res = await request(app).get('/auth/magic-link/verify?token=abc123');
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/login?error=');
    });

    test('redirects when authentication fails', async () => {
      mockUserContext = null;
      mockAuthManager.authenticate.mockResolvedValue({ success: false });
      const res = await request(app).get('/auth/magic-link/verify?token=abc123');
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/login?error=');
    });

    // #1019 — the GET must be side-effect free. Mail security scanners
    // (Defender Safe Links, Proofpoint) pre-fetch every URL in an incoming
    // message; anything spent here is spent before the human ever clicks.

    test('#1019 — valid token renders the confirmation page instead of logging in', async () => {
      mockUserContext = null;
      mockAuthManager.authenticate.mockResolvedValue({ success: true, username: 'testuser' });
      mockAuthManager.getFlowRedirect.mockReturnValue('/dashboard');
      const res = await request(app).get('/auth/magic-link/verify?token=valid-token');
      // Used to be a 302 straight into a session — that redirect IS the bug.
      expect(res.status).toBe(200);
    });

    test('#1019 — GET does not consume the token', async () => {
      mockUserContext = null;
      mockAuthManager.consumeToken.mockClear();
      mockAuthManager.authenticate.mockResolvedValue({ success: true, username: 'testuser' });
      await request(app).get('/auth/magic-link/verify?token=valid-token');
      expect(mockAuthManager.consumeToken).not.toHaveBeenCalled();
    });

    test('#1019 — a scanner pre-fetch leaves the link usable for the real click', async () => {
      mockUserContext = null;
      mockAuthManager.consumeToken.mockClear();
      mockAuthManager.authenticate.mockResolvedValue({ success: true, username: 'testuser' });
      mockAuthManager.getFlowRedirect.mockReturnValue('/dashboard');

      // Scanner pre-fetches the link, twice for good measure.
      await request(app).get('/auth/magic-link/verify?token=valid-token');
      await request(app).get('/auth/magic-link/verify?token=valid-token');
      expect(mockAuthManager.consumeToken).not.toHaveBeenCalled();

      // The user then clicks through the interstitial.
      const res = await request(app)
        .post('/auth/magic-link/verify')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ token: 'valid-token' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/dashboard');
      expect(mockAuthManager.consumeToken).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /auth/magic-link/verify (completeMagicLink)', () => {
    // #1021: consumption is the single-use gate. The route verifies with an
    // `await` — a real suspension point — so two POSTs carrying the same token
    // (a double-clicked confirmation button, a client retry, a prefetch racing
    // the real submit) could both clear verification before either consumed,
    // and both would establish a session. #1019's CSRF-protected POST does not
    // close it: both submits come from the same session with the same token.
    test('a second submit of the same token is refused rather than minting a second session', async () => {
      // Model the real provider: the first consume wins, every later one loses.
      let consumed = false;
      mockAuthManager.consumeToken.mockImplementation(() => {
        if (consumed) return false;
        consumed = true;
        return true;
      });

      const first = await request(app)
        .post('/auth/magic-link/verify')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ token: 'valid-token' });
      // Whatever the configured landing page is, it is not the failure page.
      expect(first.headers.location).not.toContain('error=');

      const second = await request(app)
        .post('/auth/magic-link/verify')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ token: 'valid-token' });
      expect(second.headers.location).toBe('/login?error=Link+expired+or+already+used');

      mockAuthManager.consumeToken.mockImplementation(() => true);
    });

    test('redirects to login when no token provided', async () => {
      mockUserContext = null;
      const res = await request(app)
        .post('/auth/magic-link/verify')
        .set('x-csrf-token', 'test-csrf-token')
        .send({});
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/login?error=');
    });

    test('redirects to login when AuthManager not available', async () => {
      mockUserContext = null;
      includeAuthManager = false;
      const res = await request(app)
        .post('/auth/magic-link/verify')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ token: 'abc123' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/login?error=');
    });

    test('redirects and consumes nothing when authentication fails', async () => {
      mockUserContext = null;
      mockAuthManager.consumeToken.mockClear();
      mockAuthManager.authenticate.mockResolvedValue({ success: false });
      const res = await request(app)
        .post('/auth/magic-link/verify')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ token: 'abc123' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/login?error=');
      expect(mockAuthManager.consumeToken).not.toHaveBeenCalled();
    });

    test('consumes the token and redirects to the stored target on success', async () => {
      mockUserContext = null;
      mockAuthManager.consumeToken.mockClear();
      mockAuthManager.authenticate.mockResolvedValue({ success: true, username: 'testuser' });
      mockAuthManager.getFlowRedirect.mockReturnValue('/dashboard');
      const res = await request(app)
        .post('/auth/magic-link/verify')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ token: 'valid-token' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/dashboard');
      expect(mockAuthManager.consumeToken).toHaveBeenCalledWith('magic-link', 'valid-token');
    });
  });

  // ── Register ──────────────────────────────────────────────────────────────────

  describe('GET /register (registerPage)', () => {
    test('renders register page', async () => {
      mockUserContext = null;
      const res = await request(app).get('/register');
      expect(res.status).toBe(200);
    });
  });

  describe('POST /register (processRegister)', () => {
    test('redirects with error when required fields missing', async () => {
      mockUserContext = null;
      const res = await request(app)
        .post('/register')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ username: 'newuser' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/register?error=');
    });

    test('redirects with error when passwords do not match', async () => {
      mockUserContext = null;
      const res = await request(app)
        .post('/register')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ username: 'newuser', email: 'new@example.com', password: 'pass123', confirmPassword: 'different' });
      expect(res.status).toBe(302);
      expect(decodeURIComponent(res.headers.location)).toContain('Passwords do not match');
    });

    test('redirects with error when password too short', async () => {
      mockUserContext = null;
      const res = await request(app)
        .post('/register')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ username: 'newuser', email: 'new@example.com', password: 'abc', confirmPassword: 'abc' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('characters');
    });

    test('redirects to login on successful registration', async () => {
      mockUserContext = null;
      mockUserManager.createUser.mockResolvedValue(true);
      const res = await request(app)
        .post('/register')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ username: 'newuser', email: 'new@example.com', password: 'pass1234', confirmPassword: 'pass1234' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/login');
    });
  });

  // ── Profile ───────────────────────────────────────────────────────────────────

  describe('GET /profile (profilePage)', () => {
    test('redirects to login when not authenticated', async () => {
      mockUserContext = null;
      const res = await request(app).get('/profile');
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/login');
    });

    test('renders profile page when authenticated', async () => {
      const res = await request(app).get('/profile');
      expect(res.status).toBe(200);
    });
  });

  describe('POST /profile (updateProfile)', () => {
    test('redirects to login when not authenticated', async () => {
      mockUserContext = null;
      const res = await request(app)
        .post('/profile')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ displayName: 'New Name' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/^\/login(\?|$)/);   // #1198: the refusal carries a redirect back
    });

    test('updates profile and redirects on success', async () => {
      const res = await request(app)
        .post('/profile')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ displayName: 'New Name', email: 'new@example.com' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/profile');
    });

    test('rejects password change for OAuth accounts', async () => {
      mockUserContext = { ...adminUser, isExternal: true };
      const res = await request(app)
        .post('/profile')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ newPassword: 'newpass123' });
      expect(res.status).toBe(302);
      expect(decodeURIComponent(res.headers.location)).toContain('Cannot change password');
    });

    test('redirects with error when current password missing for password change', async () => {
      const res = await request(app)
        .post('/profile')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ newPassword: 'newpass123', confirmPassword: 'newpass123' });
      expect(res.status).toBe(302);
      expect(decodeURIComponent(res.headers.location)).toContain('Current password required');
    });
  });

  // ── Preferences ───────────────────────────────────────────────────────────────

  describe('POST /preferences (updatePreferences)', () => {
    test('redirects to login when not authenticated', async () => {
      mockUserContext = null;
      const res = await request(app)
        .post('/preferences')
        .set('x-csrf-token', 'test-csrf-token')
        .send({});
      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/^\/login(\?|$)/);   // #1198: the refusal carries a redirect back
    });

    test('saves preferences and redirects on success', async () => {
      const res = await request(app)
        .post('/preferences')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ 'editor.autoindent': 'on', 'display.pagesize': '50' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/profile');
    });
  });

  // ── Preview ───────────────────────────────────────────────────────────────────

  describe('POST /api/preview (previewPage)', () => {
    test('returns rendered HTML preview', async () => {
      const res = await request(app)
        .post('/api/preview')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ content: '# Hello', pageName: 'TestPage' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── Export ────────────────────────────────────────────────────────────────────

  describe('GET /export (exportPage)', () => {
    test('renders export page with list of pages', async () => {
      const res = await request(app).get('/export');
      expect(res.status).toBe(200);
    });
  });

  describe('POST /export/html/:page (exportPageHtml)', () => {
    test('returns 500 when export fails', async () => {
      const res = await request(app)
        .post('/export/html/TestPage')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(500);
    });
  });

  describe('POST /export/markdown/:page (exportPageMarkdown)', () => {
    test('returns 500 when export fails', async () => {
      const res = await request(app)
        .post('/export/markdown/TestPage')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(500);
    });
  });

  // ── Page versions API ─────────────────────────────────────────────────────────

  describe('GET /api/page/:identifier/versions (getPageVersions)', () => {
    test('returns 501 when provider does not support versioning', async () => {
      mockPageManager.provider = null;
      const res = await request(app).get('/api/page/test-page/versions');
      expect(res.status).toBe(501);
    });

    test('returns version list when provider supports versioning', async () => {
      const mockProvider = {
        getVersionHistory: vi.fn().mockResolvedValue([
          { version: 1, date: '2024-01-01', author: 'admin', comment: 'Initial' }
        ])
      };
      mockPageManager.provider = mockProvider;
      const res = await request(app).get('/api/page/test-page/versions');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/page/:identifier/version/:version (getPageVersion)', () => {
    test('returns 400 for invalid version number', async () => {
      const res = await request(app).get('/api/page/test-page/version/abc');
      expect(res.status).toBe(400);
    });

    test('returns 400 for version number less than 1', async () => {
      const res = await request(app).get('/api/page/test-page/version/0');
      expect(res.status).toBe(400);
    });

    test('returns 501 when provider does not support versioning', async () => {
      mockPageManager.provider = null;
      const res = await request(app).get('/api/page/test-page/version/1');
      expect(res.status).toBe(501);
    });

    test('returns version content when provider supports versioning', async () => {
      const mockProvider = {
        getPageVersion: vi.fn().mockResolvedValue({ content: '# V1', metadata: {} })
      };
      mockPageManager.provider = mockProvider;
      const res = await request(app).get('/api/page/test-page/version/1');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/page/:identifier/compare/:v1/:v2 (comparePageVersions)', () => {
    test('returns 400 for invalid version numbers', async () => {
      const res = await request(app).get('/api/page/test-page/compare/abc/1');
      expect(res.status).toBe(400);
    });

    test('returns 501 when provider does not support versioning', async () => {
      mockPageManager.provider = null;
      const res = await request(app).get('/api/page/test-page/compare/1/2');
      expect(res.status).toBe(501);
    });

    test('returns comparison when provider supports versioning', async () => {
      const mockProvider = {
        compareVersions: vi.fn().mockResolvedValue({ version1: 1, version2: 2, diff: [] })
      };
      mockPageManager.provider = mockProvider;
      const res = await request(app).get('/api/page/test-page/compare/1/2');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/page/:identifier/restore/:version (restorePageVersion)', () => {
    test('returns 400 for invalid version number', async () => {
      const res = await request(app)
        .post('/api/page/test-page/restore/abc')
        .set('x-csrf-token', 'test-csrf-token')
        .send({});
      expect(res.status).toBe(400);
    });

    test('returns 401 when not authenticated', async () => {
      mockUserContext = null;
      const res = await request(app)
        .post('/api/page/test-page/restore/1')
        .set('x-csrf-token', 'test-csrf-token')
        .send({});
      expect(res.status).toBe(401);
    });

    test('returns 501 when provider does not support versioning', async () => {
      mockPageManager.provider = null;
      const res = await request(app)
        .post('/api/page/test-page/restore/1')
        .set('x-csrf-token', 'test-csrf-token')
        .send({});
      expect(res.status).toBe(501);
    });

    test('returns 200 when version is restored', async () => {
      const mockProvider = {
        restoreVersion: vi.fn().mockResolvedValue(5)
      };
      mockPageManager.provider = mockProvider;
      const res = await request(app)
        .post('/api/page/test-page/restore/3')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ comment: 'Rolling back' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── Page history ──────────────────────────────────────────────────────────────

  describe('GET /history/:page (pageHistory)', () => {
    test('returns 501 when provider does not support versioning', async () => {
      mockPageManager.provider = null;
      const res = await request(app).get('/history/TestPage');
      expect(res.status).toBe(501);
    });

    test('returns 404 when page does not exist', async () => {
      const mockProvider = {
        getVersionHistory: vi.fn().mockRejectedValue(new Error('not found'))
      };
      mockPageManager.provider = mockProvider;
      mockPageManager.pageExists.mockReturnValue(false);
      const res = await request(app).get('/history/NonExistentPage');
      expect(res.status).toBe(404);
    });

    test('returns 501 when provider throws not implemented', async () => {
      const mockProvider = {
        getVersionHistory: vi.fn().mockRejectedValue(new Error('Not implemented'))
      };
      mockPageManager.provider = mockProvider;
      mockPageManager.pageExists.mockReturnValue(true);
      const res = await request(app).get('/history/TestPage');
      expect(res.status).toBe(501);
    });
  });

  // ── Page diff ─────────────────────────────────────────────────────────────────

  describe('GET /diff/:page (pageDiff)', () => {
    test('returns 400 when version numbers are invalid', async () => {
      const res = await request(app).get('/diff/TestPage?v1=abc&v2=1');
      expect(res.status).toBe(400);
    });

    test('returns 501 when provider does not support versioning', async () => {
      mockPageManager.provider = null;
      const res = await request(app).get('/diff/TestPage?v1=1&v2=2');
      expect(res.status).toBe(501);
    });

    test('returns 404 when page does not exist', async () => {
      const mockProvider = {
        compareVersions: vi.fn().mockResolvedValue({ version1: 1, version2: 2, diff: [] })
      };
      mockPageManager.provider = mockProvider;
      mockPageManager.pageExists.mockReturnValue(false);
      const res = await request(app).get('/diff/TestPage?v1=1&v2=2');
      expect(res.status).toBe(404);
    });

    test('renders diff page when versions are valid', async () => {
      const mockProvider = {
        compareVersions: vi.fn().mockResolvedValue({ version1: 1, version2: 2, diff: [] })
      };
      mockPageManager.provider = mockProvider;
      mockPageManager.pageExists.mockReturnValue(true);
      const res = await request(app).get('/diff/TestPage?v1=1&v2=2');
      expect(res.status).toBe(200);
    });
  });
});
