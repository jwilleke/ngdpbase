/**
 * #1876 slice 2 — a folder or file part of a backup is encrypted under the
 * backup key when one is set, and staged only under the key the backup
 * recorded (its fingerprint): never without it, never under another one.
 * Each test works in its own temp directory and removes only that.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { backupDirectoryPart, backupFilePart, stageDirectoryPart, stageFilePart, type DirectoryBackupData } from '../directoryBackup';
import { beginSiteRestore, readSiteRestore } from '../siteRestore';
import { BACKUP_KEY_ENV } from '../backupKey';
import { isEncryptedBackup } from '../backupCrypto';

const CTX = { username: 'admin', roles: ['admin'], isAuthenticated: true };
let dir: string;
const savedKey = process.env[BACKUP_KEY_ENV];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-dir-backup-'));
  fs.mkdirSync(path.join(dir, 'roles'));
  fs.writeFileSync(path.join(dir, 'roles', 'editor.json'), '{"member":["alice"]}');
  fs.mkdirSync(path.join(dir, 'backups'));
  process.env[BACKUP_KEY_ENV] = 'backup-key-not-a-secret';
});

afterEach(() => {
  if (savedKey === undefined) delete process.env[BACKUP_KEY_ENV]; else process.env[BACKUP_KEY_ENV] = savedKey;
  fs.rmSync(dir, { recursive: true, force: true });
});

const backupOptions = () => ({ ctx: CTX, directory: path.join(dir, 'backups'), stem: 'b1' }) as never;
const restoreOptions = () => ({ ctx: CTX, directory: path.join(dir, 'backups'), siteRestore: path.join(dir, 'site-restore.json') }) as never;
const begin = () => beginSiteRestore(path.join(dir, 'site-restore.json'), { stagedAt: '', backup: '', source: 'b1', stagedBy: 'admin' });

describe('directory and file parts under the backup key (#1876)', () => {
  test('with the key a part is encrypted and stages under it', async () => {
    const backup = await backupDirectoryPart('RoleManager', 'roles', path.join(dir, 'roles'), backupOptions());
    expect(backup.data).toMatchObject({ archive: 'b1.roles.tar.enc', files: 1, keyFingerprint: expect.any(String) });
    expect(isEncryptedBackup(fs.readFileSync(path.join(dir, 'backups', 'b1.roles.tar.enc')))).toBe(true);
    begin();
    await stageDirectoryPart('RoleManager', path.join(dir, 'roles'), backup, restoreOptions());
    expect(fs.readFileSync(path.join(dir, 'roles.staged', 'editor.json'), 'utf8')).toContain('alice');
  });

  test('a part made under another key, or with no key set, is refused before anything is staged', async () => {
    const backup = await backupDirectoryPart('RoleManager', 'roles', path.join(dir, 'roles'), backupOptions());
    begin();
    process.env[BACKUP_KEY_ENV] = 'another-key';
    await expect(stageDirectoryPart('RoleManager', path.join(dir, 'roles'), backup, restoreOptions())).rejects.toThrow(/made with a different backup key .*nothing was staged/);
    delete process.env[BACKUP_KEY_ENV];
    await expect(stageDirectoryPart('RoleManager', path.join(dir, 'roles'), backup, restoreOptions())).rejects.toThrow(/encrypted under the backup key, and NGDPBASE_BACKUP_KEY is not set/);
    expect(fs.existsSync(path.join(dir, 'roles.staged'))).toBe(false);
    expect(readSiteRestore(path.join(dir, 'site-restore.json'))?.parts).toEqual([]);
  });

  test('without the key a folder part is written plain, and a part that requires the key is left out with a warning', async () => {
    delete process.env[BACKUP_KEY_ENV];
    const folder = await backupDirectoryPart('RoleManager', 'roles', path.join(dir, 'roles'), backupOptions());
    expect(folder.data).toMatchObject({ archive: 'b1.roles.tar' });
    expect((folder.data as DirectoryBackupData).keyFingerprint).toBeUndefined();
    const file = path.join(dir, 'credentials.json');
    fs.writeFileSync(file, '{"version":1,"rows":[]}');
    const part = await backupFilePart('AuthManager', 'credentials', file, backupOptions(), { requireKey: true, what: 'credentials store' });
    expect(part.data).toBeNull();
    expect(part.warnings[0]).toMatch(/NGDPBASE_BACKUP_KEY is not set, so the credentials store was left out/);
    expect(fs.readdirSync(path.join(dir, 'backups'))).toEqual(['b1.roles.tar']);
  });

  test('a file part round-trips; a store absent at backup time stages as empty', async () => {
    const file = path.join(dir, 'credentials.json');
    const absent = await backupFilePart('AuthManager', 'credentials', file, backupOptions(), { requireKey: true, what: 'credentials store' });
    expect(absent.data).toMatchObject({ files: 0 });
    begin();
    await stageFilePart('AuthManager', file, absent.data, restoreOptions(), { whenAbsent: '{"version":1,"rows":[]}' });
    expect(fs.readFileSync(`${file}.staged`, 'utf8')).toBe('{"version":1,"rows":[]}');
  });
});
