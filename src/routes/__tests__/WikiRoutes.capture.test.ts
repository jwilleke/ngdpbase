/**
 * Tests for the bookmarklet capture routes (#881):
 * GET /capture (form), POST /capture (append/create via save pipeline),
 * GET /capture/install (bookmarklet installer).
 */

import WikiRoutes from '../WikiRoutes';
import { ANONYMOUS_SUBJECT } from '../../managers/UserManager';
import type { WikiEngine } from '../../types/WikiEngine';

const authedUser = { username: 'jim', isAuthenticated: true, roles: ['admin'] };

// #1399: an anonymous caller carries the anonymous PRINCIPAL, not null. The
// session middleware assigns it on every request that has no session, so a
// request with no subject at all is a shape the server never produces.
const createMockReq = (userContext: unknown = ANONYMOUS_SUBJECT, query = {}, body = {}) => ({
  params: {},
  query,
  body,
  session: { csrfToken: 'tok' },
  path: '/capture',
  originalUrl: '/capture',
  protocol: 'http',
  get: vi.fn().mockReturnValue('localhost:3000'),
  userContext
});

const createMockRes = () => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis(),
  redirect: vi.fn().mockReturnThis(),
  render: vi.fn().mockReturnThis(),
  setHeader: vi.fn().mockReturnThis()
});

