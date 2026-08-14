/**
 * #1046 — session cookie must survive TLS terminated upstream.
 *
 * The bug that broke login on geohazardwatch.com shipped green because nothing
 * exercised the configuration it happens in. Unit tests cover the resolution
 * (utils/__tests__/sessionSecurity.test.ts); this drives the whole wiring the
 * way a proxied browser does — `X-Forwarded-Proto: https` on a plain-http
 * connection — and asserts the cookie actually goes out and the follow-up POST
 * clears CSRF.
 *
 * The first block deliberately reproduces the broken pair, so a regression that
 * un-derives `trust proxy` fails here loudly rather than in production.
 */
import { describe, test, expect } from 'vitest';
import express, { type Express } from 'express';
import session from 'express-session';
import request from 'supertest';
import { csrfMiddleware } from '../middleware/csrf.js';
import { resolveSessionSecurity, type TrustProxyValue } from '../utils/sessionSecurity.js';

/**
 * Minimal stand-in for the real bootstrap: same middleware order, same cookie
 * options, an in-memory store instead of the file store.
 */
function buildApp(opts: { secure: boolean; trustProxy: TrustProxyValue }): Express {
  const app = express();

  if (opts.trustProxy !== false) app.set('trust proxy', opts.trustProxy);

  app.use(express.urlencoded({ extended: false }));
  app.use(session({
    secret: 'test-secret-#1046',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: opts.secure, httpOnly: true, sameSite: 'lax' }
  }));
  app.use(csrfMiddleware);

  // Stands in for the rendered login form's hidden `_csrf` input.
  app.get('/login', (req, res) => {
    res.json({ csrfToken: (req.session as { csrfToken?: string }).csrfToken ?? null });
  });
  app.post('/login', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  return app;
}

/** The header an upstream TLS terminator adds; the whole point of the bug. */
const PROXIED = { 'X-Forwarded-Proto': 'https' };

describe('#1046 session cookie behind a TLS-terminating proxy', () => {
  describe('the broken pair — secure on, trust proxy off', () => {
    test('issues no session cookie, so login POSTs die on CSRF', async () => {
      const app = buildApp({ secure: true, trustProxy: false });

      const page = await request(app).get('/login').set(PROXIED).expect(200);

      // The exact production symptom: a token is rendered, but nothing is
      // stored client-side to check it against.
      expect(page.body.csrfToken).toBeTruthy();
      expect(page.headers['set-cookie']).toBeUndefined();

      const post = await request(app)
        .post('/login')
        .set(PROXIED)
        .type('form')
        .send({ _csrf: page.body.csrfToken, username: 'someone', password: 'whatever' });

      expect(post.status).toBe(403);
      expect(post.text).toBe('Forbidden — invalid CSRF token');
    });
  });

  describe('the fixed pair — secure on, trust proxy derived', () => {
    test('issues a Secure session cookie and the follow-up POST passes CSRF', async () => {
      const resolved = resolveSessionSecurity({}, 'production');
      expect(resolved.secure).toBe(true);
      expect(resolved.trustProxy).toBe(true);

      const app = buildApp({ secure: resolved.secure, trustProxy: resolved.trustProxy });

      const page = await request(app).get('/login').set(PROXIED).expect(200);

      const cookies = page.headers['set-cookie'] as unknown as string[] | undefined;
      expect(cookies, 'no session cookie was issued — #1046 has regressed').toBeDefined();
      expect(cookies.join(';')).toMatch(/Secure/i);

      // Cookies are replayed by hand rather than through supertest's agent:
      // a `Secure` cookie over the agent's plain-http connection is not
      // guaranteed to be sent back, which would fail the test for a reason
      // that has nothing to do with the server.
      const post = await request(app)
        .post('/login')
        .set(PROXIED)
        .set('Cookie', cookies.map((c) => c.split(';')[0]).join('; '))
        .type('form')
        .send({ _csrf: page.body.csrfToken, username: 'someone', password: 'whatever' });

      expect(post.status).toBe(200);
      expect(post.body).toEqual({ ok: true });
    });

    test('still rejects a POST that carries the session but no token', async () => {
      // Deriving trust proxy must not weaken the CSRF check itself.
      const app = buildApp({ secure: true, trustProxy: true });

      const page = await request(app).get('/login').set(PROXIED).expect(200);
      const cookies = page.headers['set-cookie'] as unknown as string[];

      const post = await request(app)
        .post('/login')
        .set(PROXIED)
        .set('Cookie', cookies.map((c) => c.split(';')[0]).join('; '))
        .type('form')
        .send({ username: 'someone', password: 'whatever' });

      expect(post.status).toBe(403);
    });
  });

  describe('plain http development', () => {
    test('issues a session cookie with secure off and no proxy header', async () => {
      const resolved = resolveSessionSecurity({}, 'development');
      const app = buildApp({ secure: resolved.secure, trustProxy: resolved.trustProxy });

      const page = await request(app).get('/login').expect(200);
      const cookies = page.headers['set-cookie'] as unknown as string[] | undefined;

      expect(cookies).toBeDefined();
      expect(cookies.join(';')).not.toMatch(/Secure/i);

      const post = await request(app)
        .post('/login')
        .set('Cookie', cookies.map((c) => c.split(';')[0]).join('; '))
        .type('form')
        .send({ _csrf: page.body.csrfToken });

      expect(post.status).toBe(200);
    });
  });
});
