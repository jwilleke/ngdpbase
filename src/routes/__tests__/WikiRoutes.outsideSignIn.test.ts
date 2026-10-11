/**
 * #1743 — the outside sign-in routes carry HTTP only; AuthManager decides.
 * Start: a provider that is not enabled is refused, an enabled one gets a
 * browser binding and goes to the provider. Callback: a sign-in completes
 * through completeSignIn, a refusal is neutral, a replay opens no second
 * session; a connection goes back to the profile with its outcome. Connect:
 * account-security, so a stale sign-in is sent to re-authenticate first.
 * Disconnect is the credential-removal route, whose last-way-in refusal is
 * shown.
 */
import WikiRoutes from '../WikiRoutes';
import AuthManager from '../../managers/AuthManager';
import { OAUTH_STATE_COOKIE } from '../../utils/magicLinkDeviceState';

const res = () => ({
  status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), redirect: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis(), render: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis(),
  cookie: vi.fn().mockReturnThis(), clearCookie: vi.fn().mockReturnThis()
});
const session = (): Record<string, unknown> => ({ username: 'ann', isAuthenticated: true, save: vi.fn((cb: (e?: unknown) => void) => cb()) });

function routes(opts: { stale?: boolean; connectFor?: string | null } = {}) {
  const authManager = {
    outsideProviders: vi.fn(() => [{ id: 'oidc:google', name: 'google', displayName: 'Google' }]),
    startFlow: vi.fn().mockResolvedValue('https://accounts.example/authorize?state=s1'),
    startConnect: vi.fn().mockResolvedValue('https://accounts.example/authorize?state=s2'),
    flowConnectsFor: vi.fn(() => opts.connectFor ?? null),
    getFlowRedirect: vi.fn(() => '/after'),
    authenticate: vi.fn().mockResolvedValue({ success: true, username: 'ann', provider: 'oidc:google', factors: [] }),
    consumeToken: vi.fn(() => true),
    completeSignIn: vi.fn().mockResolvedValue(undefined),
    connectIdentity: vi.fn().mockResolvedValue('connected'),
    removeCredential: vi.fn().mockResolvedValue(true),
    stepUpNeeded: vi.fn(() => Boolean(opts.stale)),
    engine: null as unknown,
    askForFreshSignIn(...a: Parameters<AuthManager['askForFreshSignIn']>) { return AuthManager.prototype.askForFreshSignIn.apply(this as never, a); },
    recordReauth: vi.fn().mockResolvedValue(undefined)
  };
  const managers: Record<string, unknown> = {
    AuthManager: authManager,
    PolicyDecisionPoint: {
      permits: vi.fn((s: { roles?: string[]; signIn?: unknown }, action: string) =>
        Promise.resolve(!authManager.stepUpNeeded(action, s.signIn, s.roles ?? [], false))),
      holds: vi.fn(() => Promise.resolve(true))
    },
    AuditManager: { logAuditEvent: vi.fn().mockResolvedValue('a'), logAuthentication: vi.fn().mockResolvedValue('a') },
    ConfigurationManager: { getProperty: (_k: string, d: unknown) => d }
  };
  const engine = { getManager: vi.fn((n: string) => managers[n] ?? null) };
  authManager.engine = engine;
  const r = new WikiRoutes(engine) as unknown as Record<string, (q: unknown, s: unknown) => Promise<void>>;
  return { r, authManager };
}

const req = (extra: Record<string, unknown> = {}) => ({
  session: session(), body: {}, ip: '1.2.3.4', headers: {}, query: {}, params: { name: 'google' }, method: 'POST',
  originalUrl: '/auth/oauth/google', cookies: { [OAUTH_STATE_COOKIE]: 'browser-a' },
  get: (h: string) => (h === 'referer' ? 'https://wiki.example.com/profile' : 'ua'),
  userContext: { username: 'ann', roles: ['reader'], isAuthenticated: true },
  ...extra
});

