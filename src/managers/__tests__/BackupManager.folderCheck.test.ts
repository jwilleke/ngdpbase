/**
 * #2492: a backup folder the site can't reach is caught and explained in
 * plain words. An admin never sees a raw Node error from backups.
 *
 * Real BackupManager and FileBackupProvider on files in a mkdtemp directory;
 * each test removes only that directory.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import BackupManager from '../BackupManager';

const CTX = { username: 'admin', roles: ['admin'], isAuthenticated: true, ipAddress: '203.0.113.7' };
/** What a Node error looks like. None of it belongs in what an admin reads. */
const RAW_NODE_ERROR = /ENOENT|EACCES|EPERM|ENOTDIR|EROFS|scandir|mkdir|no such file or directory|permission denied|errno/i;

describe('the backup folder is checked, and a fault is said in plain words (#2492)', () => {
  let dir: string;
  let props: Record<string, unknown>;

  const backups = () => path.join(dir, 'backups');

  async function start(): Promise<BackupManager> {
    const managers: Record<string, unknown> = {
      ConfigurationManager: {
        getProperty: (k: string, d: unknown) => (k in props ? props[k] : d),
        getResolvedDataPath: (k: string, d: string) => {
          if (k === 'ngdpbase.backup.directory') return String(props[k] ?? backups());
          return path.join(dir, 'fast', path.basename(d));
        },
        getInstanceDataFolder: () => path.join(dir, 'fast'),
        setProperty: async (k: string, v: unknown) => { props[k] = v; }
      },
      NotificationManager: { notifyAdmins: async () => 'id', getAllNotifications: () => [] },
      BackgroundJobManager: {
        registerJob: () => undefined,
        registerMaintenance: () => undefined,
        scheduledJobView: async () => null
      }
    };
    const engine = {
      getManager: (n: string) => managers[n] ?? null,
      getRegisteredManagers: () => []
    };
    const bm = new BackupManager(engine);
    managers.BackupManager = bm;
    await bm.initialize();
    return bm;
  }

  /** What an admin sees when `work` fails: the message, or '' when it did not fail. */
  async function messageOf(work: () => Promise<unknown>): Promise<string> {
    try {
      await work();
      return '';
    } catch (err) {
      return (err as Error).message;
    }
  }

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-2492-'));
    props = { 'ngdpbase.backup.max-backups': 10 };
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('a folder that vanished after start-up: a backup is made, or the error is plain, never ENOENT text', async () => {
    const bm = await start();
    fs.rmSync(backups(), { recursive: true, force: true });

    const message = await messageOf(() => bm.createBackup(CTX));

    expect(message).not.toMatch(RAW_NODE_ERROR);
    // The folder is back, and the backup is in it, when the volume was there to make it again.
    if (message === '') expect(fs.readdirSync(backups()).some((f) => f.includes('ngdpbase-backup'))).toBe(true);
  });

  test('saving a folder the site cannot make keeps the old setting and says why in plain words', async () => {
    const bm = await start();
    const old = backups();
    props['ngdpbase.backup.directory'] = old;
    // A folder below a plain file can never be made.
    const blocker = path.join(dir, 'a-file');
    fs.writeFileSync(blocker, 'x');
    const unreachable = path.join(blocker, 'backups');

    const message = await messageOf(() => bm.updateAutoBackupConfig({ directory: unreachable }, CTX));

    expect(message).not.toBe('');
    expect(message).not.toMatch(RAW_NODE_ERROR);
    expect(message).toContain(unreachable);
    expect(props['ngdpbase.backup.directory']).toBe(old);
    expect((await bm.getAutoBackupStatus()).config.directory).toBe(old);
    // The old folder still works.
    await expect(bm.createBackup(CTX)).resolves.toContain(old);
  });

  test('a refused folder saves nothing else from the same form', async () => {
    const bm = await start();
    const blocker = path.join(dir, 'a-file');
    fs.writeFileSync(blocker, 'x');

    await messageOf(() => bm.updateAutoBackupConfig({ enabled: true, time: '03:30', directory: path.join(blocker, 'x') }, CTX));

    expect(props['ngdpbase.backup.auto-backup']).toBeUndefined();
    expect(props['ngdpbase.backup.auto-backup-time']).toBeUndefined();
  });

  test('saving a folder the site can make creates it and uses it', async () => {
    const bm = await start();
    const fresh = path.join(dir, 'elsewhere', 'backups');

    await bm.updateAutoBackupConfig({ directory: fresh }, CTX);

    expect(fs.statSync(fresh).isDirectory()).toBe(true);
    expect(props['ngdpbase.backup.directory']).toBe(fresh);
    await expect(bm.createBackup(CTX)).resolves.toContain(fresh);
  });
});
