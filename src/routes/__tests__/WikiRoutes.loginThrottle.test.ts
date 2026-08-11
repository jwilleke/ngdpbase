/**
 * processLogin consults the login throttle (#1044).
 *
 * `LoginThrottle` has its own unit tests; these pin that the handler is wired
 * to it — refuses while locked, counts failures, clears on success, and can be
 * switched off by config. A throttle that exists but is never called protects
 * nothing, and that is exactly what a unit test of the throttle alone cannot
 * see.
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

const createMockSession = () => {
  const session: Record<string, unknown> = {
    id: 'sid',
    regenerate: vi.fn((cb: (e?: unknown) => void) => cb()),
    save: vi.fn((cb: (e?: unknown) => void) => cb())
  };
  return session;
};

const createMockReq = (
  body: Record<string, unknown>,
  ip = '10.0.0.1',
  opts: { forwardedFor?: string; trustProxy?: unknown } = {}
) => ({
  body,
  params: {},
  query: {},
  session: createMockSession(),
  path: '/login',
  originalUrl: '/login',
  protocol: 'http',
  ip,
  app: { get: vi.fn(() => opts.trustProxy) },
  get: vi.fn((header: string) =>
    header.toLowerCase() === 'x-forwarded-for' ? opts.forwardedFor : 'test-agent'
  ),
  userContext: null
});

const logSecurityEvent = vi.fn().mockResolvedValue('evt');

function makeRoutes(opts: { authSucceeds?: boolean; config?: Record<string, unknown> } = {}) {
  const { authSucceeds = false, config = {} } = opts;
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
        return {
          getProperty: vi.fn((key: string, d: unknown) => (key in config ? config[key] : d))
        };
      }
      if (name === 'AuditManager') return { logSecurityEvent };
      if (name === 'UserManager') return { authenticateUser: vi.fn().mockResolvedValue(null) };
      if (name === 'MetricsManager') return { recordLoginAttempt: vi.fn() };
      return null;
    })
  };
  return new WikiRoutes(engine) as unknown as {
    processLogin(req: unknown, res: unknown): Promise<void>;
  };
}

/** The throttle is process-wide, so it MUST be cleared between tests. */
beforeEach(() => {
  vi.clearAllMocks();
  (WikiRoutes as unknown as { loginThrottle: { reset(): void } | null }).loginThrottle = null;
});

/**
 * The last redirect target, URL-decoded.
 *
 * The two messages are encoded differently by the handler — one goes through
 * encodeURIComponent, the other is a literal — so asserting on raw query
 * strings compares encoding rather than behaviour. Decode, then match text.
 */
const lastRedirect = (res: ReturnType<typeof createMockRes>): string =>
  decodeURIComponent(res.redirect.mock.calls[res.redirect.mock.calls.length - 1][0] as string);

describe('repeated failures eventually get refused (#1044)', () => {
  test('the limit is enforced — attempt N+1 is refused before any password check', async () => {
    const routes = makeRoutes({ config: { 'ngdpbase.auth.throttle.max-attempts': 3 } });

    for (let i = 0; i < 3; i++) {
      await routes.processLogin(createMockReq({ username: 'admin', password: 'wrong' }), createMockRes());
    }

    const res = createMockRes();
    await routes.processLogin(createMockReq({ username: 'admin', password: 'wrong' }), res);

    expect(lastRedirect(res)).toContain('Too many failed attempts');
  });

  test('the refusal names a wait, so the user knows it is temporary', async () => {
    const routes = makeRoutes({
      config: { 'ngdpbase.auth.throttle.max-attempts': 2, 'ngdpbase.auth.throttle.lock-minutes': 5 }
    });
    for (let i = 0; i < 2; i++) {
      await routes.processLogin(createMockReq({ username: 'admin', password: 'wrong' }), createMockRes());
    }

    const res = createMockRes();
    await routes.processLogin(createMockReq({ username: 'admin', password: 'wrong' }), res);

    expect(lastRedirect(res)).toMatch(/Try again in \d+ minute/);
  });

  test('an ordinary single failure is NOT refused', async () => {
    const routes = makeRoutes({ config: { 'ngdpbase.auth.throttle.max-attempts': 3 } });
    const res = createMockRes();

    await routes.processLogin(createMockReq({ username: 'admin', password: 'wrong' }), res);

    expect(lastRedirect(res)).toContain('Invalid username or password');
  });
});

describe('the lockout is audited, not merely applied (#1044)', () => {
  test('reaching the limit writes a security event', async () => {
    // Slowing an attacker is half the value; a distributed attempt has to be
    // visible rather than only delayed.
    const routes = makeRoutes({ config: { 'ngdpbase.auth.throttle.max-attempts': 2 } });

    for (let i = 0; i < 2; i++) {
      await routes.processLogin(createMockReq({ username: 'admin', password: 'wrong' }), createMockRes());
    }

    expect(logSecurityEvent).toHaveBeenCalled();
    const [, eventType, severity] = logSecurityEvent.mock.calls[0];
    expect(eventType).toBe('login_throttled');
    expect(severity).toBe('medium');
  });

  test('an audit failure does not break the login response', async () => {
    logSecurityEvent.mockRejectedValueOnce(new Error('audit store down'));
    const routes = makeRoutes({ config: { 'ngdpbase.auth.throttle.max-attempts': 1 } });
    const res = createMockRes();

    await routes.processLogin(createMockReq({ username: 'admin', password: 'wrong' }), res);

    expect(res.redirect).toHaveBeenCalled();
  });
});

