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
          return { getProperty: vi.fn((key, def) => def) };
        }
        if (name === 'ValidationManager') return null;
        return null;
      })
    };
    wikiRoutes = new WikiRoutes(mockEngine as unknown as WikiEngine);
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
        pageName: expect.stringMatching(/^Captures — \d{4}-\d{2}-\d{2}$/),
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

    test('creates a missing page with blockquote and source link', async () => {
      const req = createMockReq(authedUser, {}, body);
      const res = createMockRes();
      await wikiRoutes.captureSubmit(req, res);

      expect(mockSaveWithContext).toHaveBeenCalledTimes(1);
      const savedContext = mockSaveWithContext.mock.calls[0][0];
      expect(savedContext.content).toContain('> line one');
      expect(savedContext.content).toContain('> line two');
      expect(savedContext.content).toContain("[An Article|https://example.com/article|target='_blank']");
      expect(mockHasPermission).toHaveBeenCalledWith(expect.anything(), 'page-create');
      expect(mockUpdatePageInIndex).toHaveBeenCalledTimes(1);
      expect(res.render).toHaveBeenCalledWith('capture', expect.objectContaining({ success: true }));
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
      expect(savedContext.content.indexOf('Old capture')).toBeLessThan(savedContext.content.indexOf('> line one'));
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
