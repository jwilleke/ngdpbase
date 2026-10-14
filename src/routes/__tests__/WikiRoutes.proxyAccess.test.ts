/**
 * #1762 slice 7 — the proxy-access routes: give and revoke on your own
 * profile, and an administrator's give and revoke on a user's page.
 *
 * - Not found while `ngdpbase.auth.proxy-access.enabled` is off, and nothing reaches AuthManager.
 * - `proxy-grant` at the door: a stale sign-in goes to step-up first.
 * - Every decision is AuthManager's: a permission the person lacks, or
 *   someone else's grant, comes back as a refusal, never a success.
 * - The app-wide CSRF guard refuses a give without the form's token.
 * - The profile and admin cards are hidden while off, and the admin's form
 *   comes from AuthManager.proxyGrantOptions for the person (never vault access).
 *
 * The routes run against a real AuthManager (its grant doors and step-up
 * answer) over a double credentials store and a double policy, so the rules
 * under test are its own. Sabotaged once each (then restored): the
 * `proxyAccessOn` check in giveProxyAccess (skipped) — the 404 test went
 * red; `permitted(…, 'proxy-grant', …)` in adminGiveProxyAccess (dropped) —
 * the admin step-up test went red; grantProxy's refusal of vault-proxy on an
 * administrator's grant (skipped) — the admin vault test went red.
 */
import WikiRoutes from '../WikiRoutes';
import AuthManager from '../../managers/AuthManager';
import { csrfMiddleware } from '../../middleware/csrf';

const res = () => ({
  status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), redirect: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis(), render: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis(), type: vi.fn().mockReturnThis()
});

/** What each account holds (policy). `proxy-grant` needs a fresh sign-in. */
const HOLDS: Record<string, string[]> = {
  mom: ['proxy-grant', 'page-read', 'page-edit', 'vault-proxy'],
  jim: ['proxy-grant', 'page-read'],
  admin: ['proxy-grant', 'user-edit', 'page-read', 'vault-proxy']
};
const CATALOG = {
  'page-read': { label: 'View pages' }, 'page-edit': { label: 'Edit pages' }, 'proxy-grant': { label: 'Let someone act for you, and stop them' },
  'vault-proxy': { label: 'Let someone acting for you into your vaults' }, 'user-edit': { label: "Edit people's accounts" }, 'audit-only': { grantable: false }
};

interface Subj { username: string; roles: string[]; isAuthenticated: boolean; signIn?: { fresh: boolean } }

function routes(opts: { enabled?: boolean; fresh?: boolean } = {}) {
  let enabled = opts.enabled ?? true;
  const rows = new Map<string, { id: string; username: string; kind: string; subject: string; secret: string; label: string; createdAt: string }>();
  const store = {
    listKind: (k: string) => [...rows.values()].filter(r => r.kind === k),
    get: (id: string) => rows.get(id) ?? null,
    add: (r: { id: string } & Record<string, string>) => { rows.set(r.id, r as never); return Promise.resolve(); },
    remove: (id: string) => Promise.resolve(rows.delete(id))
  };
  const holds = (s: Subj, a: string) => (HOLDS[s.username] ?? []).includes(a);
  const pdp = {
    holds: vi.fn((s: Subj, a: string) => Promise.resolve(holds(s, a))),
    permits: vi.fn((s: Subj, a: string) => Promise.resolve(holds(s, a) && !(a === 'proxy-grant' && !s.signIn?.fresh)))
  };
  const subject = (u: string): Subj => ({ username: u, roles: ['reader'], isAuthenticated: true });
  const managers: Record<string, unknown> = {
    ConfigurationManager: { getProperty: (k: string, d: unknown) => (k === 'ngdpbase.auth.proxy-access.enabled' ? enabled : k === 'ngdpbase.permissions.definitions' ? CATALOG : d) },
    PolicyDecisionPoint: pdp,
    PolicyInformationPoint: { subjectFor: (u: string) => Promise.resolve(HOLDS[u] ? subject(u) : null) },
    AuditManager: { logAuditEvent: () => Promise.resolve('a'), flushAuditQueue: () => Promise.resolve() }
  };
  const engine = { getManager: vi.fn((n: string) => managers[n] ?? null) };
  // A real AuthManager's grant doors over a double store: the rules under test are its own.
  const am = new AuthManager(engine);
  (am as unknown as { credentials: unknown }).credentials = store;
  managers.AuthManager = am;
  const r = new WikiRoutes(engine) as unknown as Record<string, (q: unknown, s: unknown) => Promise<void>>;
  (r as unknown as { getCommonTemplateData: () => Promise<Record<string, unknown>> }).getCommonTemplateData = () => Promise.resolve({ csrfToken: 't' });
  return { r, am, rows, setEnabled: (v: boolean) => { enabled = v; } };
}

const req = (username: string, extra: Record<string, unknown> = {}, fresh = true) => ({
  session: { username, isAuthenticated: true, csrfToken: 't', save: (cb: () => void) => cb() },
  body: {}, ip: '192.0.2.1', headers: {}, query: {}, params: {}, method: 'POST', originalUrl: '/profile/proxy-access',
  get: (h: string) => (h === 'referer' ? 'https://site.example.com/profile' : undefined),
  userContext: { username, roles: ['reader'], isAuthenticated: true, ...(fresh ? { signIn: { fresh: true } } : {}) },
  ...extra
});

