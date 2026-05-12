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

  it('does not call SearchManager directly — moved to /api/assets/search', async () => {
    const routes = makeRoutes();
    const req = makeReq({ query: { q: 'beach' } });
    const res = makeRes();

    await routes.searchPages(req, res);

    // routes.engine.getManager should not have been called for SearchManager
    // (the new handler doesn't query managers; just renders).
    const calls = (routes.engine.getManager as ReturnType<typeof vi.fn>).mock.calls;
    const requestedNames = calls.map(c => c[0]);
    expect(requestedNames).not.toContain('SearchManager');
  });
});
