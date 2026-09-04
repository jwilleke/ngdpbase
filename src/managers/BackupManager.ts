import BaseManager, { BackupData as BaseBackupData } from './BaseManager.js';
import zlib from 'zlib';
import { promisify } from 'util';
import logger from '../utils/logger.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';
import type BaseBackupProvider from '../providers/BaseBackupProvider.js';
import { recordAuditEvent } from '../utils/auditEvents.js';
import { AUDIT_EVENT } from '../utils/auditEventNames.js';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/**
 * Backup options
 */
export interface BackupOptions {
  filename?: string;
  compress?: boolean;
}

/**
 * Restore options
 */
export interface RestoreOptions {
  skipValidation?: boolean;
  managerFilter?: string[];
}

/**
 * Backup data structure
 */
export interface BackupData {
  version: string;
  timestamp: string;
  application: string;
  managers: Record<string, unknown>;
}

/**
 * Restore results
 */
export interface RestoreResults {
  success: string[];
  failed: Array<{ manager: string; error: string }>;
  skipped: string[];
}

/**
 * Backup file information
 */
export interface BackupFileInfo {
  filename: string;
  path: string;
  size: number;
  created: Date;
  modified: Date;
}

/**
 * BackupManager - Coordinates backup and restore operations across all managers
 *
 * Orchestrates system-wide backup and restore by calling backup()/restore()
 * on all registered managers and aggregating their data into compressed archives.
 *
 * Responsibilities:
 * - Call backup() on all registered managers
 * - Aggregate backup data into a single .gz file
 * - Restore from .gz backup file
 * - Call restore() on all registered managers
 *
 * Architecture:
 * - Each manager implements backup() to return its state
 * - BackupManager collects all states into one object
 * - Serializes to JSON and compresses with gzip
 * - Stores as single .gz file
 *
 * @class BackupManager
 * @extends BaseManager
 *
 * @property {string|null} backupDirectory - Directory for backup files
 * @property {number} maxBackups - Maximum number of backups to retain
 *
 * @see {@link BaseManager} for base functionality and backup() pattern
 *
 * @example
 * const backupManager = engine.getManager('BackupManager');
 * const backupPath = await backupManager.createBackup();
 * console.log('Backup created:', backupPath);
 */
/** Auto-backup schedule configuration */
export interface AutoBackupConfig {
  enabled: boolean;
  time: string;       // HH:MM (24-hour)
  days: string;       // "daily" | "monthly" | comma-separated day names e.g. "Mon,Wed,Fri"
  maxBackups: number;
  directory: string;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

class BackupManager extends BaseManager {
  private backupDirectory: string | null;
  private maxBackups: number;
  private schedulerTimer: ReturnType<typeof setInterval> | null;
  private autoBackupEnabled: boolean;
  private autoBackupTime: string;   // HH:MM
  private autoBackupDays: string;   // "daily" | "monthly" | "Mon,Wed,..."
  // #170: storage target is delegated to a BackupProvider (default
  // FileBackupProvider). Orchestration/serialization stays in this manager.
  private provider: BaseBackupProvider | null;
  private providerClass: string;

  /**
   * Creates a new BackupManager instance
   *
   * @constructor
   * @param {any} engine - The wiki engine instance
   */

  constructor(engine: WikiEngine) {
    super(engine);
    this.backupDirectory = null;
    this.maxBackups = 10;
    this.schedulerTimer = null;
    this.autoBackupEnabled = false;
    this.autoBackupTime = '02:00';
    this.autoBackupDays = 'daily';
    this.provider = null;
    this.providerClass = 'FileBackupProvider';
  }

  /** Normalize a config provider name to its PascalCase class name. */
  private normalizeProviderName(providerName: string): string {
    if (/^[A-Z]/.test(providerName)) return providerName;
    const known: Record<string, string> = {
      filebackupprovider: 'FileBackupProvider'
    };
    return known[providerName.toLowerCase()]
      ?? providerName
        .split(/[-_]/)
        .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
        .join('');
  }

  /**
   * Load the configured backup storage provider (#170). Mirrors the
   * dynamic-import + fallback pattern used by AuditManager / SearchManager.
   * Falls back to FileBackupProvider on any load error so backups never
   * silently lose their storage target.
   */
  private async loadProvider(): Promise<void> {
    type BackupProviderConstructor = new (engine: WikiEngine) => BaseBackupProvider;
    try {
      const mod = await import(/* @vite-ignore */ `../providers/${this.providerClass}.js`) as { default: BackupProviderConstructor };
      this.provider = new mod.default(this.engine);
      await this.provider.initialize();
    } catch (error) {
      logger.error(`Failed to load backup provider ${this.providerClass}:`, error);
      if (this.providerClass !== 'FileBackupProvider') {
        logger.warn('Falling back to FileBackupProvider');
        const mod = await import('../providers/FileBackupProvider.js') as unknown as { default: BackupProviderConstructor };
        this.provider = new mod.default(this.engine);
        await this.provider.initialize();
      } else {
        throw error;
      }
    }
  }

