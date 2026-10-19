/**
 * The backup key (#1723, #1561, #1876): the one secret every encrypted part of
 * a backup is made under — the database files (SQLCipher, `sqliteBackup.ts`),
 * and the backup document, the file archives and the credentials store
 * (`backupCrypto.ts`). One declaration here; DatabaseManager and the file
 * parts read it from this module.
 */
import { createHmac } from 'node:crypto';

/**
 * The environment variable holding the key every backup is encrypted under.
 * Its own secret, not the database key: the copy that travels and the copy
 * that stays should not fall to the same compromise. Never a config key.
 */
export const BACKUP_KEY_ENV = 'NGDPBASE_BACKUP_KEY';

/**
 * A short fingerprint of a backup key (#1723, D3): the first 16 hex digits of
 * an HMAC of a fixed label under the key. Recorded in each backup so a restore
 * under another key says so plainly; it never reveals the key.
 */
export function backupKeyFingerprint(key: string): string {
  return createHmac('sha256', key).update('ngdpbase backup key fingerprint v1').digest('hex').slice(0, 16);
}

/**
 * How every part left out of a backup for want of the key says so: the
 * message starts with this. BackupManager recognises such a part by it
 * (`isLeftOutForNoKey`): those are covered by its banner and one-time
 * notice, never a notice per backup (operator, #1912).
 */
export const LEFT_OUT_FOR_NO_KEY = `${BACKUP_KEY_ENV} is not set, so `;

/** Whether a backup warning or error says a part was left out only because there is no backup key. */
export function isLeftOutForNoKey(message: string): boolean {
  return message.startsWith(LEFT_OUT_FOR_NO_KEY);
}

/** The backup key as set now, trimmed; '' when there is none. Read at use, never cached. */
export function currentBackupKey(): string {
  return (process.env[BACKUP_KEY_ENV] ?? '').trim();
}
