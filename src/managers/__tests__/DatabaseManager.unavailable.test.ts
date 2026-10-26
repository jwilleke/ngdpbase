/**
 * #1892 (operator D3 rule, 2026-10-18): when the application database can't
 * be opened safely the site does not crash. It boots into maintenance through
 * the one door, engine.maintenance (#1906), visitors see only the maintenance
 * message (here the site's retired #1883 key, still read), admins get
 * a critical notification naming the problem and the fix, and nothing is
 * opened unencrypted, migrated or written. What needs the database is held:
 * add-on databases, scheduled and hand-started jobs, backups and restores.
 *
 * Real SQLite files in a temp directory, the real Engine blocking list, the
 * real DatabaseManager and BackgroundJobManager; only ConfigurationManager and
 * NotificationManager are stand-ins.
 *
 * Sabotage (each done once, each turned these red): rethrow from the open's
 * catch in initialize → every case ("does not throw"); drop the
 * maintenance.enter call → every "maintenance" assertion; drop the
 * notification in reportAtBoot → "critical notification"; drop the read-only
 * probe in SqliteDatabaseProvider → "damaged file … unchanged"; catch nothing around applyRestoreAtStart → "staged restore
 * whose apply fails"; drop the held check in BackgroundJobManager.initialize →
 * the jobs test.
 */
vi.unmock('../../providers/SqliteDatabaseProvider');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import Engine from '../../core/Engine';
import DatabaseManager, { DATABASE_KEY_ENV } from '../DatabaseManager';
import BackgroundJobManager from '../BackgroundJobManager';
import SqliteDatabaseProvider from '../../providers/SqliteDatabaseProvider';
import DATABASE_MIGRATIONS from '../../providers/databaseMigrations';
import { manifestPath, stagedPath, writeManifest } from '../../providers/sqliteBackup';
import { gateDecision } from '../../utils/startupState';
import { LEGACY_MESSAGE_KEY } from '../../utils/maintenanceState';
import { jobContextFromRequest } from '../../context/JobContext';
import { damage } from '../../providers/__tests__/__fixtures__/damagedDatabase';
import type { AddonDatabaseDeclaration } from '../../utils/addonDatabaseRules';

const PUBLIC_MESSAGE = "We're having temporary issues. Please try again later.";
const KEY = 'test-key-not-a-secret';
const PHR: AddonDatabaseDeclaration = { owner: 'phr', ledgerTable: 'phr_schema_migrations', encrypt: 'optional', declaredBy: 'phr', enabled: true };

let dir: string;
let file: string;
const savedKey = process.env[DATABASE_KEY_ENV];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-1892-'));
  file = path.join(dir, 'ngdpbase.db');
  delete process.env[DATABASE_KEY_ENV];
});
afterEach(() => {
  if (savedKey === undefined) delete process.env[DATABASE_KEY_ENV]; else process.env[DATABASE_KEY_ENV] = savedKey;
  // Only this test's temp directory — never a live data tree.
  fs.rmSync(dir, { recursive: true, force: true });
});

interface Booted {
  engine: Engine;
  database: DatabaseManager;
  notifications: Array<{ level: string; title: string; message: string }>;
}

async function boot(provider: 'sqlite' | 'none' = 'sqlite'): Promise<Booted> {
  const props: Record<string, unknown> = {
    'ngdpbase.database.provider': provider,
    [LEGACY_MESSAGE_KEY]: PUBLIC_MESSAGE
  };
  const engine = new Engine();
  engine.registerManager('ConfigurationManager', {
    getProperty: (key: string, def: unknown) => (key in props ? props[key] : def),
    getCustomProperty: () => null,
    getResolvedDataPath: (key: string, def: string) => (key === 'ngdpbase.database.file' ? file : path.join(dir, def)),
    getAddonDatabaseDeclarations: () => [PHR]
  });
  const notifications: Booted['notifications'] = [];
  engine.registerManager('NotificationManager', {
    notifyAdmins: (n: Booted['notifications'][number]) => { notifications.push(n); return Promise.resolve('id'); }
  });
  const database = new DatabaseManager(engine as never);
  engine.registerManager('DatabaseManager', database);
  await database.initialize();
  await database.reportAtBoot();
  return { engine, database, notifications };
}

/** An encrypted application database under KEY, migrated, holding one row of its own. */
function encryptedDatabase(): void {
  const p = new SqliteDatabaseProvider(file, KEY, DATABASE_MIGRATIONS);
  p.handle.exec("CREATE TABLE marker (v TEXT); INSERT INTO marker VALUES ('kept')");
  p.close();
}

const snapshot = (): Buffer => fs.readFileSync(file);

