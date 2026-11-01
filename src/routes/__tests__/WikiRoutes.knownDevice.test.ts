/**
 * #1523 slice 1c — the remembered-browser routes carry HTTP only; AuthManager
 * decides. Remember: single use, only within the offer made by a completed
 * second factor, under the person's own profile-manage, length-limited, and a
 * CSRF-protected POST. Device proof: only for this browser's pending sign-in,
 * length-limited. Remove: always the signed-in person's own account, whatever
 * id is posted; AuthManager refuses a row that is not theirs.
 */
import WikiRoutes from '../WikiRoutes';
import express, { type Request as ExpressRequest, type Response as ExpressResponse, type NextFunction } from 'express';
import request from 'supertest';
import { csrfMiddleware } from '../../middleware/csrf';
import { csrfTestSessionFields, csrfTestBodyField } from '../../middleware/__tests__/__fixtures__/csrfTestHelpers';

const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const res = () => ({
  status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), redirect: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis(), render: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis(),
  cookie: vi.fn().mockReturnThis(), clearCookie: vi.fn().mockReturnThis()
});
const offer = (extra: Record<string, unknown> = {}) => ({ version: '1', amr: ['pwd', 'email'], next: '/view/Home', until: Date.now() + 60_000, ...extra });

function routes(opts: { mayManage?: boolean; pending?: boolean } = {}) {
  const authManager = {
    rememberBrowser: vi.fn().mockResolvedValue({ deviceId: 'dev-1' }),
    proveKnownDevice: vi.fn().mockResolvedValue(true),
    pendingSignIn: vi.fn(() => (opts.pending === false ? null : { handle: 'h', binding: 'b' })),
    removeCredential: vi.fn().mockResolvedValue(true),
    stepUpNeeded: vi.fn(() => false)
  };
  const permits = vi.fn((s: { isAuthenticated?: boolean }, action: string) =>
    Promise.resolve(s.isAuthenticated !== false && (opts.mayManage !== false || action !== 'profile-manage')));
  const managers: Record<string, unknown> = {
    AuthManager: authManager,
    PolicyDecisionPoint: { permits, holds: permits },
    AuditManager: { logAuditEvent: vi.fn().mockResolvedValue('a'), logAuthentication: vi.fn().mockResolvedValue('a') },
    ConfigurationManager: { getProperty: (_k: string, d: unknown) => d },
    UserManager: { getUser: vi.fn((u: string) => Promise.resolve({ username: u })) }
  };
  const engine = { getManager: vi.fn((n: string) => managers[n] ?? null) };
  const r = new WikiRoutes(engine) as unknown as Record<string, (q: unknown, s: unknown) => Promise<void>>;
  (r as unknown as { getCommonTemplateData: () => Promise<Record<string, unknown>> }).getCommonTemplateData = () => Promise.resolve({});
  return { r, authManager };
}

const req = (extra: Record<string, unknown> = {}) => {
  const session = { username: 'ann', isAuthenticated: true, pendingSignIn: 'h', save: vi.fn((cb: (e?: unknown) => void) => cb()), ...((extra.session as object | undefined) ?? {}) };
  return {
    body: {}, ip: '203.0.113.9', headers: {}, query: {}, params: {}, method: 'POST', originalUrl: '/login/remember-browser',
    cookies: { ngdp_two_step: 'b' },
    get: (h: string) => (h.toLowerCase() === 'user-agent' ? CHROME_WIN : h.toLowerCase() === 'sec-ch-ua-platform' ? '"Windows"' : undefined),
    userContext: { username: 'ann', roles: ['reader'], isAuthenticated: true },
    ...extra,
    session
  };
};

