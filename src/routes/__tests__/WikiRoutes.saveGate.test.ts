/**
 * POST /save/:page asks the same doors as the editor — #1542.
 *
 * A NEW page needs `page-create`, asked about the page it is for (so a vault
 * page goes through the vault check, #1539). An EXISTING page needs `edit`
 * through the page door, `evaluatePagePermission`, which walks the page's own
 * rules — the question GET /edit asks. Before #1542 a new page was saved with
 * no check at all (an anonymous visitor could create one) and an existing page
 * asked only the `page-create` capability.
 */

import WikiRoutes from '../WikiRoutes';
import { SealedVaultRefusedError } from '../../utils/privateStoreMeta';

function makeEngine({ existing, granted, pageAllows }: { existing: boolean; granted: string[]; pageAllows: boolean }) {
  const existingPage = existing ? { content: 'old', metadata: { title: 'TestPage', uuid: 'u1', 'system-category': 'general' } } : null;
  const pageManager = {
    getPage: vi.fn().mockResolvedValue(existingPage),
    getPageMetadata: vi.fn().mockResolvedValue(existingPage?.metadata ?? null),
    pageExists: vi.fn().mockReturnValue(existing),
    savePage: vi.fn().mockResolvedValue({ name: 'TestPage' }),
    getCurrentPageProvider: vi.fn().mockReturnValue({ pageIndex: { pages: {} } })
  };
  const managers: Record<string, unknown> = {
    PageManager: pageManager,
    ValidationManager: {
      generateValidMetadata: vi.fn((title: string, meta: object) => ({ title, ...meta })),
      getAvailableCategories: vi.fn().mockReturnValue([]),
      getAvailableRoles: vi.fn().mockReturnValue([])
    },
    PolicyInformationPoint: {
      evaluatePagePermission: vi.fn().mockResolvedValue({ allowed: pageAllows, reason: pageAllows ? 'policy' : 'default_deny' }),
      checkPagePermissionWithContext: vi.fn().mockResolvedValue(pageAllows)
    },
    PolicyDecisionPoint: {
      permits: vi.fn((_s: unknown, action: string) => Promise.resolve(granted.includes(action))),
      decide: vi.fn((_s: unknown, { action }: { action: string }) => Promise.resolve({ permit: granted.includes(action), applicable: true, reason: 'test' }))
    },
    ConfigurationManager: {
      getProperty: vi.fn((key: string, def: unknown) => (key === 'ngdpbase.system-category' ? { general: { enabled: true, label: 'general', storageLocation: { defaultstore: 'pages/' } } } : def))
    }
  };
  return { engine: { getManager: vi.fn((n: string) => managers[n] ?? null) }, pageManager };
}

const req = (userContext: unknown) => ({
  params: { page: 'TestPage' },
  session: {},
  path: '/save/TestPage',
  userContext,
  headers: {},
  query: {},
  body: { title: 'TestPage', content: '# Test', categories: '', userKeywords: '', 'system-category': 'general', 'author-lock-present': '1' }
});

const res = () => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis(),
  render: vi.fn().mockReturnThis(),
  redirect: vi.fn().mockReturnThis()
});

const ANON = { username: 'anonymous', roles: ['anonymous'], isAuthenticated: false };
const READER = { username: 'molly', roles: ['reader'], isAuthenticated: true };
const CONTRIBUTOR = { username: 'jim', roles: ['contributor'], isAuthenticated: true };

