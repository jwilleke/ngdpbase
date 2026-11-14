/**
 * getCommonTemplateData hands every page its line-length choice (#2399):
 * the person's own choice, else the site's setting, else the theme's, else full.
 */
import express from 'express';
import WikiRoutes from '../WikiRoutes';

// The route finds themes/ relative to dist/; under vitest it does not, so say
// what the Fairways theme.json says (pinned against the real file in
// ThemeManager.lineLength.test.ts).
vi.mock('../../managers/ThemeManager', () => ({
  getThemeManager: (name: string) => ({
    paths: {
      activeTheme: name,
      coreCssPath: '/themes/core.css',
      variablesCssPath: '/themes/core-variables-empty.css',
      logoPath: '/favicon.svg',
      faviconPath: '/favicon.svg',
      locationCssPath: '/themes/plugins/location.css',
      themeInfo: name === 'fairways' ? { lineLength: 'short' } : { name: 'Default' },
      fontUrls: [],
      themeStylesheets: []
    }
  })
}));

vi.mock('../../utils/LocaleUtils', () => {
  const methods = {
    getDateFormatOptions: vi.fn().mockReturnValue(['MM/dd/yyyy']),
    getDateFormatFromLocale: vi.fn().mockReturnValue('MM/dd/yyyy')
  };
  return { default: methods, ...methods };
});

vi.mock('../../context/WikiContext', async () => {
  const { createMockWikiContext, MOCK_WIKI_CONTEXT_CONSTANTS } = await import('./__fixtures__/createMockWikiContext');
  const MockWikiContext = vi.fn().mockImplementation(function (engine: unknown, options = {}) {
    return createMockWikiContext(options, {
      engine,
      fallbackUserContext: null,
      mockPolicyDecisionPoint,
      renderMarkdownReturn: '<p>ok</p>',
      toParseOptionsReturn: {}
    });
  });
  (MockWikiContext as unknown as { CONTEXT: typeof MOCK_WIKI_CONTEXT_CONSTANTS }).CONTEXT = MOCK_WIKI_CONTEXT_CONSTANTS;
  return { default: MockWikiContext };
});

const configState: { theme: string; site: unknown } = { theme: 'default', site: null };

const mockConfigManager = {
  getProperty: vi.fn((key: string, defaultValue: unknown) => {
    const map: Record<string, unknown> = {
      'ngdpbase.theme.active': configState.theme,
      'ngdpbase.application-name': 'ngdpbase',
      'ngdpbase.front-page': 'Welcome',
      'ngdpbase.display.line-length': 'full'
    };
    return key in map ? map[key] : defaultValue;
  }),
  getCustomProperty: vi.fn((key: string) => (key === 'ngdpbase.display.line-length' ? configState.site : null)),
  getAllProperties: vi.fn().mockReturnValue({}),
  getDefaultProperties: vi.fn().mockReturnValue({ 'ngdpbase.version': '3.11.4' }),
  getCustomProperties: vi.fn().mockReturnValue({}),
  getResolvedDataPath: vi.fn((_k: string, def: string) => def),
  setProperty: vi.fn().mockResolvedValue(undefined)
};

const recipientResolver = vi.fn(async (override: string) => {
  const trimmed = (override ?? '').trim();
  if (trimmed) return trimmed;
  return null;
});

const mockUserManager = {
  getUser: vi.fn(),
  getUsers: vi.fn().mockResolvedValue([]),
  searchUsers: vi.fn().mockResolvedValue([]),
  authenticateUser: vi.fn(),
  updateUser: vi.fn(),
  getContactRecipient: recipientResolver
};

// #1431 step 14: decisions are the PDP's.
const mockPolicyDecisionPoint = {
  permits: vi.fn().mockResolvedValue(false),
  getUserPermissions: vi.fn().mockReturnValue([])
};

const mockEmailManager = {
  sendTo: vi.fn().mockResolvedValue(undefined),
  isEnabled: vi.fn().mockReturnValue(true)
};

