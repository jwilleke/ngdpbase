/**
 * Files that hold secrets are owner-only (#1560).
 *
 * The user store (password hashes), the credentials store, the instance
 * `.env` and backups were written with the process's default mode, which on
 * most systems is world-readable (`-rw-r--r--`). They are written `0600` in
 * `0700` directories now, and at boot an existing file is checked:
 *
 * - wider than `0600` — tightened, and said so;
 * - owned by another account than the server runs as — the boot refuses,
 *   naming both, since the server could neither secure nor safely trust it.
 *
 * No UID is configured anywhere: the mode is set on write, so the owner is
 * whoever runs the server (a login, `node` in the image, the pod's user).
 * Permissions keep out other local accounts and processes, not root; anyone
 * with root, the disk or a backup is outside what they protect against —
 * backup encryption, an optional setting still to be built (#1561), is for that.
 */
import fs from 'node:fs';

export const SECRET_FILE_MODE = 0o600;
export const SECRET_DIR_MODE = 0o700;

/** The server's own UID, or null where the platform has none (Windows). */
function ownUid(): number | null {
  return typeof process.getuid === 'function' ? process.getuid() : null;
}

/**
 * Check an existing secret file at boot. Missing is fine (it is created
 * owner-only on first write). Returns a line to log when it was tightened.
 * Throws, naming both UIDs, when another account owns it.
 */
export function secureExistingSecretFile(file: string): string | null {
  let st: fs.Stats;
  try {
    st = fs.statSync(file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  const uid = ownUid();
  if (uid !== null && st.uid !== uid) {
    throw new Error(
      `Refusing to start: ${file} holds secrets and is owned by UID ${st.uid}, but the server runs as UID ${uid}. ` +
      'Give it to the server\'s account (chown) or start the server as its owner (#1560).'
    );
  }
  if ((st.mode & 0o077) === 0) return null;
  fs.chmodSync(file, SECRET_FILE_MODE);
  return `🔐 Tightened ${file} from ${(st.mode & 0o777).toString(8)} to 600: it holds secrets (#1560)`;
}

/**
 * Make a directory holding secrets owner-only, creating it when absent.
 * Best effort on a filesystem that does not honour modes (an SMB share):
 * returns a warning instead of failing, since refusing to write a backup
 * over it would be worse than writing it with the share's permissions.
 */
export function ensureSecretDir(dir: string): string | null {
  fs.mkdirSync(dir, { recursive: true, mode: SECRET_DIR_MODE });
  try {
    const st = fs.statSync(dir);
    if ((st.mode & 0o077) !== 0) fs.chmodSync(dir, SECRET_DIR_MODE);
    return null;
  } catch (err) {
    return `Could not make ${dir} owner-only (${(err as Error).message}); its filesystem may not support permissions (#1560)`;
  }
}

/** After writing a secret file directly (not through writeFileAtomic's mode), make it owner-only. */
export function chmodSecretFile(file: string): string | null {
  try {
    fs.chmodSync(file, SECRET_FILE_MODE);
    return null;
  } catch (err) {
    return `Could not make ${file} owner-only (${(err as Error).message}); its filesystem may not support permissions (#1560)`;
  }
}