describe('legitimate users are not punished (#1044)', () => {
  test('a success clears the count — a typo then a correct password costs nothing', async () => {
    const failing = makeRoutes({ config: { 'ngdpbase.auth.throttle.max-attempts': 3 } });
    await failing.processLogin(createMockReq({ username: 'admin', password: 'wrong' }), createMockRes());
    await failing.processLogin(createMockReq({ username: 'admin', password: 'wrong' }), createMockRes());

    // Same process-wide throttle, now a successful login.
    const ok = makeRoutes({ authSucceeds: true, config: { 'ngdpbase.auth.throttle.max-attempts': 3 } });
    await ok.processLogin(createMockReq({ username: 'admin', password: 'right' }), createMockRes());

    // Budget is full again: two more failures must still not lock.
    const res = createMockRes();
    await failing.processLogin(createMockReq({ username: 'admin', password: 'wrong' }), createMockRes());
    await failing.processLogin(createMockReq({ username: 'admin', password: 'wrong' }), res);

    expect(lastRedirect(res)).toContain('Invalid username or password');
  });

  test('locking one username does not lock a different one from another IP', async () => {
    const routes = makeRoutes({ config: { 'ngdpbase.auth.throttle.max-attempts': 2 } });
    for (let i = 0; i < 3; i++) {
      await routes.processLogin(createMockReq({ username: 'admin', password: 'wrong' }, '10.0.0.1'), createMockRes());
    }

    const res = createMockRes();
    await routes.processLogin(createMockReq({ username: 'someone', password: 'wrong' }, '10.0.0.2'), res);

    expect(lastRedirect(res)).toContain('Invalid username or password');
  });
});

describe('the operator can turn it off (#1044)', () => {
  test('disabled means no attempt is ever refused', async () => {
    const routes = makeRoutes({
      config: { 'ngdpbase.auth.throttle.enabled': false, 'ngdpbase.auth.throttle.max-attempts': 2 }
    });

    for (let i = 0; i < 6; i++) {
      const res = createMockRes();
      await routes.processLogin(createMockReq({ username: 'admin', password: 'wrong' }), res);
      expect(lastRedirect(res)).toContain('Invalid username or password');
    }
  });
});

describe('a shared proxy IP is not used as a key (#1044)', () => {
  test('behind an unconfigured proxy, one attacker cannot lock out everyone', async () => {
    // trust proxy off + X-Forwarded-For present means req.ip is the ingress,
    // shared by every client. An IP bucket there identifies the instance, not
    // an attacker — so ten failures would lock out all users at once, which is
    // the denial-of-service this control exists to avoid. Both the demo and
    // geohazardwatch ship in exactly this state.
    const routes = makeRoutes({ config: { 'ngdpbase.auth.throttle.max-attempts': 3 } });
    const proxied = { forwardedFor: '203.0.113.9', trustProxy: undefined };

    for (let i = 0; i < 5; i++) {
      await routes.processLogin(
        createMockReq({ username: 'victim-a', password: 'wrong' }, '10.0.0.1', proxied),
        createMockRes()
      );
    }

    // A DIFFERENT user from the same (shared) address must still be served.
    const res = createMockRes();
    await routes.processLogin(
      createMockReq({ username: 'victim-b', password: 'wrong' }, '10.0.0.1', proxied),
      res
    );

    expect(lastRedirect(res)).toContain('Invalid username or password');
  });

  test('the username key still locks behind a proxy', async () => {
    // Losing the IP key must not mean losing the protection.
    const routes = makeRoutes({ config: { 'ngdpbase.auth.throttle.max-attempts': 3 } });
    const proxied = { forwardedFor: '203.0.113.9', trustProxy: undefined };

    for (let i = 0; i < 3; i++) {
      await routes.processLogin(
        createMockReq({ username: 'admin', password: 'wrong' }, '10.0.0.1', proxied),
        createMockRes()
      );
    }

    const res = createMockRes();
    await routes.processLogin(
      createMockReq({ username: 'admin', password: 'wrong' }, '10.0.0.1', proxied),
      res
    );

    expect(lastRedirect(res)).toContain('Too many failed attempts');
  });

  test('with trust proxy configured, the IP key is used again', async () => {
    const routes = makeRoutes({ config: { 'ngdpbase.auth.throttle.max-attempts': 3 } });
    const trusted = { forwardedFor: '203.0.113.9', trustProxy: 'loopback' };

    for (let i = 0; i < 3; i++) {
      await routes.processLogin(
        createMockReq({ username: 'victim-a', password: 'wrong' }, '203.0.113.9', trusted),
        createMockRes()
      );
    }

    // Same client IP, different username — the IP bucket should refuse it.
    const res = createMockRes();
    await routes.processLogin(
      createMockReq({ username: 'victim-b', password: 'wrong' }, '203.0.113.9', trusted),
      res
    );

    expect(lastRedirect(res)).toContain('Too many failed attempts');
  });
});