describe('#1762 slice 7 — giving and revoking access on your own profile', () => {
  test('a fresh session gives access: the grant is made for the signed-in person, with the end of the chosen day', async () => {
    const { r, am } = routes();
    const out = res();
    await r.giveProxyAccess(req('mom', { body: { proxy: 'jim', permissions: ['page-read'], expiresAt: '2099-01-01T04:59:59.999Z' } }), out);
    expect(out.redirect).toHaveBeenCalledWith(`/profile?success=${encodeURIComponent('jim can now act for you.')}#proxy-access`);
    const [made] = await am.listProxyGrants(req('mom').userContext, { asOwner: 'mom' });
    expect(made).toEqual(expect.objectContaining({ owner: 'mom', proxy: 'jim', permissions: ['page-read'], expiresAt: '2099-01-01T04:59:59.999Z', createdBy: 'mom' }));
  });

  test('a single permission arrives as a string; a bare end date means the end of that day UTC', async () => {
    const { r, am } = routes();
    await r.giveProxyAccess(req('mom', { body: { proxy: 'jim', permissions: 'page-read', endDate: '2099-03-04' } }), res());
    const [made] = await am.listProxyGrants(req('mom').userContext, { asOwner: 'mom' });
    expect(made).toEqual(expect.objectContaining({ permissions: ['page-read'], expiresAt: '2099-03-04T23:59:59.999Z' }));
  });

  test('nobody chosen, or nothing ticked, is answered in plain words', async () => {
    const { r, rows } = routes();
    const a = res();
    await r.giveProxyAccess(req('mom', { body: { permissions: ['page-read'] } }), a);
    expect(a.redirect).toHaveBeenCalledWith(`/profile?error=${encodeURIComponent('Choose the person who will act for you.')}#proxy-access`);
    const b = res();
    await r.giveProxyAccess(req('mom', { body: { proxy: 'jim' } }), b);
    expect(b.redirect).toHaveBeenCalledWith(`/profile?error=${encodeURIComponent('Tick at least one thing they may do.')}#proxy-access`);
    expect(rows.size).toBe(0);
  });

  test('a permission you do not hold is refused, and nothing is made', async () => {
    const { r, rows } = routes();
    const out = res();
    await r.giveProxyAccess(req('jim', { body: { proxy: 'mom', permissions: ['page-read', 'page-edit'] } }), out);
    expect(out.redirect).toHaveBeenCalledWith(expect.stringMatching(/^\/profile\?error=.*does%20not%20hold%20page-edit/));
    expect(rows.size).toBe(0);
  });

  test('a stale sign-in is sent to confirm it is you first, and nothing is made', async () => {
    const { r, rows } = routes();
    const out = res();
    await r.giveProxyAccess(req('mom', { body: { proxy: 'jim', permissions: ['page-read'] } }, false), out);
    expect(out.redirect).toHaveBeenCalledWith('/auth/reauth?next=%2Fprofile');
    expect(rows.size).toBe(0);
  });

  test('you revoke your own grant; someone else\'s is refused and stays', async () => {
    const { r, am } = routes();
    const made = await am.grantProxy(req('mom').userContext, { owner: 'mom', proxy: 'jim', permissions: ['page-read'] });
    const notYours = res();
    await r.revokeOwnProxyAccess(req('jim', { params: { id: made.id } }), notYours);
    expect(notYours.redirect).toHaveBeenCalledWith('/profile?error=Not+found#proxy-access');
    expect(am.liveProxyGrant(made.id)).not.toBeNull();

    const yours = res();
    await r.revokeOwnProxyAccess(req('mom', { params: { id: made.id } }), yours);
    expect(yours.redirect).toHaveBeenCalledWith('/profile?success=Access+revoked#proxy-access');
    expect(am.liveProxyGrant(made.id)).toBeNull();
  });

  test('while proxy access is off every proxy route is not found, and nothing reaches the grant doors', async () => {
    const { r, am } = routes({ enabled: false });
    const grant = vi.spyOn(am, 'grantProxy');
    const revoke = vi.spyOn(am, 'revokeProxy');
    for (const [handler, extra] of [
      ['giveProxyAccess', { body: { proxy: 'jim', permissions: ['page-read'] } }],
      ['revokeOwnProxyAccess', { params: { id: 'g' } }],
      ['adminGiveProxyAccess', { params: { username: 'mom' }, body: { proxy: 'jim', permissions: ['page-read'] } }],
      ['adminRevokeProxyAccess', { params: { username: 'mom', id: 'g' } }]
    ] as const) {
      const out = res();
      await r[handler](req('admin', extra), out);
      expect(out.status).toHaveBeenCalledWith(404);
    }
    expect(grant).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
  });

  test('the CSRF guard refuses a give without the form\'s token', () => {
    const out = res();
    const next = vi.fn();
    csrfMiddleware({ ...req('mom', { body: { proxy: 'jim', permissions: ['page-read'] } }), path: '/profile/proxy-access', get: () => undefined }, out, next);
    expect(next).not.toHaveBeenCalled();
    expect(out.status).toHaveBeenCalledWith(403);

    const ok = vi.fn();
    csrfMiddleware({ ...req('mom', { body: { _csrf: 't' } }), path: '/profile/proxy-access', get: () => undefined }, res(), ok);
    expect(ok).toHaveBeenCalled();
  });
});