describe('outside sign-in routes (#1743)', () => {
  test('start: an enabled provider gets a browser binding and the provider\'s URL', async () => {
    const { r, authManager } = routes();
    const out = res();
    await r.startOutsideSignIn(req({ body: { redirect: '/wanted' } }), out);
    expect(out.cookie).toHaveBeenCalledWith(OAUTH_STATE_COOKIE, expect.any(String), expect.objectContaining({ httpOnly: true, sameSite: 'lax' }));
    const deviceState = out.cookie.mock.calls[0][1] as string;
    expect(authManager.startFlow).toHaveBeenCalledWith('oidc:google', { redirect: '/wanted', deviceState });
    expect(out.redirect).toHaveBeenCalledWith('https://accounts.example/authorize?state=s1');
  });

  test('start: a provider that is not enabled, or a name that cannot be one, is refused', async () => {
    const { r, authManager } = routes();
    for (const name of ['apple', '../admin', 'Google']) {
      const out = res();
      await r.startOutsideSignIn(req({ params: { name } }), out);
      expect(out.redirect).toHaveBeenCalledWith(expect.stringMatching(/^\/login\?error=/));
    }
    expect(authManager.startFlow).not.toHaveBeenCalled();
  });

  test('start: an outside redirect target is never kept', async () => {
    const { r, authManager } = routes();
    await r.startOutsideSignIn(req({ body: { redirect: 'https://evil.example/' } }), res());
    expect(authManager.startFlow).toHaveBeenCalledWith('oidc:google', expect.objectContaining({ redirect: '/' }));
  });

  test('callback: a connected identity signs in through the one completion step', async () => {
    const { r, authManager } = routes();
    const out = res();
    const q = req({ method: 'GET', query: { code: 'c1', state: 's1' } });
    await r.finishOutsideFlow(q, out);
    expect(authManager.authenticate).toHaveBeenCalledWith('oidc:google', { token: 'c1', state: 's1', deviceState: 'browser-a' }, expect.objectContaining({ purpose: 'sign-in' }));
    expect(out.clearCookie).toHaveBeenCalledWith(OAUTH_STATE_COOKIE, { path: '/' });
    expect(authManager.completeSignIn).toHaveBeenCalledWith(q, expect.objectContaining({ username: 'ann' }), { method: 'oidc:google' });
    expect(out.redirect).toHaveBeenCalledWith('/after');
  });

  test('callback: a refused sign-in is told neutrally, without saying whether an account exists', async () => {
    const { r, authManager } = routes();
    authManager.authenticate.mockResolvedValue({ success: false });
    const out = res();
    await r.finishOutsideFlow(req({ method: 'GET', query: { code: 'c1', state: 's1' } }), out);
    expect(authManager.completeSignIn).not.toHaveBeenCalled();
    const target = decodeURIComponent(String(out.redirect.mock.calls[0][0]));
    expect(target).toMatch(/^\/login\?error=That sign-in did not work\. If you have an account here/);
  });

  test('callback: a replayed state opens no second session', async () => {
    const { r, authManager } = routes();
    authManager.consumeToken.mockReturnValue(false);
    const out = res();
    await r.finishOutsideFlow(req({ method: 'GET', query: { code: 'c1', state: 's1' } }), out);
    expect(authManager.completeSignIn).not.toHaveBeenCalled();
  });

  test('callback: the provider\'s own error or a missing code goes back to the sign-in page', async () => {
    const { r, authManager } = routes();
    const out = res();
    await r.finishOutsideFlow(req({ method: 'GET', query: { error: 'access_denied', state: 's1' } }), out);
    expect(out.redirect).toHaveBeenCalledWith('/login?error=' + encodeURIComponent('Sign-in was cancelled'));
    expect(authManager.authenticate).not.toHaveBeenCalled();
  });

  test.each([
    ['connected', /^\/profile\?success=Connected/],
    ['already-yours', /^\/profile\?success=That account was already connected/],
    ['connected-elsewhere', /^\/profile\?error=That account is already connected to another account here/],
    ['refused', /^\/profile\?error=Connecting did not work/]
  ])('callback: a connection that ends %s goes back to the profile and never signs in', async (outcome, shown) => {
    const { r, authManager } = routes({ connectFor: 'ann' });
    authManager.connectIdentity.mockResolvedValue(outcome);
    const out = res();
    await r.finishOutsideFlow(req({ method: 'GET', query: { code: 'c1', state: 's2' } }), out);
    expect(authManager.connectIdentity).toHaveBeenCalledWith(expect.objectContaining({ username: 'ann' }), 'ann', 'oidc:google',
      { token: 'c1', state: 's2', deviceState: 'browser-a' }, expect.any(Object));
    expect(authManager.authenticate).not.toHaveBeenCalled();
    expect(authManager.completeSignIn).not.toHaveBeenCalled();
    expect(decodeURIComponent(String(out.redirect.mock.calls[0][0]))).toMatch(shown);
  });

  test('callback: a connection that throws (signed out, stale) is refused on the profile', async () => {
    const { r, authManager } = routes({ connectFor: 'ann' });
    authManager.connectIdentity.mockRejectedValue(new Error('Permission denied'));
    const out = res();
    await r.finishOutsideFlow(req({ method: 'GET', query: { code: 'c1', state: 's2' } }), out);
    expect(decodeURIComponent(String(out.redirect.mock.calls[0][0]))).toMatch(/^\/profile\?error=Connecting did not work/);
  });

  test('connect: a fresh sign-in starts a connection for the signed-in person', async () => {
    const { r, authManager } = routes();
    const out = res();
    await r.startOutsideConnect(req({ originalUrl: '/auth/oauth/google/connect' }), out);
    const deviceState = out.cookie.mock.calls[0][1] as string;
    expect(authManager.startConnect).toHaveBeenCalledWith(expect.objectContaining({ username: 'ann' }), 'ann', 'oidc:google', { redirect: '/profile', deviceState });
    expect(out.redirect).toHaveBeenCalledWith('https://accounts.example/authorize?state=s2');
  });

  test('connect: a stale sign-in is sent to re-authenticate first, and nothing starts', async () => {
    const { r, authManager } = routes({ stale: true });
    const out = res();
    await r.startOutsideConnect(req({ originalUrl: '/auth/oauth/google/connect' }), out);
    expect(out.redirect).toHaveBeenCalledWith('/auth/reauth?next=%2Fprofile');
    expect(authManager.startConnect).not.toHaveBeenCalled();
    expect(out.cookie).not.toHaveBeenCalled();
  });

  test('disconnect: the credential-removal route, whose last-way-in refusal is shown', async () => {
    const { r, authManager } = routes();
    const out = res();
    await r.removeOwnCredential(req({ params: { id: 'row-1' } }), out);
    expect(authManager.removeCredential).toHaveBeenCalledWith(expect.objectContaining({ username: 'ann' }), 'ann', 'row-1');
    expect(out.redirect).toHaveBeenCalledWith('/profile?success=Credential+removed');

    authManager.removeCredential.mockRejectedValue(new Error('This is the last way into the account; add another before removing it'));
    const refused = res();
    await r.removeOwnCredential(req({ params: { id: 'row-1' } }), refused);
    expect(decodeURIComponent(String(refused.redirect.mock.calls[0][0]))).toMatch(/last way into the account/);
  });
});
