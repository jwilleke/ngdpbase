/**
 * #1635 — step-up is decided by the PDP, the one place every door asks, not by
 * routes in front of the doors. A permission marked step-up needs a fresh
 * sign-in on the request subject; `holds` is the policy-only question for
 * affordances; work with no request (a JobSubject) is not asked.
 *
 * AuthManager is a stand-in owning the freshness rule (fresh = a sign-in
 * stamped 'fresh'); its real rule is covered in AuthManager.test.ts.
 */
import PolicyDecisionPoint from '../PolicyDecisionPoint';

const STEP_UP = new Set(['account-security', 'config-manage']);

function makePdp() {
  const stepUpNeeded = vi.fn((permission: string, signIn: { at?: string } | undefined, _roles: readonly string[], delegated: boolean) =>
    STEP_UP.has(permission) && (delegated || signIn?.at !== 'fresh'));
  const engine = {
    getManager: (name: string) => {
      if (name === 'PolicyEvaluator') return { evaluateAccess: vi.fn().mockResolvedValue({ allowed: true, hasDecision: true, policyName: 'grant' }) };
      if (name === 'PolicyInformationPoint') return { resolveSubjectNow: vi.fn().mockResolvedValue({ username: 'svc', roles: ['admin'], isAuthenticated: true }) };
      if (name === 'AuthManager') return { stepUpNeeded };
      return null;
    }
  };
  return { pdp: new PolicyDecisionPoint(engine), stepUpNeeded };
}

const person = (signIn?: { at: string }, extra: Record<string, unknown> = {}) =>
  ({ username: 'molly', roles: ['reader'], isAuthenticated: true, ...(signIn ? { signIn } : {}), ...extra }) as never;

describe('#1635 the PDP decides step-up', () => {
  test('a step-up permission is refused, with reason step-up, when the sign-in is not fresh', async () => {
    const { pdp, stepUpNeeded } = makePdp();
    const d = await pdp.decide(person({ at: 'stale' }), { action: 'account-security' });
    expect(d).toEqual({ permit: false, applicable: true, reason: 'step-up' });
    expect(await pdp.permits(person({ at: 'stale' }), 'account-security')).toBe(false);
    expect(stepUpNeeded).toHaveBeenCalledWith('account-security', { at: 'stale' }, ['reader'], false, undefined, undefined);
  });

  test('a fresh sign-in is permitted', async () => {
    const { pdp } = makePdp();
    expect(await pdp.permits(person({ at: 'fresh' }), 'account-security')).toBe(true);
  });

  test('a permission not marked step-up is unaffected', async () => {
    const { pdp } = makePdp();
    expect(await pdp.permits(person(), 'page-edit')).toBe(true);
  });

  test('holds answers by policy alone, so an affordance still shows', async () => {
    const { pdp } = makePdp();
    expect(await pdp.holds(person({ at: 'stale' }), 'account-security')).toBe(true);
  });

  test('a delegated credential never satisfies step-up', async () => {
    const { pdp, stepUpNeeded } = makePdp();
    expect(await pdp.permits(person({ at: 'fresh' }, { viaToken: { id: 't', scopes: ['account-security'] } }), 'account-security')).toBe(false);
    expect(stepUpNeeded).toHaveBeenLastCalledWith('account-security', { at: 'fresh' }, ['reader'], true, undefined, undefined);
  });

  test('work with no request (a JobSubject) is not asked: it has no sign-in to be fresh', async () => {
    const { pdp, stepUpNeeded } = makePdp();
    const job = { username: 'svc', isAuthenticated: true, resolveRolesNow: true } as never;
    expect(await pdp.permits(job, 'config-manage')).toBe(true);
    expect(stepUpNeeded).not.toHaveBeenCalled();
  });
});
