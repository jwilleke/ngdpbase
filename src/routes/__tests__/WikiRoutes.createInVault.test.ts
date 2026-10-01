/**
 * Creating a page in your own vault answers to vault-owner, not your
 * site-wide role — #1539.
 *
 * GET /create opens when the person may create a page anywhere: publicly
 * (`page-create`), or in a system-category's vault (asked about a page in
 * their own vault). Where they may only create it private, the form says so
 * (`locked`). POST /create asks for the page actually being made.
 */

import WikiRoutes from '../WikiRoutes';

const READER = { username: 'molly', roles: ['reader', 'vault-owner'], isAuthenticated: true };

/** `global` answers a capability with no resource; `inVault` one asked with a vault. */
function makeEngine(global: string[], inVault: string[]) {
  const pageManager = {
    getPage: vi.fn().mockResolvedValue(null),
    savePage: vi.fn((name: string) => Promise.resolve({ name })),
    getCurrentPageProvider: vi.fn().mockReturnValue({ pageIndex: { pages: {} } })
  };
  const managers: Record<string, unknown> = {
    PageManager: pageManager,
    PolicyDecisionPoint: {
      permits: vi.fn((_s: unknown, action: string) => Promise.resolve(global.includes(action))),
      decide: vi.fn((_s: unknown, { action, attributes }: { action: string; attributes?: { vault?: string } }) =>
        Promise.resolve({ permit: (attributes?.vault ? inVault : global).includes(action), applicable: true, reason: 'test' }))
    },
    ValidationManager: {
      getVaultId: (category: string) => (category === 'general' ? 'default' : null),
      canBePrivate: () => true,
      getDefaultPrivate: () => false,
      getDefaultSystemCategory: () => 'general',
      generateValidMetadata: vi.fn((title: string, meta: object) => ({ title, ...meta }))
    },
    TemplateManager: { getTemplates: () => [], applyTemplate: () => '# New' },
    ConfigurationManager: {
      getProperty: vi.fn((key: string, def: unknown) => (key === 'ngdpbase.system-category' ? { general: { enabled: true, label: 'general' } } : def))
    }
  };
  const routes = new WikiRoutes({ getManager: vi.fn((n: string) => managers[n] ?? null) });
  vi.spyOn(routes as never, 'getSystemCategories').mockReturnValue(['general'] as never);
  vi.spyOn(routes as never, 'getCommonTemplateData').mockResolvedValue({});
  vi.spyOn(routes as never, 'getUserKeywordsWithDescriptions').mockResolvedValue([] as never);
  vi.spyOn(routes as never, 'renderError').mockImplementation((async (_q: unknown, r: { status: (n: number) => unknown }, code: number) => { r.status(code); }));
  return { routes, pageManager };
}

const res = () => ({ status: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis(), render: vi.fn().mockReturnThis(), redirect: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() });
const getReq = () => ({ query: {}, params: {}, body: {}, headers: {}, session: {}, userContext: READER, originalUrl: '/create' });
const postReq = (isPrivate: boolean) => ({
  query: {}, params: {}, headers: {}, session: {}, userContext: READER, originalUrl: '/create',
  body: { pageName: 'Diary', templateName: 'default', 'system-category': 'general', ...(isPrivate ? { private: 'true' } : {}) }
});

describe('creating a page in your own vault (#1539)', () => {
  test('GET /create opens for a reader who may create only in their vault, with Private locked on', async () => {
    const { routes } = makeEngine(['page-read'], ['page-create']);
    const r = res();
    await routes.createPage(getReq(), r);
    expect(r.render).toHaveBeenCalledWith('create', expect.objectContaining({
      privateStart: { general: expect.objectContaining({ can: true, start: true, locked: true }) }
    }));
  });

  test('GET /create is refused when the person may create nowhere', async () => {
    const { routes } = makeEngine(['page-read'], []);
    const r = res();
    await routes.createPage(getReq(), r);
    expect(r.render).not.toHaveBeenCalledWith('create', expect.anything());
    expect(r.status).toHaveBeenCalledWith(403);
  });

  test('POST /create makes a private page in the reader’s vault', async () => {
    const { routes, pageManager } = makeEngine(['page-read'], ['page-create']);
    await routes.createPageFromTemplate(postReq(true), res());
    expect(pageManager.savePage).toHaveBeenCalled();
  });

  test('POST /create refuses the same reader a public page', async () => {
    const { routes, pageManager } = makeEngine(['page-read'], ['page-create']);
    const r = res();
    await routes.createPageFromTemplate(postReq(false), r);
    expect(pageManager.savePage).not.toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(403);
  });
});
