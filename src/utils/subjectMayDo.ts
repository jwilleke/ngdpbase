/**
 * subjectMayDo — the one door for a plugin, middleware or handler that has an
 * engine and a subject and needs an allow/deny (#1198, security-posture P2).
 *
 * Asks `UserManager.hasPermission(subject, action)` and nothing else. The
 * subject is forwarded as it was given, so `viaToken` / `viaShare` reach the
 * ceilings. No engine, no UserManager, or no subject is a refusal — the
 * anonymous role's policy is asked through `ANONYMOUS_SUBJECT` by the caller
 * that means anonymous, never by this helper defaulting to it.
 *
 * Exists so the sites that used to ask `userHasRole(userContext, 'admin')`
 * had somewhere to go that is not a second evaluator: a role name skips
 * PolicyEvaluator, deny policies and the token ceiling; this does not.
 */
import type { PermissionSubject } from '../managers/UserManager.js';

type EngineLike = { getManager: (name: string) => unknown } | null | undefined;
type UserManagerLike = { hasPermission(subject: PermissionSubject, action: string): Promise<boolean> };

export async function subjectMayDo(
  engine: EngineLike,
  subject: PermissionSubject | null | undefined,
  action: string
): Promise<boolean> {
  if (!engine || !subject) return false;
  const userManager = engine.getManager('UserManager') as UserManagerLike | null | undefined;
  if (!userManager || typeof userManager.hasPermission !== 'function') return false;
  return userManager.hasPermission(subject, action);
}
