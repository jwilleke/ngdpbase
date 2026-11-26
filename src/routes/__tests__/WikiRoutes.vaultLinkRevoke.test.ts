/**
 * POST /my/vaults/links/:id/revoke, slice 3 of #2247 (Q-D, Q-G).
 *
 * The route reads the record and compares its maker before any permission is
 * asked. A person who made the link revokes it at their own session with no
 * permission; a token acting for them keeps its profile-manage check; anyone
 * else gets 404.
 */

import WikiRoutes from '../WikiRoutes';
import { TEST_PLUGIN_MANAGER } from '../../test-support/plugins';

const RECORD = {
  id: 'v1', token: 'a'.repeat(64), scope: { kind: 'vault', owner: 'molly', vault: 'journal', pages: null },
  createdBy: 'molly', createdAt: '2026-07-01T00:00:00.000Z', expiresAt: null
};
const TAG_RECORD = { ...RECORD, id: 't1', scope: { kind: 'keyword', keyword: 'trip' } };

function setup(granted: string[]) {
  const pageManagerCalls: string[] = [];
  const shareManager = {
    isEnabled: vi.fn(() => true),
    get: vi.fn((id: string) => [RECORD, TAG_RECORD].find((r) => r.id === id) ?? null),
    revoke: vi.fn(async () => true)
  };
  const engine = {
    getManager: vi.fn((name: string) => {
      if (name === 'PluginManager') return TEST_PLUGIN_MANAGER;
      if (name === 'ShareManager') return shareManager;
      if (name === 'PolicyDecisionPoint') return { permits: vi.fn(async (_u: string, action: string) => granted.includes(action)) };
      if (name === 'PageManager') return new Proxy({}, { get: (_t, m) => () => { pageManagerCalls.push(String(m)); return []; } });
      return null;
    })
  };
  const routes = new WikiRoutes(engine);
  vi.spyOn(routes, 'getCommonTemplateData').mockResolvedValue({});
  vi.spyOn(routes as unknown as { renderError: () => Promise<void> }, 'renderError').mockImplementation(async () => undefined);
  return { routes, shareManager, pageManagerCalls };
}

const req = (id: string, userContext: unknown) => ({
  params: { id }, query: {}, body: {}, session: { csrfToken: 'tok' },
  path: `/my/vaults/links/${id}/revoke`, originalUrl: `/my/vaults/links/${id}/revoke`, protocol: 'http',
  get: vi.fn().mockReturnValue('localhost:3000'),
  userContext
});
const res = () => ({
  status: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis(), redirect: vi.fn().mockReturnThis(),
  render: vi.fn().mockReturnThis(), setHeader: vi.fn().mockReturnThis()
});

const MOLLY = { username: 'molly', isAuthenticated: true, roles: [] as string[] };

describe('POST /my/vaults/links/:id/revoke (slice 3 of #2247)', () => {
  test('the maker at their own session revokes it holding no permission at all', async () => {
    const { routes, shareManager } = setup([]);
    const r = res();
    await routes.myVaultLinksRevoke(req('v1', MOLLY), r);
    expect(shareManager.revoke).toHaveBeenCalledWith('v1', expect.objectContaining({ username: 'molly' }));
    expect(shareManager.revoke.mock.calls[0]).toHaveLength(2);
    expect(r.redirect).toHaveBeenCalledWith('/my/shares?notice=revoked');
  });

  test('a token of the maker without profile-manage gets 403 and the link stays live', async () => {
    const { routes, shareManager } = setup([]);
    const r = res();
    await routes.myVaultLinksRevoke(req('v1', { ...MOLLY, viaToken: { id: 't' } }), r);
    expect(shareManager.revoke).not.toHaveBeenCalled();
    expect(r.redirect).not.toHaveBeenCalledWith('/my/shares?notice=revoked');
  });

  test('a token of the maker whose ceiling grants profile-manage revokes it', async () => {
    const { routes, shareManager } = setup(['profile-manage']);
    const r = res();
    await routes.myVaultLinksRevoke(req('v1', { ...MOLLY, viaToken: { id: 't' } }), r);
    expect(shareManager.revoke).toHaveBeenCalledWith('v1', expect.objectContaining({ username: 'molly', viaToken: { id: 't' } }));
  });

  test('another user, even holding profile-manage, gets 404 and nothing is revoked', async () => {
    const { routes, shareManager } = setup(['profile-manage']);
    const r = res();
    await routes.myVaultLinksRevoke(req('v1', { username: 'sam', isAuthenticated: true, roles: [] }), r);
    expect(shareManager.revoke).not.toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(404);
  });

  test('a tag record id answers 404 on this route', async () => {
    const { routes, shareManager } = setup([]);
    const r = res();
    await routes.myVaultLinksRevoke(req('t1', MOLLY), r);
    expect(shareManager.revoke).not.toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(404);
  });

  // Slice 4 of #2247 (Q-A, Q-C): a manager needs share-manage-all and nothing else.
  const SAM = { username: 'sam', isAuthenticated: true, roles: [] as string[] };

  test('a holder of share-manage-all alone revokes another user\'s link, as a manager, with no step-up', async () => {
    const { routes, shareManager } = setup(['share-manage-all']);
    const r = res();
    await routes.myVaultLinksRevoke(req('v1', SAM), r);
    expect(shareManager.revoke).toHaveBeenCalledWith('v1', expect.objectContaining({ username: 'sam' }), { asManager: true });
    expect(r.redirect).toHaveBeenCalledWith('/my/shares?view=all&notice=revoked');
  });

  test('the maker who also holds share-manage-all revokes their own link as the maker, not as a manager', async () => {
    const { routes, shareManager } = setup(['share-manage-all']);
    const r = res();
    await routes.myVaultLinksRevoke(req('v1', MOLLY), r);
    expect(shareManager.revoke).toHaveBeenCalledWith('v1', expect.objectContaining({ username: 'molly' }));
    expect(shareManager.revoke.mock.calls[0]).toHaveLength(2);
  });

  test('admin-system, share-revoke and profile-manage together do not let anyone revoke another user\'s link', async () => {
    const { routes, shareManager } = setup(['admin-system', 'share-revoke', 'profile-manage']);
    const r = res();
    await routes.myVaultLinksRevoke(req('v1', SAM), r);
    expect(shareManager.revoke).not.toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(404);
  });

  test('a manager sending a tag link id to this route gets 404 and nothing is revoked', async () => {
    const { routes, shareManager } = setup(['share-manage-all']);
    const r = res();
    await routes.myVaultLinksRevoke(req('t1', SAM), r);
    expect(shareManager.revoke).not.toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(404);
  });

  test('a manager revoke reads no page: the page manager is never asked', async () => {
    const { routes, pageManagerCalls } = setup(['share-manage-all']);
    await routes.myVaultLinksRevoke(req('v1', SAM), res());
    expect(pageManagerCalls).toEqual([]);
  });

  test('a signed-out caller is sent to sign in even when policy would grant share-manage-all', async () => {
    const { routes, shareManager } = setup(['share-manage-all']);
    const r = res();
    await routes.myVaultLinksRevoke(req('v1', { username: 'Anonymous', isAuthenticated: false, roles: ['Anonymous'] }), r);
    expect(shareManager.revoke).not.toHaveBeenCalled();
  });
});
