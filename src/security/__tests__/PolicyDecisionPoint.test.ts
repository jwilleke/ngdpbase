/**
 * The Policy Decision Point (#1431).
 *
 * The ordering here IS the behaviour, and it used to exist twice — once in
 * `UserManager.hasPermission` and once in `PolicyInformationPoint`'s page door — so these
 * pin it in the one place it now lives.
 */
import PolicyDecisionPoint from '../PolicyDecisionPoint';

const TOKEN = { id: 'tok-1', name: 'agent', scopes: ['page-read'] };
const SHARE = {
  id: 'share-1',
  issuer: 'molly',
  actions: ['page-read'],
  resources: [{ type: 'page', pattern: '*' }],
  expiresAt: null as string | null
};

function makePdp(opts: {
  allowed?: boolean;
  hasDecision?: boolean;
  issuerHolds?: boolean;
  evaluator?: boolean;
} = {}) {
  const evaluateAccess = vi.fn().mockResolvedValue({
    allowed: opts.allowed ?? true,
    hasDecision: opts.hasDecision ?? true,
    policyName: 'a-policy'
  });
  // #1431 step 13: the subject's current attributes are the PIP's.
  const pip = {
    resolveSubjectNow: vi.fn().mockResolvedValue({ username: 'jim', roles: ['editor'], isAuthenticated: true })
  };
  const engine = {
    getManager: (name: string) => {
      if (name === 'PolicyEvaluator') return opts.evaluator === false ? null : { evaluateAccess };
      if (name === 'PolicyInformationPoint') return pip;
      return null;
    }
  };
  const pdp = new PolicyDecisionPoint(engine);
  // #1431 step 14: whether a share's issuer still holds the action is the
  // PDP's own lookup. Stubbed so these tests see the ceiling alone — the
  // lookup is itself a policy decision, tested on its own below.
  const userHoldsPermission = vi.spyOn(pdp, 'userHoldsPermission').mockResolvedValue(opts.issuerHolds ?? true);
  return { pdp, evaluateAccess, pip, userHoldsPermission };
}

const subject = (extra: Record<string, unknown> = {}) => ({
  username: 'jim', roles: ['editor'], isAuthenticated: true, ...extra
}) as never;

describe('#1431 PolicyDecisionPoint', () => {
  describe('the agent-token ceiling', () => {
    test('a scope the token does not carry is refused, whatever policy says', async () => {
      const { pdp, evaluateAccess } = makePdp({ allowed: true });
      const decision = await pdp.decide(subject({ viaToken: TOKEN }), { action: 'page-edit' });
      expect(decision).toMatchObject({ permit: false, reason: 'token_scope_deny' });
      expect(evaluateAccess).not.toHaveBeenCalled();
    });

    test('a scope it does carry falls through to policy', async () => {
      const { pdp, evaluateAccess } = makePdp({ allowed: true });
      const decision = await pdp.decide(subject({ viaToken: TOKEN }), { action: 'page-read' });
      expect(decision.permit).toBe(true);
      expect(evaluateAccess).toHaveBeenCalled();
    });
  });

  describe('the share ceiling', () => {
    test('a passing share IS the policy — the evaluator is never asked', async () => {
      const { pdp, evaluateAccess } = makePdp();
      const decision = await pdp.decide(subject({ viaShare: SHARE }), { action: 'page-read' });
      expect(decision).toMatchObject({ permit: true, reason: 'share' });
      expect(evaluateAccess).not.toHaveBeenCalled();
    });

    test('an action the share does not delegate is refused', async () => {
      const { pdp } = makePdp();
      const decision = await pdp.decide(subject({ viaShare: SHARE }), { action: 'page-edit' });
      expect(decision).toMatchObject({ permit: false, reason: 'share_action_deny' });
    });

    test('an expired share is refused, re-read at decision time', async () => {
      const { pdp } = makePdp();
      const expired = { ...SHARE, expiresAt: '2000-01-01T00:00:00Z' };
      const decision = await pdp.decide(subject({ viaShare: expired }), { action: 'page-read' });
      expect(decision).toMatchObject({ permit: false, reason: 'share_expired' });
    });

    test('an issuer who lost the permission takes the share with them', async () => {
      const { pdp } = makePdp({ issuerHolds: false });
      const decision = await pdp.decide(subject({ viaShare: SHARE }), { action: 'page-read' });
      expect(decision).toMatchObject({ permit: false, reason: 'share_issuer_deny' });
    });

    test('a resource the share does not cover is refused — the page half, supplied by the caller', async () => {
      const { pdp } = makePdp();
      const decision = await pdp.decide(subject({ viaShare: SHARE }), {
        action: 'page-read',
        resource: { type: 'page', id: 'Secret' },
        resourceCoverage: () => false
      });
      expect(decision).toMatchObject({ permit: false, reason: 'share_resource_deny' });
    });
  });

  describe('ceiling() alone', () => {
    test('null when nothing is delegated — there is nothing to bound', async () => {
      const { pdp } = makePdp();
      expect(await pdp.ceiling(subject(), { action: 'page-read' })).toBeNull();
    });

    test('does not consult policy, so a caller can bound a subject and then apply its own rules', async () => {
      const { pdp, evaluateAccess } = makePdp({ allowed: false });
      const ceiling = await pdp.ceiling(subject({ viaToken: TOKEN }), { action: 'page-read' });
      expect(ceiling).toMatchObject({ permit: true });
      expect(evaluateAccess).not.toHaveBeenCalled();
    });
  });

  describe('the policies', () => {
    test('a policy that spoke is applicable', async () => {
      const { pdp } = makePdp({ allowed: false, hasDecision: true });
      expect(await pdp.decide(subject(), { action: 'page-read' })).toMatchObject({ permit: false, applicable: true });
    });

    test('no policy spoke is NotApplicable, not a deny — the page door still has tiers to try', async () => {
      const { pdp } = makePdp({ allowed: false, hasDecision: false });
      const decision = await pdp.decide(subject(), { action: 'page-read' });
      expect(decision.applicable).toBe(false);
      expect(decision.permit).toBe(false);
    });

    test('a subject asking for live roles is resolved at decision time (#631)', async () => {
      const { pdp, pip, evaluateAccess } = makePdp();
      await pdp.decide({ username: 'jim', resolveRolesNow: true }, { action: 'page-read' });
      expect(pip.resolveSubjectNow).toHaveBeenCalledWith('jim');
      expect(evaluateAccess.mock.calls[0][0].userContext.roles).toEqual(['editor']);
    });

    test('a null subject is the anonymous principal, not a crash', async () => {
      const { pdp, evaluateAccess } = makePdp();
      await pdp.decide(null, { action: 'page-read' });
      expect(evaluateAccess.mock.calls[0][0].userContext.username).toBe('Anonymous');
    });

    test('a resource names the page the question is about', async () => {
      const { pdp, evaluateAccess } = makePdp();
      await pdp.decide(subject(), { action: 'page-read', resource: { type: 'page', id: 'Welcome' } });
      expect(evaluateAccess.mock.calls[0][0].pageName).toBe('Welcome');
    });

    test('without an evaluator nothing is permitted', async () => {
      const { pdp } = makePdp({ evaluator: false });
      expect(await pdp.decide(subject(), { action: 'page-read' })).toMatchObject({ permit: false, applicable: false });
    });
  });
});

