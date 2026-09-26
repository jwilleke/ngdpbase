/**
 * Password-change session generation (#1482).
 *
 * A user record carries `sessionGeneration`, a counter raised whenever the
 * account's password changes — by the owner, an administrator, the recovery
 * words (#1452) or the offline reset script. A session is stamped with the
 * counter when it signs in; a request whose session carries an older value is
 * signed out. That ends every other session of the account without finding
 * sessions on disk, at the cost of one comparison per request.
 *
 * An account that has never changed its password is at 0, and a session
 * signed in before this existed carries nothing, which reads as 0: existing
 * sessions stay signed in until the first password change.
 */

interface HasGeneration { sessionGeneration?: number }

/** The account's current generation; 0 when it has never been raised. */
export function sessionGenerationOf(user: HasGeneration | null | undefined): number {
  const g = user?.sessionGeneration;
  return typeof g === 'number' && Number.isInteger(g) && g >= 0 ? g : 0;
}

/** Raise the account's generation, in place, and return the new value. */
export function bumpSessionGeneration(user: HasGeneration): number {
  user.sessionGeneration = sessionGenerationOf(user) + 1;
  return user.sessionGeneration;
}

/** Whether a session stamped with `stamped` still belongs to the account as it is now. */
export function sessionIsCurrent(stamped: unknown, user: HasGeneration | null | undefined): boolean {
  const s = typeof stamped === 'number' && Number.isInteger(stamped) && stamped >= 0 ? stamped : 0;
  return s === sessionGenerationOf(user);
}
