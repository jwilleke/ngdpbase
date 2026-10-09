/**
 * BackupManager tests
 *
 * Tests BackupManager's core functionality:
 * - Initialization with ConfigurationManager
 * - backup() — returns own state (managerName, timestamp, data)
 * - createBackup() — collects from all managers, writes compressed .gz
 * - restoreFromFile() — reads, decompresses, calls restore() on each manager
 * - listBackups() — scans backup directory for .json.gz files
 * - getLatestBackup() — returns path to newest backup
 * - getAutoBackupStatus() — returns config + lastBackup
 */

import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import BackupManager, { autoBackupSchedule, AUTO_BACKUP_JOB_ID } from '../BackupManager';
import BackgroundJobManager, { type JobDefinition, type JobRunContext } from '../BackgroundJobManager';
import FileJobStateProvider from '../../providers/FileJobStateProvider';
import { jobContextFromSchedule } from '../../context/JobContext';
import { parseSchedule } from '../../utils/schedule';

/** #1179: config writes take the actor's context; the scheduler settings are written on an admin's behalf. */
const ADMIN_CTX = { username: 'admin', roles: ['admin'], isAuthenticated: true, ipAddress: '203.0.113.7' };
import type { WikiEngine } from '../../types/WikiEngine';

let tmpDir: string;

const mockConfigManager = {
  getProperty: vi.fn((key: string, defaultValue: unknown) => {
    if (key === 'ngdpbase.backup.max-backups') return 10;
    if (key === 'ngdpbase.backup.auto-backup') return false;
    if (key === 'ngdpbase.backup.auto-backup-time') return '02:00';
    if (key === 'ngdpbase.backup.auto-backup-days') return 'daily';
    return defaultValue;
  }),
  getResolvedDataPath: vi.fn((_key: string, _default: string) => tmpDir),
  setProperty: vi.fn().mockResolvedValue(undefined)
};

const mockEngine = {
  getManager: vi.fn((name: string) => {
    if (name === 'ConfigurationManager') return mockConfigManager;
    return null;
  }),
  getRegisteredManagers: vi.fn(() => [] as string[])
};

