/**
 * WikiRoutes coverage batch 8 — save, create, preview, magic link:
 *   POST /save/:page              (savePage)
 *   POST /create                  (createPageFromTemplate)
 *   POST /api/preview             (previewPage)
 *   GET  /auth/magic-link/verify  (verifyMagicLink)
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
  savePageWithContext: vi.fn(),
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
  getPageSystemKeywords: vi.fn(),
  updatePageInIndex: vi.fn()
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
  getFencedCodeTags: vi.fn().mockReturnValue(new Set<string>())
};

const mockNotificationManager = {
  getNotifications: vi.fn().mockReturnValue([]),
  getAllNotifications: vi.fn().mockReturnValue([]),
  getStats: vi.fn().mockReturnValue({ total: 0, active: 0, expired: 0, byType: {}, byLevel: {} }),
  dismissNotification: vi.fn(),
  clearAllActive: vi.fn(),
  createNotification: vi.fn().mockResolvedValue(undefined)
};

const mockTemplateManager = {
  getTemplates: vi.fn().mockResolvedValue([{ name: 'blank', content: '# {{pageName}}' }]),
  applyTemplate: vi.fn().mockReturnValue('# Template content')
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
          TemplateManager: mockTemplateManager,
          FootnoteManager: { isEnabled: vi.fn().mockReturnValue(false) },
          MarkupParser: { invalidateHandlerCache: vi.fn().mockResolvedValue(undefined) },
          ValidationManager: {
            validateContent: vi.fn().mockResolvedValue({ isValid: true }),
            validateMetadata: vi.fn().mockResolvedValue({ isValid: true }),
            // Mirror the real impl's spread pattern (ValidationManager.ts:714) so
            // caller-supplied options like author-lock / private actually land in
            // the returned metadata. Earlier hardcoded mock dropped options silently.
            generateValidMetadata: vi.fn().mockImplementation((title: string, options: Record<string, unknown> = {}) => ({
              title, uuid: 'test-uuid-1', 'system-category': 'general', 'user-keywords': [],
              author: 'testuser', created: new Date().toISOString(), modified: new Date().toISOString(),
              ...options
            }))
          },
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

const existingPageData = {
  content: '# Page content',
  metadata: {
    title: 'TestPage', 'system-category': 'general', uuid: 'test-uuid-1',
    'user-keywords': [], 'system-keywords': [], author: 'testuser'
  },
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
    return Promise.resolve(existingPageData);
  });
  mockPageManager.getPageContent.mockResolvedValue('# Page content');
  mockPageManager.getPageMetadata.mockResolvedValue({ title: 'TestPage', uuid: 'test-uuid-1', 'user-keywords': [], 'system-keywords': [], 'system-category': 'general' });
  mockPageManager.getAllPages.mockResolvedValue(['Welcome', 'TestPage']);
  mockPageManager.getPageNames.mockResolvedValue(['Welcome', 'TestPage']);
  mockPageManager.getAllPageNames.mockResolvedValue(['Welcome', 'TestPage']);
  mockPageManager.savePage.mockResolvedValue(true);
  mockPageManager.savePageWithContext.mockResolvedValue(true);
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
  mockSearchManager.updatePageInIndex.mockResolvedValue(undefined);

  mockExportManager.getExports.mockResolvedValue([]);
  mockExportManager.exportPageToHtml.mockResolvedValue('<html>exported</html>');
  mockExportManager.saveExport.mockResolvedValue('/tmp/test-export.html');
  mockExportManager.exportToMarkdown.mockResolvedValue('# markdown');

  mockTemplateManager.getTemplates.mockResolvedValue([{ name: 'blank', content: '# {{pageName}}' }]);
  mockTemplateManager.applyTemplate.mockReturnValue('# Template content');

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
  mockNotificationManager.createNotification.mockResolvedValue(undefined);
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

describe('WikiRoutes — coverage batch 8', () => {
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

  // ── POST /save/:page (savePage) ─────────────────────────────────────────────

  describe('POST /save/:page (savePage)', () => {
    test('returns 400 when system-category is missing', async () => {
      const res = await request(app)
        .post('/save/TestPage')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ content: '# Hello' });
      expect(res.status).toBe(400);
      expect(res.text).toContain('system-category');
    });

    test('returns 400 when system-category is invalid', async () => {
      const res = await request(app)
        .post('/save/TestPage')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ content: '# Hello', 'system-category': 'invalid-cat' });
      expect(res.status).toBe(400);
      expect(res.text).toContain('Invalid system-category');
    });

    test('returns 400 when title contains invalid characters', async () => {
      const res = await request(app)
        .post('/save/TestPage')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ content: '# Hello', 'system-category': 'general', title: 'Bad/Title' });
      expect(res.status).toBe(400);
      expect(res.text).toContain('invalid characters');
    });

    test('redirects to /view/:page on successful save of existing page', async () => {
      const res = await request(app)
        .post('/save/TestPage')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ content: '# Hello', 'system-category': 'general', title: 'TestPage' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/view/');
    });

    test('redirects to /view/:page on successful save of new page', async () => {
      mockPageManager.getPage.mockImplementation((name: string) => {
        if (['LeftMenu', 'Footer', 'left-menu-content', 'footer-content', 'BrandNew'].includes(name)) return Promise.resolve(null);
        return Promise.resolve(existingPageData);
      });
      const res = await request(app)
        .post('/save/BrandNew')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ content: '# New', 'system-category': 'general', title: 'BrandNew' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/view/');
    });

    test('returns 403 when user lacks required permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .post('/save/TestPage')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ content: '# Hello', 'system-category': 'general', title: 'TestPage' });
      expect(res.status).toBe(403);
    });

    test('returns 500 when savePageWithContext throws', async () => {
      mockPageManager.savePageWithContext.mockRejectedValue(new Error('disk full'));
      const res = await request(app)
        .post('/save/TestPage')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ content: '# Hello', 'system-category': 'general', title: 'TestPage' });
      expect(res.status).toBe(500);
    });
  });

  // ── POST /create (createPageFromTemplate) ───────────────────────────────────

  describe('POST /create (createPageFromTemplate)', () => {
    test('returns 400 when pageName is missing', async () => {
      const res = await request(app)
        .post('/create')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ templateName: 'blank' });
      expect(res.status).toBe(400);
      expect(res.text).toContain('required');
    });

    test('returns 400 when templateName is missing', async () => {
      const res = await request(app)
        .post('/create')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ pageName: 'NewPage' });
      expect(res.status).toBe(400);
      expect(res.text).toContain('required');
    });

    test('returns 400 when pageName contains invalid characters', async () => {
      const res = await request(app)
        .post('/create')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ pageName: 'Bad/Page', templateName: 'blank', 'system-category': 'general' });
      expect(res.status).toBe(400);
      expect(res.text).toContain('invalid characters');
    });

    test('returns 400 when system-category is invalid', async () => {
      const res = await request(app)
        .post('/create')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ pageName: 'NewPage', templateName: 'blank', 'system-category': 'unknown-cat' });
      expect(res.status).toBe(400);
    });

    test('returns 409 when page already exists', async () => {
      const res = await request(app)
        .post('/create')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ pageName: 'TestPage', templateName: 'blank', 'system-category': 'general' });
      expect(res.status).toBe(409);
    });

    test('redirects to /edit/:page on successful creation', async () => {
      mockPageManager.getPage.mockImplementation((name: string) => {
        if (['LeftMenu', 'Footer', 'left-menu-content', 'footer-content', 'FreshPage'].includes(name)) return Promise.resolve(null);
        return Promise.resolve(existingPageData);
      });
      const res = await request(app)
        .post('/create')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ pageName: 'FreshPage', templateName: 'blank', 'system-category': 'general' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/edit/FreshPage');
    });

    test('redirects to login for unauthenticated user', async () => {
      mockUserContext = null;
      const res = await request(app)
        .post('/create')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ pageName: 'FreshPage', templateName: 'blank', 'system-category': 'general' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/login');
    });

    test('returns 403 when user lacks page-create permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      mockPageManager.getPage.mockImplementation((name: string) => {
        if (['LeftMenu', 'Footer', 'left-menu-content', 'footer-content', 'AnotherPage'].includes(name)) return Promise.resolve(null);
        return Promise.resolve(existingPageData);
      });
      const res = await request(app)
        .post('/create')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ pageName: 'AnotherPage', templateName: 'blank', 'system-category': 'general' });
      expect(res.status).toBe(403);
    });

    // ── #697: Private + Author-lock checkboxes wire through to metadata ────

    test('#697: passes author-lock=true through to saved metadata when checkbox submitted', async () => {
      mockPageManager.getPage.mockImplementation((name: string) => {
        if (['LeftMenu', 'Footer', 'left-menu-content', 'footer-content', 'LockedNew'].includes(name)) return Promise.resolve(null);
        return Promise.resolve(existingPageData);
      });
      mockPageManager.savePageWithContext.mockClear();

      const res = await request(app)
        .post('/create')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ pageName: 'LockedNew', templateName: 'blank', 'system-category': 'general', 'author-lock': 'true' });

      expect(res.status).toBe(302);
      const callArgs = mockPageManager.savePageWithContext.mock.calls[0];
      const savedMetadata = callArgs[1] as Record<string, unknown>;
      expect(savedMetadata['author-lock']).toBe(true);
    });

    test('#697: passes private=true through to saved metadata when checkbox submitted', async () => {
      mockPageManager.getPage.mockImplementation((name: string) => {
        if (['LeftMenu', 'Footer', 'left-menu-content', 'footer-content', 'PrivateNew'].includes(name)) return Promise.resolve(null);
        return Promise.resolve(existingPageData);
      });
      mockPageManager.savePageWithContext.mockClear();

      const res = await request(app)
        .post('/create')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ pageName: 'PrivateNew', templateName: 'blank', 'system-category': 'general', private: 'true' });

      expect(res.status).toBe(302);
      const callArgs = mockPageManager.savePageWithContext.mock.calls[0];
      const savedMetadata = callArgs[1] as Record<string, unknown>;
      expect(savedMetadata.private).toBe(true);
    });

    test('audience: passes a single audience role through to saved metadata', async () => {
      mockPageManager.getPage.mockImplementation((name: string) => {
        if (['LeftMenu', 'Footer', 'left-menu-content', 'footer-content', 'AudPageA'].includes(name)) return Promise.resolve(null);
        return Promise.resolve(existingPageData);
      });
      mockPageManager.savePageWithContext.mockClear();

      const res = await request(app)
        .post('/create')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ pageName: 'AudPageA', templateName: 'blank', 'system-category': 'general', audience: 'editor' });

      expect(res.status).toBe(302);
      const callArgs = mockPageManager.savePageWithContext.mock.calls[0];
      const savedMetadata = callArgs[1] as Record<string, unknown>;
      expect(savedMetadata.audience).toEqual(['editor']);
    });

    test('audience: passes multi-value audience array through to saved metadata', async () => {
      mockPageManager.getPage.mockImplementation((name: string) => {
        if (['LeftMenu', 'Footer', 'left-menu-content', 'footer-content', 'AudPageB'].includes(name)) return Promise.resolve(null);
        return Promise.resolve(existingPageData);
      });
      mockPageManager.savePageWithContext.mockClear();

      const res = await request(app)
        .post('/create')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ pageName: 'AudPageB', templateName: 'blank', 'system-category': 'general', audience: ['editor', 'contributor'] });

      expect(res.status).toBe(302);
      const callArgs = mockPageManager.savePageWithContext.mock.calls[0];
      const savedMetadata = callArgs[1] as Record<string, unknown>;
      expect(savedMetadata.audience).toEqual(['editor', 'contributor']);
    });

    test('audience: omits audience from metadata when no checkboxes submitted', async () => {
      mockPageManager.getPage.mockImplementation((name: string) => {
        if (['LeftMenu', 'Footer', 'left-menu-content', 'footer-content', 'AudPageC'].includes(name)) return Promise.resolve(null);
        return Promise.resolve(existingPageData);
      });
      mockPageManager.savePageWithContext.mockClear();

      const res = await request(app)
        .post('/create')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ pageName: 'AudPageC', templateName: 'blank', 'system-category': 'general' });

      expect(res.status).toBe(302);
      const callArgs = mockPageManager.savePageWithContext.mock.calls[0];
      const savedMetadata = callArgs[1] as Record<string, unknown>;
      expect(savedMetadata.audience).toBeUndefined();
    });

    test('#697: omits author-lock and private from metadata when checkboxes absent', async () => {
      mockPageManager.getPage.mockImplementation((name: string) => {
        if (['LeftMenu', 'Footer', 'left-menu-content', 'footer-content', 'PlainNew'].includes(name)) return Promise.resolve(null);
        return Promise.resolve(existingPageData);
      });
      mockPageManager.savePageWithContext.mockClear();

      const res = await request(app)
        .post('/create')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ pageName: 'PlainNew', templateName: 'blank', 'system-category': 'general' });

      expect(res.status).toBe(302);
      const callArgs = mockPageManager.savePageWithContext.mock.calls[0];
      const savedMetadata = callArgs[1] as Record<string, unknown>;
      expect(savedMetadata['author-lock']).toBeUndefined();
      expect(savedMetadata.private).toBeUndefined();
    });
  });

  // ── POST /api/preview (previewPage) ─────────────────────────────────────────

  describe('POST /api/preview (previewPage)', () => {
    test('returns rendered HTML JSON for valid content', async () => {
      const res = await request(app)
        .post('/api/preview')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ content: '# Hello World', pageName: 'TestPage' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.html).toBeDefined();
    });

    test('returns 500 JSON when textToHTML throws', async () => {
      mockRenderingManager.textToHTML.mockRejectedValue(new Error('render fail'));
      const res = await request(app)
        .post('/api/preview')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ content: '# Broken', pageName: 'TestPage' });
      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  // ── GET /auth/magic-link/verify (verifyMagicLink) ───────────────────────────

  describe('GET /auth/magic-link/verify (verifyMagicLink)', () => {
    test('redirects to /login when no token is provided (no AuthManager)', async () => {
      const res = await request(app).get('/auth/magic-link/verify');
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/login');
    });

    test('redirects to /login when token provided but AuthManager not available', async () => {
      const res = await request(app).get('/auth/magic-link/verify?token=sometoken');
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/login');
    });
  });
});
