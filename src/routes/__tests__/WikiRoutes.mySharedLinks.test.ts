/**
 * GET /my/shares and the old /shares address, slice 3 of #2247 (R1, R7, R9).
 */

import ejs from 'ejs';
import path from 'path';
import WikiRoutes from '../WikiRoutes';
import { TEST_PLUGIN_MANAGER } from '../../test-support/plugins';

const base = { token: 'a'.repeat(64), createdBy: 'molly', createdAt: '2026-11-01T00:00:00.000Z', expiresAt: null, actions: [], resources: [] };
const RECORDS = [
  { ...base, id: 'r1', scope: { kind: 'keyword', keyword: 'Garden' } },
  { ...base, id: 'r2', scope: { kind: 'vault', owner: 'molly', vault: 'Journal', pages: ['u1', 'u2', 'u3'] } },
  { ...base, id: 'r3', scope: { kind: 'vault', owner: 'molly', vault: 'Family', pages: null } }
];

function setup(granted: string[], vaultPages: { uuid: string; title: string }[] = [], records: unknown[] = RECORDS) {
  const pageManager = { listOwnStoreIds: vi.fn(async () => ['Journal', 'Family']), listVaultPages: vi.fn(async () => vaultPages) };
  // Any call on the audit sink is recorded: opening a page writes none (answer C).
  const auditCalls: string[] = [];
  const audit = new Proxy({}, { get: (_t, name) => (..._a: unknown[]) => { auditCalls.push(String(name)); } });
  const shareManager = {
    isEnabled: vi.fn(() => true),
    list: vi.fn(() => records),
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
      if (name === 'PageManager') return pageManager;
      if (name === 'AuditManager') return audit;
      return null;
    })
  };
  const routes = new WikiRoutes(engine);
  vi.spyOn(routes, 'getCommonTemplateData').mockResolvedValue({});
  vi.spyOn(routes as unknown as { renderError: () => Promise<void> }, 'renderError').mockImplementation(async () => undefined);
  return { routes, shareManager, pageManager, auditCalls };
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

  test('a bare /shares redirects a holder of share-manage-all to the all-users view, keeping the notices', async () => {
    const { routes } = setup(['share-manage-all']);
    const r = res();
    await routes.sharesList(req('/shares', { revoked: '1' }, MOLLY), r);
    expect(r.redirect).toHaveBeenCalledWith(302, '/my/shares?view=all&revoked=1');
    expect(r.render).not.toHaveBeenCalled();
  });

  test('a bare /shares sends a holder of admin-system without share-manage-all to their own view', async () => {
    const { routes } = setup(['share-create', 'admin-system']);
    const r = res();
    await routes.sharesList(req('/shares', {}, MOLLY), r);
    expect(r.redirect).toHaveBeenCalledWith(302, '/my/shares');
    expect(r.render).not.toHaveBeenCalled();
  });
});