interface Case {
  name: string;
  setUp: () => void;
  /** The key in the environment at boot. */
  key: string;
  why: RegExp;
  fix: RegExp;
  /**
   * Whether the file is byte for byte as it was. Not for a failed migration:
   * the open switched it to WAL and made the ledger table before the
   * migration that failed, which was rolled back (checked instead).
   */
  unchanged: boolean;
}

const SET_KEY = /set NGDPBASE_DATABASE_KEY in <FAST_STORAGE>\/\.env .*and restart/;
const CORRECT_KEY = /correct NGDPBASE_DATABASE_KEY in <FAST_STORAGE>\/\.env .*and restart/;

const CASES: Case[] = [
  { name: 'no key on an encrypted database', setUp: encryptedDatabase, key: '', why: /file is not a database/, fix: SET_KEY, unchanged: true },
  { name: 'the wrong key', setUp: encryptedDatabase, key: 'another-key', why: /file is not a database/, fix: CORRECT_KEY, unchanged: true },
  { name: 'a damaged file (failed integrity check)', setUp: () => damage(file), key: '', why: /failed its integrity check/, fix: /restore the databases from a backup on Admin → Backup .*or stop the server, put back a good copy/, unchanged: true },
  {
    name: 'a failed migration',
    // A table the first core migration creates is already there, so it fails and is rolled back.
    setUp: () => { const db = new Database(file); db.pragma("cipher='sqlcipher'"); db.pragma(`key='${KEY}'`); db.exec('CREATE TABLE job_state (x)'); db.close(); },
    key: KEY,
    why: /migration 20261008180000 .*failed and was rolled back/,
    fix: /restore the databases from a backup on Admin → Backup .*or stop the server, put back a good copy/,
    unchanged: false
  }
];

