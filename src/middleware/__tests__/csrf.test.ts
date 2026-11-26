/**
 * Unit tests for the CSRF middleware (#663).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { csrfMiddleware, generateCsrfToken } from '../csrf';
import {
  TEST_CSRF_TOKEN,
  csrfTestSessionFields,
  csrfTestHeaders,
  csrfTestBodyField
} from './__fixtures__/csrfTestHelpers';

vi.mock('../../utils/logger.js', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

interface FakeSession extends Record<string, unknown> {
  csrfToken?: string;
}

function buildApp(initialSession: FakeSession, signedIn = false): {
  app: express.Application;
  session: FakeSession;
} {
  const session = initialSession;
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { session: FakeSession }).session = session;
    (req as unknown as { userContext: unknown }).userContext = signedIn
      ? { username: 'ed', isAuthenticated: true }
      : { username: 'Anonymous', isAuthenticated: false };
    next();
  });
  app.use(csrfMiddleware);
  app.get('/probe', (req: Request, res: Response) => {
    res.json({
      token:
        (req as unknown as { session: FakeSession }).session.csrfToken ?? null
    });
  });
  app.post('/save', (_req: Request, res: Response) => {
    res.json({ saved: true });
  });
  app.put('/update', (_req: Request, res: Response) => {
    res.json({ updated: true });
  });
  app.delete('/remove', (_req: Request, res: Response) => {
    res.json({ removed: true });
  });
  return { app, session };
}

describe('csrfMiddleware', () => {
  describe('token issuance', () => {
    it('populates session.csrfToken on a fresh GET when none exists', async () => {
      const { app, session } = buildApp({});
      const res = await request(app).get('/probe').expect(200);
      expect(typeof res.body.token).toBe('string');
      expect((res.body.token as string).length).toBeGreaterThan(0);
      expect(session.csrfToken).toBe(res.body.token);
    });

    it('does not overwrite an existing session.csrfToken', async () => {
      const { app } = buildApp(csrfTestSessionFields());
      const res = await request(app).get('/probe').expect(200);
      expect(res.body.token).toBe(TEST_CSRF_TOKEN);
    });
  });

  describe('safe methods pass through', () => {
    it.each(['get'] as const)('%s succeeds without a token', async method => {
      const { app } = buildApp({});
      await request(app)[method]('/probe').expect(200);
    });
  });

  describe('state-changing methods enforce the token', () => {
    it('POST without token → 403', async () => {
      const { app } = buildApp(csrfTestSessionFields());
      await request(app).post('/save').send({ foo: 'bar' }).expect(403);
    });

    it('POST with header token → 200', async () => {
      const { app } = buildApp(csrfTestSessionFields());
      await request(app)
        .post('/save')
        .set(csrfTestHeaders())
        .send({ foo: 'bar' })
        .expect(200);
    });

    it('POST with body token → 200', async () => {
      const { app } = buildApp(csrfTestSessionFields());
      await request(app)
        .post('/save')
        .send({ ...csrfTestBodyField(), foo: 'bar' })
        .expect(200);
    });

    it('POST with mismatched token → 403', async () => {
      const { app } = buildApp(csrfTestSessionFields());
      await request(app)
        .post('/save')
        .set('X-CSRF-Token', 'wrong-token-of-the-same-character-class')
        .send({ foo: 'bar' })
        .expect(403);
    });

    it('POST with same-length-but-different token → 403', async () => {
      // timingSafeEqual returns false even when lengths match.
      const sameLen = TEST_CSRF_TOKEN.split('').reverse().join('');
      const { app } = buildApp(csrfTestSessionFields());
      await request(app)
        .post('/save')
        .set('X-CSRF-Token', sameLen)
        .send({ foo: 'bar' })
        .expect(403);
    });

    it('PUT without token → 403', async () => {
      const { app } = buildApp(csrfTestSessionFields());
      await request(app).put('/update').send({ foo: 'bar' }).expect(403);
    });

    it('DELETE without token → 403', async () => {
      const { app } = buildApp(csrfTestSessionFields());
      await request(app).delete('/remove').expect(403);
    });

    it('POST when session has no token at all → 403', async () => {
      // Edge: middleware ran on a fresh session (which would issue a token),
      // but we simulate a posted request hitting before any GET. The token
      // is auto-issued — but the submitted token is missing → 403.
      const { app } = buildApp({});
      await request(app).post('/save').expect(403);
    });
  });

  // #2071: a secure session cookie on a plain-http request never reached the
  // browser, so the refusal names that cause instead of only "invalid".
  describe('refusal when the session cookie was withheld', () => {
    const fresh = (): FakeSession => ({ cookie: { secure: true } });

    it('plain http with a secure cookie → 403 that says why and what to do', async () => {
      const { app } = buildApp(fresh());
      const res = await request(app).post('/save').set(csrfTestHeaders()).expect(403);
      expect(res.text).toContain('Forbidden — invalid CSRF token');
      expect(res.text).toContain('session cookie only over https');
      expect(res.text).toContain('ngdpbase.session.secure to false');
    });

    it('behind a trusted proxy that says https → the plain refusal only', async () => {
      const { app } = buildApp(fresh());
      app.set('trust proxy', true);
      const res = await request(app).post('/save').set(csrfTestHeaders()).set('X-Forwarded-Proto', 'https').expect(403);
      expect(res.text).toBe('Forbidden — invalid CSRF token');
    });

    it('a cookie that is not secure → the plain refusal only', async () => {
      const { app } = buildApp({ cookie: { secure: false } });
      const res = await request(app).post('/save').set(csrfTestHeaders()).expect(403);
      expect(res.text).toBe('Forbidden — invalid CSRF token');
    });
  });

  // A lost session (cookie cleared, or the session pruned from the store) has no token and no sign-in.
  // A page form from a browser goes to sign-in and back; anything else keeps the plain 403.
  describe('a page form with no signed-in session goes to sign-in', () => {
    const form = (app: express.Application, referer = 'http://localhost/view/Main') =>
      request(app)
        .post('/save')
        .set('Accept', 'text/html')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .set('Host', 'localhost')
        .set('Referer', referer)
        .send('content=x');

    it('a form POST with no session token is sent to sign-in and back to the page', async () => {
      const { app } = buildApp({});
      const res = await form(app).expect(302);
      expect(res.headers.location).toBe('/login?redirect=' + encodeURIComponent('/view/Main'));
    });

    it('a form POST with a token the store no longer holds is sent to sign-in', async () => {
      const { app } = buildApp(csrfTestSessionFields());
      const res = await form(app).send('_csrf=stale-token').expect(302);
      expect(res.headers.location).toMatch(/^\/login\?redirect=/);
    });

    it('a Referer on another site goes back to the home page, not off site', async () => {
      const { app } = buildApp({});
      const res = await form(app, 'https://evil.example/view/Main').expect(302);
      expect(res.headers.location).toBe('/login?redirect=' + encodeURIComponent('/'));
    });

    it('a JSON caller keeps the plain 403', async () => {
      const { app } = buildApp({});
      await request(app).post('/save').set('Accept', 'application/json').send({ foo: 'bar' }).expect(403);
    });

    it('a signed-in caller with a bad token keeps the plain 403', async () => {
      const { app } = buildApp(csrfTestSessionFields(), true);
      await form(app).send('_csrf=wrong').expect(403);
    });

    it('a withheld secure cookie keeps the 403 that explains it', async () => {
      const { app } = buildApp({ cookie: { secure: true } });
      const res = await form(app).expect(403);
      expect(res.text).toContain('session cookie only over https');
    });
  });

  describe('generateCsrfToken', () => {
    it('returns a 64-char hex string (32 bytes)', () => {
      const token = generateCsrfToken();
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('returns a unique value on repeated calls', () => {
      const a = generateCsrfToken();
      const b = generateCsrfToken();
      expect(a).not.toBe(b);
    });
  });
});
