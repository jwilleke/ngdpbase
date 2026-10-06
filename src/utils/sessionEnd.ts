/**
 * The one door for a signed-in session ending (#1626, #1670).
 *
 * Whatever ends it — the person signs out, the session idles out, a password
 * change ends the account's other sessions, or someone signs in again on the
 * same browser — goes through here, so two things can never be forgotten:
 *
 * - its unlocked private-store keys are zeroed and dropped (#1626), and
 * - the end is recorded as `authentication-logout`, with who, from where and
 *   why (#1670). Until this, only the idle timeout was recorded.
 *
 * An admin revoking another person's session is recorded separately as
 * `session-revoke`, by the route that does it. A session that simply expires
 * in the store has no hook to call this; its keys are swept (#1626).
 */
import { endSessionKeys } from './privateStoreUnlock.js';
import logger from './logger.js';

export type SessionEndReason = 'logout' | 'idle-timeout' | 'password-changed' | 'superseded';

interface AuditSink {
  logAuthentication?(context: Record<string, unknown>, result: string, reason: string): Promise<unknown>;
}

export function endSession(
  engine: { getManager(name: string): unknown },
  session: { username?: unknown; privateStoreHandle?: unknown } | null | undefined,
  reason: SessionEndReason,
  from: { ipAddress?: string; userAgent?: string }
): void {
  endSessionKeys(session?.privateStoreHandle);
  const username = typeof session?.username === 'string' && session.username ? session.username : null;
  if (!username) return; // nobody was signed in: nothing ended
  const audit = engine.getManager('AuditManager') as AuditSink | null;
  void audit?.logAuthentication?.(
    { username, ipAddress: from.ipAddress, userAgent: from.userAgent, loginMethod: 'session' },
    'logout',
    reason
  ).catch((err: unknown) => logger.warn(`[SESSION] Could not record the end of ${username}'s session (${reason}):`, err));
}
