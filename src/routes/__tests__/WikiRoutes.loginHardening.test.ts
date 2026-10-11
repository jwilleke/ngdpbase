/**
 * Login hardening — open redirect (#1041) and session fixation (#1043).
 *
 * `safeRedirect` has its own unit tests; these pin that the login handler
 * actually CALLS it, and that the session ID changes before the identity is
 * written. A helper that exists but is not wired in fixes nothing, and that is
 * exactly the failure mode a unit test of the helper alone cannot see.
 *
 * Before the fix, verified against a running instance:
 *
 *   POST /login  redirect=//example.com/  →  Location: //example.com/
 */

import WikiRoutes from '../WikiRoutes';

const createMockRes = () => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis(),
  redirect: vi.fn().mockReturnThis(),
  render: vi.fn().mockReturnThis(),
  setHeader: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis()
});

/**
 * A session that behaves like express-session's: regenerate() replaces the
 * contents and hands back a fresh id, and save() invokes its callback.
 */
function createMockSession(id = 'attacker-planted-id') {
  const session: Record<string, unknown> = {
    id,
    csrfToken: 'pre-login-token',
    regenerate: vi.fn((cb: (err?: unknown) => void) => {
      // Mirror the real behaviour: everything on the old session is gone.
      delete session.username;
      delete session.isAuthenticated;
      delete session.csrfToken;
      session.id = 'regenerated-id';
      cb();
    }),
    save: vi.fn((cb: (err?: unknown) => void) => cb())
  };
  return session;
}

const createMockReq = (body: Record<string, unknown>, session: Record<string, unknown>) => ({
  body,
  params: {},
  query: {},
  session,
  path: '/login',
  originalUrl: '/login',
  protocol: 'http',
  get: vi.fn().mockReturnValue('localhost:3000'),
  userContext: null
});

let authManager: { authenticate: ReturnType<typeof vi.fn>; completeSignIn: ReturnType<typeof vi.fn> };

function makeRoutes(authSucceeds = true) {
  // #1758: the session work of a sign-in is AuthManager.completeSignIn's
  // (tested in AuthManager.completeSignIn.test.ts); here it only signs in.
  authManager = {
    authenticate: vi.fn().mockResolvedValue(
      authSucceeds ? { success: true, username: 'admin' } : { success: false }
    ),
    completeSignIn: vi.fn(async (req: { session: Record<string, unknown> }, result: { username: string }) => {
      req.session.username = result.username;
      req.session.isAuthenticated = true;
      return {};
    })
  };
  const engine = {
    getManager: vi.fn((name: string) => {
      if (name === 'AuthManager') return authManager;
      if (name === 'ConfigurationManager') {
        return { getProperty: vi.fn((_k: string, d: unknown) => d) };
      }
      if (name === 'UserManager') return { authenticateUser: vi.fn().mockResolvedValue(null), getUser: vi.fn().mockResolvedValue(null) };
      if (name === 'MetricsManager') return { recordLoginAttempt: vi.fn() };
      return null;
    })
  };
  return new WikiRoutes(engine) as unknown as {
    processLogin(req: unknown, res: unknown): Promise<void>;
  };
}

beforeEach(() => vi.clearAllMocks());

describe('login refuses an off-site redirect (#1041)', () => {
  test.each([
    ['//example.com/'],
    ['https://example.com/'],
    ['/\\example.com'],
    ['javascript:alert(1)']
  ])('a successful login with redirect=%s lands on /', async (target) => {
    const res = createMockRes();
    await makeRoutes().processLogin(
      createMockReq({ username: 'admin', password: 'pw', redirect: target }, createMockSession()),
      res
    );

    expect(res.redirect).toHaveBeenCalledWith('/');
  });

  test('an ordinary same-site redirect still works', async () => {
    const res = createMockRes();
    await makeRoutes().processLogin(
      createMockReq({ username: 'admin', password: 'pw', redirect: '/view/Welcome' }, createMockSession()),
      res
    );

    expect(res.redirect).toHaveBeenCalledWith('/view/Welcome');
  });

  test('the FAILED-login redirect cannot be used to bounce off-site either', async () => {
    // The failure path embeds the same value in its query string, so it is a
    // second sink for the same input — and one an attacker can reach without
    // knowing any password.
    const res = createMockRes();
    await makeRoutes(false).processLogin(
      createMockReq({ username: 'admin', password: 'wrong', redirect: '//example.com/' }, createMockSession()),
      res
    );

    const target = res.redirect.mock.calls[0][0] as string;
    expect(target).toContain('/login?error=');
    expect(target).not.toContain('example.com');
  });
});

// #1043: the regeneration itself (new id, identity written after it, a fresh
// CSRF token, a store that cannot regenerate) is AuthManager.completeSignIn's,
// and is tested there; the route hands every successful password sign-in to it.
describe('login completes through AuthManager.completeSignIn (#1043, #1758)', () => {
  test('a successful password sign-in is completed once, with the result and the password to unlock with', async () => {
    const session = createMockSession();
    const req = createMockReq({ username: 'admin', password: 'pw' }, session);
    await makeRoutes().processLogin(req, createMockRes());

    expect(authManager.completeSignIn).toHaveBeenCalledTimes(1);
    expect(authManager.completeSignIn).toHaveBeenCalledWith(
      req,
      expect.objectContaining({ success: true, username: 'admin' }),
      expect.objectContaining({ method: 'password', unlockWith: { password: req.body.password } })
    );
  });

  test('a refused sign-in is never completed', async () => {
    await makeRoutes(false).processLogin(
      createMockReq({ username: 'admin', password: 'wrong' }, createMockSession()),
      createMockRes()
    );
    expect(authManager.completeSignIn).not.toHaveBeenCalled();
  });
});