describe('#1892 an application database that cannot be opened safely puts the site in maintenance', () => {
  test.each(CASES.map((c) => [c.name, c] as const))('%s', async (_name, c) => {
    c.setUp();
    const before = snapshot();
    if (c.key) process.env[DATABASE_KEY_ENV] = c.key;

    const { engine, database, notifications } = await boot();

    // The engine is not dead: initialize resolved, and the manager says why it is not open.
    expect(database.isEnabled()).toBe(false);
    expect(database.getUnavailableReason()).toMatch(c.why);
    expect(database.getManagerStatus().state).toBe('failed');
    expect(database.integrityOk()).toBe(false);

    // Maintenance, through the one door (#1906), with the reason for administrators only.
    const reasons = engine.maintenance.reasons();
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatch(c.why);
    expect(reasons[0]).toMatch(c.fix);
    expect(engine.maintenance.isClosedToAdmins()).toBe(true);
    const visitors = engine.maintenance.visitorView(engine.getManager('ConfigurationManager') as never);
    expect(visitors?.message).toBe(PUBLIC_MESSAGE);
    expect(JSON.stringify(visitors)).not.toMatch(/NGDPBASE|database|ngdpbase\.db/i);
    // Visitors are held at the gate; the repair screens stay open.
    expect(gateDecision(false, true, '/')).toBe('block');
    expect(gateDecision(false, true, '/view/Main')).toBe('block');
    for (const p of ['/admin', '/admin/backup', '/login', '/logout']) expect(gateDecision(false, true, p)).toBe('serve');

    // A critical notification naming the problem and the fix.
    const critical = notifications.filter((n) => n.level === 'error' && /^Critical:/.test(n.title));
    expect(critical).toHaveLength(1);
    expect(critical[0].message).toMatch(c.why);
    expect(critical[0].message).toMatch(c.fix);

    // Nothing was opened unencrypted, migrated or written.
    if (c.unchanged) {
      expect(snapshot().equals(before)).toBe(true);
      expect(fs.existsSync(`${file}-wal`)).toBe(false);
    } else {
      const db = new Database(file);
      db.pragma("cipher='sqlcipher'");
      db.pragma(`key='${KEY}'`);
      expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'job_runs'").get()).toBeUndefined();
      expect(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get()).toEqual({ n: 0 });
      db.close();
    }

    await database.shutdown();
  });

  test('a staged restore whose apply fails: nothing is opened, the site is in maintenance, the live file is untouched', async () => {
    encryptedDatabase();
    process.env[DATABASE_KEY_ENV] = KEY;
    fs.copyFileSync(file, stagedPath(file));
    writeManifest(manifestPath(file), {
      version: 1, stagedAt: '2026-10-18T00:00:00.000Z', backup: '2026-10-17T00:00:00.000Z', source: 'b.json.gz', stagedBy: 'admin',
      databases: [{ name: 'application', live: file, staged: stagedPath(file) }]
    });
    // The live file cannot step aside: a directory stands where it would go.
    fs.mkdirSync(path.join(`${file}.pre-restore`, 'occupied'), { recursive: true });
    const before = snapshot();

    const { engine, database, notifications } = await boot();

    expect(database.isEnabled()).toBe(false);
    expect(database.getUnavailableReason()).toMatch(/staged database restore could not be put in place/);
    expect(engine.maintenance.reasons()[0]).toMatch(/staged database restore could not be put in place/);
    expect(engine.maintenance.visitorView(engine.getManager('ConfigurationManager') as never)?.message).toBe(PUBLIC_MESSAGE);
    expect(notifications.filter((n) => n.level === 'error' && /^Critical:/.test(n.title))).toHaveLength(1);
    expect(snapshot().equals(before)).toBe(true);
    await database.shutdown();
  });

  test('while it is unavailable nothing that needs it runs: add-on databases, backups, restores, jobs', async () => {
    encryptedDatabase();
    const { engine, database } = await boot();
    expect(database.getUnavailableReason()).toBeTruthy();

    // An add-on that declares a database is refused before it is imported, and opening one throws.
    expect(database.addonRefusal('phr')).toMatch(/application database is not available/);
    expect(database.addonRefusal('no-database')).toBeNull();
    expect(() => database.openAddonDatabase('phr', { migrations: [], ledgerTable: 'phr_schema_migrations' })).toThrow(/application database is not available/);
    expect(fs.existsSync(path.join(dir, 'phr.db'))).toBe(false);

    // A backup never silently leaves it out; a restore is not staged.
    await expect(database.backup({ directory: dir, stem: 'b' })).rejects.toThrow(/application database is not available, so no database was backed up/);
    // D2: only a restore's safety backup leaves them out, and it says so.
    const safety = await database.backup({ directory: dir, stem: 's', safetyBackup: true });
    expect(safety.data).toEqual({ format: 1, databases: [], absent: [], failed: [], leftOut: { databases: ['application', 'addon-phr'], reason: database.getUnavailableReason() } });
    expect(safety.note).toMatch(/left out of this safety backup/);
    expect(safety.warnings).toBeUndefined();
    expect(fs.readdirSync(dir).filter((f) => f.startsWith('s.'))).toEqual([]);
    await expect(database.restore({ managerName: 'DatabaseManager', timestamp: 'x', data: { format: 1, databases: [{ name: 'application', kind: 'application', file: 'b.application.db', sizeBytes: 1, tables: 1 }], absent: [], failed: [] } }, { directory: dir }))
      .rejects.toThrow(/application database is not available and NGDPBASE_DATABASE_KEY is not set, so nothing was staged/);
    expect(fs.existsSync(stagedPath(file))).toBe(false);

    // Scheduled and hand-started jobs are held; registering them still works.
    const jobs = new BackgroundJobManager(engine as never);
    engine.registerManager('BackgroundJobManager', jobs);
    await jobs.initialize();
    expect(jobs.getManagerStatus().state).toBe('degraded');
    const ran = vi.fn(async () => ({ success: true }));
    expect(() => jobs.registerJob({ id: 'nightly', displayName: 'Nightly', schedule: 'every 1m', persist: true, run: ran })).not.toThrow();
    jobs.startScheduler();
    await jobs.tick();
    const runId = await jobs.enqueue('nightly', jobContextFromRequest({ username: 'admin' }));
    expect(jobs.getStatus(runId)?.status).toBe('failed');
    expect(jobs.getStatus(runId)?.result?.error).toMatch(/application database is not available/);
    await expect(jobs.runNow('nightly', jobContextFromRequest({ username: 'admin' }))).rejects.toThrow(/application database is not available/);
    expect(ran).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(dir, 'data', 'jobs'))).toBe(false);
    await jobs.shutdown();
    await database.shutdown();
  });

  test('the correct key still opens it: no block, no critical notification', async () => {
    encryptedDatabase();
    process.env[DATABASE_KEY_ENV] = KEY;
    const { engine, database, notifications } = await boot();
    expect(database.isEnabled()).toBe(true);
    expect(database.getUnavailableReason()).toBeNull();
    expect(database.getHandle<InstanceType<typeof Database>>().prepare('SELECT v FROM marker').get()).toEqual({ v: 'kept' });
    expect(engine.maintenance.reasons()).toEqual([]);
    expect(notifications.filter((n) => /^Critical:/.test(n.title))).toEqual([]);
    expect(database.addonRefusal('phr')).toBeNull();
    await database.shutdown();
  });

  test('ngdpbase.database.provider none is unaffected, even beside a file it cannot open', async () => {
    encryptedDatabase();
    const { engine, database, notifications } = await boot('none');
    expect(database.isEnabled()).toBe(false);
    expect(database.getUnavailableReason()).toBeNull();
    expect(engine.maintenance.reasons()).toEqual([]);
    expect(notifications).toEqual([]);
    const jobs = new BackgroundJobManager(engine as never);
    await jobs.initialize();
    expect(jobs.getManagerStatus().state).not.toBe('degraded');
    await jobs.shutdown();
    await database.shutdown();
  });
});
