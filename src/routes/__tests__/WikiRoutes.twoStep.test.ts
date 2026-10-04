/**
 * #1523 — two-step sign-in at the routes: a correct password for someone with
 * a second factor enrolled creates no session identity, only a pending
 * sign-in bound to this browser; completion makes the session with both
 * factors; "this wasn't me" counts as a failed sign-in.
 */
import WikiRoutes from '../WikiRoutes';

const res = () => ({
  status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), redirect: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis(),
  render: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis(), cookie: vi.fn().mockReturnThis(), clearCookie: vi.fn().mockReturnThis()
});
const session = (): Record<string, unknown> => ({
  regenerate: vi.fn((cb: () => void) => cb()),
  save: vi.fn((cb: (e?: unknown) => void) => cb())
});

function routes(authManager: Record<string, unknown>) {
  const authLog: Array<unknown[]> = [];
  const managers: Record<string, unknown> = {
    AuthManager: authManager,
    ConfigurationManager: { getProperty: (_k: string, d: unknown) => d, getResolvedDataPath: undefined },
    UserManager: { getUser: vi.fn().mockResolvedValue({ sessionGeneration: 0 }) },
    AuditManager: { logAuthentication: vi.fn((...a: unknown[]) => { authLog.push(a); return Promise.resolve('a'); }), logAuditEvent: vi.fn().mockResolvedValue('a') }
  };
  const engine = { getManager: vi.fn((n: string) => managers[n] ?? null) };
  const r = new WikiRoutes(engine) as unknown as Record<string, (q: unknown, s: unknown) => Promise<void>>;
  (r as unknown as { getCommonTemplateData: () => Promise<Record<string, unknown>> }).getCommonTemplateData = () => Promise.resolve({ csrfToken: 't' });
  return { r, authLog };
}

const req = (s: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  session: s, body: {}, ip: '1.2.3.4', headers: {}, query: {}, params: {}, cookies: {}, secure: true, get: () => 'Chrome', ...extra
});

describe('two-step sign-in routes (#1523)', () => {
  test('a correct password with a second factor enrolled: no identity on the session, a pending sign-in bound to this browser', async () => {
    const beginTwoStep = vi.fn(() => 'h1');
    const { r } = routes({
      authenticate: vi.fn().mockResolvedValue({ success: true, username: 'molly', provider: 'password', factors: [] }),
      secondFactorsFor: vi.fn(() => [{ id: 'email-link', label: 'Email link', target: 'm***@example.com' }]),
      beginTwoStep
    });
    const s = session();
    const out = res();
    await r.processLogin(req(s, { body: { username: 'molly', password: '', redirect: '/view/Home' } }), out);
    expect(s.username).toBeUndefined();
    expect(s.isAuthenticated).toBeUndefined();
    expect(s.pendingSignIn).toBe('h1');
    expect(s.pendingRedirect).toBe('/view/Home');
    expect(out.cookie).toHaveBeenCalledWith('ngdp_two_step', expect.any(String), expect.objectContaining({ httpOnly: true, path: '/login' }));
    const binding = (out.cookie.mock.calls[0] as unknown[])[1];
    expect(beginTwoStep).toHaveBeenCalledWith(expect.objectContaining({ username: 'molly' }), expect.objectContaining({ binding }));
    expect(out.redirect).toHaveBeenCalledWith('/login/second-factor');
  });

  test('no second factor enrolled: the sign-in is one step, as before', async () => {
    const { r } = routes({
      authenticate: vi.fn().mockResolvedValue({ success: true, username: 'molly', provider: 'password', factors: [] }),
      secondFactorsFor: vi.fn(() => []),
      signInRecord: vi.fn(() => ({ provider: 'password', factors: [], amr: ['pwd'], aal: 1, acr: 'aal1', mfa: false, at: 'now' }))
    });
    const s = session();
    const out = res();
    await r.processLogin(req(s, { body: { username: 'molly', password: '', redirect: '/view/Home' } }), out);
    expect(s.username).toBe('molly');
    expect(out.redirect).toHaveBeenCalledWith('/view/Home');
  });

  test('completion: the approved sign-in becomes a session with both factors and its held keys', async () => {
    const { r, authLog } = routes({
      pendingSignIn: vi.fn(() => ({ handle: 'h1', binding: 'b1', username: 'molly' })),
      completeTwoStep: vi.fn(() => ({ result: { success: true, username: 'molly', provider: 'password', factors: [{ provider: 'password' }, { provider: 'email-link' }] }, privateStoreHandle: 'psh' })),
      signInRecord: vi.fn((r: { factors: unknown[] }) => ({ provider: 'password', factors: r.factors, amr: ['pwd', 'email'], aal: 1, acr: 'aal1', mfa: true, at: 'now' }))
    });
    const s = session();
    s.pendingSignIn = 'h1';
    s.pendingRedirect = '/view/Home';
    const out = res();
    await r.secondFactorComplete(req(s, { cookies: { ngdp_two_step: 'b1' } }), out);
    expect(s).toEqual(expect.objectContaining({ username: 'molly', isAuthenticated: true, privateStoreHandle: 'psh', signIn: expect.objectContaining({ amr: ['pwd', 'email'] }) }));
    expect(out.clearCookie).toHaveBeenCalledWith('ngdp_two_step', { path: '/login' });
    expect(out.redirect).toHaveBeenCalledWith('/view/Home');
    expect(authLog.some((a) => a[1] === 'success' && a[2] === 'password and email link')).toBe(true);
  });

  test('completion before approval goes back to the waiting page', async () => {
    const { r } = routes({ pendingSignIn: vi.fn(() => ({ handle: 'h1', binding: 'b1' })), completeTwoStep: vi.fn(() => null) });
    const s = session();
    const out = res();
    await r.secondFactorComplete(req(s, { cookies: { ngdp_two_step: 'b1' } }), out);
    expect(s.username).toBeUndefined();
    expect(out.redirect).toHaveBeenCalledWith('/login/second-factor');
  });

  test('"this wasn\'t me" is recorded as a failed sign-in', async () => {
    const { r, authLog } = routes({ denyByToken: vi.fn(() => 'molly') });
    const out = res();
    await r.approveDecision(req(session(), { body: { t: 'tok', decision: 'deny' } }), out);
    expect(out.render).toHaveBeenCalledWith('login-approve', expect.objectContaining({ outcome: 'refused' }));
    expect(authLog.some((a) => a[1] === 'failure')).toBe(true);
  });

  test('opening the link changes nothing: the page only shows the details', async () => {
    const approveByToken = vi.fn();
    const { r } = routes({ approvalDetails: vi.fn(() => ({ username: 'molly', requestedAt: 0 })), approveByToken });
    const out = res();
    await r.approvePage(req(session(), { query: { t: 'tok' } }), out);
    expect(approveByToken).not.toHaveBeenCalled();
    expect(out.render).toHaveBeenCalledWith('login-approve', expect.objectContaining({ token: 'tok', details: expect.objectContaining({ username: 'molly' }) }));
  });
});