// #1431 step 14: the decisions UserManager used to answer are the PDP's.
describe('the PDP answers what UserManager used to', () => {
  function makeWith(subjectFor: (u: string) => unknown, allowed = true) {
    const evaluateAccess = vi.fn().mockResolvedValue({ allowed, hasDecision: true, policyName: 'p' });
    const pip = { subjectFor: vi.fn(async (u: string) => subjectFor(u)), resolveSubjectNow: vi.fn() };
    const config = {
      getProperty: (k: string, d: unknown) => (k === 'ngdpbase.access.policies.enabled' ? true
        : k === 'ngdpbase.access.policies'
          ? [{ id: 'ed', effect: 'allow', priority: 1, subjects: [{ type: 'role', value: 'editor' }], actions: ['page-edit'] }]
          : d)
    };
    const engine = {
      getManager: (name: string) => (name === 'PolicyEvaluator' ? { evaluateAccess }
        : name === 'PolicyInformationPoint' ? pip
          : name === 'ConfigurationManager' ? config : null)
    };
    return { pdp: new PolicyDecisionPoint(engine), evaluateAccess, pip };
  }

  test('permits is decide().permit for a capability', async () => {
    const { pdp } = makeWith(() => null, true);
    expect(await pdp.permits({ username: 'jim', roles: ['editor'], isAuthenticated: true }, 'page-edit')).toBe(true);
    const denied = makeWith(() => null, false);
    expect(await denied.pdp.permits({ username: 'jim', roles: ['editor'], isAuthenticated: true }, 'page-edit')).toBe(false);
  });

  test('userHoldsPermission asks about the named user as the PIP resolves them now', async () => {
    const { pdp, pip, evaluateAccess } = makeWith((u) => (u === 'bob' ? { username: 'bob', roles: ['editor'], isAuthenticated: true } : null));
    expect(await pdp.userHoldsPermission('bob', 'page-edit')).toBe(true);
    expect(pip.subjectFor).toHaveBeenCalledWith('bob');
    expect(evaluateAccess.mock.calls[0][0].userContext.roles).toEqual(['editor']);
  });

  test('userHoldsPermission is false for an unknown or inactive user, without asking policy', async () => {
    const { pdp, evaluateAccess } = makeWith(() => null);
    expect(await pdp.userHoldsPermission('ghost', 'page-edit')).toBe(false);
    expect(evaluateAccess).not.toHaveBeenCalled();
  });

  test('userHoldsPermission for anonymous asks as the anonymous subject', async () => {
    const { pdp, pip, evaluateAccess } = makeWith(() => null);
    await pdp.userHoldsPermission('Anonymous', 'page-read');
    expect(pip.subjectFor).not.toHaveBeenCalled();
    expect(evaluateAccess.mock.calls[0][0].userContext.roles).toEqual(['anonymous']);
  });

  test('getUserPermissions is the union the policies give the user\'s current roles', async () => {
    const { pdp } = makeWith((u) => (u === 'bob' ? { username: 'bob', roles: ['editor'], isAuthenticated: true } : null));
    expect(await pdp.getUserPermissions('bob')).toEqual(['page-edit']);
    expect(await pdp.getUserPermissions('ghost')).toEqual([]);
  });
});