describe('#1762 slice 7 — an administrator on a user\'s page', () => {
  test('gives access for the person, recorded as the administrator\'s; vault access is refused', async () => {
    const { r, am } = routes();
    const out = res();
    await r.adminGiveProxyAccess(req('admin', { params: { username: 'mom' }, body: { proxy: 'jim', permissions: ['page-read'] } }), out);
    expect(out.redirect).toHaveBeenCalledWith(`/admin/users/mom/edit?success=${encodeURIComponent('jim can now act for mom.')}#proxy-access`);
    const [made] = await am.listProxyGrants(req('admin').userContext, { asOwner: 'mom' });
    expect(made).toEqual(expect.objectContaining({ owner: 'mom', createdBy: 'admin', vault: 'never' }));

    const vault = res();
    await r.adminGiveProxyAccess(req('admin', { params: { username: 'mom' }, body: { proxy: 'jim', permissions: ['page-read', 'vault-proxy'] } }), vault);
    expect(vault.redirect).toHaveBeenCalledWith(expect.stringMatching(/error=.*never%20include%20access%20to%20their%20vaults/));
    expect(await am.listProxyGrants(req('admin').userContext as never, { asOwner: 'mom' })).toHaveLength(1);
  });

  test('a stale administrator is sent to confirm it is them; someone without user-edit is refused', async () => {
    const { r, rows } = routes();
    const stale = res();
    await r.adminGiveProxyAccess(req('admin', { params: { username: 'mom' }, body: { proxy: 'jim', permissions: ['page-read'] } }, false), stale);
    expect(stale.redirect).toHaveBeenCalledWith('/auth/reauth?next=%2Fprofile');
    const notAdmin = res();
    await r.adminGiveProxyAccess(req('jim', { params: { username: 'mom' }, body: { proxy: 'jim', permissions: ['page-read'] } }), notAdmin);
    expect(notAdmin.status).toHaveBeenCalledWith(403);
    expect(rows.size).toBe(0);
  });

  test('revokes one of the person\'s grants', async () => {
    const { r, am } = routes();
    const made = await am.grantProxy(req('mom').userContext, { owner: 'mom', proxy: 'jim', permissions: ['page-read'] });
    const out = res();
    await r.adminRevokeProxyAccess(req('admin', { params: { username: 'mom', id: made.id } }), out);
    expect(out.redirect).toHaveBeenCalledWith('/admin/users/mom/edit?success=Access+revoked#proxy-access');
    expect(am.liveProxyGrant(made.id)).toBeNull();
  });
});

describe('#1762 slice 7 — the cards', () => {
  const card = (r: unknown, q: unknown, owner: string, admin: boolean) =>
    (r as { proxyAccessCard(q: unknown, c: unknown, o: string, a: boolean): Promise<unknown> }).proxyAccessCard(q, (q as { userContext: unknown }).userContext, owner, admin);

  test('hidden while proxy access is off', async () => {
    const { r } = routes({ enabled: false });
    expect(await card(r, req('mom'), 'mom', false)).toBeUndefined();
    expect(await card(r, req('admin'), 'mom', true)).toBeUndefined();
  });

  test('the profile offers only what you hold, by label; the admin\'s form for someone never offers vault access', async () => {
    const { r } = routes();
    const own = await card(r, req('jim'), 'jim', false) as { options: Array<{ name: string; description: string }> };
    expect(own.options).toEqual([{ name: 'page-read', description: 'View pages' }, { name: 'proxy-grant', description: 'Let someone act for you, and stop them' }]);
    const mine = await card(r, req('mom'), 'mom', false) as { options: Array<{ name: string }> };
    expect(mine.options.map(o => o.name)).toEqual(['page-read', 'page-edit', 'proxy-grant', 'vault-proxy']);
    const admin = await card(r, req('admin'), 'mom', true) as { options: Array<{ name: string }>; actingFor: unknown[] };
    expect(admin.options.map(o => o.name)).toEqual(['page-read', 'page-edit', 'proxy-grant']);
    expect(admin.actingFor).toEqual([]);
    // Someone who may not manage that account gets no card.
    expect(await card(r, req('jim'), 'mom', true)).toBeUndefined();
  });

  test('"You can act for" lists the grants naming the signed-in person', async () => {
    const { r, am } = routes();
    await am.grantProxy(req('mom').userContext, { owner: 'mom', proxy: 'jim', permissions: ['page-read'] });
    const jim = await card(r, req('jim'), 'jim', false) as { actingFor: Array<{ owner: string }> };
    expect(jim.actingFor.map(g => g.owner)).toEqual(['mom']);
  });
});
