/**
 * #1572 — the sign-in bridge, end to end against the real provider: a fake
 * ngdpbase session stands in for the session middleware; the provider, the
 * store and the routes are the real ones. A temp instance directory per test;
 * the temp directory is all that is removed.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import OidcManager, { OIDC_COOKIE_KEYS_ENV, OIDC_INTERACTION_PREFIX, OIDC_JWKS_ENV, OIDC_MOUNT } from '../../managers/OidcManager';
import { consentLines, freshSignInNeeded, registerOidcRoutes } from '../OidcRoutes';

const BASE = 'http://localhost:3000';
const REDIRECT = 'https://app.example.com/cb';
const ENV_NAMES = [OIDC_JWKS_ENV, OIDC_COOKIE_KEYS_ENV];

interface FakeSession {
  username?: string;
  signIn?: { provider: string; factors: never[]; amr: string[]; aal: 2; acr: 'phr'; mfa: boolean; at: string };
}

const decodeJwt = (jwt: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()) as Record<string, unknown>;

describe('OIDC sign-in bridge (#1572)', () => {
  let dir: string;
  let views: string;
  let session: FakeSession;
  let manager: OidcManager;
  let audited: Array<Record<string, unknown>>;
  let app: express.Express;
  const saved: Record<string, string | undefined> = {};

  const signIn = (username = 'jim', at = new Date()) => {
    session = { username, signIn: { provider: 'passkey', factors: [], amr: ['hwk', 'user'], aal: 2, acr: 'phr', mfa: false, at: at.toISOString() } };
  };

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-1572-'));
    views = path.join(dir, 'views');
    fs.mkdirSync(views);
    for (const v of ['oidc-consent', 'error']) fs.writeFileSync(path.join(views, `${v}.ejs`), '');
    for (const name of ENV_NAMES) { saved[name] = process.env[name]; delete process.env[name]; }
    session = {};
    audited = [];

    const custom: Record<string, unknown> = {
      'oidc-auth-server.enabled': true,
      'oidc-auth-server.clients': [{
        client_id: 'app', client_name: 'Test App', token_endpoint_auth_method: 'none',
        redirect_uris: [REDIRECT], grant_types: ['authorization_code'], response_types: ['code']
      }]
    };
    const users: Record<string, { username: string; displayName: string; isActive: boolean }> = {
      jim: { username: 'jim', displayName: 'Jim', isActive: true },
      sam: { username: 'sam', displayName: 'Sam', isActive: true }
    };
    const managers: Record<string, unknown> = {
      ConfigurationManager: {
        getProperty: (k: string, d: unknown) => (k in custom ? custom[k] : d),
        getCustomProperties: () => custom,
        isBaseUrlExplicit: () => true,
        getBaseURL: () => BASE,
        getInstanceDataFolder: () => dir
      },
      UserManager: { getUser: (u: string) => Promise.resolve(users[u]) },
      AuditManager: { logAuditEvent: (e: Record<string, unknown>) => { audited.push(e); return Promise.resolve('evt'); } }
    };
    manager = new OidcManager({ getManager: (n: string) => managers[n] ?? null });
    await manager.initialize();
    const handler = manager.start({ trustProxy: false })!;

    app = express();
    // What app.ts does: the provider first, the interaction path passed on.
    app.use(OIDC_MOUNT, (req: Request, res: Response, next: NextFunction) => {
      if (req.url.startsWith(OIDC_INTERACTION_PREFIX)) { next(); return; }
      void handler(req, res);
    });
    app.use(express.urlencoded({ extended: false }));
    // Stand-in for the session middleware.
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as unknown as { session: FakeSession }).session = session;
      (req as unknown as { userContext: unknown }).userContext = { username: session.username ?? 'anonymous', roles: [], isAuthenticated: Boolean(session.username) };
      next();
    });
    // Views render their locals as JSON, so the test reads what the page was given.
    app.engine('ejs', (file: string, locals: Record<string, unknown>, cb: (e: unknown, s?: string) => void) =>
      cb(null, JSON.stringify({ view: path.basename(file, '.ejs'), clientName: locals.clientName, lines: locals.lines, uid: locals.uid, message: locals.message })));
    app.set('view engine', 'ejs');
    app.set('views', views);
    registerOidcRoutes(app, { oidc: manager, templateData: () => Promise.resolve({ csrfToken: 't' }) });
  });

  afterEach(() => {
    for (const name of ENV_NAMES) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; }
    // Only the per-test temp directory — never a live data tree.
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const pkce = () => {
    const verifier = randomBytes(32).toString('base64url');
    return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
  };

  /** Start an authorization request; returns the agent and the interaction path it was sent to. */
  const authorize = async (agent: ReturnType<typeof request.agent>, extra: Record<string, string> = {}) => {
    const { verifier, challenge } = pkce();
    const query = new URLSearchParams({
      client_id: 'app', redirect_uri: REDIRECT, response_type: 'code', scope: 'openid profile', state: 's1',
      code_challenge: challenge, code_challenge_method: 'S256', ...extra
    });
    const res = await agent.get(`/oidc/auth?${query.toString()}`);
    return { res, verifier };
  };

  /** Follow same-site redirects until one leaves for the app or stops. */
  const follow = async (agent: ReturnType<typeof request.agent>, res: request.Response): Promise<request.Response> => {
    let current = res;
    for (let i = 0; i < 10 && current.status >= 300 && current.status < 400; i++) {
      const location = current.headers.location as string;
      if (location.startsWith(REDIRECT)) return current;
      current = await agent.get(new URL(location, BASE).pathname + new URL(location, BASE).search);
    }
    return current;
  };

  const codeFrom = (res: request.Response): URL => new URL(res.headers.location as string);

  test('signed out: the bridge sends the person to /login and back to this request', async () => {
    const agent = request.agent(app);
    const { res } = await authorize(agent);
    const interaction = new URL(res.headers.location as string, BASE).pathname;
    expect(interaction).toMatch(/^\/oidc\/interaction\//);
    const bridge = await agent.get(interaction);
    expect(bridge.status).toBe(302);
    expect(bridge.headers.location).toBe(`/login?redirect=${encodeURIComponent(interaction)}`);
  });

  test('signed in: consent once, then a code whose ID token carries the session\'s amr and acr', async () => {
    signIn();
    const agent = request.agent(app);
    const { res, verifier } = await authorize(agent);
    const consent = await follow(agent, res);
    const page = JSON.parse(consent.text) as { view: string; clientName: string; lines: Array<{ scope: string }>; uid: string };
    expect(page.view).toBe('oidc-consent');
    expect(page.clientName).toBe('Test App');
    expect(page.lines.map((l) => l.scope)).toEqual(['openid', 'profile']);

    const back = await follow(agent, await agent.post(`/oidc/interaction/${page.uid}/allow`));
    const url = codeFrom(back);
    expect(url.searchParams.get('state')).toBe('s1');
    const code = url.searchParams.get('code');

    const token = await agent.post('/oidc/token').type('form')
      .send({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: 'app', code_verifier: verifier });
    expect(token.status).toBe(200);
    const idToken = decodeJwt((token.body as { id_token: string }).id_token);
    expect(idToken).toMatchObject({ sub: 'jim', acr: 'phr', amr: ['hwk', 'user'], iss: `${BASE}/oidc` });
    expect(idToken).not.toHaveProperty('roles');

    // #1575: the provider's events land in ngdpbase's audit log, as the account, about the app.
    await new Promise((r) => setImmediate(r));
    expect(audited).toContainEqual(expect.objectContaining({ eventType: 'oidcauthorize-allow', user: 'jim', resource: 'app', resourceType: 'oidc-client', result: 'success' }));
    expect(audited).toContainEqual(expect.objectContaining({ eventType: 'oidctoken-issue', resource: 'app', metadata: expect.objectContaining({ grantType: 'authorization_code' }) }));
    expect(JSON.stringify(audited)).not.toContain(code);

    // Asked once per app: the same app again goes straight back with a code.
    const again = await follow(agent, (await authorize(agent)).res);
    expect(codeFrom(again).searchParams.get('code')).toBeTruthy();
  });

  test('Deny ends the request with access_denied and no code', async () => {
    signIn();
    const agent = request.agent(app);
    const consent = await follow(agent, (await authorize(agent)).res);
    const { uid } = JSON.parse(consent.text) as { uid: string };
    const back = await follow(agent, await agent.post(`/oidc/interaction/${uid}/deny`));
    expect(codeFrom(back).searchParams.get('error')).toBe('access_denied');
    expect(codeFrom(back).searchParams.get('code')).toBeNull();
  });

  test('a code presented twice is recorded as oidctoken-reuse, high severity (#1575)', async () => {
    signIn();
    const agent = request.agent(app);
    const { res, verifier } = await authorize(agent);
    const consent = await follow(agent, res);
    const back = await follow(agent, await agent.post(`/oidc/interaction/${(JSON.parse(consent.text) as { uid: string }).uid}/allow`));
    const code = codeFrom(back).searchParams.get('code');
    const exchange = () => agent.post('/oidc/token').type('form')
      .send({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: 'app', code_verifier: verifier });
    expect((await exchange()).status).toBe(200);
    expect((await exchange()).status).toBe(400);
    await new Promise((r) => setImmediate(r));
    expect(audited).toContainEqual(expect.objectContaining({ eventType: 'oidctoken-reuse', severity: 'high', result: 'failure' }));
  });

  test('prompt=login against an older sign-in is refused with login_required, not looped', async () => {
    signIn('jim', new Date(Date.now() - 3600_000));
    const agent = request.agent(app);
    const back = await follow(agent, (await authorize(agent, { prompt: 'login consent' })).res);
    expect(codeFrom(back).searchParams.get('error')).toBe('login_required');
  });

  test('consent is only for the person the request was signed in as', async () => {
    signIn('jim');
    const agent = request.agent(app);
    const consent = await follow(agent, (await authorize(agent)).res);
    const { uid } = JSON.parse(consent.text) as { uid: string };
    signIn('sam');
    const back = await follow(agent, await agent.post(`/oidc/interaction/${uid}/allow`));
    expect(back.status).toBe(400);
    expect((JSON.parse(back.text) as { view: string }).view).toBe('error');
  });

  test('the consent page is not shown to someone else signed in on the same browser', async () => {
    signIn('jim');
    const agent = request.agent(app);
    const consent = await follow(agent, (await authorize(agent)).res);
    const { uid } = JSON.parse(consent.text) as { uid: string };
    signIn('sam');
    const page = await follow(agent, await agent.get(`/oidc/interaction/${uid}`));
    expect(codeFrom(page).searchParams.get('error')).toBe('login_required');
  });

  test('signing out of ngdpbase ends the provider session: the next request asks ngdpbase again', async () => {
    signIn();
    const agent = request.agent(app);
    const consent = await follow(agent, (await authorize(agent)).res);
    await follow(agent, await agent.post(`/oidc/interaction/${(JSON.parse(consent.text) as { uid: string }).uid}/allow`));

    expect(await manager.endSessionsFor('jim')).toBe(1);
    session = {};
    const { res } = await authorize(agent);
    const bridge = await agent.get(new URL(res.headers.location as string, BASE).pathname);
    expect(bridge.headers.location).toMatch(/^\/login\?redirect=/);
  });

  test('an unknown or used interaction renders the expired page', async () => {
    signIn();
    const res = await request(app).get('/oidc/interaction/not-a-real-uid');
    expect(res.status).toBe(400);
    expect((JSON.parse(res.text) as { view: string }).view).toBe('error');
  });
});

describe('bridge rules (#1572)', () => {
  test('freshSignInNeeded: a sign-in after the request began is always fresh', () => {
    expect(freshSignInNeeded({ prompt: 'login' }, 1000, 900, 1100)).toBeNull();
    expect(freshSignInNeeded({ prompt: 'login' }, 800, 900, 1100)).toMatch(/sign in again/);
    expect(freshSignInNeeded({ max_age: 60 }, 800, 900, 1100)).toMatch(/more recent sign-in/);
    expect(freshSignInNeeded({ max_age: 600 }, 800, 900, 1100)).toBeNull();
    expect(freshSignInNeeded({}, 800, 900, 1100)).toBeNull();
  });

  test('consentLines: described scopes, unknown ones by name, no repeats', () => {
    expect(consentLines('openid email openid custom:read')).toEqual([
      { scope: 'openid', text: 'Confirm who you are (your username)' },
      { scope: 'email', text: 'Your email address' },
      { scope: 'custom:read', text: 'custom:read' }
    ]);
  });
});