vi.mock('../../WikiEngine', () => {
  const MockEngine = vi.fn().mockImplementation(function () {
    return {
      getManager: vi.fn((name: string) => {
        const managers: Record<string, unknown> = {
          ConfigurationManager: mockConfigManager,
          UserManager: mockUserManager,
          PolicyDecisionPoint: mockPolicyDecisionPoint,
          // Who holds which role is RoleManager's (#1431 step 12).
          RoleManager: { resolveUserRoles: vi.fn().mockResolvedValue([]) },
          EmailManager: mockEmailManager,
          PageManager: {
            getPage: vi.fn().mockResolvedValue(null),
            getAllPages: vi.fn().mockResolvedValue([]),
            pageExists: vi.fn().mockReturnValue(false),
            getCurrentPageProvider: vi.fn().mockReturnValue(null)
          },
          PolicyInformationPoint: {
            // #1431 step 13: the request subject is the PIP's.
            currentSubject: vi.fn().mockResolvedValue(null),
            checkPagePermission: vi.fn().mockResolvedValue(true),
            checkPagePermissionWithContext: vi.fn().mockResolvedValue(true),
            removeACLMarkup: vi.fn().mockImplementation((c: string) => c),
            parseACL: vi.fn().mockReturnValue({ permissions: [] })
          },
          AddonsManager: {
            getRegisteredStylesheets: vi.fn().mockReturnValue([])
          },
          RenderingManager: {
            renderMarkdown: vi.fn().mockResolvedValue('<p>ok</p>'),
            textToHTML: vi.fn().mockResolvedValue('<p>ok</p>'),
            getReferringPages: vi.fn().mockReturnValue([])
          },
          NotificationManager: {
            getNotifications: vi.fn().mockReturnValue([]),
            getAllNotifications: vi.fn().mockReturnValue([]),
            getStats: vi.fn().mockReturnValue({ total: 0, active: 0, expired: 0, byType: {}, byLevel: {} })
          },
          MarkupParser: { invalidateHandlerCache: vi.fn().mockResolvedValue(undefined) },
          FootnoteManager: { isEnabled: vi.fn().mockReturnValue(false) },
          CacheManager: { isInitialized: vi.fn().mockReturnValue(false) }
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

function buildRequest(preferences?: Record<string, unknown>): express.Request {
  return {
    session: { csrfToken: 'test-csrf-token' },
    userContext: preferences ? { isAuthenticated: true, username: 'pat', preferences } : null
  } as unknown as express.Request;
}

describe('WikiRoutes.getCommonTemplateData — lineLength (#2399)', () => {
  let routes: WikiRoutes;

  beforeEach(async () => {
    configState.theme = 'default';
    configState.site = null;
    const { default: WikiEngine } = await import('../../WikiEngine');
    routes = new WikiRoutes(new WikiEngine());
  });

  test('full when nothing asks for short lines (default theme, no setting)', async () => {
    expect((await routes.getCommonTemplateData(buildRequest())).lineLength).toBe('full');
  });

  test('a signed-out visitor sees the site setting', async () => {
    configState.site = 'short';
    expect((await routes.getCommonTemplateData(buildRequest())).lineLength).toBe('short');
  });

  test('Fairways looks as before with no site setting: short', async () => {
    configState.theme = 'fairways';
    expect((await routes.getCommonTemplateData(buildRequest())).lineLength).toBe('short');
  });

  test('a site that sets full width overrides the Fairways theme', async () => {
    configState.theme = 'fairways';
    configState.site = 'full';
    expect((await routes.getCommonTemplateData(buildRequest())).lineLength).toBe('full');
  });

  test("a signed-in person's choice wins over the site", async () => {
    configState.site = 'short';
    const data = await routes.getCommonTemplateData(buildRequest({ 'display.line-length': 'full' }));
    expect(data.lineLength).toBe('full');
  });

  test('a person who chose the site setting gets the site setting', async () => {
    configState.site = 'short';
    const data = await routes.getCommonTemplateData(buildRequest({ 'display.line-length': 'site' }));
    expect(data.lineLength).toBe('short');
  });

  // The profile names what "Use the site's setting" is right now: the site
  // setting, else the theme's, else full: never the person's own choice.
  test('siteLineLength is full with no setting on the default theme', async () => {
    expect((await routes.getCommonTemplateData(buildRequest())).siteLineLength).toBe('full');
  });

  test('siteLineLength follows the site setting', async () => {
    configState.site = 'short';
    expect((await routes.getCommonTemplateData(buildRequest())).siteLineLength).toBe('short');
  });

  test('siteLineLength follows the theme when the site sets nothing', async () => {
    configState.theme = 'fairways';
    expect((await routes.getCommonTemplateData(buildRequest())).siteLineLength).toBe('short');
  });

  test("siteLineLength ignores the person's own choice", async () => {
    configState.site = 'short';
    const data = await routes.getCommonTemplateData(buildRequest({ 'display.line-length': 'full' }));
    expect(data.lineLength).toBe('full');
    expect(data.siteLineLength).toBe('short');
  });
});
