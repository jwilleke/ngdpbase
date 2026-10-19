/**
 * #1723 — DatabaseManager backs up and restores every database: the
 * application database and every declared add-on database, encrypted under
 * NGDPBASE_BACKUP_KEY, consistent, off the request thread, staged on restore
 * and applied at the next start. Real SQLite, real worker threads; each test
 * works in its own temp directory and removes only that.
 */
vi.unmock('../../providers/SqliteDatabaseProvider');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import DatabaseManager, { BACKUP_KEY_ENV, DATABASE_KEY_ENV, type DatabaseBackupData } from '../DatabaseManager';
import BackupManager from '../BackupManager';
import type { BackupData } from '../BaseManager';
import type { Migration } from '../../providers/sqliteMigrations';
import type { AddonDatabaseDeclaration } from '../../utils/addonDatabaseRules';
import { manifestPath } from '../../providers/sqliteBackup';
import { list as listTar } from 'tar';
import { backupKeyFingerprint } from '../DatabaseManager';

const CTX = { username: 'admin', roles: ['admin'], isAuthenticated: true, ipAddress: '203.0.113.7' };
const MARKER = 'PLAINTEXT-MARKER-1723';

type Db = InstanceType<typeof Database>;

const declared = (owner: string, ledgerTable: string, extra: Partial<AddonDatabaseDeclaration> = {}): AddonDatabaseDeclaration =>
  ({ owner, ledgerTable, encrypt: 'optional', declaredBy: owner, enabled: true, ...extra });

const LEDGER: Migration = { id: '20261018090000', description: 'ledger', up: (db) => db.exec('CREATE TABLE accounting_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, memo TEXT NOT NULL)') };
const NOTES: Migration = { id: '20261018090000', description: 'notes', up: (db) => db.exec('CREATE TABLE phr_records (id INTEGER PRIMARY KEY, body TEXT NOT NULL)') };

/** Open a file directly, the way a person inspecting a backup would. */
function openFile(file: string, key: string): Db {
  const db = new Database(file, { fileMustExist: true });
  db.pragma("cipher='sqlcipher'");
  if (key) db.pragma(`key='${key.replace(/'/g, "''")}'`);
  return db;
}

