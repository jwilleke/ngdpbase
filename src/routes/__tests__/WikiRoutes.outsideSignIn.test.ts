/**
 * #1743 — the outside sign-in routes carry HTTP only; AuthManager decides.
 * Start: a provider that is not enabled is refused, an enabled one gets a
 * browser binding and goes to the provider. Callback: AuthManager's
 * finishOutsideSignIn decides (sign in, create, or hold for the email step),
 * a refusal is neutral, a replay opens no second session; a connection goes
 * back to the profile with its outcome. Cancel drops the waiting identity. Connect:
 * account-security, so a stale sign-in is sent to re-authenticate first.
 * Disconnect is the credential-removal route, whose last-way-in refusal is
 * shown.
 */
import WikiRoutes from '../WikiRoutes';
import AuthManager from '../../managers/AuthManager';
import { OAUTH_STATE_COOKIE } from '../../utils/magicLinkDeviceState';
import express, { type Request as ExpressRequest, type Response as ExpressResponse, type NextFunction } from 'express';
import request from 'supertest';
import { csrfMiddleware } from '../../middleware/csrf';
import { csrfTestSessionFields, csrfTestBodyField } from '../../middleware/__tests__/__fixtures__/csrfTestHelpers';
import { outsideCallbackRelay, OUTSIDE_CALLBACK_PATH } from '../../middleware/outsideCallbackRelay';
import cookieParser from 'cookie-parser';
import expressSession from 'express-session';
import { randomBytes } from 'node:crypto';

const res = () => ({
  status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), redirect: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis(), render: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis(),
  cookie: vi.fn().mockReturnThis(), clearCookie: vi.fn().mockReturnThis()
});
const session = (): Record<string, unknown> => ({ username: 'ann', isAuthenticated: true, save: vi.fn((cb: (e?: unknown) => void) => cb()) });