describe('remembered-browser routes (#1523 slice 1c)', () => {
  test('remember: saved within the offer, with its version and amr and this browser, and the offer is spent', async () => {
    const { r, authManager } = routes();
    const q = req({ body: { publicKey: 'spki' }, session: { rememberBrowser: offer() } });
    const out = res();
    await r.rememberBrowserSave(q, out);
    expect(authManager.rememberBrowser).toHaveBeenCalledWith(expect.objectContaining({ username: 'ann' }), {
      publicKey: 'spki', version: '1', amr: ['pwd', 'email'], userAgent: CHROME_WIN, platformHint: '"Windows"'
    });
    expect(out.json).toHaveBeenCalledWith({ ok: true, deviceId: 'dev-1' });
    expect(q.session).not.toHaveProperty('rememberBrowser');

    const again = res();
    await r.rememberBrowserSave(q, again);
    expect(again.status).toHaveBeenCalledWith(400);
    expect(authManager.rememberBrowser).toHaveBeenCalledTimes(1);
  });

  test('remember: refused with no offer, an expired one, an oversized key, or without profile-manage', async () => {
    const cases = [
      { session: {}, body: { publicKey: 'spki' } },
      { session: { rememberBrowser: offer({ until: Date.now() - 1 }) }, body: { publicKey: 'spki' } },
      { session: { rememberBrowser: offer() }, body: { publicKey: 'x'.repeat(401) } },
      { session: { rememberBrowser: offer() }, body: {} }
    ];
    for (const c of cases) {
      const { r, authManager } = routes();
      const out = res();
      await r.rememberBrowserSave(req(c), out);
      expect(out.status).toHaveBeenCalledWith(400);
      expect(authManager.rememberBrowser).not.toHaveBeenCalled();
    }
    const { r, authManager } = routes({ mayManage: false });
    await r.rememberBrowserSave(req({ session: { rememberBrowser: offer() }, body: { publicKey: 'spki' } }), res());
    expect(authManager.rememberBrowser).not.toHaveBeenCalled();
  });

  test('remember and device proof are CSRF-protected POSTs: without the token nothing is called', async () => {
    const { r, authManager } = routes();
    const session: Record<string, unknown> = { ...csrfTestSessionFields(), username: 'ann', isAuthenticated: true, pendingSignIn: 'h', save: (cb: () => void) => cb() };
    const app = express();
    app.use(express.json());
    app.use((q: ExpressRequest, _s: ExpressResponse, next: NextFunction) => {
      Object.assign(q, { session, cookies: { ngdp_two_step: 'b' }, userContext: { username: 'ann', roles: ['reader'], isAuthenticated: true } });
      next();
    });
    app.use(csrfMiddleware);
    app.post('/login/remember-browser', (q: ExpressRequest, s: ExpressResponse) => void r.rememberBrowserSave(q, s));
    app.post('/login/second-factor/device', (q: ExpressRequest, s: ExpressResponse) => void r.secondFactorDevice(q, s));

    session.rememberBrowser = offer();
    await request(app).post('/login/remember-browser').send({ publicKey: 'spki' }).expect(403);
    await request(app).post('/login/second-factor/device').send({ deviceId: 'dev-1', signature: 'sig' }).expect(403);
    expect(authManager.rememberBrowser).not.toHaveBeenCalled();
    expect(authManager.proveKnownDevice).not.toHaveBeenCalled();

    await request(app).post('/login/remember-browser').send({ publicKey: 'spki', ...csrfTestBodyField() }).expect(200, { ok: true, deviceId: 'dev-1' });
    await request(app).post('/login/second-factor/device').send({ deviceId: 'dev-1', signature: 'sig', ...csrfTestBodyField() }).expect(200, { ok: true });
  });

  test('device proof: only for this browser\'s pending sign-in, length-limited', async () => {
    const { r, authManager } = routes({ pending: false });
    const none = res();
    await r.secondFactorDevice(req({ body: { deviceId: 'dev-1', signature: 'sig' } }), none);
    expect(none.status).toHaveBeenCalledWith(400);

    const ok = routes();
    for (const body of [{ deviceId: 'd'.repeat(101), signature: 'sig' }, { deviceId: 'dev-1', signature: 's'.repeat(201) }, { deviceId: 'dev-1' }]) {
      const out = res();
      await ok.r.secondFactorDevice(req({ body }), out);
      expect(out.status).toHaveBeenCalledWith(400);
    }
    expect(ok.authManager.proveKnownDevice).not.toHaveBeenCalled();
    expect(authManager.proveKnownDevice).not.toHaveBeenCalled();
  });

  test("remove: always the signed-in person's own account; another person's row is refused by AuthManager", async () => {
    const { r, authManager } = routes();
    authManager.removeCredential.mockResolvedValue(false);
    const out = res();
    await r.removeOwnCredential(req({ params: { id: 'bobs-device' }, body: { username: 'bob' } }), out);
    expect(authManager.removeCredential).toHaveBeenCalledWith(expect.objectContaining({ username: 'ann' }), 'ann', 'bobs-device');
    expect(out.redirect).toHaveBeenCalledWith('/profile?error=Credential+not+found');
  });
});
