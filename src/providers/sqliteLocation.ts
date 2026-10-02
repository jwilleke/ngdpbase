/**
 * SQLite must not live on a network filesystem (ported from yourPHR, yourphr#628; ngdpbase #1536).
 *
 * Every database here runs in WAL mode, and WAL coordinates readers and writers through a `-shm`
 * file each connection mmaps shared-writable. That does not work over NFS or SMB, and SQLite
 * documents WAL there as unsupported: the database will not open, or opens and corrupts — on PHI,
 * discovered at restore time. So the boot stats where each database will ACTUALLY live, whatever root
 * it was composed from or however it was labelled, and refuses when that is a known network
 * filesystem.
 *
 * Deliberately narrow, as the issue decided:
 *   - fail-CLOSED on a known-bad type, fail-OPEN on anything unrecognised — the magic numbers are
 *     Linux's; a laptop's APFS (0x1a on macOS) must boot, not be refused;
 *   - boot-time only: a path that becomes a mount later is not re-checked;
 *   - SQLite files only. The backup destination SHOULD be on a NAS, and is never checked here.
 */
import { existsSync, statfsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/** Linux statfs f_type values for network filesystems (linux/magic.h). */
export const NETWORK_FILESYSTEMS: Readonly<Record<number, string>> = {
  0x6969: 'NFS',
  0x517b: 'SMB',
  0xff534d42: 'CIFS',
  0xfe534d42: 'SMB2'
};

export interface StatFsLike { type: number }

/**
 * Throws, naming the path and the filesystem, when `databaseFile` would be opened on a network
 * filesystem. A file that does not exist yet is judged by the nearest directory that does, since
 * that is where SQLite will create it.
 */
export function refuseNetworkFilesystem(
  databaseFile: string,
  statfs: (path: string) => StatFsLike = (p) => statfsSync(p),
  platform: string = process.platform
): void {
  if (platform !== 'linux') return; // the numbers below are Linux's; elsewhere, unknown = allowed
  let probe = resolve(databaseFile);
  while (!existsSync(probe) && dirname(probe) !== probe) probe = dirname(probe);
  let type: number;
  try {
    type = statfs(probe).type;
  } catch {
    return; // cannot tell: fail open, as for an unrecognised type
  }
  const name = NETWORK_FILESYSTEMS[type];
  if (name) {
    throw new Error(
      `refusing to start: the SQLite database ${databaseFile} would live on ${name} (${probe}, filesystem type 0x${type.toString(16)}). ` +
      'SQLite in WAL mode needs shared memory, which network filesystems do not provide — the database would fail to open or corrupt. ' +
      'Put the data directory (FAST_STORAGE) on local disk; backups may still go to the NAS (#1536).'
    );
  }
}
