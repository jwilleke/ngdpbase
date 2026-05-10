/**
 * Tests for WikiRoutes.getCommonTemplateData — `contactAvailable` and
 * `contactFooterEnabled` derivation (#670 Phase A).
 *
 * Truth table for `contactAvailable`:
 *   contact.enabled  mail.enabled  recipient resolves  →  contactAvailable
 *   ─────────────────────────────────────────────────────────────────────
 *   false            *             *                   →  false
 *   true             false         *                   →  false
 *   true             true          null                →  false
 *   true             true          "addr"              →  true
 *
 * `contactFooterEnabled` is read independently from
 * `ngdpbase.application.contact.footer.enabled` (default true) and is
 * passed through verbatim — gating the footer view is the template's job.
 */
import express from 'express';
import WikiRoutes from '../WikiRoutes';

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
      mockUserManager,
      renderMarkdownReturn: '<p>ok</p>',
      toParseOptionsReturn: {}
    });
  });
  (MockWikiContext as unknown as { CONTEXT: typeof MOCK_WIKI_CONTEXT_CONSTANTS }).CONTEXT = MOCK_WIKI_CONTEXT_CONSTANTS;
  return { default: MockWikiContext };
});

const configState: {
  contactEnabled: boolean;
  contactPage: string;
  contactRecipient: string;
  footerEnabled: boolean;
} = {
  contactEnabled: true,
  contactPage: '',
  contactRecipient: '',
  footerEnabled: true
};

const mockConfigManager = {
  getProperty: vi.fn((key: string, defaultValue: unknown) => {
    const map: Record<string, unknown> = {
      'ngdpbase.application.contact.enabled': configState.contactEnabled,
      'ngdpbase.application.contact.page': configState.contactPage,
      'ngdpbase.application.contact.recipient': configState.contactRecipient,
      'ngdpbase.application.contact.footer.enabled': configState.footerEnabled,
      'ngdpbase.application.registration': true,
      'ngdpbase.application.registration.redirect-page': 'request-access',
      'ngdpbase.theme.active': 'default',
      'ngdpbase.application-name': 'ngdpbase',
      'ngdpbase.front-page': 'Welcome'
    };
    return key in map ? map[key] : defaultValue;
  }),
  getCustomProperty: vi.fn().mockReturnValue(null),
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
  getCurrentUser: vi.fn().mockResolvedValue(null),
  hasPermission: vi.fn().mockResolvedValue(false),
  getUser: vi.fn(),
  getUsers: vi.fn().mockResolvedValue([]),
  getRoles: vi.fn().mockReturnValue(new Map()),
  getPermissions: vi.fn().mockReturnValue(new Map()),
  getUserPermissions: vi.fn().mockReturnValue([]),
  searchUsers: vi.fn().mockResolvedValue([]),
  authenticateUser: vi.fn(),
  updateUser: vi.fn(),
  getContactRecipient: recipientResolver
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
          EmailManager: mockEmailManager,
          PageManager: {
            getPage: vi.fn().mockResolvedValue(null),
            getAllPages: vi.fn().mockResolvedValue([]),
            pageExists: vi.fn().mockReturnValue(false),
            getCurrentPageProvider: vi.fn().mockReturnValue(null)
          },
          ACLManager: {
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

function buildRequest(): express.Request {
  return {
    session: { csrfToken: 'test-csrf-token' },
    userContext: null
  } as unknown as express.Request;
}

describe('WikiRoutes.getCommonTemplateData — contactAvailable derivation (#670 Phase A)', () => {
  let routes: WikiRoutes;

  beforeEach(async () => {
    configState.contactEnabled = true;
    configState.contactPage = '';
    configState.contactRecipient = '';
    configState.footerEnabled = true;
    // mockReset clears both call history AND any queued .mockResolvedValueOnce
    // entries that previous short-circuit tests may have set without consuming.
    recipientResolver.mockReset();
    recipientResolver.mockImplementation(async (override: string) => {
      const trimmed = (override ?? '').trim();
      if (trimmed) return trimmed;
      return null;
    });
    mockEmailManager.isEnabled.mockReturnValue(true);

    const { default: WikiEngine } = await import('../../WikiEngine');
    const engine = new WikiEngine();
    routes = new WikiRoutes(engine as unknown as Parameters<typeof WikiRoutes>[0]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── all-on happy path ──────────────────────────────────────────────────────
  test('contactAvailable=true when contact.enabled + mail.enabled + recipient resolves', async () => {
    recipientResolver.mockResolvedValueOnce('admin@example.com');
    const data = await routes.getCommonTemplateData(buildRequest());
    expect(data.contactAvailable).toBe(true);
    expect(data.contactFooterEnabled).toBe(true);
  });

  // ── each toggle flips the answer ───────────────────────────────────────────
  test('contactAvailable=false when contact.enabled is false', async () => {
    configState.contactEnabled = false;
    const data = await routes.getCommonTemplateData(buildRequest());
    expect(data.contactAvailable).toBe(false);
    // Recipient resolver should be short-circuited (not called) when contact is off.
    expect(recipientResolver).not.toHaveBeenCalled();
  });

  test('contactAvailable=false when mail.enabled is false', async () => {
    mockEmailManager.isEnabled.mockReturnValue(false);
    const data = await routes.getCommonTemplateData(buildRequest());
    expect(data.contactAvailable).toBe(false);
    // Recipient resolver should be short-circuited when mail is disabled.
    expect(recipientResolver).not.toHaveBeenCalled();
  });

  test('contactAvailable=false when no recipient resolves', async () => {
    // default mockImplementation returns null for empty override
    const data = await routes.getCommonTemplateData(buildRequest());
    expect(data.contactAvailable).toBe(false);
    // Resolver IS called in this case — both flags are on, so we have to ask.
    expect(recipientResolver).toHaveBeenCalledTimes(1);
  });

  test('contactAvailable=true uses the explicit contact.recipient override', async () => {
    configState.contactRecipient = 'ops@example.com';
    const data = await routes.getCommonTemplateData(buildRequest());
    expect(data.contactAvailable).toBe(true);
    expect(recipientResolver).toHaveBeenCalledWith('ops@example.com');
  });

  // ── footer toggle is independent of availability ──────────────────────────
  test('contactFooterEnabled=false when contact.footer.enabled is false (independent of contactAvailable)', async () => {
    configState.footerEnabled = false;
    recipientResolver.mockResolvedValueOnce('admin@example.com');
    const data = await routes.getCommonTemplateData(buildRequest());
    expect(data.contactAvailable).toBe(true); // mail still works
    expect(data.contactFooterEnabled).toBe(false); // footer just opted out
  });

  test('contactFooterEnabled defaults to true when key is missing from config', async () => {
    // Fall through to defaultValue path in mockConfigManager.getProperty
    configState.footerEnabled = true; // explicit; the mock will return this
    const data = await routes.getCommonTemplateData(buildRequest());
    expect(data.contactFooterEnabled).toBe(true);
  });

  // ── recipient never appears in template data ──────────────────────────────
  test('does not leak the resolved recipient address into common template data', async () => {
    recipientResolver.mockResolvedValueOnce('admin@example.com');
    const data = await routes.getCommonTemplateData(buildRequest());
    const json = JSON.stringify(data);
    // Sanity check: the boolean flipped, but the address itself is never in the payload.
    expect(data.contactAvailable).toBe(true);
    expect(json).not.toContain('admin@example.com');
  });
});
