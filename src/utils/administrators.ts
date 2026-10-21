/**
 * Who an administrator notification goes to.
 *
 * __An administrator is whoever holds `admin-system`__, asked per user through
 * the policy (#1431 7b) — never a role name. Used by every report that must
 * reach administrators and nobody else: a damaged page (#1431 step 7) and
 * failing outbound email (#1916).
 *
 * An empty answer means "nobody to tell", and the caller must then log only:
 * an empty `targetUsers` list means ALL users in NotificationManager, which
 * would announce an operator problem to every reader.
 *
 * Null when the managers needed to answer are not registered (tests, a
 * half-booted engine) — the caller treats that like "nobody to tell".
 */

type EngineLike = { getManager: (name: string) => unknown } | null | undefined;

interface UserManagerLike {
  getUsers(): Promise<Array<{ username: string }>>;
}

interface DecisionPointLike {
  userHoldsPermission(username: string, action: string): Promise<boolean>;
}

/** Usernames of every user who holds `admin-system`; null when it cannot be asked. */
export async function administratorUsernames(engine: EngineLike): Promise<string[] | null> {
  const users = engine?.getManager('UserManager') as UserManagerLike | null | undefined;
  const pdp = engine?.getManager('PolicyDecisionPoint') as DecisionPointLike | null | undefined;
  if (!users || !pdp) return null;
  const admins: string[] = [];
  for (const { username } of await users.getUsers()) {
    if (await pdp.userHoldsPermission(username, 'admin-system')) admins.push(username);
  }
  return admins;
}