describe('savePage asks the editor’s doors (#1542)', () => {
  test('a signed-out visitor cannot create a page', async () => {
    const { engine, pageManager } = makeEngine({ existing: false, granted: ['page-read'], pageAllows: false });
    const r = res();
    await new WikiRoutes(engine).savePage(req(ANON), r);
    expect(pageManager.savePage).not.toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(403);
  });

  test('a reader cannot create a public page', async () => {
    const { engine, pageManager } = makeEngine({ existing: false, granted: ['page-read'], pageAllows: false });
    await new WikiRoutes(engine).savePage(req(READER), res());
    expect(pageManager.savePage).not.toHaveBeenCalled();
  });

  test('a contributor can create a page', async () => {
    const { engine, pageManager } = makeEngine({ existing: false, granted: ['page-read', 'page-create', 'page-edit'], pageAllows: true });
    await new WikiRoutes(engine).savePage(req(CONTRIBUTOR), res());
    expect(pageManager.savePage).toHaveBeenCalled();
  });

  test('an existing page the page door refuses is not saved, even by a holder of page-create', async () => {
    const { engine, pageManager } = makeEngine({ existing: true, granted: ['page-read', 'page-create', 'page-edit'], pageAllows: false });
    const r = res();
    await new WikiRoutes(engine).savePage(req(CONTRIBUTOR), r);
    expect(pageManager.savePage).not.toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(403);
  });

  test('an existing page the page door allows is saved', async () => {
    const { engine, pageManager } = makeEngine({ existing: true, granted: ['page-read', 'page-create', 'page-edit'], pageAllows: true });
    await new WikiRoutes(engine).savePage(req(CONTRIBUTOR), res());
    expect(pageManager.savePage).toHaveBeenCalled();
  });

  // #1503: decided per page, by the seeded-pages record, not by the system-category.
  test('a shipped copy is marked user-modified when saved; a page made on the site is not', async () => {
    for (const shipped of [true, false]) {
      // A shipped page is admin-only to edit, so the admin edits it here.
      const { engine, pageManager } = makeEngine({ existing: true, granted: ['page-read', 'page-create', 'page-edit', 'admin-system'], pageAllows: true });
      const isShippedPageCopy = vi.fn().mockResolvedValue(shipped);
      Object.assign(pageManager, { isShippedPageCopy });
      await new WikiRoutes(engine).savePage(req(CONTRIBUTOR), res());
      expect(isShippedPageCopy).toHaveBeenCalledWith('u1');
      const metadata = pageManager.savePage.mock.calls[0][2] as Record<string, unknown>;
      expect(metadata['user-modified']).toBe(shipped ? true : undefined);
    }
  });

  // #1503 (operator, 2026-10-29): a seeded add-on page is a shipped page like a required page.
  describe('a seeded add-on page is shipped; a site-made page in the same category is not', () => {
    const addonEngine = (shipped: boolean, granted: string[]) => {
      const built = makeEngine({ existing: true, granted, pageAllows: true });
      // The author is the saving user, so the owner's-move check passes and the shipped check is what answers.
      const metadata = { title: 'TestPage', uuid: 'u1', author: 'jim', 'system-category': 'addon', ...(shipped ? { addon: 'demo' } : {}) };
      built.pageManager.getPage.mockResolvedValue({ content: 'old', metadata });
      built.pageManager.getPageMetadata.mockResolvedValue(metadata);
      Object.assign(built.pageManager, {
        isShippedPageCopy: vi.fn().mockResolvedValue(shipped),
        deletePageWithContext: vi.fn().mockResolvedValue(true)
      });
      return built;
    };
    const addonReq = (user: unknown, body: Record<string, unknown> = {}) => {
      const r = req(user);
      return { ...r, body: { ...r.body, 'system-category': 'addon', ...body } };
    };
    const EDITOR = ['page-read', 'page-create', 'page-edit', 'page-delete'];

    test('a non-admin cannot edit the seeded add-on page', async () => {
      const { engine, pageManager } = addonEngine(true, EDITOR);
      const r = res();
      await new WikiRoutes(engine).savePage(addonReq(CONTRIBUTOR), r);
      expect(pageManager.savePage).not.toHaveBeenCalled();
      expect(r.status).toHaveBeenCalledWith(403);
    });

    test('an admin can, and the page is marked user-modified', async () => {
      const { engine, pageManager } = addonEngine(true, [...EDITOR, 'admin-system']);
      await new WikiRoutes(engine).savePage(addonReq(CONTRIBUTOR), res());
      expect((pageManager.savePage.mock.calls[0][2] as Record<string, unknown>)['user-modified']).toBe(true);
    });

    test('the seeded add-on page cannot be made private, even by an admin', async () => {
      const { engine, pageManager } = addonEngine(true, [...EDITOR, 'admin-system']);
      const r = res();
      await new WikiRoutes(engine).savePage(addonReq(CONTRIBUTOR, { 'private-present': '1', private: 'true' }), r);
      expect(pageManager.savePage).not.toHaveBeenCalled();
      expect(r.status).toHaveBeenCalledWith(400);
      expect(r.send).toHaveBeenCalledWith('Required pages cannot be marked as private');
    });

    test('a non-admin cannot delete the seeded add-on page', async () => {
      const { engine, pageManager } = addonEngine(true, EDITOR);
      const routes = new WikiRoutes(engine) as unknown as { deletePage(q: unknown, r: unknown): Promise<unknown>; renderError: unknown };
      const renderError = vi.fn().mockResolvedValue(undefined);
      routes.renderError = renderError;
      await routes.deletePage({ ...addonReq(CONTRIBUTOR), method: 'POST' }, res());
      expect(renderError).toHaveBeenCalledWith(expect.anything(), expect.anything(), 403, 'Access Denied', 'Only administrators can delete this page');
      expect(pageManager.deletePageWithContext).not.toHaveBeenCalled();
    });

    test('a site-made page in the same category is not shipped: a non-admin may edit it, unmarked', async () => {
      const { engine, pageManager } = addonEngine(false, EDITOR);
      await new WikiRoutes(engine).savePage(addonReq(CONTRIBUTOR), res());
      expect(pageManager.savePage).toHaveBeenCalled();
      expect((pageManager.savePage.mock.calls[0][2] as Record<string, unknown>)['user-modified']).toBeUndefined();
    });
  });

  test('a save refused because the encrypted vault is not open answers 409 with what to do, not 500 (#1834)', async () => {
    const { engine, pageManager } = makeEngine({ existing: false, granted: ['page-read', 'page-create', 'page-edit'], pageAllows: true });
    pageManager.savePage.mockRejectedValueOnce(new SealedVaultRefusedError('jim', 'phr', 'unopened'));
    const r = res();
    await new WikiRoutes(engine).savePage({ ...req(CONTRIBUTOR), headers: { accept: 'application/json' } }, r);
    expect(r.status).toHaveBeenCalledWith(409);
    expect(r.json).toHaveBeenCalledWith({ ok: false, error: expect.stringMatching(/open it at \/stores\/phr first\. Nothing was saved\./) });
  });
});
