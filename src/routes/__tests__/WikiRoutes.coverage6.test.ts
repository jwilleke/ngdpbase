/**
 * WikiRoutes coverage batch 6 — remaining handlers:
 *   GET  /
 *   GET  /create
 *   GET  /edit  (no page param)
 *   POST /auth/magic-link
 *   GET  /admin/interwiki
 *   GET  /admin/configuration
 *   GET  /admin/import
 *   GET  /admin/attachments
 *   GET  /admin/attachments/api
 *   DELETE /admin/attachments/:id
 *   GET  /admin/addons
 *   POST /admin/addons/:name/toggle
 *   POST /admin/restart (403 path)
 *   POST /admin/maintenance/toggle (403 path)
 *   POST /admin/required-pages/sync (403 path)
 *   GET  /api/admin/diff (403 path)
 *   GET  /admin/variables (happy + 403)
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
  getRoles: vi.fn(),
  getPermissions: vi.fn(),
  getUserPermissions: vi.fn(),
  searchUsers: vi.fn(),
  authenticateUser: vi.fn(),
  updateUser: vi.fn()
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
  getDefaultProperties: vi.fn().mockReturnValue({ 'ngdpbase.version': '3.0.0' }),
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

const mockImportManager = {
  getConverterInfo: vi.fn().mockReturnValue([{ name: 'JSPWiki', description: 'JSPWiki format' }])
};

const mockVariableManager = {
  expandVariables: vi.fn().mockReturnValue(''),
  getDebugInfo: vi.fn().mockReturnValue({
    systemVariables: [{ name: 'DATE', value: '2025-01-01' }],
    contextualVariables: [],
    totalVariables: 1
  })
};

const mockBackgroundJobManager = {
  registerJob: vi.fn(),
  enqueue: vi.fn(),
  getStatus: vi.fn(),
  getActiveJobs: vi.fn()
};

// AttachmentManager mock — only the surface admin-attachments.ejs touches.
// Used by #761 (Slice 5a) tests to verify embedded doc metadata reaches the
// rendered admin page.
const mockAttachmentManager = {
  getAllAttachments: vi.fn().mockResolvedValue([])
};

// Captures the most-recent res.render() call so tests can inspect what the
// route handler hands to the template. The render itself is stubbed (the
// real EJS engine isn't exercised here) so we verify the data contract.
let lastRenderCall: { view: string; data: unknown } | null = null;

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
          ImportManager: mockImportManager,
          VariableManager: mockVariableManager,
          FootnoteManager: { isEnabled: vi.fn().mockReturnValue(false) },
          MarkupParser: { invalidateHandlerCache: vi.fn().mockResolvedValue(undefined) },
          ValidationManager: {
            validateContent: vi.fn().mockResolvedValue({ isValid: true }),
            validateMetadata: vi.fn().mockResolvedValue({ isValid: true }),
            generateValidMetadata: vi.fn().mockImplementation((title: string) => ({
              title, uuid: 'test-uuid-1', 'system-category': 'general', 'user-keywords': [],
              author: 'testuser', created: new Date().toISOString(), modified: new Date().toISOString()
            })),
            getDefaultSystemCategory: vi.fn().mockReturnValue('general')
          },
          TemplateManager: {
            getTemplates: vi.fn().mockResolvedValue([]),
            applyTemplate: vi.fn().mockReturnValue('# Template content')
          },
          ExportManager: { getExports: vi.fn().mockResolvedValue([]) },
          SchemaManager: { getPerson: vi.fn().mockResolvedValue(null), getOrganization: vi.fn().mockResolvedValue(null) },
          AttachmentManager: mockAttachmentManager
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

const regularUser = {
  username: 'regularuser',
  displayName: 'Regular User',
  email: 'regular@example.com',
  isAuthenticated: true,
  roles: ['authenticated'],
  preferences: {}
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
  mockUserManager.authenticateUser.mockResolvedValue({ username: 'testuser', isAuthenticated: true });
  mockUserManager.updateUser.mockResolvedValue(true);

  mockNotificationManager.getNotifications.mockReturnValue([]);
  mockNotificationManager.getAllNotifications.mockReturnValue([]);
  mockNotificationManager.getStats.mockReturnValue({ total: 0, active: 0, expired: 0, byType: {}, byLevel: {} });

  mockBackgroundJobManager.enqueue.mockResolvedValue('run-id-1');
}

function buildApp() {
  const appInstance = express();
  appInstance.use(express.json());
  appInstance.use(express.urlencoded({ extended: true }));
  appInstance.set('view engine', 'ejs');
  appInstance.set('views', path.join(__dirname, '../views'));

  appInstance.use((_req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.render = (view: string, data: unknown, cb?: (err: Error | null, str?: string) => void) => {
      lastRenderCall = { view, data };
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

describe('WikiRoutes — coverage batch 6', () => {
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

  // ── GET / (homePage) ─────────────────────────────────────────────────────────

  describe('GET /', () => {
    test('redirects to /view/Welcome (front page)', async () => {
      const res = await request(app).get('/');
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/view/');
    });
  });

  // ── GET /create ──────────────────────────────────────────────────────────────

  describe('GET /create', () => {
    test('renders create page form for authenticated user', async () => {
      const res = await request(app).get('/create');
      expect(res.status).toBe(200);
    });

    test('redirects unauthenticated user to login', async () => {
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
  });


  // ── POST /auth/magic-link ────────────────────────────────────────────────────

  describe('POST /auth/magic-link', () => {
    test('always redirects to /login?magic=sent', async () => {
      const res = await request(app)
        .post('/auth/magic-link')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ email: 'user@example.com' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('magic=sent');
    });
  });

  // ── GET /admin/interwiki ─────────────────────────────────────────────────────

  describe('GET /admin/interwiki', () => {
    test('renders InterWiki management page for admin', async () => {
      const res = await request(app).get('/admin/interwiki');
      expect(res.status).toBe(200);
    });

    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app).get('/admin/interwiki');
      expect(res.status).toBe(403);
    });
  });

  // ── GET /admin/configuration ─────────────────────────────────────────────────

  describe('GET /admin/configuration', () => {
    test('renders configuration management page for admin', async () => {
      const res = await request(app).get('/admin/configuration');
      expect(res.status).toBe(200);
    });

    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app).get('/admin/configuration');
      expect(res.status).toBe(403);
    });
  });

  // ── GET /admin/import ────────────────────────────────────────────────────────

  describe('GET /admin/import', () => {
    test('renders import page for admin', async () => {
      const res = await request(app).get('/admin/import');
      expect(res.status).toBe(200);
    });

    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app).get('/admin/import');
      expect(res.status).toBe(403);
    });
  });

  // ── GET /admin/attachments ───────────────────────────────────────────────────

  describe('GET /admin/attachments', () => {
    test('returns 403 when user has no admin or editor role', async () => {
      mockUserContext = { ...regularUser };
      const res = await request(app).get('/admin/attachments');
      expect(res.status).toBe(403);
    });

    // #761 / Slice 5a — verify that the Slice 5 (#759) embedded doc-metadata
    // fields reach the rendered admin page. Pre-Slice-5a the fields were on
    // the attachment record but nothing rendered them; the admin table now
    // shows present fields below the filename. The route's `res.render` is
    // stubbed by the harness, so these tests inspect `lastRenderCall.data`
    // to verify the route → template data contract, plus a direct read of
    // the on-disk EJS to verify the renderer references each new field.
    describe('Slice 5a — embedded doc metadata in rendered output', () => {
      const docAttachment = {
        id: 'att-doc-1',
        filename: 'whitepaper.pdf',
        mimeType: 'application/pdf',
        size: 12345,
        uploadedBy: 'someone',
        uploadedAt: '2026-05-21T08:00:00.000Z',
        pageUuid: null,
        description: '',
        documentTitle: 'Confidential Whitepaper',
        documentAuthor: 'J. Doe',
        documentSubject: 'Internal',
        documentKeywords: ['alpha', 'beta'],
        documentDateCreated: '2024-01-15',
        documentDateModified: '2024-02-20',
        inLanguage: 'en'
      };

      const plainAttachment = {
        id: 'att-plain-1',
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        size: 67890,
        uploadedBy: 'someone',
        uploadedAt: '2026-05-20T08:00:00.000Z',
        pageUuid: null,
        description: ''
      };

      test('hands all seven new doc-metadata fields through to the template', async () => {
        mockUserContext = { ...adminUser };
        mockUserManager.hasPermission.mockResolvedValue(true);
        mockAttachmentManager.getAllAttachments.mockResolvedValue([docAttachment]);
        lastRenderCall = null;
        const res = await request(app).get('/admin/attachments');
        expect(res.status).toBe(200);
        expect(lastRenderCall?.view).toBe('admin-attachments');
        const data = lastRenderCall?.data as { attachments: typeof docAttachment[] };
        expect(data.attachments).toHaveLength(1);
        const a = data.attachments[0];
        expect(a.documentTitle).toBe('Confidential Whitepaper');
        expect(a.documentAuthor).toBe('J. Doe');
        expect(a.documentSubject).toBe('Internal');
        expect(a.documentKeywords).toEqual(['alpha', 'beta']);
        expect(a.documentDateCreated).toBe('2024-01-15');
        expect(a.documentDateModified).toBe('2024-02-20');
        expect(a.inLanguage).toBe('en');
      });

      test('hands plain (non-document) attachments through without inventing fields', async () => {
        mockUserContext = { ...adminUser };
        mockUserManager.hasPermission.mockResolvedValue(true);
        mockAttachmentManager.getAllAttachments.mockResolvedValue([plainAttachment]);
        lastRenderCall = null;
        const res = await request(app).get('/admin/attachments');
        expect(res.status).toBe(200);
        const data = lastRenderCall?.data as { attachments: Record<string, unknown>[] };
        const a = data.attachments[0];
        expect(a.filename).toBe('photo.jpg');
        // No Slice-5 keys should appear when the source attachment had none.
        for (const key of ['documentTitle', 'documentAuthor', 'documentSubject',
          'documentKeywords', 'documentDateCreated',
          'documentDateModified', 'inLanguage']) {
          expect(a[key]).toBeUndefined();
        }
      });

      test('the admin-attachments.ejs renderer references every new field (regression guard for Slice 5a JS)', async () => {
        // Reads the on-disk EJS directly — verifies the client-side JS keeps
        // referencing every Slice-5a field. Catches accidental removals (a
        // future refactor that drops a `if (a.documentSubject)` line would
        // silently regress without this guard).
        const fs = await import('fs');
        const ejsPath = path.join(__dirname, '../../../views/admin-attachments.ejs');
        const src = fs.readFileSync(ejsPath, 'utf8');
        for (const fieldRef of ['a.documentTitle', 'a.documentAuthor',
          'a.documentSubject', 'a.documentKeywords',
          'a.documentDateCreated', 'a.documentDateModified',
          'a.inLanguage']) {
          expect(src).toContain(fieldRef);
        }
        // Renderer must also pipe each field through escapeHtml() for XSS.
        // Field values flow from PDF/docx Info dicts — uncontrolled input.
        const escapedRefs = src.match(/escapeHtml\(a\.document\w+\)/g) || [];
        expect(escapedRefs.length).toBeGreaterThanOrEqual(5);
        expect(src).toContain('escapeHtml(a.inLanguage)');
      });

      test('search filter haystack includes the new doc-metadata fields (regression guard)', async () => {
        const fs = await import('fs');
        const ejsPath = path.join(__dirname, '../../../views/admin-attachments.ejs');
        const src = fs.readFileSync(ejsPath, 'utf8');
        // The filename-search box should match against Slice-5 embedded
        // fields too, mirroring what BasicAttachmentProvider.search() does.
        for (const fieldRef of ['a.documentTitle', 'a.documentAuthor',
          'a.documentSubject', 'a.documentKeywords',
          'a.inLanguage']) {
          // Each must appear in the haystack-building block (search filter).
          // We look for the unescaped reference appearing twice or more in
          // the file — once in render, once in the filter haystack.
          const occurrences = src.split(fieldRef).length - 1;
          expect(occurrences).toBeGreaterThanOrEqual(2);
        }
      });

      test('_asset-picker.ejs renders documentAuthor on attachment tiles (row + card variants)', async () => {
        const fs = await import('fs');
        const ejsPath = path.join(__dirname, '../../../views/_asset-picker.ejs');
        const src = fs.readFileSync(ejsPath, 'utf8');
        // Both helpers (_apRow and _apCard) must reference asset.documentAuthor.
        const occurrences = src.split('asset.documentAuthor').length - 1;
        expect(occurrences).toBeGreaterThanOrEqual(2);
        // The line must be gated to attachments (not pages/users) and must
        // pass the value through the picker's _esc() helper for XSS hygiene.
        expect(src).toContain('!isPage && !isUser && asset.documentAuthor');
        expect(src).toContain('_esc(asset.documentAuthor)');
      });
    });
  });

  // ── GET /admin/attachments/api ───────────────────────────────────────────────

  describe('GET /admin/attachments/api', () => {
    test('returns 403 when user has no admin or editor role', async () => {
      mockUserContext = { ...regularUser };
      const res = await request(app).get('/admin/attachments/api');
      expect(res.status).toBe(403);
    });
  });

  // ── POST /admin/attachments/rebuild (Slice 5b of #760 / #763) ────────────

  describe('POST /admin/attachments/rebuild', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserContext = { ...regularUser };
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .post('/admin/attachments/rebuild')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(403);
    });

    test('enqueues attachments.rebuild and returns 202 with runId', async () => {
      mockUserContext = { ...adminUser };
      mockUserManager.hasPermission.mockResolvedValue(true);
      // BackgroundJobManager.enqueue is on the engine via getManager.
      const enqueue = vi.fn().mockResolvedValue('run-abc-123');
      mockBackgroundJobManager.enqueue = enqueue;
      const res = await request(app)
        .post('/admin/attachments/rebuild')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(202);
      expect(res.body).toEqual({ runId: 'run-abc-123' });
      expect(enqueue).toHaveBeenCalledWith('attachments.rebuild');
    });
  });

  // ── DELETE /admin/attachments/:id ────────────────────────────────────────────

  describe('DELETE /admin/attachments/:id', () => {
    test('returns 403 when user has no admin role', async () => {
      mockUserContext = { ...regularUser };
      const res = await request(app)
        .delete('/admin/attachments/att-123')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(403);
    });
  });

  // ── GET /admin/addons ────────────────────────────────────────────────────────

  describe('GET /admin/addons', () => {
    test('renders add-ons page for admin (no AddonsManager)', async () => {
      const res = await request(app).get('/admin/addons');
      expect(res.status).toBe(200);
    });

    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app).get('/admin/addons');
      expect(res.status).toBe(403);
    });
  });

  // ── POST /admin/addons/:name/toggle ─────────────────────────────────────────

  describe('POST /admin/addons/:name/toggle', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .post('/admin/addons/my-addon/toggle')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ enabled: 'true' });
      expect(res.status).toBe(403);
    });

    test('toggles add-on and redirects for admin', async () => {
      const res = await request(app)
        .post('/admin/addons/my-addon/toggle')
        .set('x-csrf-token', 'test-csrf-token')
        .send({ enabled: 'true' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/admin/addons');
    });
  });

  // ── POST /admin/restart ──────────────────────────────────────────────────────

  describe('POST /admin/restart', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .post('/admin/restart')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(403);
    });
  });

  // ── POST /admin/maintenance/toggle ──────────────────────────────────────────

  describe('POST /admin/maintenance/toggle', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .post('/admin/maintenance/toggle')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(403);
    });
  });

  // ── POST /admin/required-pages/sync ─────────────────────────────────────────

  describe('POST /admin/required-pages/sync', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app)
        .post('/admin/required-pages/sync')
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(403);
    });
  });

  // ── GET /api/admin/diff ──────────────────────────────────────────────────────

  describe('GET /api/admin/diff', () => {
    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app).get('/api/admin/diff');
      expect(res.status).toBe(403);
    });
  });

  // ── GET /admin/variables ─────────────────────────────────────────────────────

  describe('GET /admin/variables', () => {
    test('renders variable management page for admin', async () => {
      const res = await request(app).get('/admin/variables');
      expect(res.status).toBe(200);
    });

    test('returns 403 when user lacks admin-system permission', async () => {
      mockUserManager.hasPermission.mockResolvedValue(false);
      const res = await request(app).get('/admin/variables');
      expect(res.status).toBe(403);
    });
  });
});
