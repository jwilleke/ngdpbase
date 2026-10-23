/**
 * #1876 slice 2, #1985 — BackupManager's folder and file parts. A declared
 * part is encrypted under the backup key when one is set, staged only under
 * the key the backup recorded (its fingerprint): never without it, never
 * under another one. Its record sits in the manager's entry where every
 * backup since v5.21 put it, and only the paths a manager declares are ever
 * put in place at start. Each test works in its own temp directory and
 * removes only that.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  applyDeclaredPartsAtStart, backupDeclaredParts, partRecordIn, placePartRecords, stageDeclaredParts, stageFilePart, type DirectoryBackupData
} from '../directoryBackup';
import { beginSiteRestore, commitSiteRestore, readSiteRestore, recordStagedPart, stagingFor } from '../siteRestore';
import { BACKUP_KEY_ENV } from '../backupKey';
import { isEncryptedBackup } from '../backupCrypto';
import type { BackupFolder } from '../../managers/BaseManager';

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
const restoreOptions = (manager: string) => ({ ctx: CTX, directory: path.join(dir, 'backups'), siteRestore: stagingFor(path.join(dir, 'site-restore.json'), manager) }) as never;
const siteFile = () => path.join(dir, 'site-restore.json');
const begin = () => beginSiteRestore(siteFile(), { stagedAt: '', backup: '2026-10-01T00:00:00.000Z', source: 'b1', stagedBy: 'admin' });
const configManager = () => ({ getResolvedDataPath: (key: string, def: string) => (key === 'ngdpbase.backup.restore-manifest' ? siteFile() : def) });
const roles = (): BackupFolder[] => [{ part: 'roles', folder: path.join(dir, 'roles') }];
const credentials = (file: string): BackupFolder[] => [{ part: 'credentials', file, what: 'credentials store', requireKey: true, whenAbsent: '{"version":1,"rows":[]}', optional: true }];

/** A manager's entry as BackupManager writes it: its own data, and the declared parts. */
async function entry(manager: string, declared: BackupFolder[], own: unknown = null) {
  return placePartRecords({ managerName: manager, timestamp: '', data: own }, declared, await backupDeclaredParts(manager, declared, backupOptions()));
}

