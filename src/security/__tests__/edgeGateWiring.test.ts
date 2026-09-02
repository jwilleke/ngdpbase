/**
 * The edge gate as wired (#1173 Part A) — integration, not matcher.
 *
 * `tokenRouteMap.test.ts` proves the decision function. This proves the thing
 * the decision function is useless without: that a token-bearing request is
 * actually refused before a handler runs, and that a SESSION request is not.
 *
 * The second half matters as much as the first. A gate that also refused
 * browsers would be discovered immediately and reverted; a gate that quietly
 * applied to sessions in some path would be found much later.
 *
 * The decision itself is `tokenGateRefusal`, imported — app.ts calls the same
 * function, so this is not a reproduction that can drift from the original. It
 * does not boot the app (`createApp` builds the engine, providers, and the
 * whole route tree, which no unit test here does); what it reproduces is only
 * the guard's PLACEMENT — inside the `viaToken` branch — which is the part
 * that decides whether sessions are affected.
 */
import express, { type Request, type Response, type NextFunction } from 'express';
import { tokenGateRefusal } from '../tokenRouteMap';

/**
 * The bearer-gate middleware exactly as app.ts applies it: only when a token is
 * present, refusing with 403 and the refusal kind.
 */
function bearerGate() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const viaToken = (req as Request & { viaToken?: { id: string; name: string; scopes: string[] } }).viaToken;
    if (!viaToken) { next(); return; }               // session request — untouched
    // `tokenGateRefusal` is app.ts's own call, not a copy of it — the refusal
    // body below is the one a real client receives.
    const refusal = tokenGateRefusal(req.method, req.path, viaToken.scopes);
    if (refusal) { res.status(403).json(refusal); return; }
    next();
  };
}

/** An app with a token injected (or not), and handlers that record being reached. */
function makeApp(token?: { id: string; name: string; scopes: string[] }) {
  const reached: string[] = [];
  const app = express();
  app.use((req, _res, next) => {
    if (token) (req as Request & { viaToken?: typeof token }).viaToken = token;
    next();
  });
  app.use(bearerGate());
  const mark = (name: string) => (_q: Request, s: Response) => { reached.push(name); s.json({ ok: true }); };
  app.post('/api/page/ingest', mark('ingest'));
  app.post('/api/tokens', mark('mint'));
  app.get('/api/admin/deleted-pages', mark('admin'));
  app.get('/api/page-source/:page', mark('source'));
  return { app, reached };
}

async function call(app: express.Express, method: string, path: string) {
  const server = app.listen(0);
  try {
    const port = (server.address() as { port: number }).port;
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { method });
    return { status: res.status, body: await res.json().catch(() => null) as { reason?: string } | null };
  } finally {
    server.close();
  }
}

const readToken = { id: 'tok-r', name: 'reader', scopes: ['page-read'] };
const ingestToken = { id: 'tok-i', name: 'ingester', scopes: ['page-create', 'page-edit'] };

describe('#1173 Part A — the gate refuses before the handler runs', () => {
  test('a token cannot mint another token', async () => {
    // The escalation that motivated Part A. POST /api/tokens checks
    // isAuthenticated and nothing else — no hasPermission call, so the scope
    // ceiling has nothing to run inside of. A page-read token could mint a
    // page-delete one; FORBIDDEN_SCOPE_PREFIX blocks only `admin-*`.
    const { app, reached } = makeApp(readToken);
    const r = await call(app, 'POST', '/api/tokens');
    expect(r.status).toBe(403);
    expect(r.body?.reason).toBe('unmapped');
    expect(reached).toEqual([]);          // the handler never ran
  });

  test('an admin surface is refused, and the handler never runs', async () => {
    const { app, reached } = makeApp(ingestToken);
    const r = await call(app, 'GET', '/api/admin/deleted-pages');
    expect(r.status).toBe(403);
    expect(reached).toEqual([]);
  });

  test('case does not get a request past the gate and into the handler', async () => {
    // Express routes /API/Tokens to the /api/tokens handler. If the gate were
    // case-sensitive the request would be ungated AND still served — the worst
    // of both. This is the assertion that pins the two together.
    const { app, reached } = makeApp(readToken);
    const r = await call(app, 'POST', '/API/Tokens');
    expect(r.status).toBe(403);
    expect(reached).toEqual([]);
  });

  test('a mapped surface with the wrong scope is refused as out-of-scope', async () => {
    const { app, reached } = makeApp(readToken);
    const r = await call(app, 'POST', '/api/page/ingest');
    expect(r.status).toBe(403);
    expect(r.body?.reason).toBe('out-of-scope');   // distinguishable from unmapped
    expect(reached).toEqual([]);
  });
});

describe('#1173 Part A — what the gate must NOT break', () => {
  test('a session request reaches every surface, gate or no gate', async () => {
    // No viaToken, so the guard is not entered at all. Asserted against the
    // routes a token is refused, so a gate that leaked into the session path
    // fails here rather than in production.
    for (const [method, path, name] of [
      ['POST', '/api/tokens', 'mint'],
      ['GET', '/api/admin/deleted-pages', 'admin'],
      ['POST', '/api/page/ingest', 'ingest']
    ] as const) {
      const { app, reached } = makeApp(undefined);
      const r = await call(app, method, path);
      expect(r.status).toBe(200);
      expect(reached).toEqual([name]);
    }
  });

  test('a token WITH the scope still reaches its surface', async () => {
    // The gate must not be trivially closed — a check that refuses everything
    // passes every refusal test and is useless.
    const { app, reached } = makeApp(ingestToken);
    const r = await call(app, 'POST', '/api/page/ingest');
    expect(r.status).toBe(200);
    expect(reached).toEqual(['ingest']);
  });

  test('a read token reaches the read surface, params and all', async () => {
    const { app, reached } = makeApp(readToken);
    const r = await call(app, 'GET', '/api/page-source/Welcome');
    expect(r.status).toBe(200);
    expect(reached).toEqual(['source']);
  });
});
