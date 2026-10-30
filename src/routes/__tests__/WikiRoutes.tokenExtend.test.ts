/**
 * #1734 — POST /api/tokens/:id/extend. The route asks `token-extend` (step-up,
 * admin only by default): a stale session is told where to re-authenticate, a
 * person without the permission is refused, and nothing reaches the manager in
 * either case. The manager decides ownership and liveness (its own tests); the
 * route answers its null as 404 and its refusals as 400.
 *
 * Sabotaged once each (2026-10-12): the route asked `token-mint` instead of
 * `token-extend` (the step-up and non-holder tests went red), and the 404 for a null record
 * was answered 200 (the not-owner test went red).
 */
import WikiRoutes from '../WikiRoutes';
import AuthManager from '../../managers/AuthManager';

const res = () => ({
  status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), redirect: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis(), render: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis()
});

function routes(opts: { stale?: boolean; holds?: string[]; extend?: (...a: unknown[]) => Promise<unknown> } = {}) {
  const holds = new Set(opts.holds ?? ['token-mint', 'token-extend']);
  const authManager = {
    stepUpNeeded: vi.fn((action: string) => Boolean(opts.stale) && action === 'token-extend'),
    requiredAalFor: vi.fn(() => 1),
    engine: null as unknown,
    askForFreshSignIn(...a: Parameters<AuthManager['askForFreshSignIn']>) { return AuthManager.prototype.askForFreshSignIn.apply(this as never, a); },
    // #2154: a page's form POST is kept to be redone after the prompt.
    stepUpReplays: new Map(),
    keepStepUpReplay(...a: unknown[]) { return (AuthManager.prototype as unknown as { keepStepUpReplay: (...x: unknown[]) => unknown }).keepStepUpReplay.apply(this, a); },
    recordReauth: vi.fn().mockResolvedValue(undefined)
  };
  const tokens = { extend: vi.fn(opts.extend ?? (() => Promise.resolve({ id: 'tok_1', expiresAt: '2026-10-13T00:00:00.000Z' }))) };
  const managers: Record<string, unknown> = {
    AuthManager: authManager,
    AgentTokenManager: tokens,
    PolicyDecisionPoint: {
      permits: vi.fn((s: { signIn?: unknown; roles?: string[] }, action: string) =>
        Promise.resolve(holds.has(action) && !authManager.stepUpNeeded(action))),
      holds: vi.fn((_s: unknown, action: string) => Promise.resolve(holds.has(action)))
    },
    AuditManager: { logAuditEvent: vi.fn().mockResolvedValue('a') },
    ConfigurationManager: { getProperty: (k: string, d: unknown) => (k === 'ngdpbase.auth.agent-token.enabled' ? true : d) }
  };
  const engine = { getManager: vi.fn((n: string) => managers[n] ?? null) };
  authManager.engine = engine;
  const r = new WikiRoutes(engine) as unknown as Record<string, (q: unknown, s: unknown) => Promise<void>>;
  return { r, tokens };
}

const req = (extra: Record<string, unknown> = {}) => ({
  session: { username: 'molly', isAuthenticated: true }, body: { hours: 4 }, ip: '1.2.3.4', headers: {}, query: {},
  params: { id: 'tok_1' }, method: 'POST', originalUrl: '/api/tokens/tok_1/extend',
  get: (h: string) => (h === 'referer' ? 'https://wiki.example.com/profile' : 'ua'),
  userContext: { username: 'molly', roles: ['admin'], isAuthenticated: true },
  ...extra
});

describe('POST /api/tokens/:id/extend (#1734)', () => {
  test('a fresh holder extends: the manager is asked with the request subject and hours', async () => {
    const { r, tokens } = routes();
    const out = res();
    await r.extendAgentToken(req(), out);
    expect(tokens.extend).toHaveBeenCalledWith('tok_1', expect.objectContaining({ username: 'molly' }), 4);
    expect(out.json).toHaveBeenCalledWith({ success: true, record: { id: 'tok_1', expiresAt: '2026-10-13T00:00:00.000Z' } });
  });

  test('a stale session is told where to re-authenticate; nothing is extended', async () => {
    const { r, tokens } = routes({ stale: true });
    const out = res();
    await r.extendAgentToken(req(), out);
    expect(out.status).toHaveBeenCalledWith(403);
    expect(out.json).toHaveBeenCalledWith(expect.objectContaining({ reauth: expect.stringMatching(/^\/auth\/reauth\?next=/) }));
    expect(tokens.extend).not.toHaveBeenCalled();
  });

  test('a person who may mint but does not hold token-extend is refused', async () => {
    const { r, tokens } = routes({ holds: ['token-mint'] });
    const out = res();
    await r.extendAgentToken(req({ userContext: { username: 'molly', roles: ['reader'], isAuthenticated: true } }), out);
    expect(out.status).toHaveBeenCalledWith(403);
    expect(out.json).toHaveBeenCalledWith(expect.not.objectContaining({ reauth: expect.anything() }));
    expect(tokens.extend).not.toHaveBeenCalled();
  });

  test('another user\'s token answers 404, as if it did not exist', async () => {
    const { r } = routes({ extend: () => Promise.resolve(null) });
    const out = res();
    await r.extendAgentToken(req(), out);
    expect(out.status).toHaveBeenCalledWith(404);
  });

  test('a refusal from the manager (expired, revoked, at the cap) is a 400 with its message', async () => {
    const { r } = routes({ extend: () => Promise.reject(new Error('An expired or revoked token cannot be extended; mint a new one')) });
    const out = res();
    await r.extendAgentToken(req(), out);
    expect(out.status).toHaveBeenCalledWith(400);
    expect(out.json).toHaveBeenCalledWith({ success: false, error: 'An expired or revoked token cannot be extended; mint a new one' });
  });
});