function routes(opts: { stale?: boolean; connectFor?: string | null } = {}) {
  const authManager = {
    outsideProviders: vi.fn(() => [{ id: 'oidc:google', name: 'google', displayName: 'Google' }]),
    callbackIsPosted: vi.fn((id: string) => id === 'oidc:apple'),
    startFlow: vi.fn().mockResolvedValue('https://accounts.example/authorize?state=s1'),
    startConnect: vi.fn().mockResolvedValue('https://accounts.example/authorize?state=s2'),
    flowConnectsFor: vi.fn(() => opts.connectFor ?? null),
    finishOutsideSignIn: vi.fn().mockResolvedValue({ outcome: 'signed-in', next: '/after' }),
    outsideChoice: vi.fn((): { displayName: string; choices: string[] } | null => ({ displayName: 'Google', choices: ['ann', 'bob'] })),
    finishOutsideChoice: vi.fn().mockResolvedValue({ outcome: 'signed-in', next: '/after' }) as ReturnType<typeof vi.fn>,
    dropPendingConnection: vi.fn(),
    pendingConnection: vi.fn(() => ({ displayName: 'Google', email: 'ann@gmail.example' })),
    confirmPendingConnection: vi.fn().mockResolvedValue('/profile?success=Connected'),
    declinePendingConnection: vi.fn(() => '/view/Home'),
    authenticate: vi.fn(),
    completeSignIn: vi.fn(),
    connectIdentity: vi.fn().mockResolvedValue('connected'),
    removeCredential: vi.fn().mockResolvedValue(true),
    stepUpNeeded: vi.fn(() => Boolean(opts.stale)),
    engine: null as unknown,
    askForFreshSignIn(...a: Parameters<AuthManager['askForFreshSignIn']>) { return AuthManager.prototype.askForFreshSignIn.apply(this as never, a); },
    // #2154: a page's form POST is kept to be redone after the prompt.
    stepUpReplays: new Map(),
    keepStepUpReplay(...a: unknown[]) { return (AuthManager.prototype as unknown as { keepStepUpReplay: (...x: unknown[]) => unknown }).keepStepUpReplay.apply(this, a); },
    recordReauth: vi.fn().mockResolvedValue(undefined)
  };
  const managers: Record<string, unknown> = {
    AuthManager: authManager,
    PolicyDecisionPoint: {
      permits: vi.fn((s: { roles?: string[]; signIn?: unknown; isAuthenticated?: boolean }, action: string) =>
        Promise.resolve(s.isAuthenticated !== false && !authManager.stepUpNeeded(action, s.signIn, s.roles ?? [], false))),
      holds: vi.fn(() => Promise.resolve(true))
    },
    AuditManager: { logAuditEvent: vi.fn().mockResolvedValue('a'), logAuthentication: vi.fn().mockResolvedValue('a') },
    ConfigurationManager: { getProperty: (_k: string, d: unknown) => d },
    UserManager: { getUser: vi.fn((u: string) => Promise.resolve({ username: u, displayName: u === 'ann' ? 'Ann Smith' : 'Bob Smith' })) }
  };
  const engine = { getManager: vi.fn((n: string) => managers[n] ?? null) };
  authManager.engine = engine;
  const r = new WikiRoutes(engine) as unknown as Record<string, (q: unknown, s: unknown) => Promise<void>>;
  (r as unknown as { getCommonTemplateData: () => Promise<Record<string, unknown>> }).getCommonTemplateData = () => Promise.resolve({});
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

  test('callback: AuthManager decides, and the person goes where it says', async () => {
    const { r, authManager } = routes();
    const out = res();
    const q = req({ method: 'GET', query: { code: 'c1', state: 's1' } });
    await r.finishOutsideFlow(q, out);
    expect(authManager.finishOutsideSignIn).toHaveBeenCalledWith(q, 'oidc:google', expect.objectContaining({ state: 's1', deviceState: 'browser-a' }), expect.objectContaining({ purpose: 'sign-in' }));
    expect(authManager.finishOutsideSignIn.mock.calls[0][2]).toEqual(expect.objectContaining({ token: q.query.code }));
    expect(out.clearCookie).toHaveBeenCalledWith(OAUTH_STATE_COOKIE, { path: '/' });
    expect(q.session.save).toHaveBeenCalled();
    expect(out.redirect).toHaveBeenCalledWith('/after');
  });

  describe('an email several accounts share (#2073)', () => {
    test('callback: the person is sent to choose which account', async () => {
      const { r, authManager } = routes();
      authManager.finishOutsideSignIn.mockResolvedValue({ outcome: 'choose-account' });
      const out = res();
      const q = req({ method: 'GET', query: { code: 'c1', state: 's1' } });
      await r.finishOutsideFlow(q, out);
      expect(q.session.save).toHaveBeenCalled();
      expect(out.redirect).toHaveBeenCalledWith('/auth/choose-account');
    });

    test('the page lists the accounts offered by name; with none waiting, back to sign in', async () => {
      const { r, authManager } = routes();
      const out = res();
      await r.chooseAccountPage(req({ method: 'GET' }), out);
      expect(out.render).toHaveBeenCalledWith('choose-account', expect.objectContaining({
        providerName: 'Google', accounts: [{ username: 'ann', displayName: 'Ann Smith' }, { username: 'bob', displayName: 'Bob Smith' }]
      }));
      authManager.outsideChoice.mockReturnValue(null);
      const none = res();
      await r.chooseAccountPage(req({ method: 'GET' }), none);
      expect(none.render).not.toHaveBeenCalled();
      expect(none.redirect).toHaveBeenCalledWith(expect.stringMatching(/^\/login\?error=/));
    });

    test('choosing passes the account to AuthManager, which decides; signed in, the person goes on', async () => {
      const { r, authManager } = routes();
      const out = res();
      const q = req({ body: { account: 'bob' } });
      await r.chooseAccount(q, out);
      expect(authManager.finishOutsideChoice).toHaveBeenCalledWith(q, 'bob');
      expect(q.session.save).toHaveBeenCalled();
      expect(out.redirect).toHaveBeenCalledWith('/after');
    });

    test('a refused choice signs nobody in and says so neutrally; a second step is held as after any sign-in', async () => {
      const { r, authManager } = routes();
      authManager.finishOutsideChoice.mockResolvedValue({ outcome: 'refused' });
      const out = res();
      const q = req({ body: { account: 'mallory' } });
      await r.chooseAccount(q, out);
      expect(out.redirect).toHaveBeenCalledWith('/login?error=' + encodeURIComponent('Sign-in failed. Please sign in again.'));
      expect(q.session.save).not.toHaveBeenCalled();

      authManager.finishOutsideChoice.mockResolvedValue({ outcome: 'second-step', handle: 'h', binding: 'b', next: '/after' });
      const held = vi.spyOn(r as unknown as { holdForSecondStep: (...a: unknown[]) => void }, 'holdForSecondStep').mockImplementation(() => undefined);
      await r.chooseAccount(req({ body: { account: 'bob' } }), res());
      expect(held).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'h', 'b', '/after');
    });
  });

  test('callback: an account created for the identity goes where it says too', async () => {
    const { r, authManager } = routes();
    authManager.finishOutsideSignIn.mockResolvedValue({ outcome: 'created', next: '/after' });
    const out = res();
    await r.finishOutsideFlow(req({ method: 'GET', query: { code: 'c1', state: 's1' } }), out);
    expect(out.redirect).toHaveBeenCalledWith('/after');
  });

  test('callback: an identity held for the email step goes to the sign-in page, with what to say if anything', async () => {
    const { r, authManager } = routes();
    authManager.finishOutsideSignIn.mockResolvedValue({ outcome: 'connect-first' });
    const out = res();
    const q = req({ method: 'GET', query: { code: 'c1', state: 's1' } });
    await r.finishOutsideFlow(q, out);
    expect(q.session.save).toHaveBeenCalled();
    expect(out.redirect).toHaveBeenCalledWith('/login');

    authManager.finishOutsideSignIn.mockResolvedValue({ outcome: 'connect-first', error: 'That email address is already used by another account. Please use another.' });
    const taken = res();
    await r.finishOutsideFlow(req({ method: 'GET', query: { code: 'c1', state: 's1' } }), taken);
    expect(decodeURIComponent(String(taken.redirect.mock.calls[0][0]))).toBe('/login?error=That email address is already used by another account. Please use another.');
  });

  test('#1532 callback: a sign-in held for the second step binds this browser and goes to the second-factor page, not signed in', async () => {
    const { r, authManager } = routes();
    authManager.finishOutsideSignIn.mockResolvedValue({ outcome: 'second-step', handle: 'h1', binding: 'bind-1', next: '/after' });
    const out = res();
    const q = req({ method: 'GET', query: { code: 'c1', state: 's1' } });
    await r.finishOutsideFlow(q, out);
    expect(out.cookie).toHaveBeenCalledWith('ngdp_two_step', 'bind-1', expect.objectContaining({ httpOnly: true, path: '/login' }));
    expect(q.session.pendingSignIn).toBe('h1');
    expect(q.session.pendingRedirect).toBe('/after');
    expect(out.redirect).toHaveBeenCalledWith('/login/second-factor');
  });

  test('callback: a refused sign-in is told neutrally, without saying whether an account exists', async () => {
    const { r, authManager } = routes();
    authManager.finishOutsideSignIn.mockResolvedValue({ outcome: 'refused' });
    const out = res();
    await r.finishOutsideFlow(req({ method: 'GET', query: { code: 'c1', state: 's1' } }), out);
    const target = decodeURIComponent(String(out.redirect.mock.calls[0][0]));
    expect(target).toMatch(/^\/login\?error=That sign-in did not work\. If you have an account here/);
  });

  test('callback: a replayed state opens no second session', async () => {
    const { r, authManager } = routes();
    authManager.finishOutsideSignIn.mockResolvedValue({ outcome: 'replayed' });
    const out = res();
    await r.finishOutsideFlow(req({ method: 'GET', query: { code: 'c1', state: 's1' } }), out);
    expect(decodeURIComponent(String(out.redirect.mock.calls[0][0]))).toBe('/login?error=Sign-in link already used');
  });

  test('cancel: the waiting identity is dropped and the sign-in page shown', () => {
    const { r, authManager } = routes();
    const out = res();
    const q = req();
    (r as unknown as { cancelPendingConnection(q: unknown, s: unknown): void }).cancelPendingConnection(q, out);
    expect(authManager.dropPendingConnection).toHaveBeenCalledWith(q);
    expect(out.redirect).toHaveBeenCalledWith('/login');
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
  describe('a provider that POSTs its callback (Apple form_post, slice 4b)', () => {
    /** The session signing key for this run; made up, never a literal. */
    const SESSION_KEY = randomBytes(16).toString('hex');
    /** The authorization code Apple POSTs back; any value. */
    const AUTH_CODE = 'c1';

    /** The app's order: body parser, the relay, cookies, the session, CSRF, then the routes. */
    const app = () => {
      const { r, authManager } = routes();
      const a = express();
      a.use(express.urlencoded({ extended: true }));
      a.post(OUTSIDE_CALLBACK_PATH, outsideCallbackRelay((id) => authManager.callbackIsPosted(id)));
      a.use(cookieParser());
      a.use(expressSession({ secret: SESSION_KEY, resave: false, saveUninitialized: false, cookie: { sameSite: 'lax' } }));
      a.use(csrfMiddleware);
      a.get(OUTSIDE_CALLBACK_PATH, (q: ExpressRequest, s: ExpressResponse) => void r.finishOutsideFlow(q, s));
      a.post('/auth/oauth/:name', (q: ExpressRequest, s: ExpressResponse) => void r.startOutsideSignIn(q, s));
      return { a, authManager };
    };

    test('the cross-site POST (no cookies, no CSRF token) becomes a GET, which finishes with the browser\'s state cookie', async () => {
      const { a, authManager } = app();
      const posted = await request(a).post('/auth/oauth/apple/callback').type('form')
        .send({ code: AUTH_CODE, state: 's1', user: JSON.stringify({ name: { firstName: 'Ann' } }) })
        .expect(303);
      expect(posted.headers.location).toBe('/auth/oauth/apple/callback?code=c1&state=s1');
      // No session is started for the POST, so the person's own session cookie is not replaced.
      expect(posted.headers['set-cookie']).toBeUndefined();
      expect(authManager.finishOutsideSignIn).not.toHaveBeenCalled();

      // The GET is a top-level navigation: the Lax state cookie comes with it.
      const finished = await request(a).get(posted.headers.location as string).set('Cookie', `${OAUTH_STATE_COOKIE}=browser-a`).expect(302);
      expect(finished.headers.location).toBe('/after');
      expect(authManager.finishOutsideSignIn).toHaveBeenCalledWith(expect.anything(), 'oidc:apple',
        { token: AUTH_CODE, state: 's1', deviceState: 'browser-a' }, expect.objectContaining({ purpose: 'sign-in' }));
    });

    test('the provider\'s error is carried on, and the sign-in page says it was cancelled', async () => {
      const { a, authManager } = app();
      const posted = await request(a).post('/auth/oauth/apple/callback').type('form').send({ error: 'user_cancelled_authorize', state: 's1' }).expect(303);
      expect(posted.headers.location).toBe('/auth/oauth/apple/callback?state=s1&error=user_cancelled_authorize');
      const finished = await request(a).get(posted.headers.location as string).expect(302);
      expect(finished.headers.location).toBe('/login?error=' + encodeURIComponent('Sign-in was cancelled'));
      expect(authManager.finishOutsideSignIn).not.toHaveBeenCalled();
    });

    test('a POSTed callback for a provider that does not POST it is refused by CSRF', async () => {
      const { a, authManager } = app();
      await request(a).post('/auth/oauth/google/callback').type('form').send({ code: 'c1', state: 's1' }).expect(403);
      await request(a).post('/auth/oauth/Apple/callback').type('form').send({ code: 'c1', state: 's1' }).expect(403);
      expect(authManager.finishOutsideSignIn).not.toHaveBeenCalled();
    });

    test('CSRF is still enforced on every other POST, including starting an Apple sign-in', async () => {
      const { a, authManager } = app();
      await request(a).post('/auth/oauth/apple').type('form').send({}).expect(403);
      expect(authManager.startFlow).not.toHaveBeenCalled();
    });
  });

  describe('confirming a waiting connection after a sign-in', () => {
    const signedOut = { username: 'anonymous', roles: ['anonymous'], isAuthenticated: false };

    test('the page asks the signed-in person, naming the provider, the email and their account', async () => {
      const { r } = routes();
      const out = res();
      await r.confirmConnectionPage(req({ method: 'GET' }), out);
      expect(out.render).toHaveBeenCalledWith('login-connect-confirm', expect.objectContaining({
        pending: { displayName: 'Google', email: 'ann@gmail.example' }, username: 'ann'
      }));
    });

    test('the page is for a signed-in person only, and only while something waits', async () => {
      const { r, authManager } = routes();
      const out = res();
      await r.confirmConnectionPage(req({ method: 'GET', userContext: signedOut }), out);
      expect(out.render).not.toHaveBeenCalledWith('login-connect-confirm', expect.anything());
      expect(authManager.pendingConnection).not.toHaveBeenCalled();
      authManager.pendingConnection.mockReturnValue(null);
      const none = res();
      await r.confirmConnectionPage(req({ method: 'GET' }), none);
      expect(none.redirect).toHaveBeenCalledWith('/');
    });

    test('Connect asks AuthManager to connect it, as the signed-in person', async () => {
      const { r, authManager } = routes();
      const out = res();
      const q = req({ body: { answer: 'connect' } });
      await r.answerConnectionConfirm(q, out);
      expect(authManager.confirmPendingConnection).toHaveBeenCalledWith(q, expect.objectContaining({ username: 'ann', isAuthenticated: true }));
      expect(out.redirect).toHaveBeenCalledWith('/profile?success=Connected');
    });

    test('Don\'t connect drops it and goes where the sign-in was going', async () => {
      const { r, authManager } = routes();
      const out = res();
      await r.answerConnectionConfirm(req({ body: { answer: 'decline' } }), out);
      expect(authManager.declinePendingConnection).toHaveBeenCalled();
      expect(authManager.confirmPendingConnection).not.toHaveBeenCalled();
      expect(out.redirect).toHaveBeenCalledWith('/view/Home');
    });

    test('a signed-out request connects nothing', async () => {
      const { r, authManager } = routes();
      const out = res();
      await r.answerConnectionConfirm(req({ body: { answer: 'connect' }, userContext: signedOut }), out);
      expect(authManager.confirmPendingConnection).not.toHaveBeenCalled();
      expect(authManager.declinePendingConnection).not.toHaveBeenCalled();
    });

    test('the answer is a CSRF-protected POST: without the token nothing is connected', async () => {
      const { r, authManager } = routes();
      const session: Record<string, unknown> = { ...csrfTestSessionFields(), username: 'ann', isAuthenticated: true, save: (cb: () => void) => cb() };
      const app = express();
      app.use(express.urlencoded({ extended: true }));
      app.use((q: ExpressRequest, _s: ExpressResponse, next: NextFunction) => {
        Object.assign(q, { session, userContext: { username: 'ann', roles: ['reader'], isAuthenticated: true } });
        next();
      });
      app.use(csrfMiddleware);
      app.post('/login/connect/confirm', (q: ExpressRequest, s: ExpressResponse) => void r.answerConnectionConfirm(q, s));

      await request(app).post('/login/connect/confirm').type('form').send({ answer: 'connect' }).expect(403);
      expect(authManager.confirmPendingConnection).not.toHaveBeenCalled();

      await request(app).post('/login/connect/confirm').type('form').send({ answer: 'connect', ...csrfTestBodyField() }).expect(302);
      expect(authManager.confirmPendingConnection).toHaveBeenCalledTimes(1);
    });
  });
});
