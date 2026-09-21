/**
 * A real decider over a stubbed policy (#1431 step 14).
 *
 * Decisions are the PolicyDecisionPoint's, and it asks the PolicyInformationPoint
 * for a subject's current attributes. Tests of the ceilings (agent token,
 * share) and of live role resolution want both of those real, with only the
 * policy matching and the stores stubbed: that is what this builds.
 *
 * - `evaluateAccess` — the policy answer, given the subject it was asked for.
 * - `users` — the account store: an active account by name, or null.
 * - `roles` — the roles a user holds now (RoleManager's answer).
 */
import PolicyDecisionPoint from '../../../security/PolicyDecisionPoint';
import PolicyInformationPoint from '../../../security/PolicyInformationPoint';

type EvaluateAccess = (request: {
  pageName: string;
  action: string;
  userContext: { username: string; roles: string[]; isAuthenticated: boolean };
}) => Promise<{ allowed: boolean; hasDecision?: boolean; policyName?: string | null }>;

export function makeDecider(opts: {
  evaluateAccess: EvaluateAccess;
  users?: (username: string) => { username: string; isActive: boolean } | null;
  roles?: (username: string) => string[];
}) {
  const managers: Record<string, unknown> = {
    PolicyEvaluator: { evaluateAccess: opts.evaluateAccess },
    UserManager: { getUser: (u: string) => Promise.resolve(opts.users?.(u) ?? undefined) },
    RoleManager: { resolveUserRoles: (u: string) => Promise.resolve(opts.roles?.(u) ?? []) },
    // #631: resolving a subject first asks whether the name is the system principal.
    ConfigurationManager: {
      getProperty: (k: string, d: unknown) =>
        (k === 'ngdpbase.system.principal' ? 'svc-ngdpbase' : k === 'ngdpbase.system.roles' ? ['admin'] : d)
    }
  };
  const engine = { getManager: (name: string) => managers[name] ?? null };
  const pdp = new PolicyDecisionPoint(engine);
  managers.PolicyDecisionPoint = pdp;
  managers.PolicyInformationPoint = new PolicyInformationPoint(engine);
  return { pdp, engine };
}
