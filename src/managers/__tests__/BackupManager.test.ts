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
import BackupManager from '../BackupManager';

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
      mockEngine.getManager.mockImplementation((name: string) => {
        if (name === 'ConfigurationManager') return mockConfigManager;
        if (name === 'AuditManager') return { logAuditEvent };
        return null;
      });
      vi.useFakeTimers();
      try {
        // 02:00 on a Tuesday — the fixture's auto-backup-time, daily.
        vi.setSystemTime(new Date(2026, 8, 8, 2, 0, 0));
        await bm['checkAndRunScheduledBackup']();
      } finally {
        vi.useRealTimers();
      }
      const events = logAuditEvent.mock.calls.map((c) => c[0]);
      const created = events.find((e) => e.eventType === 'backup-create');
      expect(created).toBeDefined();
      expect(created).toMatchObject({ user: 'system', metadata: { origin: 'schedule' } });
      expect(String((created!.metadata as Record<string, unknown>).reason)).toMatch(/scheduled auto-backup at 02:00 \(daily\)/);
      expect((created!.metadata as Record<string, unknown>).actorMissing).toBeUndefined();
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
      const backupPath = await bm.createBackup();

      expect(backupPath).toContain(tmpDir);
      expect(backupPath.endsWith('.json.gz')).toBe(true);
      expect(await fs.pathExists(backupPath)).toBe(true);
    });

    test('backup file contains valid compressed JSON', async () => {
      const backupPath = await bm.createBackup();

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

      await bm.createBackup();

      expect(mockPageManager.backup).toHaveBeenCalled();
    });

    test('skips BackupManager itself when collecting data', async () => {
      const spyBackup = vi.spyOn(bm, 'backup');
      mockEngine.getRegisteredManagers.mockReturnValue(['BackupManager']);

      await bm.createBackup();

      // backup() should not be called on BackupManager during createBackup
      expect(spyBackup).not.toHaveBeenCalled();
    });

    test('accepts a custom filename option', async () => {
      const backupPath = await bm.createBackup({ filename: 'custom-test-backup.json.gz' });

      expect(backupPath).toContain('custom-test-backup.json.gz');
      expect(await fs.pathExists(backupPath)).toBe(true);
    });

    test('writes uncompressed JSON when compress is false', async () => {
      const backupPath = await bm.createBackup({ compress: false, filename: 'uncompressed.json.gz' });
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
      const backupPath = await bm.createBackup({ filename: 'test-restore.json.gz' });

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
      const backupPath = await bm.createBackup({ filename: 'skip-test.json.gz' });

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
      const backupPath = await bm.createBackup({ filename: 'error-skip.json.gz' });

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
      const backupPath = await bm.createBackup({ filename: 'filtered.json.gz' });

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
      const p1 = await bm.createBackup({ filename: 'first-ngdpbase-backup.json.gz' });
      // Small delay to ensure different mtime
      await new Promise(r => setTimeout(r, 20));
      await bm.createBackup({ filename: 'second-ngdpbase-backup.json.gz' });

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
      await bm.createBackup({ filename: 'latest-ngdpbase-backup.json.gz' });
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
      await bm.createBackup({ filename: 'status-ngdpbase-backup.json.gz' });

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

    test('enables auto-backup and starts scheduler', async () => {
      await bm.updateAutoBackupConfig({ enabled: true }, ADMIN_CTX);

      const timer = (bm as unknown as { schedulerTimer: unknown }).schedulerTimer;
      expect(timer).not.toBeNull();
      // Clean up: disable to stop the interval
      await bm.updateAutoBackupConfig({ enabled: false }, ADMIN_CTX);
    });

    test('disables auto-backup and stops scheduler', async () => {
      // First enable so there is a timer to stop
      await bm.updateAutoBackupConfig({ enabled: true }, ADMIN_CTX);
      await bm.updateAutoBackupConfig({ enabled: false }, ADMIN_CTX);

      const timer = (bm as unknown as { schedulerTimer: unknown }).schedulerTimer;
      expect(timer).toBeNull();
    });
  });

  describe('checkAndRunScheduledBackup() — via fake timers', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    async function callScheduledBackup(manager: BackupManager) {
      return (manager as unknown as { checkAndRunScheduledBackup(): Promise<void> }).checkAndRunScheduledBackup();
    }

    test('runs backup when time matches and days=daily', async () => {
      // Wednesday 02:00 local time
      vi.setSystemTime(new Date(2025, 0, 8, 2, 0, 0));
      (bm as unknown as { autoBackupTime: string }).autoBackupTime = '02:00';
      (bm as unknown as { autoBackupDays: string }).autoBackupDays = 'daily';

      const spy = vi.spyOn(bm, 'createBackup').mockResolvedValue(undefined);
      await callScheduledBackup(bm);

      expect(spy).toHaveBeenCalled();
    });

    test('runs backup on day-1 of month when days=monthly', async () => {
      // First of the month 02:00 local time
      vi.setSystemTime(new Date(2025, 0, 1, 2, 0, 0));
      (bm as unknown as { autoBackupTime: string }).autoBackupTime = '02:00';
      (bm as unknown as { autoBackupDays: string }).autoBackupDays = 'monthly';

      const spy = vi.spyOn(bm, 'createBackup').mockResolvedValue(undefined);
      await callScheduledBackup(bm);

      expect(spy).toHaveBeenCalled();
    });

    test('skips backup on non-first day of month when days=monthly', async () => {
      vi.setSystemTime(new Date(2025, 0, 8, 2, 0, 0)); // 8th — not day 1
      (bm as unknown as { autoBackupTime: string }).autoBackupTime = '02:00';
      (bm as unknown as { autoBackupDays: string }).autoBackupDays = 'monthly';

      const spy = vi.spyOn(bm, 'createBackup').mockResolvedValue(undefined);
      await callScheduledBackup(bm);

      expect(spy).not.toHaveBeenCalled();
    });

    test('runs backup when current day matches comma-separated days list', async () => {
      // new Date(2025, 0, 8) is a Wednesday
      vi.setSystemTime(new Date(2025, 0, 8, 2, 0, 0));
      (bm as unknown as { autoBackupTime: string }).autoBackupTime = '02:00';
      (bm as unknown as { autoBackupDays: string }).autoBackupDays = 'Mon,Wed,Fri';

      const spy = vi.spyOn(bm, 'createBackup').mockResolvedValue(undefined);
      await callScheduledBackup(bm);

      expect(spy).toHaveBeenCalled();
    });

    test('skips backup when time does not match', async () => {
      vi.setSystemTime(new Date(2025, 0, 8, 3, 0, 0)); // 03:00, config says 02:00
      (bm as unknown as { autoBackupTime: string }).autoBackupTime = '02:00';
      (bm as unknown as { autoBackupDays: string }).autoBackupDays = 'daily';

      const spy = vi.spyOn(bm, 'createBackup').mockResolvedValue(undefined);
      await callScheduledBackup(bm);

      expect(spy).not.toHaveBeenCalled();
    });

    test('catches and logs error when createBackup throws', async () => {
      vi.setSystemTime(new Date(2025, 0, 8, 2, 0, 0));
      (bm as unknown as { autoBackupTime: string }).autoBackupTime = '02:00';
      (bm as unknown as { autoBackupDays: string }).autoBackupDays = 'daily';

      vi.spyOn(bm, 'createBackup').mockRejectedValue(new Error('disk full'));
      // Should not throw — error is caught internally
      await expect(callScheduledBackup(bm)).resolves.toBeUndefined();
    });
  });
});
