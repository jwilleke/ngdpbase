/**
 * Share route tests (#855 — epic #842 slice 4; #1223 — epic #1225).
 *
 * Public routes (#853): happy paths, identical 404s for every invalid-token
 * flavor, noindex header, rate limiting. Since #1223 the handlers decide
 * nothing: the resolver sets the share subject on the request and each
 * handler hands off to the ordinary door, so what a share serves is exactly
 * what the evaluator allows that subject — the ACL and MediaManager stubs
 * here ARE the decision, and the tests assert the routes obey them.
 * Management routes (#854): role gates (admin/editor create, creator/admin
 * revoke), CSRF via the real middleware, redirect contracts.
 */
import express from 'express';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import WikiRoutes, { shareRateLimiter, SHARE_ASSETS_PATH } from '../WikiRoutes';
import { buildTestApp } from './__fixtures__/buildTestApp';
import { csrfTestBodyField } from '../../middleware/__tests__/__fixtures__/csrfTestHelpers';
import { readDoor } from './__fixtures__/pageReadDoor';
import { TEST_PLUGIN_MANAGER } from '../../test-support/plugins';

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
      mockPolicyDecisionPoint,
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

/** The share subject the resolver attaches — anonymous plus the delegation (#1222). */
const SHARE_SUBJECT = {
  username: 'Anonymous',
  roles: ['anonymous', 'All'],
  isAuthenticated: false,
  viaShare: {
    id: 'share-1', issuer: 'ed', actions: ['page-read', 'asset-read'],
    resources: [{ type: 'page', pattern: 'keyword:trip' }, { type: 'media', pattern: 'keyword:trip' }],
    expiresAt: null
  }
};

/** Pages the evaluator refuses the share subject (the ACL stub's decision). */
let deniedPages: string[] = [];
/** Media ids the door refuses the share subject (the MediaManager stub's decision). */
let deniedMedia: string[] = [];
/** The userContext each door was asked about, for the "reached as the share subject" assertions. */
let doorSubjects: unknown[] = [];

const mockShareManager = {
  isEnabled: vi.fn(() => shareState.enabled),
  validate: vi.fn((token: string) => (shareState.validToken !== null && token === shareState.validToken ? SCOPE : null)),
  subjectFor: vi.fn((token: string) => (shareState.validToken !== null && token === shareState.validToken ? { ...SHARE_SUBJECT } : null)),
  resolveScope: vi.fn(async () => ({ media: shareState.media, pages: shareState.pages })),
  recordAccess: vi.fn(),
  // #1388: none of these links is locked for a key.
  isLockedLink: vi.fn(() => false),
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
  // #2117: where links point is the manager's answer; this one has a public origin.
  linkBaseUrl: vi.fn((_requestOrigin: string) => 'https://wiki.example.com'),
  list: vi.fn(() => shareState.records),
  get: vi.fn((id: string) => shareState.records.find(r => r.id === id) ?? null)
};

const mockMediaManager = {
  // #1223: the media door. Answers from the share's candidate list minus what
  // the evaluator refuses — the shape MediaManager.getItem has for real.
  getItem: vi.fn(async (id: string, wikiContext?: { userContext?: unknown }) => {
    doorSubjects.push(wikiContext?.userContext);
    if (deniedMedia.includes(id)) return null;
    return shareState.media.find((m) => m.id === id) ?? null;
  }),
  getThumbnailBuffer: vi.fn(async () => Buffer.from('thumb-bytes')),
  listByKeyword: vi.fn(async () => []),
  getTranscodedBuffer: vi.fn(async () => null)
};

const mockPageManager = {
  getPageContent: vi.fn(async () => '# Shared page'),
  // #1622: the read door decides on a page's metadata; every page here has some.
  getPageMetadata: vi.fn(async (name: string) => ({ title: name })),
  getPage: vi.fn().mockResolvedValue(undefined),
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
  getUser: vi.fn(),
  getUsers: vi.fn().mockResolvedValue([]),
  searchUsers: vi.fn().mockResolvedValue([]),
  authenticateUser: vi.fn(),
  updateUser: vi.fn()
};

