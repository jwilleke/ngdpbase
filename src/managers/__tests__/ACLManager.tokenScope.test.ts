/**
 * ACLManager — agent-token scope ceiling (#946).
 *
 * A delegated token may only exercise a SUBSET of its owner's rights, so the
 * scope check is a hard ceiling evaluated BEFORE every tier — not a tier of its
 * own.
 *
 * The critical case is frontmatter: tier 1 (`audience`/`access`) overrides
 * global policies and returns directly, so a scope check living at tier 2 would
 * never run on a page whose frontmatter grants the action. These tests pin that
 * ordering.
 */

import ACLManager from '../ACLManager';

function makeEngine() {
  return {
    getManager: (name: string) => {
      if (name === 'ConfigurationManager') {
        return {
          getProperty: (_k: string, d: unknown) => d,
          getResolvedDataPath: () => '/tmp/ngdp-acl-token-test',
          isInitialized: () => true
        };
      }
      if (name === 'PolicyEvaluator') {
        // Would allow everything — proves the scope gate denies before policies.
        return {
          evaluateAccess: async () => ({
            hasDecision: true, allowed: true, reason: 'test', policyName: 'allow-all'
          })
        };
      }
      return null;
    }
  } as never;
}

function ctx(opts: {
  scopes?: string[];
  pageMetadata?: Record<string, unknown>;
  username?: string;
}) {
  const userContext: Record<string, unknown> = {
    username: opts.username ?? 'jim',
    roles: ['editor', 'Authenticated', 'All'],
    isAuthenticated: true
  };
  if (opts.scopes) {
    userContext.viaToken = { id: 'tok_test', name: 'claude-laptop', scopes: opts.scopes };
  }
  return {
    pageName: 'TestPage',
    content: 'hello',
    context: 'view',
    userContext,
    pageMetadata: opts.pageMetadata ?? {}
  } as never;
}

describe('ACLManager agent-token scope ceiling (#946)', () => {
  let acl: ACLManager;

  beforeEach(async () => {
    acl = new ACLManager(makeEngine());
    await acl.initialize();
  });

  test('an in-scope action is permitted', async () => {
    const allowed = await acl.checkPagePermissionWithContext(ctx({ scopes: ['page-edit'] }), 'edit');
    expect(allowed).toBe(true);
  });

  test('an out-of-scope action is denied even though policies would allow it', async () => {
    const allowed = await acl.checkPagePermissionWithContext(ctx({ scopes: ['page-ingest'] }), 'delete');
    expect(allowed).toBe(false);
  });

  test('an ingest-scoped token cannot rename', async () => {
    const allowed = await acl.checkPagePermissionWithContext(ctx({ scopes: ['page-ingest'] }), 'rename');
    expect(allowed).toBe(false);
  });

  test('the ceiling beats permissive frontmatter (tier 1 would otherwise win)', async () => {
    // Tier 1 returns directly and overrides global policies. If the scope check
    // ran at tier 2 this would wrongly allow.
    const allowed = await acl.checkPagePermissionWithContext(
      ctx({
        scopes: ['page-ingest'],
        pageMetadata: { access: { delete: ['jim'] }, audience: ['All'] }
      }),
      'delete'
    );
    expect(allowed).toBe(false);
  });

  test('an empty scope list denies everything', async () => {
    const allowed = await acl.checkPagePermissionWithContext(ctx({ scopes: [] }), 'view');
    expect(allowed).toBe(false);
  });

  test('a session request (no viaToken) is unaffected by the ceiling', async () => {
    const allowed = await acl.checkPagePermissionWithContext(ctx({}), 'delete');
    expect(allowed).toBe(true);
  });

  test('legacy action names map to policy action names before the scope check', async () => {
    // 'view' must be matched against the 'page-read' scope, not literal 'view'.
    expect(await acl.checkPagePermissionWithContext(ctx({ scopes: ['page-read'] }), 'view')).toBe(true);
    expect(await acl.checkPagePermissionWithContext(ctx({ scopes: ['view'] }), 'view')).toBe(false);
  });
});
