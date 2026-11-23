/**
 * #2492: the backup folder check. A folder under /Volumes whose volume is not
 * there is never made, on any system, and a fault is said in plain words.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { adminMessage, BackupFolderError, ensureBackupFolder, isSystemError, mountPointOf } from '../backupFolder';
import { secretDirIsOwnerOnly } from '../secretFileMode';

const MOUNTINFO = [
  '22 1 8:1 / / rw,relatime - ext4 /dev/sda1 rw',
  '31 22 0:27 / /app/data rw,relatime - nfs4 nas:/tank/geohazardwatch rw',
  '32 22 0:28 / /mnt/with\\040space rw,relatime - ext4 /dev/sdb1 rw'
].join('\n');

describe('mountPointOf', () => {
  test('is the deepest mount that holds the path', () => {
    expect(mountPointOf('/app/data/backups', MOUNTINFO)).toBe('/app/data');
    expect(mountPointOf('/app/data', MOUNTINFO)).toBe('/app/data');
  });

  test('is the system disk for a path no volume holds, such as /Volumes in a container', () => {
    expect(mountPointOf('/Volumes/jims/data', MOUNTINFO)).toBe('/');
    expect(mountPointOf('/app/database', MOUNTINFO)).toBe('/');
  });

  test('reads an escaped space in a mount point', () => {
    expect(mountPointOf('/mnt/with space/x', MOUNTINFO)).toBe('/mnt/with space');
  });
});

describe('ensureBackupFolder', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-2492-folder-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  test('makes a missing folder, owner-only', () => {
    const target = path.join(dir, 'a', 'b');
    ensureBackupFolder(target);
    expect(fs.statSync(target).isDirectory()).toBe(true);
    expect(secretDirIsOwnerOnly(target)).toBe(true);
  });

  test('a folder under /Volumes whose volume is not there is refused, and nothing is made', () => {
    const volume = '/Volumes/ngdpbase-2492-not-mounted';
    expect(() => ensureBackupFolder(`${volume}/data/backups`)).toThrow(BackupFolderError);
    expect(fs.existsSync(volume)).toBe(false);
    try {
      ensureBackupFolder(`${volume}/data/backups`);
    } catch (err) {
      expect((err as Error).message).toMatch(/can't be reached by the site: \/Volumes\/ngdpbase-2492-not-mounted\/data\/backups/);
      expect((err as Error).message).not.toMatch(/setting/i);
    }
  });

  test('a folder that can never be made is refused in plain words, keeping the Node error as the cause', () => {
    const file = path.join(dir, 'a-file');
    fs.writeFileSync(file, 'x');
    let caught: unknown;
    try {
      ensureBackupFolder(path.join(file, 'backups'));
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(BackupFolderError);
    expect((caught as Error).message).not.toMatch(/ENOTDIR|ENOENT|EACCES|mkdir|errno/i);
    expect(((caught as Error).cause as NodeJS.ErrnoException).code).toBe('ENOTDIR');
  });

  test('the message calls it the backup folder and names no setting key', () => {
    const file = path.join(dir, 'a-file');
    fs.writeFileSync(file, 'x');
    expect(() => ensureBackupFolder(path.join(file, 'backups'))).toThrow(/The backup folder can't be reached by the site: \S+\. /);
    expect(() => ensureBackupFolder(path.join(file, 'backups'))).not.toThrow(/setting|director|ngdpbase\./i);
  });
});

describe('secretDirIsOwnerOnly', () => {
  test('is false for a folder other accounts can open, and null for one that is not there', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-2492-mode-'));
    try {
      fs.chmodSync(dir, 0o750);
      expect(secretDirIsOwnerOnly(dir)).toBe(false);
      fs.chmodSync(dir, 0o700);
      expect(secretDirIsOwnerOnly(dir)).toBe(true);
      expect(secretDirIsOwnerOnly(path.join(dir, 'missing'))).toBeNull();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('a system error wrapped in another error is still a system error', () => {
  const enoent = Object.assign(new Error("ENOENT: no such file or directory, open '/data/site-restore.json'"), { code: 'ENOENT' });
  const wrapped = new Error("A site restore record is there but can't be read (ENOENT: no such file or directory, open '/data/site-restore.json')", { cause: enoent });

  test('isSystemError walks the cause chain', () => {
    expect(isSystemError(wrapped)).toBe(true);
    expect(isSystemError(new Error('outer', { cause: new Error('middle', { cause: enoent }) }))).toBe(true);
  });

  test('a plain error with a plain cause, or none, is not a system error', () => {
    expect(isSystemError(new Error('the backup key is not set'))).toBe(false);
    expect(isSystemError(new Error('outer', { cause: new Error('inner words') }))).toBe(false);
  });

  test('a cause that loops back on itself ends the walk', () => {
    const a = new Error('a');
    const b = new Error('b', { cause: a });
    (a as { cause?: unknown }).cause = b;
    expect(isSystemError(a)).toBe(false);
  });

  test('adminMessage gives the fallback for a wrapped system error, and the path stays out of it', () => {
    const said = adminMessage(wrapped, 'FALLBACK');
    expect(said).toBe('FALLBACK');
  });

  test('adminMessage keeps a BackupFolderError and an error in the code\'s own words', () => {
    expect(adminMessage(new BackupFolderError('plain words', { cause: enoent }), 'FALLBACK')).toBe('plain words');
    expect(adminMessage(new Error('the backup key is not set'), 'FALLBACK')).toBe('the backup key is not set');
  });
});
