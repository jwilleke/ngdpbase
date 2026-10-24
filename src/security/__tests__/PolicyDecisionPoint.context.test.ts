/**
 * #2022: `decide`, `permits` and `holds` take the caller's context and turn
 * it into a subject themselves, with the one `toPermissionSubject`.
 *
 * Each case hands the PDP a context as a caller holds it — a job's
 * `JobContext`, a request's subject, either carrying a token, a share or a
 * proxy claim — and asserts the same decision as the subject a caller used to
 * build by hand. The PDP is real; policy is a table keyed by username (never a
 * role name), and it allows only a subject that arrives with the roles the
 * information point gives that account, so a job whose roles were not
 * resolved now is refused.
 *
 * Sabotaged once (then restored): `evaluate` stopped converting (used the
 * input as the subject) — every JobContext case went red: a job reached the
 * evaluator with no roles and was refused, and a job under a share lost
 * `resolveRolesNow` and was asked step-up as a delegation. The hand-conversion guard is
 * `scripts/check-context-discipline.ts` rule 5, run by contextDiscipline.test.ts.
 */
import PolicyDecisionPoint from '../PolicyDecisionPoint';
import { jobContextFromRequest, jobContextFromSchedule, toPermissionSubject, type JobContext } from '../../context/JobContext';
import type { PermissionSubject, ProxyClaim } from '../../managers/UserManager';
import type { ShareGrant } from '../../types/Share';
import type { DecisionRequest } from '../../types/Policy';

/** What policy grants each account, by name. */
const POLICY: Record<string, string[]> = {
  jim: ['page-read', 'page-edit', 'account-security'],
  mom: ['page-read', 'page-edit'],
  svc: ['page-read', 'admin-system']
};
const STEP_UP = new Set(['account-security']);

function makeEngine() {
  const allowed = (subject: { username: string; roles?: string[] }, action: string) =>
    (subject.roles ?? []).includes(`role-of-${subject.username}`) && (POLICY[subject.username] ?? []).includes(action);
  const resolveSubjectNow = vi.fn(async (u: string) => ({ username: u, roles: [`role-of-${u}`], isAuthenticated: true }));
  const stepUpNeeded = vi.fn((permission: string, signIn: { at?: string } | undefined, _roles: readonly string[], delegated: boolean) =>
    STEP_UP.has(permission) && (delegated || signIn?.at !== 'fresh'));
  const grants = new Map([['g1', { owner: 'mom', proxy: 'jim', permissions: ['page-read', 'page-edit'] }]]);
  const engine = {
    getManager: (name: string): unknown => {
      if (name === 'ConfigurationManager') return { getProperty: (_k: string, d: unknown) => d };
      if (name === 'PolicyEvaluator') {
        return {
          evaluateAccess: async ({ userContext, action }: { userContext: { username: string; roles?: string[] }; action: string }) =>
            ({ allowed: allowed(userContext, action), hasDecision: true, policyName: allowed(userContext, action) ? 'table_allow' : null })
        };
      }
      if (name === 'PolicyInformationPoint') {
        return {
          resolveSubjectNow,
          subjectFor: async (u: string) => (POLICY[u] ? { username: u, roles: [`role-of-${u}`], isAuthenticated: true } : null)
        };
      }
      if (name === 'AuthManager') return { stepUpNeeded, liveProxyGrant: (id: string) => grants.get(id) ?? null };
      return null;
    }
  };
  return { pdp: new PolicyDecisionPoint(engine), resolveSubjectNow, stepUpNeeded };
}

const token = (scopes: string[]) => ({ id: 't1', name: 'reader', scopes });
const share = (actions: string[]): ShareGrant => ({ id: 's1', issuer: 'jim', actions, resources: [], expiresAt: null });
const proxy = (scopes: string[]): ProxyClaim => ({ kind: 'proxy', grantId: 'g1', actor: 'jim', scopes });

/** A request's subject, as the session middleware builds it: roles resolved, sign-in fresh. */
const requestSubject = (over: Partial<PermissionSubject> = {}): PermissionSubject =>
  ({ username: 'jim', roles: ['role-of-jim'], isAuthenticated: true, signIn: { at: 'fresh' }, ...over }) as PermissionSubject;

/** The decision, the boolean forms, from the context as given and from the subject converted by hand. */
async function bothWays(pdp: PolicyDecisionPoint, ctx: JobContext, request: DecisionRequest) {
  const converted = toPermissionSubject(ctx);
  return {
    given: { decide: await pdp.decide(ctx, request), permits: await pdp.permits(ctx, request.action), holds: await pdp.holds(ctx, request.action) },
    converted: { decide: await pdp.decide(converted, request), permits: await pdp.permits(converted, request.action), holds: await pdp.holds(converted, request.action) }
  };
}

