/**
 * subjectMayDo — the one door for a plugin, middleware or handler that has an
 * engine and a subject and needs an allow/deny (#1198, security-posture P2).
 *
 * Asks the PDP (`PolicyDecisionPoint.permits`) and nothing else. The
 * subject is forwarded as it was given, so `viaToken` / `viaShare` reach the
 * ceilings. No engine, no PDP, or no subject is a refusal — the
 * anonymous role's policy is asked through `ANONYMOUS_SUBJECT` by the caller
 * that means anonymous, never by this helper defaulting to it.
 *
 * Exists so the sites that used to ask `userHasRole(userContext, 'admin')`
 * had somewhere to go that is not a second evaluator: a role name skips
 * PolicyEvaluator, deny policies and the token ceiling; this does not.
 */
import type { ActorContext } from '../context/ActorContext.js';
import type { CorePermission } from '../security/permissions.generated.js';

type EngineLike = { getManager: (name: string) => unknown } | null | undefined;
type DecisionPointLike = { permits(subject: ActorContext, action: string): Promise<boolean> };

export async function subjectMayDo(
  engine: EngineLike,
  // A request's subject or a job's context (#2018): the PDP converts it (#2022).
  subject: ActorContext | null | undefined,
  // #1431: a core caller asks for a core permission, checked by the compiler.
  action: CorePermission
): Promise<boolean> {
  if (!engine || !subject) return false;
  const pdp = engine.getManager('PolicyDecisionPoint') as DecisionPointLike | null | undefined;
  if (!pdp || typeof pdp.permits !== 'function') return false;
  return pdp.permits(subject, action);
}