describe('GET /my/shares?view=all, the all-users view (slice 4 of #2247, R13, R14)', () => {
  const sam = { ...base, id: 's1', token: 'b'.repeat(64), createdBy: 'sam', label: 'Secret trip plan', scope: { kind: 'keyword', keyword: 'Trip' } };
  const samVault = { ...base, id: 's2', token: 'c'.repeat(64), createdBy: 'sam', scope: { kind: 'vault', owner: 'sam', vault: 'Medical', pages: ['u1', 'u2'] } };
  const everyone = [...RECORDS, sam, samVault];

  test('a holder of share-manage-all alone sees every user\'s links with the owner named, and the switch', async () => {
    const { routes, shareManager } = setup(['share-manage-all'], [], everyone);
    const r = res();
    await routes.mySharesPage(req('/my/shares', { view: 'all' }, MOLLY), r);
    expect(shareManager.list).toHaveBeenCalledWith();
    const view = r.render.mock.calls[0][1] as { allUsers: boolean; mayManageAll: boolean; rows: { id: string; madeBy: string; what: string; label: string }[] };
    expect(view).toMatchObject({ allUsers: true, mayManageAll: true });
    expect(view.rows.map((x) => x.id).sort()).toEqual(['r1', 'r2', 'r3', 's1', 's2']);
    expect(view.rows.find((x) => x.id === 's2')).toMatchObject({ madeBy: 'sam', what: "2 pages in sam's Medical vault", label: '' });
  });

  test('the all-users view holds no token, no address and no page title, and reads no page', async () => {
    const { routes, pageManager } = setup(['share-manage-all'], [{ uuid: 'u1', title: 'Chemo schedule' }], everyone);
    const r = res();
    await routes.mySharesPage(req('/my/shares', { view: 'all' }, MOLLY), r);
    const view = r.render.mock.calls[0][1] as { addresses: Record<string, string>; pageTitles: Record<string, string> };
    expect(view.addresses).toEqual({});
    expect(view.pageTitles).toEqual({});
    const text = JSON.stringify(view);
    for (const c of ['a', 'b', 'c']) expect(text).not.toContain(c.repeat(64));
    expect(text).not.toContain('Chemo schedule');
    expect(text).not.toContain('Secret trip plan');
    expect(pageManager.listVaultPages).not.toHaveBeenCalled();
  });

  test('the page rendered from the arguments the route gave it holds no token and no page title (design R13)', async () => {
    const { routes } = setup(['share-manage-all'], [{ uuid: 'u1', title: 'Chemo schedule' }], everyone);
    const r = res();
    await routes.mySharesPage(req('/my/shares', { view: 'all' }, MOLLY), r);
    const [viewName, args] = r.render.mock.calls[0] as [string, Record<string, unknown>];
    // The route's own arguments, plus what the layout adds: nothing here is hand-built.
    const html = await ejs.renderFile(path.join(__dirname, '../../../views', `${viewName}.ejs`), {
      title: 'Shared links', csrfToken: 'csrf-value', jsonForScript: (v: unknown) => JSON.stringify(v), pageUrl: (n: string) => `/view/${n}`,
      lockedUnless: () => '', currentUser: { username: 'molly', displayName: 'Molly', roles: [], isAuthenticated: true },
      ...args
    });
    expect(html).toContain('Shared links: all users');
    for (const c of ['a', 'b', 'c']) expect(html).not.toContain(c.repeat(64));
    expect(html).not.toContain('/share/');
    expect(html).not.toContain('Chemo schedule');
    expect(html).not.toContain('Secret trip plan');
  });

  test('opening the all-users view writes no audit entry and revokes nothing', async () => {
    const { routes, shareManager, auditCalls } = setup(['share-manage-all'], [], everyone);
    const r = res();
    await routes.mySharesPage(req('/my/shares', { view: 'all' }, MOLLY), r);
    expect(r.render).toHaveBeenCalled();
    expect(auditCalls).toEqual([]);
    expect(shareManager.revoke).not.toHaveBeenCalled();
  });

  test('without share-manage-all, view=all gives the person their own view and no switch', async () => {
    const { routes, shareManager } = setup(['share-create', 'profile-manage'], [], everyone);
    const r = res();
    await routes.mySharesPage(req('/my/shares', { view: 'all' }, MOLLY), r);
    expect(shareManager.list).toHaveBeenCalledWith('molly');
    const view = r.render.mock.calls[0][1] as { allUsers: boolean; mayManageAll: boolean; rows: { madeBy: string }[] };
    expect(view).toMatchObject({ allUsers: false, mayManageAll: false });
    expect(view.rows.every((x) => x.madeBy === 'molly')).toBe(true);
  });

  test('a holder of share-manage-all still opens their own view by default, with the switch offered', async () => {
    const { routes, shareManager } = setup(['share-manage-all'], [], RECORDS);
    const r = res();
    await routes.mySharesPage(req('/my/shares', {}, MOLLY), r);
    expect(shareManager.list).toHaveBeenCalledWith('molly');
    expect(r.render.mock.calls[0][1]).toMatchObject({ allUsers: false, mayManageAll: true });
  });
});

