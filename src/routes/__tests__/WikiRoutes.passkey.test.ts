/**
 * #448 — the passkey routes: the challenge is single-use, short-lived and tied
 * to its purpose; a successful sign-in takes the same steps as every other
 * path; a failed one is audited and starts no session.
 */
import WikiRoutes from '../WikiRoutes';

const res = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), redirect: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis(), render: vi.fn().mockReturnThis() });
const session = (): Record<string, unknown> => {
  const s: Record<string, unknown> = { regenerate: vi.fn((cb: () => void) => cb()), save: vi.fn((cb: (e?: unknown) => void) => cb()) };
  return s;
};

function routes(authenticate: (id: string, c: unknown) => Promise<unknown>) {
  const audit = vi.fn().mockResolvedValue('a');
  const authManager = {
    passkeyAuthenticationOptions: vi.fn().mockResolvedValue({ challenge: 'chal-1', rpId: 'wiki.example.com' }),
    authenticate: vi.fn(authenticate),
    signInRecord: vi.fn(() => ({ provider: 'passkey', factors: [], amr: ['swk', 'user'], aal: 2, acr: 'phr', mfa: false, at: 't' }))
  };
  const engine = {
    getManager: vi.fn((n: string) => (n === 'AuthManager' ? authManager
      : n === 'AuditManager' ? { logAuthentication: audit }
        : n === 'UserManager' ? { getUser: vi.fn().mockResolvedValue({ sessionGeneration: 3 }) }
          : n === 'ConfigurationManager' ? { getProperty: (_k: string, d: unknown) => d } : null))
  };
  return { r: new WikiRoutes(engine) as unknown as Record<string, (q: unknown, s: unknown) => Promise<void>>, authManager, audit };
}

const req = (s: Record<string, unknown>, body: unknown = {}) => ({ session: s, body, ip: '1.2.3.4', get: () => 'ua', headers: {}, query: {}, params: {} });

describe('passkey routes (#448)', () => {
  test('options keep the challenge for one sign-in', async () => {
    const { r } = routes(() => Promise.resolve({ success: false }));
    const s = session();
    await r.passkeyAuthenticateOptions(req(s), res());
    expect(s.passkeyChallenge).toEqual(expect.objectContaining({ value: 'chal-1', purpose: 'authenticate' }));
  });

  test('a successful sign-in: the kept challenge is used once, and the session is established like every other path', async () => {
    const { r, authManager } = routes(() => Promise.resolve({ success: true, username: 'molly', provider: 'passkey', factors: [] }));
    const s = session();
    await r.passkeyAuthenticateOptions(req(s), res());
    const out = res();
    await r.passkeyAuthenticateVerify(req(s, { response: { id: 'cred' }, redirect: '/view/Home' }), out);
    expect(authManager.authenticate).toHaveBeenCalledWith('passkey', { webauthn: { response: { id: 'cred' }, expectedChallenge: 'chal-1' } });
    expect(s).toEqual(expect.objectContaining({ username: 'molly', isAuthenticated: true, sessionGeneration: 3, signIn: expect.objectContaining({ provider: 'passkey', aal: 2 }) }));
    expect(s.passkeyChallenge).toBeUndefined();
    expect(out.json).toHaveBeenCalledWith({ ok: true, redirect: '/view/Home' });
  });

  test('no kept challenge (expired, used, or never asked): refused before any verification', async () => {
    const { r, authManager } = routes(() => Promise.resolve({ success: true, username: 'molly' }));
    const out = res();
    await r.passkeyAuthenticateVerify(req(session(), { response: {} }), out);
    expect(out.status).toHaveBeenCalledWith(400);
    expect(authManager.authenticate).not.toHaveBeenCalled();
  });

  test('an expired challenge is refused', async () => {
    const { r, authManager } = routes(() => Promise.resolve({ success: true, username: 'molly' }));
    const s = session();
    s.passkeyChallenge = { value: 'old', purpose: 'authenticate', expires: Date.now() - 1 };
    const out = res();
    await r.passkeyAuthenticateVerify(req(s, { response: {} }), out);
    expect(out.status).toHaveBeenCalledWith(400);
    expect(authManager.authenticate).not.toHaveBeenCalled();
  });

  test('an enrolment challenge cannot be spent on a sign-in', async () => {
    const { r, authManager } = routes(() => Promise.resolve({ success: true, username: 'molly' }));
    const s = session();
    s.passkeyChallenge = { value: 'enrol', purpose: 'register', expires: Date.now() + 60_000 };
    await r.passkeyAuthenticateVerify(req(s, { response: {} }), res());
    expect(authManager.authenticate).not.toHaveBeenCalled();
  });

  test('a failed sign-in is audited and starts no session', async () => {
    const { r, audit } = routes(() => Promise.resolve({ success: false }));
    const s = session();
    await r.passkeyAuthenticateOptions(req(s), res());
    const out = res();
    await r.passkeyAuthenticateVerify(req(s, { response: { id: 'x' } }), out);
    expect(out.status).toHaveBeenCalledWith(401);
    expect(s.isAuthenticated).toBeUndefined();
    expect(audit).toHaveBeenCalledWith(expect.anything(), 'failure', 'passkey');
  });
});
