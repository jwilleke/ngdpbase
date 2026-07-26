/**
 * @file WikiRoutes-ContextToken.test.ts
 * @description #949 — a WikiContext must carry the agent-token detail from the
 * request.
 *
 * #946 raised the concern that sites constructing WikiContext directly could
 * "silently lose the token information: the scope gate would see no scopes and
 * the save path would stamp no via-token".
 *
 * Investigation found only three construction sites, all passing
 * `req.userContext` and `request: req`, and live audit confirms token-attributed
 * deletes carry the token id. So the concern does not currently reproduce.
 *
 * These tests exist to keep it that way — `viaToken` lives on `req.userContext`,
 * so anything that rebuilds or synthesises a user context instead of passing the
 * request's through would silently break attribution. That failure would be
 * invisible: the request still succeeds, it just stops being traceable to the
 * token.
 */
import WikiRoutes from '../WikiRoutes';

const VIA_TOKEN = { id: 'tok_abc123', name: 'claude-laptop', scopes: ['page-create', 'page-edit'] };

describe('#949 WikiContext preserves agent-token detail', () => {
  const makeRoutes = () => {
    const routes = Object.create(WikiRoutes.prototype) as {
      engine: unknown;
      createWikiContext(req: unknown, options?: Record<string, unknown>): { userContext?: unknown; request?: unknown };
    };
    routes.engine = { getManager: () => null };
    return routes;
  };

  const makeReq = (userContext: unknown) => ({
    userContext,
    session: {},
    headers: {},
    ip: '127.0.0.1'
  });

  test('viaToken survives onto the context', () => {
    const req = makeReq({ username: 'agent', isAuthenticated: true, roles: ['editor'], viaToken: VIA_TOKEN });

    const ctx = makeRoutes().createWikiContext(req, { pageName: 'Some Page' });

    expect((ctx.userContext as { viaToken?: unknown })?.viaToken).toEqual(VIA_TOKEN);
  });

  test('the scopes the ceiling depends on are intact', () => {
    // The scope gate reads these. If they were lost the token would appear
    // unrestricted, which is the failure #946 slice 1 actually hit on the live
    // permission path.
    const req = makeReq({ username: 'agent', isAuthenticated: true, viaToken: VIA_TOKEN });

    const ctx = makeRoutes().createWikiContext(req, { pageName: 'Some Page' });

    expect((ctx.userContext as { viaToken?: { scopes: string[] } })?.viaToken?.scopes)
      .toEqual(['page-create', 'page-edit']);
  });

  test('the original request is attached, not a synthesized one', () => {
    // Audit reads req.ip and the bearer detail off the real request.
    const req = makeReq({ username: 'agent', isAuthenticated: true, viaToken: VIA_TOKEN });

    const ctx = makeRoutes().createWikiContext(req, { pageName: 'Some Page' });

    expect(ctx.request).toBe(req);
  });

  test('a human session is unaffected — no viaToken invented', () => {
    const req = makeReq({ username: 'jim', isAuthenticated: true, roles: ['admin'] });

    const ctx = makeRoutes().createWikiContext(req, { pageName: 'Some Page' });

    expect((ctx.userContext as { viaToken?: unknown })?.viaToken).toBeUndefined();
    expect((ctx.userContext as { username?: string })?.username).toBe('jim');
  });

  test('an anonymous request does not throw', () => {
    // WikiContext normalises an absent user to null.
    const ctx = makeRoutes().createWikiContext(makeReq(undefined), { pageName: 'Some Page' });
    expect(ctx.userContext ?? null).toBeNull();
  });
});
