/**
 * Tests for the bookmarklet capture routes (#881):
 * GET /capture (form), POST /capture (append/create via save pipeline),
 * GET /capture/install (bookmarklet installer).
 */

import WikiRoutes from '../WikiRoutes';
import type { WikiEngine } from '../../types/WikiEngine';

const authedUser = { username: 'jim', isAuthenticated: true, roles: ['admin'] };

const createMockReq = (userContext: unknown = null, query = {}, body = {}) => ({
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
  let mockHasPermission;
  let mockUpdatePageInIndex;
  let mockEngine;

  beforeEach(() => {
    mockGetPage = vi.fn().mockResolvedValue(null);
    mockSaveWithContext = vi.fn().mockResolvedValue(undefined);
    mockHasPermission = vi.fn().mockResolvedValue(true);
    mockUpdatePageInIndex = vi.fn().mockResolvedValue(undefined);

    mockEngine = {
      getManager: vi.fn((name) => {
        if (name === 'PageManager') {
          return {
            getPage: mockGetPage,
            savePageWithContext: mockSaveWithContext,
            getPageUUID: vi.fn().mockReturnValue('uuid-1')
          };
        }
        if (name === 'UserManager') return { hasPermission: mockHasPermission };
        if (name === 'RenderingManager') return { addPageToCache: vi.fn(), updatePageInLinkGraph: vi.fn() };
        if (name === 'SearchManager') return { updatePageInIndex: mockUpdatePageInIndex };
        if (name === 'CacheManager') return { isInitialized: () => false };
        if (name === 'AttachmentManager') return { syncPageMentions: vi.fn().mockResolvedValue(undefined) };
        if (name === 'AssetManager') return { syncPageAssets: vi.fn().mockResolvedValue(undefined) };
        if (name === 'ConfigurationManager') {
          // Feature is default-off; these tests run with it enabled.
          return { getProperty: vi.fn((key, def) => (key === 'ngdpbase.capture.enabled' ? true : def)) };
        }
        if (name === 'ValidationManager') return null;
        return null;
      })
    };
    wikiRoutes = new WikiRoutes(mockEngine);
  });

  describe('GET /capture', () => {
    test('redirects anonymous users to login', async () => {
      const req = createMockReq(null, { url: 'https://example.com' });
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
      expect(mockHasPermission).toHaveBeenCalledWith(expect.anything(), 'page-create');
      expect(mockUpdatePageInIndex).toHaveBeenCalledTimes(1);
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

    test('#1018 — the captured date sits at the bottom, followed by a ---- rule', async () => {
      const req = createMockReq(authedUser, {}, body);
      const res = createMockRes();
      await wikiRoutes.captureSubmit(req, res);

      const content = mockSaveWithContext.mock.calls[0][0].content as string;
      expect(content).toMatch(/\*\(captured \d{4}-\d{2}-\d{2}\)\*\n\n----\n?$/);
      // The date must no longer ride along on the source-link line.
      expect(content).not.toMatch(/target='_blank'\].*captured/);
    });

    test('#1018 — a blank line separates the date from the rule (setext-heading guard)', async () => {
      const req = createMockReq(authedUser, {}, body);
      const res = createMockRes();
      await wikiRoutes.captureSubmit(req, res);

      const content = mockSaveWithContext.mock.calls[0][0].content as string;
      // `*(captured …)*` immediately above `----` would render as an H2, not a
      // rule. The blank line is what keeps it a horizontal rule.
      expect(content).not.toMatch(/\*\(captured \d{4}-\d{2}-\d{2}\)\*\n----/);
    });

    test('#1018 — appending a second capture separates the two entries', async () => {
      mockSaveWithContext.mockClear();
      mockGetPage.mockResolvedValue({
        name: body.pageName,
        content: "## [First|https://example.com/1|target='_blank']\n\nearlier text\n\n*(captured 2026-08-04)*\n\n----\n",
        metadata: { title: body.pageName, uuid: 'uuid-1', author: 'jim' }
      });
      const req = createMockReq(authedUser, {}, body);
      const res = createMockRes();
      await wikiRoutes.captureSubmit(req, res);

      const content = mockSaveWithContext.mock.calls[0][0].content as string;
      expect((content.match(/^----$/gm) ?? [])).toHaveLength(2);
      expect(content.indexOf('## [First')).toBeLessThan(content.indexOf('## [An Article'));
      mockGetPage.mockResolvedValue(null);
    });

    test('#1018 — a capture with no URL still gets a heading, date and rule', async () => {
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
      expect(content).toMatch(/\*\(captured \d{4}-\d{2}-\d{2}\)\*\n\n----\n?$/);
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
      expect(mockHasPermission).toHaveBeenCalledWith(expect.anything(), 'page-edit');
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
      mockHasPermission.mockResolvedValue(false);
      const req = createMockReq(authedUser, {}, body);
      const res = createMockRes();
      await wikiRoutes.captureSubmit(req, res);
      expect(mockSaveWithContext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    test('401 for anonymous', async () => {
      const req = createMockReq(null, {}, body);
      const res = createMockRes();
      await wikiRoutes.captureSubmit(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(mockSaveWithContext).not.toHaveBeenCalled();
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

    const myReq = (userContext = authedUser) => ({
      ...createMockReq(userContext),
      path: '/my/captures',
      originalUrl: '/my/captures'
    });

    test('redirects anonymous callers to login', async () => {
      const res = createMockRes();
      await capturesRoutes().myCapturesPage(myReq(null), res);
      expect(res.redirect).toHaveBeenCalledWith('/login?redirect=' + encodeURIComponent('/my/captures'));
      expect(mockGetPagesByCreator).not.toHaveBeenCalled();
    });

    test('scopes the query to the caller and filters by the capture keyword', async () => {
      const res = createMockRes();
      await capturesRoutes().myCapturesPage(myReq(), res);
      expect(mockGetPagesByCreator).toHaveBeenCalledWith('jim', expect.objectContaining({
        systemKeywords: ['capture']
      }));
    });

    test('uses the instance\'s configured keyword, not a hardcoded "capture"', async () => {
      const res = createMockRes();
      await capturesRoutes({ 'ngdpbase.capture.keywords': ['clipping', 'inbox'] })
        .myCapturesPage(myReq(), res);
      expect(mockGetPagesByCreator).toHaveBeenCalledWith('jim', expect.objectContaining({
        systemKeywords: ['clipping', 'inbox']
      }));
    });

    test('falls back to ["capture"] when the config value is empty or malformed', async () => {
      const res = createMockRes();
      await capturesRoutes({ 'ngdpbase.capture.keywords': [] }).myCapturesPage(myReq(), res);
      expect(mockGetPagesByCreator).toHaveBeenCalledWith('jim', expect.objectContaining({
        systemKeywords: ['capture']
      }));
    });

    test('does NOT restrict to private pages — capture.private may be false', async () => {
      const res = createMockRes();
      await capturesRoutes().myCapturesPage(myReq(), res);
      expect(mockGetPagesByCreator).toHaveBeenCalledWith('jim', expect.objectContaining({
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
  });
});
