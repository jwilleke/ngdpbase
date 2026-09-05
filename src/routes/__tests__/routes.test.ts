import express from 'express';
import request from 'supertest';
import path from 'path';
import WikiRoutes from '../WikiRoutes';
import { type MockInstance } from 'vitest';

// Mock LocaleUtils
vi.mock('../../utils/LocaleUtils', () => {
  const methods = {
    getDateFormatOptions: vi.fn().mockReturnValue(['MM/dd/yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd']),
    getDateFormatFromLocale: vi.fn().mockReturnValue('MM/dd/yyyy')
  };
  return { default: methods, ...methods };
});

// Mock WikiContext - the central context object for all wiki operations
// This allows tests to control userContext, pageName, and other context properties
// Note: mockUserContext is accessed by the mock factory function
let mockUserContext = null;

const mockHolder = vi.hoisted(() => ({ userManager: null }));

vi.mock('../../context/WikiContext', () => {
  const MockWikiContext = vi.fn().mockImplementation(function (engine, options = {}) {
    const userContext = (options.userContext as { roles?: string[]; username?: string } | null | undefined) || mockUserContext;
    return {
      engine: engine,
      context: options.context || 'none',
      pageName: options.pageName || null,
      content: options.content || null,
      userContext: options.userContext || mockUserContext,
      request: options.request || null,
      response: options.response || null,
      pageManager: engine?.getManager?.('PageManager'),
      renderingManager: engine?.getManager?.('RenderingManager'),
      pluginManager: engine?.getManager?.('PluginManager'),
      variableManager: engine?.getManager?.('VariableManager'),
      aclManager: engine?.getManager?.('ACLManager'),
      getContext: vi.fn().mockReturnValue(options.context || 'none'),
      renderMarkdown: vi.fn().mockResolvedValue('<p>Rendered content</p>'),
      toParseOptions: vi.fn().mockReturnValue({
        pageContext: {
          pageName: options.pageName,
          userContext: options.userContext || mockUserContext
        },
        engine: engine
      }),
      // #625 — mirror the four methods on the real WikiContext.
      hasRole: vi.fn((...names: string[]) => {
        const roles = ((options.userContext as { roles?: string[] } | null | undefined)?.roles) ?? mockUserContext?.roles ?? [];
        return names.some(n => roles.includes(n));
      }),
      // The factory is hoisted above the describe-scoped `mockUserManager`, so
      // a direct reference here threw ReferenceError and the catch returned
      // true — the context's hasPermission has always said yes in this file
      // (#1198). The holder is filled in beforeEach once the manager exists.
      hasPermission: vi.fn(async (action: string) => {
        const um = mockHolder.userManager;
        if (!um) return true;
        return await um.hasPermission(userContext?.username ?? '', action);
      }),
      canAccess: vi.fn().mockResolvedValue(true),
      getPrincipals: vi.fn(() => {
        const uc = (options.userContext as { roles?: string[]; username?: string } | null | undefined) || mockUserContext;
        const roles = uc?.roles ?? [];
        return uc?.username ? [...roles, uc.username] : [...roles];
      })
    };
  });
  // Add static CONTEXT enum used by WikiRoutes
  (MockWikiContext as MockInstance & { CONTEXT: unknown }).CONTEXT = {
    VIEW: 'view',
    EDIT: 'edit',
    PREVIEW: 'preview',
    DIFF: 'diff',
    INFO: 'info',
    NONE: 'none'
  };
  return { default: MockWikiContext };
});

