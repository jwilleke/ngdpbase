/**
 * Unit tests for WikiRoutes.ingestPageMarkdown() — POST /api/page/ingest (#819).
 *
 * Strategy mirrors the authorLock suite: spy createWikiContext (via the shared
 * mock fixture) so hasPermission is controllable, and mock the engine managers
 * the handler touches. The NCM normalizer (normalizeExistingPageToNcm) runs for
 * real so we exercise the actual Markdown→NCM path; savePageWithContext is
 * mocked (its author-attribution logic is covered in PageManager tests).
 *
 * Covers:
 * - 401 when unauthenticated
 * - 400 when pageName / markdown missing or pageName has invalid chars
 * - 403 when the caller lacks page-create / page-edit
 * - create happy path → 201, action 'created', NCM stamped, index updated
 * - update happy path → 200, action 'updated' (upsert by pageName)
 */

import { describe, test, expect, vi, afterEach } from 'vitest';
import WikiRoutes from '../WikiRoutes';
import { createMockWikiContext } from './__fixtures__/createMockWikiContext';

const AUTHED = { username: 'jim', displayName: 'Jim Willeke', roles: ['editor'], isAuthenticated: true };

function makeSavedPage(overrides: Record<string, unknown> = {}) {
  return {
    content: '# My Doc\n\nBody text.',
    metadata: {
      title: 'My Doc',
      uuid: 'uuid-doc-1',
      slug: 'my-doc',
      author: 'jim',
      'system-category': 'general',
      'user-keywords': [],
      ...overrides
    }
  };
}

function makeEngine(pageManager: Record<string, unknown>) {
  const configManager = {
    getProperty: vi.fn((key: string, def: unknown) => {
      if (key === 'ngdpbase.system-category') {
        return {
          general:       { label: 'general',       storageLocation: 'regular', enabled: true },
          documentation: { label: 'documentation', storageLocation: 'regular', enabled: true }
        };
      }
      if (key === 'ngdpbase.application.base-url') return 'https://jimstest.example';
      return def;
    })
  };
  const validationManager = {
    generateValidMetadata: vi.fn((title: string, options: Record<string, unknown>) => ({
      title,
      uuid: 'uuid-doc-1',
      slug: 'my-doc',
      'system-category': options['system-category'] || 'general',
      'user-keywords': options['user-keywords'] || [],
      ...options
    })),
    // The real ValidationManager exposes this; the stub omitted it, so the
    // guard in ingestPageMarkdown short-circuited and save-time validation
    // was never exercised here.
    collectContentErrors: vi.fn().mockResolvedValue([])
  };
  const renderingManager = {
    addPageToCache: vi.fn(),
    updatePageInLinkGraph: vi.fn()
  };
  const searchManager = { updatePageInIndex: vi.fn().mockResolvedValue(undefined) };
  const cacheManager = { isInitialized: vi.fn().mockReturnValue(false), clear: vi.fn() };

  return {
    getManager: vi.fn((name: string) => {
      switch (name) {
      case 'PageManager':          return pageManager;
      case 'ValidationManager':    return validationManager;
      case 'RenderingManager':     return renderingManager;
      case 'SearchManager':        return searchManager;
      case 'CacheManager':         return cacheManager;
      case 'ConfigurationManager': return configManager;
      default:                     return null;
      }
    }),
    _searchManager: searchManager,
    _validationManager: validationManager
  };
}

function installContextSpy(routes: WikiRoutes, permitted = true) {
  const mockUserManager = { hasPermission: vi.fn().mockResolvedValue(permitted) };
  vi.spyOn(routes, 'createWikiContext').mockImplementation((req: { userContext?: unknown }, options = {}) =>
    createMockWikiContext(
      { userContext: req.userContext as never, ...options },
      { engine: (routes as unknown as { engine: unknown }).engine, mockUserManager }
    ) as never
  );
  return mockUserManager;
}

function createRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json:   vi.fn().mockReturnThis()
  };
}

function createReq(userContext: unknown, body: Record<string, unknown>) {
  return { userContext, body, headers: {}, params: {}, query: {} } as never;
}

