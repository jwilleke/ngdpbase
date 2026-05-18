/**
 * Unit tests for WikiRoutes.assetSearch() — GET /api/assets/search
 *
 * Covers:
 *   - Auth: 403 for unauthenticated / insufficient role
 *   - 503 when AssetService is not registered
 *   - Query param forwarding (q, types, year, pageSize, offset)
 *   - pageSize cap at 200
 *   - Success response shape (spreads AssetSearchPage fields)
 *   - 500 on unexpected error
 */

import WikiRoutes from '../WikiRoutes';
import { createMockWikiContext } from './__fixtures__/createMockWikiContext';
import type { Request } from 'express';

function makeAssetPage(results = [], total = null, hasMore = false) {
  return {
    results,
    total: total !== null ? total : results.length,
    hasMore
  };
}

function makeAssetService(page = makeAssetPage()) {
  return { search: vi.fn().mockResolvedValue(page) };
}

function makeEngine(assetService) {
  return {
    getManager: vi.fn((name) => {
      if (name === 'AssetService') return assetService;
      return null;
    })
  };
}

function makeReq(overrides = {}) {
  return {
    userContext: { roles: ['editor'] },
    query: {},
    ...overrides
  } as unknown as Request;
}

function makeRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis()
  };
  return res;
}

// WikiRoutes.createWikiContext is called in assetSearch — stub it
// #625: stub forwards userContext from the request so role checks see it
function makeRoutes(assetService) {
  const engine = makeEngine(assetService);
  const routes = new WikiRoutes(engine);
  // #638 — shared mock fixture
  routes.createWikiContext = vi.fn((req: Request) =>
    createMockWikiContext({ userContext: (req as { userContext?: unknown }).userContext as never }, { engine })
  );
  return routes;
}