  /**
   * Initialize BackupManager
   *
   * @async
   * @param {Record<string, unknown>} [config={}] - Configuration object (unused, reads from ConfigurationManager)
   * @returns {Promise<void>}
   * @throws {Error} If ConfigurationManager is not available
   */
  async initialize(config: Record<string, unknown> = {}): Promise<void> {
    await super.initialize(config);

    // Get backup directory from ConfigurationManager
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) {
      throw new Error('BackupManager requires ConfigurationManager to be initialized.');
    }

    // Uses getResolvedDataPath to support INSTANCE_DATA_FOLDER
    this.backupDirectory = configManager.getResolvedDataPath(
      'ngdpbase.backup.directory',
      './data/backups'
    );

    this.maxBackups = configManager.getProperty('ngdpbase.backup.max-backups') as number;
    this.autoBackupEnabled = configManager.getProperty('ngdpbase.backup.auto-backup') as boolean ?? false;
    this.autoBackupTime = configManager.getProperty('ngdpbase.backup.auto-backup-time') as string ?? '02:00';
    this.autoBackupDays = configManager.getProperty('ngdpbase.backup.auto-backup-days') as string ?? 'daily';

    // #170: resolve the storage provider name (lowercase config -> PascalCase
    // class), e.g. filebackupprovider -> FileBackupProvider.
    const providerName = configManager.getProperty(
      'ngdpbase.backup.provider', 'filebackupprovider'
    ) as string;
    this.providerClass = this.normalizeProviderName(providerName);

    // Preflight: if the configured path lives on a volume that is not mounted,
    // log a clear warning and disable backups for this session rather than
    // letting the provider's ensureContainer() crash engine init with an
    // opaque EACCES.
    const preflight = this.preflightConfiguredPath(
      'ngdpbase.backup.directory',
      this.backupDirectory
    );
    if (!preflight.ok) {
      logger.warn('   Backups are DISABLED for this session.');
      this.autoBackupEnabled = false;
      this.backupDirectory = '';
      this.provider = null;
      logger.info('✅ BackupManager initialized (degraded — backups disabled)');
      return;
    }

    // #170: load the storage provider — it owns ensuring the container exists.
    await this.loadProvider();

    // Start scheduler if auto-backup is enabled
    if (this.autoBackupEnabled) {
      this.startScheduler();
    }

    logger.info('✅ BackupManager initialized');
    logger.info(`📁 Backup directory: ${this.backupDirectory}`);
    logger.info(`📊 Max backups to retain: ${this.maxBackups}`);
    logger.info(`🕐 Auto backup: ${this.autoBackupEnabled ? `enabled at ${this.autoBackupTime} (${this.autoBackupDays})` : 'disabled'}`);
  }

  /**
   * Backup BackupManager's own state (conforms to BaseManager interface)
   *
   * @returns {Promise<BaseBackupData>} Backup data for this manager
   */
  async backup(): Promise<BaseBackupData> {
    return {
      managerName: 'BackupManager',
      timestamp: new Date().toISOString(),
      data: {
        backupDirectory: this.backupDirectory,
        maxBackups: this.maxBackups
      }
    };
  }

  /**
   * Restore BackupManager's own state (conforms to BaseManager interface)
   *
   * @param {BaseBackupData} backupData - Backup data from backup()
   * @returns {Promise<void>}
   */
  async restoreState(backupData: BaseBackupData): Promise<void> {
    if (backupData?.data) {
      // BackupManager state is read from config, so nothing to restore
      logger.info('[BackupManager] State restore not needed (config-driven)');
    }
  }

