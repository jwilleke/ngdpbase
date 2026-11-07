/**
 * #2298 — the signed-out write gate, held against every write route the
 * application registers (the route inventory) and against the list.
 */
import express from 'express';
import request from 'supertest';
import { addonDeclarations, collectRoutes, isWriteMethod, type RouteRecord } from '../../../scripts/route-inventory';
import { signedOutWriteGate } from '../signedOutWriteGate';
import {
  CORE_SIGNED_OUT_WRITES, declareAddonSignedOutWrite, resetSignedOutWrites, sealSignedOutWrites,
  signedOutWriteReason, signedOutWriteRoutes
} from '../../security/signedOutWrites';

const sample = (p: string): string => p.replace(/:[A-Za-z]+/g, 'x');

function appWith(routes: Array<{ method: string; path: string }>, who: 'anonymous' | 'user' | 'bearer', pip = { recordRouteRefusal: vi.fn().mockResolvedValue(undefined) }) {
  const reached: string[] = [];
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use((req, _res, next) => {
    (req as unknown as { userContext: unknown }).userContext = who === 'user'
      ? { username: 'ed', isAuthenticated: true }
      : { username: 'Anonymous', isAuthenticated: false, ipAddress: req.ip };
    if (who === 'bearer') {
      (req as unknown as { userContext: unknown }).userContext = { username: 'agent', isAuthenticated: true };
      (req as unknown as { bearerAuth: boolean }).bearerAuth = true;
    }
    next();
  });
  app.use(signedOutWriteGate({ getManager: (n: string) => (n === 'PolicyInformationPoint' ? pip : null) }));
  for (const r of routes) {
    (app as unknown as Record<string, (p: string, h: unknown) => void>)[r.method.toLowerCase()](r.path, (req: express.Request, res: express.Response) => {
      reached.push(`${req.method} ${req.path}`);
      res.status(200).send('reached');
    });
  }
  return { app, reached, pip };
}

let writes: RouteRecord[] = [];
beforeAll(async () => {
  writes = (await collectRoutes()).filter((r) => isWriteMethod(r.method));
}, 60_000);
afterEach(() => resetSignedOutWrites());

describe('the inventory', () => {
  test('finds core, install, bridge and add-on write routes', () => {
    const origins = new Set(writes.map((r) => r.origin));
    expect(writes.length).toBeGreaterThan(150);
    expect([...origins]).toEqual(expect.arrayContaining(['core', 'install', 'oidc-bridge', 'addon:forms', 'addon:calendar', 'addon:journal']));
  });
});

describe('every listed route is a registered route, with a reason', () => {
  test.each(CORE_SIGNED_OUT_WRITES.map((r) => [`${r.method} ${r.path}`, r] as const))('%s', (_n, entry) => {
    expect(entry.reason.trim()).not.toBe('');
    expect(writes.some((w) => w.method === entry.method && w.path === entry.path)).toBe(true);
  });
});

describe('a signed-out write to any registered write route', () => {
  test('is refused unless the route is listed — named when it is not', async () => {
    // Every add-on's declarations, read from its register() as written.
    const declared = addonDeclarations();
    expect(declared.map((d) => `${d.slug} ${d.method} ${d.path}`)).toEqual(['forms POST /api/forms/submit/:formId']);
    for (const d of declared) declareAddonSignedOutWrite(d.slug, { method: d.method as 'POST', path: d.path, reason: d.reason });
    const bypassed: string[] = [];
    const { app, reached } = appWith(writes.map((w) => ({ method: w.method, path: w.path })), 'anonymous');
    for (const w of writes) {
      const listed = signedOutWriteReason(w.method, sample(w.path)) !== null;
      const agent = request(app) as unknown as Record<string, (u: string) => request.Test>;
      const before = reached.length;
      const r = await agent[w.method.toLowerCase()](sample(w.path)).set('Accept', 'application/json').send({});
      const through = reached.length > before;
      if (through !== listed) bypassed.push(`${w.method} ${w.path} (${w.origin}, ${w.file}:${w.line}) ${through ? 'reached the handler signed out but is not listed' : 'is listed but was refused'}`);
      if (!listed) expect(r.status).toBe(401);
    }
    expect(bypassed).toEqual([]);
  }, 120_000);

  test('a form is sent to sign-in, JSON gets 401, and the answer does not depend on the route or its target', async () => {
    const { app } = appWith([{ method: 'POST', path: '/save/:page' }], 'anonymous');
    const form = (url: string) => request(app).post(url).set('Accept', 'text/html').type('form').send({ content: 'x' });
    const existing = await form('/save/Main');
    const missing = await form('/save/NoSuchPage');
    const nowhere = await form('/no/such/route');
    for (const r of [existing, missing, nowhere]) {
      expect(r.status).toBe(302);
      expect(r.headers.location).toBe('/login?redirect=%2F');
    }
    const json = await request(app).delete('/api/page/Nope').set('Accept', 'application/json');
    expect(json.status).toBe(401);
    expect(json.body).toEqual(expect.objectContaining({ success: false, error: 'Authentication required' }));
    for (const method of ['put', 'patch'] as const) {
      expect((await request(app)[method]('/anything').send({})).status).toBe(401);
    }
  });

  test('the sign-in address comes back through safeRedirect: an off-site Referer is dropped, the site\'s own kept', async () => {
    const { app } = appWith([], 'anonymous');
    const post = (referer: string) => request(app).post('/save/Home').set('Host', 'wiki.test').set('Referer', referer).set('Accept', 'text/html').type('form').send({});
    expect((await post('https://wiki.test/edit/Home?x=1')).headers.location).toBe('/login?redirect=' + encodeURIComponent('/edit/Home?x=1'));
    expect((await post('https://evil.example/edit/Home')).headers.location).toBe('/login?redirect=%2F');
  });

  test('is recorded as a refusal with the route, never the query or the body', async () => {
    const pip = { recordRouteRefusal: vi.fn().mockResolvedValue(undefined) };
    const { app } = appWith([], 'anonymous', pip);
    await request(app).post('/save/Home?token=secret-query').type('form').send({ password: 'secret-body' });
    expect(pip.recordRouteRefusal).toHaveBeenCalledTimes(1);
    const [, route] = pip.recordRouteRefusal.mock.calls[0];
    expect(route).toBe('POST /save/Home');
    expect(JSON.stringify(pip.recordRouteRefusal.mock.calls)).not.toMatch(/secret/);
  });

  test('a new write route that nobody listed is refused, and the failing check names it', async () => {
    const { app, reached } = appWith([{ method: 'POST', path: '/brand-new/write' }], 'anonymous');
    const r = await request(app).post('/brand-new/write').set('Accept', 'application/json');
    expect(r.status).toBe(401);
    expect(reached).toEqual([]);
    expect(signedOutWriteReason('POST', '/brand-new/write')).toBeNull();
  });
});

