/**
 * #1563 — one backup at a time.
 *
 * The release E2E on jimstest ran several backups at once. One backup's
 * pruning deleted files another was listing and checking, so the health
 * check reported "could not be checked", the listing failed, and a backup
 * just made could not be downloaded; the three backups each reported the
 * same page deleted mid-backup, three notifications for one event.
 *
 * BackupManager now runs a backup with its pruning, a restore's staging and
 * the routine health check one at a time: a second backup waits for the one
 * running and is then taken in its own right.
 *
 * Real BackupManager and FileBackupProvider on files in a mkdtemp directory;
 * each test removes only that directory. The backup key is made up here.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import BackupManager, { BACKUPS_NOT_WORKING_TITLE } from '../BackupManager';
import { BACKUP_KEY_ENV, backupKeyFingerprint } from '../../utils/backupKey';

const CTX = { username: 'admin', roles: ['admin'], isAuthenticated: true, ipAddress: '203.0.113.7' };

type Maintenance = { id: string; everyMs: number; run: (ctx: unknown) => Promise<string | void> };

/** A promise and the function that settles it. */
function gate(): { wait: Promise<void>; open: () => void } {
  let open!: () => void;
  const wait = new Promise<void>((resolve) => { open = resolve; });
  return { wait, open };
}

describe('one backup at a time (#1563)', () => {
  let dir: string;
  let props: Record<string, unknown>;
  let notifications: Array<{ level: string; title: string; message: string }>;
  let maintenance: Maintenance[];
  let running: number;
  let mostAtOnce: number;
  let slowPart: { managerName: string; backup: () => Promise<object> };
  let hold: Promise<void> | null;
  const savedKey = process.env[BACKUP_KEY_ENV];

  const backups = () => path.join(dir, 'backups');

  async function start(): Promise<BackupManager> {
    const managers: Record<string, unknown> = {
      ConfigurationManager: {
        getProperty: (k: string, d: unknown) => (k in props ? props[k] : d),
        getResolvedDataPath: (k: string, d: string) => {
          if (k === 'ngdpbase.backup.directory') return backups();
          if (k === 'ngdpbase.backup.health-file') return path.join(dir, 'fast', 'backup-health.json');
          return path.join(dir, 'fast', path.basename(d));
        },
        getInstanceDataFolder: () => path.join(dir, 'fast'),
        setProperty: async (k: string, v: unknown) => { props[k] = v; }
      },
      NotificationManager: {
        notifyAdmins: async (n: { level: string; title: string; message: string }) => { notifications.push(n); return 'id'; },
        getAllNotifications: () => notifications
      },
      BackgroundJobManager: {
        registerJob: () => undefined,
        registerMaintenance: (m: Maintenance) => { maintenance.push(m); },
        scheduledJobView: async () => null
      },
      SlowManager: slowPart
    };
    const engine = {
      getManager: (n: string) => managers[n] ?? null,
      getRegisteredManagers: () => ['SlowManager']
    };
    const bm = new BackupManager(engine);
    managers.BackupManager = bm;
    await bm.initialize();
    return bm;
  }

  const notWorking = () => notifications.filter((n) => n.title === BACKUPS_NOT_WORKING_TITLE);
  const settled = async <T>(p: Promise<T>): Promise<boolean> => {
    let done = false;
    void p.then(() => { done = true; }, () => { done = true; });
    // Long enough for an unqueued read of a small backup to finish.
    await new Promise((r) => setTimeout(r, 250));
    return done;
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-1563-serial-'));
    const key = randomBytes(24).toString('base64');
    process.env[BACKUP_KEY_ENV] = key;
    props = { 'ngdpbase.backup.max-backups': 2, 'ngdpbase.backup.key-saved-fingerprint': backupKeyFingerprint(key) };
    notifications = [];
    maintenance = [];
    running = 0;
    mostAtOnce = 0;
    hold = null;
    // A manager whose part takes a while, and says how many backups are inside it at once.
    slowPart = {
      managerName: 'SlowManager',
      backup: async () => {
        running++;
        mostAtOnce = Math.max(mostAtOnce, running);
        try {
          if (hold) await hold;
          await new Promise((r) => setTimeout(r, 5));
          return { managerName: 'SlowManager', timestamp: new Date().toISOString(), data: { ok: true } };
        } finally {
          running--;
        }
      }
    };
  });

  afterEach(() => {
    if (savedKey === undefined) delete process.env[BACKUP_KEY_ENV]; else process.env[BACKUP_KEY_ENV] = savedKey;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('backups asked for at once run one after another, each its own, and pruning keeps max-backups without an error', async () => {
    const bm = await start();
    await bm.createBackup(CTX);
    notifications = [];
    await new Promise((r) => setTimeout(r, 2));
    const made = await Promise.all([bm.createBackup(CTX), bm.createBackup(CTX), bm.createBackup(CTX), bm.createBackup(CTX)]);
    expect(mostAtOnce).toBe(1);
    expect(new Set(made).size).toBe(4);
    const stored = await bm.listStoredBackups();
    // Pruned to max-backups (2), the newest kept: the last two asked for.
    expect(stored.map((b) => b.path).sort()).toEqual(made.slice(-2).sort());
    expect(bm.getManagerStatus()).toEqual({ state: 'ready' });
    expect(notifications).toEqual([]);
  });

  test('the routine health check waits for a running backup, so it never reads a half-pruned directory', async () => {
    const bm = await start();
    await bm.createBackup(CTX);
    const g = gate();
    hold = g.wait;
    const backup = bm.createBackup(CTX);
    const check = maintenance.find((m) => m.id === 'backup.health').run({});
    expect(await settled(check)).toBe(false);
    g.open();
    await backup;
    await expect(check).resolves.toBeUndefined();
  });

  test('a restore waits for a running backup before it reads the directory', async () => {
    const bm = await start();
    const first = await bm.createBackup(CTX);
    const g = gate();
    hold = g.wait;
    const backup = bm.createBackup(CTX);
    const restore = bm.restoreFromFile(CTX, first, { managerFilter: ['NoSuchManager'] });
    expect(await settled(restore)).toBe(false);
    g.open();
    await backup;
    await expect(restore).resolves.toMatchObject({ failed: [] });
  });

  test('one failure, met by backups asked for at once, is ONE "Backups are not working" notification', async () => {
    const bm = await start();
    await bm.createBackup(CTX);
    notifications = [];
    const provider = (bm as unknown as { provider: { writeBackup: (n: string, d: Buffer) => Promise<string> } }).provider;
    provider.writeBackup = async () => { throw Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' }); };
    const results = await Promise.allSettled([bm.createBackup(CTX), bm.createBackup(CTX), bm.createBackup(CTX)]);
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    expect(notWorking()).toHaveLength(1);
    expect(notifications).toHaveLength(1);
  });

  test('a backup that fails does not stop the one queued behind it', async () => {
    const bm = await start();
    await bm.createBackup(CTX);
    const provider = (bm as unknown as { provider: { writeBackup: (n: string, d: Buffer) => Promise<string> } }).provider;
    const real = provider.writeBackup.bind(provider);
    let calls = 0;
    provider.writeBackup = async (n: string, d: Buffer) => {
      calls++;
      if (calls === 1) throw Object.assign(new Error('EIO: i/o error, write'), { code: 'EIO' });
      return real(n, d);
    };
    const [failed, ok] = await Promise.allSettled([bm.createBackup(CTX), bm.createBackup(CTX)]);
    expect(failed.status).toBe('rejected');
    expect(ok.status).toBe('fulfilled');
    expect(bm.getManagerStatus()).toEqual({ state: 'ready' });
  });
});
