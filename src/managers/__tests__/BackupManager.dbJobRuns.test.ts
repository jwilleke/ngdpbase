/**
 * #1876 — on a site whose job state is in the application database, the
 * critical "not restored" notice names the job runs between the backup and
 * the restore, including a run recorded AFTER the restore was staged: they
 * are read from the database as it was at the moment of the swap (the copy
 * DatabaseManager keeps as `*.pre-restore`), not only at staging.
 *
 * Real managers and a real SQLite database in a temp directory; each test
 * removes only that.
 */
vi.unmock('../../providers/SqliteDatabaseProvider');
vi.unmock('../BackgroundJobManager');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import DatabaseManager, { BACKUP_KEY_ENV, DATABASE_KEY_ENV } from '../DatabaseManager';
import BackupManager from '../BackupManager';
import BackgroundJobManager from '../BackgroundJobManager';
import SqliteJobStateProvider from '../../providers/SqliteJobStateProvider';

const CTX = { username: 'admin', roles: ['admin'], isAuthenticated: true, ipAddress: '203.0.113.7' };

describe('job runs between the backup and the restore, on a database site (#1876)', () => {
  let dir: string;
  let notifications: Array<{ level: string; title: string; message: string }>;
  const saved = { db: process.env[DATABASE_KEY_ENV], backup: process.env[BACKUP_KEY_ENV] };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-1876-dbruns-'));
    fs.mkdirSync(path.join(dir, 'backups'));
    notifications = [];
    process.env[DATABASE_KEY_ENV] = 'database-key-not-a-secret';
    process.env[BACKUP_KEY_ENV] = 'backup-key-not-a-secret';
  });

  afterEach(() => {
    for (const [env, value] of [[DATABASE_KEY_ENV, saved.db], [BACKUP_KEY_ENV, saved.backup]] as const) {
      if (value === undefined) delete process.env[env]; else process.env[env] = value;
    }
    // Only this test's own temp directory.
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function start(): Promise<{ database: DatabaseManager; jobs: BackgroundJobManager; backup: BackupManager; managers: Record<string, unknown> }> {
    const props: Record<string, unknown> = { 'ngdpbase.database.provider': 'sqlite', 'ngdpbase.backup.max-backups': 10, 'ngdpbase.jobs.state.provider': 'auto' };
    const resolved: Record<string, string> = {
      'ngdpbase.database.file': path.join(dir, 'ngdpbase.db'),
      'ngdpbase.backup.directory': path.join(dir, 'backups'),
      'ngdpbase.backup.restore-manifest': path.join(dir, 'site-restore.json')
    };
    const managers: Record<string, unknown> = {
      ConfigurationManager: {
        getProperty: (key: string, def: unknown) => (key in props ? props[key] : def),
        getResolvedDataPath: (key: string, def: string) => resolved[key] ?? path.join(dir, path.basename(def)),
        getInstanceDataFolder: () => dir,
        getAddonDatabaseDeclarations: () => [],
        setProperty: async () => undefined
      },
      NotificationManager: { addNotification: async (n: { level: string; title: string; message: string }) => { notifications.push(n); return 'id'; } },
      AuditManager: { logAuditEvent: async () => 'evt', flushAuditQueue: async () => undefined }
    };
    const engine = {
      getManager: (n: string) => managers[n] ?? null,
      getRegisteredManagers: () => Object.keys(managers).filter((n) => !['ConfigurationManager', 'NotificationManager', 'AuditManager'].includes(n))
    };
    const database = new DatabaseManager(engine);
    managers.DatabaseManager = database;
    await database.initialize();
    const jobs = new BackgroundJobManager(engine);
    managers.BackgroundJobManager = jobs;
    await jobs.initialize();
    jobs.registerJob({ id: 'demo.nightly', displayName: 'Nightly demo', run: async () => ({ success: true }) });
    const backup = new BackupManager(engine);
    managers.BackupManager = backup;
    await backup.initialize();
    await backup.reportRestoreAtBoot();
    return { database, jobs, backup, managers };
  }

  async function stop(site: { managers: Record<string, unknown> }): Promise<void> {
    for (const m of Object.values(site.managers)) await (m as { shutdown?: () => Promise<void> }).shutdown?.();
  }

  test('a run recorded after the restore was staged is named in the notice', async () => {
    const site = await start();
    const file = await site.backup.createBackup(CTX);
    await site.backup.restoreFromFile(CTX, file);
    // After staging, before the restart: the site keeps running jobs.
    const later = new Date(Date.now() + 2000).toISOString();
    await new SqliteJobStateProvider(site.database.getHandle()).recordRun('demo.nightly', {
      runId: 'after-staging', slot: null, startedAt: later, completedAt: later, attempt: 1, status: 'failed', error: 'upstream down', requestedBy: null
    });
    await stop(site);

    notifications = [];
    const restarted = await start();
    expect(restarted.database.restoredAtStart()).toBe(true);
    expect(restarted.jobs.getRunsReplacedAtStart().map((r) => r.startedAt)).toContain(later);
    const critical = notifications.find((n) => n.title === 'Critical: a restore did not bring everything back');
    expect(critical?.message).toMatch(/Nightly demo — last ran .*, failed: upstream down/);
    // And it is gone from the restored history.
    expect((await new SqliteJobStateProvider(restarted.database.getHandle()).listRuns('demo.nightly')).map((r) => r.runId)).not.toContain('after-staging');
    await stop(restarted);
  });
});
