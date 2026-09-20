import ParseContext from '../ParseContext';
import type { WikiEngine } from '../ParseContext';

const mockEngine: WikiEngine = {
  getManager: vi.fn(() => null)
};

const make = (overrides: Record<string, unknown> = {}) =>
  new ParseContext(
    'test content',
    {
      pageName: 'TestPage',
      userContext: { isAuthenticated: true, roles: ['user'] },
      ...overrides
    },
    mockEngine
  );

// #1399: the synthesized stub no longer answers hasRole — a role name is not
// authority (security-posture P2), so no context exposes the question. The
// audience-matching that [{If role='…'}] needs is getPrincipals, below.

describe('ParseContext.wikiContext.getPrincipals (synthesized stub for direct callers)', () => {
  test('returns roles plus username for authenticated user', () => {
    const ctx = make({ userContext: { username: 'alice', roles: ['editor', 'reader'] } });
    expect(ctx.wikiContext.getPrincipals()).toEqual(['editor', 'reader', 'alice']);
  });

  test('returns roles only when no username present', () => {
    const ctx = make({ userContext: { roles: ['anonymous'] } });
    expect(ctx.wikiContext.getPrincipals()).toEqual(['anonymous']);
  });

  test('returns empty array when userContext is null', () => {
    const ctx = make({ userContext: null });
    expect(ctx.wikiContext.getPrincipals()).toEqual([]);
  });

  test('uses userName if username is absent (legacy field)', () => {
    const ctx = make({ userContext: { userName: 'alice', roles: ['editor'] } });
    expect(ctx.wikiContext.getPrincipals()).toEqual(['editor', 'alice']);
  });

  test('omits username when it equals "anonymous" (avoid leaking pseudo-user)', () => {
    const ctx = make({ userContext: { username: 'anonymous', roles: ['anonymous'] } });
    expect(ctx.wikiContext.getPrincipals()).toEqual(['anonymous']);
  });

  test('returned array does not alias userContext.roles', () => {
    const roles = ['editor'];
    const ctx = make({ userContext: { username: 'alice', roles } });
    const principals = ctx.wikiContext.getPrincipals();
    principals.push('mutated');
    expect(roles).toEqual(['editor']);
  });
});

// ─── #629: WikiContext delegation (Pass 2) ─────────────────────────────────

describe('ParseContext — wikiContext delegation (#629 Pass 2)', () => {
  // A minimal WikiContextLike fixture we can mutate during tests.
  function makeWikiContextLike(initial: {
    pageName?: string | null;
    userContext?: { username?: string; roles?: string[]; isAuthenticated?: boolean } | null;
    pageMetadata?: { title?: string; uuid?: string } | null;
  } = {}) {
    return {
      engine: mockEngine,
      pageName: initial.pageName ?? null,
      userContext: initial.userContext ?? null,
      pageMetadata: initial.pageMetadata ?? null,
      hasPermission: async () => false,
      canAccess: async () => false,
      getPrincipals: () => []
    };
  }

  test('direct construction synthesizes a wikiContext stub from the supplied PageContext', () => {
    const ctx = new ParseContext(
      'content',
      { pageName: 'Direct', userContext: { username: 'alice', roles: ['editor'] } },
      mockEngine
    );
    // wikiContext is always non-null after Pass 2 — synthesized stub from the
    // supplied PageContext mirrors the real WikiContext's shape.
    expect(ctx.wikiContext).not.toBeNull();
    expect(ctx.wikiContext.pageName).toBe('Direct');
    expect(ctx.wikiContext.userContext?.username).toBe('alice');
    expect(ctx.userName).toBe('alice');
  });

  test('synthesized stub answers getPrincipals using the snapshot userContext', () => {
    const ctx = new ParseContext(
      'content',
      { pageName: 'P', userContext: { username: 'alice', roles: ['editor', 'admin'] } },
      mockEngine
    );
    expect(ctx.wikiContext.getPrincipals()).toContain('admin');
    expect(ctx.wikiContext.getPrincipals()).toEqual(['editor', 'admin', 'alice']);
  });

  test('synthesized stub denies hasPermission/canAccess (no policy machinery available)', async () => {
    const ctx = new ParseContext(
      'content',
      { pageName: 'P', userContext: { username: 'alice', roles: ['admin'] } },
      mockEngine
    );
    // Direct callers don't have a real WikiContext, so the policy-evaluation
    // surfaces are deny-by-default. Real WikiContext callers get the real
    // PolicyEvaluator path through their hasPermission/canAccess.
    expect(await ctx.wikiContext.hasPermission('admin-system')).toBe(false);
    expect(await ctx.wikiContext.canAccess('view')).toBe(false);
  });

  test('nested with explicit wikiContext: the supplied wikiContext is used (not the snapshot)', () => {
    const wc = makeWikiContextLike({
      pageName: 'FromWiki',
      userContext: { username: 'bob', roles: ['admin'], isAuthenticated: true },
      pageMetadata: { title: 'FromWiki', uuid: 'u-1' }
    });
    const ctx = new ParseContext(
      'content',
      {
        pageContext: { pageName: 'StaleSnap', userContext: { username: 'old' } },
        engine: mockEngine,
        wikiContext: wc
      },
      mockEngine
    );
    expect(ctx.wikiContext).toBe(wc);
    expect(ctx.wikiContext.pageName).toBe('FromWiki');
    expect(ctx.wikiContext.userContext?.username).toBe('bob');
    expect(ctx.userName).toBe('bob');
    expect(ctx.wikiContext.pageMetadata?.uuid).toBe('u-1');
  });

  test('mutating wikiContext after construction is visible through ParseContext (live binding)', () => {
    const wc = makeWikiContextLike({
      pageName: 'Initial',
      userContext: { username: 'alice', roles: ['user'] }
    });
    const ctx = new ParseContext(
      'content',
      {
        pageContext: { pageName: 'StaleSnap' },
        engine: mockEngine,
        wikiContext: wc
      },
      mockEngine
    );
    expect(ctx.wikiContext.pageName).toBe('Initial');

    (wc as { pageName: string }).pageName = 'MutatedLive';
    (wc as { userContext: { username: string; roles: string[] } }).userContext = {
      username: 'mallory',
      roles: ['admin']
    };

    expect(ctx.wikiContext.pageName).toBe('MutatedLive');
    expect(ctx.wikiContext.userContext?.username).toBe('mallory');
    expect(ctx.userName).toBe('mallory');
  });

  test('clone() preserves the wikiContext reference', () => {
    const wc = makeWikiContextLike({
      pageName: 'Parent',
      userContext: { username: 'alice', roles: ['admin'] }
    });
    const parent = new ParseContext(
      'parent content',
      {
        pageContext: { pageName: 'ParentSnap' },
        engine: mockEngine,
        wikiContext: wc
      },
      mockEngine
    );
    const child = parent.clone();
    expect(child.wikiContext).toBe(wc);
    expect(child.wikiContext.pageName).toBe('Parent');
    expect(child.userName).toBe('alice');
  });
});
