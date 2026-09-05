/**
 * WikiRoutes coverage batch 3 — admin API and versioning handlers:
 *   GET /api/test
 *   GET /api/page-source/:page
 *   GET /api/page/:identifier/versions
 *   GET /api/page/:identifier/version/:version
 *   GET /api/page/:identifier/compare/:v1/:v2
 *   GET /api/admin/cache/stats
 *   POST /api/admin/cache/clear
 *   POST /api/admin/cache/clear/page/:identifier
 *   POST /api/admin/cache/clear/:region
 *   POST /api/admin/jobs/:jobId/enqueue
 *   GET /api/admin/jobs/:runId/status
 *   GET /api/admin/jobs/active
 *   POST /admin/notifications/:id/dismiss
 *   POST /admin/notifications/clear-all
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
  provider: null as null | { getVersionHistory?: unknown; getPageVersion?: unknown; compareVersions?: unknown }
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
  destroySession: vi.fn()
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
  removePageFromLinkGraph: vi.fn()
};

const mockSearchManager = {
  search: vi.fn(),
  advancedSearch: vi.fn(),
  advancedSearchWithContext: vi.fn(),
  getSuggestions: vi.fn()
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

// #896: apiGetUserKeywords reads via CatalogManager's user-keywords provider.
// Delegate to mockConfigManager so per-test getProperty overrides keep working.
const mockCatalogManager = {
  getUserKeywordsProvider: vi.fn(() => ({
    getCatalogObject: async () =>
      (mockConfigManager.getProperty('ngdpbase.user-keywords', {}) || {}) as Record<string, Record<string, unknown>>,
    saveCatalogObject: async () => undefined
  })),
  getProviderTerms: vi.fn(async () => null)
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
          CatalogManager: mockCatalogManager,
          PageManager: mockPageManager,
          RenderingManager: mockRenderingManager,
          SearchManager: mockSearchManager,
          ACLManager: mockACLManager,
          CacheManager: mockCacheManager,
          UserManager: mockUserManager,
          NotificationManager: mockNotificationManager,
          BackgroundJobManager: mockBackgroundJobManager,
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

  mockCacheManager.isInitialized.mockReturnValue(true);
  mockCacheManager.get.mockResolvedValue(null);
  mockCacheManager.set.mockResolvedValue(true);
  mockCacheManager.del.mockResolvedValue(true);
  mockCacheManager.clear.mockResolvedValue(true);
  mockCacheManager.stats.mockResolvedValue({ hits: 10, misses: 5, size: 100 });

  mockRenderingManager.textToHTML.mockResolvedValue('<p>Rendered HTML</p>');
  mockRenderingManager.getReferringPages.mockReturnValue([]);
  mockRenderingManager.updatePageInLinkGraph.mockImplementation(() => {});
  mockRenderingManager.addPageToCache.mockImplementation(() => {});
  mockRenderingManager.removePageFromLinkGraph.mockImplementation(() => {});

  mockSearchManager.search.mockResolvedValue([]);
  mockSearchManager.advancedSearch.mockResolvedValue([]);
  mockSearchManager.advancedSearchWithContext.mockResolvedValue([]);
  mockSearchManager.getSuggestions.mockResolvedValue([]);

  mockUserManager.getCurrentUser.mockResolvedValue(adminUser);
  mockUserManager.hasPermission.mockImplementation(policyShaped);   // #1198: anonymous holds only the read trio
  mockUserManager.getUser.mockResolvedValue({ username: 'testuser', email: 'test@example.com', displayName: 'Test User', preferences: {} });
  mockUserManager.getUsers.mockResolvedValue([]);
  mockUserManager.getRoles.mockResolvedValue([]);
  mockUserManager.getPermissions.mockReturnValue(new Map());
  mockUserManager.getUserPermissions.mockResolvedValue(['read', 'write']);
  mockUserManager.searchUsers.mockResolvedValue([]);
  mockUserManager.createSession.mockResolvedValue('sid');
  mockUserManager.authenticateUser.mockResolvedValue({ username: 'testuser', isAuthenticated: true });
  mockUserManager.updateUser.mockResolvedValue(true);
  mockUserManager.destroySession.mockResolvedValue(true);

  mockNotificationManager.getNotifications.mockReturnValue([]);
  mockNotificationManager.getAllNotifications.mockReturnValue([]);
  mockNotificationManager.getStats.mockReturnValue({ total: 0, active: 0, expired: 0, byType: {}, byLevel: {} });
  mockNotificationManager.dismissNotification.mockResolvedValue(true);
  mockNotificationManager.clearAllActive.mockResolvedValue(3);

  mockBackgroundJobManager.registerJob.mockReturnValue(undefined);
  mockBackgroundJobManager.enqueue.mockResolvedValue('run-id-1');
  mockBackgroundJobManager.getStatus.mockReturnValue({ runId: 'run-id-1', status: 'pending' });
  mockBackgroundJobManager.getActiveJobs.mockReturnValue([]);
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

describe('WikiRoutes — coverage batch 3', () => {
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

  // ── GET /api/test ────────────────────────────────────────────────────────────

  describe('GET /api/test', () => {
    test('returns API working message', async () => {
      const res = await request(app).get('/api/test');

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('API working!');
    });
  });

  // ── GET /api/page-source/:page ────────────────────────────────────────────

  describe('GET /api/page-source/:page — getPageSource', () => {
    test('returns 404 when page does not exist', async () => {
      mockPageManager.getPage.mockResolvedValue(null);

      const res = await request(app).get('/api/page-source/NonExistent');

      expect(res.status).toBe(404);
    });

    test('returns page content as plain text', async () => {
      mockPageManager.getPage.mockResolvedValue({ content: '# Hello World', metadata: {} });

      const res = await request(app).get('/api/page-source/TestPage');

      expect(res.status).toBe(200);
      expect(res.text).toContain('Hello World');
    });
  });

  // ── GET /api/page/:identifier/versions ───────────────────────────────────

  describe('GET /api/page/:identifier/versions — getPageVersions', () => {
    test('returns 501 when provider does not support versioning', async () => {
      mockPageManager.provider = null;

      const res = await request(app).get('/api/page/TestPage/versions');

      expect(res.status).toBe(501);
      expect(res.body.error).toMatch(/not supported/i);
    });

    test('returns version list when provider supports versioning', async () => {
      const versions = [
        { version: 2, author: 'alice', timestamp: '2026-01-02', comment: 'update' },
        { version: 1, author: 'bob', timestamp: '2026-01-01', comment: 'create' }
      ];
      mockPageManager.provider = {
        getVersionHistory: vi.fn().mockResolvedValue(versions)
      };

      const res = await request(app).get('/api/page/TestPage/versions');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.versionCount).toBe(2);
    });
  });

  // ── GET /api/page/:identifier/version/:version ────────────────────────────

  describe('GET /api/page/:identifier/version/:version — getPageVersion', () => {
    test('returns 400 for invalid version number', async () => {
      const res = await request(app).get('/api/page/TestPage/version/abc');

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid version/i);
    });

    test('returns 400 for version 0', async () => {
      const res = await request(app).get('/api/page/TestPage/version/0');

      expect(res.status).toBe(400);
    });

    test('returns 501 when provider does not support versioning', async () => {
      mockPageManager.provider = null;

      const res = await request(app).get('/api/page/TestPage/version/1');

      expect(res.status).toBe(501);
      expect(res.body.error).toMatch(/not supported/i);
    });

    test('returns version content when provider supports it', async () => {
      mockPageManager.provider = {
        getPageVersion: vi.fn().mockResolvedValue({ content: '# Old content', metadata: { title: 'TestPage' } })
      };

      const res = await request(app).get('/api/page/TestPage/version/1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.content).toBe('# Old content');
    });
  });

  // ── GET /api/page/:identifier/compare/:v1/:v2 ─────────────────────────────

  describe('GET /api/page/:identifier/compare/:v1/:v2 — comparePageVersions', () => {
    test('returns 400 when version numbers are invalid', async () => {
      const res = await request(app).get('/api/page/TestPage/compare/abc/2');

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid version/i);
    });

    test('returns 501 when provider does not support comparison', async () => {
      mockPageManager.provider = null;

      const res = await request(app).get('/api/page/TestPage/compare/1/2');

      expect(res.status).toBe(501);
    });

    test('returns comparison when provider supports it', async () => {
      mockPageManager.provider = {
        compareVersions: vi.fn().mockResolvedValue({ diff: '+added\n-removed' })
      };

      const res = await request(app).get('/api/page/TestPage/compare/1/2');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── GET /api/admin/cache/stats ────────────────────────────────────────────

  describe('GET /api/admin/cache/stats — adminCacheStats', () => {
    test('returns 403 for unauthenticated user', async () => {
      mockUserContext = null;

      const res = await request(app).get('/api/admin/cache/stats');

      expect(res.status).toBe(403);
    });

    test('returns 503 when cache is not initialized', async () => {
      mockCacheManager.isInitialized.mockReturnValue(false);

      const res = await request(app).get('/api/admin/cache/stats');

      expect(res.status).toBe(503);
    });

    test('returns cache stats for admin user', async () => {
      const res = await request(app).get('/api/admin/cache/stats');

      expect(res.status).toBe(200);
    });
  });

  // ── POST /api/admin/cache/clear ───────────────────────────────────────────

  describe('POST /api/admin/cache/clear — adminClearCache', () => {
    const csrf = 'test-csrf-token';

    test('returns 403 for unauthenticated user', async () => {
      mockUserContext = null;

      const res = await request(app)
        .post('/api/admin/cache/clear')
        .send({ _csrf: csrf });

      expect(res.status).toBe(403);
    });

    test('clears all cache and returns success for admin', async () => {
      const res = await request(app)
        .post('/api/admin/cache/clear')
        .send({ _csrf: csrf });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── POST /api/admin/cache/clear/page/:identifier ─────────────────────────

  describe('POST /api/admin/cache/clear/page/:identifier — adminClearPageCache', () => {
    const csrf = 'test-csrf-token';

    test('returns 403 for unauthenticated user', async () => {
      mockUserContext = null;

      const res = await request(app)
        .post('/api/admin/cache/clear/page/TestPage')
        .send({ _csrf: csrf });

      expect(res.status).toBe(403);
    });

    test('evicts page cache for admin', async () => {
      const res = await request(app)
        .post('/api/admin/cache/clear/page/TestPage')
        .send({ _csrf: csrf });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── POST /api/admin/cache/clear/:region ───────────────────────────────────

  describe('POST /api/admin/cache/clear/:region — adminClearCacheRegion', () => {
    const csrf = 'test-csrf-token';

    test('returns 403 for unauthenticated user', async () => {
      mockUserContext = null;

      const res = await request(app)
        .post('/api/admin/cache/clear/rendered-pages')
        .send({ _csrf: csrf });

      expect(res.status).toBe(403);
    });

    test('clears specified cache region for admin', async () => {
      const res = await request(app)
        .post('/api/admin/cache/clear/rendered-pages')
        .send({ _csrf: csrf });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── POST /api/admin/jobs/:jobId/enqueue ───────────────────────────────────

  describe('POST /api/admin/jobs/:jobId/enqueue — apiJobEnqueue', () => {
    const csrf = 'test-csrf-token';

    test('returns 403 for unauthenticated user', async () => {
      mockUserContext = null;

      const res = await request(app)
        .post('/api/admin/jobs/backup/enqueue')
        .send({ _csrf: csrf });

      expect(res.status).toBe(403);
    });

    test('returns 404 for unknown job', async () => {
      mockBackgroundJobManager.enqueue.mockRejectedValue(new Error('unknown job: no-such-job'));

      const res = await request(app)
        .post('/api/admin/jobs/no-such-job/enqueue')
        .send({ _csrf: csrf });

      expect(res.status).toBe(404);
    });

    test('returns 202 with runId on success', async () => {
      const res = await request(app)
        .post('/api/admin/jobs/backup/enqueue')
        .send({ _csrf: csrf });

      expect(res.status).toBe(202);
      expect(res.body.runId).toBeDefined();
    });
  });

  // ── GET /api/admin/jobs/:runId/status ─────────────────────────────────────

  describe('GET /api/admin/jobs/:runId/status — apiJobStatus', () => {
    test('returns 403 for unauthenticated user', async () => {
      mockUserContext = null;

      const res = await request(app).get('/api/admin/jobs/run-id-1/status');

      expect(res.status).toBe(403);
    });

    test('returns 404 when run not found', async () => {
      mockBackgroundJobManager.getStatus.mockReturnValue(null);

      const res = await request(app).get('/api/admin/jobs/no-such-run/status');

      expect(res.status).toBe(404);
    });

    test('returns job run status for admin', async () => {
      const res = await request(app).get('/api/admin/jobs/run-id-1/status');

      expect(res.status).toBe(200);
      expect(res.body.runId).toBe('run-id-1');
    });
  });

  // ── GET /api/admin/jobs/active ────────────────────────────────────────────

  describe('GET /api/admin/jobs/active — apiJobsActive', () => {
    test('returns 403 for unauthenticated user', async () => {
      mockUserContext = null;

      const res = await request(app).get('/api/admin/jobs/active');

      expect(res.status).toBe(403);
    });

    test('returns active jobs list for admin', async () => {
      mockBackgroundJobManager.getActiveJobs.mockReturnValue([
        { jobId: 'backup', runId: 'r1', status: 'running' }
      ]);

      const res = await request(app).get('/api/admin/jobs/active');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ── POST /admin/notifications/:id/dismiss ─────────────────────────────────

  describe('POST /admin/notifications/:id/dismiss — adminDismissNotification', () => {
    const csrf = 'test-csrf-token';

    test('returns 403 for unauthenticated user', async () => {
      mockUserContext = null;

      const res = await request(app)
        .post('/admin/notifications/notif-1/dismiss')
        .send({ _csrf: csrf });

      expect(res.status).toBe(403);
    });

    test('redirects to /admin on successful dismiss', async () => {
      const res = await request(app)
        .post('/admin/notifications/notif-1/dismiss')
        .send({ _csrf: csrf });

      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/\/admin/);
    });

    test('redirects with error when notification not found', async () => {
      mockNotificationManager.dismissNotification.mockResolvedValue(false);

      const res = await request(app)
        .post('/admin/notifications/missing-id/dismiss')
        .send({ _csrf: csrf });

      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/error/);
    });
  });

  // ── POST /admin/notifications/clear-all ───────────────────────────────────

  describe('POST /admin/notifications/clear-all — adminClearAllNotifications', () => {
    const csrf = 'test-csrf-token';

    test('returns 403 for unauthenticated user', async () => {
      mockUserContext = null;

      const res = await request(app)
        .post('/admin/notifications/clear-all')
        .send({ _csrf: csrf });

      expect(res.status).toBe(403);
    });

    test('redirects with success message after clearing', async () => {
      const res = await request(app)
        .post('/admin/notifications/clear-all')
        .send({ _csrf: csrf });

      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/success/);
    });
  });

  // ── GET /wiki/:page — redirect ────────────────────────────────────────────

  describe('GET /wiki/:page — redirect', () => {
    test('redirects to /view/:page without query string', async () => {
      const res = await request(app).get('/wiki/TestPage');

      expect(res.status).toBe(301);
      expect(res.headers.location).toBe('/view/TestPage');
    });

    test('redirects to /view/:page preserving query string', async () => {
      const res = await request(app).get('/wiki/TestPage?version=3');

      expect(res.status).toBe(301);
      expect(res.headers.location).toBe('/view/TestPage?version=3');
    });
  });

  // ── GET /api/user-keywords — apiGetUserKeywords ───────────────────────────

  describe('GET /api/user-keywords — apiGetUserKeywords', () => {
    test('returns empty list when no keywords configured', async () => {
      const res = await request(app).get('/api/user-keywords');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.keywords).toHaveLength(0);
    });

    test('returns keywords with page existence status', async () => {
      mockConfigManager.getProperty.mockImplementation((key: string, def: unknown) => {
        if (key === 'ngdpbase.user-keywords') {
          return { tag1: { label: 'Tag One' }, tag2: {} };
        }
        if (key === 'ngdpbase.front-page') return 'Welcome';
        if (key === 'ngdpbase.theme.active') return 'default';
        if (key === 'ngdpbase.application-name') return 'ngdpbase';
        if (key === 'ngdpbase.cache.rendered-pages.enabled') return true;
        return def;
      });
      mockPageManager.pageExists.mockImplementation((name: string) => name === 'Tag One');

      const res = await request(app).get('/api/user-keywords');

      expect(res.status).toBe(200);
      expect(res.body.keywords).toHaveLength(2);
      expect(res.body.stats.withPages).toBe(1);
      expect(res.body.stats.missingPages).toBe(1);
    });
  });

  // ── POST /api/user/display-theme — updateDisplayTheme ────────────────────

  describe('POST /api/user/display-theme — updateDisplayTheme', () => {
    const csrf = 'test-csrf-token';

    test('returns 401 when user is not authenticated', async () => {
      mockUserContext = null;

      const res = await request(app)
        .post('/api/user/display-theme')
        .send({ theme: 'dark', _csrf: csrf });

      expect(res.status).toBe(401);
    });

    test('returns 400 for invalid theme value', async () => {
      const res = await request(app)
        .post('/api/user/display-theme')
        .send({ theme: 'purple', _csrf: csrf });

      expect(res.status).toBe(400);
    });

    test('returns 200 when theme is updated successfully', async () => {
      const res = await request(app)
        .post('/api/user/display-theme')
        .send({ theme: 'dark', _csrf: csrf });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    test('accepts system theme', async () => {
      const res = await request(app)
        .post('/api/user/display-theme')
        .send({ theme: 'system', _csrf: csrf });

      expect(res.status).toBe(200);
    });
  });

  // ── POST /api/user/pinned-pages — addPinnedPage ───────────────────────────

  describe('POST /api/user/pinned-pages — addPinnedPage', () => {
    const csrf = 'test-csrf-token';

    test('returns 401 when user is not authenticated', async () => {
      mockUserContext = null;

      const res = await request(app)
        .post('/api/user/pinned-pages')
        .send({ pageName: 'TestPage', _csrf: csrf });

      expect(res.status).toBe(401);
    });

    test('returns 400 when pageName is missing', async () => {
      const res = await request(app)
        .post('/api/user/pinned-pages')
        .send({ pageName: '', _csrf: csrf });

      expect(res.status).toBe(400);
    });

    test('adds page to pinned pages', async () => {
      const res = await request(app)
        .post('/api/user/pinned-pages')
        .send({ pageName: 'NewPage', title: 'New Page', _csrf: csrf });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.pinnedPages).toHaveLength(1);
    });

    test('does not add duplicate page', async () => {
      mockUserContext = {
        ...adminUser,
        preferences: { 'nav.pinnedPages': [{ pageName: 'TestPage', title: 'Test' }] }
      };

      const res = await request(app)
        .post('/api/user/pinned-pages')
        .send({ pageName: 'TestPage', _csrf: csrf });

      expect(res.status).toBe(200);
      expect(res.body.pinnedPages).toHaveLength(1);
    });
  });

  // ── DELETE /api/user/pinned-pages/:pageName — removePinnedPage ───────────

  describe('DELETE /api/user/pinned-pages/:pageName — removePinnedPage', () => {
    const csrf = 'test-csrf-token';

    test('returns 401 when user is not authenticated', async () => {
      mockUserContext = null;

      const res = await request(app)
        .delete('/api/user/pinned-pages/TestPage')
        .set('x-csrf-token', csrf);

      expect(res.status).toBe(401);
    });

    test('removes page from pinned pages', async () => {
      mockUserContext = {
        ...adminUser,
        preferences: { 'nav.pinnedPages': [{ pageName: 'TestPage', title: 'Test' }] }
      };

      const res = await request(app)
        .delete('/api/user/pinned-pages/TestPage')
        .set('x-csrf-token', csrf);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.pinnedPages).toHaveLength(0);
    });
  });

  // ── PUT /api/user/pinned-pages/order — reorderPinnedPages ────────────────

  describe('PUT /api/user/pinned-pages/order — reorderPinnedPages', () => {
    const csrf = 'test-csrf-token';

    test('returns 401 when user is not authenticated', async () => {
      mockUserContext = null;

      const res = await request(app)
        .put('/api/user/pinned-pages/order')
        .set('x-csrf-token', csrf)
        .send({ order: ['PageA', 'PageB'] });

      expect(res.status).toBe(401);
    });

    test('reorders pinned pages', async () => {
      mockUserContext = {
        ...adminUser,
        preferences: { 'nav.pinnedPages': [{ pageName: 'PageB', title: 'B' }, { pageName: 'PageA', title: 'A' }] }
      };

      const res = await request(app)
        .put('/api/user/pinned-pages/order')
        .set('x-csrf-token', csrf)
        .send({ order: ['PageA', 'PageB'] });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── POST /api/page/:identifier/restore/:version — restorePageVersion ─────

  describe('POST /api/page/:identifier/restore/:version — restorePageVersion', () => {
    const csrf = 'test-csrf-token';

    test('returns 400 for invalid version number', async () => {
      const res = await request(app)
        .post('/api/page/TestPage/restore/abc')
        .send({ _csrf: csrf });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid version/i);
    });

    test('returns 401 when user is not authenticated', async () => {
      mockUserContext = null;

      const res = await request(app)
        .post('/api/page/TestPage/restore/1')
        .send({ _csrf: csrf });

      expect(res.status).toBe(401);
    });

    test('returns 501 when provider does not support version restore', async () => {
      mockPageManager.provider = null;

      const res = await request(app)
        .post('/api/page/TestPage/restore/1')
        .send({ _csrf: csrf });

      expect(res.status).toBe(501);
    });

    test('restores page and returns new version number', async () => {
      mockPageManager.provider = {
        restoreVersion: vi.fn().mockResolvedValue(3)
      };

      const res = await request(app)
        .post('/api/page/TestPage/restore/1')
        .send({ _csrf: csrf, comment: 'rolling back' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.newVersion).toBe(3);
    });
  });

  // ── error-path coverage for versioning handlers ───────────────────────────

  describe('versioning handler error paths', () => {
    test('getPageVersions returns 404 on "not found" provider error', async () => {
      mockPageManager.provider = {
        getVersionHistory: vi.fn().mockRejectedValue(new Error('Page not found in store'))
      };

      const res = await request(app).get('/api/page/MissingPage/versions');

      expect(res.status).toBe(404);
    });

    test('getPageVersion returns 404 on "not found" provider error', async () => {
      mockPageManager.provider = {
        getPageVersion: vi.fn().mockRejectedValue(new Error('Page not found'))
      };

      const res = await request(app).get('/api/page/MissingPage/version/1');

      expect(res.status).toBe(404);
    });

    test('getPageVersion returns 404 on "does not exist" error', async () => {
      mockPageManager.provider = {
        getPageVersion: vi.fn().mockRejectedValue(new Error('Version does not exist'))
      };

      const res = await request(app).get('/api/page/TestPage/version/99');

      expect(res.status).toBe(404);
    });

    test('comparePageVersions returns 404 on "not found" error', async () => {
      mockPageManager.provider = {
        compareVersions: vi.fn().mockRejectedValue(new Error('Page not found'))
      };

      const res = await request(app).get('/api/page/MissingPage/compare/1/2');

      expect(res.status).toBe(404);
    });

    test('restorePageVersion returns 404 on "not found" error', async () => {
      const csrf = 'test-csrf-token';
      mockPageManager.provider = {
        restoreVersion: vi.fn().mockRejectedValue(new Error('Page not found'))
      };

      const res = await request(app)
        .post('/api/page/MissingPage/restore/1')
        .send({ _csrf: csrf });

      expect(res.status).toBe(404);
    });
  });

});