function tables(db: Db): string[] {
  return (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map((r) => r.name);
}

describe('DatabaseManager backup and staged restore (#1723)', () => {
  let dir: string;
  let dataDir: string;
  let backupDir: string;
  let notifications: Array<{ level: string; title: string; message: string }>;
  let audits: Array<Record<string, unknown>>;
  let auditFails: boolean;
  const saved = { db: process.env[DATABASE_KEY_ENV], backup: process.env[BACKUP_KEY_ENV] };

  const engineFor = (props: Record<string, unknown>, declarations: AddonDatabaseDeclaration[], extra: Record<string, unknown> = {}) => {
    const configManager = {
      getProperty: (key: string, def: unknown) => (key in props ? props[key] : def),
      getResolvedDataPath: (key: string, def: string) => {
        if (key === 'ngdpbase.backup.directory') return backupDir;
        // #1876: the site restore record, in this test's own data folder.
        if (key === 'ngdpbase.backup.restore-manifest') return path.join(dataDir, 'site-restore.json');
        return (props['ngdpbase.database.file'] as string | undefined) ?? def;
      },
      getAddonDatabaseDeclarations: () => declarations,
      setProperty: async () => undefined
    };
    const notificationManager = { addNotification: async (n: { level: string; title: string; message: string }) => { notifications.push(n); return 'id'; } };
    const auditManager = { logAuditEvent: async (e: Record<string, unknown>) => { if (auditFails) throw new Error('audit sink down'); audits.push(e); }, flushAuditQueue: async () => undefined };
    const managers: Record<string, unknown> = { ConfigurationManager: configManager, NotificationManager: notificationManager, AuditManager: auditManager, ...extra };
    return {
      managers,
      getManager: (n: string) => managers[n] ?? null,
      // #1892: an application database that cannot be opened blocks the site.
      blockConfiguration: () => undefined,
      getRegisteredManagers: () => Object.keys(managers).filter((n) => !['ConfigurationManager', 'NotificationManager', 'AuditManager'].includes(n))
    };
  };

  const DECLARATIONS = [declared('accounting', 'accounting_schema_migrations')];
  const PROPS = (): Record<string, unknown> => ({ 'ngdpbase.database.provider': 'sqlite', 'ngdpbase.database.file': path.join(dataDir, 'ngdpbase.db') });

  const start = async (declarations: AddonDatabaseDeclaration[] = DECLARATIONS, props: Record<string, unknown> = PROPS()): Promise<DatabaseManager> => {
    const engine = engineFor(props, declarations);
    const manager = new DatabaseManager(engine);
    engine.managers.DatabaseManager = manager;
    await manager.initialize();
    return manager;
  };

  /** A site with rows in the application database and in the accounting add-on's. */
  const populated = async (declarations: AddonDatabaseDeclaration[] = DECLARATIONS): Promise<DatabaseManager> => {
    const manager = await start(declarations);
    const app = manager.getHandle<Db>();
    app.exec('CREATE TABLE app_notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL)');
    app.prepare('INSERT INTO app_notes (body) VALUES (?)').run(`${MARKER} app`);
    const ledger = manager.openAddonDatabase<Db>('accounting', { migrations: [LEDGER], ledgerTable: 'accounting_schema_migrations' });
    for (let i = 0; i < 3; i++) ledger.prepare('INSERT INTO accounting_ledger (memo) VALUES (?)').run(`${MARKER} ledger ${i}`);
    // The id counter has moved past a deleted row: a restore must not hand id 3 out again.
    ledger.prepare('DELETE FROM accounting_ledger WHERE id = 3').run();
    return manager;
  };

  const backupInto = (manager: DatabaseManager, stem = 'b1'): Promise<BackupData> => manager.backup({ ctx: CTX, directory: backupDir, stem });

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-1723-'));
    dataDir = path.join(dir, 'data');
    backupDir = path.join(dir, 'backups');
    fs.mkdirSync(dataDir);
    fs.mkdirSync(backupDir);
    notifications = [];
    audits = [];
    auditFails = false;
    process.env[DATABASE_KEY_ENV] = 'database-key-not-a-secret';
    process.env[BACKUP_KEY_ENV] = 'backup-key-not-a-secret';
  });

  afterEach(() => {
    for (const [env, value] of [[DATABASE_KEY_ENV, saved.db], [BACKUP_KEY_ENV, saved.backup]] as const) {
      if (value === undefined) delete process.env[env]; else process.env[env] = value;
    }
    // Only this test's own temp directory — never a live data tree.
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('a backup of the application and an add-on database restores each table to its owner, at the next start', async () => {
    const manager = await populated();
    const backup = await backupInto(manager);
    const data = backup.data as DatabaseBackupData;
    expect(data.databases.map((d) => d.name).sort()).toEqual(['addon-accounting', 'application']);
    for (const d of data.databases) expect(fs.existsSync(path.join(backupDir, d.file))).toBe(true);

    // Rows written after the backup are what the restore takes away.
    manager.getHandle<Db>().prepare('INSERT INTO app_notes (body) VALUES (?)').run('after the backup');
    await manager.restore(backup, { ctx: CTX, directory: backupDir });
    expect(fs.existsSync(manifestPath(path.join(dataDir, 'ngdpbase.db')))).toBe(true);
    // Staged, not applied: the live database still has the later row.
    expect(manager.getHandle<Db>().prepare('SELECT COUNT(*) AS n FROM app_notes').get()).toEqual({ n: 2 });
    await manager.shutdown();

    const restarted = await start();
    const app = restarted.getHandle<Db>();
    expect(app.prepare('SELECT body FROM app_notes').all()).toEqual([{ body: `${MARKER} app` }]);
    expect(tables(app)).not.toContain('accounting_ledger');
    const ledger = restarted.openAddonDatabase<Db>('accounting', { migrations: [LEDGER], ledgerTable: 'accounting_schema_migrations' });
    expect(tables(ledger)).not.toContain('app_notes');
    expect(ledger.prepare('SELECT id FROM accounting_ledger ORDER BY id').all()).toEqual([{ id: 1 }, { id: 2 }]);
    ledger.prepare('INSERT INTO accounting_ledger (memo) VALUES (?)').run('new');
    expect(ledger.prepare('SELECT MAX(id) AS id FROM accounting_ledger').get()).toEqual({ id: 4 });
    expect(fs.existsSync(path.join(dataDir, 'ngdpbase.db.pre-restore'))).toBe(true);
    expect(fs.existsSync(path.join(dataDir, 'accounting.db.pre-restore'))).toBe(true);
    expect(fs.existsSync(manifestPath(path.join(dataDir, 'ngdpbase.db')))).toBe(false);
    await restarted.reportAtBoot();
    expect(notifications.at(-1)).toMatchObject({ level: 'success', title: 'A database restore was applied' });
    await restarted.shutdown();
  });

  test('a backup file holds no plaintext and no SQLite header, even of an unencrypted database', async () => {
    delete process.env[DATABASE_KEY_ENV];
    const manager = await populated();
    const data = (await backupInto(manager)).data as DatabaseBackupData;
    expect(data.databases.length).toBe(2);
    // The live files are plain, so the marker is there to find (in the WAL until a checkpoint).
    const live = path.join(dataDir, 'ngdpbase.db');
    expect(Buffer.concat([live, `${live}-wal`].filter((f) => fs.existsSync(f)).map((f) => fs.readFileSync(f))).includes(MARKER)).toBe(true);
    for (const d of data.databases) {
      const bytes = fs.readFileSync(path.join(backupDir, d.file));
      expect(bytes.subarray(0, 16).toString('latin1')).not.toContain('SQLite format 3');
      expect(bytes.includes(MARKER)).toBe(false);
      expect(bytes.includes('app_notes')).toBe(false);
      expect(fs.statSync(path.join(backupDir, d.file)).mode & 0o077).toBe(0);
    }
    await manager.shutdown();
  });

  test('a backup records its key\'s fingerprint, and a restore under another key says so plainly (D3)', async () => {
    const manager = await populated();
    const backup = await backupInto(manager);
    const data = backup.data as DatabaseBackupData;
    expect(data.keyFingerprint).toBe(backupKeyFingerprint('backup-key-not-a-secret'));
    expect(data.keyFingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.stringify(backup)).not.toContain('backup-key-not-a-secret');
    process.env[BACKUP_KEY_ENV] = 'some-other-key';
    await expect(manager.restore(backup, { ctx: CTX, directory: backupDir })).rejects.toThrow(/made with a different backup key/);
    expect(fs.readdirSync(dataDir).filter((f) => f.includes('.staged') || f.includes('.restore'))).toEqual([]);
    await manager.shutdown();
  });

  test('a wrong backup key is refused, and nothing is staged (a backup with no fingerprint)', async () => {
    const manager = await populated();
    const backup = await backupInto(manager);
    delete (backup.data as DatabaseBackupData).keyFingerprint;
    process.env[BACKUP_KEY_ENV] = 'some-other-key';
    await expect(manager.restore(backup, { ctx: CTX, directory: backupDir })).rejects.toThrow(/cannot be read — wrong backup key/);
    expect(fs.readdirSync(dataDir).filter((f) => f.includes('.staged') || f.includes('.restore'))).toEqual([]);
    await manager.shutdown();
  });

  test('writes during a backup do not tear it, and the copy runs off the request thread', async () => {
    const manager = await start([]);
    const db = manager.getHandle<Db>();
    db.exec('CREATE TABLE a (id INTEGER PRIMARY KEY, pad TEXT); CREATE TABLE b (id INTEGER PRIMARY KEY, pad TEXT)');
    const pad = 'x'.repeat(500);
    const pair = db.transaction(() => {
      db.prepare('INSERT INTO a (pad) VALUES (?)').run(pad);
      db.prepare('INSERT INTO b (pad) VALUES (?)').run(pad);
    });
    for (let i = 0; i < 20000; i++) pair();

    let writesDuring = 0;
    let done = false;
    const backup = backupInto(manager).finally(() => { done = true; });
    // Every write is one transaction touching both tables; a torn copy would hold unequal counts.
    while (!done) {
      pair();
      writesDuring++;
      await new Promise((r) => setImmediate(r));
    }
    const data = (await backup).data as DatabaseBackupData;
    expect(writesDuring).toBeGreaterThan(1);
    const copy = openFile(path.join(backupDir, data.databases[0].file), process.env[BACKUP_KEY_ENV]);
    const a = (copy.prepare('SELECT COUNT(*) AS n FROM a').get() as { n: number }).n;
    const b = (copy.prepare('SELECT COUNT(*) AS n FROM b').get() as { n: number }).n;
    copy.close();
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(20000);
    await manager.shutdown();
  });

  test('staging is all or nothing: one unreadable database stages none', async () => {
    const manager = await populated();
    const backup = await backupInto(manager);
    const data = backup.data as DatabaseBackupData;
    const addon = data.databases.find((d) => d.name === 'addon-accounting')!;
    const file = path.join(backupDir, addon.file);
    const bytes = fs.readFileSync(file);
    bytes.fill(0, 4096, 8192);
    fs.writeFileSync(file, bytes);
    await expect(manager.restore(backup, { ctx: CTX, directory: backupDir })).rejects.toThrow(/not staged, and nothing was changed/);
    expect(fs.readdirSync(dataDir).filter((f) => f.includes('.staged') || f.includes('.restore'))).toEqual([]);
    await manager.shutdown();
  });

  test('applying moves the old -wal and -shm aside, so they never replay onto the restored file', async () => {
    const manager = await populated();
    const backup = await backupInto(manager);
    await manager.restore(backup, { ctx: CTX, directory: backupDir });
    await manager.shutdown();
    // A crash leaves the WAL beside the file; this one would replay onto whatever is put there.
    const live = path.join(dataDir, 'ngdpbase.db');
    fs.writeFileSync(`${live}-wal`, 'OLD-WAL');
    fs.writeFileSync(`${live}-shm`, 'OLD-SHM');

    const restarted = await start();
    expect(fs.readFileSync(`${live}.pre-restore-wal`, 'utf8')).toBe('OLD-WAL');
    expect(fs.readFileSync(`${live}.pre-restore-shm`, 'utf8')).toBe('OLD-SHM');
    for (const suffix of ['-wal', '-shm']) {
      if (fs.existsSync(`${live}${suffix}`)) expect(fs.readFileSync(`${live}${suffix}`).toString('latin1')).not.toContain('OLD-');
    }
    expect(restarted.integrityOk()).toBe(true);
    expect(restarted.getHandle<Db>().prepare('SELECT COUNT(*) AS n FROM app_notes').get()).toEqual({ n: 1 });
    await restarted.shutdown();
  });

  test('a staged restore with a database missing is not applied at all; the start says so', async () => {
    const manager = await populated();
    await manager.restore(await backupInto(manager), { ctx: CTX, directory: backupDir });
    await manager.shutdown();
    fs.rmSync(path.join(dataDir, 'accounting.db.staged'));

    const restarted = await start();
    expect(fs.existsSync(path.join(dataDir, 'ngdpbase.db.staged.incomplete'))).toBe(true);
    expect(fs.existsSync(path.join(dataDir, 'ngdpbase.db.pre-restore'))).toBe(false);
    expect(restarted.getManagerStatus()).toMatchObject({ state: 'degraded', reason: expect.stringMatching(/NOT applied: only 1 of 2/) });
    await restarted.reportAtBoot();
    expect(notifications.at(-1)).toMatchObject({ level: 'error', title: 'A database restore was not applied' });
    await restarted.shutdown();
  });

  test('a staged file with no manifest (interrupted staging) is set aside, never applied', async () => {
    const manager = await populated();
    await manager.shutdown();
    fs.copyFileSync(path.join(dataDir, 'ngdpbase.db'), path.join(dataDir, 'ngdpbase.db.staged'));
    const restarted = await start();
    expect(fs.existsSync(path.join(dataDir, 'ngdpbase.db.staged.incomplete'))).toBe(true);
    expect(fs.existsSync(path.join(dataDir, 'ngdpbase.db.pre-restore'))).toBe(false);
    expect(restarted.getManagerStatus().state).toBe('degraded');
    await restarted.shutdown();
  });

  test('a manifest naming a file outside the site\'s databases is refused', async () => {
    const manager = await populated();
    await manager.restore(await backupInto(manager), { ctx: CTX, directory: backupDir });
    await manager.shutdown();
    const file = manifestPath(path.join(dataDir, 'ngdpbase.db'));
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    const victim = path.join(dir, 'victim.txt');
    fs.writeFileSync(victim, 'keep me');
    manifest.databases[0] = { name: 'x', live: victim, staged: `${victim}.staged` };
    fs.writeFileSync(file, JSON.stringify(manifest));
    const restarted = await start();
    expect(fs.readFileSync(victim, 'utf8')).toBe('keep me');
    expect(restarted.getManagerStatus().reason).toMatch(/not a database of this site/);
    await restarted.shutdown();
  });

  test('a declared add-on database whose add-on is off is backed up without being opened, and restored', async () => {
    const declarations = [...DECLARATIONS, declared('phr', 'phr_schema_migrations', { encrypt: 'required', enabled: false })];
    // The phr file exists from when the add-on was on.
    const seed = new Database(path.join(dataDir, 'phr.db'));
    seed.pragma("cipher='sqlcipher'");
    seed.pragma(`key='${process.env[DATABASE_KEY_ENV]}'`);
    NOTES.up(seed);
    seed.prepare('INSERT INTO phr_records (body) VALUES (?)').run('a health record');
    seed.close();

    const manager = await populated(declarations);
    expect(manager.getDeclaredDatabases().find((d) => d.owner === 'phr')?.open).toBe(false);
    const backup = await backupInto(manager);
    const data = backup.data as DatabaseBackupData;
    expect(data.databases.map((d) => d.name).sort()).toEqual(['addon-accounting', 'addon-phr', 'application']);
    expect(manager.getDeclaredDatabases().find((d) => d.owner === 'phr')?.open).toBe(false);

    // Lost since: the restore brings it back.
    await manager.shutdown();
    fs.rmSync(path.join(dataDir, 'phr.db'));
    const again = await start(declarations);
    await again.restore(backup, { ctx: CTX, directory: backupDir });
    await again.shutdown();
    await (await start(declarations)).shutdown();
    const restored = openFile(path.join(dataDir, 'phr.db'), process.env[DATABASE_KEY_ENV]);
    expect(restored.prepare('SELECT body FROM phr_records').all()).toEqual([{ body: 'a health record' }]);
    restored.close();
  });

  test('a declared database that was never created is listed as absent, not failed', async () => {
    const manager = await populated([...DECLARATIONS, declared('journal', 'journal_schema_migrations')]);
    const backup = await backupInto(manager);
    expect((backup.data as DatabaseBackupData).absent).toEqual(['addon-journal']);
    expect(backup.warnings).toBeUndefined();
    await manager.shutdown();
  });

  test('no backup key: the backup refuses loudly and writes nothing, and the start says so too', async () => {
    delete process.env[BACKUP_KEY_ENV];
    const manager = await populated();
    expect(manager.getManagerStatus()).toMatchObject({ state: 'degraded', reason: expect.stringMatching(/NGDPBASE_BACKUP_KEY is not set/) });
    await expect(backupInto(manager)).rejects.toThrow(/NGDPBASE_BACKUP_KEY is not set, so no database was backed up/);
    expect(fs.readdirSync(backupDir)).toEqual([]);
    process.env[BACKUP_KEY_ENV] = 'backup-key-not-a-secret';
    await backupInto(manager);
    expect(manager.getManagerStatus().state).toBe('ready');
    await manager.shutdown();
  });

  test('a backed-up database no add-on here declares is not restored, and admins are told', async () => {
    const manager = await populated();
    const backup = await backupInto(manager);
    await manager.shutdown();
    const elsewhere = await start([]);
    await elsewhere.restore(backup, { ctx: CTX, directory: backupDir });
    expect(elsewhere.getStagedRestore()?.databases.map((d) => d.name)).toEqual(['application']);
    expect(notifications.at(-1)).toMatchObject({ level: 'error', message: expect.stringMatching(/addon-accounting, which no add-on on this site declares/) });
    await elsewhere.shutdown();
  });

  test('a database declared encrypt "required" is never restored without the database key', async () => {
    const declarations = [declared('accounting', 'accounting_schema_migrations', { encrypt: 'required' })];
    const manager = await populated(declarations);
    const backup = await backupInto(manager);
    await manager.shutdown();
    delete process.env[DATABASE_KEY_ENV];
    fs.rmSync(path.join(dataDir, 'ngdpbase.db'));
    const plain = await start(declarations);
    await expect(plain.restore(backup, { ctx: CTX, directory: backupDir })).rejects.toThrow(/never restored unencrypted/);
    expect(fs.readdirSync(dataDir).filter((f) => f.includes('.staged'))).toEqual([]);
    await plain.shutdown();
  });

  test('a backup document naming a file outside its directory is refused', async () => {
    const manager = await populated();
    const backup = await backupInto(manager);
    (backup.data as DatabaseBackupData).databases[0].file = '../data/ngdpbase.db';
    await expect(manager.restore(backup, { ctx: CTX, directory: backupDir })).rejects.toThrow(/outside its directory/);
    await manager.shutdown();
  });

  test('a worker that runs past ngdpbase.database.backup.worker-timeout-ms is stopped and leaves nothing', async () => {
    const manager = await start([], { ...PROPS(), 'ngdpbase.database.backup.worker-timeout-ms': 1 });
    await expect(backupInto(manager)).rejects.toThrow(/did not finish within 1 ms/);
    expect(fs.readdirSync(backupDir)).toEqual([]);
    await manager.shutdown();
  });

  test('a backup key equal to the database key still backs up, as loudly as a missing key (D3)', async () => {
    process.env[BACKUP_KEY_ENV] = process.env[DATABASE_KEY_ENV]!;
    const manager = await populated();
    expect(manager.getManagerStatus()).toMatchObject({ state: 'degraded', reason: expect.stringMatching(/NGDPBASE_BACKUP_KEY is the same as NGDPBASE_DATABASE_KEY/) });
    await manager.reportAtBoot();
    expect(notifications.at(-1)).toMatchObject({ level: 'error', message: expect.stringMatching(/same as NGDPBASE_DATABASE_KEY/) });
    const data = (await backupInto(manager)).data as DatabaseBackupData;
    expect(data.databases.length).toBe(2);
    expect(notifications.at(-1)).toMatchObject({ level: 'error', title: 'The backup key is the database key' });
    expect(manager.getManagerStatus().state).toBe('degraded');
    process.env[BACKUP_KEY_ENV] = 'backup-key-not-a-secret';
    await backupInto(manager, 'b2');
    expect(manager.getManagerStatus().state).toBe('ready');
    await manager.shutdown();
  });

  test('a second restore before the restart is refused unless it says to replace; the manifest names the backup and who staged it (D5)', async () => {
    const manager = await populated();
    const first = await backupInto(manager, 'first');
    const second = await backupInto(manager, 'second');
    await manager.restore(first, { ctx: CTX, directory: backupDir, source: 'first.json.gz' });
    expect(manager.getStagedRestore()).toMatchObject({ source: 'first.json.gz', stagedBy: 'admin' });
    await expect(manager.restore(second, { ctx: CTX, directory: backupDir, source: 'second.json.gz' })).rejects.toThrow(/already staged .*Cancel it, or replace it/);
    expect(manager.getStagedRestore()?.source).toBe('first.json.gz');
    await manager.restore(second, { ctx: CTX, directory: backupDir, source: 'second.json.gz', replaceStaged: true });
    expect(manager.getStagedRestore()?.source).toBe('second.json.gz');
    await manager.shutdown();
  });

  test('cancelling a staged restore removes it, leaves the live databases, and is recorded first (D5)', async () => {
    const manager = await populated();
    await manager.restore(await backupInto(manager), { ctx: CTX, directory: backupDir, source: 'b1.json.gz' });
    auditFails = true;
    await expect(manager.cancelStagedRestore(CTX)).rejects.toThrow(/audit sink down/);
    expect(manager.getStagedRestore()).not.toBeNull();
    auditFails = false;
    const cancelled = await manager.cancelStagedRestore(CTX);
    expect(cancelled.source).toBe('b1.json.gz');
    expect(manager.getStagedRestore()).toBeNull();
    expect(fs.readdirSync(dataDir).filter((f) => f.includes('.staged') || f.includes('.restore'))).toEqual([]);
    expect(audits.at(-1)).toMatchObject({ eventType: 'backup-restore-cancel', user: 'admin', resource: 'b1.json.gz', metadata: { stagedBy: 'admin' } });
    await expect(manager.cancelStagedRestore(CTX)).rejects.toThrow(/No database restore is staged/);
    await manager.shutdown();
    // The next start applies nothing.
    const restarted = await start();
    expect(fs.existsSync(path.join(dataDir, 'ngdpbase.db.pre-restore'))).toBe(false);
    await restarted.shutdown();
  });

  describe('through BackupManager', () => {
    const site = async (props: Record<string, unknown> = {}) => {
      const engine = engineFor({ ...PROPS(), 'ngdpbase.backup.max-backups': 10, ...props }, DECLARATIONS);
      const database = new DatabaseManager(engine);
      engine.managers.DatabaseManager = database;
      await database.initialize();
      const backups = new BackupManager(engine);
      engine.managers.BackupManager = backups;
      await backups.initialize();
      return { database, backups, engine };
    };

    const readDocument = async (file: string): Promise<{ managers: Record<string, BackupData> }> => {
      const { gunzipSync } = await import('node:zlib');
      return JSON.parse(gunzipSync(fs.readFileSync(file)).toString('utf8'));
    };

    test('a backup includes every database, as files beside the document that it references', async () => {
      const { database, backups } = await site();
      database.getHandle<Db>().exec('CREATE TABLE app_notes (body TEXT)');
      database.openAddonDatabase('accounting', { migrations: [LEDGER], ledgerTable: 'accounting_schema_migrations' });
      const file = await backups.createBackup(CTX);
      const document = await readDocument(file);
      const data = document.managers.DatabaseManager.data as DatabaseBackupData;
      expect(data.databases.map((d) => d.name).sort()).toEqual(['addon-accounting', 'application']);
      const stem = path.basename(file).replace(/\.json\.gz$/, '');
      for (const d of data.databases) {
        expect(d.file.startsWith(`${stem}.`)).toBe(true);
        expect(fs.existsSync(path.join(path.dirname(file), d.file))).toBe(true);
      }
      // Beside, not inside: the document stays small.
      expect(fs.statSync(file).size).toBeLessThan(4096);
      expect(notifications).toEqual([]);
      await backups.shutdown();
      await database.shutdown();
    });

    test('retention prunes a backup\'s database files with its document', async () => {
      const { database, backups } = await site({ 'ngdpbase.backup.max-backups': 1 });
      await backups.createBackup(CTX, { filename: '2026-01-01-ngdpbase-backup.json.gz' });
      await backups.createBackup(CTX, { filename: '2026-01-02-ngdpbase-backup.json.gz' });
      expect(fs.readdirSync(backupDir).filter((f) => f.startsWith('2026-01-01'))).toEqual([]);
      expect(fs.readdirSync(backupDir).filter((f) => f.startsWith('2026-01-02')).length).toBe(2);
      await backups.shutdown();
      await database.shutdown();
    });

    test('no backup key: the backup is written without the databases, and admins are told', async () => {
      delete process.env[BACKUP_KEY_ENV];
      const { database, backups } = await site();
      const file = await backups.createBackup(CTX);
      expect(fs.readdirSync(backupDir)).toEqual([path.basename(file)]);
      expect(notifications).toContainEqual(expect.objectContaining({ level: 'error', title: 'A backup is incomplete', message: expect.stringMatching(/NGDPBASE_BACKUP_KEY/) }));
      await backups.shutdown();
      await database.shutdown();
    });

    test('a restore takes a fresh backup first, stages the databases, and the next start applies them', async () => {
      const { database, backups } = await site();
      database.getHandle<Db>().exec('CREATE TABLE app_notes (body TEXT)');
      database.getHandle<Db>().prepare('INSERT INTO app_notes VALUES (?)').run('before');
      const file = await backups.createBackup(CTX, { filename: '2026-01-01-ngdpbase-backup.json.gz' });
      database.getHandle<Db>().prepare('INSERT INTO app_notes VALUES (?)').run('after');

      const results = await backups.restoreFromFile(CTX, file);
      expect(results.success).toContain('DatabaseManager');
      const documents = fs.readdirSync(backupDir).filter((f) => f.endsWith('.json.gz'));
      expect(documents.length).toBe(2);
      await backups.shutdown();
      await database.shutdown();

      const restarted = await site();
      expect(restarted.database.getHandle<Db>().prepare('SELECT body FROM app_notes').all()).toEqual([{ body: 'before' }]);
      // The fresh backup holds what the restore replaced.
      const fresh = documents.find((f) => !f.startsWith('2026-01-01'));
      const freshData = (await readDocument(path.join(backupDir, fresh))).managers.DatabaseManager.data as DatabaseBackupData;
      const copy = openFile(path.join(backupDir, freshData.databases.find((d) => d.name === 'application')!.file), process.env[BACKUP_KEY_ENV]);
      expect(copy.prepare('SELECT COUNT(*) AS n FROM app_notes').get()).toEqual({ n: 2 });
      copy.close();
      await restarted.backups.shutdown();
      await restarted.database.shutdown();
    });

    test('#1892 D2: a restore while the application database cannot be opened — the safety backup leaves the databases out and says so, and the damaged file is kept as *.pre-restore', async () => {
      const other = { backup: vi.fn(async () => ({ managerName: 'Other', timestamp: '', data: 1 })), restore: vi.fn() };
      const healthy = await site();
      healthy.engine.managers.Other = other;
      healthy.database.getHandle<Db>().exec('CREATE TABLE app_notes (body TEXT)');
      healthy.database.getHandle<Db>().prepare('INSERT INTO app_notes VALUES (?)').run('good');
      const good = await healthy.backups.createBackup(CTX, { filename: '2026-01-01-ngdpbase-backup.json.gz' });
      await healthy.backups.shutdown();
      await healthy.database.shutdown();

      // Damaged while the server was down, with a WAL and shared-memory file of its own beside it.
      const live = path.join(dataDir, 'ngdpbase.db');
      fs.writeFileSync(live, Buffer.alloc(8192, 0x5a));
      fs.writeFileSync(`${live}-wal`, 'the damaged file\'s wal');
      fs.writeFileSync(`${live}-shm`, 'the damaged file\'s shm');

      const broken = await site();
      broken.engine.managers.Other = other;
      expect(broken.database.getUnavailableReason()).toMatch(/could not be opened safely/);
      const results = await broken.backups.restoreFromFile(CTX, good);
      expect(results.success).toContain('DatabaseManager');
      const staged = broken.database.getStagedRestore()!;
      expect(staged.databases.map((d) => d.name)).toEqual(['application']);

      // The safety backup is complete for everything else, and records what it left out.
      const safety = await readDocument(path.join(backupDir, staged.safetyBackup));
      expect(safety.managers.Other).toMatchObject({ data: 1 });
      expect(safety.managers.DatabaseManager.data).toEqual({
        format: 1, databases: [], absent: [], failed: [],
        leftOut: { databases: ['application', 'addon-accounting'], reason: broken.database.getUnavailableReason() }
      });
      expect(safety.managers.DatabaseManager.note).toMatch(/left out of this safety backup/);
      expect(notifications.find((n) => n.title === 'A backup is incomplete')).toBeUndefined();
      expect(notifications.find((n) => n.title === 'A database restore is staged')?.message).toMatch(/safety backup leaves the databases out; the current database files are kept as \*\.pre-restore/);
      const damaged = { db: fs.readFileSync(live), wal: fs.readFileSync(`${live}-wal`), shm: fs.readFileSync(`${live}-shm`) };
      await broken.backups.shutdown();
      await broken.database.shutdown();

      // The restart applies it: the restored database opens, and the damaged file, its WAL and shm are kept.
      const restarted = await site();
      expect(restarted.database.getUnavailableReason()).toBeNull();
      expect(restarted.database.getHandle<Db>().prepare('SELECT body FROM app_notes').all()).toEqual([{ body: 'good' }]);
      expect(fs.readFileSync(`${live}.pre-restore`).equals(damaged.db)).toBe(true);
      expect(fs.readFileSync(`${live}.pre-restore-wal`).equals(damaged.wal)).toBe(true);
      expect(fs.readFileSync(`${live}.pre-restore-shm`).equals(damaged.shm)).toBe(true);
      await restarted.backups.shutdown();
      await restarted.database.shutdown();
    });

    test('#1892 D2: an ordinary backup while the application database cannot be opened is reported incomplete', async () => {
      fs.writeFileSync(path.join(dataDir, 'ngdpbase.db'), Buffer.alloc(8192, 0x5a));
      const { database, backups } = await site();
      await backups.createBackup(CTX);
      expect(notifications).toContainEqual(expect.objectContaining({ level: 'error', title: 'A backup is incomplete', message: expect.stringMatching(/application database is not available, so no database was backed up/) }));
      await backups.shutdown();
      await database.shutdown();
    });

    test('when the databases cannot be staged, nothing else is restored', async () => {
      const { database, backups, engine } = await site();
      const other = { backup: vi.fn(async () => ({ managerName: 'Other', timestamp: '', data: 1 })), restore: vi.fn() };
      engine.managers.Other = other;
      const file = await backups.createBackup(CTX);
      expect(other.backup).toHaveBeenCalled();
      process.env[BACKUP_KEY_ENV] = 'the-wrong-key';
      await expect(backups.restoreFromFile(CTX, file)).rejects.toThrow(/different backup key/);
      expect(other.restore).not.toHaveBeenCalled();
      await backups.shutdown();
      await database.shutdown();
    });

    test('stored backups list the databases beside each, and one downloads as a .tar holding them all (D2)', async () => {
      const { database, backups } = await site();
      database.openAddonDatabase('accounting', { migrations: [LEDGER], ledgerTable: 'accounting_schema_migrations' });
      const file = await backups.createBackup(CTX, { filename: '2026-01-01-ngdpbase-backup.json.gz' });
      const stored = await backups.listStoredBackups();
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({ filename: '2026-01-01-ngdpbase-backup.json.gz', databases: ['addon-accounting', 'application'] });
      expect(stored[0].totalSize).toBeGreaterThan(stored[0].size);

      const { name, stream } = await backups.backupArchive(path.basename(file));
      expect(name).toBe('2026-01-01-ngdpbase-backup.tar');
      const out = path.join(dir, name);
      await new Promise<void>((resolve, reject) => stream.pipe(fs.createWriteStream(out)).on('finish', resolve).on('error', reject));
      const entries: string[] = [];
      await listTar({ file: out, onReadEntry: (e) => { entries.push(e.path); } });
      expect(entries.sort()).toEqual(['2026-01-01-ngdpbase-backup.addon-accounting.db', '2026-01-01-ngdpbase-backup.application.db', '2026-01-01-ngdpbase-backup.json.gz']);
      expect(fs.readFileSync(out).includes(process.env[BACKUP_KEY_ENV])).toBe(false);
      await expect(backups.backupArchive('../data/ngdpbase.db')).rejects.toThrow(/No backup named/);
      await backups.shutdown();
      await database.shutdown();
    });

    test('startRestore records who asked, restores the databases only, and refuses a second one unless it replaces (D1, D5)', async () => {
      const { database, backups, engine } = await site();
      const other = { backup: vi.fn(async () => ({ managerName: 'Other', timestamp: '', data: 1 })), restore: vi.fn() };
      engine.managers.Other = other;
      database.getHandle<Db>().exec('CREATE TABLE app_notes (body TEXT)');
      await backups.createBackup(CTX, { filename: '2026-01-01-ngdpbase-backup.json.gz' });
      await backups.createBackup(CTX, { filename: '2026-01-02-ngdpbase-backup.json.gz' });

      const { done } = await backups.startRestore(CTX, '2026-01-01-ngdpbase-backup.json.gz');
      expect(audits.at(-1)).toMatchObject({ eventType: 'backup-restore', user: 'admin', resource: '2026-01-01-ngdpbase-backup.json.gz' });
      expect(await done).not.toBeNull();
      expect(other.restore).not.toHaveBeenCalled();
      expect(database.getStagedRestore()).toMatchObject({ source: '2026-01-01-ngdpbase-backup.json.gz', stagedBy: 'admin' });
      // D6: the safety backup it took first is named, and is one of the stored backups.
      const safety = database.getStagedRestore()!.safetyBackup!;
      expect(safety).toMatch(/-ngdpbase-backup\.json\.gz$/);
      expect(safety).not.toMatch(/^2026-01-0[12]/);
      expect((await backups.listStoredBackups()).map((b) => b.filename)).toContain(safety);
      expect(notifications.find((n) => n.title === 'A database restore is staged')?.message).toContain(`backed up first, as ${safety}`);
      expect(backups.isRestoreRunning()).toBe(false);

      await expect(backups.startRestore(CTX, '2026-01-02-ngdpbase-backup.json.gz')).rejects.toThrow(/already staged; cancel it or replace it/);
      const replaced = await backups.startRestore(CTX, '2026-01-02-ngdpbase-backup.json.gz', { replace: true });
      expect(audits.at(-1)).toMatchObject({ eventType: 'backup-restore-replace', metadata: { replaces: '2026-01-01-ngdpbase-backup.json.gz' } });
      await replaced.done;
      expect(database.getStagedRestore()?.source).toBe('2026-01-02-ngdpbase-backup.json.gz');
      await expect(backups.startRestore(CTX, '../../etc/passwd')).rejects.toThrow(/No backup named/);
      await backups.shutdown();
      await database.shutdown();
    });

    test('a restore that cannot be recorded does not start: no fresh backup, nothing staged (D1)', async () => {
      const { database, backups } = await site();
      await backups.createBackup(CTX, { filename: '2026-01-01-ngdpbase-backup.json.gz' });
      auditFails = true;
      await expect(backups.startRestore(CTX, '2026-01-01-ngdpbase-backup.json.gz')).rejects.toThrow(/audit sink down/);
      expect(fs.readdirSync(backupDir).filter((f) => f.endsWith('.json.gz'))).toEqual(['2026-01-01-ngdpbase-backup.json.gz']);
      expect(database.getStagedRestore()).toBeNull();
      await backups.shutdown();
      await database.shutdown();
    });

    test('a restore that fails while staging tells the admins and changes nothing (D1)', async () => {
      const { database, backups } = await site();
      await backups.createBackup(CTX, { filename: '2026-01-01-ngdpbase-backup.json.gz' });
      process.env[BACKUP_KEY_ENV] = 'another-key';
      const { done } = await backups.startRestore(CTX, '2026-01-01-ngdpbase-backup.json.gz');
      expect(await done).toBeNull();
      expect(notifications.at(-1)).toMatchObject({ level: 'error', title: 'Restore of 2026-01-01-ngdpbase-backup.json.gz was not staged', message: expect.stringMatching(/different backup key/) });
      expect(database.getStagedRestore()).toBeNull();
      await backups.shutdown();
      await database.shutdown();
    });
  });
});
