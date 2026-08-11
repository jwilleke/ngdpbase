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

function makeRoutes(authSucceeds = true) {
  const engine = {
    getManager: vi.fn((name: string) => {
      if (name === 'AuthManager') {
        return {
          authenticate: vi.fn().mockResolvedValue(
            authSucceeds ? { success: true, username: 'admin' } : { success: false }
          )
        };
      }
      if (name === 'ConfigurationManager') {
        return { getProperty: vi.fn((_k: string, d: unknown) => d) };
      }
      if (name === 'UserManager') return { authenticateUser: vi.fn().mockResolvedValue(null) };
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

describe('login regenerates the session (#1043)', () => {
  test('the pre-login session ID does not survive authentication', async () => {
    const session = createMockSession('attacker-planted-id');
    await makeRoutes().processLogin(
      createMockReq({ username: 'admin', password: 'pw' }, session),
      createMockRes()
    );

    expect(session.regenerate).toHaveBeenCalled();
    expect(session.id).toBe('regenerated-id');
  });

  test('the identity is written AFTER regeneration, not before', async () => {
    // Ordering is the whole fix. Regenerating after the write would throw the
    // authenticated identity away and log nobody in; regenerating before it is
    // what closes fixation.
    const order: string[] = [];
    const session = createMockSession();
    // Deliberately does NOT delete `username` here: the accessor defined below
    // is what records the write, and deleting the property would remove the
    // accessor with it — the observation would vanish rather than the ordering
    // being wrong.
    session.regenerate = vi.fn((cb: (err?: unknown) => void) => {
      order.push('regenerate');
      cb();
    });
    Object.defineProperty(session, 'username', {
      configurable: true,
      set() { order.push('write-identity'); },
      get() { return 'admin'; }
    });

    await makeRoutes().processLogin(
      createMockReq({ username: 'admin', password: 'pw' }, session),
      createMockRes()
    );

    expect(order).toEqual(['regenerate', 'write-identity']);
  });

  test('a fresh CSRF token is minted, since regenerate() discards the old one', async () => {
    const session = createMockSession();
    await makeRoutes().processLogin(
      createMockReq({ username: 'admin', password: 'pw' }, session),
      createMockRes()
    );

    expect(session.csrfToken).toBeTruthy();
    expect(session.csrfToken).not.toBe('pre-login-token');
  });

  test('a store that cannot regenerate still logs the user in', async () => {
    // Best-effort by design: failing the sign-in outright would turn a
    // hardening measure into an outage.
    const session = createMockSession();
    session.regenerate = vi.fn((cb: (err?: unknown) => void) => cb(new Error('store down')));
    const res = createMockRes();

    await makeRoutes().processLogin(
      createMockReq({ username: 'admin', password: 'pw', redirect: '/view/Welcome' }, session),
      res
    );

    expect(session.isAuthenticated).toBe(true);
    expect(res.redirect).toHaveBeenCalledWith('/view/Welcome');
  });
});