describe('WikiRoutes capture (#881)', () => {
  let wikiRoutes;
  let mockGetPage;
  let mockSaveWithContext;
  let mockPermits;
  let mockUpdatePageInIndex;
  let mockUpdatePageInLinkGraph;
  let mockAddPageToCache;
  let mockSyncPageMentions;
  let mockSyncPageAssets;
  let mockEngine;
  let captureConfig: Record<string, unknown>;

  beforeEach(() => {
    mockGetPage = vi.fn().mockResolvedValue(null);
    mockSaveWithContext = vi.fn().mockResolvedValue(undefined);
    // #1399: an anonymous caller is a real subject now, so a refusal has to come
    // from POLICY rather than from a missing user. page-create is not granted to
    // anonymous, which is what this models.
    mockPermits = vi.fn(async (subject) => subject?.isAuthenticated === true);
    mockUpdatePageInIndex = vi.fn().mockResolvedValue(undefined);
    mockUpdatePageInLinkGraph = vi.fn();
    mockAddPageToCache = vi.fn();
    mockSyncPageMentions = vi.fn().mockResolvedValue(undefined);
    mockSyncPageAssets = vi.fn().mockResolvedValue(undefined);
    captureConfig = { 'ngdpbase.capture.enabled': true };

    mockEngine = {
      getManager: vi.fn((name) => {
        if (name === 'PageManager') {
          return {
            getPage: mockGetPage,
            savePageWithContext: mockSaveWithContext,
            getPageUUID: vi.fn().mockReturnValue('uuid-1')
          };
        }
        // #1431 step 14: decisions are the PDP's.
        if (name === 'PolicyDecisionPoint') return { permits: mockPermits };
        if (name === 'RenderingManager') return { addPageToCache: mockAddPageToCache, updatePageInLinkGraph: mockUpdatePageInLinkGraph };
        if (name === 'SearchManager') return { updatePageInIndex: mockUpdatePageInIndex };
        if (name === 'CacheManager') return { isInitialized: () => false };
        if (name === 'AttachmentManager') return { syncPageMentions: mockSyncPageMentions };
        if (name === 'AssetManager') return { syncPageAssets: mockSyncPageAssets };
        if (name === 'ConfigurationManager') {
          // Feature is default-off; these tests run with it enabled. Every other
          // key (private-store layout, capture.private) resolves to its default.
          return { getProperty: vi.fn((key, def) => (key in captureConfig ? captureConfig[key] : def)) };
        }
        if (name === 'ValidationManager') return null;
        return null;
      })
    };
    wikiRoutes = new WikiRoutes(mockEngine);
  });

  describe('GET /capture', () => {
    test('redirects anonymous users to login', async () => {
      const req = createMockReq(ANONYMOUS_SUBJECT, { url: 'https://example.com' });
      const res = createMockRes();
      await wikiRoutes.captureForm(req, res);
      expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('/login?redirect='));
    });

    test('renders form with query params and default page pattern', async () => {
      const req = createMockReq(authedUser, { url: 'https://example.com/a', title: 'Example', text: 'quoted' });
      const res = createMockRes();
      await wikiRoutes.captureForm(req, res);
      expect(res.render).toHaveBeenCalledWith('capture', expect.objectContaining({
        url: 'https://example.com/a',
        pageTitle: 'Example',
        text: 'quoted',
        pageName: expect.stringMatching(/^Captures — jim — \d{4}-\d{2}-\d{2}$/),
        success: false
      }));
    });
  });

  describe('POST /capture', () => {
    const body = {
      pageName: 'Captures — 2026-07-21',
      url: 'https://example.com/article',
      title: 'An Article',
      text: 'line one\nline two'
    };

    test('creates a missing page with a heading source link and unquoted selection', async () => {
      const req = createMockReq(authedUser, {}, body);
      const res = createMockRes();
      await wikiRoutes.captureSubmit(req, res);

      expect(mockSaveWithContext).toHaveBeenCalledTimes(1);
      const savedContext = mockSaveWithContext.mock.calls[0][0];
      expect(savedContext.content).toContain('line one');
      expect(savedContext.content).toContain('line two');
      expect(savedContext.content).toContain("[An Article|https://example.com/article|target='_blank']");
      expect(mockPermits).toHaveBeenCalledWith(expect.anything(), 'page-create');
      // #1456: a new capture page is private by default, so it is saved under
      // its private name and kept out of the shared search index.
      expect(savedContext.pageName).toBe(`private/jim/default/${body.pageName}`);
      expect(mockUpdatePageInIndex).not.toHaveBeenCalled();
      expect(res.render).toHaveBeenCalledWith('capture', expect.objectContaining({ success: true }));
    });

    // ── #1018 — capture block shape ────────────────────────────────────────

    test('#1018 — the selection is NOT blockquoted', async () => {
      const req = createMockReq(authedUser, {}, body);
      const res = createMockRes();
      await wikiRoutes.captureSubmit(req, res);

      const content = mockSaveWithContext.mock.calls[0][0].content as string;
      expect(content).not.toContain('> line one');
      expect(content).not.toContain('> line two');
      expect(content).toMatch(/^line one$/m);
      expect(content).toMatch(/^line two$/m);
    });

    test('#1018 — the source link is an ## heading, not an em-dash line', async () => {
      const req = createMockReq(authedUser, {}, body);
      const res = createMockRes();
      await wikiRoutes.captureSubmit(req, res);

      const content = mockSaveWithContext.mock.calls[0][0].content as string;
      expect(content).toContain("## [An Article|https://example.com/article|target='_blank']");
      expect(content).not.toContain('— [An Article');
    });

    test('#1018 — the captured date is the last thing in the entry', async () => {
      const req = createMockReq(authedUser, {}, body);
      const res = createMockRes();
      await wikiRoutes.captureSubmit(req, res);

      const content = mockSaveWithContext.mock.calls[0][0].content as string;
      expect(content).toMatch(/\*\(captured \d{4}-\d{2}-\d{2}\)\*\n?$/);
      // The date must no longer ride along on the source-link line.
      expect(content).not.toMatch(/target='_blank'\].*captured/);
    });

    test('#1018 — the FIRST entry on a page carries no separator', async () => {
      mockSaveWithContext.mockClear();
      mockGetPage.mockResolvedValue(null);
      const req = createMockReq(authedUser, {}, body);
      const res = createMockRes();
      await wikiRoutes.captureSubmit(req, res);

      const content = mockSaveWithContext.mock.calls[0][0].content as string;
      // Separator goes BEFORE each entry except the first, so a fresh page has
      // none at all — and never ends on a dangling rule.
      expect(content).not.toMatch(/^----$/m);
      expect(content.startsWith('## [An Article')).toBe(true);
    });

    test('#1018 — appending puts a separator between the entries, not after', async () => {
      mockSaveWithContext.mockClear();
      mockGetPage.mockResolvedValue({
        name: body.pageName,
        content: "## [First|https://example.com/1|target='_blank']\n\nearlier text\n\n*(captured 2026-08-04)*\n",
        metadata: { title: body.pageName, uuid: 'uuid-1', author: 'jim' }
      });
      const req = createMockReq(authedUser, {}, body);
      const res = createMockRes();
      await wikiRoutes.captureSubmit(req, res);

      const content = mockSaveWithContext.mock.calls[0][0].content as string;
      // Two entries, exactly one rule, and it sits between them.
      expect((content.match(/^----$/gm) ?? [])).toHaveLength(1);
      const sep = content.indexOf('\n----\n');
      expect(content.indexOf('## [First')).toBeLessThan(sep);
      expect(sep).toBeLessThan(content.indexOf('## [An Article'));
      expect(content).not.toMatch(/----\s*$/);
      mockGetPage.mockResolvedValue(null);
    });

    test('#1018 — the separator is blank-line padded (setext-heading guard)', async () => {
      mockSaveWithContext.mockClear();
      mockGetPage.mockResolvedValue({
        name: body.pageName,
        content: "## [First|https://example.com/1|target='_blank']\n\nearlier text\n\n*(captured 2026-08-04)*\n",
        metadata: { title: body.pageName, uuid: 'uuid-1', author: 'jim' }
      });
      const req = createMockReq(authedUser, {}, body);
      const res = createMockRes();
      await wikiRoutes.captureSubmit(req, res);

      const content = mockSaveWithContext.mock.calls[0][0].content as string;
      // A line of dashes directly beneath text makes that text a setext H2, so
      // without the blank line the previous entry's date would become a heading
      // and no rule would be drawn at all.
      expect(content).not.toMatch(/\*\(captured \d{4}-\d{2}-\d{2}\)\*\n----/);
      expect(content).toContain('\n\n----\n\n');
      mockGetPage.mockResolvedValue(null);
    });

    test('#1018 — a capture with no URL still gets a heading and a date', async () => {
      mockSaveWithContext.mockClear();
      const req = createMockReq(authedUser, {}, {
        pageName: body.pageName,
        title: 'Just a title',
        text: 'some selection'
      });
      const res = createMockRes();
      await wikiRoutes.captureSubmit(req, res);

      const content = mockSaveWithContext.mock.calls[0][0].content as string;
      expect(content).toContain('## Just a title');
      expect(content).toContain('some selection');
      expect(content).toMatch(/\*\(captured \d{4}-\d{2}-\d{2}\)\*\n?$/);
    });

    test('created pages are keyword-tagged capture and private; appended pages keep their own', async () => {
      // create path — #893: capture is machine provenance, written to
      // system-keywords (the automation bucket), not user-keywords.
      let req = createMockReq(authedUser, {}, body);
      let res = createMockRes();
      await wikiRoutes.captureSubmit(req, res);
      let savedMetadata = mockSaveWithContext.mock.calls[0][1];
      expect(savedMetadata['system-keywords']).toEqual(['capture']);
      expect(savedMetadata['user-keywords']).toEqual([]);
      expect(savedMetadata.private).toBe(true);

      // append path — existing page keywords and privacy untouched
      mockSaveWithContext.mockClear();
      mockGetPage.mockResolvedValue({
        name: body.pageName,
        content: '# Existing\n',
        metadata: { title: body.pageName, uuid: 'uuid-1', author: 'jim', 'user-keywords': ['journal'] }
      });
      req = createMockReq(authedUser, {}, body);
      res = createMockRes();
      await wikiRoutes.captureSubmit(req, res);
      savedMetadata = mockSaveWithContext.mock.calls[0][1];
      expect(savedMetadata['user-keywords']).toEqual(['journal']);
      expect(savedMetadata.private).toBeUndefined();
    });

    test('appends to an existing page and checks page-edit', async () => {
      mockGetPage.mockResolvedValue({
        name: body.pageName,
        content: '# Existing\n\nOld capture\n',
        metadata: { title: body.pageName, uuid: 'uuid-1', author: 'jim' }
      });
      const req = createMockReq(authedUser, {}, body);
      const res = createMockRes();
      await wikiRoutes.captureSubmit(req, res);

      const savedContext = mockSaveWithContext.mock.calls[0][0];
      expect(savedContext.content).toContain('Old capture');
      expect(savedContext.content.indexOf('Old capture')).toBeLessThan(savedContext.content.indexOf('line one'));
      expect(mockPermits).toHaveBeenCalledWith(expect.anything(), 'page-edit');
    });

    test('sanitizes pipes and brackets out of the link label', async () => {
      const req = createMockReq(authedUser, {}, { ...body, title: 'Bad | [label] here' });
      const res = createMockRes();
      await wikiRoutes.captureSubmit(req, res);
      const savedContext = mockSaveWithContext.mock.calls[0][0];
      expect(savedContext.content).toContain("[Bad label here|https://example.com/article|target='_blank']");
    });

    test('rejects non-http URLs', async () => {
      const req = createMockReq(authedUser, {}, { ...body, url: 'javascript:alert(1)' });
      const res = createMockRes();
      await wikiRoutes.captureSubmit(req, res);
      expect(mockSaveWithContext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('403 when user lacks permission', async () => {
      mockPermits.mockResolvedValue(false);
      const req = createMockReq(authedUser, {}, body);
      const res = createMockRes();
      await wikiRoutes.captureSubmit(req, res);
      expect(mockSaveWithContext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    test('401 for anonymous', async () => {
      const req = createMockReq(ANONYMOUS_SUBJECT, {}, body);
      const res = createMockRes();
      await wikiRoutes.captureSubmit(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(mockSaveWithContext).not.toHaveBeenCalled();
    });
  });

  // ── #1456 — a private page is named by its path ────────────────────────────

  describe('POST /capture — private and public day pages (#1456)', () => {
    const body = {
      pageName: 'Captures — 2026-07-21',
      url: 'https://example.com/article',
      title: 'An Article',
      text: 'line one'
    };
    const privateName = `private/jim/default/${body.pageName}`;
    const pageAt = (name: string, content: string, metadata: Record<string, unknown> = {}) =>
      mockGetPage.mockImplementation(async (n: string) => (n === name
        ? { name, content, metadata: { title: body.pageName, uuid: 'uuid-1', author: 'jim', ...metadata } }
        : null));

    test('a new day page is created under private/jim/default/<pageName> and linked there', async () => {
      const res = createMockRes();
      await wikiRoutes.captureSubmit(createMockReq(authedUser, {}, body), res);

      expect(mockSaveWithContext).toHaveBeenCalledTimes(1);
      const [savedContext, savedMetadata] = mockSaveWithContext.mock.calls[0];
      expect(savedContext.pageName).toBe(privateName);
      // The page's title is the plain name; only its name carries the path.
      expect(savedMetadata.title).toBe(body.pageName);
      expect(savedMetadata.private).toBe(true);
      expect(mockPermits).toHaveBeenCalledWith(expect.anything(), 'page-create');
      expect(res.render).toHaveBeenCalledWith('capture', expect.objectContaining({
        success: true,
        viewUrl: '/private/jim/default/' + encodeURIComponent(body.pageName)
      }));
    });

    test('the new page goes into the configured default store', async () => {
      captureConfig['ngdpbase.page.provider.filesystem.defaultstoreid'] = 'clippings';
      await wikiRoutes.captureSubmit(createMockReq(authedUser, {}, body), createMockRes());
      expect(mockSaveWithContext.mock.calls[0][0].pageName).toBe(`private/jim/clippings/${body.pageName}`);
    });

    test('a private target touches no mentions, assets, link graph or search index', async () => {
      await wikiRoutes.captureSubmit(createMockReq(authedUser, {}, body), createMockRes());
      expect(mockSaveWithContext).toHaveBeenCalledTimes(1);
      expect(mockUpdatePageInIndex).not.toHaveBeenCalled();
      expect(mockUpdatePageInLinkGraph).not.toHaveBeenCalled();
      expect(mockAddPageToCache).not.toHaveBeenCalled();
      expect(mockSyncPageMentions).not.toHaveBeenCalled();
      expect(mockSyncPageAssets).not.toHaveBeenCalled();
    });

    test('appends to the capturer\'s existing private page', async () => {
      pageAt(privateName, '# Mine\n\nOld private capture\n', { private: true });
      const res = createMockRes();
      await wikiRoutes.captureSubmit(createMockReq(authedUser, {}, body), res);

      const [savedContext, savedMetadata] = mockSaveWithContext.mock.calls[0];
      expect(savedContext.pageName).toBe(privateName);
      expect(savedContext.content).toContain('Old private capture');
      expect(savedContext.content.indexOf('Old private capture')).toBeLessThan(savedContext.content.indexOf('line one'));
      expect(savedMetadata.private).toBe(true);
      expect(mockPermits).toHaveBeenCalledWith(expect.anything(), 'page-edit');
      // The public page of that title is not consulted once the private one is found.
      expect(mockGetPage).not.toHaveBeenCalledWith(body.pageName, expect.anything());
      expect(mockUpdatePageInIndex).not.toHaveBeenCalled();
      expect(res.render).toHaveBeenCalledWith('capture', expect.objectContaining({
        viewUrl: '/private/jim/default/' + encodeURIComponent(body.pageName)
      }));
    });

    test('appends to an existing public page when there is no private one', async () => {
      pageAt(body.pageName, '# Shared\n\nOld public capture\n');
      const res = createMockRes();
      await wikiRoutes.captureSubmit(createMockReq(authedUser, {}, body), res);

      expect(mockGetPage).toHaveBeenCalledWith(privateName, expect.anything());
      const [savedContext, savedMetadata] = mockSaveWithContext.mock.calls[0];
      expect(savedContext.pageName).toBe(body.pageName);
      expect(savedContext.content).toContain('Old public capture');
      expect(savedMetadata.private).toBeUndefined();
      expect(mockPermits).toHaveBeenCalledWith(expect.anything(), 'page-edit');
      // A public page stays in the shared indexes.
      expect(mockUpdatePageInIndex).toHaveBeenCalledWith(body.pageName, expect.objectContaining({ name: body.pageName }));
      expect(mockUpdatePageInLinkGraph).toHaveBeenCalledWith(body.pageName, savedContext.content);
      expect(res.render).toHaveBeenCalledWith('capture', expect.objectContaining({
        viewUrl: '/view/' + encodeURIComponent(body.pageName)
      }));
    });

    test('a new page is public, under its plain name, when capture.private is false', async () => {
      captureConfig['ngdpbase.capture.private'] = false;
      const res = createMockRes();
      await wikiRoutes.captureSubmit(createMockReq(authedUser, {}, body), res);

      const [savedContext, savedMetadata] = mockSaveWithContext.mock.calls[0];
      expect(savedContext.pageName).toBe(body.pageName);
      expect(savedMetadata.private).toBeUndefined();
      expect(mockUpdatePageInIndex).toHaveBeenCalledWith(body.pageName, expect.anything());
      expect(res.render).toHaveBeenCalledWith('capture', expect.objectContaining({
        viewUrl: '/view/' + encodeURIComponent(body.pageName)
      }));
    });

    test('an existing private page is still used when capture.private is false', async () => {
      captureConfig['ngdpbase.capture.private'] = false;
      pageAt(privateName, '# Mine\n', { private: true });
      await wikiRoutes.captureSubmit(createMockReq(authedUser, {}, body), createMockRes());
      expect(mockSaveWithContext.mock.calls[0][0].pageName).toBe(privateName);
    });
  });

  describe('feature gate — disabled by default', () => {
    let gatedRoutes;

    beforeEach(() => {
      const gatedEngine = {
        getManager: vi.fn((name) => {
          if (name === 'ConfigurationManager') {
            return { getProperty: vi.fn((key, def) => def) }; // enabled resolves to default: false
          }
          return null;
        })
      };
      gatedRoutes = new WikiRoutes(gatedEngine);
    });

    test('GET /capture is 404', async () => {
      const res = createMockRes();
      await gatedRoutes.captureForm(createMockReq(authedUser), res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    test('POST /capture is 404', async () => {
      const res = createMockRes();
      await gatedRoutes.captureSubmit(createMockReq(authedUser, {}, { pageName: 'X', url: 'https://a.b' }), res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    test('GET /capture/install is 404', async () => {
      const res = createMockRes();
      await gatedRoutes.captureInstall(createMockReq(authedUser), res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    // #1004: the read surface is gated exactly like the write surface. A
    // "My Captures" page on an instance with no capture feature is a dead end.
    test('GET /my/captures is 404', async () => {
      const res = createMockRes();
      await gatedRoutes.myCapturesPage(createMockReq(authedUser), res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('GET /my/captures (#1004)', () => {
    let mockGetPagesByCreator;

    const capturesRoutes = (configOverrides = {}) => {
      mockGetPagesByCreator = vi.fn().mockResolvedValue([
        { title: 'Captures — jim — 2026-07-28', uuid: 'u1', lastModified: '2026-07-28T00:00:00.000Z', isPrivate: true }
      ]);
      const engine = {
        getManager: vi.fn((name) => {
          if (name === 'PageManager') return { getPagesByCreator: mockGetPagesByCreator };
          // #1198: /my/captures asks profile-manage of policy; the signed-in user holds it.
          // #1431 step 14: decisions are the PDP's.
          if (name === 'PolicyDecisionPoint') return { permits: vi.fn(async (subject) => subject?.isAuthenticated === true) };
          if (name === 'ConfigurationManager') {
            return {
              getProperty: vi.fn((key, def) => {
                if (key === 'ngdpbase.capture.enabled') return true;
                if (key in configOverrides) return configOverrides[key];
                return def;
              })
            };
          }
          return null;
        })
      };
      return new WikiRoutes(engine);
    };

    // #1456: the caller's own context rides along, so their private pages
    // are read from their stores.
    const callerCtx = expect.objectContaining({ username: 'jim', isAuthenticated: true });

    const myReq = (userContext = authedUser) => ({
      ...createMockReq(userContext),
      path: '/my/captures',
      originalUrl: '/my/captures'
    });

    test('redirects anonymous callers to login', async () => {
      const res = createMockRes();
      await capturesRoutes().myCapturesPage(myReq(ANONYMOUS_SUBJECT), res);
      expect(res.redirect).toHaveBeenCalledWith('/login?redirect=' + encodeURIComponent('/my/captures'));
      expect(mockGetPagesByCreator).not.toHaveBeenCalled();
    });

    test('scopes the query to the caller and filters by the capture keyword', async () => {
      const res = createMockRes();
      await capturesRoutes().myCapturesPage(myReq(), res);
      expect(mockGetPagesByCreator).toHaveBeenCalledWith('jim', callerCtx, expect.objectContaining({
        systemKeywords: ['capture']
      }));
    });

    test('uses the instance\'s configured keyword, not a hardcoded "capture"', async () => {
      const res = createMockRes();
      await capturesRoutes({ 'ngdpbase.capture.keywords': ['clipping', 'inbox'] })
        .myCapturesPage(myReq(), res);
      expect(mockGetPagesByCreator).toHaveBeenCalledWith('jim', callerCtx, expect.objectContaining({
        systemKeywords: ['clipping', 'inbox']
      }));
    });

    test('falls back to ["capture"] when the config value is empty or malformed', async () => {
      const res = createMockRes();
      await capturesRoutes({ 'ngdpbase.capture.keywords': [] }).myCapturesPage(myReq(), res);
      expect(mockGetPagesByCreator).toHaveBeenCalledWith('jim', callerCtx, expect.objectContaining({
        systemKeywords: ['capture']
      }));
    });

    test('does NOT restrict to private pages — capture.private may be false', async () => {
      const res = createMockRes();
      await capturesRoutes().myCapturesPage(myReq(), res);
      expect(mockGetPagesByCreator).toHaveBeenCalledWith('jim', callerCtx, expect.objectContaining({
        onlyPrivate: false
      }));
    });

    test('renders the shared my-list view with the returned items', async () => {
      const res = createMockRes();
      const routes = capturesRoutes();
      // Site chrome needs a fully-wired engine (theme, addons, email, …) that is
      // irrelevant here — stub it so the assertion is about what this handler
      // contributes to the render, not about the shared template payload.
      vi.spyOn(routes, 'getCommonTemplateData').mockResolvedValue({});
      await routes.myCapturesPage(myReq(), res);
      expect(res.render).toHaveBeenCalledWith('my-list', expect.objectContaining({
        title: 'My Captures',
        listKind: 'pages',
        items: [expect.objectContaining({ uuid: 'u1' })]
      }));
    });
  });

  describe('GET /capture/install', () => {
    test('renders bookmarklet with resolved base url', async () => {
      const req = createMockReq(authedUser);
      const res = createMockRes();
      await wikiRoutes.captureInstall(req, res);
      expect(res.render).toHaveBeenCalledWith('capture-install', expect.objectContaining({
        bookmarklet: expect.stringContaining("window.open('http://localhost:3000/capture?'"),
        baseUrl: 'http://localhost:3000',
        applicationName: 'ngdpbase'
      }));
    });

    test('#1077: bookmarklet is valid JS and rewrites selection anchors as markdown links', async () => {
      const req = createMockReq(authedUser);
      const res = createMockRes();
      await wikiRoutes.captureInstall(req, res);
      const { bookmarklet } = res.render.mock.calls[0][1];

      // Parses as a program — a quoting slip in the string concat would land
      // here, not in a browser months later.
      const vm = await import('node:vm');
      expect(() => new vm.Script(bookmarklet.replace(/^javascript:/, ''))).not.toThrow();

      // Link preservation machinery is present: selection cloned, anchors
      // found, rewritten to NCM [label|url|target='_blank'] (the same shape
      // captureSubmit emits for the source heading), text read via innerText
      // (layout line breaks; textContent would flatten paragraphs).
      expect(bookmarklet).toContain('cloneContents()');
      expect(bookmarklet).toContain("querySelectorAll('a[href]')");
      expect(bookmarklet).toContain("a.textContent='['+t+'|'+h+'|target=\\'_blank\\']'");
      expect(bookmarklet).toContain('innerText');

      // Fallback for no-range selections keeps the pre-#1077 behavior.
      expect(bookmarklet).toContain('s=String(sel)');
    });
  });
});
