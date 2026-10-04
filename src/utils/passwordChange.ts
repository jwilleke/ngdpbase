/**
 * What changing a password means, written once (#1592; operator, 2026-10-04:
 * "There should ONLY BE ONE" path that changes a password).
 *
 * `UserManager.updateUser` (the profile, an administrator, the recovery words)
 * and `scripts/reset-admin-password.ts` (offline, server stopped) both call
 * {@link setPassword}, so a step added here reaches every path at once.
 *
 * A change:
 *
 * - stores the new hash;
 * - raises the session generation, ending every other session (#1482);
 * - records when it happened, so a sign-in made before it can be refused
 *   where a generation cannot be compared — an app's tokens from the OpenID
 *   Connect provider carry the sign-in time, not a generation (#1592).
 *
 * Re-hashing the same password on sign-in (#1042) is not a change and does not
 * come here.
 */
import { hashPassword } from './passwordHash.js';
import { bumpSessionGeneration } from './sessionGeneration.js';

export interface PasswordRecord {
  password?: string;
  sessionGeneration?: number;
  /** ISO 8601; when the password last changed. Absent on an account that never changed it. */
  passwordChangedAt?: string;
}

/** Change the record's password, in place. */
export function setPassword(record: PasswordRecord, newPassword: string, now: Date = new Date()): void {
  record.password = hashPassword(newPassword);
  bumpSessionGeneration(record);
  record.passwordChangedAt = now.toISOString();
}

/** When the password last changed, in epoch seconds; null when it never has. */
export function passwordChangedAtSeconds(record: { passwordChangedAt?: unknown } | null | undefined): number | null {
  const at = typeof record?.passwordChangedAt === 'string' ? Date.parse(record.passwordChangedAt) : NaN;
  return Number.isFinite(at) ? Math.floor(at / 1000) : null;
}
