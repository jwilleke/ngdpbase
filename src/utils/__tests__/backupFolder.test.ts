/**
 * #2492: the backup folder check. A folder under /Volumes whose volume is not
 * there is never made, on any system, and a fault is said in plain words.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BackupFolderError, ensureBackupFolder, mountPointOf } from '../backupFolder';
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
      expect((err as Error).message).toContain('the Backup folder setting');
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
    expect(() => ensureBackupFolder(path.join(file, 'backups'))).toThrow(/Backup folder setting/);
    expect(() => ensureBackupFolder(path.join(file, 'backups'))).not.toThrow(/director|ngdpbase\./i);
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
