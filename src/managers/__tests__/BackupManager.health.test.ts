/**
 * #1563 — backups never fail silently.
 *
 * A failed backup is an outage that stays until one succeeds, across
 * restarts; no good backup within the window is an outage too (automatic
 * backups on, off, and a site that never had one); a backup there is no room
 * for is refused before anything is written; a backup that does not read
 * back is removed and is a failure; the check runs at start and on the
 * `backup.health` timer; and the last good backup is read from the backup
 * directory, so it survives a restart.
 *
 * Real BackupManager and FileBackupProvider on files in a mkdtemp directory;
 * each test removes only that directory. The backup key is made up here.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import BackupManager, { BACKUP_HEALTH_JOB_ID, BACKUPS_NOT_WORKING_TITLE, longestGapMs, type BackupHealth } from '../BackupManager';
import { BACKUP_KEY_ENV, backupKeyFingerprint } from '../../utils/backupKey';
import { parseSchedule } from '../../utils/schedule';
import { readBackupDocument } from '../../utils/backupDocument';
import { encryptBuffer } from '../../utils/backupCrypto';
import { gzipSync } from 'node:zlib';

const CTX = { username: 'admin', roles: ['admin'], isAuthenticated: true, ipAddress: '203.0.113.7' };
const DAY = 86_400_000;

type Maintenance = { id: string; everyMs: number; run: (ctx: unknown) => Promise<string | void> };

describe('backups never fail silently (#1563)', () => {
  let dir: string;
  let key: string;
  let props: Record<string, unknown>;
  let notifications: Array<{ level: string; title: string; message: string }>;
  let maintenance: Maintenance[];
  let autoJob: { enabled: boolean; rrule: string; timeZone: string; nextSlot: string | null } | null;
  let extraManagers: Record<string, unknown>;
  const savedKey = process.env[BACKUP_KEY_ENV];

  const backups = () => path.join(dir, 'backups');
  const healthFile = () => path.join(dir, 'fast', 'backup-health.json');

  /** One start of the site. */
  async function start(): Promise<BackupManager> {
    const managers: Record<string, unknown> = {
      ConfigurationManager: {
        getProperty: (k: string, d: unknown) => (k in props ? props[k] : d),
        getResolvedDataPath: (k: string, d: string) => {
          if (k === 'ngdpbase.backup.directory') return backups();
          if (k === 'ngdpbase.backup.health-file') return healthFile();
          return path.join(dir, 'fast', path.basename(d));
        },
        getInstanceDataFolder: () => path.join(dir, 'fast'),
        setProperty: async (k: string, v: unknown) => { props[k] = v; }
      },
      // Stored notifications outlive a restart, as NotificationManager's do.
      NotificationManager: {
        notifyAdmins: async (n: { level: string; title: string; message: string }) => { notifications.push(n); return 'id'; },
        getAllNotifications: () => notifications
      },
      BackgroundJobManager: {
        registerJob: () => undefined,
        registerMaintenance: (m: Maintenance) => { maintenance.push(m); },
        scheduledJobView: async (id: string) => (id === 'backup.auto' ? autoJob : null)
      },
      ...extraManagers
    };
    const engine = {
      getManager: (n: string) => managers[n] ?? null,
      getRegisteredManagers: () => Object.keys(managers).filter((n) => !['ConfigurationManager', 'NotificationManager', 'BackgroundJobManager'].includes(n))
    };
    const bm = new BackupManager(engine);
    managers.BackupManager = bm;
    await bm.initialize();
    return bm;
  }

  /** Move "now" by `ms`, the clock only: file I/O and the worker run as usual. */
  const later = (ms: number): void => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(Date.now() + ms));
  };

  const notWorking = () => notifications.filter((n) => n.title === BACKUPS_NOT_WORKING_TITLE);

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-1563-'));
    // A backup key made up for this run, recorded as saved, so a healthy site shows nothing at all.
    key = randomBytes(24).toString('base64');
    process.env[BACKUP_KEY_ENV] = key;
    props = { 'ngdpbase.backup.max-backups': 10, 'ngdpbase.backup.key-saved-fingerprint': backupKeyFingerprint(key) };
    notifications = [];
    maintenance = [];
    autoJob = null;
    extraManagers = {};
  });

  afterEach(() => {
    vi.useRealTimers();
    if (savedKey === undefined) delete process.env[BACKUP_KEY_ENV]; else process.env[BACKUP_KEY_ENV] = savedKey;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe('a site that has never made a backup', () => {
    test('is an outage at start, "never", with ONE notification across restarts', async () => {
      const bm = await start();
      expect(bm.getManagerStatus()).toMatchObject({ state: 'degraded', kind: 'outage', reason: expect.stringMatching(/^No good backup since: never/) });
      expect(notWorking()).toHaveLength(1);
      expect(notWorking()[0]).toMatchObject({ level: 'error', message: expect.stringMatching(/never/) });
      const restarted = await start();
      expect(restarted.getManagerStatus().kind).toBe('outage');
      expect(notWorking()).toHaveLength(1);
    });

    test('its first good backup clears the outage', async () => {
      const bm = await start();
      await bm.createBackup(CTX);
      expect(bm.getManagerStatus()).toEqual({ state: 'ready' });
    });
  });

  describe('a backup that fails', () => {
    test('marks an outage with the reason and the last good backup, kept across a restart until a backup succeeds', async () => {
      const bm = await start();
      await bm.createBackup(CTX);
      notifications = [];
      const provider = (bm as unknown as { provider: { writeBackup: (n: string, d: Buffer) => Promise<string> } }).provider;
      provider.writeBackup = async () => { throw Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' }); };
      await expect(bm.createBackup(CTX)).rejects.toThrow(/no space left/);
      expect(bm.getManagerStatus()).toMatchObject({ state: 'degraded', kind: 'outage', reason: expect.stringMatching(/^Backups are not working: the backup destination is out of space.*Last good backup: (?!never)/) });
      expect(notWorking()).toHaveLength(1);
      expect(notWorking()[0].message).toMatch(/A backup failed: the backup destination is out of space/);
      // The same failure again is not a second notification.
      await expect(bm.createBackup(CTX)).rejects.toThrow(/no space left/);
      expect(notWorking()).toHaveLength(1);
      // A restart does not forget it.
      const restarted = await start();
      expect(restarted.getManagerStatus()).toMatchObject({ kind: 'outage', reason: expect.stringMatching(/out of space/) });
      // The next good backup clears it, for good.
      await restarted.createBackup(CTX);
      expect(restarted.getManagerStatus()).toEqual({ state: 'ready' });
      expect((await start()).getManagerStatus()).toEqual({ state: 'ready' });
    });

    test('permission and encryption failures are named', async () => {
      const bm = await start();
      await bm.createBackup(CTX);
      const provider = (bm as unknown as { provider: { writeBackup: unknown } }).provider;
      provider.writeBackup = async () => { throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }); };
      await expect(bm.createBackup(CTX)).rejects.toThrow();
      expect(bm.getManagerStatus().reason).toMatch(/permission denied writing to the backup destination/);
    });

    test('a manager part failing: "A backup is incomplete" (the existing notice), an outage, and that backup is not counted as good', async () => {
      const bm = await start();
      await bm.createBackup(CTX);
      const goodBefore = (await bm.getBackupHealth()).lastGood!.filename;
      extraManagers = { UserManager: { backup: async () => { throw new Error('the user store could not be read'); } } };
      const site = await start();
      notifications = [];
      later(1000);
      await site.createBackup(CTX, { filename: 'incomplete-ngdpbase-backup.json.gz' });
      expect(notifications.map((n) => n.title)).toEqual(['A backup is incomplete']);
      expect(site.getManagerStatus()).toMatchObject({ kind: 'outage', reason: expect.stringMatching(/a backup is incomplete — UserManager: the user store could not be read/) });
      expect((await site.getBackupHealth()).lastGood!.filename).toBe(goodBefore);
    });
  });

  describe('no good backup within the window', () => {
    test('automatic backups off: 7 days (ngdpbase.backup.stale-fallback-days)', async () => {
      const bm = await start();
      await bm.createBackup(CTX);
      later(6 * DAY);
      expect((await bm.refreshBackupHealth())!.stale).toBe(false);
      expect(bm.getManagerStatus()).toEqual({ state: 'ready' });
      later(2 * DAY);
      const health = (await bm.refreshBackupHealth())!;
      expect(health).toMatchObject({ stale: true, autoBackup: false, staleAfterMs: 7 * DAY });
      expect(bm.getManagerStatus()).toMatchObject({ kind: 'outage', configKey: 'ngdpbase.backup.auto-backup', reason: expect.stringMatching(/^No good backup since .*automatic backups are off/) });
      expect(notWorking()).toHaveLength(2); // the fresh site's "never" at start, then this stretch
      await bm.refreshBackupHealth();
      expect(notWorking()).toHaveLength(2);
    });

    test('automatic backups on: 2 x the longest gap between runs (daily: 2 days)', async () => {
      props['ngdpbase.backup.auto-backup'] = true;
      autoJob = { enabled: true, rrule: 'FREQ=DAILY;BYHOUR=2;BYMINUTE=0', timeZone: 'UTC', nextSlot: '2030-01-01T02:00:00.000Z' };
      const bm = await start();
      await bm.createBackup(CTX);
      later(1.5 * DAY);
      expect((await bm.refreshBackupHealth())).toMatchObject({ stale: false, autoBackup: true, staleAfterMs: 2 * DAY, nextRun: '2030-01-01T02:00:00.000Z' });
      later(1 * DAY);
      await bm.refreshBackupHealth();
      expect(bm.getManagerStatus()).toMatchObject({ kind: 'outage', reason: expect.stringMatching(/automatic backups are on, but none has succeeded/) });
    });

    test('automatic backups paused in Admin → Scheduled Jobs count as off', async () => {
      props['ngdpbase.backup.auto-backup'] = true;
      autoJob = { enabled: false, rrule: 'FREQ=DAILY;BYHOUR=2;BYMINUTE=0', timeZone: 'UTC', nextSlot: null };
      const bm = await start();
      await bm.createBackup(CTX);
      expect(await bm.getBackupHealth()).toMatchObject({ autoBackup: false, staleAfterMs: 7 * DAY, nextRun: null });
    });

    test('the multiplier and the fallback are config', async () => {
      props['ngdpbase.backup.stale-fallback-days'] = 1;
      const bm = await start();
      await bm.createBackup(CTX);
      later(1.1 * DAY);
      expect((await bm.getBackupHealth()).stale).toBe(true);
      props['ngdpbase.backup.auto-backup'] = true;
      props['ngdpbase.backup.stale-interval-multiplier'] = 3;
      autoJob = { enabled: true, rrule: 'FREQ=DAILY;BYHOUR=2;BYMINUTE=0', timeZone: 'UTC', nextSlot: null };
      const on = await start();
      expect((await on.getBackupHealth()).staleAfterMs).toBe(3 * DAY);
    });

    test('the longest gap of an uneven schedule: Mon, Wed, Fri is 3 days; monthly is 31', () => {
      const from = new Date('2026-10-21T00:00:00Z');
      expect(longestGapMs(parseSchedule('FREQ=WEEKLY;BYDAY=MO,WE,FR;BYHOUR=2;BYMINUTE=0', { defaultTimeZone: 'UTC' }), from)).toBe(3 * DAY);
      expect(longestGapMs(parseSchedule('FREQ=MONTHLY;BYMONTHDAY=1;BYHOUR=2;BYMINUTE=0', { defaultTimeZone: 'UTC' }), from)).toBe(31 * DAY);
    });
  });

  describe('the check runs at start and on a timer', () => {
    test('backup.health is a routine job every ngdpbase.backup.health-check-interval ms, and its run marks a stale site', async () => {
      props['ngdpbase.backup.health-check-interval'] = 1_800_000;
      const bm = await start();
      await bm.createBackup(CTX);
      const job = maintenance.find((m) => m.id === BACKUP_HEALTH_JOB_ID);
      expect(job.everyMs).toBe(1_800_000);
      later(8 * DAY);
      expect(bm.getManagerStatus()).toEqual({ state: 'ready' });
      expect(await job.run({})).toMatch(/^No good backup since/);
      expect(bm.getManagerStatus().kind).toBe('outage');
    });

    test('at start: a site whose last backup is old starts with the outage', async () => {
      const bm = await start();
      await bm.createBackup(CTX);
      later(8 * DAY);
      expect((await start()).getManagerStatus()).toMatchObject({ kind: 'outage', reason: expect.stringMatching(/^No good backup since/) });
    });
  });

  test('the last good backup is read from the backup directory, so it survives a restart', async () => {
    const bm = await start();
    const file = await bm.createBackup(CTX);
    fs.rmSync(healthFile(), { force: true });
    const health: BackupHealth = await (await start()).getBackupHealth();
    expect(health.lastGood).toMatchObject({ filename: path.basename(file), location: backups(), size: expect.any(Number) });
    expect(health.lastGood!.size).toBeGreaterThan(0);
    expect(health.freeBytes).toEqual(expect.any(Number));
  });

  test('space is checked first: a backup there is no room for is refused before anything is written', async () => {
    const bm = await start();
    await bm.createBackup(CTX);
    const before = fs.readdirSync(backups()).sort();
    const provider = (bm as unknown as { provider: { freeSpace: () => Promise<number | null> } }).provider;
    provider.freeSpace = async () => 10;
    await expect(bm.createBackup(CTX)).rejects.toThrow(/not enough free space at the backup destination .*10 B free.*Nothing was written/);
    expect(fs.readdirSync(backups()).sort()).toEqual(before);
    expect(bm.getManagerStatus()).toMatchObject({ kind: 'outage', reason: expect.stringMatching(/not enough free space/) });
    provider.freeSpace = async () => 1024 ** 4;
    await bm.createBackup(CTX);
    expect(bm.getManagerStatus()).toEqual({ state: 'ready' });
  });

  describe('verify after writing', () => {
    const corruptOn = (bm: BackupManager, flip: (b: Buffer) => void): void => {
      const provider = (bm as unknown as { provider: { writeBackup: (n: string, d: Buffer) => Promise<string> } }).provider;
      const write = provider.writeBackup.bind(provider);
      provider.writeBackup = async (n, d) => {
        const b = Buffer.from(d);
        flip(b);
        return write(n, b);
      };
    };

    test('a changed byte in the middle fails the read-back; the file is removed and it is a failure', async () => {
      const bm = await start();
      await bm.createBackup(CTX);
      corruptOn(bm, (b) => { b[Math.floor(b.length / 2)] ^= 0xff; });
      await expect(bm.createBackup(CTX, { filename: 'corrupt-ngdpbase-backup.json.gz' })).rejects.toThrow(/does not read back, so it was removed/);
      expect(fs.existsSync(path.join(backups(), 'corrupt-ngdpbase-backup.json.gz.enc'))).toBe(false);
      expect(fs.readdirSync(backups()).filter((f) => f.startsWith('corrupt-'))).toEqual([]);
      expect(bm.getManagerStatus()).toMatchObject({ kind: 'outage', reason: expect.stringMatching(/does not read back/) });
    });

    test('a bad GCM tag (the last byte) fails the read-back', async () => {
      const bm = await start();
      corruptOn(bm, (b) => { b[b.length - 1] ^= 0x01; });
      await expect(bm.createBackup(CTX)).rejects.toThrow(/does not read back/);
      expect((await bm.listBackups())).toEqual([]);
    });

    test('without the key: a changed byte fails decompression', async () => {
      delete process.env[BACKUP_KEY_ENV];
      const bm = await start();
      corruptOn(bm, (b) => { b[Math.floor(b.length / 2)] ^= 0xff; });
      await expect(bm.createBackup(CTX)).rejects.toThrow(/does not read back/);
    });

    test('readBackupDocument: under the right key it reads; a flipped byte, a wrong key and a non-document are refused', async () => {
      const doc = { version: '1.0.0', timestamp: '2026-10-21T00:00:00.000Z', application: 'ngdpbase', managers: {} };
      const sealed = await encryptBuffer(gzipSync(JSON.stringify(doc)), key);
      await expect(readBackupDocument(sealed, key, 'b')).resolves.toMatchObject({ version: '1.0.0' });
      const flipped = Buffer.from(sealed);
      flipped[flipped.length - 5] ^= 0x10;
      await expect(readBackupDocument(flipped, key, 'b')).rejects.toThrow(/could not be read/);
      await expect(readBackupDocument(sealed, 'another-key', 'b')).rejects.toThrow(/could not be read/);
      await expect(readBackupDocument(sealed, '', 'b')).rejects.toThrow(/NGDPBASE_BACKUP_KEY is not set/);
      await expect(readBackupDocument(gzipSync('{"no":"version"}'), key, 'b')).rejects.toThrow(/Invalid backup: missing version/);
      await expect(readBackupDocument(Buffer.from('not json'), key, 'b')).rejects.toThrow(/not a readable document/);
    });
  });

  test('the health record lives at ngdpbase.backup.health-file, in this test\'s own folder', async () => {
    await start();
    expect(fs.existsSync(healthFile())).toBe(true);
  });
});
