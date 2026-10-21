/**
 * The one door for a signed-in session ending (#1626, #1670).
 *
 * Whatever ends it — the person signs out, the session idles out or reaches
 * `ngdpbase.session.max-age` from its sign-in (#1767), a password
 * change ends the account's other sessions, or someone signs in again on the
 * same browser — goes through here, so two things can never be forgotten:
 *
 * - its unlocked private-store keys are zeroed and dropped (#1626), and
 * - the end is recorded as `authentication-logout`, with who, from where and
 *   why (#1670). Until this, only the idle timeout was recorded.
 * - a choice to act for someone (`actingFor`, #1762) ends with it.
 *
 * An account deleted or turned off ends its sessions here too (#1937), with
 * the reason `account-deleted` / `account-disabled`: on the session's next
 * request (`checkSessionAccount`), and in the store when the account is
 * closed (`UserManager.deleteUserSessions`) or at startup (`endStaleSessions`).
 *
 * An admin revoking another person's session is recorded separately as
 * `session-revoke`, by the route that does it. A session that simply expires
 * in the store has no hook to call this; its keys are swept (#1626).
 */
import { endSessionKeys } from './privateStoreUnlock.js';
import logger from './logger.js';

export type SessionEndReason = 'logout' | 'idle-timeout' | 'max-age' | 'password-changed' | 'superseded' | 'account-deleted' | 'account-disabled';

interface AuditSink {
  logAuthentication?(context: Record<string, unknown>, result: string, reason: string): Promise<unknown>;
}

export function endSession(
  engine: { getManager(name: string): unknown },
  session: { username?: unknown; privateStoreHandle?: unknown; pendingConnection?: unknown; actingFor?: unknown } | null | undefined,
  reason: SessionEndReason,
  from: { ipAddress?: string; userAgent?: string }
): void {
  endSessionKeys(session?.privateStoreHandle);
  // #1743: an outside identity waiting to be connected never outlives the session it waited in.
  if (session) delete session.pendingConnection;
  // #1762 slice 4: nor does a choice to act for someone.
  if (session) delete session.actingFor;
  const username = typeof session?.username === 'string' && session.username ? session.username : null;
  if (!username) return; // nobody was signed in: nothing ended
  const audit = engine.getManager('AuditManager') as AuditSink | null;
  void audit?.logAuthentication?.(
    { username, ipAddress: from.ipAddress, userAgent: from.userAgent, loginMethod: 'session' },
    'logout',
    reason
  ).catch((err: unknown) => logger.warn(`[SESSION] Could not record the end of ${username}'s session (${reason}):`, err));
}
