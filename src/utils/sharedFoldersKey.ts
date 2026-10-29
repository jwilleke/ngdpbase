/**
 * The shared-folders key (#2124, epic #1775 decision 1): the organization's
 * server-held key, `NGDPBASE_SHARED_FOLDERS_KEY`, in the instance `.env`
 * beside the backup, database and credentials keys. Generated on first start
 * (`bootstrap-env.ts`), read at startup by SharedFolderManager, which wraps
 * every shared folder's own key under it. One declaration here, with no
 * dependencies, so the boot can name it without loading the manager, and
 * BackupManager can fingerprint it for the "saved off the server" check.
 */
import { createHmac, hkdfSync } from 'node:crypto';

/** The environment variable holding the shared-folders key. Never a config key: config is readable from the admin screens. */
export const SHARED_FOLDERS_KEY_ENV = 'NGDPBASE_SHARED_FOLDERS_KEY';

/** The shared-folders key as set now, trimmed; '' when there is none. Never logged. */
export function currentSharedFoldersKey(): string {
  return (process.env[SHARED_FOLDERS_KEY_ENV] ?? '').trim();
}

/**
 * A short fingerprint of the shared-folders key: the first 16 hex digits of an
 * HMAC of a fixed label under the key, as for the backup key. Shown on Admin →
 * Backup and recorded with the wrapped folder keys, so a different key says so
 * plainly; it never reveals the key.
 */
export function sharedFoldersKeyFingerprint(key: string): string {
  return createHmac('sha256', key).update('ngdpbase shared folders key fingerprint v1').digest('hex').slice(0, 16);
}

/**
 * The 32-byte key the folder keys are wrapped under, derived from the `.env`
 * value (HKDF-SHA256, one HMAC round: cheap, never a stall). Derived, not
 * decoded, so a value an operator set themselves in any form still works.
 */
export function sharedFoldersWrapKey(key: string): Buffer {
  return Buffer.from(hkdfSync('sha256', key, Buffer.alloc(0), 'ngdpbase shared folders wrap key v1', 32));
}
