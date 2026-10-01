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
      getProperty: vi.fn((key: string, def: unknown) => (key === 'ngdpbase.system-category' ? { general: { enabled: true, label: 'general' } } : def))
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
});