describe('WikiRoutes.ingestPageMarkdown() — POST /api/page/ingest (#819)', () => {
  afterEach(() => vi.restoreAllMocks());

  test('401 when unauthenticated', async () => {
    const routes = new WikiRoutes(makeEngine({ getPage: vi.fn() }));
    installContextSpy(routes);
    const res = createRes();
    await routes.ingestPageMarkdown(createReq({ isAuthenticated: false }, { pageName: 'X', markdown: 'y' }), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('400 when pageName missing', async () => {
    const routes = new WikiRoutes(makeEngine({ getPage: vi.fn() }));
    installContextSpy(routes);
    const res = createRes();
    await routes.ingestPageMarkdown(createReq(AUTHED, { markdown: 'body' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('400 when markdown missing', async () => {
    const routes = new WikiRoutes(makeEngine({ getPage: vi.fn() }));
    installContextSpy(routes);
    const res = createRes();
    await routes.ingestPageMarkdown(createReq(AUTHED, { pageName: 'My Doc' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('400 when pageName has invalid characters', async () => {
    const routes = new WikiRoutes(makeEngine({ getPage: vi.fn() }));
    installContextSpy(routes);
    const res = createRes();
    await routes.ingestPageMarkdown(createReq(AUTHED, { pageName: 'bad/name', markdown: 'body' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('403 when caller lacks permission', async () => {
    const pm = { getPage: vi.fn().mockResolvedValue(null), savePageWithContext: vi.fn(), getPageUUID: vi.fn() };
    const routes = new WikiRoutes(makeEngine(pm));
    installContextSpy(routes, false);
    const res = createRes();
    await routes.ingestPageMarkdown(createReq(AUTHED, { pageName: 'My Doc', markdown: '# Hi' }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(pm.savePageWithContext).not.toHaveBeenCalled();
  });

  test('create happy path → 201, action "created", NCM stamped, index updated', async () => {
    const saved = makeSavedPage();
    const pm = {
      getPage: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(saved),
      savePageWithContext: vi.fn().mockResolvedValue(undefined),
      getPageUUID: vi.fn().mockReturnValue('uuid-doc-1')
    };
    const engine = makeEngine(pm);
    const routes = new WikiRoutes(engine);
    installContextSpy(routes, true);
    const res = createRes();

    await routes.ingestPageMarkdown(
      createReq(AUTHED, { pageName: 'My Doc', markdown: '# My Doc\n\nHello world.', category: 'documentation', keywords: ['api'] }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      action: 'created',
      author: 'jim',
      url: 'https://jimstest.example/view/My%20Doc'
    }));
    // savePageWithContext got NCM-normalized frontmatter (ncmVersion stamped).
    const [, savedMeta] = pm.savePageWithContext.mock.calls[0];
    expect(savedMeta).toHaveProperty('ncmVersion');
    // In-band index update happened.
    expect(engine._searchManager.updatePageInIndex).toHaveBeenCalledWith('My Doc', expect.objectContaining({ name: 'My Doc' }));
  });

  test('update happy path → 200, action "updated" (upsert by pageName)', async () => {
    const existing = makeSavedPage({ author: 'jim' });
    const saved = makeSavedPage({ author: 'jim' });
    const pm = {
      getPage: vi.fn().mockResolvedValueOnce(existing).mockResolvedValueOnce(saved),
      savePageWithContext: vi.fn().mockResolvedValue(undefined),
      getPageUUID: vi.fn().mockReturnValue('uuid-doc-1')
    };
    const routes = new WikiRoutes(makeEngine(pm));
    installContextSpy(routes, true);
    const res = createRes();

    await routes.ingestPageMarkdown(
      createReq(AUTHED, { pageName: 'My Doc', markdown: '# My Doc\n\nUpdated body.' }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, action: 'updated' }));
    expect(pm.savePageWithContext).toHaveBeenCalledTimes(1);
  });

  // #596 save-time validation reaches this endpoint too. It did not before:
  // the only gate was `isAuthenticated`, so any account — including a
  // magic-link visitor on a public demo — could POST content the editor
  // would have refused.
  describe('save-time validation', () => {
    const freshPm = () => ({
      getPage: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(makeSavedPage()),
      savePageWithContext: vi.fn().mockResolvedValue(undefined),
      getPageUUID: vi.fn().mockReturnValue('uuid-doc-1')
    });

    test('blocks the save with 400 and the structured errors', async () => {
      const pm = freshPm();
      const engine = makeEngine(pm);
      const routes = new WikiRoutes(engine);
      installContextSpy(routes, true);
      engine._validationManager.collectContentErrors.mockResolvedValue([
        { rule: 'no-script-tags', message: 'Inline <script> is not allowed', line: 3 }
      ]);
      const res = createRes();

      await routes.ingestPageMarkdown(
        createReq(AUTHED, { pageName: 'Bad Doc', markdown: '# Bad\n\n<script>alert(1)</script>' }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: 'Validation failed',
        validationErrors: [expect.objectContaining({ rule: 'no-script-tags' })]
      }));
      // The point of blocking: nothing reaches disk.
      expect(pm.savePageWithContext).not.toHaveBeenCalled();
    });

    test('validates the NORMALISED content, not the raw input', async () => {
      // normalizeExistingPageToNcm rewrites links and up-converts tables, so
      // checking the POST body would approve something other than what is
      // written.
      const pm = freshPm();
      const engine = makeEngine(pm);
      const routes = new WikiRoutes(engine);
      installContextSpy(routes, true);
      const res = createRes();

      await routes.ingestPageMarkdown(
        createReq(AUTHED, { pageName: 'My Doc', markdown: '# My Doc\n\nBody.' }),
        res
      );

      const [checked] = engine._validationManager.collectContentErrors.mock.calls[0];
      expect(typeof checked).toBe('string');
      expect(checked).toContain('Body.');
      // ncmDoc.content is the body only — frontmatter has been parsed off.
      expect(checked).not.toContain('uuid:');
    });

    test('a clean page still saves', async () => {
      const pm = freshPm();
      const engine = makeEngine(pm);
      const routes = new WikiRoutes(engine);
      installContextSpy(routes, true);
      const res = createRes();

      await routes.ingestPageMarkdown(
        createReq(AUTHED, { pageName: 'My Doc', markdown: '# My Doc\n\nBody.' }),
        res
      );

      expect(engine._validationManager.collectContentErrors).toHaveBeenCalled();
      expect(pm.savePageWithContext).toHaveBeenCalledTimes(1);
    });
  });
});