describe('declared parts under the backup key (#1876, #1985)', () => {
  test('with the key a folder part is encrypted and stages under it', async () => {
    const backup = await entry('RoleManager', roles());
    expect(backup.data).toMatchObject({ format: 1, archive: 'b1.roles.tar.enc', files: 1, keyFingerprint: expect.any(String) });
    expect(isEncryptedBackup(fs.readFileSync(path.join(dir, 'backups', 'b1.roles.tar.enc')))).toBe(true);
    begin();
    await stageDeclaredParts('RoleManager', roles(), backup, restoreOptions('RoleManager'));
    expect(fs.readFileSync(path.join(dir, 'roles.staged', 'editor.json'), 'utf8')).toContain('alice');
    expect(readSiteRestore(siteFile())?.parts).toEqual([{ manager: 'RoleManager', swaps: [{ live: path.join(dir, 'roles'), staged: path.join(dir, 'roles.staged') }] }]);
  });

  test('a part made under another key, or with no key set, is refused before anything is staged', async () => {
    const backup = await entry('RoleManager', roles());
    begin();
    process.env[BACKUP_KEY_ENV] = 'another-key';
    await expect(stageDeclaredParts('RoleManager', roles(), backup, restoreOptions('RoleManager'))).rejects.toThrow(/made with a different backup key .*nothing was staged/);
    delete process.env[BACKUP_KEY_ENV];
    await expect(stageDeclaredParts('RoleManager', roles(), backup, restoreOptions('RoleManager'))).rejects.toThrow(/encrypted under the backup key, and NGDPBASE_BACKUP_KEY is not set/);
    expect(fs.existsSync(path.join(dir, 'roles.staged'))).toBe(false);
    expect(readSiteRestore(siteFile())?.parts).toEqual([]);
  });

  test('without the key a folder part is written plain, and a part that requires the key is left out with a warning', async () => {
    delete process.env[BACKUP_KEY_ENV];
    const folder = await entry('RoleManager', roles());
    expect(folder.data).toMatchObject({ archive: 'b1.roles.tar' });
    expect((folder.data as DirectoryBackupData).keyFingerprint).toBeUndefined();
    const file = path.join(dir, 'credentials.json');
    fs.writeFileSync(file, '{"version":1,"rows":[]}');
    const auth = await entry('AuthManager', credentials(file), { providers: ['password'] });
    expect(auth.data).toEqual({ providers: ['password'], credentials: null });
    expect(auth.warnings?.[0]).toMatch(/NGDPBASE_BACKUP_KEY is not set, so the credentials store was left out/);
    expect(fs.readdirSync(path.join(dir, 'backups'))).toEqual(['b1.roles.tar']);
    // A backup that left it out stages nothing for it, and the site's store stays.
    begin();
    expect(await stageDeclaredParts('AuthManager', credentials(file), auth, restoreOptions('AuthManager'))).toEqual({ leftOut: ['credentials'] });
    expect(fs.existsSync(`${file}.staged`)).toBe(false);
  });

  test('a file part sits beside the manager\'s own data; a store absent at backup time stages as empty', async () => {
    const file = path.join(dir, 'credentials.json');
    const absent = await entry('AuthManager', credentials(file), { providers: ['password'] });
    expect(absent.data).toMatchObject({ providers: ['password'], credentials: { archive: 'b1.credentials.tar.enc', files: 0 } });
    expect(partRecordIn(absent, credentials(file), 'credentials')).toMatchObject({ files: 0 });
    begin();
    await stageDeclaredParts('AuthManager', credentials(file), absent, restoreOptions('AuthManager'));
    expect(fs.readFileSync(`${file}.staged`, 'utf8')).toBe('{"version":1,"rows":[]}');
  });

  test('one file of BackupManager\'s own (the instance .env) stages from its record', async () => {
    const file = path.join(dir, '.env');
    fs.writeFileSync(file, 'A=1\n');
    const record = (await entry('BackupManager', [{ part: 'env', file, what: '.env', whenAbsent: '' }])).data as DirectoryBackupData;
    begin();
    await stageFilePart('BackupManager', file, record, restoreOptions('BackupManager'), { whenAbsent: '' });
    expect(fs.readFileSync(`${file}.staged`, 'utf8')).toBe('A=1\n');
  });

  test('a part the backup does not hold refuses the restore unless it is optional', async () => {
    begin();
    await expect(stageDeclaredParts('RoleManager', roles(), { managerName: 'RoleManager', timestamp: '', data: null }, restoreOptions('RoleManager')))
      .rejects.toThrow(/The backup holds no RoleManager files .*nothing was staged/);
    const optional: BackupFolder[] = [{ ...roles()[0], optional: true }];
    expect(await stageDeclaredParts('RoleManager', optional, { managerName: 'RoleManager', timestamp: '', data: { backend: 'sqlite' } }, restoreOptions('RoleManager'))).toEqual({ leftOut: ['roles'] });
  });

  test('two parts of one manager are recorded under data[part], staged together, and a failure removes both', async () => {
    fs.mkdirSync(path.join(dir, 'extra'));
    fs.writeFileSync(path.join(dir, 'extra', 'x.json'), '{}');
    const two: BackupFolder[] = [...roles(), { part: 'extra', folder: path.join(dir, 'extra') }];
    const backup = await entry('ExampleManager', two);
    expect(Object.keys(backup.data as object).sort()).toEqual(['extra', 'roles']);
    begin();
    await stageDeclaredParts('ExampleManager', two, backup, restoreOptions('ExampleManager'));
    expect(readSiteRestore(siteFile())?.parts[0].swaps).toHaveLength(2);
    // The second archive gone: the first part's staged folder is removed too.
    fs.rmSync(path.join(dir, 'roles.staged'), { recursive: true });
    fs.rmSync(path.join(dir, 'extra.staged'), { recursive: true });
    fs.rmSync(path.join(dir, 'backups', 'b1.extra.tar.enc'));
    await expect(stageDeclaredParts('ExampleManager', two, backup, restoreOptions('ExampleManager'))).rejects.toThrow(/missing/);
    expect(fs.existsSync(path.join(dir, 'roles.staged'))).toBe(false);
  });
});

describe('applying declared parts at start (#1985)', () => {
  test('only a declared path is put in place; the backup time comes with the outcome', async () => {
    const backup = await entry('RoleManager', roles());
    begin();
    await stageDeclaredParts('RoleManager', roles(), backup, restoreOptions('RoleManager'));
    commitSiteRestore(siteFile());
    fs.writeFileSync(path.join(dir, 'roles', 'editor.json'), '{"member":[]}');
    const outcome = applyDeclaredPartsAtStart('RoleManager', roles(), configManager());
    expect(outcome).toMatchObject({ applied: [{ live: path.join(dir, 'roles'), kept: path.join(dir, 'roles.pre-restore') }], backupTakenAt: '2026-10-01T00:00:00.000Z' });
    expect(fs.readFileSync(path.join(dir, 'roles', 'editor.json'), 'utf8')).toContain('alice');
    expect(applyDeclaredPartsAtStart('RoleManager', roles(), configManager())).toBeNull();
  });

  test('a manifest naming a path the manager does not declare applies nothing of it', async () => {
    fs.mkdirSync(path.join(dir, 'elsewhere.staged'));
    begin();
    recordStagedPart(siteFile(), { manager: 'RoleManager', swaps: [{ live: path.join(dir, 'elsewhere'), staged: path.join(dir, 'elsewhere.staged') }] });
    commitSiteRestore(siteFile());
    const outcome = applyDeclaredPartsAtStart('RoleManager', roles(), configManager());
    expect(outcome?.refused).toMatch(/not RoleManager's to replace/);
    expect(fs.existsSync(path.join(dir, 'elsewhere'))).toBe(false);
  });

  test('a staged copy no restore names (an interrupted staging) is set aside', () => {
    fs.mkdirSync(path.join(dir, 'roles.staged'));
    const outcome = applyDeclaredPartsAtStart('RoleManager', roles(), configManager());
    expect(outcome?.refused).toMatch(/interrupted staging/);
    expect(fs.existsSync(path.join(dir, 'roles.staged.incomplete'))).toBe(true);
  });
});