describe('the PDP takes a JobContext and converts it itself (#2022)', () => {
  test('a job from a request: the same decision as the converted subject, its roles resolved now', async () => {
    const { pdp, resolveSubjectNow } = makeEngine();
    const job = jobContextFromRequest({ username: 'jim' });
    const allow = await bothWays(pdp, job, { action: 'page-read' });
    expect(allow.given).toEqual(allow.converted);
    expect(allow.given.decide).toEqual({ permit: true, applicable: true, reason: 'table_allow' });
    expect(resolveSubjectNow).toHaveBeenCalledWith('jim');
    const deny = await bothWays(pdp, job, { action: 'admin-system' });
    expect(deny.given).toEqual(deny.converted);
    expect(deny.given.permits).toBe(false);
  });

  test('a scheduled job runs as the system principal, resolved now', async () => {
    const { pdp, resolveSubjectNow } = makeEngine();
    const job = jobContextFromSchedule('svc', 'nightly');
    const r = await bothWays(pdp, job, { action: 'admin-system' });
    expect(r.given).toEqual(r.converted);
    expect(r.given.permits).toBe(true);
    expect(resolveSubjectNow).toHaveBeenCalledWith('svc');
  });

  test('a job is not asked step-up: it has no sign-in to be fresh', async () => {
    const { pdp } = makeEngine();
    const r = await bothWays(pdp, jobContextFromRequest({ username: 'jim' }), { action: 'account-security' });
    expect(r.given).toEqual(r.converted);
    expect(r.given.permits).toBe(true);
  });

  test('a job under an agent token keeps the token ceiling', async () => {
    const { pdp } = makeEngine();
    const job = jobContextFromRequest({ username: 'jim', viaToken: token(['page-read']) });
    const inScope = await bothWays(pdp, job, { action: 'page-read' });
    expect(inScope.given).toEqual(inScope.converted);
    expect(inScope.given.permits).toBe(true);
    const outOfScope = await bothWays(pdp, job, { action: 'page-edit' });
    expect(outOfScope.given).toEqual(outOfScope.converted);
    expect(outOfScope.given.decide).toEqual({ permit: false, applicable: true, reason: 'token_scope_deny' });
  });

  test('a job under a share keeps the share ceiling', async () => {
    const { pdp, stepUpNeeded } = makeEngine();
    const job = jobContextFromRequest({ username: 'Anonymous', viaShare: share(['page-read']) });
    const delegated = await bothWays(pdp, job, { action: 'page-read' });
    expect(delegated.given).toEqual(delegated.converted);
    expect(delegated.given.decide).toEqual({ permit: true, applicable: true, reason: 'share' });
    const notDelegated = await bothWays(pdp, job, { action: 'page-edit' });
    expect(notDelegated.given).toEqual(notDelegated.converted);
    expect(notDelegated.given.decide.reason).toBe('share_action_deny');
    // Still a job's subject: never asked step-up as a delegation, as a request through the share is.
    expect(stepUpNeeded.mock.calls.filter((c) => c[3] === true)).toEqual([]);
  });

  test('a job under a proxy grant keeps the proxy ceiling', async () => {
    const { pdp } = makeEngine();
    const job = jobContextFromRequest({ username: 'mom', viaProxy: proxy(['page-read']) });
    const carried = await bothWays(pdp, job, { action: 'page-read' });
    expect(carried.given).toEqual(carried.converted);
    expect(carried.given.permits).toBe(true);
    const notCarried = await bothWays(pdp, job, { action: 'page-edit' });
    expect(notCarried.given).toEqual(notCarried.converted);
    expect(notCarried.given.decide.reason).toBe('proxy_scope_deny');
  });
});

describe('a request\'s subject still passes through unchanged (#2022)', () => {
  test('its carried roles decide, nothing is resolved, and step-up reads its sign-in', async () => {
    const { pdp, resolveSubjectNow, stepUpNeeded } = makeEngine();
    expect(await pdp.decide(requestSubject(), { action: 'page-read' })).toEqual({ permit: true, applicable: true, reason: 'table_allow' });
    expect(await pdp.permits(requestSubject({ signIn: { at: 'stale' } } as Partial<PermissionSubject>), 'account-security')).toBe(false);
    expect(await pdp.holds(requestSubject({ signIn: { at: 'stale' } } as Partial<PermissionSubject>), 'account-security')).toBe(true);
    expect(resolveSubjectNow).not.toHaveBeenCalled();
    expect(stepUpNeeded).toHaveBeenCalledWith('account-security', { at: 'stale' }, ['role-of-jim'], false, undefined, undefined);
  });

  test('a token, share or proxy request is bounded by its ceiling', async () => {
    const { pdp } = makeEngine();
    expect((await pdp.decide(requestSubject({ viaToken: token(['page-read']) }), { action: 'page-edit' })).reason).toBe('token_scope_deny');
    expect((await pdp.decide(requestSubject({ username: 'Anonymous', roles: ['anonymous'], isAuthenticated: false, viaShare: share(['page-read']) }), { action: 'page-read' })).reason).toBe('share');
    expect((await pdp.decide(requestSubject({ username: 'mom', roles: ['role-of-mom'], viaProxy: proxy(['page-read']) }), { action: 'page-edit' })).reason).toBe('proxy_scope_deny');
  });

  test('nobody is the anonymous subject', async () => {
    const { pdp } = makeEngine();
    expect(await pdp.permits(null, 'page-read')).toBe(false);
    expect(await pdp.permits(undefined, 'page-read')).toBe(false);
  });
});
