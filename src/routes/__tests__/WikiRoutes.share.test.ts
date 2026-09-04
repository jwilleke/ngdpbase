/**
 * Share route tests (#855 — epic #842 slice 4).
 *
 * Public routes (#853): happy paths, identical 404s for every invalid-token
 * flavor, out-of-scope direct fetch, noindex header, rate limiting.
 * Management routes (#854): role gates (admin/editor create, creator/admin
 * revoke), CSRF via the real middleware, redirect contracts.
 */
import express from 'express';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import WikiRoutes, { shareRateLimiter } from '../WikiRoutes';
import { buildTestApp } from './__fixtures__/buildTestApp';
import { csrfTestBodyField } from '../../middleware/__tests__/__fixtures__/csrfTestHelpers';

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

const VALID_TOKEN = 'a'.repeat(64);
const SCOPE = { kind: 'keyword' as const, keyword: 'trip' };

/** Controllable ShareManager stub — routes consume only the narrow interface. */
const shareState: {
  enabled: boolean;
  validToken: string | null;
  media: Array<Record<string, unknown>>;
  pages: Array<Record<string, unknown>>;
  records: Array<Record<string, unknown>>;
} = {
  enabled: true,
  validToken: VALID_TOKEN,
  media: [],
  pages: [],
  records: []
};

const mockShareManager = {
  isEnabled: vi.fn(() => shareState.enabled),
  validate: vi.fn((token: string) => (shareState.validToken !== null && token === shareState.validToken ? SCOPE : null)),
  resolveScope: vi.fn(async () => ({ media: shareState.media, pages: shareState.pages })),
  recordAccess: vi.fn(),
  issue: vi.fn(async (scope: unknown, ttl: unknown, issuer: { username?: string }) => ({
    id: 'new-share-id',
    token: 'b'.repeat(64),
    scope,
    ttl,
    actions: ['page-read', 'asset-read'],
    resources: [],
    createdBy: issuer.username,
    createdAt: '2026-07-17T00:00:00.000Z',
    expiresAt: null
  })),
  revoke: vi.fn(async () => true),
  list: vi.fn(() => shareState.records),
  get: vi.fn((id: string) => shareState.records.find(r => r.id === id) ?? null)
};

const mockMediaManager = {
  getThumbnailBuffer: vi.fn(async () => Buffer.from('thumb-bytes')),
  listByKeyword: vi.fn(async () => []),
  getTranscodedBuffer: vi.fn(async () => null)
};

const mockPageManager = {
  getPageContent: vi.fn(async () => '# Shared page'),
  getPageMetadata: vi.fn(async () => null),
  getPage: vi.fn().mockResolvedValue(null),
  getAllPages: vi.fn().mockResolvedValue([]),
  pageExists: vi.fn().mockReturnValue(false),
  getCurrentPageProvider: vi.fn().mockReturnValue(null)
};

const mockConfigManager = {
  getProperty: vi.fn((key: string, dv: unknown) => {
    const map: Record<string, unknown> = {
      'ngdpbase.front-page': 'Welcome',
      'ngdpbase.theme.active': 'default',
      'ngdpbase.application-name': 'ngdpbase'
    };
    return key in map ? map[key] : dv;
  }),
  getCustomProperty: vi.fn().mockReturnValue(null),
  getAllProperties: vi.fn().mockReturnValue({}),
  getDefaultProperties: vi.fn().mockReturnValue({ 'ngdpbase.version': '3.50.0' }),
  getCustomProperties: vi.fn().mockReturnValue({}),
  getResolvedDataPath: vi.fn((_k: string, def: string) => def),
  getInstanceDataFolder: vi.fn(() => '/tmp/ngdpbase-share-test-do-not-write'),
  getBaseURL: vi.fn(() => 'https://wiki.example.com'),
  setProperty: vi.fn().mockResolvedValue(undefined)
};

