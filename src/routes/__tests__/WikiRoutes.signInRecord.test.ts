/**
 * #1523 — a password sign-in records on the session how it signed in: the
 * provider, the factors with their times, and what they amount to. A failed
 * sign-in records nothing. Uses the real AuthManager.signInRecord over a
 * mocked authenticate().
 */
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import WikiRoutes from '../WikiRoutes';
import AuthManager from '../../managers/AuthManager';

const res = () => ({
  status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis(),
  redirect: vi.fn().mockReturnThis(), render: vi.fn().mockReturnThis(), setHeader: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis()
});

function session(): Record<string, unknown> {
  const s: Record<string, unknown> = {
    id: 'sid',
    regenerate: vi.fn((cb: (err?: unknown) => void) => cb()),
    save: vi.fn((cb: (err?: unknown) => void) => cb()),
    destroy: vi.fn((cb: (err?: unknown) => void) => cb())
  };
  return s;
}

const req = (s: Record<string, unknown>) => ({
  body: { username: 'molly', password: 'pw' }, params: {}, query: {}, session: s,
  get sessionID() { return s.id; }, path: '/login', originalUrl: '/login', protocol: 'http',
  get: vi.fn().mockReturnValue('localhost:3000'), userContext: null
});

describe('sign-in recorded on the session (#1523)', () => {
  let tmp: string;
  beforeEach(async () => { tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'signin-1523-')); });
  afterEach(async () => { vi.restoreAllMocks(); await fs.remove(tmp); });

  const routesWith = (authResult: Record<string, unknown>) => {
    const real = new AuthManager({ getManager: () => null });
    const authManager = {
      authenticate: vi.fn().mockResolvedValue(authResult),
      signInRecord: (r: never) => real.signInRecord(r)
    };
    const engine = {
      getManager: vi.fn((name: string) => {
        if (name === 'AuthManager') return authManager;
        if (name === 'ConfigurationManager') return { getProperty: (_k: string, d: unknown) => d, getResolvedDataPath: (_k: string, d: string) => (_k.includes('storagedir') ? tmp : d) };
        if (name === 'UserManager') return { authenticateUser: vi.fn().mockResolvedValue(null), getUser: vi.fn().mockResolvedValue(null) };
        if (name === 'MetricsManager') return { recordLoginAttempt: vi.fn() };
        if (name === 'AuditManager') return { logAuthentication: vi.fn().mockResolvedValue('a') };
        return null;
      })
    };
    return new WikiRoutes(engine) as unknown as { processLogin(q: unknown, r: unknown): Promise<void> };
  };

  test('a password sign-in stores provider, factors with times, and the assessment', async () => {
    const s = session();
    await routesWith({
      success: true, username: 'molly', provider: 'password',
      factors: [{ provider: 'password', amr: ['pwd'], aal: 1, at: '2026-10-02T20:00:00.000Z' }]
    }).processLogin(req(s), res());
    expect(s.isAuthenticated).toBe(true);
    expect(s.signIn).toEqual({
      provider: 'password',
      factors: [{ provider: 'password', amr: ['pwd'], aal: 1, at: '2026-10-02T20:00:00.000Z' }],
      amr: ['pwd'], aal: 1, acr: 'aal1', mfa: false,
      at: expect.any(String)
    });
  });

  test('a failed sign-in records nothing', async () => {
    const s = session();
    await routesWith({ success: false }).processLogin(req(s), res());
    expect(s.signIn).toBeUndefined();
  });
});
