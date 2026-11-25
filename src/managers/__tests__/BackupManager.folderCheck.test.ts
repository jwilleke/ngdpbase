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

  type Resolver = {
    resolveEnvRef(v: unknown, key: string): unknown;
    resolveConfiguredPath(v: string): string;
    resolveTypedPath(v: string, key: string): string;
  };
  const proto = ConfigurationManager.prototype as unknown as Resolver;
  // The real resolver on this test's own instance data folder. getProperty reads the way the real one does:
  // the stored text goes through the environment step (`${VAR}`, `$VAR`) before anything else.
  const realResolver = {
    getProperty: (k: string, d: unknown) => realResolver.resolveEnvRef(k in props ? props[k] : d, k),
    getInstanceDataFolder: () => path.join(dir, 'fast'),
    resolveDataPath: ConfigurationManager.prototype.resolveDataPath,
    resolveEnvRef: proto.resolveEnvRef,
    resolveConfiguredPath: (value: string): string => proto.resolveConfiguredPath.call(realResolver, value),
    resolveTypedPath: (value: string, key: string): string => proto.resolveTypedPath.call(realResolver, value, key)
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
        resolveConfiguredPath: (value: string) => realResolver.resolveConfiguredPath(value),
        resolveTypedPath: (value: string, key: string) => realResolver.resolveTypedPath(value, key),
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
    expect((await bm.getAutoBackupStatus()).folder.exists).toBe(true);
    // The old folder still works.
    await expect(bm.createBackup(CTX)).resolves.toContain(old);
  });

  describe('the folder status the Backup page shows (#2470)', () => {
    type Inner = { backupDirectory: string | null };

    test('a folder that is there is a folder with no fault', async () => {
      const bm = await start();
      const status = (await bm.getAutoBackupStatus()).folder;
      expect(status.exists).toBe(true);
      expect(status.fault).toBeNull();
    });

    test('a folder deleted after start-up is missing', async () => {
      const bm = await start();
      fs.rmSync(backups(), { recursive: true, force: true });
      const status = (await bm.getAutoBackupStatus()).folder;
      expect(status.exists).toBe(false);
      expect(status.fault).toBe('missing');
    });

    test('a path that is a file, not a folder, is not a folder even when only its owner can open it', async () => {
      const bm = await start();
      const file = path.join(dir, 'not-a-folder');
      fs.writeFileSync(file, 'x', { mode: 0o600 });
      (bm as unknown as Inner).backupDirectory = file;
      const status = (await bm.getAutoBackupStatus()).folder;
      expect(status.exists).toBe(false);
      expect(status.fault).toBe('file');
    });

    test('no folder set at all is told apart from a folder whose drive was not connected at start-up', async () => {
      const bm = await start();
      (bm as unknown as Inner).backupDirectory = '';
      props['ngdpbase.backup.directory'] = '';
      let status = (await bm.getAutoBackupStatus()).folder;
      expect(status.exists).toBe(false);
      expect(status.fault).toBe('unset');

      // Start-up clears the folder when its drive is not mounted, while the setting still names it.
      props['ngdpbase.backup.directory'] = backups();
      status = (await bm.getAutoBackupStatus()).folder;
      expect(status.exists).toBe(false);
      expect(status.fault).toBe('unmounted');
      // The page names the folder the setting still holds.
      expect(status.named).toBe(backups());
    });
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

    test('${SLOW_STORAGE}/... with SLOW_STORAGE unset never makes a folder called ${SLOW_STORAGE}', async () => {
      // The test setup sets SLOW_STORAGE; this case is the one where it is not.
      const saved = process.env.SLOW_STORAGE;
      delete process.env.SLOW_STORAGE;
      try {
        const bm = await start();
        const typed = '${SLOW_STORAGE}/ngdpbase-2492-slow';
        strayInCwd.push(path.resolve('${SLOW_STORAGE}'));

        await bm.updateAutoBackupConfig({ directory: typed }, CTX);

        expect(fs.statSync(path.join(dir, 'fast', 'ngdpbase-2492-slow')).isDirectory()).toBe(true);
        expect(fs.existsSync(path.resolve('${SLOW_STORAGE}'))).toBe(false);
      } finally {
        if (saved !== undefined) process.env.SLOW_STORAGE = saved;
      }
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

    describe('an environment variable in the typed folder is read as start-up reads it', () => {
      let saved: string | undefined;
      beforeEach(() => { saved = process.env.SLOW_STORAGE; });
      afterEach(() => {
        if (saved === undefined) delete process.env.SLOW_STORAGE; else process.env.SLOW_STORAGE = saved;
      });

      test('the shipped default ${SLOW_STORAGE}/backups, with SLOW_STORAGE set, is checked in the folder start-up uses', async () => {
        const slow = path.join(dir, 'slow');
        process.env.SLOW_STORAGE = slow;
        const typed = '${SLOW_STORAGE}/backups';
        const bm = await start();

        await bm.updateAutoBackupConfig({ directory: typed }, CTX);

        // The folder that was made and checked is the one under SLOW_STORAGE, not one under the data folder.
        expect(fs.statSync(path.join(slow, 'backups')).isDirectory()).toBe(true);
        expect(fs.existsSync(path.join(dir, 'fast', 'backups'))).toBe(false);
        expect(props['ngdpbase.backup.directory']).toBe(typed);
        // After a restart the stored text resolves to that same folder, and backups land in it.
        const restarted = await start();
        expect((await restarted.getAutoBackupStatus()).config.directory).toBe(path.join(slow, 'backups'));
        expect((await bm.getAutoBackupStatus()).config.directory).toBe(path.join(slow, 'backups'));
        await expect(bm.createBackup(CTX)).resolves.toContain(path.join(slow, 'backups'));
      });

      test('a refused ${SLOW_STORAGE} folder names the folder the variable points to', async () => {
        const blocker = path.join(dir, 'a-file');
        fs.writeFileSync(blocker, 'x');
        process.env.SLOW_STORAGE = blocker;
        const bm = await start();

        const message = await messageOf(() => bm.updateAutoBackupConfig({ directory: '${SLOW_STORAGE}/backups' }, CTX));

        expect(message).toContain(path.join(blocker, 'backups'));
        expect(props['ngdpbase.backup.directory']).toBe(backups());
      });
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
      // The system's own text: its code, its call and its path.
      expect(said).not.toMatch(/E[A-Z]{3,6}\b|scandir|no such file/);
      expect(said).not.toContain('/Volumes/jims');
    });

    test('an error the code threw itself is said as it was written', () => {
      expect(describeBackupError(new Error('the backup key is not set'))).toBe('the backup key is not set');
    });

    test('a system error wrapped in a plain Error is still said in plain words, whatever the wrapper text holds', () => {
      const wrapped = new Error("the backup record is there but can't be read (ENOENT: no such file or directory, open '/Volumes/jims/data/record.json')", { cause: node('ENOENT', 'ENOENT: no such file or directory') });
      const said = describeBackupError(wrapped);
      expect(said).not.toMatch(/ENOENT|no such file/);
      expect(said).not.toContain('/Volumes/jims');
    });
  });
});
