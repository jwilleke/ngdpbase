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
    it('returns 403 when userContext is missing', async () => {
      const routes = makeRoutes(makeAssetService());
      const req = makeReq({ userContext: null });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('returns 403 when user has no relevant role', async () => {
      const routes = makeRoutes(makeAssetService());
      const req = makeReq({ userContext: { roles: ['viewer'] } });
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
      const req = makeReq({ query: {} });
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
      const req = makeReq({ query: {} });
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
      const req = makeReq({ query: {} });
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

    function makeSearchManager(hits: Array<{ name: string; title?: string; excerpt?: string; userKeywords?: string[] }> = []) {
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

    it('falls back to PageManager.getAllPages when no query or filters are set', async () => {
      const pageManager = makePageManager(['Welcome', 'About', 'Contact']);
      const routes = makeRoutesWithPages(makeAssetService(), pageManager);
      const req = makeReq({ query: { types: 'page' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(pageManager.getAllPages).toHaveBeenCalled();
      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.total).toBe(3);
      expect(payload.results[0]).toEqual(expect.objectContaining({
        id: 'Welcome',
        providerId: 'page',
        url: '/view/Welcome'
      }));
    });

    it('uses /view/ (not /wiki/) for the page URL', async () => {
      const pageManager = makePageManager(['Some Page']);
      const routes = makeRoutesWithPages(makeAssetService(), pageManager);
      const req = makeReq({ query: { types: 'page' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.results[0].url).toBe('/view/Some%20Page');
      expect(payload.results[0].url).not.toContain('/wiki/');
    });

    it('routes through SearchManager.advancedSearchWithContext when query is set', async () => {
      const search = makeSearchManager([{ name: 'Beach Day', title: 'Beach Day', excerpt: 'A sunny afternoon' }]);
      const routes = makeRoutesWithPages(makeAssetService(), makePageManager(), search);
      const req = makeReq({ query: { types: 'page', q: 'beach' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(search.advancedSearchWithContext).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ query: 'beach', categories: [], userKeywords: [], systemKeywords: [], searchIn: ['all'] })
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

    it('defaults searchIn to ["all"] when not provided', async () => {
      const search = makeSearchManager();
      const routes = makeRoutesWithPages(makeAssetService(), makePageManager(), search);
      const req = makeReq({ query: { types: 'page', q: 'x' } });
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

    it('maps SearchResult.title and excerpt into AssetRecord.name and description', async () => {
      const search = makeSearchManager([
        { name: 'Beach', title: 'A Day at the Beach', excerpt: 'sand and waves', userKeywords: ['ocean', 'summer'] }
      ]);
      const routes = makeRoutesWithPages(makeAssetService(), makePageManager(), search);
      const req = makeReq({ query: { types: 'page', q: 'beach' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.results[0]).toEqual(expect.objectContaining({
        id: 'Beach',
        name: 'A Day at the Beach',
        description: 'sand and waves',
        keywords: ['ocean', 'summer'],
        url: '/view/Beach'
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

    it('returns 503 when UserManager is unavailable', async () => {
      const routes = makeRoutesWithUsers(makeAssetService(), null);
      const req = makeReq({ query: { types: 'user', q: 'alice' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('returns empty results when caller lacks search-user permission', async () => {
      const deny = { hasPermission: vi.fn().mockResolvedValue(false) };
      const userManager = makeUserManager([{ username: 'alice' }]);
      const routes = makeRoutesWithUsers(makeAssetService(), userManager, deny);
      const req = makeReq({ query: { types: 'user', q: 'alice' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true, results: [], total: 0, hasMore: false });
      expect(userManager.searchUsers).not.toHaveBeenCalled();
    });

    it('converts a User record into the expected AssetRecord shape', async () => {
      const userManager = makeUserManager([
        { username: 'alice', displayName: 'Alice Wonderland', email: 'a@example.com', profilePage: 'Alice Wonderland', avatar: '/uploads/alice.png' }
      ]);
      const routes = makeRoutesWithUsers(makeAssetService(), userManager);
      const req = makeReq({ query: { types: 'user', q: 'alice' } });
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
      const req = makeReq({ query: { types: 'user' } });
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
      const req = makeReq({ query: { types: 'user', q: 'foo' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(userManager.searchUsers).toHaveBeenCalledWith('foo', expect.objectContaining({ activeOnly: true }));
    });

    it('respects offset and pageSize when slicing oversampled fetch', async () => {
      const allUsers = Array.from({ length: 60 }, (_, i) => ({ username: `u${i}`, displayName: `User ${i}` }));
      const userManager = makeUserManager(allUsers);
      const routes = makeRoutesWithUsers(makeAssetService(), userManager);
      const req = makeReq({ query: { types: 'user', offset: '10', pageSize: '5' } });
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
      const req = makeReq({ query: { types: 'user' } });
      const res = makeRes();

      await routes.assetSearch(req, res);

      expect(service.search).not.toHaveBeenCalled();
    });
  });
});
