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
      if (name === 'PageManager') return { listOwnStoreIds: vi.fn(async () => ['journal']) };
      return null;
    })
  };
  const routes = new WikiRoutes(engine);
  vi.spyOn(routes, 'getCommonTemplateData').mockResolvedValue({});
  vi.spyOn(routes as unknown as { renderError: () => Promise<void> }, 'renderError').mockImplementation(async () => undefined);
  return { routes, shareManager };
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
});