// Mock the WikiEngine and its managers
vi.mock('../../WikiEngine', () => {
  // Create mock managers once
  const mockUserManager = {
    getCurrentUser: vi.fn().mockResolvedValue({
      username: 'testuser',
      displayName: 'Test User',
      email: 'test@example.com',
      isExternal: false,
      isAuthenticated: true,
      createdAt: new Date('2023-01-01'),
      lastLogin: new Date('2024-01-01'),
      roles: ['authenticated']
    }),
    hasPermission: vi.fn().mockReturnValue(true),
    hasRole: vi.fn().mockResolvedValue(false),
    resolveUserRoles: vi.fn().mockResolvedValue([]),
    destroySession: vi.fn().mockResolvedValue(true),
    getUsers: vi.fn().mockResolvedValue([
      { 
        username: 'admin', 
        displayName: 'Admin User',
        email: 'admin@example.com',
        isExternal: false,
        createdAt: new Date('2023-01-01'),
        lastLogin: new Date('2024-01-01'),
        roles: ['admin'] 
      },
      { 
        username: 'testuser', 
        displayName: 'Test User',
        email: 'test@example.com',
        isExternal: false,
        createdAt: new Date('2023-01-01'),
        lastLogin: new Date('2024-01-01'),
        roles: ['authenticated'] 
      }
    ]),
    getRoles: vi.fn().mockResolvedValue([
      { name: 'admin', permissions: ['read', 'write', 'admin'] },
      { name: 'authenticated', permissions: ['read', 'write'] }
    ]),
    createUser: vi.fn().mockResolvedValue(true),
    updateUser: vi.fn().mockResolvedValue(true),
    deleteUser: vi.fn().mockResolvedValue(true),
    createRole: vi.fn().mockResolvedValue(true),
    updateRolePermissions: vi.fn().mockResolvedValue(true),
    deleteRole: vi.fn().mockResolvedValue(true),
    authenticateUser: vi.fn().mockResolvedValue({
      username: 'testuser',
      displayName: 'Test User',
      email: 'test@example.com',
      isExternal: false,
      isAuthenticated: true,
      createdAt: new Date('2023-01-01'),
      lastLogin: new Date('2024-01-01'),
      roles: ['authenticated']
    }),
    registerUser: vi.fn().mockResolvedValue(true),
    updateProfile: vi.fn().mockResolvedValue(true),
    updatePreferences: vi.fn().mockResolvedValue(true),
    getUser: vi.fn().mockResolvedValue({
      username: 'testuser',
      displayName: 'Test User',
      email: 'test@example.com',
      isExternal: false,
      createdAt: new Date('2023-01-01'),
      lastLogin: new Date('2024-01-01'),
      preferences: {}
    }),
    getPermissions: vi.fn().mockReturnValue(new Map([
      ['read', 'Read access to pages'],
      ['write', 'Write access to pages'],
      ['admin', 'Administrative access']
    ])),
    getUserPermissions: vi.fn().mockResolvedValue(['read', 'write']),
    createSession: vi.fn().mockResolvedValue('session-id-123'),
    isUserInRole: vi.fn().mockReturnValue(true)
  };

  const mockPageManager = {
    getPageNames: vi.fn().mockResolvedValue(['Welcome', 'TestPage']),
    getAllPages: vi.fn().mockResolvedValue([]),
    getPage: vi.fn().mockImplementation((pageName) => {
      if (pageName === 'Footer' || pageName === 'LeftMenu' || pageName === 'NonExistentPage') {
        return Promise.resolve(null); // These pages don't exist
      }
      return Promise.resolve({
        content: '# Test Page\nThis is a test page.',
        metadata: { title: 'TestPage' }
      });
    }),
    savePage: vi.fn().mockResolvedValue(true),
    savePageWithContext: vi.fn().mockResolvedValue(true),
    deletePage: vi.fn().mockResolvedValue(true),
    deletePageWithContext: vi.fn().mockResolvedValue(true),
    getPageContent: vi.fn().mockImplementation((pageName) => {
      if (pageName === 'Footer' || pageName === 'LeftMenu' || pageName === 'NonExistentPage') {
        return Promise.reject(new Error(`Page "${pageName}" not found`));
      }
      return Promise.resolve('# Test Page\nThis is a test page.');
    }),
    getPageMetadata: vi.fn().mockResolvedValue({ title: 'TestPage', author: 'testuser' }),
    isRequiredPage: vi.fn().mockReturnValue(false),
    provider: {
      getVersionHistory: vi.fn().mockResolvedValue([])
    }
  };

  const mockRenderingManager = {
    renderContent: vi.fn().mockReturnValue('<p>This is rendered content</p>'),
    renderMarkdown: vi.fn().mockReturnValue('<p>This is rendered markdown</p>'),
    textToHTML: vi.fn().mockResolvedValue('<p>This is rendered content</p>'),
    getReferringPages: vi.fn().mockReturnValue([]),
    rebuildLinkGraph: vi.fn().mockResolvedValue(true),
    updatePageInLinkGraph: vi.fn(),
    addPageToCache: vi.fn(),
    removePageFromLinkGraph: vi.fn()
  };

  const mockSearchManager = {
    search: vi.fn().mockResolvedValue([]),
    advancedSearch: vi.fn().mockResolvedValue([]),
    advancedSearchWithContext: vi.fn().mockResolvedValue([]),
    searchByCategories: vi.fn().mockReturnValue([]),
    searchByCategory: vi.fn().mockReturnValue([]),
    searchByUserKeywordsList: vi.fn().mockReturnValue([]),
    searchByUserKeywords: vi.fn().mockReturnValue([]),
    rebuildIndex: vi.fn().mockResolvedValue(true),
    updatePageInIndex: vi.fn().mockResolvedValue(true),
    removePageFromIndex: vi.fn().mockResolvedValue(true)
  };

  const mockTemplateManager = {
    render: vi.fn().mockImplementation((template, data, callback) => {
      if (callback) callback(null, '<html>Test Template</html>');
      return '<html>Test Template</html>';
    }),
    getTemplates: vi.fn().mockResolvedValue(['basic', 'template1', 'template2']),
    getTemplate: vi.fn().mockResolvedValue({
      name: 'basic',
      content: '# {{title}}\nTemplate content here'
    }),
    applyTemplate: vi.fn().mockResolvedValue('# New Page\nTemplate content here')
  };

  const mockCacheManager = {
    isInitialized: vi.fn().mockReturnValue(true),
    clear: vi.fn().mockResolvedValue(true),
    del: vi.fn().mockResolvedValue(true),
    get: vi.fn().mockReturnValue(null),
    set: vi.fn().mockResolvedValue(true)
  };

  const mockACLManager = {
    checkPagePermission: vi.fn().mockResolvedValue(true),
    checkPagePermissionWithContext: vi.fn().mockResolvedValue(true),
    removeACLMarkup: vi.fn().mockReturnValue('Content without ACL markup'),
    parseACL: vi.fn().mockReturnValue({ permissions: [] })
  };

  const mockNotificationManager = {
    dismissNotification: vi.fn().mockResolvedValue(true),
    clearAllNotifications: vi.fn().mockResolvedValue(true),
    getNotifications: vi.fn().mockReturnValue([]),
    createMaintenanceNotification: vi.fn().mockResolvedValue(true),
    getAllNotifications: vi.fn().mockReturnValue([]),
    getStats: vi.fn().mockReturnValue({ total: 0, active: 0, expired: 0, byType: {}, byLevel: {} })
  };

  const mockSchemaManager = {
    getPerson: vi.fn().mockResolvedValue(null),
    getOrganization: vi.fn().mockResolvedValue(null) // legacy; OrganizationManager owns org records since #617
  };

  // #624: org records owned by OrganizationManager. The schema endpoint and
  // admin org-CRUD routes resolve through this manager now.
  const mockOrganizationManager = {
    list: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue(null),
    getByFile: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ '@id': 'urn:org:new', name: 'New' }),
    update: vi.fn().mockResolvedValue({ '@id': 'urn:org:test', name: 'Updated' }),
    delete: vi.fn().mockResolvedValue(true),
    getInstallOrg: vi.fn().mockResolvedValue(null)
  };

  const mockConfigurationManager = {
    getProperty: vi.fn((key, defaultValue) => {
      const defaults = {
        'ngdpbase.front-page': 'Welcome',
        'ngdpbase.theme.active': 'default',
        'ngdpbase.application-name': 'ngdpbase',
        'ngdpbase.version': '1.0.0',
        'ngdpbase.system-category': {
          general:       { label: 'general',       storageLocation: 'regular',  enabled: true },
          system:        { label: 'system',        storageLocation: 'required', enabled: true },
          documentation: { label: 'documentation', storageLocation: 'required', enabled: true },
          developer:     { label: 'developer',     storageLocation: 'github',   enabled: true },
          addon:         { label: 'addon',         storageLocation: 'regular',  enabled: true }
        }
      };
      return key in defaults ? defaults[key] : defaultValue;
    }),
    getCustomProperty: vi.fn().mockReturnValue(null),
    get: vi.fn().mockReturnValue(null),
    getAllProperties: vi.fn().mockReturnValue({}),
    getResolvedDataPath: vi.fn((key, defaultPath) => defaultPath)
  };

  const mockVariableManager = {
    expandVariables: vi.fn().mockReturnValue('expanded content')
  };

  const mockExportManager = {
    getExports: vi.fn().mockResolvedValue([])
  };

  const mockValidationManager = {
    validateContent: vi.fn().mockResolvedValue({ isValid: true }),
    validateMetadata: vi.fn().mockResolvedValue({ isValid: true }),
    generateValidMetadata: vi.fn().mockImplementation((title, baseMetadata) => ({
      title: title || 'Untitled',
      uuid: baseMetadata?.uuid || 'test-uuid-123',
      'system-category': baseMetadata?.['system-category'] || 'General',
      'user-keywords': baseMetadata?.['user-keywords'] || [],
      author: baseMetadata?.author || 'testuser',
      created: new Date().toISOString(),
      modified: new Date().toISOString()
    }))
  };

  const mockBackgroundJobManager = {
    registerJob: vi.fn(),
    enqueue: vi.fn().mockResolvedValue('mock-run-id'),
    getStatus: vi.fn().mockReturnValue(null),
    getActiveJobs: vi.fn().mockReturnValue([])
  };

  const MockEngine = vi.fn().mockImplementation(function () {
    return {
      getManager: vi.fn((name) => {
        const mockManagers = {
          UserManager: mockUserManager,
          PageManager: mockPageManager,
          RenderingManager: mockRenderingManager,
          SearchManager: mockSearchManager,
          TemplateManager: mockTemplateManager,
          ACLManager: mockACLManager,
          NotificationManager: mockNotificationManager,
          SchemaManager: mockSchemaManager,
          OrganizationManager: mockOrganizationManager,
          ConfigurationManager: mockConfigurationManager,
          VariableManager: mockVariableManager,
          ExportManager: mockExportManager,
          ValidationManager: mockValidationManager,
          CacheManager: mockCacheManager,
          BackgroundJobManager: mockBackgroundJobManager
        };
        return mockManagers[name] || {};
      }),
      getApplicationName: vi.fn().mockReturnValue('ngdpbase'),
      getCapabilities: vi.fn().mockReturnValue({}),
      config: {
        features: {
          maintenance: { enabled: false, allowAdmins: true }
        }
      }
    };
  });
  return { default: MockEngine };
});

