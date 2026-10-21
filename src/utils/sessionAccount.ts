/**
 * Whether a signed-in session still belongs to its account (#1937, #1482).
 *
 * A session names its account by username, and a username outlives the
 * account: deleted, the name is free for a new account. So a session is
 * bound, at sign-in, to the account it signed in to (`accountCreatedAt`, the
 * account's `createdAt`), and on every request, and in the store sweep, it is
 * held to that account as it is now:
 *
 * - no account by that name: the account was deleted (`account-deleted`);
 * - an account by that name that is not the one it signed in to (another
 *   `createdAt`, or created after the session signed in): the account was
 *   deleted and the name reused, also `account-deleted`;
 * - the account is turned off (`isActive === false`): `account-disabled`;
 * - the password changed since it signed in (#1482): `password-changed`.
 *
 * One rule, asked by the session middleware in `app.ts` and by
 * `UserManager.endStaleSessions` at startup; the end goes through `endSession`.
 */
import { sessionIsCurrent } from './sessionGeneration.js';

export type AccountEndReason = 'account-deleted' | 'account-disabled' | 'password-changed';

interface AccountLike { createdAt?: unknown; isActive?: boolean; sessionGeneration?: number }
interface SessionLike { accountCreatedAt?: unknown; signedInAt?: unknown; sessionGeneration?: unknown }

/** The value a session is bound to: the account's creation time, or '' for a record without one. */
export function accountBindingOf(account: AccountLike | null | undefined): string {
  return typeof account?.createdAt === 'string' ? account.createdAt : '';
}

/**
 * What one request (or the sweep) does to a signed-in session, given its
 * account as stored now (null when there is none). `bind` is set on a session
 * signed in before the binding existed that still belongs to its account: the
 * caller writes it to `accountCreatedAt`, once.
 */
export function checkSessionAccount(
  stored: SessionLike | Record<string, unknown>,
  account: AccountLike | null | undefined
): { end: AccountEndReason } | { end: null; bind?: string } {
  const session = stored as SessionLike;
  if (!account) return { end: 'account-deleted' };
  const binding = accountBindingOf(account);
  if (typeof session.accountCreatedAt === 'string') {
    if (session.accountCreatedAt !== binding) return { end: 'account-deleted' };
  } else if (createdAfter(account, session.signedInAt)) {
    // Signed in before this account existed: it belonged to an earlier one of the same name.
    return { end: 'account-deleted' };
  }
  if (account.isActive === false) return { end: 'account-disabled' };
  if (!sessionIsCurrent(session.sessionGeneration, account)) return { end: 'password-changed' };
  return typeof session.accountCreatedAt === 'string' ? { end: null } : { end: null, bind: binding };
}

function createdAfter(account: AccountLike, signedInAt: unknown): boolean {
  if (typeof signedInAt !== 'number' || !Number.isFinite(signedInAt)) return false;
  const created = typeof account.createdAt === 'string' ? Date.parse(account.createdAt) : NaN;
  return Number.isFinite(created) && created > signedInAt;
}
