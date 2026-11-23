/**
 * Checking the backup folder, and saying a fault in plain words (#2492).
 *
 * The folder was made once, at start-up. A folder the site can't reach (a drive
 * that isn't connected, a Mac path such as /Volumes/... on a server that has no
 * such drive, a place the site may not write) then showed an admin a raw Node
 * error from whichever backup step touched it first. `ensureBackupFolder` is
 * the one check, run before a new folder is saved and before each backup. The
 * message of a `BackupFolderError` is written for the admin who reads it; the
 * Node error behind it goes to the log.
 */
import fs from 'node:fs';
import { checkConfiguredPath } from './PathPreflight.js';
import { ensureSecretDir } from './secretFileMode.js';
import logger from './logger.js';

/** An error whose message is meant to be shown to an admin as it is. */
export class BackupFolderError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'BackupFolderError';
  }
}

/** The mount point that holds `target`, from the text of /proc/self/mountinfo: the longest one that is a parent of it. */
export function mountPointOf(target: string, mountinfo: string): string | null {
  let best: string | null = null;
  for (const line of mountinfo.split('\n')) {
    const raw = line.split(' ')[4];
    if (!raw) continue;
    // The kernel writes a space, tab or newline in a path as an octal escape.
    const mount = raw.replace(/\\([0-7]{3})/g, (_m, oct: string) => String.fromCharCode(parseInt(oct, 8)));
    const holds = mount === '/' || target === mount || target.startsWith(`${mount}/`);
    if (holds && (best === null || mount.length > best.length)) best = mount;
  }
  return best;
}

/** On Linux, whether the folder lies inside no mounted volume at all (only on the system disk). Null where that can't be told. */
function insideNoMountedVolume(dir: string): boolean | null {
  if (process.platform !== 'linux') return null;
  try {
    return mountPointOf(dir, fs.readFileSync('/proc/self/mountinfo', 'utf8')) === '/';
  } catch {
    return null;
  }
}

function unreachable(dir: string, why: string): string {
  return `The backup folder can't be reached by the site: ${dir} (the Backup directory setting, ngdpbase.backup.directory). ${why} `
    + 'Choose a folder the site can open and write to, such as one inside its data folder.';
}

/**
 * Make sure the backup folder is there and the site can write to it, making it when
 * it is missing. Throws a `BackupFolderError` in plain words when it can't. A folder
 * under /Volumes is never made unless its volume is mounted, on any system: a made
 * one would sit on the system disk, and a backup in it would be lost with the disk.
 * The folder is made owner-only where its filesystem allows (#1560).
 */
export function ensureBackupFolder(dir: string): void {
  if (dir.startsWith('/Volumes/')) {
    // The start-up check, applied here on every system: /Volumes does not exist in a container.
    const volume = checkConfiguredPath(dir, { platform: 'darwin' });
    if (!volume.ok) {
      logger.error(`Backup folder ${dir} can't be used: ${volume.message}`);
      throw new BackupFolderError(unreachable(dir, 'The drive it is on is not connected to the computer the site runs on.'));
    }
  }
  try {
    const warning = ensureSecretDir(dir);
    if (warning) logger.warn(warning);
    fs.accessSync(dir, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK);
  } catch (err) {
    logger.error(`Backup folder ${dir} can't be used:`, err);
    const why = insideNoMountedVolume(dir)
      ? 'It is not inside any mounted volume, so the site has nowhere to keep it.'
      : 'The folder does not exist and could not be made, or the site is not allowed to write to it.';
    throw new BackupFolderError(unreachable(dir, why), { cause: err });
  }
}
