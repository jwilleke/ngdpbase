/**
 * Tests for GET /contact (WikiRoutes.contactPage) — #658 iteration 2
 *
 * State matrix:
 *   contact.enabled = false             → 404
 *   contact.page = "<slug>"             → 302 → /view/<slug>
 *   contact.page = ""  + recipient ok   → render form view (state: "form")
 *   contact.page = ""  + recipient null → render not-configured view
 *   contact.page = "contact"            → ignored (defense in depth; falls through)
 */
import express from 'express';
import request from 'supertest';
import path from 'path';
import WikiRoutes, { contactRateLimiter } from '../WikiRoutes';

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

const configState: {
  enabled: boolean;
  page: string;
  recipient: string;
} = { enabled: true, page: '', recipient: '' };

const mockConfigManager = {
  getProperty: vi.fn((key: string, defaultValue: unknown) => {
    const map: Record<string, unknown> = {
      'ngdpbase.application.contact.enabled': configState.enabled,
      'ngdpbase.application.contact.page': configState.page,
      'ngdpbase.application.contact.recipient': configState.recipient,
      'ngdpbase.front-page': 'Welcome',
      'ngdpbase.theme.active': 'default',
      'ngdpbase.application-name': 'ngdpbase'
    };
    return key in map ? map[key] : defaultValue;
  }),
  getCustomProperty: vi.fn().mockReturnValue(null),
  getAllProperties: vi.fn().mockReturnValue({}),
  getDefaultProperties: vi.fn().mockReturnValue({ 'ngdpbase.version': '3.11.0' }),
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
          NotificationManager: {
            getNotifications: vi.fn().mockReturnValue([]),
            getAllNotifications: vi.fn().mockReturnValue([]),
            getStats: vi.fn().mockReturnValue({ total: 0, active: 0, expired: 0, byType: {}, byLevel: {} })
          },
          PageManager: {
            getPage: vi.fn().mockResolvedValue(null),
            getAllPages: vi.fn().mockResolvedValue([]),
            pageExists: vi.fn().mockReturnValue(false),
            getCurrentPageProvider: vi.fn().mockReturnValue(null)
          },
          CacheManager: { isInitialized: vi.fn().mockReturnValue(false) },
          RenderingManager: {
            renderMarkdown: vi.fn().mockResolvedValue('<p>Rendered</p>'),
            textToHTML: vi.fn().mockResolvedValue('<p>ok</p>'),
            getReferringPages: vi.fn().mockReturnValue([])
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
          EmailManager: mockEmailManager,
          MarkupParser: { invalidateHandlerCache: vi.fn().mockResolvedValue(undefined) },
          FootnoteManager: { isEnabled: vi.fn().mockReturnValue(false) }
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

const adminUser = {
  username: 'adminuser',
  displayName: 'Admin User',
  email: 'admin@example.com',
  isAuthenticated: false,
  roles: [],
  preferences: {}
};

function buildApp() {
  const appInstance = express();
  appInstance.use(express.json());
  appInstance.use(express.urlencoded({ extended: true }));
  appInstance.set('view engine', 'ejs');
  appInstance.set('views', path.join(__dirname, '../views'));

  // Stub render so we don't actually load EJS files in this unit test.
  appInstance.use((_req: express.Request, res: express.Response, next: express.NextFunction) => {
    const renderFn = function (this: express.Response, view: string, data: unknown, cb?: (err: Error | null, str?: string) => void) {
      // Encode the state for assertion
      const state = (data as { state?: string } | undefined)?.state ?? 'unknown';
      const html = `<html data-view="${view}" data-state="${state}">stub</html>`;
      if (cb) cb(null, html);
      else this.send(html);
      return this;
    };
    res.render = renderFn as unknown as typeof res.render;
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

  return appInstance;
}

describe('WikiRoutes — GET /contact (#658 iteration 2)', () => {
  let app: express.Application;

  beforeEach(async () => {
    mockUserContext = { ...adminUser };
    configState.enabled = true;
    configState.page = '';
    configState.recipient = '';
    recipientResolver.mockClear();
    recipientResolver.mockImplementation(async (override: string) => {
      const trimmed = (override ?? '').trim();
      if (trimmed) return trimmed;
      return null;
    });

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

  // ── kill switch ─────────────────────────────────────────────────────────────
  test('returns 404 when contact.enabled is false', async () => {
    configState.enabled = false;
    const res = await request(app).get('/contact');
    expect(res.status).toBe(404);
  });

  // ── redirect override ──────────────────────────────────────────────────────
  test('302-redirects to /view/<slug> when contact.page is set', async () => {
    configState.page = 'support';
    const res = await request(app).get('/contact');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/view/support');
  });

  test('URL-encodes the slug in the redirect', async () => {
    configState.page = 'help me';
    const res = await request(app).get('/contact');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/view/help%20me');
  });

  test('trims whitespace from contact.page before redirecting', async () => {
    configState.page = '  support  ';
    const res = await request(app).get('/contact');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/view/support');
  });

  // ── loop guard (defense in depth — startup invariant should reject first) ──
  test('does NOT redirect when contact.page === "contact" (loop guard fall-through)', async () => {
    configState.page = 'contact';
    const res = await request(app).get('/contact');
    expect(res.status).toBe(200); // falls through to form/not-configured
    expect(res.headers.location).toBeUndefined();
  });

  // ── form / not-configured ──────────────────────────────────────────────────
  test('renders form view when recipient resolves', async () => {
    recipientResolver.mockResolvedValueOnce('admin@example.com');
    const res = await request(app).get('/contact');
    expect(res.status).toBe(200);
    expect(res.text).toContain('data-state="form"');
    expect(res.text).toContain('data-view="contact"');
  });

  test('renders not-configured view when recipient is null', async () => {
    recipientResolver.mockResolvedValueOnce(null);
    const res = await request(app).get('/contact');
    expect(res.status).toBe(200);
    expect(res.text).toContain('data-state="not-configured"');
  });

  test('passes contact.recipient override to UserManager.getContactRecipient', async () => {
    configState.recipient = 'support@example.com';
    recipientResolver.mockResolvedValueOnce('support@example.com');
    await request(app).get('/contact');
    expect(recipientResolver).toHaveBeenCalledWith('support@example.com');
  });

  // ── recipient never rendered to client ─────────────────────────────────────
  test('does NOT render the resolved recipient address to the client', async () => {
    recipientResolver.mockResolvedValueOnce('admin@example.com');
    const res = await request(app).get('/contact');
    expect(res.text).not.toContain('admin@example.com');
  });
});

// ─── POST /contact (#658 iteration 3) ───────────────────────────────────────
describe('WikiRoutes — POST /contact (#658 iteration 3)', () => {
  let app: express.Application;

  const validBody = {
    name: 'Alice Smith',
    email: 'alice@example.com',
    subject: 'Hello',
    message: 'Hi there, I would like to request access.'
  };

  beforeEach(async () => {
    mockUserContext = { ...adminUser };
    configState.enabled = true;
    configState.page = '';
    configState.recipient = '';
    recipientResolver.mockClear();
    mockEmailManager.sendTo.mockClear();
    mockEmailManager.isEnabled.mockReturnValue(true);
    recipientResolver.mockImplementation(async (override: string) => {
      const trimmed = (override ?? '').trim();
      if (trimmed) return trimmed;
      return 'admin@example.com'; // default: recipient resolves
    });

    app = buildApp();
    const { default: WikiEngine } = await import('../../WikiEngine');
    const engine = new WikiEngine();
    const routes = new WikiRoutes(engine as unknown as Parameters<typeof WikiRoutes>[0]);
    routes.registerRoutes(app);

    // Reset module-scope rate limiter between tests so we don't trip
    // ourselves up across cases.
    contactRateLimiter.reset();
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockUserContext = null;
  });

  test('returns 404 when contact.enabled is false', async () => {
    configState.enabled = false;
    const res = await request(app).post('/contact').send(validBody);
    expect(res.status).toBe(404);
    expect(mockEmailManager.sendTo).not.toHaveBeenCalled();
  });

  test('returns 405 when contact.page is set (operator-redirected)', async () => {
    configState.page = 'support';
    const res = await request(app).post('/contact').send(validBody);
    expect(res.status).toBe(405);
    expect(mockEmailManager.sendTo).not.toHaveBeenCalled();
  });

  test('happy path sends mail and renders submitted state', async () => {
    const res = await request(app).post('/contact').send(validBody);
    expect(res.status).toBe(200);
    expect(res.text).toContain('data-state="submitted"');
    expect(mockEmailManager.sendTo).toHaveBeenCalledTimes(1);
    const [to, subject, text] = mockEmailManager.sendTo.mock.calls[0];
    expect(to).toBe('admin@example.com');
    expect(subject).toBe('Hello');
    expect(text).toContain('From: Alice Smith <alice@example.com>');
    expect(text).toContain('Hi there, I would like to request access.');
  });

  test('uses default subject when subject field is omitted', async () => {
    const { subject: _omit, ...bodyNoSubject } = validBody;
    const res = await request(app).post('/contact').send(bodyNoSubject);
    expect(res.status).toBe(200);
    const [, subject] = mockEmailManager.sendTo.mock.calls[0];
    expect(subject).toBe('Contact form submission from Alice Smith');
  });

  test('honeypot filled → silent 200 success, mail NOT sent', async () => {
    const res = await request(app).post('/contact').send({ ...validBody, _website: 'spam.com' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('data-state="submitted"');
    expect(mockEmailManager.sendTo).not.toHaveBeenCalled();
  });

  test('rejects missing name with form re-render + error', async () => {
    const res = await request(app).post('/contact').send({ ...validBody, name: '' });
    expect(res.status).toBe(400);
    expect(res.text).toContain('data-state="form"');
    expect(mockEmailManager.sendTo).not.toHaveBeenCalled();
  });

  test('rejects missing email', async () => {
    const res = await request(app).post('/contact').send({ ...validBody, email: '' });
    expect(res.status).toBe(400);
    expect(mockEmailManager.sendTo).not.toHaveBeenCalled();
  });

  test('rejects malformed email', async () => {
    const res = await request(app).post('/contact').send({ ...validBody, email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(mockEmailManager.sendTo).not.toHaveBeenCalled();
  });

  test('rejects missing message', async () => {
    const res = await request(app).post('/contact').send({ ...validBody, message: '' });
    expect(res.status).toBe(400);
    expect(mockEmailManager.sendTo).not.toHaveBeenCalled();
  });

  test('rejects over-long message (>5000 chars)', async () => {
    const res = await request(app).post('/contact').send({ ...validBody, message: 'x'.repeat(5001) });
    expect(res.status).toBe(400);
    expect(mockEmailManager.sendTo).not.toHaveBeenCalled();
  });

  test('renders not-configured when recipient is null (no admin with real email)', async () => {
    recipientResolver.mockImplementation(async () => null);
    const res = await request(app).post('/contact').send(validBody);
    expect(res.status).toBe(200);
    expect(res.text).toContain('data-state="not-configured"');
    expect(mockEmailManager.sendTo).not.toHaveBeenCalled();
  });

  test('renders form with error when EmailManager.sendTo throws', async () => {
    mockEmailManager.sendTo.mockRejectedValueOnce(new Error('SMTP unavailable'));
    const res = await request(app).post('/contact').send(validBody);
    expect(res.status).toBe(400);
    expect(res.text).toContain('data-state="form"');
  });

  test('returns 429 after 5 successful submissions from the same IP within 15 min', async () => {
    for (let i = 0; i < 5; i++) {
      const ok = await request(app).post('/contact').send(validBody);
      expect(ok.status).toBe(200);
    }
    const tooMany = await request(app).post('/contact').send(validBody);
    expect(tooMany.status).toBe(429);
    expect(tooMany.headers['retry-after']).toBeDefined();
    expect(mockEmailManager.sendTo).toHaveBeenCalledTimes(5);
  });

  test('does NOT include the recipient email in any response body', async () => {
    const res = await request(app).post('/contact').send(validBody);
    expect(res.text).not.toContain('admin@example.com');
  });
});

