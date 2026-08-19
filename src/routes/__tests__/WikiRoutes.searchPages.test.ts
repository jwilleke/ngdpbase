/**
 * Unit tests for WikiRoutes.searchPages() — GET /search
 *
 * Slice 3 of EPIC #693 (#696) reduced this to a minimal renderer that
 * translates URL params into asset-picker initial state and renders
 * `browse-attachments.ejs`. All server-side result rendering moved to
 * `/api/assets/search` (the picker JS calls it).
 *
 * Covers URL-param translation including the legacy aliases:
 *   tab=attachments|media|pages|users → types=attachment|media|page|user
 *   attachmentQuery / mediaQuery       → q
 *   mimeType                           → mimeCategory
 */

import WikiRoutes from '../WikiRoutes';
import { createMockWikiContext } from './__fixtures__/createMockWikiContext';
import type { Request } from 'express';

function makeEngine() {
  return {
    getManager: vi.fn().mockReturnValue(null),
    getConfig: vi.fn().mockReturnValue({ get: () => undefined }),
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }
  };
}

function makeReq(overrides = {}) {
  return {
    userContext: { roles: [], username: 'anonymous' },
    query: {},
    ...overrides
  } as unknown as Request;
}

function makeRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    render: vi.fn().mockReturnThis(),
    send:   vi.fn().mockReturnThis()
  };
  return res;
}

function makeRoutes() {
  const engine = makeEngine();
  const routes = new WikiRoutes(engine);
  routes.createWikiContext = vi.fn((req: Request) =>
    createMockWikiContext({ userContext: (req as { userContext?: unknown }).userContext as never }, { engine })
  );
  // getCommonTemplateData hits a lot of managers; stub it.
  routes.getCommonTemplateData = vi.fn().mockResolvedValue({ user: null });
  return routes;
}

