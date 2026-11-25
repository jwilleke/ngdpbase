/**
 * GET /my/shares and the old /shares address, slice 3 of #2247 (R1, R7, R9).
 */

import WikiRoutes from '../WikiRoutes';
import { TEST_PLUGIN_MANAGER } from '../../test-support/plugins';

const base = { token: 'a'.repeat(64), createdBy: 'molly', createdAt: '2026-11-01T00:00:00.000Z', expiresAt: null, actions: [], resources: [] };
const RECORDS = [
  { ...base, id: 'r1', scope: { kind: 'keyword', keyword: 'Garden' } },
  { ...base, id: 'r2', scope: { kind: 'vault', owner: 'molly', vault: 'Journal', pages: ['u1', 'u2', 'u3'] } },
  { ...base, id: 'r3', scope: { kind: 'vault', owner: 'molly', vault: 'Family', pages: null } }
];

function setup(granted: string[]) {
  const shareManager = {
    isEnabled: vi.fn(() => true),
    list: vi.fn(() => RECORDS),
    get: vi.fn(),
    revoke: vi.fn(),
    linkBaseUrl: vi.fn(() => 'https://wiki.example.com'),
    maxShareDays: vi.fn(() => 15),
    isEncryptedVault: vi.fn(async () => false)
  };
  const engine = {
    getManager: vi.fn((name: string) => {
      if (name === 'PluginManager') return TEST_PLUGIN_MANAGER;
      if (name === 'ShareManager') return shareManager;
      if (name === 'PolicyDecisionPoint') return { permits: vi.fn(async (_u: string, action: string) => granted.includes(action)) };
      if (name === 'PageManager') return { listOwnStoreIds: vi.fn(async () => ['Journal', 'Family']), listVaultPages: vi.fn(async () => []) };
      return null;
    })
  };
  const routes = new WikiRoutes(engine);
  vi.spyOn(routes, 'getCommonTemplateData').mockResolvedValue({});
  vi.spyOn(routes as unknown as { renderError: () => Promise<void> }, 'renderError').mockImplementation(async () => undefined);
  return { routes, shareManager };
}

const req = (url: string, query: Record<string, string>, userContext: unknown) => ({
  params: {}, query, body: {}, session: { csrfToken: 'tok' }, path: url, originalUrl: url, protocol: 'http',
  get: vi.fn().mockReturnValue('localhost:3000'), userContext
});
const res = () => ({
  status: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis(), redirect: vi.fn().mockReturnThis(),
  render: vi.fn().mockReturnThis(), setHeader: vi.fn().mockReturnThis()
});
const MOLLY = { username: 'molly', isAuthenticated: true, roles: [] as string[] };

describe('GET /my/shares (slice 3 of #2247)', () => {
  test('a user with one link of each kind sees three rows and the Share... choices they may make', async () => {
    const { routes } = setup(['share-create', 'profile-manage']);
    const r = res();
    await routes.mySharesPage(req('/my/shares', {}, MOLLY), r);
    expect(r.render.mock.calls[0][0]).toBe('my-shares');
    const view = r.render.mock.calls[0][1] as { rows: { kind: string }[]; mayTag: boolean; mayVault: boolean };
    expect(view.rows.map((x) => x.kind).sort()).toEqual(['chosen-pages', 'tag', 'whole-area']);
    expect(view).toMatchObject({ mayTag: true, mayVault: true });
  });

  test('a user who may only make private-area links does not see their tag link', async () => {
    const { routes } = setup(['profile-manage']);
    const r = res();
    await routes.mySharesPage(req('/my/shares', {}, MOLLY), r);
    const view = r.render.mock.calls[0][1] as { rows: { kind: string }[]; mayTag: boolean };
    expect(view.mayTag).toBe(false);
    expect(view.rows.map((x) => x.kind)).not.toContain('tag');
  });

  test('a user who may make nothing and manages nothing is refused', async () => {
    const { routes } = setup([]);
    const r = res();
    await routes.mySharesPage(req('/my/shares', {}, MOLLY), r);
    expect(r.render).not.toHaveBeenCalled();
  });

  test('a holder of share-manage-all who may make nothing opens an empty page', async () => {
    const { routes, shareManager } = setup(['share-manage-all']);
    shareManager.list.mockReturnValue([]);
    const r = res();
    await routes.mySharesPage(req('/my/shares', {}, MOLLY), r);
    const view = r.render.mock.calls[0][1] as { rows: unknown[]; mayTag: boolean; mayVault: boolean };
    expect(view).toMatchObject({ rows: [], mayTag: false, mayVault: false });
  });

  test('the tag in the query prefills the Share... form', async () => {
    const { routes } = setup(['share-create']);
    const r = res();
    await routes.mySharesPage(req('/my/shares', { share: 'tag', tag: 'trip' }, MOLLY), r);
    expect(r.render.mock.calls[0][1]).toMatchObject({ tagPrefill: 'trip', shareChoice: 'tag' });
  });
});

describe('GET /shares, the old address (slice 3 of #2247)', () => {
  test('?keyword=X redirects for everyone, a holder of admin-system included', async () => {
    for (const granted of [['share-create'], ['share-create', 'admin-system']]) {
      const { routes } = setup(granted);
      const r = res();
      await routes.sharesList(req('/shares', { keyword: 'trip' }, MOLLY), r);
      expect(r.redirect).toHaveBeenCalledWith(302, '/my/shares?share=tag&tag=trip');
    }
  });

  test('a bare /shares redirects for a user without admin-system and keeps the query notices', async () => {
    const { routes } = setup(['share-create']);
    const r = res();
    await routes.sharesList(req('/shares', { revoked: '1' }, MOLLY), r);
    expect(r.redirect).toHaveBeenCalledWith(302, '/my/shares?revoked=1');
  });

  test('a bare /shares is not redirected for a holder of admin-system', async () => {
    const { routes } = setup(['share-create', 'admin-system']);
    const r = res();
    await routes.sharesList(req('/shares', {}, MOLLY), r);
    expect(r.redirect).not.toHaveBeenCalled();
    expect(r.render.mock.calls[0][0]).toBe('shares');
  });
});
