/**
 * The Share... chooser on /my/shares and the old private-area addresses,
 * slice 3 of #2247 (R2, R9).
 */

import WikiRoutes from '../WikiRoutes';
import { TEST_PLUGIN_MANAGER } from '../../test-support/plugins';

function setup(granted: string[]) {
  const shareManager = {
    isEnabled: vi.fn(() => true),
    list: vi.fn(() => []),
    get: vi.fn(),
    maxShareDays: vi.fn(() => 15),
    isEncryptedVault: vi.fn(async (_o: string, v: string) => v === 'Family'),
    linkBaseUrl: vi.fn(() => 'https://wiki.example.com')
  };
  const pageManager = {
    listOwnStoreIds: vi.fn(async () => ['Journal', 'Family']),
    listVaultPages: vi.fn(async () => [{ uuid: 'u1', title: 'Day one' }, { uuid: 'u2', title: 'Day two' }])
  };
  const engine = {
    getManager: vi.fn((name: string) => {
      if (name === 'PluginManager') return TEST_PLUGIN_MANAGER;
      if (name === 'ShareManager') return shareManager;
      if (name === 'PageManager') return pageManager;
      if (name === 'PolicyDecisionPoint') return { permits: vi.fn(async (_u: string, action: string) => granted.includes(action)) };
      return null;
    })
  };
  const routes = new WikiRoutes(engine);
  vi.spyOn(routes, 'getCommonTemplateData').mockResolvedValue({});
  vi.spyOn(routes as unknown as { renderError: () => Promise<void> }, 'renderError').mockImplementation(async () => undefined);
  return { routes, shareManager, pageManager };
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

describe('the Share... chooser holds the private-area forms (slice 3 of #2247)', () => {
  test('a user with private areas gets their areas and the link address for the forms', async () => {
    const { routes } = setup(['share-create', 'profile-manage']);
    const r = res();
    await routes.mySharesPage(req('/my/shares', { share: 'vault' }, MOLLY), r);
    const view = r.render.mock.calls[0][1] as { vaults: { id: string; maxDays: number; encrypted: boolean }[]; baseUrl: string; shareChoice: string };
    expect(view.vaults).toEqual([
      { id: 'Journal', maxDays: 15, encrypted: false },
      { id: 'Family', maxDays: 15, encrypted: true }
    ]);
    expect(view.baseUrl).toBe('https://wiki.example.com');
    expect(view.shareChoice).toBe('vault');
  });

  test('a page in the query picks its area, offers the pages beside it and ticks it', async () => {
    const { routes } = setup(['profile-manage']);
    const r = res();
    await routes.mySharesPage(req('/my/shares', { share: 'vault', page: 'vaults/molly/Journal/Day two' }, MOLLY), r);
    const view = r.render.mock.calls[0][1] as { pickVault: string | null; pickPages: unknown[]; preselected: string | null };
    expect(view.pickVault).toBe('Journal');
    expect(view.pickPages).toHaveLength(2);
    expect(view.preselected).toBe('u2');
  });

  test('a user who may not make private-area links is offered no areas', async () => {
    const { routes } = setup(['share-create']);
    const r = res();
    await routes.mySharesPage(req('/my/shares', {}, MOLLY), r);
    expect(r.render.mock.calls[0][1]).toMatchObject({ vaults: [], pickVault: null });
  });
});
