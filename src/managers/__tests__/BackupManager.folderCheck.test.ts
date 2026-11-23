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
import BackupManager, { describeBackupError } from '../BackupManager';
import ConfigurationManager from '../ConfigurationManager';

const CTX = { username: 'admin', roles: ['admin'], isAuthenticated: true, ipAddress: '203.0.113.7' };
/** What a Node error looks like. None of it belongs in what an admin reads. */
const RAW_NODE_ERROR = /ENOENT|EACCES|EPERM|ENOTDIR|EROFS|scandir|mkdir|no such file or directory|permission denied|errno/i;

describe('the backup folder is checked, and a fault is said in plain words (#2492)', () => {
  let dir: string;
  let props: Record<string, unknown>;

  const backups = () => path.join(dir, 'backups');

  const realResolver = {
    getProperty: (k: string, d: unknown) => (k in props ? props[k] : d),
    getInstanceDataFolder: () => path.join(dir, 'fast'),
    resolveDataPath: ConfigurationManager.prototype.resolveDataPath
  };

  async function start(): Promise<BackupManager> {
    const managers: Record<string, unknown> = {
      ConfigurationManager: {
        getProperty: (k: string, d: unknown) => (k in props ? props[k] : d),
        // The real resolver, on this test's own instance data folder: a typed value means what it means at start-up.
        getResolvedDataPath: (k: string, d: string) => {
          if (k === 'ngdpbase.backup.directory') return ConfigurationManager.prototype.getResolvedDataPath.call(realResolver, k, d) as string;
          return path.join(dir, 'fast', path.basename(d));
        },
        resolveConfiguredPath: (value: string) => (ConfigurationManager.prototype as unknown as { resolveConfiguredPath(v: string): string }).resolveConfiguredPath.call(realResolver, value),
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
    props = { 'ngdpbase.backup.max-backups': 10, 'ngdpbase.backup.directory': backups() };
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

  describe('the typed folder means what it means at start-up', () => {
    const strayInCwd: string[] = [];
    afterEach(() => {
      for (const p of strayInCwd.splice(0)) fs.rmSync(p, { recursive: true, force: true });
    });

    test('./data/... is made and checked under the instance data folder, not the working directory', async () => {
      const bm = await start();
      const typed = './data/ngdpbase-2492-relative';
      strayInCwd.push(path.resolve(typed));

      await bm.updateAutoBackupConfig({ directory: typed }, CTX);

      const resolved = path.join(dir, 'fast', 'ngdpbase-2492-relative');
      expect(fs.statSync(resolved).isDirectory()).toBe(true);
      expect(fs.existsSync(path.resolve(typed))).toBe(false);
      // What is saved is what start-up reads back, and it lands in the same folder.
      expect(props['ngdpbase.backup.directory']).toBe(typed);
      await expect(bm.createBackup(CTX)).resolves.toContain(resolved);
      const restarted = await start();
      expect((await restarted.getAutoBackupStatus()).config.directory).toBe(resolved);
    });

    test('${SLOW_STORAGE}/... never makes a folder called ${SLOW_STORAGE}', async () => {
      const bm = await start();
      const typed = '${SLOW_STORAGE}/ngdpbase-2492-slow';
      strayInCwd.push(path.resolve('${SLOW_STORAGE}'));

      await bm.updateAutoBackupConfig({ directory: typed }, CTX);

      expect(fs.statSync(path.join(dir, 'fast', 'ngdpbase-2492-slow')).isDirectory()).toBe(true);
      expect(fs.existsSync(path.resolve('${SLOW_STORAGE}'))).toBe(false);
    });

    test('a refused relative folder is checked where start-up would put it, and the message names that folder', async () => {
      const bm = await start();
      // The place start-up would use is below a plain file, so it can never be made.
      fs.mkdirSync(path.join(dir, 'fast'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'fast', 'blocked'), 'x');

      const message = await messageOf(() => bm.updateAutoBackupConfig({ directory: './data/blocked/backups' }, CTX));

      expect(message).toContain(path.join(dir, 'fast', 'blocked', 'backups'));
      expect(props['ngdpbase.backup.directory']).toBe(backups());
    });
  });

  describe('whether the saved folder is in use now', () => {
    test('backups are on: the save says the folder is in use', async () => {
      const bm = await start();
      const result = await bm.updateAutoBackupConfig({ directory: path.join(dir, 'live') }, CTX);
      expect(result).toEqual({ backupsLive: true });
    });

    test('backups were switched off at start-up: the folder is saved and the save says a restart is needed', async () => {
      const bm = await start();
      (bm as unknown as { provider: null }).provider = null;
      const fresh = path.join(dir, 'later');

      const result = await bm.updateAutoBackupConfig({ directory: fresh }, CTX);

      expect(result).toEqual({ backupsLive: false });
      expect(props['ngdpbase.backup.directory']).toBe(fresh);
    });
  });

  describe('describeBackupError: what is recorded for the Backup page and the admin notice', () => {
    const node = (code: string, message: string) => Object.assign(new Error(message), { code });

    test.each([
      ['ENOSPC', /out of space/],
      ['EACCES', /permission denied/],
      ['EROFS', /read-only/],
      ['ENOENT', /not there/],
      ['EIO', /write error/],
      ['EMFILE', /could not be written/]
    ])('%s is named in plain words with no Node text', (code, plain) => {
      const said = describeBackupError(node(code, `${code}: no such file or directory, scandir '/Volumes/jims/backups'`));
      expect(said).toMatch(plain);
      expect(said).not.toMatch(RAW_NODE_ERROR);
      expect(said).not.toContain('/Volumes/jims');
    });

    test('an error the code threw itself is said as it was written', () => {
      expect(describeBackupError(new Error('the backup key is not set'))).toBe('the backup key is not set');
    });
  });
});