  /**
   * Perform a complete backup of all managers to a file
   *
   * Process:
   * 1. Get all registered managers from engine
   * 2. Call backup() on each manager
   * 3. Aggregate all backup data
   * 4. Compress to .gz file
   * 5. Save with timestamp
   * 6. Clean up old backups
   *
   * @param {BackupOptions} options - Backup options
   * @param {string} options.filename - Custom filename (optional)
   * @param {boolean} options.compress - Whether to compress (default: true)
   * @returns {Promise<string>} Path to created backup file
   */
  async createBackup(options: BackupOptions = {}, actor?: { username?: string; ipAddress?: string }): Promise<string> {
    const startTime = Date.now();
    logger.info('🔄 Starting backup operation...');

    try {
      if (!this.backupDirectory || !this.provider) {
        throw new Error('Backup directory not initialized');
      }

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = options.filename || `${timestamp}-ngdpbase-backup.json.gz`;

      // Collect backup data from all managers
      const backupData: BackupData = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        application: 'ngdpbase',
        managers: {}
      };

      // Get all manager names from engine
      const managerNames = this.engine.getRegisteredManagers();
      logger.info(`📋 Found ${managerNames.length} registered managers`);

      // Call backup() on each manager

      for (const managerName of managerNames) {
        // Skip BackupManager itself
        if (managerName === 'BackupManager') {
          continue;
        }

        try {
          const manager = this.engine.getManager<BaseManager>(managerName);
          if (!manager) {
            logger.warn(`⚠️  Manager not found: ${managerName}`);
            continue;
          }

          logger.info(`📦 Backing up ${managerName}...`);
          const managerBackup = await manager.backup();

          backupData.managers[managerName] = managerBackup;
          logger.info(`✅ ${managerName} backed up successfully`);
        } catch (error) {
          logger.error(`❌ Failed to backup ${managerName}:`, error);
          // Continue with other managers even if one fails
          backupData.managers[managerName] = {
            error: (error as Error).message,
            timestamp: new Date().toISOString()
          };
        }
      }

      // Serialize to JSON
      const jsonData = JSON.stringify(backupData, null, 2);
      logger.info(`📊 Backup data size: ${(jsonData.length / 1024).toFixed(2)} KB`);

      // Compress with gzip
      let finalData: string | Buffer = jsonData;
      if (options.compress !== false) {
        const compressed = await gzip(jsonData);
        finalData = compressed;
        logger.info(`🗜️  Compressed size: ${(compressed.length / 1024).toFixed(2)} KB (${((compressed.length / jsonData.length) * 100).toFixed(1)}% of original)`);
      }

      // Write via the storage provider (#170)
      const backupPath = await this.provider.writeBackup(filename, finalData);

      const duration = Date.now() - startTime;
      logger.info(`✅ Backup completed successfully in ${duration}ms`);
      logger.info(`📁 Backup saved to: ${backupPath}`);

      // #1215: a full copy of the instance now exists somewhere; say who asked
      // and where it went. on-failure: continue — the backup is already written and a
      // slow sink must not fail it.
      await recordAuditEvent(this.engine.getManager('AuditManager'), {
        eventType: AUDIT_EVENT.BACKUP_CREATE,
        user: actor?.username ?? 'unknown',
        ipAddress: actor?.ipAddress,
        action: 'backup-create',
        result: 'success',
        severity: 'medium',
        resource: backupPath,
        resourceType: 'backup',
        metadata: { filename, bytes: finalData.length, managers: managerNames.length, ...(actor ? {} : { actorMissing: true }) }
      }, (err) => logger.warn('[BackupManager] Audit record failed for backup-create:', err));

      // Clean up old backups
      await this.cleanupOldBackups();

      return backupPath;
    } catch (error) {
      logger.error('❌ Backup operation failed:', error);
      throw error;
    }
  }

  /**
   * Restore all managers from a backup file
   *
   * Process:
   * 1. Read and decompress backup file
   * 2. Parse JSON data
   * 3. Validate backup structure
   * 4. Call restore() on each manager with its data
   *
   * @param {string} backupPath - Path to backup file
   * @param {RestoreOptions} options - Restore options
   * @param {boolean} options.skipValidation - Skip validation (default: false)
   * @param {string[]} options.managerFilter - Only restore specific managers
   * @returns {Promise<RestoreResults>} Restore results
   */
  async restoreFromFile(backupPath: string, options: RestoreOptions = {}): Promise<RestoreResults> {
    const startTime = Date.now();
    logger.info(`🔄 Starting restore operation from: ${backupPath}`);

    try {
      if (!this.provider) {
        throw new Error('Backup provider not initialized');
      }

      // Verify backup file exists
      if (!(await this.provider.backupExists(backupPath))) {
        throw new Error(`Backup file not found: ${backupPath}`);
      }

      // Read backup file via the storage provider (#170)
      const fileData = await this.provider.readBackup(backupPath);

      logger.info(`📁 Read backup file: ${(fileData.length / 1024).toFixed(2)} KB`);

      // Decompress if needed (detect by extension or try decompression)
      let jsonData: string;
      if (backupPath.endsWith('.gz')) {
        const decompressed = await gunzip(fileData);
        jsonData = decompressed.toString('utf8');
        logger.info(`🗜️  Decompressed to: ${(jsonData.length / 1024).toFixed(2)} KB`);
      } else {
        jsonData = fileData.toString('utf8');
      }

      // Parse JSON
      const backupData = JSON.parse(jsonData) as BackupData;
      logger.info(`📊 Backup version: ${backupData.version}`);
      logger.info(`📅 Backup timestamp: ${backupData.timestamp}`);

      // Validate backup structure
      if (!options.skipValidation) {
        this.validateBackupData(backupData);
      }

      // Restore results
      const results: RestoreResults = {
        success: [],
        failed: [],
        skipped: []
      };

      // Get manager names from backup
      const managerNames = Object.keys(backupData.managers);
      logger.info(`📋 Found ${managerNames.length} managers in backup`);

      // Restore each manager
      for (const managerName of managerNames) {
        // Check if manager filter is applied
        if (options.managerFilter && !options.managerFilter.includes(managerName)) {
          logger.info(`⏭️  Skipping ${managerName} (filtered)`);
          results.skipped.push(managerName);
          continue;
        }

        try {
          const manager = this.engine.getManager<BaseManager>(managerName);
          if (!manager) {
            logger.warn(`⚠️  Manager not found: ${managerName}, skipping`);
            results.skipped.push(managerName);
            continue;
          }

          const managerBackupData = backupData.managers[managerName] as BaseBackupData | { error?: string };

          // Skip if manager backup had an error
          if ('error' in managerBackupData && typeof managerBackupData.error === 'string') {
            logger.warn(`⚠️  Skipping ${managerName} (backup had error: ${managerBackupData.error})`);
            results.skipped.push(managerName);
            continue;
          }

          logger.info(`📦 Restoring ${managerName}...`);
          await manager.restore(managerBackupData as BaseBackupData);

          results.success.push(managerName);
          logger.info(`✅ ${managerName} restored successfully`);
        } catch (error) {
          logger.error(`❌ Failed to restore ${managerName}:`, error);
          results.failed.push({ manager: managerName, error: (error as Error).message });
        }
      }

      const duration = Date.now() - startTime;
      logger.info(`✅ Restore completed in ${duration}ms`);
      logger.info(`✅ Success: ${results.success.length}, ❌ Failed: ${results.failed.length}, ⏭️  Skipped: ${results.skipped.length}`);

      return results;
    } catch (error) {
      logger.error('❌ Restore operation failed:', error);
      throw error;
    }
  }

  /**
   * Validate backup data structure
   * @param {BackupData} backupData - Backup data to validate
   * @throws {Error} If validation fails
   * @private
   */
  private validateBackupData(backupData: BackupData): void {
    if (!backupData.version) {
      throw new Error('Invalid backup: missing version');
    }
    if (!backupData.timestamp) {
      throw new Error('Invalid backup: missing timestamp');
    }
    if (!backupData.managers || typeof backupData.managers !== 'object') {
      throw new Error('Invalid backup: missing or invalid managers data');
    }
    logger.info('✅ Backup validation passed');
  }

  /**
   * List all available backups
   * @returns {Promise<BackupFileInfo[]>} List of backup files with metadata
   */
  async listBackups(): Promise<BackupFileInfo[]> {
    try {
      if (!this.backupDirectory || !this.provider) {
        return [];
      }

      // Storage listing comes from the provider (#170); the backup-naming
      // convention stays this manager's concern.
      const objects = await this.provider.listBackupObjects();
      const backups = objects
        .filter(o =>
          // Support both old format (ngdpbase-backup-{timestamp}) and new format ({timestamp}-ngdpbase-backup)
          (o.filename.startsWith('ngdpbase-backup-') || o.filename.endsWith('-ngdpbase-backup.json.gz'))
          && o.filename.endsWith('.json.gz')
        )
        .map(o => ({
          filename: o.filename,
          path: o.path,
          size: o.size,
          created: o.created,
          modified: o.modified
        }));

      // Sort by creation time, newest first
      backups.sort((a: BackupFileInfo, b: BackupFileInfo) => b.created.getTime() - a.created.getTime());

      return backups;
    } catch (error) {
      logger.error('❌ Failed to list backups:', error);
      return [];
    }
  }

  /**
   * Clean up old backups, keeping only maxBackups most recent
   * @private
   */
  private async cleanupOldBackups(): Promise<void> {
    try {
      const backups = await this.listBackups();

      if (backups.length <= this.maxBackups) {
        logger.info(`📊 ${backups.length} backups exist, no cleanup needed`);
        return;
      }

      // Delete oldest backups
      const toDelete = backups.slice(this.maxBackups);
      logger.info(`🗑️  Cleaning up ${toDelete.length} old backups`);

      for (const backup of toDelete) {
        await this.provider?.removeBackup(backup.path);
        logger.info(`🗑️  Deleted: ${backup.filename}`);
      }
    } catch (error) {
      logger.warn('⚠️  Failed to cleanup old backups:', error);
      // Don't throw - cleanup failure shouldn't fail the backup
    }
  }

  /**
   * Get the most recent backup file path
   * @returns {Promise<string | null>} Path to most recent backup, or null if none exist
   */
  async getLatestBackup(): Promise<string | null> {
    const backups = await this.listBackups();
    return backups.length > 0 ? backups[0].path : null;
  }

  /**
   * Return current auto-backup configuration and last backup info for the admin UI.
   */
  async getAutoBackupStatus(): Promise<{ config: AutoBackupConfig; lastBackup: Date | null }> {
    const backups = await this.listBackups();
    return {
      config: {
        enabled: this.autoBackupEnabled,
        time: this.autoBackupTime,
        days: this.autoBackupDays,
        maxBackups: this.maxBackups,
        directory: this.backupDirectory ?? ''
      },
      lastBackup: backups.length > 0 ? backups[0].created : null
    };
  }

  /**
   * Update auto-backup configuration and persist to config store.
   * Restarts the scheduler with the new settings.
   */
  async updateAutoBackupConfig(config: Partial<AutoBackupConfig>): Promise<void> {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) throw new Error('ConfigurationManager not available');

    if (config.enabled !== undefined) {
      await configManager.setProperty('ngdpbase.backup.auto-backup', config.enabled);
      this.autoBackupEnabled = config.enabled;
    }
    if (config.time !== undefined) {
      await configManager.setProperty('ngdpbase.backup.auto-backup-time', config.time);
      this.autoBackupTime = config.time;
    }
    if (config.days !== undefined) {
      await configManager.setProperty('ngdpbase.backup.auto-backup-days', config.days);
      this.autoBackupDays = config.days;
    }
    if (config.maxBackups !== undefined) {
      await configManager.setProperty('ngdpbase.backup.max-backups', config.maxBackups);
      this.maxBackups = config.maxBackups;
    }
    if (config.directory !== undefined) {
      await configManager.setProperty('ngdpbase.backup.directory', config.directory);
      this.backupDirectory = config.directory;
      // #170: re-point the storage provider at the new directory.
      await this.provider?.setBackupDirectory(config.directory);
    }

    // Restart scheduler with updated settings
    this.stopScheduler();
    if (this.autoBackupEnabled) {
      this.startScheduler();
    }

    logger.info(`✅ Auto-backup config updated: ${this.autoBackupEnabled ? `enabled at ${this.autoBackupTime} (${this.autoBackupDays})` : 'disabled'}`);
  }

  /**
   * Start the auto-backup scheduler. Checks every minute whether a backup is due.
   */
  private startScheduler(): void {
    this.stopScheduler();
    logger.info(`🕐 Auto-backup scheduler started — ${this.autoBackupTime} (${this.autoBackupDays})`);

    const timer = setInterval(() => {
      void this.checkAndRunScheduledBackup();
    }, 60_000); // check every minute

    timer.unref(); // don't prevent process exit
    this.schedulerTimer = timer;
  }

  /**
   * Stop the auto-backup scheduler.
   */
  private stopScheduler(): void {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
      logger.info('🛑 Auto-backup scheduler stopped');
    }
  }

  /**
   * Called every minute by the scheduler. Runs a backup if the current
   * time matches the configured schedule (within the same minute).
   */
  private async checkAndRunScheduledBackup(): Promise<void> {
    try {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      if (hhmm !== this.autoBackupTime) return;

      const dayName = DAY_NAMES[now.getDay()];
      const dom = now.getDate();
      const days = this.autoBackupDays.toLowerCase();

      const shouldRun =
        days === 'daily' ||
        (days === 'monthly' && dom === 1) ||
        days.split(',').map(d => d.trim().toLowerCase()).includes(dayName.toLowerCase());

      if (!shouldRun) return;

      logger.info(`⏰ Scheduled auto-backup triggered at ${hhmm} (${dayName})`);
      await this.createBackup();
    } catch (err) {
      logger.error('❌ Scheduled auto-backup failed:', err);
    }
  }
}

export default BackupManager;

