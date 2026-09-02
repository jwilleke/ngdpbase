/**
 * #1165 — getCurrentUser() returned Anonymous for every authenticated user.
 *
 * It read `req.session.user.isAuthenticated`. Nothing in the codebase writes
 * `req.session.user`: every login path writes the flat `session.username` +
 * `session.isAuthenticated`, which is also what the session middleware reads.
 * So the condition was never true, for anybody, ever.
 *
 * It survived because the one hot caller guards against it —
 * `getCommonTemplateData` uses `req.userContext || getCurrentUser(req)`, so
 * every rendered page took the first branch and looked right. The audit routes
 * call it directly, so they were where it surfaced: `AuditManager` refused the
 * query as 'Anonymous' on a request the route had just authorised as an admin,
 * 1 ms apart in the same log.
 *
 * The tests below are written against the session shape that is ACTUALLY
 * WRITTEN. A test using `session.user` would have passed against the broken
 * code and is how this stayed hidden.
 */
vi.unmock('../UserManager');

import UserManager from '../UserManager';

type Req = Record<string, unknown>;

function makeManager(users: Record<string, { username: string; isActive: boolean; roles?: string[] }>) {
  const m = new UserManager({ getManager: () => null });
  // The provider is the only thing getCurrentUser needs beyond the request.
  (m as unknown as { provider: unknown }).provider = {
    getUser: (username: string) => Promise.resolve(users[username] ?? null)
  };
  return m;
}

const jim = { username: 'jim', isActive: true, roles: ['admin'] };

describe('#1165 — the session shape that login actually writes', () => {
  test('an authenticated session resolves to that user, not Anonymous', async () => {
    // The regression in one assertion. Every login path writes exactly this
    // shape: WikiRoutes.ts:6786, :7002, :7081 and app.ts:657.
    const m = makeManager({ jim });
    const req = { session: { username: 'jim', isAuthenticated: true } } as Req;

    const user = await m.getCurrentUser(req);
    expect(user.username).toBe('jim');
    expect(user.isAuthenticated).toBe(true);
  });

  test('session.user is NOT consulted — nothing writes it', async () => {
    // Pinning the negative: if someone reinstates a read of `session.user`,
    // this stays green only while the flat fields are also honoured. The point
    // is that the flat shape alone is sufficient.
    const m = makeManager({ jim });
    const req = { session: { username: 'jim', isAuthenticated: true, user: undefined } } as Req;
    expect((await m.getCurrentUser(req as never)).username).toBe('jim');
  });

  test('an unauthenticated session is Anonymous', async () => {
    const m = makeManager({ jim });
    const req = { session: { username: 'jim', isAuthenticated: false } } as Req;
    expect((await m.getCurrentUser(req as never)).isAuthenticated).toBeFalsy();
  });

  test('a session naming an inactive user is Anonymous', async () => {
    const m = makeManager({ jim: { ...jim, isActive: false } });
    const req = { session: { username: 'jim', isAuthenticated: true } } as Req;
    expect((await m.getCurrentUser(req as never)).isAuthenticated).toBeFalsy();
  });

  test('no session at all is Anonymous', async () => {
    const m = makeManager({ jim });
    expect((await m.getCurrentUser({})).isAuthenticated).toBeFalsy();
  });
});

describe('#1165 — req.userContext is preferred over the session', () => {
  test('the already-resolved context wins', async () => {
    // This is the identity the middleware resolved, enriched with roles from
    // RoleManager, and the one the policy engine authorises against. Answering
    // from it means this method and every permission check agree, instead of
    // reading two different places and disagreeing — which is the bug.
    const m = makeManager({});   // provider knows nobody
    const req = {
      userContext: { username: 'jim', isAuthenticated: true, roles: ['admin', 'All'] }
    } as Req;

    const user = await m.getCurrentUser(req);
    expect(user.username).toBe('jim');
    expect(user.roles).toContain('admin');
  });

  test('a bearer-token request has no session and still resolves (#818)', async () => {
    // Agent-token requests carry no session at all, so the session path alone
    // would have said Anonymous even after the field name was corrected.
    const m = makeManager({});
    const req = { userContext: { username: 'agent', isAuthenticated: true } } as Req;
    expect((await m.getCurrentUser(req as never)).username).toBe('agent');
  });

  test('an anonymous userContext does not shadow a valid session', async () => {
    // The middleware sets an anonymous context when it cannot resolve one.
    // That must not preempt the session lookup, or the fix would introduce the
    // mirror image of the bug it removes.
    const m = makeManager({ jim });
    const req = {
      userContext: { username: 'Anonymous', isAuthenticated: false },
      session: { username: 'jim', isAuthenticated: true }
    } as Req;
    expect((await m.getCurrentUser(req as never)).username).toBe('jim');
  });
});
