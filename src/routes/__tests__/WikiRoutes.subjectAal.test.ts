/**
 * #2261 slice 3 — what the routes do about a sign-in level.
 *
 * A request for an action whose policy needs `subject:aal` that comes from
 * someone not signed in has no level, so policy refuses it; the route then
 * answers as it does for any action that needs an account: a redirect to the
 * sign-in page (a page), a 401 (JSON), never a bare 403. A signed-in person
 * below the level is refused with a 403, not sent to sign in. And minting a
 * token takes no level from the request: the manager reads the session.
 */
import WikiRoutes from '../WikiRoutes';

const createMockReq = (userContext: unknown, extra: Record<string, unknown> = {}) => ({
  params: {}, query: {}, body: {}, session: { csrfToken: 'tok' }, path: '/edit/Home', originalUrl: '/edit/Home', protocol: 'http',
  get: vi.fn().mockReturnValue('localhost:3000'), userContext, ...extra
});
const createMockRes = () => ({
  status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis(),
  redirect: vi.fn().mockReturnThis(), render: vi.fn().mockReturnThis(), setHeader: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis(),
  req: { originalUrl: '/edit/Home' }
});

function makeRoutes(managers: Record<string, unknown> = {}) {
  const engine = {
    getManager: vi.fn((name: string) => {
      // Policy needs a level this subject does not have: it neither permits nor holds.
      if (name === 'PolicyDecisionPoint') return { permits: vi.fn(() => Promise.resolve(false)), holds: vi.fn(() => Promise.resolve(false)), decide: vi.fn(() => Promise.resolve({ permit: false, applicable: true, reason: 'policy_deny', policyIds: [] })) };
      if (name === 'ConfigurationManager') return { getProperty: vi.fn((k: string, d: unknown) => (k === 'ngdpbase.auth.agent-token.enabled' ? true : d)) };
      return managers[name] ?? null;
    })
  };
  const routes = new WikiRoutes(engine);
  vi.spyOn(routes as never, 'getCommonTemplateData').mockResolvedValue({});
  vi.spyOn(routes as never, 'renderError').mockResolvedValue(undefined);
  return routes as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
}

const anonymous = { username: 'Anonymous', isAuthenticated: false, roles: ['anonymous'] };
const editor = { username: 'ed', isAuthenticated: true, roles: ['editor'] };

describe('#2261 a refused action that needs a sign-in level', () => {
  test('a page request from someone not signed in is redirected to sign-in, returning here', async () => {
    const res = createMockRes();
    await makeRoutes().permitRequest(createMockReq(anonymous), res, 'page-edit', 'page');
    expect(res.redirect).toHaveBeenCalledWith('/login?redirect=' + encodeURIComponent('/edit/Home'));
    expect(res.status).not.toHaveBeenCalledWith(403);
  });

  test('a JSON request from someone not signed in is a 401, not a 403', async () => {
    const res = createMockRes();
    await makeRoutes().permitRequest(createMockReq(anonymous), res, 'page-edit', 'json');
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('someone signed in below the level is refused, not sent to sign in', async () => {
    const res = createMockRes();
    await makeRoutes().permitRequest(createMockReq(editor), res, 'page-edit', 'json');
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.redirect).not.toHaveBeenCalled();
  });
});

describe('#2261 POST /api/tokens takes no level from the request', () => {
  test('the manager is handed the session\'s subject, the name, scopes and ttl; an aal in the body goes nowhere', async () => {
    const mint = vi.fn(() => Promise.resolve({ token: 'ngdp_at_x', record: { id: 'tok_1', name: 'n', scopes: ['page-read'], expiresAt: 'x' } }));
    const engine = {
      getManager: vi.fn((name: string) => {
        if (name === 'PolicyDecisionPoint') return { permits: vi.fn(() => Promise.resolve(true)) };
        if (name === 'ConfigurationManager') return { getProperty: vi.fn((k: string, d: unknown) => (k === 'ngdpbase.auth.agent-token.enabled' ? true : d)) };
        if (name === 'AgentTokenManager') return { mint };
        return null;
      })
    };
    const routes = new WikiRoutes(engine);
    vi.spyOn(routes as never, 'getCommonTemplateData').mockResolvedValue({});
    const session = { ...editor, signIn: { provider: 'password', factors: [], at: '2026-01-01T00:00:00Z', aal: 1 } };
    const res = createMockRes();
    await (routes as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>).mintAgentToken(
      createMockReq(session, { body: { name: 'n', scopes: ['page-read'], ttlHours: 1, aal: 3, grantedAal: 3, signIn: { aal: 3 } } }), res);
    expect(mint).toHaveBeenCalledTimes(1);
    const args = mint.mock.calls[0] as unknown[];
    expect(args).toEqual([session, 'n', ['page-read'], 1]);
    expect((args[0] as typeof session).signIn.aal).toBe(1);
  });
});
