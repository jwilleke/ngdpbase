/**
 * Where the private-area link routes send a person afterwards (round 3 M2 of
 * #2522, slice 3 of #2247): the Shared links page, at /my/shares, with the
 * same ?created=, ?notice= and ?error= it understands.
 */

import WikiRoutes from '../WikiRoutes';
import { TEST_PLUGIN_MANAGER } from '../../test-support/plugins';

const RECORD = {
  id: 'v1', token: 'a'.repeat(64), scope: { kind: 'vault', owner: 'molly', vault: 'journal', pages: null },
  createdBy: 'molly', createdAt: '2026-07-01T00:00:00.000Z', expiresAt: null
};

function setup(granted: string[] = ['profile-manage']) {
  const shareManager = {
    isEnabled: vi.fn(() => true),
    get: vi.fn((id: string) => (id === 'v1' ? RECORD : id === 'v9' ? { ...RECORD, id: 'v9', createdBy: 'Anonymous' } : null)),
    revoke: vi.fn(async () => true),
    extend: vi.fn(async () => true),
    maxShareDays: vi.fn(() => 7),
    isEncryptedVault: vi.fn(async () => false),
    issueVaultShare: vi.fn(async () => ({ ...RECORD, id: 'new id' }))
  };
  const engine = {
    getManager: vi.fn((name: string) => {
      if (name === 'PluginManager') return TEST_PLUGIN_MANAGER;
      if (name === 'ShareManager') return shareManager;
      if (name === 'PolicyDecisionPoint') return { permits: vi.fn(async (_u: string, action: string) => granted.includes(action)) };
      if (name === 'PageManager') return { listOwnStoreIds: vi.fn(async () => ['journal']), listVaultPages: vi.fn(async () => []) };
      return null;
    })
  };
  const routes = new WikiRoutes(engine);
  vi.spyOn(routes, 'getCommonTemplateData').mockResolvedValue({});
  vi.spyOn(routes as unknown as { renderError: () => Promise<void> }, 'renderError').mockImplementation(async () => undefined);
  return { routes, shareManager };
}

const MOLLY = { username: 'molly', isAuthenticated: true, roles: [] as string[] };
const req = (body: Record<string, unknown>, userContext: unknown, params: Record<string, string> = {}) => ({
  params, query: {}, body, session: { csrfToken: 'tok' }, path: '/x', originalUrl: '/x', protocol: 'http',
  is: vi.fn(() => false),
  get: vi.fn().mockReturnValue('localhost:3000'),
  userContext
});
const res = () => ({
  status: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(),
  redirect: vi.fn().mockReturnThis(), render: vi.fn().mockReturnThis(), setHeader: vi.fn().mockReturnThis()
});

describe('private-area link routes land on /my/shares (round 3 M2)', () => {
  test('making a link goes to /my/shares?created=ID', async () => {
    const { routes } = setup();
    const r = res();
    await routes.myVaultLinksCreate(req({ vault: 'journal', scope: 'whole', days: '3' }, MOLLY), r);
    expect(r.redirect).toHaveBeenCalledWith('/my/shares?created=new%20id');
  });

  test('a refused make goes to /my/shares?error=...', async () => {
    const { routes } = setup();
    const r = res();
    await routes.myVaultLinksCreate(req({ vault: 'nope', scope: 'whole', days: '3' }, MOLLY), r);
    expect(r.redirect).toHaveBeenCalledWith('/my/shares?error=vault');
  });

  test('extending goes to /my/shares?notice=extended', async () => {
    const { routes } = setup();
    const r = res();
    await routes.myVaultLinksExtend(req({ hours: '2' }, MOLLY, { id: 'v1' }), r);
    expect(r.redirect).toHaveBeenCalledWith('/my/shares?notice=extended');
  });

  test('an extend that does not happen goes to /my/shares?notice=not-extended', async () => {
    const { routes, shareManager } = setup();
    shareManager.extend.mockResolvedValue(false);
    const r = res();
    await routes.myVaultLinksExtend(req({ hours: '2' }, MOLLY, { id: 'v1' }), r);
    expect(r.redirect).toHaveBeenCalledWith('/my/shares?notice=not-extended');
  });

  test('a failed extend goes to /my/shares?error=hours', async () => {
    const { routes, shareManager } = setup();
    shareManager.extend.mockRejectedValue(new Error('bad hours'));
    const r = res();
    await routes.myVaultLinksExtend(req({ hours: '99' }, MOLLY, { id: 'v1' }), r);
    expect(r.redirect).toHaveBeenCalledWith('/my/shares?error=hours');
  });

  test('revoking goes to /my/shares?notice=revoked', async () => {
    const { routes } = setup([]);
    const r = res();
    await routes.myVaultLinksRevoke(req({}, MOLLY, { id: 'v1' }), r);
    expect(r.redirect).toHaveBeenCalledWith('/my/shares?notice=revoked');
  });
});

describe('a signed-out subject cannot revoke (round 3 Sec L1)', () => {
  const ANON = { username: 'Anonymous', isAuthenticated: false, roles: ['Anonymous'] };

  test('the private-area revoke refuses and revokes nothing', async () => {
    const { routes, shareManager } = setup([]);
    const r = res();
    // Even a record whose maker is recorded as the signed-out name.
    await routes.myVaultLinksRevoke(req({}, ANON, { id: 'v9' }), r);
    expect(shareManager.revoke).not.toHaveBeenCalled();
    expect(r.redirect).not.toHaveBeenCalledWith('/my/shares?notice=revoked');
  });
});