const mockUserManager = {
  getCurrentUser: vi.fn().mockResolvedValue(null),
  // #1198/#1224: the share routes ask policy — share-manage to issue, list
  // and revoke one's own shares (shipped to admin and editor), admin-system
  // for the override views. Shaped like the shipped catalog.
  hasPermission: vi.fn(async (username: string, action: string) => {
    const roles = username === 'root' ? ['admin'] : username === 'ed' ? ['editor'] : username === 'reader' ? ['reader'] : [];
    if (action === 'admin-system') return roles.includes('admin');
    if (action === 'share-manage') return roles.includes('admin') || roles.includes('editor');
    return false;
  }),
  getUser: vi.fn(),
  getUsers: vi.fn().mockResolvedValue([]),
  getRoles: vi.fn().mockReturnValue(new Map()),
  getPermissions: vi.fn().mockReturnValue(new Map()),
  getUserPermissions: vi.fn().mockReturnValue([]),
  searchUsers: vi.fn().mockResolvedValue([]),
  authenticateUser: vi.fn(),
  updateUser: vi.fn()
};

vi.mock('../../WikiEngine', () => {
  const MockEngine = vi.fn().mockImplementation(function () {
    return {
      getManager: vi.fn((name: string) => {
        const managers: Record<string, unknown> = {
          ConfigurationManager: mockConfigManager,
          UserManager: mockUserManager,
          ShareManager: mockShareManager,
          MediaManager: mockMediaManager,
          PageManager: mockPageManager,
          NotificationManager: {
            getNotifications: vi.fn().mockReturnValue([]),
            getAllNotifications: vi.fn().mockReturnValue([]),
            getStats: vi.fn().mockReturnValue({ total: 0, active: 0, expired: 0, byType: {}, byLevel: {} })
          },
          CacheManager: { isInitialized: vi.fn().mockReturnValue(false) },
          RenderingManager: {
            renderMarkdown: vi.fn().mockResolvedValue('<p>Rendered</p>'),
            textToHTML: vi.fn().mockResolvedValue('<p>shared html</p>'),
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

const editorUser = {
  username: 'ed',
  displayName: 'Ed Editor',
  email: 'ed@example.com',
  isAuthenticated: true,
  roles: ['editor'],
  preferences: {}
};
const adminUser = { ...editorUser, username: 'root', roles: ['admin'] };
const readerUser = { ...editorUser, username: 'reader', roles: ['reader'] };

/** Render stub encoding view + selected data for assertions. */
function shareRenderStub(view: string, data: unknown): string {
  const d = data as Record<string, unknown> | undefined;
  return JSON.stringify({
    view,
    media: d?.media,
    pages: d?.pages,
    canShare: d?.canShare,
    isAdmin: d?.isAdmin,
    shares: d?.shares,
    baseUrl: d?.baseUrl,
    backLink: d?.backLink,
    html: d?.html
  });
}

describe('WikiRoutes — share routes (#853/#854)', () => {
  let app: express.Application;
  let tmpMediaDir: string;
  let mediaFilePath: string;

  beforeEach(async () => {
    mockUserContext = null;
    shareState.enabled = true;
    shareState.validToken = VALID_TOKEN;
    shareState.media = [];
    shareState.pages = [];
    shareState.records = [];
    shareRateLimiter.reset();
    shareRateLimiter.configure({ max: 600, windowMs: 10 * 60 * 1000 });

    tmpMediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'share-route-test-'));
    mediaFilePath = path.join(tmpMediaDir, 'photo.jpg');
    fs.writeFileSync(mediaFilePath, 'jpeg-bytes-here');

    app = buildTestApp({
      withCsrf: true,
      userContext: () => mockUserContext,
      stubRender: shareRenderStub
    });
    const { default: WikiEngine } = await import('../../WikiEngine');
    const engine = new WikiEngine();
    const routes = new WikiRoutes(engine);
    routes.registerRoutes(app);
  });

  afterEach(() => {
    // Only the per-test mkdtemp dir — never a live data/ tree.
    fs.rmSync(tmpMediaDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  // ── public: album ──────────────────────────────────────────────────────────

  describe('GET /share/:token (album)', () => {
    test('renders album with resolved media + pages, sets noindex, records access', async () => {
      shareState.media = [{ id: 'm1', filePath: mediaFilePath, mimeType: 'image/jpeg' }];
      shareState.pages = [{ name: 'Trip', title: 'Trip' }];

      const res = await request(app).get(`/share/${VALID_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.headers['x-robots-tag']).toBe('noindex');
      const body = JSON.parse(res.text) as { view: string; media: unknown[]; pages: unknown[] };
      expect(body.view).toBe('share-album');
      expect(body.media).toHaveLength(1);
      expect(body.pages).toHaveLength(1);
      expect(mockShareManager.recordAccess).toHaveBeenCalledWith(VALID_TOKEN);
    });

    test('scope is re-validated on every request', async () => {
      await request(app).get(`/share/${VALID_TOKEN}`);
      await request(app).get(`/share/${VALID_TOKEN}`);
      expect(mockShareManager.validate).toHaveBeenCalledTimes(2);
    });

    test('unknown token, revoked/expired token, and disabled manager return IDENTICAL 404s', async () => {
      const unknown = await request(app).get(`/share/${'f'.repeat(64)}`);
      // validate() returns null for revoked and expired exactly like unknown —
      // simulate by invalidating the token entirely.
      shareState.validToken = null;
      const revokedOrExpired = await request(app).get(`/share/${VALID_TOKEN}`);
      shareState.enabled = false;
      const disabled = await request(app).get(`/share/${VALID_TOKEN}`);

      for (const res of [unknown, revokedOrExpired, disabled]) {
        expect(res.status).toBe(404);
      }
      expect(unknown.text).toBe(revokedOrExpired.text);
      expect(revokedOrExpired.text).toBe(disabled.text);
      expect(unknown.headers['x-robots-tag']).toBeUndefined();
    });

    test('rate limits per token+ip with 429 + Retry-After', async () => {
      shareRateLimiter.configure({ max: 2, windowMs: 60_000 });
      await request(app).get(`/share/${VALID_TOKEN}`).expect(200);
      await request(app).get(`/share/${VALID_TOKEN}`).expect(200);
      const res = await request(app).get(`/share/${VALID_TOKEN}`);
      expect(res.status).toBe(429);
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    });

    test('rate limit applies to invalid-token probing too', async () => {
      shareRateLimiter.configure({ max: 2, windowMs: 60_000 });
      await request(app).get(`/share/${'f'.repeat(64)}`).expect(404);
      await request(app).get(`/share/${'f'.repeat(64)}`).expect(404);
      await request(app).get(`/share/${'f'.repeat(64)}`).expect(429);
    });
  });

  // ── public: file / thumb ───────────────────────────────────────────────────

  describe('GET /share/:token/file/:id and /thumb/:id', () => {
    test('streams an in-scope file', async () => {
      shareState.media = [{ id: 'm1', filePath: mediaFilePath, mimeType: 'image/jpeg' }];
      const res = await request(app).get(`/share/${VALID_TOKEN}/file/m1`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/jpeg');
      expect(res.body.toString()).toBe('jpeg-bytes-here');
    });

    test('denies an out-of-scope file id with 404', async () => {
      shareState.media = [{ id: 'm1', filePath: mediaFilePath, mimeType: 'image/jpeg' }];
      const res = await request(app).get(`/share/${VALID_TOKEN}/file/other-id`);
      expect(res.status).toBe(404);
      expect(res.text).toBe('Not Found');
    });

    // ── #1078: Range handling ────────────────────────────────────────────────
    //
    // These go through the shared streamMediaItemFile helper, so they cover
    // GET /media/file/:id equally. Every one of them HUNG before the fix:
    // the route wrote 206 headers from unvalidated parseInt output, then
    // createReadStream threw, and with the headers already sent nothing could
    // complete the response. Reverting the fix turns these into timeouts, not
    // assertion failures — which is exactly what a user saw.
    //
    // The file is 15 bytes: 'jpeg-bytes-here'.
    const FILE_SIZE = 15;

    test('serves a satisfiable range as 206 with the right slice', async () => {
      shareState.media = [{ id: 'm1', filePath: mediaFilePath, mimeType: 'image/jpeg' }];
      const res = await request(app).get(`/share/${VALID_TOKEN}/file/m1`).set('Range', 'bytes=0-3');
      expect(res.status).toBe(206);
      expect(res.headers['content-range']).toBe(`bytes 0-3/${FILE_SIZE}`);
      expect(res.headers['content-length']).toBe('4');
      expect(res.body.toString()).toBe('jpeg');
    });

    test('serves an open-ended range to the last byte', async () => {
      shareState.media = [{ id: 'm1', filePath: mediaFilePath, mimeType: 'image/jpeg' }];
      const res = await request(app).get(`/share/${VALID_TOKEN}/file/m1`).set('Range', 'bytes=5-');
      expect(res.status).toBe(206);
      expect(res.headers['content-range']).toBe(`bytes 5-14/${FILE_SIZE}`);
      expect(res.body.toString()).toBe('bytes-here');
    });

    test('serves a suffix range as the last N bytes', async () => {
      shareState.media = [{ id: 'm1', filePath: mediaFilePath, mimeType: 'image/jpeg' }];
      const res = await request(app).get(`/share/${VALID_TOKEN}/file/m1`).set('Range', 'bytes=-4');
      expect(res.status).toBe(206);
      expect(res.headers['content-range']).toBe(`bytes 11-14/${FILE_SIZE}`);
      expect(res.body.toString()).toBe('here');
    });

    test('a start past the end returns 416 instead of hanging', async () => {
      shareState.media = [{ id: 'm1', filePath: mediaFilePath, mimeType: 'image/jpeg' }];
      const res = await request(app).get(`/share/${VALID_TOKEN}/file/m1`).set('Range', 'bytes=999999999-');
      expect(res.status).toBe(416);
      expect(res.headers['content-range']).toBe(`bytes */${FILE_SIZE}`);
      expect(res.body.toString()).toBe('');
    });

    test('an unparseable range is ignored and the whole file is served', async () => {
      shareState.media = [{ id: 'm1', filePath: mediaFilePath, mimeType: 'image/jpeg' }];
      const res = await request(app).get(`/share/${VALID_TOKEN}/file/m1`).set('Range', 'bytes=abc-');
      expect(res.status).toBe(200);
      expect(res.headers['content-length']).toBe(String(FILE_SIZE));
      expect(res.body.toString()).toBe('jpeg-bytes-here');
    });

    test('an inverted range is ignored and the whole file is served', async () => {
      shareState.media = [{ id: 'm1', filePath: mediaFilePath, mimeType: 'image/jpeg' }];
      const res = await request(app).get(`/share/${VALID_TOKEN}/file/m1`).set('Range', 'bytes=10-2');
      expect(res.status).toBe(200);
      expect(res.body.toString()).toBe('jpeg-bytes-here');
    });

    test('a multi-range request is ignored rather than answered with one range', async () => {
      shareState.media = [{ id: 'm1', filePath: mediaFilePath, mimeType: 'image/jpeg' }];
      const res = await request(app).get(`/share/${VALID_TOKEN}/file/m1`).set('Range', 'bytes=0-3,8-11');
      expect(res.status).toBe(200);
      expect(res.body.toString()).toBe('jpeg-bytes-here');
    });

    test('an end past the last byte is clamped, not refused', async () => {
      shareState.media = [{ id: 'm1', filePath: mediaFilePath, mimeType: 'image/jpeg' }];
      const res = await request(app).get(`/share/${VALID_TOKEN}/file/m1`).set('Range', 'bytes=10-99999');
      expect(res.status).toBe(206);
      expect(res.headers['content-range']).toBe(`bytes 10-14/${FILE_SIZE}`);
      expect(res.body.toString()).toBe('-here');
    });

    test('advertises Accept-Ranges on a normal request', async () => {
      shareState.media = [{ id: 'm1', filePath: mediaFilePath, mimeType: 'image/jpeg' }];
      const res = await request(app).get(`/share/${VALID_TOKEN}/file/m1`);
      expect(res.headers['accept-ranges']).toBe('bytes');
    });

    test('serves an in-scope thumbnail with private cache', async () => {
      shareState.media = [{ id: 'm1', filePath: mediaFilePath, mimeType: 'image/jpeg' }];
      const res = await request(app).get(`/share/${VALID_TOKEN}/thumb/m1`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('image/webp');
      expect(res.headers['cache-control']).toBe('private, max-age=3600');
    });

    test('denies an out-of-scope thumbnail with 404', async () => {
      const res = await request(app).get(`/share/${VALID_TOKEN}/thumb/other-id`);
      expect(res.status).toBe(404);
    });
  });

  // ── public: page ───────────────────────────────────────────────────────────

  describe('GET /share/:token/page/:name', () => {
    test('renders an in-scope page read-only', async () => {
      shareState.pages = [{ name: 'Trip', title: 'Trip' }];
      const res = await request(app).get(`/share/${VALID_TOKEN}/page/Trip`);
      expect(res.status).toBe(200);
      const body = JSON.parse(res.text) as { view: string; html: string };
      expect(body.view).toBe('share-page');
      expect(body.html).toBe('<p>shared html</p>');
    });

    test('denies an out-of-scope page name with 404', async () => {
      shareState.pages = [{ name: 'Trip', title: 'Trip' }];
      const res = await request(app).get(`/share/${VALID_TOKEN}/page/Secret`);
      expect(res.status).toBe(404);
    });

    test('404 when the page content no longer exists', async () => {
      shareState.pages = [{ name: 'Trip', title: 'Trip' }];
      mockPageManager.getPageContent.mockRejectedValueOnce(new Error('not found'));
      const res = await request(app).get(`/share/${VALID_TOKEN}/page/Trip`);
      expect(res.status).toBe(404);
    });
  });

  // ── management: GET /shares ────────────────────────────────────────────────

  describe('GET /shares', () => {
    test('403 for anonymous', async () => {
      mockUserContext = null;
      const res = await request(app).get('/shares');
      expect(res.status).toBe(403);
    });

    test('403 for a reader (no admin/editor role)', async () => {
      mockUserContext = { ...readerUser };
      const res = await request(app).get('/shares');
      expect(res.status).toBe(403);
    });

    test('editor sees ONLY their own shares', async () => {
      mockUserContext = { ...editorUser };
      shareState.records = [{ id: 's1', token: 'c'.repeat(64), scope: SCOPE, createdBy: 'ed', createdAt: '2026-07-01T00:00:00.000Z', expiresAt: null }];
      const res = await request(app).get('/shares');
      expect(res.status).toBe(200);
      expect(mockShareManager.list).toHaveBeenCalledWith('ed');
      const body = JSON.parse(res.text) as { view: string; isAdmin: boolean; shares: Array<{ status: string }> };
      expect(body.view).toBe('shares');
      expect(body.isAdmin).toBe(false);
      expect(body.shares[0]?.status).toBe('active');
    });

    test('admin sees ALL shares with computed statuses', async () => {
      mockUserContext = { ...adminUser };
      shareState.records = [
        { id: 's1', token: 'c'.repeat(64), scope: SCOPE, createdBy: 'ed', createdAt: '2026-07-01T00:00:00.000Z', expiresAt: null },
        { id: 's2', token: 'd'.repeat(64), scope: SCOPE, createdBy: 'ed', createdAt: '2026-07-01T00:00:00.000Z', expiresAt: null, revokedAt: '2026-07-02T00:00:00.000Z' },
        { id: 's3', token: 'e'.repeat(64), scope: SCOPE, createdBy: 'ed', createdAt: '2026-07-01T00:00:00.000Z', expiresAt: '2020-01-01T00:00:00.000Z' }
      ];
      const res = await request(app).get('/shares');
      expect(mockShareManager.list).toHaveBeenCalledWith(undefined);
      const body = JSON.parse(res.text) as { isAdmin: boolean; shares: Array<{ id: string; status: string }>; baseUrl: string };
      expect(body.isAdmin).toBe(true);
      expect(body.baseUrl).toBe('https://wiki.example.com');
      expect(body.shares.map(s => s.status)).toEqual(['active', 'revoked', 'expired']);
    });

    test('404 when ShareManager is disabled', async () => {
      mockUserContext = { ...adminUser };
      shareState.enabled = false;
      const res = await request(app).get('/shares');
      expect(res.status).toBe(404);
    });

    test('backLink follows a same-host referer', async () => {
      mockUserContext = { ...editorUser };
      const res = await request(app)
        .get('/shares')
        .set('Host', 'wiki.test')
        .set('Referer', 'http://wiki.test/media/keyword/trip?sort=date');
      const body = JSON.parse(res.text) as { backLink: string | null };
      expect(body.backLink).toBe('/media/keyword/trip?sort=date');
    });

    test('backLink is null for /shares self-referer and cross-host referer', async () => {
      mockUserContext = { ...editorUser };
      const self = await request(app)
        .get('/shares')
        .set('Host', 'wiki.test')
        .set('Referer', 'http://wiki.test/shares?created=x');
      expect((JSON.parse(self.text) as { backLink: string | null }).backLink).toBeNull();

      const cross = await request(app)
        .get('/shares')
        .set('Host', 'wiki.test')
        .set('Referer', 'http://evil.example/media');
      expect((JSON.parse(cross.text) as { backLink: string | null }).backLink).toBeNull();

      const none = await request(app).get('/shares');
      expect((JSON.parse(none.text) as { backLink: string | null }).backLink).toBeNull();
    });
  });

  // ── management: POST /shares/create ────────────────────────────────────────

  describe('POST /shares/create', () => {
    test('editor creates a share (CSRF token in body) → 302 with created id', async () => {
      mockUserContext = { ...editorUser };
      const res = await request(app)
        .post('/shares/create')
        .type('form')
        .send({ ...csrfTestBodyField(), keyword: 'trip', ttl: '7d' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/shares?created=new-share-id');
      // #1221: the issuer is the request's context, forwarded, not a username.
      expect(mockShareManager.issue).toHaveBeenCalledWith({ kind: 'keyword', keyword: 'trip' }, '7d', expect.objectContaining({ username: 'ed', roles: ['editor'] }));
    });

    test('ttl "never" maps to null (until cancelled)', async () => {
      mockUserContext = { ...editorUser };
      await request(app)
        .post('/shares/create')
        .type('form')
        .send({ ...csrfTestBodyField(), keyword: 'trip', ttl: 'never' });
      expect(mockShareManager.issue).toHaveBeenCalledWith({ kind: 'keyword', keyword: 'trip' }, null, expect.objectContaining({ username: 'ed' }));
    });

    test('rejected without a CSRF token', async () => {
      mockUserContext = { ...editorUser };
      const res = await request(app)
        .post('/shares/create')
        .type('form')
        .send({ keyword: 'trip', ttl: '7d' });
      expect(res.status).toBe(403);
      expect(mockShareManager.issue).not.toHaveBeenCalled();
    });

    test('403 for reader and anonymous', async () => {
      mockUserContext = { ...readerUser };
      const asReader = await request(app)
        .post('/shares/create')
        .type('form')
        .send({ ...csrfTestBodyField(), keyword: 'trip', ttl: '7d' });
      expect(asReader.status).toBe(403);

      mockUserContext = null;
      const asAnon = await request(app)
        .post('/shares/create')
        .type('form')
        .send({ ...csrfTestBodyField(), keyword: 'trip', ttl: '7d' });
      expect(asAnon.status).toBe(403);
      expect(mockShareManager.issue).not.toHaveBeenCalled();
    });

    test('redirects with error for missing keyword and invalid ttl', async () => {
      mockUserContext = { ...editorUser };
      const noKeyword = await request(app)
        .post('/shares/create')
        .type('form')
        .send({ ...csrfTestBodyField(), keyword: '   ', ttl: '7d' });
      expect(noKeyword.headers.location).toBe('/shares?error=keyword');

      const badTtl = await request(app)
        .post('/shares/create')
        .type('form')
        .send({ ...csrfTestBodyField(), keyword: 'trip', ttl: '2h' });
      expect(badTtl.headers.location).toBe('/shares?error=ttl');
      expect(mockShareManager.issue).not.toHaveBeenCalled();
    });
  });

  // ── management: POST /shares/:id/revoke ────────────────────────────────────

  describe('POST /shares/:id/revoke', () => {
    beforeEach(() => {
      shareState.records = [{ id: 's1', token: 'c'.repeat(64), scope: SCOPE, createdBy: 'ed', createdAt: '2026-07-01T00:00:00.000Z', expiresAt: null }];
    });

    test('creator revokes own share → 302', async () => {
      mockUserContext = { ...editorUser };
      const res = await request(app)
        .post('/shares/s1/revoke')
        .type('form')
        .send(csrfTestBodyField());
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/shares?revoked=1');
      expect(mockShareManager.revoke).toHaveBeenCalledWith('s1', 'ed');
    });

    test('admin revokes anyone\'s share → 302', async () => {
      mockUserContext = { ...adminUser };
      const res = await request(app)
        .post('/shares/s1/revoke')
        .type('form')
        .send(csrfTestBodyField());
      expect(res.status).toBe(302);
      expect(mockShareManager.revoke).toHaveBeenCalledWith('s1', 'root');
    });

    test('403 for an editor who is not the creator', async () => {
      mockUserContext = { ...editorUser, username: 'other-editor' };
      const res = await request(app)
        .post('/shares/s1/revoke')
        .type('form')
        .send(csrfTestBodyField());
      expect(res.status).toBe(403);
      expect(mockShareManager.revoke).not.toHaveBeenCalled();
    });

    test('404 for an unknown share id', async () => {
      mockUserContext = { ...adminUser };
      const res = await request(app)
        .post('/shares/nope/revoke')
        .type('form')
        .send(csrfTestBodyField());
      expect(res.status).toBe(404);
    });
  });

  // ── album entry point (#854) ───────────────────────────────────────────────

  describe('GET /media/keyword/:keyword canShare flag', () => {
    test('true for an editor when shares are enabled', async () => {
      mockUserContext = { ...editorUser };
      const res = await request(app).get('/media/keyword/trip');
      const body = JSON.parse(res.text) as { canShare: boolean };
      expect(body.canShare).toBe(true);
    });

    test('false for anonymous, false when shares disabled', async () => {
      mockUserContext = null;
      const anon = JSON.parse((await request(app).get('/media/keyword/trip')).text) as { canShare: boolean };
      expect(anon.canShare).toBe(false);

      mockUserContext = { ...editorUser };
      shareState.enabled = false;
      const disabled = JSON.parse((await request(app).get('/media/keyword/trip')).text) as { canShare: boolean };
      expect(disabled.canShare).toBe(false);
    });
  });
});