// #1431 step 14: decisions are the PDP's.
// #1198/#1224: the share routes ask policy — #1638: share-create to issue and
// list, share-revoke to revoke one's own (shipped to admin and editor), admin-system
// for the override views. Shaped like the shipped catalog.
const mockPolicyDecisionPoint = {
  permits: vi.fn(async (username: string, action: string) => {
    const roles = username === 'root' ? ['admin'] : username === 'ed' ? ['editor'] : username === 'reader' ? ['reader'] : [];
    // Slice 4 of #2247: 'mgr' holds share-manage-all alone; 'sysadm' holds admin-system and share-revoke but not share-manage-all.
    if (username === 'mgr') return action === 'share-manage-all';
    if (username === 'sysadm') return action === 'admin-system' || action === 'share-revoke';
    if (action === 'share-manage-all') return roles.includes('admin');
    if (action === 'admin-system') return roles.includes('admin');
    if (['share-create', 'share-extend', 'share-revoke'].includes(action)) return roles.includes('admin') || roles.includes('editor');
    // #1485: the media door — reader and above, never anonymous.
    if (action === 'media-read') return roles.length > 0;
    return false;
  }),
  getUserPermissions: vi.fn().mockReturnValue([])
};

vi.mock('../../WikiEngine', () => {
  const MockEngine = vi.fn().mockImplementation(function () {
    return {
      getManager: vi.fn((name: string) => {
        if (name === 'PluginManager') return TEST_PLUGIN_MANAGER;
        const managers: Record<string, unknown> = {
          ConfigurationManager: mockConfigManager,
          UserManager: mockUserManager,
          PolicyDecisionPoint: mockPolicyDecisionPoint,
          // Who holds which role is RoleManager's (#1431 step 12).
          RoleManager: { resolveUserRoles: vi.fn().mockResolvedValue([]) },
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
          PolicyInformationPoint: {
            // #1431 step 13: the request subject is the PIP's.
            currentSubject: vi.fn().mockResolvedValue(null),
            checkPagePermission: vi.fn().mockResolvedValue(true),
            // #1223: the page read gate. The share page and album routes ask
            // it per page; a refused page reads as not found.
            checkPagePermissionWithContext: vi.fn(async (ctx: { pageName?: string; userContext?: unknown }) => {
              doorSubjects.push(ctx.userContext);
              return !deniedPages.includes(ctx.pageName ?? '');
            }),
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
    deniedPages = [];
    deniedMedia = [];
    doorSubjects = [];
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
    // #1622: the page-read door, answering from the mocks above.
    Object.assign(mockPageManager, readDoor(mockPageManager, engine));
    const routes = new WikiRoutes(engine);
    routes.registerRoutes(app);
  });

  afterEach(() => {
    // Only the per-test mkdtemp dir — never a live data/ tree.
    fs.rmSync(tmpMediaDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  // ── public: album ──────────────────────────────────────────────────────────

  describe('#2117: /share/_assets is never a token', () => {
    test('a miss under it is a plain 404 that never reaches the resolver or its rate limit', async () => {
      shareRateLimiter.configure({ max: 1, windowMs: 60 * 1000 });
      for (const url of [`${SHARE_ASSETS_PATH}/nope.js`, `${SHARE_ASSETS_PATH}/nope.js`, SHARE_ASSETS_PATH]) {
        const res = await request(app).get(url);
        expect(res.status).toBe(404);
        expect(res.headers['x-robots-tag']).toBeUndefined();
      }
      expect(mockShareManager.subjectFor).not.toHaveBeenCalled();
      expect(mockShareManager.validate).not.toHaveBeenCalled();
      expect(mockShareManager.recordAccess).not.toHaveBeenCalled();
    });

    test('the encrypted-vault viewer lives there, and the locked view loads it from there', () => {
      const root = path.resolve(__dirname, '../../..');
      expect(fs.existsSync(path.join(root, 'public', SHARE_ASSETS_PATH, 'share-viewer.js'))).toBe(true);
      const view = fs.readFileSync(path.join(root, 'views', 'share-locked.ejs'), 'utf-8');
      expect(view).toContain(`<script src="${SHARE_ASSETS_PATH}/share-viewer.js"></script>`);
      expect(view).not.toContain('/js/share-viewer.js');
    });
  });

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
      expect(mockShareManager.subjectFor).toHaveBeenCalledTimes(2);
    });

    test('#1223: the album lists exactly what the evaluator allows the share subject', async () => {
      shareState.media = [
        { id: 'm1', filePath: mediaFilePath, mimeType: 'image/jpeg' },
        { id: 'm2', filePath: mediaFilePath, mimeType: 'image/jpeg' }
      ];
      shareState.pages = [{ name: 'Trip', title: 'Trip' }, { name: 'Secret', title: 'Secret' }];
      deniedPages = ['Secret'];
      deniedMedia = ['m2'];

      const res = await request(app).get(`/share/${VALID_TOKEN}`);
      expect(res.status).toBe(200);
      const body = JSON.parse(res.text) as { media: Array<{ id: string }>; pages: Array<{ name: string }> };
      expect(body.media.map((m) => m.id)).toEqual(['m1']);
      expect(body.pages.map((p) => p.name)).toEqual(['Trip']);
    });

    test('#1223: every door is asked about the share subject, not the session', async () => {
      mockUserContext = { ...adminUser };   // an admin opening a share link
      shareState.media = [{ id: 'm1', filePath: mediaFilePath, mimeType: 'image/jpeg' }];
      shareState.pages = [{ name: 'Trip', title: 'Trip' }];
      await request(app).get(`/share/${VALID_TOKEN}`);
      expect(doorSubjects.length).toBeGreaterThan(0);
      for (const subject of doorSubjects) {
        expect(subject).toMatchObject({ username: 'Anonymous', viaShare: { id: 'share-1', issuer: 'ed' } });
      }
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

    test('a file the door refuses the share subject is 404', async () => {
      shareState.media = [{ id: 'm1', filePath: mediaFilePath, mimeType: 'image/jpeg' }];
      const unknown = await request(app).get(`/share/${VALID_TOKEN}/file/other-id`);
      expect(unknown.status).toBe(404);
      deniedMedia = ['m1'];
      const refused = await request(app).get(`/share/${VALID_TOKEN}/file/m1`);
      expect(refused.status).toBe(404);
      expect(refused.text).toBe(unknown.text);
    });

    test('#1223: the file route is the ordinary media door reached as the share subject', async () => {
      shareState.media = [{ id: 'm1', filePath: mediaFilePath, mimeType: 'image/jpeg' }];
      await request(app).get(`/share/${VALID_TOKEN}/file/m1`);
      expect(mockMediaManager.getItem).toHaveBeenCalledWith('m1', expect.objectContaining({
        userContext: expect.objectContaining({ viaShare: expect.objectContaining({ id: 'share-1' }) })
      }));
      expect(mockShareManager.resolveScope).not.toHaveBeenCalled();
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

    test('a thumbnail the door refuses the share subject is 404', async () => {
      const unknown = await request(app).get(`/share/${VALID_TOKEN}/thumb/other-id`);
      expect(unknown.status).toBe(404);
      shareState.media = [{ id: 'm1', filePath: mediaFilePath, mimeType: 'image/jpeg' }];
      deniedMedia = ['m1'];
      const refused = await request(app).get(`/share/${VALID_TOKEN}/thumb/m1`);
      expect(refused.status).toBe(404);
      expect(mockMediaManager.getThumbnailBuffer).not.toHaveBeenCalled();
    });

    test('#1223: the thumbnail door asks the evaluator for a session too, and caches publicly', async () => {
      mockUserContext = { ...readerUser };
      shareState.media = [{ id: 'm1', filePath: mediaFilePath, mimeType: 'image/jpeg' }];
      const ok = await request(app).get('/media/thumb/m1');
      expect(ok.status).toBe(200);
      expect(ok.headers['cache-control']).toBe('public, max-age=86400');
      deniedMedia = ['m1'];
      const refused = await request(app).get('/media/thumb/m1');
      expect(refused.status).toBe(404);
    });
  });

  // ── public: page ───────────────────────────────────────────────────────────

  describe('GET /share/:token/page/:name', () => {
    test('renders a page the share subject may read, read-only', async () => {
      const res = await request(app).get(`/share/${VALID_TOKEN}/page/Trip`);
      expect(res.status).toBe(200);
      const body = JSON.parse(res.text) as { view: string; html: string };
      expect(body.view).toBe('share-page');
      expect(body.html).toBe('<p>shared html</p>');
    });

    test('a page the read gate refuses the share subject is 404', async () => {
      deniedPages = ['Secret'];
      const res = await request(app).get(`/share/${VALID_TOKEN}/page/Secret`);
      expect(res.status).toBe(404);
      expect(mockPageManager.getPageContent).not.toHaveBeenCalled();
    });

    test('#1223: the page route is the ordinary read gate reached as the share subject', async () => {
      await request(app).get(`/share/${VALID_TOKEN}/page/Trip`);
      expect(doorSubjects).toContainEqual(expect.objectContaining({ viaShare: expect.objectContaining({ id: 'share-1' }) }));
      expect(mockShareManager.resolveScope).not.toHaveBeenCalled();
    });

    test('404 when the page content no longer exists', async () => {
      mockPageManager.getPageContent.mockRejectedValueOnce(new Error('not found'));
      const res = await request(app).get(`/share/${VALID_TOKEN}/page/Trip`);
      expect(res.status).toBe(404);
    });
  });

  // ── management: GET /shares ────────────────────────────────────────────────

  describe('GET /shares', () => {
    test('anonymous and readers are sent to /my/shares, which makes its own permission check', async () => {
      mockUserContext = null;
      const anon = await request(app).get('/shares');
      expect(anon.status).toBe(302);
      expect(anon.headers.location).toBe('/my/shares');
      mockUserContext = { ...readerUser };
      const reader = await request(app).get('/shares');
      expect(reader.status).toBe(302);
      expect(reader.headers.location).toBe('/my/shares');
    });

    test('an editor without admin-system is sent to their own page, not shown a list', async () => {
      mockUserContext = { ...editorUser };
      const res = await request(app).get('/shares?created=s1');
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/my/shares?created=s1');
      expect(mockShareManager.list).not.toHaveBeenCalled();
    });

    test('slice 4: a holder of share-manage-all is sent to the all-users view and nothing is listed here', async () => {
      mockUserContext = { ...adminUser };
      const res = await request(app).get('/shares?revoked=1');
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/my/shares?view=all&revoked=1');
      expect(mockShareManager.list).not.toHaveBeenCalled();
    });

    test('slice 4: a holder of admin-system without share-manage-all is sent to their own view', async () => {
      mockUserContext = { ...editorUser, username: 'sysadm', roles: [] };
      const res = await request(app).get('/shares');
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/my/shares');
    });
  });

  describe('slice 3: the old private-area POST addresses', () => {
    test('POST /my/vaults/links is sent on, body and all, with a 307', async () => {
      mockUserContext = { ...editorUser };
      const res = await request(app).post('/my/vaults/links').type('form').send({ ...csrfTestBodyField(), vault: 'journal' });
      expect(res.status).toBe(307);
      expect(res.headers.location).toBe('/my/shares/vault-links');
    });

    test('POST /my/vaults/links/:id/extend is sent on with a 307', async () => {
      mockUserContext = { ...editorUser };
      const res = await request(app).post('/my/vaults/links/abc/extend').type('form').send({ ...csrfTestBodyField(), hours: '6' });
      expect(res.status).toBe(307);
      expect(res.headers.location).toBe('/my/shares/abc/extend');
    });

    test('the new addresses are served', async () => {
      mockUserContext = { ...editorUser };
      for (const url of ['/my/shares/vault-links', '/my/shares/abc/extend']) {
        const res = await request(app).post(url).type('form').send({ ...csrfTestBodyField() });
        expect(res.status).not.toBe(404);
        expect(res.status).not.toBe(307);
      }
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
      expect(res.headers.location).toBe('/my/shares?created=new-share-id');
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
      expect(noKeyword.headers.location).toBe('/my/shares?error=keyword');

      const badTtl = await request(app)
        .post('/shares/create')
        .type('form')
        .send({ ...csrfTestBodyField(), keyword: 'trip', ttl: '2h' });
      expect(badTtl.headers.location).toBe('/my/shares?error=ttl');
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
      expect(res.headers.location).toBe('/my/shares?revoked=1');
      expect(mockShareManager.revoke).toHaveBeenCalledWith('s1', expect.objectContaining({ username: 'ed' }));
    });

    test('a maker who can no longer open the Shared links page lands on the front page, not a 403 (round 4)', async () => {
      shareState.records = [{ id: 's8', token: 'b'.repeat(64), scope: SCOPE, createdBy: 'nobody', createdAt: '2026-07-01T00:00:00.000Z', expiresAt: null }];
      mockUserContext = { ...editorUser, username: 'nobody', roles: [] };
      const res = await request(app)
        .post('/shares/s8/revoke')
        .type('form')
        .send(csrfTestBodyField());
      expect(res.status).toBe(302);
      expect(mockShareManager.revoke).toHaveBeenCalledWith('s8', expect.objectContaining({ username: 'nobody' }));
      expect(res.headers.location).toBe('/');
    });

    test('a signed-out subject cannot revoke a link (round 3 Sec L1)', async () => {
      shareState.records = [{ id: 's9', token: 'd'.repeat(64), scope: SCOPE, createdBy: 'Anonymous', createdAt: '2026-07-01T00:00:00.000Z', expiresAt: null }];
      mockUserContext = { username: 'Anonymous', displayName: 'Anonymous', isAuthenticated: false, roles: ['Anonymous'] };
      const res = await request(app)
        .post('/shares/s9/revoke')
        .type('form')
        .send(csrfTestBodyField());
      expect(res.status).toBe(403);
      expect(mockShareManager.revoke).not.toHaveBeenCalled();
    });

    // Slice 4 of #2247 (Q-A to Q-C): share-manage-all alone revokes another user's tag link.
    const MGR = { ...editorUser, username: 'mgr', roles: [] as string[] };
    test('slice 4: a holder of share-manage-all with neither share-revoke nor admin-system revokes another user\'s tag link', async () => {
      mockUserContext = { ...MGR };
      const res = await request(app)
        .post('/shares/s1/revoke')
        .type('form')
        .send(csrfTestBodyField());
      expect(res.status).toBe(302);
      expect(mockShareManager.revoke).toHaveBeenCalledTimes(1);
      expect(mockShareManager.revoke).toHaveBeenCalledWith('s1', expect.objectContaining({ username: 'mgr' }), { asManager: true });
      expect(res.headers.location).toBe('/my/shares?view=all&revoked=1');
    });

    test('slice 4: admin-system with share-revoke but without share-manage-all no longer revokes another user\'s tag link', async () => {
      mockUserContext = { ...editorUser, username: 'sysadm', roles: [] };
      const res = await request(app)
        .post('/shares/s1/revoke')
        .type('form')
        .send(csrfTestBodyField());
      expect(res.status).toBe(403);
      expect(mockShareManager.revoke).not.toHaveBeenCalled();
    });

    test('slice 4: a manager sending a private-area id to the tag route gets 404', async () => {
      shareState.records = [{ id: 'v9', token: 'g'.repeat(64), scope: { kind: 'vault', owner: 'ed', vault: 'journal', pages: null }, createdBy: 'ed', createdAt: '2026-07-01T00:00:00.000Z', expiresAt: null }];
      mockUserContext = { ...MGR };
      const res = await request(app)
        .post('/shares/v9/revoke')
        .type('form')
        .send(csrfTestBodyField());
      expect(res.status).toBe(404);
      expect(mockShareManager.revoke).not.toHaveBeenCalled();
    });

    test('slice 4: a token of the maker whose ceiling grants share-revoke still revokes through the maker branch', async () => {
      mockUserContext = { ...editorUser, viaToken: { id: 't1' } };
      const res = await request(app)
        .post('/shares/s1/revoke')
        .type('form')
        .send(csrfTestBodyField());
      expect(res.status).toBe(302);
      expect(mockShareManager.revoke.mock.calls[0]).toHaveLength(2);
    });

    test('admin revokes anyone\'s share → 302', async () => {
      mockUserContext = { ...adminUser };
      const res = await request(app)
        .post('/shares/s1/revoke')
        .type('form')
        .send(csrfTestBodyField());
      expect(res.status).toBe(302);
      expect(mockShareManager.revoke).toHaveBeenCalledWith('s1', expect.objectContaining({ username: 'root' }), { asManager: true });
    });

    // #2521 (slice 2 of #2247): the route tells the manager when someone other
    // than the maker ended the link, so the log and the owner's record carry it.
    test('#2521: an admin-system holder revoking another user\'s tag link is passed as a manager revoke', async () => {
      mockUserContext = { ...adminUser };
      const res = await request(app)
        .post('/shares/s1/revoke')
        .type('form')
        .send(csrfTestBodyField());
      expect(res.status).toBe(302);
      expect(mockShareManager.revoke).toHaveBeenCalledTimes(1);
      expect(mockShareManager.revoke).toHaveBeenCalledWith('s1', expect.objectContaining({ username: 'root' }), { asManager: true });
    });

    test('#2521: the maker revoking their own tag link is not a manager revoke, even when they hold admin-system', async () => {
      shareState.records = [{ id: 's2', token: 'e'.repeat(64), scope: SCOPE, createdBy: 'root', createdAt: '2026-07-01T00:00:00.000Z', expiresAt: null }];
      mockUserContext = { ...adminUser };
      const res = await request(app)
        .post('/shares/s2/revoke')
        .type('form')
        .send(csrfTestBodyField());
      expect(res.status).toBe(302);
      expect(mockShareManager.revoke).toHaveBeenCalledWith('s2', expect.objectContaining({ username: 'root' }));
      expect(mockShareManager.revoke.mock.calls[0]).toHaveLength(2);
      // /shares is a redirect now: a maker lands on the Shared links page.
      expect(res.headers.location).toBe('/my/shares?revoked=1');
    });

    test('slice 4: a manager stopping their own link from the all-users view stays in that view', async () => {
      shareState.records = [{ id: 's2', token: 'e'.repeat(64), scope: SCOPE, createdBy: 'root', createdAt: '2026-07-01T00:00:00.000Z', expiresAt: null }];
      mockUserContext = { ...adminUser };
      const res = await request(app)
        .post('/shares/s2/revoke')
        .type('form')
        .send({ ...csrfTestBodyField(), view: 'all' });
      expect(res.headers.location).toBe('/my/shares?view=all&revoked=1');
      expect(mockShareManager.revoke.mock.calls[0]).toHaveLength(2);
    });

    test('slice 4: a person without share-manage-all who posts view=all lands on their own list', async () => {
      mockUserContext = { ...editorUser };
      const res = await request(app)
        .post('/shares/s1/revoke')
        .type('form')
        .send({ ...csrfTestBodyField(), view: 'all' });
      expect(res.headers.location).toBe('/my/shares?revoked=1');
    });

    test('#2521: a token acting for the maker revokes through the maker branch, with no asManager', async () => {
      mockUserContext = { ...editorUser, viaToken: { id: 't1' } };
      const res = await request(app)
        .post('/shares/s1/revoke')
        .type('form')
        .send(csrfTestBodyField());
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/my/shares?revoked=1');
      expect(mockShareManager.revoke).toHaveBeenCalledTimes(1);
      expect(mockShareManager.revoke).toHaveBeenCalledWith('s1', expect.objectContaining({ username: 'ed', viaToken: { id: 't1' } }));
      expect(mockShareManager.revoke.mock.calls[0]).toHaveLength(2);
    });

    test('#2521: a creator revoking their own tag link passes the request\'s own subject, not a name', async () => {
      mockUserContext = { ...editorUser };
      await request(app)
        .post('/shares/s1/revoke')
        .type('form')
        .send(csrfTestBodyField());
      const [, subject] = mockShareManager.revoke.mock.calls[0] as unknown as [string, { username: string; roles: string[] }];
      expect(typeof subject).toBe('object');
      expect(subject).toMatchObject({ username: 'ed', roles: ['editor'] });
    });

    // Slice 3 of #2247 (Q-D, Q-G): a person who made a link revokes it at their
    // own session with no permission; a token acting for them keeps its ceiling.
    test('slice 3: a person who made a tag link revokes it holding no permission at all', async () => {
      shareState.records = [{ id: 's9', token: 'f'.repeat(64), scope: SCOPE, createdBy: 'maker', createdAt: '2026-07-01T00:00:00.000Z', expiresAt: null }];
      mockUserContext = { ...editorUser, username: 'maker', roles: [] };
      const res = await request(app)
        .post('/shares/s9/revoke')
        .type('form')
        .send(csrfTestBodyField());
      expect(res.status).toBe(302);
      expect(mockShareManager.revoke).toHaveBeenCalledWith('s9', expect.objectContaining({ username: 'maker' }));
      expect(mockShareManager.revoke.mock.calls[0]).toHaveLength(2);
    });

    test('slice 3: an agent token of the maker without share-revoke gets 403 on the same link', async () => {
      shareState.records = [{ id: 's9', token: 'f'.repeat(64), scope: SCOPE, createdBy: 'maker', createdAt: '2026-07-01T00:00:00.000Z', expiresAt: null }];
      mockUserContext = { ...editorUser, username: 'maker', roles: [], viaToken: { id: 't1' } };
      const res = await request(app)
        .post('/shares/s9/revoke')
        .type('form')
        .send(csrfTestBodyField());
      expect(res.status).toBe(403);
      expect(mockShareManager.revoke).not.toHaveBeenCalled();
    });

    test('slice 3: a signed-in user with no permission gets 404 for an unknown id, not the old blanket 403', async () => {
      mockUserContext = { ...editorUser, username: 'maker', roles: [] };
      const res = await request(app)
        .post('/shares/nope/revoke')
        .type('form')
        .send(csrfTestBodyField());
      expect(res.status).toBe(404);
    });

    test('slice 3: a signed-in user with no permission who did not make the link gets 403', async () => {
      mockUserContext = { ...editorUser, username: 'stranger', roles: [] };
      const res = await request(app)
        .post('/shares/s1/revoke')
        .type('form')
        .send(csrfTestBodyField());
      expect(res.status).toBe(403);
      expect(mockShareManager.revoke).not.toHaveBeenCalled();
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

  describe('#1485: the media library is refused to anonymous visitors', () => {
    test.each(['/media', '/media/keyword/trip', '/media/api/year/2020', '/media/file/m1', '/media/thumb/m1'])(
      '%s is refused anonymously and asks policy for media-read',
      async (url) => {
        mockUserContext = null;
        shareState.media = [{ id: 'm1', filePath: mediaFilePath, mimeType: 'image/jpeg' }];
        const res = await request(app).get(url);
        // A page sends the visitor to sign in; the API and the bytes refuse.
        if (url === '/media' || url.startsWith('/media/keyword')) {
          expect(res.status).toBe(302);
          expect(res.headers.location).toMatch(/\/login/);
        } else {
          expect([401, 403]).toContain(res.status);
        }
        expect(mockMediaManager.getThumbnailBuffer).not.toHaveBeenCalled();
      }
    );

    test('a reader passes the door', async () => {
      mockUserContext = { ...readerUser };
      shareState.media = [{ id: 'm1', filePath: mediaFilePath, mimeType: 'image/jpeg' }];
      expect((await request(app).get('/media/thumb/m1')).status).toBe(200);
      expect(mockPolicyDecisionPoint.permits).toHaveBeenCalledWith('reader', 'media-read');
    });

    test('share links are not behind it', async () => {
      mockUserContext = null;
      shareState.media = [{ id: 'm1', filePath: mediaFilePath, mimeType: 'image/jpeg' }];
      expect((await request(app).get(`/share/${VALID_TOKEN}/thumb/m1`)).status).toBe(200);
    });
  });

  describe('GET /media/keyword/:keyword canShare flag', () => {
    test('true for an editor when shares are enabled', async () => {
      mockUserContext = { ...editorUser };
      const res = await request(app).get('/media/keyword/trip');
      const body = JSON.parse(res.text) as { canShare: boolean };
      expect(body.canShare).toBe(true);
    });

    test('false when shares are disabled', async () => {
      mockUserContext = { ...editorUser };
      shareState.enabled = false;
      const disabled = JSON.parse((await request(app).get('/media/keyword/trip')).text) as { canShare: boolean };
      expect(disabled.canShare).toBe(false);
    });
  });
});