describe('GET /my/shares shows the address of each link the person made (round 3 H1)', () => {
  const tokenOf = (c: string) => c.repeat(64);
  const mine = [
    { ...base, id: 'r1', token: tokenOf('a'), scope: { kind: 'keyword', keyword: 'Garden' } },
    { ...base, id: 'r2', token: tokenOf('b'), scope: { kind: 'vault', owner: 'molly', vault: 'Journal', pages: ['u1'] } },
    { ...base, id: 'r4', token: tokenOf('d'), scope: { kind: 'vault', owner: 'molly', vault: 'Family', pages: null }, lockedFor: { x: 'key' } },
    { ...base, id: 'r5', token: tokenOf('e'), scope: { kind: 'keyword', keyword: 'Old' }, revokedAt: '2026-11-02T00:00:00.000Z' }
  ];
  const stranger = { ...base, id: 'r9', token: tokenOf('f'), createdBy: 'someone-else', scope: { kind: 'keyword', keyword: 'Theirs' } };

  test('a person with only share-create sees the full address of the tag link they just made', async () => {
    const { routes, shareManager } = setup(['share-create']);
    shareManager.list.mockReturnValue(mine);
    const r = res();
    await routes.mySharesPage(req('/my/shares', { created: 'r1' }, MOLLY), r);
    const view = r.render.mock.calls[0][1] as { addresses: Record<string, string> };
    expect(view.addresses.r1).toBe(`https://wiki.example.com/share/${tokenOf('a')}`);
  });

  test('a private-area link is shown too, but an encrypted one and a revoked one are not', async () => {
    const { routes, shareManager } = setup(['share-create', 'profile-manage']);
    shareManager.list.mockReturnValue(mine);
    const r = res();
    await routes.mySharesPage(req('/my/shares', {}, MOLLY), r);
    const view = r.render.mock.calls[0][1] as { addresses: Record<string, string> };
    expect(Object.keys(view.addresses).sort()).toEqual(['r1', 'r2']);
  });

  test('another person\'s link never appears, even if the list returns it', async () => {
    const { routes, shareManager } = setup(['share-create']);
    shareManager.list.mockReturnValue([...mine, stranger] as never);
    const r = res();
    await routes.mySharesPage(req('/my/shares', {}, MOLLY), r);
    const view = r.render.mock.calls[0][1] as { addresses: Record<string, string>; rows: { id: string }[] };
    expect(view.addresses).not.toHaveProperty('r9');
    expect(view.rows.map((x) => x.id)).not.toContain('r9');
    expect(JSON.stringify(view)).not.toContain(tokenOf('f'));
  });

  test('the address of a link of a kind the person may no longer make is not handed to the page', async () => {
    const { routes, shareManager } = setup(['profile-manage']);
    shareManager.list.mockReturnValue(mine);
    const r = res();
    await routes.mySharesPage(req('/my/shares', {}, MOLLY), r);
    const view = r.render.mock.calls[0][1] as { addresses: Record<string, string> };
    expect(view.addresses).not.toHaveProperty('r1');
  });
});

describe('GET /my/shares sign-in and caching (round 4)', () => {
  test('a signed-out subject is refused even when policy would grant everything', async () => {
    const { routes } = setup(['share-create', 'profile-manage', 'share-manage-all']);
    const r = res();
    await routes.mySharesPage(req('/my/shares', {}, { username: 'Anonymous', isAuthenticated: false, roles: ['Anonymous'] }), r);
    expect(r.render).not.toHaveBeenCalled();
  });

  test('the page is never stored by a cache, because it shows working addresses', async () => {
    const { routes } = setup(['share-create']);
    const r = res();
    await routes.mySharesPage(req('/my/shares', {}, MOLLY), r);
    expect(r.render).toHaveBeenCalled();
    expect(r.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
  });
});

describe('GET /my/shares names a one-page link by its page (round 5)', () => {
  test('pageTitles holds the title of the single page, by row id, and nothing for other links', async () => {
    const one = { ...base, id: 'r7', scope: { kind: 'vault', owner: 'molly', vault: 'Journal', pages: ['u1'] } };
    const { routes } = setup(['profile-manage', 'share-create'], [{ uuid: 'u1', title: 'Day one' }], [one, RECORDS[0], RECORDS[2]]);
    const r = res();
    await routes.mySharesPage(req('/my/shares', {}, MOLLY), r);
    const view = r.render.mock.calls[0][1] as { pageTitles: Record<string, string>; rows: { id: string; label: string }[] };
    expect(view.pageTitles).toEqual({ r7: 'Day one' });
    expect(view.rows.every((x) => typeof x.label === 'string')).toBe(true);
  });
});