describe('WikiRoutes.assetSearch — GET /api/assets/search', () => {
  describe('authentication / authorisation', () => {
    // #742: the editor gate now applies to explicit asset types only — the
    // no-types "all sources" path is anon-safe (pages). These two tests pin
    // the asset-surface gate via an explicit type.
    it('returns 403 when userContext is missing', async () => {
      const routes = makeRoutes(makeAssetService());
      const req = makeReq({ userContext: null, query: { types: 'attachment' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('returns 403 when user has no relevant role', async () => {
      const routes = makeRoutes(makeAssetService());
      const req = makeReq({ userContext: { roles: ['viewer'] }, query: { types: 'attachment' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it.each(['admin', 'editor', 'contributor'])(
      'allows role: %s',
      async (role) => {
        const service = makeAssetService();
        const routes = makeRoutes(service);
        const req = makeReq({ userContext: { roles: [role] }, query: {} });
        const res = makeRes();

        await routes.assetSearch(req, res);

        expect(res.status).not.toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
      }
    );
  });

  describe('service unavailable', () => {
    it('returns 503 when AssetService is not registered', async () => {
      const engine = { getManager: vi.fn().mockReturnValue(null) };
      const routes = new WikiRoutes(engine);
      // #638 — shared mock fixture
      routes.createWikiContext = vi.fn((req: Request) =>
        createMockWikiContext({ userContext: (req as { userContext?: unknown }).userContext as never }, { engine })
      );
      // #742: 503-on-missing-AssetService is an asset-surface invariant; the
      // no-types path no longer needs AssetService (pages/users still work).
      const req = makeReq({ query: { types: 'attachment' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });
  });

  describe('query param forwarding', () => {
    it('passes q, types array, year, pageSize, and offset to AssetService.search()', async () => {
      const service = makeAssetService();
      const routes = makeRoutes(service);
      const req = makeReq({
        query: { q: 'beach', types: 'attachment,media', year: '2023', pageSize: '20', offset: '40' }
      });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(service.search).toHaveBeenCalledWith(expect.objectContaining({
        query: 'beach',
        types: ['attachment', 'media'],
        year: 2023,
        pageSize: 20,
        offset: 40
      }));
    });

    it('omits types when not provided (pass undefined)', async () => {
      const service = makeAssetService();
      const routes = makeRoutes(service);
      const req = makeReq({ query: { q: 'test' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      const call = service.search.mock.calls[0][0];
      expect(call.types).toBeUndefined();
    });

    it('ignores unknown type values in types param', async () => {
      const service = makeAssetService();
      const routes = makeRoutes(service);
      const req = makeReq({ query: { types: 'media,garbage,attachment' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      const call = service.search.mock.calls[0][0];
      expect(call.types).toEqual(['media', 'attachment']);
    });

    it('caps pageSize at 200', async () => {
      const service = makeAssetService();
      const routes = makeRoutes(service);
      const req = makeReq({ query: { pageSize: '9999' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      const call = service.search.mock.calls[0][0];
      expect(call.pageSize).toBe(200);
    });

    it('defaults pageSize to 48 when not provided', async () => {
      const service = makeAssetService();
      const routes = makeRoutes(service);
      // #742: forwarded-pageSize is an asset-branch invariant; the all-sources
      // path oversamples AssetService and slices the merged response instead.
      const req = makeReq({ query: { types: 'attachment' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      const call = service.search.mock.calls[0][0];
      expect(call.pageSize).toBe(48);
    });

    it('defaults offset to 0 when not provided', async () => {
      const service = makeAssetService();
      const routes = makeRoutes(service);
      const req = makeReq({ query: {} });
      const res = makeRes();

      await routes.assetSearch(req, res);

      const call = service.search.mock.calls[0][0];
      expect(call.offset).toBe(0);
    });
  });

  describe('success response', () => {
    it('spreads AssetSearchPage fields into { success: true, results, total, hasMore }', async () => {
      const fakeResults = [
        { assetType: 'attachment', id: 'a1', filename: 'photo.jpg', insertSnippet: "[{Image src='photo.jpg'}]" }
      ];
      const service = makeAssetService(makeAssetPage(fakeResults, 42, true));
      const routes = makeRoutes(service);
      // #742: the raw AssetPage spread is the explicit-asset-type contract;
      // the all-sources path re-computes total/hasMore over the merged set.
      const req = makeReq({ query: { types: 'attachment' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        results: fakeResults,
        total: 42,
        hasMore: true
      });
    });
  });

  describe('error handling', () => {
    it('returns 500 when AssetService.search() throws', async () => {
      const service = { search: vi.fn().mockRejectedValue(new Error('unexpected')) };
      const routes = makeRoutes(service);
      const req = makeReq({ query: {} });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });
  });

  // ---------------------------------------------------------------------------
  // #693 slice 2 — Pages backend parity (#695)
  // ---------------------------------------------------------------------------
  describe('types=page branch', () => {
    function makePageManager(allPages: string[] = ['Page A', 'Page B', 'Page C']) {
      return { getAllPages: vi.fn().mockResolvedValue(allPages) };
    }

    // #716/#731: real provider shape — `snippet` (excerpt) + nested
    // metadata.{systemCategory,userKeywords(comma string),lastModified}.
    function makeSearchManager(hits: Array<{ name: string; title?: string; snippet?: string; metadata?: { systemCategory?: string; userKeywords?: string; lastModified?: string } }> = []) {
      return { advancedSearchWithContext: vi.fn().mockResolvedValue(hits) };
    }

    function makeRoutesWithPages(assetService, pageManager, searchManager?) {
      const engine = {
        getManager: vi.fn((name: string) => {
          if (name === 'AssetService') return assetService;
          if (name === 'PageManager') return pageManager;
          if (name === 'SearchManager') return searchManager;
          return null;
        })
      };
      const routes = new WikiRoutes(engine);
      routes.createWikiContext = vi.fn((req: Request) =>
        createMockWikiContext(
          { userContext: (req as { userContext?: unknown }).userContext as never },
          { engine }
        )
      );
      return routes;
    }

    it('returns 503 when PageManager is unavailable', async () => {
      const routes = makeRoutesWithPages(makeAssetService(), null);
      const req = makeReq({ query: { types: 'page' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });

    it('#731 Slice 3: no query/filters still returns pages via the ACL-safe index path (getAllPages NOT used)', async () => {
      const pageManager = makePageManager(['unused']);
      const search = makeSearchManager([{ name: 'Welcome' }, { name: 'About' }, { name: 'Contact' }]);
      const routes = makeRoutesWithPages(makeAssetService(), pageManager, search);
      const req = makeReq({ query: { types: 'page' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(search.advancedSearchWithContext).toHaveBeenCalled();
      expect(pageManager.getAllPages).not.toHaveBeenCalled();
      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.total).toBe(3);
      expect(payload.results[0]).toEqual(expect.objectContaining({
        id: 'Welcome',
        providerId: 'page',
        url: '/view/Welcome'
      }));
    });

    it('uses /view/ (not /wiki/) for the page URL', async () => {
      const search = makeSearchManager([{ name: 'Some Page' }]);
      const routes = makeRoutesWithPages(makeAssetService(), makePageManager(), search);
      const req = makeReq({ query: { types: 'page' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.results[0].url).toBe('/view/Some%20Page');
      expect(payload.results[0].url).not.toContain('/wiki/');
    });

    it('routes through SearchManager.advancedSearchWithContext when query is set', async () => {
      const search = makeSearchManager([{ name: 'Beach Day', title: 'Beach Day' }]);
      const routes = makeRoutesWithPages(makeAssetService(), makePageManager(), search);
      const req = makeReq({ query: { types: 'page', q: 'beach' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(search.advancedSearchWithContext).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ query: 'beach', categories: [], userKeywords: [], systemKeywords: [], searchIn: ['title'] })
      );
    });

    it('threads category param (single value) to advancedSearchWithContext', async () => {
      const search = makeSearchManager();
      const routes = makeRoutesWithPages(makeAssetService(), makePageManager(), search);
      const req = makeReq({ query: { types: 'page', category: 'Documentation' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(search.advancedSearchWithContext).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ categories: ['Documentation'] })
      );
    });

    it('threads category param (multiple values) to advancedSearchWithContext', async () => {
      const search = makeSearchManager();
      const routes = makeRoutesWithPages(makeAssetService(), makePageManager(), search);
      const req = makeReq({ query: { types: 'page', category: ['Documentation', 'Tutorial'] } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(search.advancedSearchWithContext).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ categories: ['Documentation', 'Tutorial'] })
      );
    });

    it('threads keywords as userKeywords to advancedSearchWithContext', async () => {
      const search = makeSearchManager();
      const routes = makeRoutesWithPages(makeAssetService(), makePageManager(), search);
      const req = makeReq({ query: { types: 'page', keywords: ['foo', 'bar'] } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(search.advancedSearchWithContext).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ userKeywords: ['foo', 'bar'] })
      );
    });

    it('threads systemKeywords to advancedSearchWithContext', async () => {
      const search = makeSearchManager();
      const routes = makeRoutesWithPages(makeAssetService(), makePageManager(), search);
      const req = makeReq({ query: { types: 'page', systemKeywords: 'todo' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(search.advancedSearchWithContext).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ systemKeywords: ['todo'] })
      );
    });

    it('defaults searchIn to ["title"] for page search when not provided (#739)', async () => {
      const search = makeSearchManager();
      const routes = makeRoutesWithPages(makeAssetService(), makePageManager(), search);
      const req = makeReq({ query: { types: 'page', q: 'x' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(search.advancedSearchWithContext).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ searchIn: ['title'] })
      );
    });

    it('honours explicit searchIn=all (full-text opt-in) for page search (#739)', async () => {
      const search = makeSearchManager();
      const routes = makeRoutesWithPages(makeAssetService(), makePageManager(), search);
      const req = makeReq({ query: { types: 'page', q: 'x', searchIn: 'all' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(search.advancedSearchWithContext).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ searchIn: ['all'] })
      );
    });

    it('threads explicit searchIn value', async () => {
      const search = makeSearchManager();
      const routes = makeRoutesWithPages(makeAssetService(), makePageManager(), search);
      const req = makeReq({ query: { types: 'page', q: 'x', searchIn: 'title' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(search.advancedSearchWithContext).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ searchIn: ['title'] })
      );
    });

    it('returns 503 when SearchManager is unavailable and filters require it', async () => {
      const routes = makeRoutesWithPages(makeAssetService(), makePageManager(), null);
      const req = makeReq({ query: { types: 'page', q: 'beach' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });

    it('maps the provider shape (snippet + metadata.{userKeywords,systemCategory}) into the AssetRecord (#716/#731)', async () => {
      const search = makeSearchManager([
        {
          name: 'Beach',
          title: 'A Day at the Beach',
          snippet: 'sand and waves',
          metadata: { systemCategory: 'general', userKeywords: 'ocean,summer', lastModified: '2026-01-01' }
        }
      ]);
      const routes = makeRoutesWithPages(makeAssetService(), makePageManager(), search);
      const req = makeReq({ query: { types: 'page', q: 'beach' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.results[0]).toEqual(expect.objectContaining({
        id: 'Beach',
        name: 'A Day at the Beach',
        description: 'sand and waves',                 // from provider `snippet`
        keywords: ['ocean', 'summer'],                 // split from metadata.userKeywords comma string
        url: '/view/Beach',
        metadata: expect.objectContaining({ systemCategory: 'general', lastModified: '2026-01-01' })
      }));
    });

    it('respects offset and pageSize on the search-result slice', async () => {
      const hits = Array.from({ length: 60 }, (_, i) => ({ name: `Page${i}` }));
      const search = makeSearchManager(hits);
      const routes = makeRoutesWithPages(makeAssetService(), makePageManager(), search);
      const req = makeReq({ query: { types: 'page', q: 'x', offset: '10', pageSize: '5' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.total).toBe(60);
      expect(payload.results).toHaveLength(5);
      expect(payload.results[0].id).toBe('Page10');
      expect(payload.results[4].id).toBe('Page14');
      expect(payload.hasMore).toBe(true);
    });

    it('does NOT route through AssetService.search when types=page', async () => {
      const service = makeAssetService();
      const routes = makeRoutesWithPages(service, makePageManager());
      const req = makeReq({ query: { types: 'page' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(service.search).not.toHaveBeenCalled();
    });

    // #696 slice 3: anonymous viewers can search pages (per-page ACL handled
    // by SearchManager via wikiContext). Restores the open /search behaviour
    // after that URL started rendering the asset-picker UI.
    it('allows anonymous viewer for types=page (no editor role required)', async () => {
      const search = makeSearchManager([{ name: 'Welcome' }]);
      const routes = makeRoutesWithPages(makeAssetService(), makePageManager(), search);
      const req = makeReq({ userContext: null, query: { types: 'page' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(res.status).not.toHaveBeenCalledWith(403);
      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.success).toBe(true);
      expect(payload.results[0].id).toBe('Welcome');
    });

    it('still requires editor role for types=attachment (anon → 403)', async () => {
      const routes = makeRoutesWithPages(makeAssetService(), makePageManager());
      const req = makeReq({ userContext: null, query: { types: 'attachment' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    // -----------------------------------------------------------------------
    // #699 — capped flag when SearchManager saturates maxResults
    // -----------------------------------------------------------------------
    it('sets capped:true when hits.length >= fetchLimit (#699)', async () => {
      // fetchLimit defaults to max(200, offset+pageSize). With offset=0,
      // pageSize=48 the limit is 200. Saturating it should flag capped.
      const search = makeSearchManager(Array.from({ length: 200 }, (_, i) => ({ name: `Page${i}` })));
      const routes = makeRoutesWithPages(makeAssetService(), makePageManager(), search);
      const req = makeReq({ query: { types: 'page', q: 'foo' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.capped).toBe(true);
    });

    it('sets capped:false when hits.length < fetchLimit (#699)', async () => {
      const search = makeSearchManager([{ name: 'Beach Day' }]);
      const routes = makeRoutesWithPages(makeAssetService(), makePageManager(), search);
      const req = makeReq({ query: { types: 'page', q: 'beach' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.capped).toBe(false);
    });

    // -----------------------------------------------------------------------
    // #700 — sort=caption / sort=date wired through the pages branch
    // -----------------------------------------------------------------------
    it('sort=caption&order=asc orders page names A→Z (#700)', async () => {
      const search = makeSearchManager([{ name: 'Charlie' }, { name: 'Alpha' }, { name: 'Bravo' }]);
      const routes = makeRoutesWithPages(makeAssetService(), makePageManager(), search);
      const req = makeReq({ query: { types: 'page', sort: 'caption', order: 'asc' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.results.map((r: { id: string }) => r.id)).toEqual(['Alpha', 'Bravo', 'Charlie']);
    });

    it('sort=caption&order=desc orders page names Z→A (#700)', async () => {
      const search = makeSearchManager([{ name: 'Alpha' }, { name: 'Charlie' }, { name: 'Bravo' }]);
      const routes = makeRoutesWithPages(makeAssetService(), makePageManager(), search);
      const req = makeReq({ query: { types: 'page', sort: 'caption', order: 'desc' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.results.map((r: { id: string }) => r.id)).toEqual(['Charlie', 'Bravo', 'Alpha']);
    });

    it('sort=date routes through SearchManager (cheap path skipped) (#700)', async () => {
      // sort=date needs metadata.lastModified, so even with no query/filters
      // the handler must go through SearchManager to get it.
      const search = makeSearchManager([
        { name: 'Old',    metadata: { lastModified: '2024-01-01' } } as never,
        { name: 'Newest', metadata: { lastModified: '2026-05-01' } } as never,
        { name: 'Middle', metadata: { lastModified: '2025-06-01' } } as never
      ]);
      const pageManager = makePageManager();
      const routes = makeRoutesWithPages(makeAssetService(), pageManager, search);
      const req = makeReq({ query: { types: 'page', sort: 'date', order: 'desc' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(search.advancedSearchWithContext).toHaveBeenCalled();
      expect(pageManager.getAllPages).not.toHaveBeenCalled();
      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.results.map((r: { id: string }) => r.id)).toEqual(['Newest', 'Middle', 'Old']);
    });

    it('#731 Slice 3: no sort param preserves the index path iteration order (getAllPages NOT used) (#700)', async () => {
      // No sort → the route does not reorder; results keep the order the
      // SearchManager/index returned them in. getAllPages is never consulted.
      const pageManager = makePageManager(['unused']);
      const search = makeSearchManager([{ name: 'Zebra' }, { name: 'Alpha' }, { name: 'Mango' }]);
      const routes = makeRoutesWithPages(makeAssetService(), pageManager, search);
      const req = makeReq({ query: { types: 'page' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(pageManager.getAllPages).not.toHaveBeenCalled();
      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.results.map((r: { id: string }) => r.id)).toEqual(['Zebra', 'Alpha', 'Mango']);
    });
  });

  // ---------------------------------------------------------------------------
  // #693 slice 1 — Users source type (#694)
  // ---------------------------------------------------------------------------
  describe('types=user branch', () => {
    function makeUserManager(users: Array<{
      username: string;
      displayName?: string;
      email?: string;
      profilePage?: string;
      avatar?: string;
    }> = []) {
      return { searchUsers: vi.fn().mockResolvedValue(users) };
    }

    function makeRoutesWithUsers(assetService, userManager, mockUserManager?) {
      const engine = {
        getManager: vi.fn((name: string) => {
          if (name === 'AssetService') return assetService;
          if (name === 'UserManager') return userManager;
          return null;
        })
      };
      const routes = new WikiRoutes(engine);
      routes.createWikiContext = vi.fn((req: Request) =>
        createMockWikiContext(
          { userContext: (req as { userContext?: unknown }).userContext as never },
          { engine, mockUserManager }
        )
      );
      return routes;
    }

    // Operator decision on #694: any authenticated user can search users via
    // the picker surface (no `search-user` permission required). The fixture
    // below is the default for tests that expect results back.
    const authedUser = { authenticated: true, username: 'molly', roles: ['reader'] };
    function makeAuthedReq(overrides = {}) {
      return makeReq({ userContext: authedUser, ...overrides });
    }

    it('returns 503 when UserManager is unavailable', async () => {
      const routes = makeRoutesWithUsers(makeAssetService(), null);
      const req = makeReq({ query: { types: 'user', q: 'alice' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('returns empty results for anonymous viewer (no userContext)', async () => {
      const userManager = makeUserManager([{ username: 'alice' }]);
      const routes = makeRoutesWithUsers(makeAssetService(), userManager);
      const req = makeReq({ userContext: null, query: { types: 'user', q: 'alice' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true, results: [], total: 0, hasMore: false, capped: false });
      expect(userManager.searchUsers).not.toHaveBeenCalled();
    });

    it('returns empty results for anonymous viewer (username="anonymous")', async () => {
      const userManager = makeUserManager([{ username: 'alice' }]);
      const routes = makeRoutesWithUsers(makeAssetService(), userManager);
      const req = makeReq({
        userContext: { authenticated: false, username: 'anonymous', roles: [] },
        query: { types: 'user', q: 'alice' }
      });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true, results: [], total: 0, hasMore: false, capped: false });
      expect(userManager.searchUsers).not.toHaveBeenCalled();
    });

    it('returns results for authenticated user WITHOUT search-user permission (the molly case)', async () => {
      // Operator's smoke-test scenario: molly is authenticated as a regular
      // reader-role user; she does NOT have the `search-user` permission in
      // the default config. She should still get search results in the picker.
      const userManager = makeUserManager([{ username: 'jim', displayName: 'Jim' }]);
      const routes = makeRoutesWithUsers(makeAssetService(), userManager);
      const req = makeAuthedReq({ query: { types: 'user', q: 'jim' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(userManager.searchUsers).toHaveBeenCalledWith('jim', expect.objectContaining({ activeOnly: true }));
      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.success).toBe(true);
      expect(payload.total).toBe(1);
      expect(payload.results[0].id).toBe('jim');
    });

    it('converts a User record into the expected AssetRecord shape', async () => {
      const userManager = makeUserManager([
        { username: 'alice', displayName: 'Alice Wonderland', email: 'a@example.com', profilePage: 'Alice Wonderland', avatar: '/uploads/alice.png' }
      ]);
      const routes = makeRoutesWithUsers(makeAssetService(), userManager);
      const req = makeAuthedReq({ query: { types: 'user', q: 'alice' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        total: 1,
        results: [expect.objectContaining({
          id: 'alice',
          providerId: 'user',
          filename: 'alice',
          name: 'Alice Wonderland',
          encodingFormat: 'application/user',
          url: '/view/Alice%20Wonderland',
          thumbnailUrl: '/uploads/alice.png',
          insertSnippet: '[Alice Wonderland]',
          metadata: { username: 'alice' }
        })]
      }));
    });

    it('falls back through profilePage → displayName → username for the page-link URL', async () => {
      const userManager = makeUserManager([
        { username: 'bob' }     // no profilePage, no displayName
      ]);
      const routes = makeRoutesWithUsers(makeAssetService(), userManager);
      const req = makeAuthedReq({ query: { types: 'user' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.results[0].url).toBe('/view/bob');
      expect(payload.results[0].insertSnippet).toBe('[bob]');
      expect(payload.results[0].name).toBe('bob');
    });

    it('forwards activeOnly=true to UserManager.searchUsers (skips deactivated users)', async () => {
      const userManager = makeUserManager([]);
      const routes = makeRoutesWithUsers(makeAssetService(), userManager);
      const req = makeAuthedReq({ query: { types: 'user', q: 'foo' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(userManager.searchUsers).toHaveBeenCalledWith('foo', expect.objectContaining({ activeOnly: true }));
    });

    it('respects offset and pageSize when slicing oversampled fetch', async () => {
      const allUsers = Array.from({ length: 60 }, (_, i) => ({ username: `u${i}`, displayName: `User ${i}` }));
      const userManager = makeUserManager(allUsers);
      const routes = makeRoutesWithUsers(makeAssetService(), userManager);
      const req = makeAuthedReq({ query: { types: 'user', offset: '10', pageSize: '5' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.total).toBe(60);
      expect(payload.results).toHaveLength(5);
      expect(payload.results[0].id).toBe('u10');
      expect(payload.results[4].id).toBe('u14');
      expect(payload.hasMore).toBe(true);
    });

    it('does NOT route through AssetService.search when types=user', async () => {
      const service = makeAssetService();
      const userManager = makeUserManager([]);
      const routes = makeRoutesWithUsers(service, userManager);
      const req = makeAuthedReq({ query: { types: 'user' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(service.search).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // #699 — capped flag when UserManager.searchUsers saturates its limit
    // -----------------------------------------------------------------------
    it('sets capped:true when fetched.length >= fetchLimit (#699)', async () => {
      // fetchLimit defaults to max(200, offset+pageSize). With offset=0,
      // pageSize=48 the limit is 200. Saturating it should flag capped.
      const allUsers = Array.from({ length: 200 }, (_, i) => ({ username: `u${i}` }));
      const userManager = makeUserManager(allUsers);
      const routes = makeRoutesWithUsers(makeAssetService(), userManager);
      const req = makeAuthedReq({ query: { types: 'user' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.capped).toBe(true);
    });

    it('sets capped:false when fetched.length < fetchLimit (#699)', async () => {
      const userManager = makeUserManager(Array.from({ length: 5 }, (_, i) => ({ username: `u${i}` })));
      const routes = makeRoutesWithUsers(makeAssetService(), userManager);
      const req = makeAuthedReq({ query: { types: 'user' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.capped).toBe(false);
    });

    // -----------------------------------------------------------------------
    // #700 — sort=caption / sort=date wired through the user branch
    // -----------------------------------------------------------------------
    it('sort=caption&order=asc orders by displayName A→Z (#700)', async () => {
      const userManager = makeUserManager([
        { username: 'c', displayName: 'Charlie' },
        { username: 'a', displayName: 'Alice' },
        { username: 'b', displayName: 'Bob' }
      ]);
      const routes = makeRoutesWithUsers(makeAssetService(), userManager);
      const req = makeAuthedReq({ query: { types: 'user', sort: 'caption', order: 'asc' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.results.map((r: { id: string }) => r.id)).toEqual(['a', 'b', 'c']);
    });

    it('sort=caption&order=desc orders by displayName Z→A (#700)', async () => {
      const userManager = makeUserManager([
        { username: 'a', displayName: 'Alice' },
        { username: 'c', displayName: 'Charlie' },
        { username: 'b', displayName: 'Bob' }
      ]);
      const routes = makeRoutesWithUsers(makeAssetService(), userManager);
      const req = makeAuthedReq({ query: { types: 'user', sort: 'caption', order: 'desc' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.results.map((r: { id: string }) => r.id)).toEqual(['c', 'b', 'a']);
    });

    it('sort=date&order=desc orders by createdAt newest-first (#700)', async () => {
      const userManager = makeUserManager([
        { username: 'old',    displayName: 'Old',    createdAt: '2024-01-01' },
        { username: 'newest', displayName: 'Newest', createdAt: '2026-05-01' },
        { username: 'middle', displayName: 'Middle', createdAt: '2025-06-01' }
      ] as never);
      const routes = makeRoutesWithUsers(makeAssetService(), userManager);
      const req = makeAuthedReq({ query: { types: 'user', sort: 'date', order: 'desc' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.results.map((r: { id: string }) => r.id)).toEqual(['newest', 'middle', 'old']);
    });

    it('no sort param preserves UserManager iteration order (#700)', async () => {
      // Back-compat: callers that don't pass sort should keep getting results
      // in whatever order searchUsers returned them.
      const userManager = makeUserManager([
        { username: 'z' },
        { username: 'a' },
        { username: 'm' }
      ]);
      const routes = makeRoutesWithUsers(makeAssetService(), userManager);
      const req = makeAuthedReq({ query: { types: 'user' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.results.map((r: { id: string }) => r.id)).toEqual(['z', 'a', 'm']);
    });
  });

  // ---------------------------------------------------------------------------
  // #742 — "All sources" (types absent or `all`) aggregates pages + users +
  // (editor-only) attachments/media instead of 403'ing non-editors and
  // returning attachments/media only.
  // ---------------------------------------------------------------------------
  describe('all-sources branch (#742)', () => {
    function makeSearchManager(hits: Array<{ name: string; title?: string; snippet?: string; metadata?: { systemCategory?: string; userKeywords?: string; lastModified?: string } }> = []) {
      return { advancedSearchWithContext: vi.fn().mockResolvedValue(hits) };
    }
    function makeUserManager(users: Array<{ username: string; displayName?: string; profilePage?: string; avatar?: string; createdAt?: string }> = []) {
      return { searchUsers: vi.fn().mockResolvedValue(users) };
    }
    function makeRoutesAll(opts: { assetService?: unknown; searchManager?: unknown; userManager?: unknown }) {
      const engine = {
        getManager: vi.fn((name: string) => {
          if (name === 'AssetService') return opts.assetService ?? null;
          if (name === 'SearchManager') return opts.searchManager ?? null;
          if (name === 'UserManager') return opts.userManager ?? null;
          return null;
        })
      };
      const routes = new WikiRoutes(engine);
      routes.createWikiContext = vi.fn((req: Request) =>
        createMockWikiContext({ userContext: (req as { userContext?: unknown }).userContext as never }, { engine })
      );
      return routes;
    }
    const reader = { authenticated: true, username: 'molly', roles: ['reader'] };
    const editor = { authenticated: true, username: 'ed', roles: ['editor'] };

    it('anonymous viewer is NOT 403 and gets page hits (the core #742 regression)', async () => {
      const search = makeSearchManager([{ name: 'Welcome' }, { name: 'About' }]);
      const asset = makeAssetService(makeAssetPage([{ id: 'a1', providerId: 'local' }] as never));
      const userMgr = makeUserManager([{ username: 'alice' }]);
      const routes = makeRoutesAll({ assetService: asset, searchManager: search, userManager: userMgr });
      const req = makeReq({ userContext: null, query: {} });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(res.status).not.toHaveBeenCalledWith(403);
      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.success).toBe(true);
      const ids = payload.results.map((r: { id: string; providerId: string }) => `${r.providerId}:${r.id}`);
      expect(ids).toEqual(['page:Welcome', 'page:About']);
      // anon → no users, no editor asset surface
      expect(userMgr.searchUsers).not.toHaveBeenCalled();
      expect(asset.search).not.toHaveBeenCalled();
    });

    it('types=all behaves identically to types omitted', async () => {
      const search = makeSearchManager([{ name: 'P1' }]);
      const routes = makeRoutesAll({ assetService: makeAssetService(), searchManager: search });
      const req = makeReq({ userContext: null, query: { types: 'all' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(res.status).not.toHaveBeenCalledWith(403);
      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.results.map((r: { id: string }) => r.id)).toEqual(['P1']);
    });

    it('authenticated non-editor gets pages + users but NOT attachments/media', async () => {
      const search = makeSearchManager([{ name: 'Welcome' }]);
      const asset = makeAssetService(makeAssetPage([{ id: 'a1', providerId: 'local' }] as never));
      const userMgr = makeUserManager([{ username: 'alice', displayName: 'Alice' }]);
      const routes = makeRoutesAll({ assetService: asset, searchManager: search, userManager: userMgr });
      const req = makeReq({ userContext: reader, query: {} });
      const res = makeRes();

      await routes.assetSearch(req, res);

      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const ids = payload.results.map((r: { id: string; providerId: string }) => `${r.providerId}:${r.id}`);
      expect(ids).toEqual(['page:Welcome', 'user:alice']);
      expect(userMgr.searchUsers).toHaveBeenCalledWith('', expect.objectContaining({ activeOnly: true }));
      expect(asset.search).not.toHaveBeenCalled();
    });

    it('editor gets pages + users + attachments/media merged', async () => {
      const search = makeSearchManager([{ name: 'Welcome' }]);
      const asset = makeAssetService(makeAssetPage([{ id: 'a1', providerId: 'local', name: 'photo.jpg' }] as never));
      const userMgr = makeUserManager([{ username: 'alice' }]);
      const routes = makeRoutesAll({ assetService: asset, searchManager: search, userManager: userMgr });
      const req = makeReq({ userContext: editor, query: {} });
      const res = makeRes();

      await routes.assetSearch(req, res);

      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const ids = payload.results.map((r: { id: string; providerId: string }) => `${r.providerId}:${r.id}`);
      expect(ids).toEqual(['page:Welcome', 'user:alice', 'local:a1']);
      expect(asset.search).toHaveBeenCalledWith(expect.objectContaining({ types: undefined, offset: 0 }));
    });

    it('degrades gracefully when SearchManager is unavailable (no 503)', async () => {
      const routes = makeRoutesAll({ assetService: makeAssetService(), searchManager: null, userManager: makeUserManager([]) });
      const req = makeReq({ userContext: null, query: {} });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(res.status).not.toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, results: [], total: 0 }));
    });

    it('de-dupes by providerId+id', async () => {
      const search = makeSearchManager([{ name: 'Dup' }, { name: 'Dup' }, { name: 'Unique' }]);
      const routes = makeRoutesAll({ assetService: makeAssetService(), searchManager: search });
      const req = makeReq({ userContext: null, query: {} });
      const res = makeRes();

      await routes.assetSearch(req, res);

      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.results.map((r: { id: string }) => r.id)).toEqual(['Dup', 'Unique']);
      expect(payload.total).toBe(2);
    });

    it('paginates the merged set with offset + pageSize', async () => {
      const hits = Array.from({ length: 30 }, (_, i) => ({ name: `P${i}` }));
      const search = makeSearchManager(hits);
      const routes = makeRoutesAll({ assetService: makeAssetService(), searchManager: search });
      const req = makeReq({ userContext: null, query: { offset: '10', pageSize: '5' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.total).toBe(30);
      expect(payload.results).toHaveLength(5);
      expect(payload.results[0].id).toBe('P10');
      expect(payload.results[4].id).toBe('P14');
      expect(payload.hasMore).toBe(true);
    });

    it('flags capped when a source saturates fetchLimit', async () => {
      const search = makeSearchManager(Array.from({ length: 200 }, (_, i) => ({ name: `P${i}` })));
      const routes = makeRoutesAll({ assetService: makeAssetService(), searchManager: search });
      const req = makeReq({ userContext: null, query: {} });
      const res = makeRes();

      await routes.assetSearch(req, res);

      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.capped).toBe(true);
    });

    it('sort=caption&order=asc orders the merged set A→Z across sources', async () => {
      const search = makeSearchManager([{ name: 'Mango' }, { name: 'Apple' }]);
      const userMgr = makeUserManager([{ username: 'zoe', displayName: 'Zoe' }]);
      const routes = makeRoutesAll({ assetService: makeAssetService(), searchManager: search, userManager: userMgr });
      const req = makeReq({ userContext: reader, query: { sort: 'caption', order: 'asc' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.results.map((r: { name: string }) => r.name)).toEqual(['Apple', 'Mango', 'Zoe']);
    });

    // #720: a file-format facet is Files-only — in all-sources it must be
    // forwarded to the asset sub-search AND suppress pages/users (format is
    // meaningless for them). Fixes the search-work.md report.
    it('mimeCategory in all-sources forwards to assets and skips pages/users', async () => {
      const search = makeSearchManager([{ name: 'Welcome' }, { name: 'About' }]);
      const asset = makeAssetService(makeAssetPage([{ id: 'v1', providerId: 'media-library', name: 'clip.mp4' }] as never));
      const userMgr = makeUserManager([{ username: 'alice' }]);
      const routes = makeRoutesAll({ assetService: asset, searchManager: search, userManager: userMgr });
      const req = makeReq({ userContext: editor, query: { mimeCategory: 'video' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      // pages + users suppressed because a file-format facet is active
      expect(search.advancedSearchWithContext).not.toHaveBeenCalled();
      expect(userMgr.searchUsers).not.toHaveBeenCalled();
      // mimeCategory forwarded to the asset sub-search
      expect(asset.search).toHaveBeenCalledWith(expect.objectContaining({ mimeCategory: 'video' }));
      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.results.map((r: { providerId: string; id: string }) => `${r.providerId}:${r.id}`)).toEqual(['media-library:v1']);
    });

    it('no mimeCategory in all-sources still includes pages (regression guard)', async () => {
      const search = makeSearchManager([{ name: 'Welcome' }]);
      const routes = makeRoutesAll({ assetService: makeAssetService(), searchManager: search });
      const req = makeReq({ userContext: null, query: {} });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(search.advancedSearchWithContext).toHaveBeenCalled();
      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.results.map((r: { id: string }) => r.id)).toEqual(['Welcome']);
    });

    it('rejects an unknown mimeCategory (treated as no filter — pages still included)', async () => {
      const search = makeSearchManager([{ name: 'Welcome' }]);
      const routes = makeRoutesAll({ assetService: makeAssetService(), searchManager: search });
      const req = makeReq({ userContext: null, query: { mimeCategory: 'garbage' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      // 'garbage' is not in the allowlist → mimeCategory undefined → not file-only
      expect(search.advancedSearchWithContext).toHaveBeenCalled();
      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.results.map((r: { id: string }) => r.id)).toEqual(['Welcome']);
    });
  });

  // #720: video / audio are accepted mimeCategory values and forwarded to
  // AssetService on the single-type asset branch (was image/document/other).
  describe('mimeCategory video/audio (#720)', () => {
    it.each(['video', 'audio', 'image', 'document', 'other'])(
      'forwards mimeCategory=%s to AssetService.search',
      async (cat) => {
        const service = makeAssetService();
        const routes = makeRoutes(service);
        const req = makeReq({ query: { types: 'attachment', mimeCategory: cat } });
        const res = makeRes();

        await routes.assetSearch(req, res);

        expect(service.search).toHaveBeenCalledWith(expect.objectContaining({ mimeCategory: cat }));
      }
    );

    it('drops an unknown mimeCategory (passes undefined)', async () => {
      const service = makeAssetService();
      const routes = makeRoutes(service);
      const req = makeReq({ query: { types: 'attachment', mimeCategory: 'garbage' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(service.search.mock.calls[0][0].mimeCategory).toBeUndefined();
    });
  });

  // #745: media Year facet — forwarded to AssetService (parsed to a number);
  // in all-sources it suppresses pages/users like the #720 format facet.
  describe('media year filter (#745)', () => {
    function makeSearchManager(hits: Array<{ name: string }> = []) {
      return { advancedSearchWithContext: vi.fn().mockResolvedValue(hits) };
    }
    function makeUserManager(users: Array<{ username: string }> = []) {
      return { searchUsers: vi.fn().mockResolvedValue(users) };
    }
    function makeRoutesAll(opts: { assetService?: unknown; searchManager?: unknown; userManager?: unknown }) {
      const engine = {
        getManager: vi.fn((name: string) => {
          if (name === 'AssetService') return opts.assetService ?? null;
          if (name === 'SearchManager') return opts.searchManager ?? null;
          if (name === 'UserManager') return opts.userManager ?? null;
          return null;
        })
      };
      const routes = new WikiRoutes(engine);
      routes.createWikiContext = vi.fn((req: Request) =>
        createMockWikiContext({ userContext: (req as { userContext?: unknown }).userContext as never }, { engine })
      );
      return routes;
    }
    const editor = { authenticated: true, username: 'ed', roles: ['editor'] };

    it('year in all-sources forwards to assets and skips pages/users', async () => {
      const search = makeSearchManager([{ name: 'Welcome' }]);
      const asset = makeAssetService(makeAssetPage([{ id: 'm1', providerId: 'media-library' }] as never));
      const userMgr = makeUserManager([{ username: 'alice' }]);
      const routes = makeRoutesAll({ assetService: asset, searchManager: search, userManager: userMgr });
      const req = makeReq({ userContext: editor, query: { year: '2024' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(search.advancedSearchWithContext).not.toHaveBeenCalled();
      expect(userMgr.searchUsers).not.toHaveBeenCalled();
      expect(asset.search).toHaveBeenCalledWith(expect.objectContaining({ year: 2024 }));
      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.results.map((r: { providerId: string; id: string }) => `${r.providerId}:${r.id}`)).toEqual(['media-library:m1']);
    });

    it('no year in all-sources still includes pages (regression guard)', async () => {
      const search = makeSearchManager([{ name: 'Welcome' }]);
      const routes = makeRoutesAll({ assetService: makeAssetService(), searchManager: search });
      const req = makeReq({ userContext: null, query: {} });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(search.advancedSearchWithContext).toHaveBeenCalled();
    });

    it('single-type asset branch forwards year as a number', async () => {
      const service = makeAssetService();
      const routes = makeRoutes(service);
      const req = makeReq({ query: { types: 'media', year: '2023' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(service.search).toHaveBeenCalledWith(expect.objectContaining({ year: 2023 }));
    });

    it('invalid year is dropped (passes undefined)', async () => {
      const service = makeAssetService();
      const routes = makeRoutes(service);
      const req = makeReq({ query: { types: 'media', year: 'abc' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(service.search.mock.calls[0][0].year).toBeUndefined();
    });
  });
});
