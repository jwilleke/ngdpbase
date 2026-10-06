/**
 * #1525, #1635 — step-up decided by the PDP, answered at the route: a permission marked step-up,
 * granted by policy, still needs a fresh factor. A stale page action goes to
 * /auth/reauth and back; a JSON action is told where; a delegated credential
 * is refused; a fresh session proceeds. The password re-authentication is
 * throttled, audited, and stamps the session's sign-in.
 */
import WikiRoutes from '../WikiRoutes';

const res = () => ({
  status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), redirect: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis(), render: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis()
});
const session = (): Record<string, unknown> => ({ username: 'molly', isAuthenticated: true, save: vi.fn((cb: (e?: unknown) => void) => cb()) });

function routes(needed: boolean, authenticate: (id: string, c: unknown) => Promise<unknown> = () => Promise.resolve({ success: false })) {
  const audit: Array<Record<string, unknown>> = [];
  const authManager = {
    stepUpNeeded: vi.fn(() => needed),
    renameCredential: vi.fn().mockResolvedValue(true),
    passkeyAuthenticationOptions: vi.fn().mockResolvedValue({ challenge: 'c1' }),
    passkeyRegistrationOptions: vi.fn().mockResolvedValue({ challenge: 'r1' }),
    authenticate: vi.fn(authenticate),
    reauthenticated: vi.fn(() => ({ provider: 'password', factors: [], amr: ['pwd'], aal: 1, acr: 'aal1', mfa: false, at: 'now' })),
    requiredAalFor: vi.fn(() => 1),
    passkeyRelyingParty: vi.fn(() => null),
    hasCredential: vi.fn(() => false)
  };
  const oidc = { revokeGrant: vi.fn().mockResolvedValue(true) };
  const managers: Record<string, unknown> = {
    OidcManager: oidc,
    AuthManager: authManager,
    // #1635: the PDP decides step-up. This double grants by policy and asks
    // AuthManager about freshness exactly as the real PDP does; `holds` is the
    // policy-only question affordances ask.
    PolicyDecisionPoint: {
      permits: vi.fn((subject: { roles?: string[]; signIn?: unknown; viaToken?: unknown; viaShare?: unknown }, action: string) =>
        Promise.resolve(!authManager.stepUpNeeded(action, subject.signIn, subject.roles ?? [], Boolean(subject.viaToken || subject.viaShare)))),
      holds: vi.fn(() => Promise.resolve(true))
    },
    AuditManager: { logAuditEvent: (e: Record<string, unknown>) => { audit.push(e); return Promise.resolve('a'); }, logAuthentication: vi.fn().mockResolvedValue('a') },
    UserManager: { hasPassword: vi.fn().mockResolvedValue(true), getUser: vi.fn().mockResolvedValue({ username: 'molly' }) },
    ConfigurationManager: { getProperty: (_k: string, d: unknown) => d }
  };
  const engine = { getManager: vi.fn((n: string) => managers[n] ?? null) };
  const r = new WikiRoutes(engine) as unknown as Record<string, (q: unknown, s: unknown) => Promise<void>> & { getCommonTemplateData: unknown };
  (r as unknown as { getCommonTemplateData: () => Promise<Record<string, unknown>> }).getCommonTemplateData = () => Promise.resolve({ csrfToken: 't' });
  return { r, authManager, audit, oidc };
}

const req = (s: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  session: s, body: {}, ip: '1.2.3.4', headers: {}, query: {}, params: { id: 'cred-1' }, method: 'POST', originalUrl: '/profile/credentials/cred-1/rename',
  get: (h: string) => (h === 'referer' ? 'https://wiki.example.com/profile' : 'ua'),
  userContext: { username: 'molly', roles: ['reader'], isAuthenticated: true },
  ...extra
});