describe('WikiRoutes - Comprehensive Route Testing', () => {
  let app;
  let wikiRoutes;
  let mockEngine;
  let mockUserManager;
  let mockPageManager;
  let mockACLManager;
  let mockNotificationManager;
  let mockSchemaManager;
  let mockRenderingManager;
  let mockSearchManager;
  let mockTemplateManager;

  // Helper function to create user context objects for WikiContext
  const createUserContext = (username = 'testuser', roles = ['authenticated', 'Authenticated', 'All'], isAuthenticated = true) => ({
    username: username,
    displayName: username === 'testuser' ? 'Test User' : username.charAt(0).toUpperCase() + username.slice(1),
    email: `${username}@example.com`,
    isAuthenticated: isAuthenticated,
    roles: roles
  });

  beforeEach(async () => {
    // Initialize default authenticated user context for WikiContext mock
    // This is used by the MockWikiContext when creating WikiContext instances
    mockUserContext = createUserContext('testuser', ['authenticated', 'Authenticated', 'All'], true);

    // Create Express app
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Configure template engine
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, '../views'));

    // Mock template rendering to avoid file system dependencies
    app.use((req, res, next) => {
      res.render = (view, data, callback) => {
        // Return success response for template renders
        if (callback) {
          callback(null, '<html>Mock Template Content</html>');
        } else {
          res.send('<html>Mock Template Content</html>');
        }
      };
      next();
    });

    // Mock session middleware - uses mockUserContext for WikiContext
    app.use((req, res, next) => {
      req.session = {
        csrfToken: 'test-csrf-token',
        user: mockUserContext ? { username: mockUserContext.username } : null,
        destroy: (callback) => {
          // Mock session destroy for logout tests
          if (callback) callback();
        },
        save: (callback) => {
          // Mock session save for login tests
          if (callback) callback();
        }
      };
      // Set req.userContext - this is used by WikiRoutes.createWikiContext() to build WikiContext
      req.userContext = mockUserContext;
      // Parse cookies from headers
      if (req.headers.cookie) {
        req.cookies = require('cookie').parse(req.headers.cookie);
      } else {
        req.cookies = {};
      }
      next();
    });

    // Mock CSRF middleware
    app.use((req, res, next) => {
      req.csrfToken = () => 'test-csrf-token';

      // CSRF validation for POST requests
      if (req.method === 'POST') {
        const token = req.body._csrf || req.headers['x-csrf-token'] || req.headers['csrf-token'];
        if (!token || token !== 'test-csrf-token') {
          return res.status(403).json({ error: 'Invalid CSRF token' });
        }
      }

      next();
    });

    // Error logging middleware for debugging
    app.use((err, req, res, next) => {
      console.error('[TEST ERROR]:', err.message);
      console.error('[TEST ERROR STACK]:', err.stack);
      next(err);
    });

    // Create WikiRoutes instance with the same mock engine
    const WikiEngineModule = await import('../../WikiEngine');
    const WikiEngine = (WikiEngineModule).default ?? WikiEngineModule;
    mockEngine = new WikiEngine();
    wikiRoutes = new WikiRoutes(mockEngine);

    // Get mock managers from the same engine instance
    mockUserManager = mockEngine.getManager('UserManager');
    mockHolder.userManager = mockUserManager as never;
    mockPageManager = mockEngine.getManager('PageManager');
    mockACLManager = mockEngine.getManager('ACLManager');
    mockNotificationManager = mockEngine.getManager('NotificationManager');
    mockSchemaManager = mockEngine.getManager('SchemaManager');
    mockRenderingManager = mockEngine.getManager('RenderingManager');
    mockSearchManager = mockEngine.getManager('SearchManager');
    mockTemplateManager = mockEngine.getManager('TemplateManager');

    // #622: establish default mock implementations BEFORE every test, not
    // after — that way the first test in the file gets defaults too, and any
    // test that flips a mock to a denial value can't leak into later tests.
    establishMockDefaults();

    // Register routes
    wikiRoutes.registerRoutes(app);
  });

  afterEach(() => {
    // #622: clear call history only. Implementations are re-established by
    // beforeEach for the next test.
    vi.clearAllMocks();
  });

  function establishMockDefaults() {
    mockUserManager.getCurrentUser.mockResolvedValue({
      username: 'testuser',
      displayName: 'Test User',
      email: 'test@example.com',
      isAuthenticated: true,
      roles: ['authenticated']
    });
    mockUserManager.hasPermission.mockReturnValue(true);
    mockUserManager.getUserPermissions.mockResolvedValue(['read', 'write']);
    mockUserManager.getUser.mockResolvedValue({
      username: 'testuser',
      email: 'test@example.com',
      displayName: 'Test User',
      preferences: {}
    });
    mockUserManager.getUsers.mockResolvedValue([
      { username: 'admin', roles: ['admin'] },
      { username: 'testuser', roles: ['authenticated'] }
    ]);
    mockUserManager.getRoles.mockResolvedValue([
      { name: 'admin', permissions: ['read', 'write', 'admin'] },
      { name: 'authenticated', permissions: ['read', 'write'] }
    ]);
    mockUserManager.getPermissions.mockReturnValue(new Map([
      ['read', 'Read access to pages'],
      ['write', 'Write access to pages'],
      ['admin', 'Administrative access']
    ]));
    mockPageManager.getPageNames.mockResolvedValue(['Welcome', 'TestPage']);
    mockPageManager.getPage.mockImplementation((pageName) => {
      if (pageName === 'Footer' || pageName === 'LeftMenu') {
        return Promise.resolve(null); // These pages don't exist
      }
      return Promise.resolve({
        content: '# Test Page\nThis is a test page.',
        metadata: { title: 'TestPage' }
      });
    });
    mockPageManager.getPageContent.mockResolvedValue('# Test Page\nThis is a test page.');
    mockPageManager.isRequiredPage.mockReturnValue(false);
    mockRenderingManager.renderContent.mockReturnValue('<p>This is rendered content</p>');
    mockRenderingManager.renderMarkdown.mockReturnValue('<p>This is rendered markdown</p>');
    mockRenderingManager.getReferringPages.mockReturnValue([]);
    mockRenderingManager.rebuildLinkGraph.mockResolvedValue(true);
    mockRenderingManager.updatePageInLinkGraph.mockImplementation(() => {});
    mockRenderingManager.addPageToCache.mockImplementation(() => {});
    mockRenderingManager.removePageFromLinkGraph.mockImplementation(() => {});
    mockSearchManager.search.mockResolvedValue([]);
    mockSearchManager.advancedSearch.mockResolvedValue([]);
    mockSearchManager.rebuildIndex.mockResolvedValue(true);
    mockTemplateManager.render.mockImplementation((template, data, callback) => {
      if (callback) callback(null, '<html>Test Template</html>');
      return '<html>Test Template</html>';
    });
    mockTemplateManager.getTemplates.mockResolvedValue(['basic', 'template1', 'template2']);
    mockTemplateManager.getTemplate.mockResolvedValue({
      name: 'basic',  
      content: '# {{title}}\nTemplate content here'
    });
    mockACLManager.checkPagePermission.mockResolvedValue(true);
    // #632: LeftMenu / Footer / adminDashboard now use the canonical method;
    // reset it to the same default per test so tests that flip it for denial
    // don't bleed state into later tests.
    mockACLManager.checkPagePermissionWithContext.mockResolvedValue(true);
    mockACLManager.removeACLMarkup.mockReturnValue('Content without ACL markup');
    mockACLManager.parseACL.mockReturnValue({ permissions: [] });
    mockNotificationManager.getNotifications.mockResolvedValue([]);
    mockNotificationManager.getAllNotifications.mockReturnValue([]);
    mockNotificationManager.getStats.mockResolvedValue({ total: 0, active: 0, expired: 0, byType: {}, byLevel: {} });
    mockNotificationManager.dismissNotification.mockResolvedValue(true);
    mockSchemaManager.getPerson.mockResolvedValue(null);
    mockSchemaManager.getOrganization.mockResolvedValue(null);

    // Reset config to initial state
    mockEngine.config = {
      features: {
        maintenance: { enabled: false, allowAdmins: true }
      }
    };
  }

  describe('Public Routes', () => {
    describe('GET /', () => {
      test('should redirect to Welcome page', async () => {
        const response = await request(app).get('/');
        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('/view/Welcome');
      });
    });

    describe('GET /view/:page', () => {
      test('should return 200 for existing page', async () => {
        mockPageManager.getPage.mockResolvedValue({
          content: '# Test Page\nThis is a test page.',
          metadata: { title: 'TestPage' }
        });
        mockACLManager.checkPagePermission.mockResolvedValue(true);

        const response = await request(app).get('/view/TestPage');
        expect(response.status).toBe(200);
      });

      test('should return 404 for non-existent page', async () => {
        // viewPage uses getPageContent, not getPage
        mockPageManager.getPageContent.mockRejectedValue(new Error('Page "NonExistentPage" not found'));

        const response = await request(app).get('/view/NonExistentPage');
        expect(response.status).toBe(404);
      });
    });

    describe('GET /edit/:page', () => {
      test('should return 200 for authenticated user', async () => {
        mockUserManager.getCurrentUser.mockResolvedValue({
          username: 'testuser',
          displayName: 'Test User',
          email: 'test@example.com',
          isAuthenticated: true,
          roles: ['authenticated']
        });
        mockUserManager.hasPermission.mockReturnValue(true);
        mockPageManager.getPage.mockResolvedValue({
          content: '# Test Page\nThis is a test page.',
          metadata: { title: 'TestPage' }
        });

        const response = await request(app).get('/edit/TestPage');
        expect(response.status).toBe(200);
      });

      test('should return 403 for unauthorized user', async () => {
        // editPage uses aclManager.checkPagePermissionWithContext for ACL check
        mockACLManager.checkPagePermissionWithContext.mockResolvedValue(false);

        const response = await request(app).get('/edit/TestPage');
        expect(response.status).toBe(403);
      });
    });

    describe('POST /save/:page', () => {
      test('should save page successfully', async () => {
        mockUserManager.getCurrentUser.mockResolvedValue(createUserContext());
        mockUserManager.hasPermission.mockReturnValue(true);
        mockPageManager.savePage.mockResolvedValue(true);
        mockPageManager.savePageWithContext.mockResolvedValue(true);
        // Mock existing page for the save operation
        mockPageManager.getPage.mockResolvedValue({
          content: '# Test Page',
          metadata: { title: 'TestPage', 'system-category': 'General', uuid: 'test-uuid' }
        });

        const response = await request(app)
          .post('/save/TestPage')
          .send({
            content: '# Updated Content',
            'system-category': 'general',
            _csrf: 'test-csrf-token'
          });

        expect(response.status).toBe(302); // Redirect after save
      });

      test('should return 403 for CSRF failure', async () => {
        const response = await request(app)
          .post('/save/TestPage')
          .send({ content: '# Updated Content' });

        expect(response.status).toBe(403);
      });

      test('should return 409 when rename target title is already in use (#280)', async () => {
        mockUserManager.getCurrentUser.mockResolvedValue(createUserContext());
        mockUserManager.hasPermission.mockReturnValue(true);
        mockPageManager.getPage.mockResolvedValue({
          content: '# Old Title',
          metadata: { title: 'OldTitle', 'system-category': 'general', uuid: 'uuid-old' }
        });
        // Provider throws when the new title is already taken by another page
        mockPageManager.savePageWithContext.mockRejectedValueOnce(
          new Error('Title "Existing Title" is already in use by page uuid-other')
        );

        const response = await request(app)
          .post('/save/OldTitle')
          .send({
            content: '# Existing Title',
            title: 'Existing Title',
            'system-category': 'general',
            _csrf: 'test-csrf-token'
          });

        expect(response.status).toBe(409);
      });

      test('should return 409 when UUID is already assigned to another page (#280)', async () => {
        mockUserManager.getCurrentUser.mockResolvedValue(createUserContext());
        mockUserManager.hasPermission.mockReturnValue(true);
        mockPageManager.getPage.mockResolvedValue({
          content: '# Page A',
          metadata: { title: 'PageA', 'system-category': 'general', uuid: 'shared-uuid' }
        });
        mockPageManager.savePageWithContext.mockRejectedValueOnce(
          new Error('UUID "shared-uuid" is already assigned to page "PageB"')
        );

        const response = await request(app)
          .post('/save/PageA')
          .send({
            content: '# Page A',
            'system-category': 'general',
            _csrf: 'test-csrf-token'
          });

        expect(response.status).toBe(409);
      });
    });

    describe('GET /create', () => {
      test('should return 200 for authenticated user', async () => {
        mockUserManager.getCurrentUser.mockResolvedValue(createUserContext());
        mockUserManager.hasPermission.mockReturnValue(true);

        const response = await request(app).get('/create');
        expect(response.status).toBe(200);
      });
    });

    describe('POST /create', () => {
      test('should create page successfully', async () => {
        mockUserManager.getCurrentUser.mockResolvedValue(createUserContext());
        mockUserManager.hasPermission.mockReturnValue(true);
        mockPageManager.savePage.mockResolvedValue(true);
        // Make sure the new page doesn't exist
        mockPageManager.getPage.mockImplementation((pageName) => {
          if (pageName === 'NewPage') return Promise.resolve(null);
          if (pageName === 'Footer' || pageName === 'LeftMenu') return Promise.resolve(null);
          return Promise.resolve({
            content: '# Test Page\nThis is a test page.',
            metadata: { title: 'TestPage' }
          });
        });

        const response = await request(app)
          .post('/create')
          .send({
            pageName: 'NewPage',
            templateName: 'basic',
            categories: ['general'],
            _csrf: 'test-csrf-token'
          });

        expect(response.status).toBe(302);
      });

      test('should return 409 when page with same name already exists (#280)', async () => {
        mockUserManager.getCurrentUser.mockResolvedValue(createUserContext());
        mockUserManager.hasPermission.mockReturnValue(true);
        // getPage returns an existing page for the requested name
        mockPageManager.getPage.mockImplementation((pageName) => {
          if (pageName === 'Markdown Cheat Sheet') {
            return Promise.resolve({
              content: '# Markdown Cheat Sheet',
              metadata: {
                title: 'Markdown Cheat Sheet',
                uuid: '0ba6544e-ec5e-4e25-9c58-5d32a4e3d695',
                slug: 'markdown-cheat-sheet',
                'system-category': 'general'
              }
            });
          }
          return Promise.resolve(null);
        });

        const response = await request(app)
          .post('/create')
          .send({
            pageName: 'Markdown Cheat Sheet',
            templateName: 'basic',
            categories: ['general'],
            _csrf: 'test-csrf-token'
          });

        expect(response.status).toBe(409);
      });
    });

    describe('POST /delete/:page', () => {
      test('should delete page successfully', async () => {
        // Page metadata must NOT have System/Admin category for isRequiredPage() to return false
        mockPageManager.getPage.mockResolvedValue({
          content: '# Test Page\nThis is a test page.',
          metadata: { title: 'TestPage', 'system-category': 'General' }
        });
        mockPageManager.deletePageWithContext.mockResolvedValue(true);
        // ACL check must pass for delete permission
        mockACLManager.checkPagePermissionWithContext.mockResolvedValue(true);

        // JSON request returns JSON response
        const response = await request(app)
          .post('/delete/TestPage')
          .set('Accept', 'application/json')
          .send({ _csrf: 'test-csrf-token' });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.redirect).toBe('/');
      });

      test('should prevent deletion of required pages', async () => {
        // Page metadata with system category makes isRequiredPage() return true
        // isRequiredPage() uses getPageMetadata() for the category check
        mockPageManager.getPageMetadata.mockResolvedValue({
          title: 'TestPage',
          'system-category': 'system'
        });
        mockPageManager.getPage.mockResolvedValue({
          content: '# Test Page\nThis is a test page.',
          metadata: { title: 'TestPage', 'system-category': 'system' }
        });
        // User does NOT have admin-system permission - hasPermission(username, permission)
        mockUserManager.hasPermission.mockImplementation((username, perm) => {
          if (perm === 'admin-system') return false;
          return true;
        });

        const response = await request(app)
          .post('/delete/TestPage')
          .send({ _csrf: 'test-csrf-token' });

        expect(response.status).toBe(403);
      });
    });

    describe('GET /search', () => {
      test('should return 200 for search page', async () => {
        const response = await request(app).get('/search?q=test');
        expect(response.status).toBe(200);
      });
    });

    describe('GET /login', () => {
      test('should redirect authenticated user away from login page', async () => {
        // loginPage checks req.userContext.isAuthenticated and redirects if true
        // Default test middleware sets isAuthenticated=true
        const response = await request(app).get('/login');
        expect(response.status).toBe(302); // Redirects authenticated users away
      });
    });

    describe('POST /login', () => {
      test('should process login successfully', async () => {
        mockUserManager.getCurrentUser.mockResolvedValue({ username: 'testuser' });

        const response = await request(app)
          .post('/login')
          .send({
            username: 'testuser',
            password: 'password',
            _csrf: 'test-csrf-token'
          });

        expect(response.status).toBe(302);
      });
    });

    describe('GET /logout', () => {
      test('should destroy session and redirect to home', async () => {
        // processLogout calls req.session.destroy() and redirects to /
        const response = await request(app).get('/logout');

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('/');
      });
    });

    describe('POST /logout', () => {
      test('should destroy session and redirect to home', async () => {
        // processLogout calls req.session.destroy() and redirects to /
        const response = await request(app)
          .post('/logout')
          .send({ _csrf: 'test-csrf-token' });

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('/');
      });
    });

    describe('GET /register', () => {
      test('should return 200 for register page', async () => {
        const response = await request(app).get('/register');
        expect(response.status).toBe(200);
      });
    });

    describe('POST /register', () => {
      test('should register user successfully', async () => {
        mockUserManager.createUser.mockResolvedValue(true);

        const response = await request(app)
          .post('/register')
          .send({
            username: 'newuser',
            email: 'newuser@example.com',
            password: 'password',
            _csrf: 'test-csrf-token'
          });

        expect(response.status).toBe(302);
      });
    });

    describe('GET /profile', () => {
      test('should return 200 for authenticated user', async () => {
        mockUserManager.getCurrentUser.mockResolvedValue({ username: 'testuser' });
        mockUserManager.getUser.mockResolvedValue({
          username: 'testuser',
          email: 'test@example.com',
          displayName: 'Test User',
          preferences: {}
        });

        const response = await request(app).get('/profile');
        expect(response.status).toBe(200);
      });
    });

    describe('POST /profile', () => {
      test('should update profile successfully', async () => {
        mockUserManager.getCurrentUser.mockResolvedValue({ username: 'testuser' });
        mockUserManager.updateUser.mockResolvedValue(true);

        const response = await request(app)
          .post('/profile')
          .send({
            displayName: 'Test User',
            email: 'test@example.com',
            _csrf: 'test-csrf-token'
          });

        expect(response.status).toBe(302);
      });
    });

    describe('POST /preferences', () => {
      test('should update preferences successfully', async () => {
        mockUserManager.getCurrentUser.mockResolvedValue({ username: 'testuser' });

        const response = await request(app)
          .post('/preferences')
          .send({
            theme: 'dark',
            _csrf: 'test-csrf-token'
          });

        expect(response.status).toBe(302);
      });
    });

    describe('GET /user-info', () => {
      test('should return user info', async () => {
        mockUserManager.getCurrentUser.mockResolvedValue({
          username: 'testuser',
          displayName: 'Test User'
        });

        const response = await request(app).get('/user-info');
        expect(response.status).toBe(200);
      });
    });
  });

  describe('Admin Routes', () => {
    beforeEach(() => {
      // Set up admin user for all admin tests
      mockUserManager.getCurrentUser.mockResolvedValue({
        username: 'admin',
        displayName: 'Admin User',
        email: 'admin@example.com',
        isExternal: false,
        createdAt: new Date('2023-01-01'),
        lastLogin: new Date('2024-01-01'),
        isAuthenticated: true,
        isAdmin: true,
        roles: ['admin']
      });
      mockUserManager.hasPermission.mockReturnValue(true);
    });

    describe('GET /admin', () => {
      test('should return 200 for admin user', async () => {
        mockUserManager.getCurrentUser.mockResolvedValue({
          username: 'admin',
          displayName: 'Admin User',
          email: 'admin@example.com',
          isExternal: false,
          createdAt: new Date('2023-01-01'),
          lastLogin: new Date('2024-01-01'),
          isAuthenticated: true,
          isAdmin: true,
          roles: ['admin']
        });
        mockUserManager.hasPermission.mockReturnValue(true);
        mockPageManager.getPageNames.mockResolvedValue(['Welcome']);
        mockPageManager.isRequiredPage.mockResolvedValue(true);

        const response = await request(app).get('/admin');
        expect(response.status).toBe(200);
      });

      test('should return 403 for non-admin user', async () => {
        // #1198: the dashboard asks admin-read of policy, like every other
        // admin surface. It used to ask `view` on a fake page, which global
        // policy granted to anyone, behind an isAuthenticated pre-check.
        mockUserManager.hasPermission.mockReturnValue(false);

        const response = await request(app).get('/admin');
        expect(response.status).toBe(403);
      });
    });

    describe('POST /admin/maintenance/toggle', () => {
      test('should toggle maintenance mode for admin', async () => {
        const response = await request(app)
          .post('/admin/maintenance/toggle')
          .send({ _csrf: 'test-csrf-token' });

        expect(response.status).toBe(302);
      });
    });

    describe('GET /admin/users', () => {
      test('should return user list for admin', async () => {
        mockUserManager.getCurrentUser.mockResolvedValue({ 
          username: 'admin',
          displayName: 'Admin User',
          email: 'admin@example.com',
          roles: ['admin']
        });
        mockUserManager.hasPermission.mockReturnValue(true);
        mockUserManager.getUsers.mockReturnValue([]);

        const response = await request(app).get('/admin/users');
        expect(response.status).toBe(200);
      });
    });

    describe('POST /admin/users', () => {
      test('should create user for admin', async () => {
        mockUserManager.getCurrentUser.mockResolvedValue({ 
          username: 'admin',
          displayName: 'Admin User',
          email: 'admin@example.com',
          roles: ['admin']
        });
        mockUserManager.hasPermission.mockReturnValue(true);
        mockUserManager.createUser.mockResolvedValue(true);

        const response = await request(app)
          .post('/admin/users')
          .send({
            username: 'newuser',
            email: 'newuser@example.com',
            password: 'password',
            _csrf: 'test-csrf-token'
          });

        expect(response.status).toBe(302);
      });
    });

    describe('PUT /admin/users/:username', () => {
      test('should update user for admin', async () => {
        mockUserManager.getCurrentUser.mockResolvedValue({ 
          username: 'admin',
          displayName: 'Admin User',
          email: 'admin@example.com'
        });
        mockUserManager.hasPermission.mockReturnValue(true);
        mockUserManager.updateUser.mockResolvedValue(true);

        const response = await request(app)
          .put('/admin/users/testuser')
          .send({
            displayName: 'Updated Name',
            _csrf: 'test-csrf-token'
          });

        expect(response.status).toBe(200);
      });
    });

    describe('DELETE /admin/users/:username', () => {
      test('should delete user for admin', async () => {
        mockUserManager.getCurrentUser.mockResolvedValue({ 
          username: 'admin',
          displayName: 'Admin User',
          email: 'admin@example.com'
        });
        mockUserManager.hasPermission.mockReturnValue(true);
        mockUserManager.deleteUser.mockResolvedValue(true);

        const response = await request(app)
          .delete('/admin/users/testuser')
          .send({ _csrf: 'test-csrf-token' });

        expect(response.status).toBe(200);
      });
    });

    describe('GET /admin/roles', () => {
      test('should return role list for admin', async () => {
        mockUserManager.getCurrentUser.mockResolvedValue({
          username: 'admin',
          displayName: 'Admin User',
          email: 'admin@example.com',
          isExternal: false,
          createdAt: new Date('2023-01-01'),
          lastLogin: new Date('2024-01-01'),
          isAuthenticated: true,
          isAdmin: true,
          roles: ['admin']
        });
        mockUserManager.getRoles.mockReturnValue(new Map([
          ['admin', { name: 'admin', permissions: ['read', 'write', 'admin'] }],
          ['authenticated', { name: 'authenticated', permissions: ['read', 'write'] }]
        ]));

        const response = await request(app).get('/admin/roles');
        expect(response.status).toBe(200);
      });
    });

    describe('POST /admin/roles', () => {
      test('should create role for admin', async () => {
        mockUserManager.createRole.mockResolvedValue({ name: 'newrole' });

        const response = await request(app)
          .post('/admin/roles')
          .send({
            name: 'newrole',
            displayName: 'New Role',
            permissions: ['page:read'],
            _csrf: 'test-csrf-token'
          });

        expect(response.status).toBe(200);
      });
    });

    describe('PUT /admin/roles/:role', () => {
      test('should update role for admin', async () => {
        mockUserManager.getCurrentUser.mockResolvedValue({
          username: 'admin',
          displayName: 'Admin User',
          email: 'admin@example.com',
          isExternal: false,
          createdAt: new Date('2023-01-01'),
          lastLogin: new Date('2024-01-01'),
          isAuthenticated: true,
          isAdmin: true,
          roles: ['admin']
        });
        mockUserManager.hasPermission.mockReturnValue(true);
        mockUserManager.updateRolePermissions.mockResolvedValue(true);

        const response = await request(app)
          .put('/admin/roles/testrole')
          .send({
            roleName: 'testrole',
            permissions: ['page:read', 'page:edit'],
            _csrf: 'test-csrf-token'
          });

        expect(response.status).toBe(200);
      });
    });

    describe('DELETE /admin/roles/:role', () => {
      test('should delete role for admin', async () => {
        mockUserManager.deleteRole.mockResolvedValue(true);

        const response = await request(app)
          .delete('/admin/roles/testrole')
          .send({ _csrf: 'test-csrf-token' });

        expect(response.status).toBe(200);
      });
    });

    describe('GET /admin/notifications', () => {
      test('should return notifications for admin', async () => {
        // Ensure clean config state
        mockEngine.config = {
          features: {
            maintenance: { enabled: false, allowAdmins: true }
          }
        };
        
        // Reset notification manager mocks
        mockNotificationManager.getAllNotifications.mockReturnValue([]);
        mockNotificationManager.getStats.mockReturnValue({ total: 0, active: 0, expired: 0, byType: {}, byLevel: {} });
        
        mockUserManager.getCurrentUser.mockResolvedValue({
          username: 'admin',
          displayName: 'Admin User',
          email: 'admin@example.com',
          isExternal: false,
          createdAt: new Date('2023-01-01'),
          lastLogin: new Date('2024-01-01'),
          isAuthenticated: true,
          isAdmin: true,
          roles: ['admin']
        });
        mockUserManager.hasPermission.mockReturnValue(true);

        const response = await request(app).get('/admin/notifications');
        expect(response.status).toBe(200);
      });
    });

    describe('POST /admin/notifications/:id/dismiss', () => {
      test('should dismiss notification for admin', async () => {
        mockUserManager.getCurrentUser.mockResolvedValue({ 
          username: 'admin',
          displayName: 'Admin User',
          email: 'admin@example.com'
        });
        mockUserManager.hasPermission.mockReturnValue(true);

        const mockNotificationManager = mockEngine.getManager('NotificationManager');
        mockNotificationManager.dismissNotification.mockResolvedValue(true);

        const response = await request(app)
          .post('/admin/notifications/123/dismiss')
          .send({ _csrf: 'test-csrf-token' });

        expect(response.status).toBe(302);
      });
    });

    describe('POST /admin/notifications/clear-all', () => {
      test('should clear all notifications for admin', async () => {
        mockUserManager.getCurrentUser.mockResolvedValue({ 
          username: 'admin',
          displayName: 'Admin User',
          email: 'admin@example.com'
        });
        mockUserManager.hasPermission.mockReturnValue(true);

        const response = await request(app)
          .post('/admin/notifications/clear-all')
          .send({ _csrf: 'test-csrf-token' });

        expect(response.status).toBe(302);
      });
    });

    describe('GET /schema/person/:identifier', () => {
      test('should return person schema for admin', async () => {
        mockUserManager.getCurrentUser.mockResolvedValue({ 
          username: 'admin',
          displayName: 'Admin User',
          email: 'admin@example.com'
        });
        mockUserManager.hasPermission.mockReturnValue(true);

        const mockSchemaManager = mockEngine.getManager('SchemaManager');
        mockSchemaManager.getPerson.mockResolvedValue({
          name: 'John Doe',
          jobTitle: 'Developer'
        });

        const response = await request(app).get('/schema/person/johndoe');
        expect(response.status).toBe(200);
      });

      test('should return 404 for non-existent person', async () => {
        mockUserManager.getCurrentUser.mockResolvedValue({ 
          username: 'admin',
          displayName: 'Admin User',
          email: 'admin@example.com'
        });
        mockUserManager.hasPermission.mockReturnValue(true);

        const mockSchemaManager = mockEngine.getManager('SchemaManager');
        mockSchemaManager.getPerson.mockResolvedValue(null);

        const response = await request(app).get('/schema/person/nonexistent');
        expect(response.status).toBe(404);
      });
    });

    describe('GET /schema/organization/:identifier', () => {
      test('should return organization schema for admin', async () => {
        mockUserManager.getCurrentUser.mockResolvedValue({
          username: 'admin',
          displayName: 'Admin User',
          email: 'admin@example.com'
        });
        mockUserManager.hasPermission.mockReturnValue(true);

        // #624: org records resolve through OrganizationManager.list() now;
        // the route's findOrganizationByName helper iterates list and matches
        // by lowercased `name`.
        const mockOrganizationManager = mockEngine.getManager('OrganizationManager');
        mockOrganizationManager.list.mockResolvedValue([{
          '@id': 'https://example.com',
          name: 'Test Company',
          url: 'https://example.com'
        }]);

        const response = await request(app).get('/schema/organization/test%20company');
        expect(response.status).toBe(200);
      });
    });
  });

  describe('Error Handling', () => {
    test('should return 404 for unknown routes', async () => {
      const response = await request(app).get('/unknown-route');
      expect(response.status).toBe(404);
    });

    test('should handle server errors gracefully', async () => {
      // profilePage calls userManager.getUser() which should throw
      mockUserManager.getUser.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app).get('/profile');
      expect(response.status).toBe(500);
    });
  });

  describe('CSRF Protection', () => {
    test('should reject POST requests without CSRF token', async () => {
      const response = await request(app)
        .post('/login')
        .send({ username: 'test', password: 'pass' });

      expect(response.status).toBe(403);
    });

    test('should reject POST requests with invalid CSRF token', async () => {
      const response = await request(app)
        .post('/login')
        .send({
          username: 'test',
          password: 'pass',
          _csrf: 'invalid-token'
        });

      expect(response.status).toBe(403);
    });
  });

  describe('Authentication Checks', () => {
    test('should redirect unauthenticated users to login for protected routes', async () => {
      // Set mockUserContext to unauthenticated state - the middleware reads this on each request
      mockUserContext = null;

      const response = await request(app).get('/profile');
      expect(response.status).toBe(302); // Should redirect to login
    });

    test('should allow anonymous access to public routes', async () => {
      mockUserManager.getCurrentUser.mockResolvedValue(null);
      mockPageManager.getPage.mockResolvedValue({
        content: '# Public Page',
        metadata: { title: 'PublicPage' }
      });

      const response = await request(app).get('/view/PublicPage');
      expect(response.status).toBe(200);
    });
  });
});