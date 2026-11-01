/**
 * #421 — the /profile/totp routes over a real AuthManager, TOTP provider and
 * credentials store in a temp directory: the offer needs a fresh sign-in, the
 * confirming POST needs the CSRF token, the session keeps the pending seed
 * sealed and uses it once, and one person cannot confirm or remove another's
 * app. Only the temp directory is removed. No seed or code is printed.
 */
vi.unmock('../../providers/FileCredentialsProvider');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { Secret, TOTP } from 'otpauth';
import WikiRoutes from '../WikiRoutes';
import AuthManager from '../../managers/AuthManager';
import { CREDENTIALS_KEY_ENV } from '../../providers/BaseCredentialsProvider';
import { csrfMiddleware } from '../../middleware/csrf';
import { TEST_CSRF_TOKEN } from '../../middleware/__tests__/__fixtures__/csrfTestHelpers';

const KEY = 'test-credentials-key-not-a-secret';
const codeFor = (seed: string) => new TOTP({ secret: Secret.fromBase32(seed), digits: 6, period: 30, algorithm: 'SHA1' }).generate();
const wrongCode = (seed: string) => (codeFor(seed) === '000000' ? '111111' : '000000');

describe('/profile/totp routes (#421)', () => {
  let dir: string;
  let file: string;
  const savedKey = process.env[CREDENTIALS_KEY_ENV];
  // Who has signed in recently enough for account-security (its step-up).
  let fresh: Set<string>;
  let sessions: Record<string, Record<string, unknown>>;
  let am: AuthManager;
  let app: express.Application;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-421-routes-'));
    file = path.join(dir, 'users', 'credentials.json');
    process.env[CREDENTIALS_KEY_ENV] = KEY;
    fresh = new Set(['molly', 'sam']);
    sessions = { molly: { csrfToken: TEST_CSRF_TOKEN }, sam: { csrfToken: TEST_CSRF_TOKEN } };
    const users: Record<string, { password: string }> = { molly: { password: 'scrypt$x' }, sam: { password: 'scrypt$x' } };
    const managers: Record<string, unknown> = {
      ConfigurationManager: {
        getProperty: (_k: string, d: unknown) => d,
        getCustomProperty: () => undefined,
        getResolvedDataPath: (k: string, d: string) => (k === 'ngdpbase.auth.credentials.file' ? file : d),
        isBaseUrlExplicit: () => true,
        getBaseURL: () => 'https://wiki.example.com'
      },
      PolicyDecisionPoint: {
        permits: (s: { username: string }, action: string) => Promise.resolve(action === 'account-security' && fresh.has(s.username)),
        holds: (_s: { username: string }, action: string) => Promise.resolve(action === 'account-security')
      },
      UserManager: {
        getUser: (u: string) => Promise.resolve(users[u] ? { ...users[u], password: undefined } : null),
        hasPassword: (u: string) => Promise.resolve(Boolean(users[u]))
      },
      AuditManager: { logAuditEvent: () => Promise.resolve('evt') },
      NotificationManager: { notifyAdmins: () => Promise.resolve('n1') }
    };
    am = new AuthManager({ getManager: (n: string) => managers[n] ?? null });
    await am.initialize();
    managers.AuthManager = am;
    vi.spyOn(am, 'askForFreshSignIn').mockResolvedValue({ permission: 'account-security', delegated: false, error: 'A fresh sign-in is needed', reauth: { url: '/reauth' } });

    const routes = new WikiRoutes({ getManager: (n: string) => managers[n] ?? null });
    vi.spyOn(routes, 'createWikiContext').mockImplementation((req: Request) => {
      const userContext = req.userContext as unknown as { username: string };
      return {
        userContext,
        hasPermission: (p: string) => Promise.resolve(p === 'account-security' && fresh.has(userContext.username)),
        holdsPermission: (p: string) => Promise.resolve(p === 'account-security')
      } as never;
    });
    vi.spyOn(routes, 'getCommonTemplateData').mockResolvedValue({});

    app = express();
    app.use(express.urlencoded({ extended: true }));
    // The signed-in user is named by a test header; each has their own session.
    app.use((req: Request, res: Response, next: NextFunction) => {
      const username = req.get('x-test-user') ?? 'molly';
      (req as unknown as { session: unknown }).session = sessions[username];
      (req as unknown as { userContext: unknown }).userContext = { username, isAuthenticated: true, roles: ['reader'] };
      // The page's locals, as JSON: the test reads the offered key from it as a person would from the page.
      res.render = ((view: string, locals: Record<string, unknown>) => { res.json({ view, seed: locals.seed, error: locals.error }); }) as never;
      next();
    });
    app.use(csrfMiddleware);
    app.get('/profile/totp', (req, res) => { void routes.totpEnrolPage(req, res); });
    app.post('/profile/totp', (req, res) => { void routes.totpEnrolConfirm(req, res); });
    app.post('/profile/credentials/:id/remove', (req, res) => { void routes.removeOwnCredential(req, res); });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (savedKey === undefined) delete process.env[CREDENTIALS_KEY_ENV]; else process.env[CREDENTIALS_KEY_ENV] = savedKey;
    // Only the per-test temp directory — never a live data tree.
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const offer = async (user = 'molly'): Promise<string> => {
    const res = await request(app).get('/profile/totp').set('x-test-user', user).expect(200);
    expect(res.body.view).toBe('profile-totp');
    return res.body.seed as string;
  };
  const confirm = (code: string, user = 'molly', csrf: string | null = TEST_CSRF_TOKEN) =>
    request(app).post('/profile/totp').set('x-test-user', user).type('form').send({ code, label: 'Phone', ...(csrf ? { _csrf: csrf } : {}) });
  const totpRows = async (user: string) => (await am.listCredentials({ username: user, roles: ['reader'], isAuthenticated: true }, user)).filter(c => c.kind === 'totp');

  test('the offer needs a fresh sign-in: without one there is no seed and nothing in the session', async () => {
    fresh.delete('molly');
    const res = await request(app).get('/profile/totp').set('x-test-user', 'molly');
    expect(res.status).toBe(403);
    expect(res.body.seed).toBeUndefined();
    expect(sessions.molly.totpEnrolment).toBeUndefined();
  });

  test('the session keeps the pending seed sealed, never in clear', async () => {
    const seed = await offer();
    const pending = sessions.molly.totpEnrolment as { pending: string; expires: number };
    expect(pending.pending).toEqual(expect.any(String));
    expect(JSON.stringify(sessions.molly)).not.toContain(seed);
    expect(JSON.stringify(sessions.molly)).not.toContain(seed.toLowerCase());
  });

  test('the right code enrols the app, once; the pending seed is gone after', async () => {
    const seed = await offer();
    const res = await confirm(codeFor(seed)).expect(302);
    expect(res.headers.location).toBe('/profile?success=Authenticator+app+added');
    expect(sessions.molly.totpEnrolment).toBeUndefined();
    expect(await totpRows('molly')).toHaveLength(1);
    expect(fs.readFileSync(file, 'utf8')).not.toContain(seed);
  });

  test('a wrong code enrols nothing and offers a new seed', async () => {
    const seed = await offer();
    const res = await confirm(wrongCode(seed)).expect(200);
    expect(res.body.error).toMatch(/did not match/);
    expect(res.body.seed).not.toBe(seed);
    expect(await totpRows('molly')).toHaveLength(0);
  });

  test('a pending seed older than ten minutes is not used', async () => {
    const seed = await offer();
    (sessions.molly.totpEnrolment as { expires: number }).expires = Date.now() - 1;
    const res = await confirm(codeFor(seed)).expect(200);
    expect(res.body.error).toMatch(/took too long/);
    expect(await totpRows('molly')).toHaveLength(0);
  });

  test('the confirming POST needs the CSRF token', async () => {
    const seed = await offer();
    const res = await confirm(codeFor(seed), 'molly', null);
    expect(res.status).toBe(403);
    expect(await totpRows('molly')).toHaveLength(0);
  });

  test("another person cannot confirm someone else's pending seed, even carrying it in their own session", async () => {
    const seed = await offer('molly');
    sessions.sam.totpEnrolment = sessions.molly.totpEnrolment;
    const res = await confirm(codeFor(seed), 'sam').expect(200);
    expect(res.body.error).toMatch(/did not match/);
    expect(await totpRows('sam')).toHaveLength(0);
    expect(await totpRows('molly')).toHaveLength(0);
  });

  test('the owner can remove their app; another person cannot remove it', async () => {
    const seed = await offer();
    await confirm(codeFor(seed)).expect(302);
    const [row] = await totpRows('molly');
    const samRemove = await request(app).post(`/profile/credentials/${row.id}/remove`).set('x-test-user', 'sam').type('form').send({ _csrf: TEST_CSRF_TOKEN }).expect(302);
    expect(samRemove.headers.location).toBe('/profile?error=Credential+not+found');
    expect(await totpRows('molly')).toHaveLength(1);
    const own = await request(app).post(`/profile/credentials/${row.id}/remove`).set('x-test-user', 'molly').type('form').send({ _csrf: TEST_CSRF_TOKEN }).expect(302);
    expect(own.headers.location).toBe('/profile?success=Credential+removed');
    expect(await totpRows('molly')).toHaveLength(0);
  });
});