describe('BackupManager', () => {
  let bm: BackupManager;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'backup-test-'));

    vi.clearAllMocks();
    mockConfigManager.getResolvedDataPath.mockImplementation((_key, _default) => tmpDir);
    mockConfigManager.getProperty.mockImplementation((key: string, defaultValue: unknown) => {
      if (key === 'ngdpbase.backup.max-backups') return 10;
      if (key === 'ngdpbase.backup.auto-backup') return false;
      if (key === 'ngdpbase.backup.auto-backup-time') return '02:00';
      if (key === 'ngdpbase.backup.auto-backup-days') return 'daily';
      return defaultValue;
    });
    mockEngine.getRegisteredManagers.mockReturnValue([]);

    bm = new BackupManager(mockEngine);
    await bm.initialize();
  });

  afterEach(async () => {
    await bm.shutdown();
    await fs.remove(tmpDir);
  });

  describe('#1196 the scheduled backup names its actor', () => {
    test('backup-create carries the system principal, origin schedule and the reason — never unknown', async () => {
      const logAuditEvent = vi.fn(async () => 'id');
      const registered: JobDefinition[] = [];
      mockEngine.getManager.mockImplementation((name: string) => {
        if (name === 'ConfigurationManager') return mockConfigManager;
        if (name === 'AuditManager') return { logAuditEvent };
        if (name === 'BackgroundJobManager') return { registerJob: (d: JobDefinition) => { registered.push(d); } };
        return null;
      });
      const manager = new BackupManager(mockEngine);
      await manager.initialize();
      const ctx = { ...jobContextFromSchedule('system', 'FREQ=DAILY;BYHOUR=2;BYMINUTE=0 slot 2026-09-08T02:00:00.000Z'), signal: new AbortController().signal, slot: null, resume: null, checkpoint: () => undefined } as JobRunContext;
      await registered.at(-1)!.run(() => undefined, ctx);
      const created = logAuditEvent.mock.calls.map((c) => c[0]).find((e) => e.eventType === 'backup-create');
      expect(created).toMatchObject({ user: 'system', metadata: { origin: 'schedule' } });
      expect(String((created!.metadata as Record<string, unknown>).reason)).toMatch(/slot 2026-09-08T02:00:00.000Z/);
      expect((created!.metadata as Record<string, unknown>).actorMissing).toBeUndefined();
      await manager.shutdown();
    });
  });

  describe('Initialization', () => {
    test('throws when ConfigurationManager is missing', async () => {
      const noConfigEngine = { getManager: vi.fn(() => null), getRegisteredManagers: vi.fn(() => []) };
      const manager = new BackupManager(noConfigEngine);

      await expect(manager.initialize()).rejects.toThrow('BackupManager requires ConfigurationManager');
    });

    test('creates backup directory on initialization', async () => {
      expect(await fs.pathExists(tmpDir)).toBe(true);
    });

    test('isInitialized() returns true after initialize', () => {
      expect(bm.isInitialized()).toBe(true);
    });
  });

  describe('backup()', () => {
    test('returns own manager state', async () => {
      const result = await bm.backup();

      expect(result.managerName).toBe('BackupManager');
      expect(result.timestamp).toBeTruthy();
      expect(result.data).toMatchObject({ backupDirectory: tmpDir });
    });
  });

  describe('createBackup()', () => {
    test('creates a .json.gz file in the backup directory', async () => {
      const backupPath = await bm.createBackup(ADMIN_CTX);

      expect(backupPath).toContain(tmpDir);
      expect(backupPath.endsWith('.json.gz')).toBe(true);
      expect(await fs.pathExists(backupPath)).toBe(true);
    });

    test('backup file contains valid compressed JSON', async () => {
      const backupPath = await bm.createBackup(ADMIN_CTX);

      const { promisify } = await import('util');
      const { gunzip } = await import('zlib');
      const gunzipAsync = promisify(gunzip);

      const fileData = await fs.readFile(backupPath);
      const decompressed = await gunzipAsync(fileData);
      const parsed = JSON.parse(decompressed.toString('utf8'));

      expect(parsed.version).toBe('1.0.0');
      expect(parsed.application).toBe('ngdpbase');
      expect(parsed.timestamp).toBeTruthy();
      expect(typeof parsed.managers).toBe('object');
    });

    test('calls backup() on registered managers', async () => {
      const mockPageManager = {
        backup: vi.fn().mockResolvedValue({ managerName: 'PageManager', timestamp: new Date().toISOString(), data: {} })
      };
      mockEngine.getRegisteredManagers.mockReturnValue(['BackupManager', 'PageManager']);
      mockEngine.getManager.mockImplementation((name: string) => {
        if (name === 'ConfigurationManager') return mockConfigManager;
        if (name === 'PageManager') return mockPageManager;
        return null;
      });

      await bm.createBackup(ADMIN_CTX);

      expect(mockPageManager.backup).toHaveBeenCalled();
    });

    test('skips BackupManager itself when collecting data', async () => {
      const spyBackup = vi.spyOn(bm, 'backup');
      mockEngine.getRegisteredManagers.mockReturnValue(['BackupManager']);

      await bm.createBackup(ADMIN_CTX);

      // backup() should not be called on BackupManager during createBackup
      expect(spyBackup).not.toHaveBeenCalled();
    });

    test('accepts a custom filename option', async () => {
      const backupPath = await bm.createBackup(ADMIN_CTX, { filename: 'custom-test-backup.json.gz' });

      expect(backupPath).toContain('custom-test-backup.json.gz');
      expect(await fs.pathExists(backupPath)).toBe(true);
    });

    test('writes uncompressed JSON when compress is false', async () => {
      const backupPath = await bm.createBackup(ADMIN_CTX, { compress: false, filename: 'uncompressed.json.gz' });
      const fileData = await fs.readFile(backupPath, 'utf8');
      const parsed = JSON.parse(fileData);

      expect(parsed.version).toBe('1.0.0');
    });
  });

  describe('restoreFromFile()', () => {
    test('throws when backup file does not exist', async () => {
      await expect(bm.restoreFromFile('/nonexistent/path/backup.json.gz'))
        .rejects.toThrow('Backup file not found');
    });

    test('restores managers from a valid backup file', async () => {
      const backupPath = await bm.createBackup(ADMIN_CTX, { filename: 'test-restore.json.gz' });

      const mockTargetManager = {
        restore: vi.fn().mockResolvedValue(undefined)
      };
      mockEngine.getManager.mockImplementation((name: string) => {
        if (name === 'ConfigurationManager') return mockConfigManager;
        if (name === 'SomeManager') return mockTargetManager;
        return null;
      });

      // Build a backup with SomeManager data and write it
      const { promisify } = await import('util');
      const { gzip, gunzip } = await import('zlib');
      const gzipAsync = promisify(gzip);
      const gunzipAsync = promisify(gunzip);

      const fileData = await fs.readFile(backupPath);
      const decompressed = await gunzipAsync(fileData);
      const data = JSON.parse(decompressed.toString('utf8'));
      data.managers['SomeManager'] = { managerName: 'SomeManager', timestamp: new Date().toISOString(), data: { foo: 'bar' } };

      const recompressed = await gzipAsync(JSON.stringify(data, null, 2));
      await fs.writeFile(backupPath, recompressed);

      const results = await bm.restoreFromFile(backupPath);

      expect(results.success).toContain('SomeManager');
      expect(mockTargetManager.restore).toHaveBeenCalled();
    });

    test('skips managers that are not registered', async () => {
      const backupPath = await bm.createBackup(ADMIN_CTX, { filename: 'skip-test.json.gz' });

      const { promisify } = await import('util');
      const { gzip, gunzip } = await import('zlib');
      const gzipAsync = promisify(gzip);
      const gunzipAsync = promisify(gunzip);

      const fileData = await fs.readFile(backupPath);
      const decompressed = await gunzipAsync(fileData);
      const data = JSON.parse(decompressed.toString('utf8'));
      data.managers['GhostManager'] = { managerName: 'GhostManager', timestamp: new Date().toISOString(), data: {} };

      const recompressed = await gzipAsync(JSON.stringify(data, null, 2));
      await fs.writeFile(backupPath, recompressed);

      const results = await bm.restoreFromFile(backupPath);

      expect(results.skipped).toContain('GhostManager');
    });

    test('skips managers with backup errors', async () => {
      const backupPath = await bm.createBackup(ADMIN_CTX, { filename: 'error-skip.json.gz' });

      const { promisify } = await import('util');
      const { gzip, gunzip } = await import('zlib');
      const gzipAsync = promisify(gzip);
      const gunzipAsync = promisify(gunzip);

      const fileData = await fs.readFile(backupPath);
      const decompressed = await gunzipAsync(fileData);
      const data = JSON.parse(decompressed.toString('utf8'));
      data.managers['ErroredManager'] = { error: 'Backup failed at source' };

      const recompressed = await gzipAsync(JSON.stringify(data, null, 2));
      await fs.writeFile(backupPath, recompressed);

      const mockErroredManager = { restore: vi.fn() };
      mockEngine.getManager.mockImplementation((name: string) => {
        if (name === 'ConfigurationManager') return mockConfigManager;
        if (name === 'ErroredManager') return mockErroredManager;
        return null;
      });

      const results = await bm.restoreFromFile(backupPath);
      expect(results.skipped).toContain('ErroredManager');
      expect(mockErroredManager.restore).not.toHaveBeenCalled();
    });

    test('respects managerFilter option', async () => {
      const backupPath = await bm.createBackup(ADMIN_CTX, { filename: 'filtered.json.gz' });

      const { promisify } = await import('util');
      const { gzip, gunzip } = await import('zlib');
      const gzipAsync = promisify(gzip);
      const gunzipAsync = promisify(gunzip);

      const fileData = await fs.readFile(backupPath);
      const decompressed = await gunzipAsync(fileData);
      const data = JSON.parse(decompressed.toString('utf8'));
      data.managers['ManagerA'] = { managerName: 'ManagerA', timestamp: new Date().toISOString(), data: {} };
      data.managers['ManagerB'] = { managerName: 'ManagerB', timestamp: new Date().toISOString(), data: {} };

      const recompressed = await gzipAsync(JSON.stringify(data, null, 2));
      await fs.writeFile(backupPath, recompressed);

      const results = await bm.restoreFromFile(backupPath, { managerFilter: ['ManagerA'] });

      expect(results.skipped).toContain('ManagerB');
    });

    test('throws when backup has invalid structure (missing version)', async () => {
      const badBackupPath = path.join(tmpDir, 'bad-backup.json.gz');
      const { promisify } = await import('util');
      const { gzip } = await import('zlib');
      const gzipAsync = promisify(gzip);

      const invalidData = { timestamp: new Date().toISOString(), managers: {} }; // no version
      await fs.writeFile(badBackupPath, await gzipAsync(JSON.stringify(invalidData)));

      await expect(bm.restoreFromFile(badBackupPath)).rejects.toThrow('Invalid backup: missing version');
    });
  });

  describe('listBackups()', () => {
    test('returns empty array when no backups exist', async () => {
      const list = await bm.listBackups();
      expect(list).toEqual([]);
    });

    test('returns backup files sorted newest first', async () => {
      const p1 = await bm.createBackup(ADMIN_CTX, { filename: 'first-ngdpbase-backup.json.gz' });
      // Small delay to ensure different mtime
      await new Promise(r => setTimeout(r, 20));
      await bm.createBackup(ADMIN_CTX, { filename: 'second-ngdpbase-backup.json.gz' });

      const list = await bm.listBackups();

      expect(list.length).toBeGreaterThanOrEqual(2);
      // Newest should be first
      expect(list[0].created.getTime()).toBeGreaterThanOrEqual(list[list.length - 1].created.getTime());
      // Each entry has expected fields
      expect(list[0]).toHaveProperty('filename');
      expect(list[0]).toHaveProperty('path');
      expect(list[0]).toHaveProperty('size');
    });
  });

  describe('getLatestBackup()', () => {
    test('returns null when no backups exist', async () => {
      expect(await bm.getLatestBackup()).toBeNull();
    });

    test('returns path to most recent backup', async () => {
      await bm.createBackup(ADMIN_CTX, { filename: 'latest-ngdpbase-backup.json.gz' });
      const latest = await bm.getLatestBackup();

      expect(latest).not.toBeNull();
      expect(latest).toContain('latest-ngdpbase-backup.json.gz');
    });
  });

  describe('getAutoBackupStatus()', () => {
    test('returns config and lastBackup=null when no backups exist', async () => {
      const status = await bm.getAutoBackupStatus();

      expect(status.config.enabled).toBe(false);
      expect(status.config.time).toBe('02:00');
      expect(status.config.days).toBe('daily');
      expect(status.lastBackup).toBeNull();
    });

    test('returns lastBackup date when backups exist', async () => {
      await bm.createBackup(ADMIN_CTX, { filename: 'status-ngdpbase-backup.json.gz' });

      const status = await bm.getAutoBackupStatus();

      expect(status.lastBackup).toBeInstanceOf(Date);
    });
  });

  describe('listBackups() — null directory', () => {
    test('returns [] when backupDirectory is null', async () => {
      (bm as unknown as { backupDirectory: null }).backupDirectory = null;
      const list = await bm.listBackups();
      expect(list).toEqual([]);
    });
  });

  describe('updateAutoBackupConfig()', () => {
    test('throws when ConfigurationManager is not available', async () => {
      const noConfigEngine = { getManager: vi.fn(() => null), getRegisteredManagers: vi.fn(() => []) };
      const manager = new BackupManager(noConfigEngine);
      // Initialize would throw, so call updateAutoBackupConfig directly on uninitialized instance
      // by monkey-patching engine after construction using the underlying engine field
      (manager as unknown as { engine: typeof noConfigEngine }).engine = noConfigEngine;

      await expect(manager.updateAutoBackupConfig({ enabled: true }, ADMIN_CTX)).rejects.toThrow('ConfigurationManager not available');
    });

    test('updates enabled flag and persists via setProperty', async () => {
      await bm.updateAutoBackupConfig({ enabled: false }, ADMIN_CTX);

      expect(mockConfigManager.setProperty).toHaveBeenCalledWith('ngdpbase.backup.auto-backup', false, ADMIN_CTX);
      expect((bm as unknown as { autoBackupEnabled: boolean }).autoBackupEnabled).toBe(false);
    });

    test('updates time and persists via setProperty', async () => {
      await bm.updateAutoBackupConfig({ time: '03:30' }, ADMIN_CTX);

      expect(mockConfigManager.setProperty).toHaveBeenCalledWith('ngdpbase.backup.auto-backup-time', '03:30', ADMIN_CTX);
      expect((bm as unknown as { autoBackupTime: string }).autoBackupTime).toBe('03:30');
    });

    test('updates days and persists via setProperty', async () => {
      await bm.updateAutoBackupConfig({ days: 'Mon,Wed,Fri' }, ADMIN_CTX);

      expect(mockConfigManager.setProperty).toHaveBeenCalledWith('ngdpbase.backup.auto-backup-days', 'Mon,Wed,Fri', ADMIN_CTX);
      expect((bm as unknown as { autoBackupDays: string }).autoBackupDays).toBe('Mon,Wed,Fri');
    });

    test('updates maxBackups and persists via setProperty', async () => {
      await bm.updateAutoBackupConfig({ maxBackups: 5 }, ADMIN_CTX);

      expect(mockConfigManager.setProperty).toHaveBeenCalledWith('ngdpbase.backup.max-backups', 5, ADMIN_CTX);
      expect((bm as unknown as { maxBackups: number }).maxBackups).toBe(5);
    });

    test('updates directory, ensures dir exists, and persists via setProperty', async () => {
      const newDir = path.join(tmpDir, 'new-backups');
      await bm.updateAutoBackupConfig({ directory: newDir }, ADMIN_CTX);

      expect(mockConfigManager.setProperty).toHaveBeenCalledWith('ngdpbase.backup.directory', newDir, ADMIN_CTX);
      expect((bm as unknown as { backupDirectory: string }).backupDirectory).toBe(newDir);
      expect(await fs.pathExists(newDir)).toBe(true);
    });

    test('turning automatic backups on schedules the job; off leaves it to be run by hand (#1720)', async () => {
      const registered: JobDefinition[] = [];
      mockEngine.getManager.mockImplementation((name: string) => {
        if (name === 'ConfigurationManager') return mockConfigManager;
        if (name === 'BackgroundJobManager') return { registerJob: (d: JobDefinition) => { registered.push(d); } };
        return null;
      });
      await bm.updateAutoBackupConfig({ enabled: true }, ADMIN_CTX);
      expect(registered.at(-1)).toMatchObject({
        id: AUTO_BACKUP_JOB_ID,
        schedule: { rrule: 'FREQ=DAILY;BYHOUR=2;BYMINUTE=0', tz: Intl.DateTimeFormat().resolvedOptions().timeZone },
        catchUp: 'latest', overlap: 'skip', persist: true
      });
      await bm.updateAutoBackupConfig({ enabled: false }, ADMIN_CTX);
      expect(registered.at(-1)?.schedule).toBeUndefined();
    });
  });

  describe('autoBackupSchedule (#1720): the settings as a rule, in the server\'s own time zone', () => {
    test.each([
      ['daily', 'FREQ=DAILY;BYHOUR=2;BYMINUTE=0'],
      ['monthly', 'FREQ=MONTHLY;BYMONTHDAY=1;BYHOUR=2;BYMINUTE=0'],
      ['weekdays', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=2;BYMINUTE=0'],
      ['Mon,Wed,Fri', 'FREQ=WEEKLY;BYDAY=MO,WE,FR;BYHOUR=2;BYMINUTE=0'],
      ['mon, wednesday ,FRI', 'FREQ=WEEKLY;BYDAY=MO,WE,FR;BYHOUR=2;BYMINUTE=0']
    ])('%s', (days, rrule) => {
      expect(autoBackupSchedule('02:00', days, 'America/New_York')).toEqual({ rrule, tz: 'America/New_York' });
    });

    test('a time or a day it cannot read is refused, naming the setting', () => {
      expect(() => autoBackupSchedule('25:00', 'daily', 'UTC')).toThrow(/auto-backup-time '25:00'/);
      expect(() => autoBackupSchedule('2pm', 'daily', 'UTC')).toThrow(/auto-backup-time/);
      expect(() => autoBackupSchedule('02:00', 'Mon,Funday', 'UTC')).toThrow(/auto-backup-days 'Mon,Funday'.*funday/);
      expect(() => autoBackupSchedule('02:00', '', 'UTC')).toThrow(/auto-backup-days/);
    });

    test('the same days and time the old timer matched, in local time', () => {
      const tz = 'America/New_York';
      const monthly = parseSchedule(autoBackupSchedule('02:00', 'monthly', tz), { defaultTimeZone: 'UTC' });
      // 02:00 New York on the 1st. On 2026-11-01 the clocks go back at 02:00
      // daylight time, so 02:00 is then standard time: 07:00 UTC, once.
      expect(monthly.slotsBetween(new Date('2026-10-02T00:00:00Z'), new Date('2027-01-02T00:00:00Z')).map((d) => d.toISOString()))
        .toEqual(['2026-11-01T07:00:00.000Z', '2026-12-01T07:00:00.000Z', '2027-01-01T07:00:00.000Z']);
      const weekly = parseSchedule(autoBackupSchedule('23:30', 'Mon,Fri', tz), { defaultTimeZone: 'UTC' });
      // Friday 2026-10-09 23:30 New York (daylight time) is 03:30 UTC on the 10th.
      expect(weekly.nextSlot(new Date('2026-10-09T12:00:00Z'))?.toISOString()).toBe('2026-10-10T03:30:00.000Z');
    });
  });

  describe('a backup missed while the server was down runs once when it is back (#1720)', () => {
    test('down across 02:00: one backup at start, from the schedule, audited', async () => {
      const stateDir = path.join(tmpDir, 'jobs');
      let clock = new Date(2026, 9, 9, 1, 30).getTime(); // 01:30 local, before the backup time
      const events: Record<string, unknown>[] = [];
      const config = {
        ...mockConfigManager,
        getProperty: vi.fn((key: string, fallback: unknown) => {
          if (key === 'ngdpbase.backup.auto-backup') return true;
          if (key === 'ngdpbase.backup.auto-backup-time') return '02:00';
          if (key === 'ngdpbase.backup.auto-backup-days') return 'daily';
          if (key === 'ngdpbase.backup.max-backups') return 10;
          return fallback;
        })
      };

      /** One server start: a job manager over the shared state, and BackupManager registering with it. */
      async function start() {
        const managers: Record<string, unknown> = {
          ConfigurationManager: config,
          AuditManager: { logAuditEvent: (e: Record<string, unknown>) => { events.push(e); return Promise.resolve('id'); } }
        };
        const engine = { getManager: (n: string) => managers[n] ?? null, getRegisteredManagers: () => [] as string[] };
        const jobs = new BackgroundJobManager(engine, {
          stateProvider: new FileJobStateProvider(stateDir, { now: () => clock }),
          now: () => new Date(clock)
        });
        managers.BackgroundJobManager = jobs;
        const backups = new BackupManager(engine);
        await backups.initialize();
        const created = vi.spyOn(backups, 'createBackup').mockResolvedValue('/backups/one.json.gz');
        return { jobs, backups, created };
      }

      const first = await start();
      await first.jobs.tick();
      expect(first.created).not.toHaveBeenCalled();
      await first.jobs.shutdown();
      await first.backups.shutdown();

      // Down until 07:00 local: 02:00 passed with nobody running.
      clock = new Date(2026, 9, 9, 7, 0).getTime();
      const second = await start();
      await second.jobs.tick();
      await second.jobs.whenIdle();
      expect(second.created).toHaveBeenCalledTimes(1);
      expect(second.created.mock.calls[0][0]).toMatchObject({ origin: 'schedule', slot: new Date(2026, 9, 9, 2, 0).toISOString() });
      expect(events.filter((e) => e.eventType === 'job-completed')).toHaveLength(1);

      // A later look in the same morning does not back up again.
      clock += 10 * 60_000;
      await second.jobs.tick();
      await second.jobs.whenIdle();
      expect(second.created).toHaveBeenCalledTimes(1);
      await second.jobs.shutdown();
      await second.backups.shutdown();
    });
  });
});