describe('who counts as signed in', () => {
  const routes = [{ method: 'POST', path: '/save/:page' }, { method: 'GET', path: '/view/:page' }];
  test('a signed-in session reaches the route', async () => {
    const { app } = appWith(routes, 'user');
    expect((await request(app).post('/save/x').send({})).status).toBe(200);
  });
  test('a valid Bearer token reaches the route', async () => {
    const { app } = appWith(routes, 'bearer');
    expect((await request(app).post('/save/x').send({})).status).toBe(200);
  });
  test('reads are not held', async () => {
    const { app } = appWith(routes, 'anonymous');
    expect((await request(app).get('/view/x')).status).toBe(200);
  });
});

describe('the list matches like Express does', () => {
  test('case and a trailing slash match, a longer or other path does not', () => {
    expect(signedOutWriteReason('POST', '/LOGIN')).not.toBeNull();
    expect(signedOutWriteReason('POST', '/login/')).not.toBeNull();
    expect(signedOutWriteReason('POST', '/login/other')).toBeNull();
    expect(signedOutWriteReason('POST', '//login')).toBeNull();
    expect(signedOutWriteReason('GET', '/login')).toBeNull();
    expect(signedOutWriteReason('DELETE', '/login')).toBeNull();
    expect(signedOutWriteReason('POST', '/login/second-factor/totp')).not.toBeNull();
  });
});

describe('add-ons declare their own routes, and nothing else', () => {
  test('a route under the add-on\'s own path is added', () => {
    declareAddonSignedOutWrite('forms', { method: 'POST', path: '/api/forms/submit/:formId', reason: 'public form' });
    expect(signedOutWriteReason('POST', '/api/forms/submit/contact')).toBe('public form');
    expect(signedOutWriteRoutes().find((r) => r.owner === 'forms')).toBeTruthy();
  });
  test.each([
    ['another add-on\'s path', { method: 'POST', path: '/api/calendar/events', reason: 'x' }],
    ['a core path', { method: 'POST', path: '/save/:page', reason: 'x' }],
    ['a path that only starts like its own', { method: 'POST', path: '/api/forms-evil/x', reason: 'x' }],
    ['a path that climbs out', { method: 'POST', path: '/api/forms/../save', reason: 'x' }],
    ['a wildcard', { method: 'POST', path: '/api/forms/*', reason: 'x' }],
    ['a pattern', { method: 'POST', path: '/api/forms/(.*)', reason: 'x' }],
    ['a read method', { method: 'GET', path: '/api/forms/x', reason: 'x' }],
    ['no reason', { method: 'POST', path: '/api/forms/x', reason: ' ' }]
  ])('refuses %s', (_name, route) => {
    expect(() => declareAddonSignedOutWrite('forms', route as never)).toThrow(/forms/);
    expect(signedOutWriteRoutes().filter((r) => r.owner === 'forms')).toEqual([]);
  });
  test('refuses once the list is sealed', () => {
    sealSignedOutWrites();
    expect(() => declareAddonSignedOutWrite('forms', { method: 'POST', path: '/api/forms/x', reason: 'late' })).toThrow(/sealed/);
  });
});