describe('step-up at the route door (#1525)', () => {
  test('a stale session on a page action goes to /auth/reauth and back to the page that posted', async () => {
    const { r, authManager, audit } = routes(true);
    const out = res();
    await r.renameOwnCredential(req(session(), { body: { label: 'Phone' } }), out);
    expect(out.redirect).toHaveBeenCalledWith('/auth/reauth?next=%2Fprofile');
    expect(authManager.renameCredential).not.toHaveBeenCalled();
    expect(audit).toContainEqual(expect.objectContaining({ eventType: 'reauth-prompt', resource: 'account-security' }));
  });

  test('a JSON action is told where to re-authenticate', async () => {
    const { r } = routes(true);
    const out = res();
    await r.passkeyRegisterOptions(req(session(), { method: 'GET', originalUrl: '/auth/passkey/register/options' }), out);
    expect(out.status).toHaveBeenCalledWith(403);
    expect(out.json).toHaveBeenCalledWith(expect.objectContaining({ reauth: '/auth/reauth?next=%2Fauth%2Fpasskey%2Fregister%2Foptions' }));
  });

  test('a delegated credential is refused outright, never sent to a prompt', async () => {
    const { r, authManager } = routes(true);
    const out = res();
    await r.renameOwnCredential(req(session(), { userContext: { username: 'molly', roles: ['reader'], isAuthenticated: true, viaToken: { id: 't', name: 'bot', scopes: ['account-security'] } } }), out);
    expect(authManager.stepUpNeeded).toHaveBeenCalledWith('account-security', undefined, ['reader'], true);
    expect(out.status).toHaveBeenCalledWith(403);
    expect(out.redirect).not.toHaveBeenCalled();
  });

  test('a fresh session proceeds', async () => {
    const { r, authManager } = routes(false);
    const out = res();
    await r.renameOwnCredential(req(session(), { body: { label: 'Phone' } }), out);
    expect(authManager.renameCredential).toHaveBeenCalled();
    expect(out.redirect).toHaveBeenCalledWith('/profile?success=Renamed');
  });
});

describe('re-authentication with the password (#1525)', () => {
  test('a wrong password is refused, audited, and counted by the throttle', async () => {
    const { r, audit } = routes(false, () => Promise.resolve({ success: false }));
    const out = res();
    await r.reauthWithPassword(req(session(), { body: { password: 'nope', next: '/profile' } }), out);
    expect(out.status).toHaveBeenCalledWith(401);
    expect(out.render).toHaveBeenCalledWith('reauth', expect.objectContaining({ error: 'That password is not correct.' }));
    expect(audit).toContainEqual(expect.objectContaining({ eventType: 'reauth-failure', result: 'failure' }));
  });

  test('the right password stamps the session\'s sign-in and returns to the page', async () => {
    const { r, authManager, audit } = routes(false, () => Promise.resolve({ success: true, username: 'molly', provider: 'password', factors: [] }));
    const s = session();
    const out = res();
    await r.reauthWithPassword(req(s, { body: { password: 'right', next: '/profile' } }), out);
    expect(authManager.reauthenticated).toHaveBeenCalled();
    expect(s.signIn).toEqual(expect.objectContaining({ at: 'now' }));
    expect(out.redirect).toHaveBeenCalledWith('/profile');
    expect(audit).toContainEqual(expect.objectContaining({ eventType: 'reauth-success', result: 'success' }));
  });

  test('someone else\'s password does not re-authenticate this session', async () => {
    const { r, authManager } = routes(false, () => Promise.resolve({ success: true, username: 'sam', provider: 'password', factors: [] }));
    const out = res();
    await r.reauthWithPassword(req(session(), { body: { password: 'x', next: '/profile' } }), out);
    expect(authManager.reauthenticated).not.toHaveBeenCalled();
    expect(out.status).toHaveBeenCalledWith(401);
  });

  test('a next outside this site is never followed', async () => {
    const { r } = routes(false, () => Promise.resolve({ success: true, username: 'molly', provider: 'password', factors: [] }));
    const out = res();
    await r.reauthWithPassword(req(session(), { body: { password: 'right', next: 'https://evil.example/' } }), out);
    expect(out.redirect).toHaveBeenCalledWith('/');
  });
});

describe('revoking an approved app (#1601)', () => {
  test('asks account-security, so a stale session is sent to re-authenticate first', async () => {
    const { r, oidc } = routes(true);
    const out = res();
    await r.revokeOwnApp(req(session(), { params: { grantId: 'g1' }, originalUrl: '/profile/apps/g1/revoke' }), out);
    expect(out.redirect).toHaveBeenCalledWith('/auth/reauth?next=%2Fprofile');
    expect(oidc.revokeGrant).not.toHaveBeenCalled();
  });

  test('a fresh session revokes its own grant, by its own username', async () => {
    const { r, oidc } = routes(false);
    const out = res();
    await r.revokeOwnApp(req(session(), { params: { grantId: 'g1' } }), out);
    expect(oidc.revokeGrant).toHaveBeenCalledWith('molly', 'g1');
    expect(out.redirect).toHaveBeenCalledWith('/profile?success=Access+revoked');
  });
});