describe('WikiRoutes.searchPages — GET /search (post-#693 swap)', () => {
  it('renders browse-attachments with empty init state when no URL params', async () => {
    const routes = makeRoutes();
    const req = makeReq({ query: {} });
    const res = makeRes();

    await routes.searchPages(req, res);

    expect(res.render).toHaveBeenCalledWith('browse-attachments', expect.objectContaining({
      assetPickerInitQuery: '',
      assetPickerInitSource: '',
      assetPickerInitMime: '',
      assetPickerInitFilters: { category: [], keywords: [], systemKeywords: [], searchIn: [] }
    }));
  });

  it('threads q param into assetPickerInitQuery', async () => {
    const routes = makeRoutes();
    const req = makeReq({ query: { q: 'beach' } });
    const res = makeRes();

    await routes.searchPages(req, res);

    expect(res.render).toHaveBeenCalledWith('browse-attachments', expect.objectContaining({
      assetPickerInitQuery: 'beach'
    }));
  });

  it('falls back to attachmentQuery when q is absent (legacy /search?tab=attachments URLs)', async () => {
    const routes = makeRoutes();
    const req = makeReq({ query: { attachmentQuery: 'cat.jpg' } });
    const res = makeRes();

    await routes.searchPages(req, res);

    expect(res.render).toHaveBeenCalledWith('browse-attachments', expect.objectContaining({
      assetPickerInitQuery: 'cat.jpg'
    }));
  });

  it('falls back to mediaQuery when q and attachmentQuery are absent', async () => {
    const routes = makeRoutes();
    const req = makeReq({ query: { mediaQuery: 'sunset' } });
    const res = makeRes();

    await routes.searchPages(req, res);

    expect(res.render).toHaveBeenCalledWith('browse-attachments', expect.objectContaining({
      assetPickerInitQuery: 'sunset'
    }));
  });

  it.each([
    ['attachments', 'attachment'],
    ['media',       'media'],
    ['pages',       'page'],
    ['page',        'page'],
    ['users',       'user'],
    ['user',        'user']
  ])('translates legacy ?tab=%s to assetPickerInitSource=%s', async (legacyTab, expectedSource) => {
    const routes = makeRoutes();
    const req = makeReq({ query: { tab: legacyTab } });
    const res = makeRes();

    await routes.searchPages(req, res);

    expect(res.render).toHaveBeenCalledWith('browse-attachments', expect.objectContaining({
      assetPickerInitSource: expectedSource
    }));
  });

  it('prefers explicit types= over legacy tab=', async () => {
    const routes = makeRoutes();
    const req = makeReq({ query: { types: 'user', tab: 'attachments' } });
    const res = makeRes();

    await routes.searchPages(req, res);

    expect(res.render).toHaveBeenCalledWith('browse-attachments', expect.objectContaining({
      assetPickerInitSource: 'user'
    }));
  });

  it('translates legacy mimeType to mimeCategory', async () => {
    const routes = makeRoutes();
    const req = makeReq({ query: { mimeType: 'image' } });
    const res = makeRes();

    await routes.searchPages(req, res);

    expect(res.render).toHaveBeenCalledWith('browse-attachments', expect.objectContaining({
      assetPickerInitMime: 'image'
    }));
  });

  it('threads category as array (single value)', async () => {
    const routes = makeRoutes();
    const req = makeReq({ query: { category: 'Documentation' } });
    const res = makeRes();

    await routes.searchPages(req, res);

    expect(res.render).toHaveBeenCalledWith('browse-attachments', expect.objectContaining({
      assetPickerInitFilters: expect.objectContaining({ category: ['Documentation'] })
    }));
  });

  it('threads category as array (multiple values)', async () => {
    const routes = makeRoutes();
    const req = makeReq({ query: { category: ['Documentation', 'Tutorial'] } });
    const res = makeRes();

    await routes.searchPages(req, res);

    expect(res.render).toHaveBeenCalledWith('browse-attachments', expect.objectContaining({
      assetPickerInitFilters: expect.objectContaining({ category: ['Documentation', 'Tutorial'] })
    }));
  });

  it('threads keywords / systemKeywords / searchIn', async () => {
    const routes = makeRoutes();
    const req = makeReq({ query: { keywords: ['kw1', 'kw2'], systemKeywords: 'todo', searchIn: 'title' } });
    const res = makeRes();

    await routes.searchPages(req, res);

    expect(res.render).toHaveBeenCalledWith('browse-attachments', expect.objectContaining({
      assetPickerInitFilters: {
        category: [],
        keywords: ['kw1', 'kw2'],
        systemKeywords: ['todo'],
        searchIn: ['title']
      }
    }));
  });

  it('does not perform the search server-side — search runs via /api/assets/search', async () => {
    const routes = makeRoutes();
    const searchManager = {
      advancedSearchWithContext: vi.fn(),
      search: vi.fn(),
      searchWiki: vi.fn(),
      // #691: reading keyword catalogs to server-inject the picker's
      // Pages filters IS allowed — that is not "performing the search".
      getAllUserKeywords: vi.fn().mockResolvedValue([]),
      getAllSystemKeywords: vi.fn().mockResolvedValue([])
    };
    (routes.engine.getManager as ReturnType<typeof vi.fn>).mockImplementation(
      (name: string) => (name === 'SearchManager' ? searchManager : null)
    );
    const req = makeReq({ query: { q: 'beach' } });
    const res = makeRes();

    await routes.searchPages(req, res);

    // The /search page render must not execute a search (that moved to the
    // client-side /api/assets/search). Catalog reads for the picker are fine.
    expect(searchManager.advancedSearchWithContext).not.toHaveBeenCalled();
    expect(searchManager.search).not.toHaveBeenCalled();
    expect(searchManager.searchWiki).not.toHaveBeenCalled();
  });

  it('#691: server-injects assetPickerCategories from SearchManager.getAllCategories', async () => {
    const routes = makeRoutes();
    const searchManager = {
      getAllUserKeywords:   vi.fn().mockResolvedValue(['kw1']),
      getAllSystemKeywords: vi.fn().mockResolvedValue(['sk1']),
      getAllCategories:     vi.fn().mockResolvedValue(['General', 'Documentation'])
    };
    (routes.engine.getManager as ReturnType<typeof vi.fn>).mockImplementation(
      (name: string) => (name === 'SearchManager' ? searchManager : null)
    );
    const res = makeRes();

    await routes.searchPages(makeReq(), res);

    expect(res.render).toHaveBeenCalledWith('browse-attachments', expect.objectContaining({
      assetPickerCategories:     ['General', 'Documentation'],
      assetPickerUserKeywords:   ['kw1'],
      assetPickerSystemKeywords: ['sk1']
    }));
  });

  it('#691: assetPickerCategories defaults to [] when SearchManager is unavailable (graceful)', async () => {
    const routes = makeRoutes(); // makeEngine getManager → null
    const res = makeRes();

    await routes.searchPages(makeReq(), res);

    expect(res.render).toHaveBeenCalledWith('browse-attachments', expect.objectContaining({
      assetPickerCategories: []
    }));
  });

  it('#1059: 403s when the caller lacks search-page', async () => {
    const engine = makeEngine();
    const routes = new WikiRoutes(engine);
    routes.createWikiContext = vi.fn((req: Request) =>
      createMockWikiContext(
        { userContext: (req as { userContext?: unknown }).userContext as never },
        { engine, mockUserManager: { hasPermission: vi.fn().mockResolvedValue(false) } }
      )
    );
    routes.getCommonTemplateData = vi.fn().mockResolvedValue({ user: null });
    const res = makeRes();

    await routes.searchPages(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.render).toHaveBeenCalledWith('error', expect.objectContaining({ code: 403 }));
  });
});
