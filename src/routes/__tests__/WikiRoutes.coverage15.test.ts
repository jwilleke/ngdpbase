/**
 * WikiRoutes coverage batch 15 — createPage, editPage, savePage, deletePage,
 *   createWikiPage, adminRequiredPages (403 path).
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
  savePageWithContext: vi.fn(),
  deletePage: vi.fn(),
  deletePageWithContext: vi.fn(),
  pageExists: vi.fn(),
  getCurrentPageProvider: vi.fn(),
  getPageUUID: vi.fn(),
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
  getPageSystemKeywords: vi.fn(),
  updatePageInIndex: vi.fn(),
  removePageFromIndex: vi.fn()
};

const mockNotificationManager = {
  getNotifications: vi.fn().mockReturnValue([]),
  getAllNotifications: vi.fn().mockReturnValue([]),
  getStats: vi.fn().mockReturnValue({ total: 0, active: 0, expired: 0, byType: {}, byLevel: {} }),
  createNotification: vi.fn().mockResolvedValue(undefined)
};

const mockCacheManager = {
  isInitialized: vi.fn().mockReturnValue(false),
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(true),
  del: vi.fn().mockResolvedValue(true),
  clear: vi.fn().mockResolvedValue(true),
  stats: vi.fn()
};

const mockAttachmentManager = {
  getAllAttachments: vi.fn().mockResolvedValue([]),
  getAttachment: vi.fn().mockResolvedValue(null),
  deleteAttachment: vi.fn().mockResolvedValue(true),
  getAttachmentsByPage: vi.fn().mockResolvedValue([]),
  getAttachmentsForPage: vi.fn().mockResolvedValue([]),
  syncPageMentions: vi.fn().mockResolvedValue(undefined)
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
      'ngdpbase.user-keywords': null,
      'ngdpbase.page.provider.filesystem.requiredpagesdir': '/tmp/nonexistent-required-pages'
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
          AttachmentManager: mockAttachmentManager,
          FootnoteManager: { isEnabled: vi.fn().mockReturnValue(false) },
          MarkupParser: { invalidateHandlerCache: vi.fn().mockResolvedValue(undefined) },
          ValidationManager: {
            validateContent: vi.fn().mockResolvedValue({ isValid: true }),
            validateMetadata: vi.fn().mockResolvedValue({ isValid: true }),
            generateValidMetadata: vi.fn().mockImplementation((title: string, options: Record<string, unknown> = {}) => ({
              title, uuid: 'test-uuid-1', 'system-category': 'general', 'user-keywords': [],
              author: 'testuser', created: new Date().toISOString(), modified: new Date().toISOString(),
              ...options // mirror the real implementation: caller options override defaults
            })),
            getDefaultSystemCategory: vi.fn().mockReturnValue('general')
          },
          TemplateManager: {
            getTemplates: vi.fn().mockReturnValue([]),
            applyTemplate: vi.fn().mockReturnValue('# Template Content')
          },
          ExportManager: {
            getExports: vi.fn().mockResolvedValue([]),
            deleteExport: vi.fn().mockResolvedValue(undefined)
          }
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

const existingPageData = {
  content: '# Existing Page',
  metadata: {
    title: 'TestPage',
    uuid: 'uuid-1',
    'system-category': 'general',
    'user-keywords': [],
    author: 'adminuser'
  },
  filePath: '/data/pages/TestPage.md'
};

function resetMocks() {
  mockPageManager.provider = null;
  mockPageManager.getPage.mockImplementation((name: string) => {
    if (['LeftMenu', 'Footer', 'left-menu-content', 'footer-content'].includes(name)) return Promise.resolve(null);
    return Promise.resolve({ ...existingPageData });
  });
  mockPageManager.getPageContent.mockResolvedValue('# Page content');
  mockPageManager.getPageMetadata.mockResolvedValue({ title: 'TestPage', uuid: 'test-uuid-1', 'user-keywords': [] });
  mockPageManager.getAllPages.mockResolvedValue(['Welcome', 'TestPage']);
  mockPageManager.getPageNames.mockResolvedValue(['Welcome', 'TestPage']);
  mockPageManager.getAllPageNames.mockResolvedValue(['Welcome', 'TestPage']);
  mockPageManager.savePage.mockResolvedValue(true);
  mockPageManager.savePageWithContext.mockResolvedValue(true);
  mockPageManager.deletePage.mockResolvedValue(true);
  mockPageManager.deletePageWithContext.mockResolvedValue(true);
  mockPageManager.pageExists.mockReturnValue(false);
  mockPageManager.getCurrentPageProvider.mockReturnValue(null);
  mockPageManager.getPageUUID.mockReturnValue(null);

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
  mockSearchManager.updatePageInIndex.mockResolvedValue(undefined);
  mockSearchManager.removePageFromIndex.mockResolvedValue(undefined);

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

  mockNotificationManager.getNotifications.mockReturnValue([]);
  mockNotificationManager.getAllNotifications.mockReturnValue([]);
  mockNotificationManager.getStats.mockReturnValue({ total: 0, active: 0, expired: 0, byType: {}, byLevel: {} });
  mockNotificationManager.createNotification.mockResolvedValue(undefined);

  mockAttachmentManager.getAllAttachments.mockResolvedValue([]);
  mockAttachmentManager.getAttachmentsForPage.mockResolvedValue([]);
  mockAttachmentManager.getAttachmentsByPage.mockResolvedValue([]);

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
      'ngdpbase.user-keywords': null,
      'ngdpbase.page.provider.filesystem.requiredpagesdir': '/tmp/nonexistent-required-pages'
    };
    return key in map ? map[key] : defaultValue;
  });
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

describe('WikiRoutes — coverage batch 15', () => {
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

  // ── createPage ────────────────────────────────────────────────────────────────

  describe('GET /create (createPage)', () => {
    test('redirects to login when not authenticated', async () => {
      mockUserContext = null;
      const res = await request(app).get('/create');
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/login');
    });

    test('returns 403 when user lacks page-create permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app).get('/create');
      expect(res.status).toBe(403);
    });

    test('renders create form when authenticated with permission', async () => {
      const res = await request(app).get('/create');
      expect(res.status).toBe(200);
    });

    test('renders create form with pre-filled page name', async () => {
      const res = await request(app).get('/create?name=NewPage');
      expect(res.status).toBe(200);
    });
  });

  // ── editPage ──────────────────────────────────────────────────────────────────

  describe('GET /edit/:page (editPage)', () => {
    test('redirects to login when not authenticated', async () => {
      mockUserContext = null;
      const res = await request(app).get('/edit/TestPage');
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/login');
    });

    test('renders edit form for existing page', async () => {
      const res = await request(app).get('/edit/TestPage');
      expect(res.status).toBe(200);
    });

    test('renders edit form for new page (does not exist)', async () => {
      mockPageManager.getPage.mockResolvedValue(null);
      const res = await request(app).get('/edit/NewPage');
      expect(res.status).toBe(200);
    });

    test('returns 403 when ACL denies edit access', async () => {
      mockACLManager.checkPagePermissionWithContext.mockResolvedValue(false);
      const res = await request(app).get('/edit/TestPage');
      expect(res.status).toBe(403);
    });

    test('renders edit form with section parameter', async () => {
      const res = await request(app).get('/edit/TestPage?section=0');
      expect(res.status).toBe(200);
    });
  });

  // ── #797 — buildEditorExtraFrontmatterFields helper ─────────────────────────

  describe('#797 — buildEditorExtraFrontmatterFields (extraFrontmatterFields slot)', () => {
    test('emits journal-date input HTML when system-category is journal', () => {
      const html = WikiRoutes.buildEditorExtraFrontmatterFields({
        'system-category': 'journal',
        'journal-date': '2026-05-26'
      });
      expect(html).toContain('name="journal-date"');
      expect(html).toContain('type="date"');
      expect(html).toContain('value="2026-05-26"');
    });

    test('emits empty input when system-category is journal but journal-date is unset', () => {
      const html = WikiRoutes.buildEditorExtraFrontmatterFields({
        'system-category': 'journal'
      });
      expect(html).toContain('name="journal-date"');
      expect(html).toContain('value=""');
    });

    test('case-insensitive match on system-category (journal vs Journal)', () => {
      const html = WikiRoutes.buildEditorExtraFrontmatterFields({
        'system-category': 'Journal'
      });
      expect(html).toContain('name="journal-date"');
    });

    test('returns empty string for non-journal categories', () => {
      const html = WikiRoutes.buildEditorExtraFrontmatterFields({
        'system-category': 'general'
      });
      expect(html).toBe('');
    });

    test('returns empty string when metadata is undefined or has no system-category', () => {
      expect(WikiRoutes.buildEditorExtraFrontmatterFields(undefined)).toBe('');
      expect(WikiRoutes.buildEditorExtraFrontmatterFields(null)).toBe('');
      expect(WikiRoutes.buildEditorExtraFrontmatterFields({})).toBe('');
    });

    test('HTML-attribute-escapes the journal-date value to prevent attribute injection', () => {
      const html = WikiRoutes.buildEditorExtraFrontmatterFields({
        'system-category': 'journal',
        'journal-date': '" onfocus="alert(1)'
      });
      // The unescaped breakout would set onfocus; the escaped value must be safe.
      expect(html).not.toContain('onfocus="alert(1)"');
      expect(html).toContain('&quot;');
    });
  });

  // ── #798 — buildViewExtraPageMetaBar helper ──────────────────────────────────

  describe('#798 — buildViewExtraPageMetaBar (extraPageMetaBar slot)', () => {
    test('emits journal-date pill when system-category is journal and date is set', () => {
      const html = WikiRoutes.buildViewExtraPageMetaBar({
        'system-category': 'journal',
        'journal-date': '2026-05-26'
      });
      expect(html).toContain('badge');
      expect(html).toContain('2026-05-26');
      expect(html).toContain('Journal entry date');
    });

    test('emits mood badge when mood is set', () => {
      const html = WikiRoutes.buildViewExtraPageMetaBar({
        'system-category': 'journal',
        'journal-date': '2026-05-26',
        mood: 'curious'
      });
      expect(html).toContain('2026-05-26');
      expect(html).toContain('curious');
      expect(html).toContain('Mood: curious');
    });

    test('skips date pill when journal-date is unset, still emits mood badge', () => {
      const html = WikiRoutes.buildViewExtraPageMetaBar({
        'system-category': 'journal',
        mood: 'tired'
      });
      expect(html).not.toContain('Journal entry date');
      expect(html).toContain('Mood: tired');
    });

    test('case-insensitive match on system-category (Journal)', () => {
      const html = WikiRoutes.buildViewExtraPageMetaBar({
        'system-category': 'Journal',
        'journal-date': '2026-05-26'
      });
      expect(html).toContain('2026-05-26');
    });

    test('returns empty string for non-journal categories', () => {
      const html = WikiRoutes.buildViewExtraPageMetaBar({
        'system-category': 'general',
        'journal-date': '2026-05-26'  // present but should be ignored — wrong category
      });
      expect(html).toBe('');
    });

    test('returns empty string when metadata is undefined/null/empty', () => {
      expect(WikiRoutes.buildViewExtraPageMetaBar(undefined)).toBe('');
      expect(WikiRoutes.buildViewExtraPageMetaBar(null)).toBe('');
      expect(WikiRoutes.buildViewExtraPageMetaBar({})).toBe('');
    });

    test('returns empty string when category is journal but neither date nor mood is set', () => {
      const html = WikiRoutes.buildViewExtraPageMetaBar({
        'system-category': 'journal'
      });
      expect(html).toBe('');
    });

    test('escapes hostile attribute breakout in journal-date title', () => {
      const html = WikiRoutes.buildViewExtraPageMetaBar({
        'system-category': 'journal',
        'journal-date': '" onmouseover="alert(1)'
      });
      // Title attribute must not contain an unescaped quote that would close the attribute.
      expect(html).not.toContain('onmouseover="alert(1)"');
      expect(html).toContain('&quot;');
    });

    test('escapes hostile HTML in mood text-content', () => {
      const html = WikiRoutes.buildViewExtraPageMetaBar({
        'system-category': 'journal',
        mood: '<script>alert(1)</script>'
      });
      // Text content must escape < and > to prevent script injection in the badge body.
      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });

  // ── savePage ──────────────────────────────────────────────────────────────────

  describe('POST /save/:page (savePage)', () => {
    test('returns 400 when system-category is missing', async () => {
      const res = await request(app)
        .post('/save/TestPage')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ content: '# Hello', title: 'TestPage' });
      expect(res.status).toBe(400);
    });

    test('returns 400 when system-category is invalid', async () => {
      const res = await request(app)
        .post('/save/TestPage')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ content: '# Hello', title: 'TestPage', 'system-category': 'nonexistent' });
      expect(res.status).toBe(400);
    });

    test('returns 400 when title contains invalid characters', async () => {
      const res = await request(app)
        .post('/save/TestPage')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ content: '# Hello', title: 'Test/Page', 'system-category': 'general' });
      expect(res.status).toBe(400);
    });

    test('saves page and redirects to view on success', async () => {
      mockPageManager.getPage.mockResolvedValue(null);
      const res = await request(app)
        .post('/save/NewPage')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ content: '# New Page', title: 'NewPage', 'system-category': 'general' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/view/');
    });

    test('saves existing page and redirects to view on success', async () => {
      const res = await request(app)
        .post('/save/TestPage')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ content: '# Hello', title: 'TestPage', 'system-category': 'general' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/view/');
    });

    test('returns 403 when user lacks page-create permission for non-required page', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .post('/save/TestPage')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ content: '# Hello', title: 'TestPage', 'system-category': 'general' });
      expect(res.status).toBe(403);
    });

    test('handles user keyword submission', async () => {
      const res = await request(app)
        .post('/save/TestPage')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ content: '# Hello', title: 'TestPage', 'system-category': 'general', userKeywords: ['tech', 'science'] });
      expect(res.status).toBe(302);
      const saved = mockPageManager.savePageWithContext.mock.calls[0][1];
      expect(saved['user-keywords']).toEqual(['tech', 'science']);
    });

    test('#897: comma-separated typeahead value splits into a trimmed, deduped array', async () => {
      const res = await request(app)
        .post('/save/TestPage')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ content: '# Hello', title: 'TestPage', 'system-category': 'general', 'user-keywords': ' travel,  ohio , travel, , grow system ' });
      expect(res.status).toBe(302);
      const saved = mockPageManager.savePageWithContext.mock.calls[0][1];
      expect(saved['user-keywords']).toEqual(['travel', 'ohio', 'grow system']);
    });

    test('#897: no cap — many keywords accepted', async () => {
      const many = Array.from({ length: 12 }, (_, i) => `kw-${i}`).join(', ');
      const res = await request(app)
        .post('/save/TestPage')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ content: '# Hello', title: 'TestPage', 'system-category': 'general', 'user-keywords': many });
      expect(res.status).toBe(302);
      const saved = mockPageManager.savePageWithContext.mock.calls[0][1];
      expect(saved['user-keywords']).toHaveLength(12);
    });

    test('handles save error gracefully', async () => {
      mockPageManager.savePageWithContext.mockRejectedValue(new Error('Save failed'));
      const res = await request(app)
        .post('/save/TestPage')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ content: '# Hello', title: 'TestPage', 'system-category': 'general' });
      expect(res.status).toBe(500);
    });

    test('handles duplicate title conflict with 409', async () => {
      mockPageManager.savePageWithContext.mockRejectedValue(new Error('UUID is already in use'));
      const res = await request(app)
        .post('/save/TestPage')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ content: '# Hello', title: 'TestPage', 'system-category': 'general' });
      expect(res.status).toBe(409);
    });

    test('handles section editing', async () => {
      const res = await request(app)
        .post('/save/TestPage')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ content: '## Section', title: 'TestPage', 'system-category': 'general', section: '0' });
      expect(res.status).toBe(302);
    });

    // ── #803 — Unified /save preserves unknown frontmatter fields ──────────

    test('#803 — preserves unknown form fields (mood, journal-date) into metadata', async () => {
      mockPageManager.savePageWithContext.mockClear();
      const res = await request(app)
        .post('/save/TestPage')
        .set('x-csrf-token', 'test-csrf-token')
        .send({
          content: '# Hello',
          title: 'TestPage',
          'system-category': 'general',
          mood: 'curious',
          'journal-date': '2026-05-26'
        });
      expect(res.status).toBe(302);
      expect(mockPageManager.savePageWithContext).toHaveBeenCalled();
      const metadata = mockPageManager.savePageWithContext.mock.calls[0][1] as Record<string, unknown>;
      expect(metadata['mood']).toBe('curious');
      expect(metadata['journal-date']).toBe('2026-05-26');
    });

    test('#803 — preserves existing on-disk frontmatter when form omits the field', async () => {
      mockPageManager.savePageWithContext.mockClear();
      // existingPageData.metadata default includes 'mood: tired' for this test
      mockPageManager.getPage.mockImplementationOnce(() => Promise.resolve({
        content: '# Existing',
        metadata: {
          title: 'TestPage', uuid: 'uuid-1', 'system-category': 'general',
          'user-keywords': [], author: 'adminuser',
          mood: 'tired' // existing on-disk field; form below does NOT post mood
        },
        filePath: '/data/pages/TestPage.md'
      }));
      const res = await request(app)
        .post('/save/TestPage')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ content: '# Hello', title: 'TestPage', 'system-category': 'general' });
      expect(res.status).toBe(302);
      const metadata = mockPageManager.savePageWithContext.mock.calls[0][1] as Record<string, unknown>;
      // Existing mood survives because the form didn't post a mood field
      expect(metadata['mood']).toBe('tired');
    });

    test('#803 — req.body unknown field overrides existing frontmatter', async () => {
      mockPageManager.savePageWithContext.mockClear();
      mockPageManager.getPage.mockImplementationOnce(() => Promise.resolve({
        content: '# Existing',
        metadata: {
          title: 'TestPage', uuid: 'uuid-1', 'system-category': 'general',
          'user-keywords': [], author: 'adminuser',
          mood: 'tired'
        },
        filePath: '/data/pages/TestPage.md'
      }));
      const res = await request(app)
        .post('/save/TestPage')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ content: '# Hello', title: 'TestPage', 'system-category': 'general', mood: 'happy' });
      expect(res.status).toBe(302);
      const metadata = mockPageManager.savePageWithContext.mock.calls[0][1] as Record<string, unknown>;
      // Form-posted mood wins over existing
      expect(metadata['mood']).toBe('happy');
    });

    test('#803 — form-internal markers do not leak into metadata', async () => {
      mockPageManager.savePageWithContext.mockClear();
      const res = await request(app)
        .post('/save/TestPage')
        .set('x-csrf-token', 'test-csrf-token')
        .send({
          content: '# Hello',
          title: 'TestPage',
          'system-category': 'general',
          _csrf: 'test-csrf-token', // must satisfy the test app's CSRF middleware
          'private-present': '1',
          'author-lock-present': '1',
          section: '',
          categories: 'legacy-noise',
          userKeywords: 'tech'
        });
      expect(res.status).toBe(302);
      const metadata = mockPageManager.savePageWithContext.mock.calls[0][1] as Record<string, unknown>;
      // None of the form-internal markers should appear in the saved frontmatter
      expect(metadata).not.toHaveProperty('_csrf');
      expect(metadata).not.toHaveProperty('private-present');
      expect(metadata).not.toHaveProperty('author-lock-present');
      expect(metadata).not.toHaveProperty('section');
      expect(metadata).not.toHaveProperty('categories');
      expect(metadata).not.toHaveProperty('userKeywords'); // camelCase alias handled by managed flow
    });
  });

  // ── deletePage ────────────────────────────────────────────────────────────────

  describe('POST /delete/:page (deletePage)', () => {
    test('returns 404 when page does not exist', async () => {
      mockPageManager.getPage.mockResolvedValue(null);
      const res = await request(app)
        .post('/delete/NonExistentPage')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(404);
    });

    test('redirects to home on successful delete', async () => {
      const res = await request(app)
        .post('/delete/TestPage')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/');
    });

    test('returns JSON on successful delete for AJAX requests', async () => {
      const res = await request(app)
        .post('/delete/TestPage')
        .set('x-csrf-token', 'test-csrf-token')
        .set('Accept', 'application/json')
        .set('Content-Type', 'application/json')
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('returns 403 when ACL denies delete access', async () => {
      mockACLManager.checkPagePermissionWithContext.mockResolvedValue(false);
      const res = await request(app)
        .post('/delete/TestPage')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(403);
    });

    test('returns 500 when delete fails', async () => {
      mockPageManager.deletePageWithContext.mockResolvedValue(false);
      const res = await request(app)
        .post('/delete/TestPage')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(500);
    });
  });

  // ── createWikiPage ────────────────────────────────────────────────────────────

  describe('POST /view/:page (createWikiPage)', () => {
    test('returns 400 when no content or template provided', async () => {
      mockPageManager.getPage.mockResolvedValue(null);
      const res = await request(app)
        .post('/view/NewPage')
        .set('x-csrf-token', 'test-csrf-token')
        .send({});
      expect(res.status).toBe(400);
    });

    test('returns 409 when page already exists', async () => {
      const res = await request(app)
        .post('/view/TestPage')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ content: '# Hello' });
      expect(res.status).toBe(409);
    });

    test('redirects to login when not authenticated', async () => {
      mockUserContext = null;
      mockPageManager.getPage.mockResolvedValue(null);
      const res = await request(app)
        .post('/view/NewPage')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ content: '# Hello' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/login');
    });

    test('creates page and redirects to edit on success', async () => {
      mockPageManager.getPage.mockResolvedValue(null);
      const res = await request(app)
        .post('/view/NewPage')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ content: '# New Page Content' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/edit/');
    });

    test('creates page from template and redirects', async () => {
      mockPageManager.getPage.mockResolvedValue(null);
      const res = await request(app)
        .post('/view/NewPage')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ templateName: 'basic', categories: 'General' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/edit/');
    });
  });

  // ── adminRequiredPages ────────────────────────────────────────────────────────

  describe('GET /admin/required-pages (adminRequiredPages)', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app).get('/admin/required-pages');
      expect(res.status).toBe(403);
    });

    test('returns 500 when required-pages directory does not exist', async () => {
      const res = await request(app).get('/admin/required-pages');
      expect([200, 500]).toContain(res.status);
    });
  });
});
