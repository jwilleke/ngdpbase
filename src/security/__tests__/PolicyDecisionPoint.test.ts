/**
 * The Policy Decision Point (#1431).
 *
 * The ordering here IS the behaviour, and it used to exist twice — once in
 * `UserManager.hasPermission` and once in `ACLManager`'s page door — so these
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
  const userManager = {
    userHoldsPermission: vi.fn().mockResolvedValue(opts.issuerHolds ?? true),
    resolveSubjectNow: vi.fn().mockResolvedValue({ username: 'jim', roles: ['editor'], isAuthenticated: true })
  };
  const engine = {
    getManager: (name: string) => {
      if (name === 'PolicyEvaluator') return opts.evaluator === false ? null : { evaluateAccess };
      if (name === 'UserManager') return userManager;
      return null;
    }
  };
  return { pdp: new PolicyDecisionPoint(engine), evaluateAccess, userManager };
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
      expect(decision).toMatchObject({ permit: false, reason: 'share_issuer_lost_permission' });
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
      const { pdp, userManager, evaluateAccess } = makePdp();
      await pdp.decide({ username: 'jim', resolveRolesNow: true }, { action: 'page-read' });
      expect(userManager.resolveSubjectNow).toHaveBeenCalledWith('jim');
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
