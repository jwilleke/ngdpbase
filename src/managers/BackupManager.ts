import path from 'path';
import type { Readable } from 'stream';
import { create as createTar } from 'tar';
import BaseManager, { BackupData as BaseBackupData } from './BaseManager.js';
import type DatabaseManager from './DatabaseManager.js';
import { actorOf, type ActorContext } from '../context/ActorContext.js';
import zlib from 'zlib';
import { promisify } from 'util';
import logger from '../utils/logger.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';
import type BackgroundJobManager from './BackgroundJobManager.js';
import type { JobDefinition } from './BackgroundJobManager.js';
import type { ScheduleInput } from '../utils/schedule.js';
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
  /**
   * Leave retention for the next backup (#1723). The backup a restore takes
   * of the live data first sets it, so that backup can never prune the very
   * backup being restored.
   */
  skipCleanup?: boolean;
  /** Throw when any part of the backup failed, after saying so (#1723): a restore stages nothing without a whole copy of the live data. */
  requireComplete?: boolean;
}

/**
 * Restore options
 */
export interface RestoreOptions {
  skipValidation?: boolean;
  managerFilter?: string[];
  /** Replace a database restore staged earlier and not applied yet (#1723, D5); refused without it. */
  replaceStaged?: boolean;
}

/** A backup in the backup directory, as Admin → Backup lists it for download and restore (#1723). */
export interface StoredBackup extends BackupFileInfo {
  /** The database files beside the document, by name (`application`, `addon-<owner>`). */
  databases: string[];
  /** The document and its database files together, in bytes. */
  totalSize: number;
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
 * const backupPath = await backupManager.createBackup(wikiContext.userContext);
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

/**
 * A backup document's filename without `.json.gz` / `.json` (#1723). A
 * manager's own files beside the document are named `<stem>.<something>.db`,
 * and are pruned with it.
 */
export function backupStem(filename: string): string {
  return filename.replace(/\.json(\.gz)?$/, '');
}

/** Whether `filename` is one of the files a manager wrote beside the document named `documentFilename` (#1723). */
export function isCompanionOf(filename: string, documentFilename: string): boolean {
  return filename.startsWith(`${backupStem(documentFilename)}.`) && filename.endsWith('.db');
}

/** The scheduled job automatic backups run as (#1720). */
export const AUTO_BACKUP_JOB_ID = 'backup.auto';

const BYDAY: Record<string, string> = { sun: 'SU', mon: 'MO', tue: 'TU', wed: 'WE', thu: 'TH', fri: 'FR', sat: 'SA' };

/**
 * The automatic-backup settings as a schedule (#1720): `ngdpbase.backup.auto-backup-time`
 * (HH:MM) and `ngdpbase.backup.auto-backup-days` — `daily`, `monthly` (the 1st),
 * `weekdays` (Monday to Friday), or day names such as `Mon,Wed,Fri`.
 *
 * In `timeZone`: the server's own, because the timer this replaces compared
 * the server's local clock, so an existing setting keeps its time.
 *
 * Throws, naming the setting, for a time or a day it does not understand. The
 * timer this replaces matched neither, so such a setting never backed up, and
 * said nothing.
 */
export function autoBackupSchedule(time: string, days: string, timeZone: string): ScheduleInput {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(time).trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) {
    throw new Error(`ngdpbase.backup.auto-backup-time '${time}' is not a time of day (HH:MM)`);
  }
  const at = `BYHOUR=${Number(m[1])};BYMINUTE=${Number(m[2])}`;
  const value = String(days).trim().toLowerCase();
  if (value === 'daily') return { rrule: `FREQ=DAILY;${at}`, tz: timeZone };
  if (value === 'monthly') return { rrule: `FREQ=MONTHLY;BYMONTHDAY=1;${at}`, tz: timeZone };
  if (value === 'weekdays') return { rrule: `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;${at}`, tz: timeZone };
  const names = value.split(',').map((d) => d.trim()).filter(Boolean);
  const unknown = names.filter((d) => !(d.slice(0, 3) in BYDAY) || !'sunday monday tuesday wednesday thursday friday saturday'.split(' ').some((full) => full.startsWith(d)));
  if (names.length === 0 || unknown.length > 0) {
    throw new Error(`ngdpbase.backup.auto-backup-days '${days}' is not daily, monthly, weekdays or a list of day names (${unknown.join(', ') || 'empty'} not understood)`);
  }
  const byDay = [...new Set(names.map((d) => BYDAY[d.slice(0, 3)]))];
  return { rrule: `FREQ=WEEKLY;BYDAY=${byDay.join(',')};${at}`, tz: timeZone };
}

/** The server's own time zone: what the replaced timer's `getHours()` read. */
function serverTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

class BackupManager extends BaseManager {
  private backupDirectory: string | null;
  private maxBackups: number;
  private autoBackupEnabled: boolean;
  private autoBackupTime: string;   // HH:MM
  private autoBackupDays: string;   // "daily" | "monthly" | "Mon,Wed,..."
  // #170: storage target is delegated to a BackupProvider (default
  // FileBackupProvider). Orchestration/serialization stays in this manager.
  private provider: BaseBackupProvider | null;
  private providerClass: string;
  /** A restore started from Admin → Backup, while it runs (#1723). */
  private restoreRunning: Promise<RestoreResults | null> | null = null;

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

    // #1720: automatic backups are a scheduled job.
    this.scheduleAutoBackup();

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
   * @param ctx - Who asked (#1179): the request's subject, or the schedule's JobContext. First and mandatory — a full copy of the instance is made on someone's behalf.
   * @returns {Promise<string>} Path to created backup file
   */
  async createBackup(ctx: ActorContext, options: BackupOptions = {}): Promise<string> {
    const startTime = Date.now();
    logger.info('🔄 Starting backup operation...');
    let pending: { filename: string; existing: Set<string> } | null = null;

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

      // #1723: a manager may write its own files (the databases) beside the
      // document; they share its stem and are pruned with it.
      const managerOptions = { ctx, directory: this.backupDirectory, stem: backupStem(filename) };
      const failures: string[] = [];
      pending = { filename, existing: new Set(await this.companionsOf(filename)) };

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
          const managerBackup = await manager.backup(managerOptions);

          backupData.managers[managerName] = managerBackup;
          for (const warning of managerBackup?.warnings ?? []) failures.push(`${managerName}: ${warning}`);
          logger.info(`✅ ${managerName} backed up${managerBackup?.warnings?.length ? ' in part' : ' successfully'}`);
        } catch (error) {
          logger.error(`❌ Failed to backup ${managerName}:`, error);
          failures.push(`${managerName}: ${(error as Error).message}`);
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
      pending = null;

      const duration = Date.now() - startTime;
      logger.info(`✅ Backup completed successfully in ${duration}ms`);
      logger.info(`📁 Backup saved to: ${backupPath}`);

      // #1215: a full copy of the instance now exists somewhere; say who asked
      // and where it went. on-failure: continue — the backup is already written and a
      // slow sink must not fail it.
      const who = actorOf(ctx);
      await recordAuditEvent(this.engine.getManager('AuditManager'), {
        eventType: AUDIT_EVENT.BACKUP_CREATE,
        ...who,
        action: 'backup-create',
        result: 'success',
        severity: 'medium',
        resource: backupPath,
        resourceType: 'backup',
        metadata: { ...who.metadata, filename, bytes: finalData.length, managers: managerNames.length }
      }, (err) => logger.warn('[BackupManager] Audit record failed for backup-create:', err));

      // #1723, #1563: a backup with a part missing is said, not just logged.
      if (failures.length > 0) {
        const message = `Backup ${filename} was written, but without: ${failures.join('; ')}`;
        logger.error(`❌ ${message}`);
        await this.notifyAdmins('error', 'A backup is incomplete', message);
        if (options.requireComplete) throw new Error(message);
      }

      // Clean up old backups
      if (!options.skipCleanup) await this.cleanupOldBackups();

      return backupPath;
    } catch (error) {
      logger.error('❌ Backup operation failed:', error);
      // #1723: files the managers wrote for a document that was never written are removed.
      if (pending) await this.removeCompanions(pending.filename, pending.existing);
      throw error;
    }
  }

  /** The files the managers wrote beside one backup document (#1723). */
  private async companionsOf(documentFilename: string): Promise<string[]> {
    return (await this.provider?.listBackupObjects() ?? []).filter((o) => isCompanionOf(o.filename, documentFilename)).map((o) => o.filename);
  }

  /** Remove the files the managers wrote beside one backup document (#1723), except those in `keep`. */
  private async removeCompanions(documentFilename: string, keep: Set<string> = new Set()): Promise<void> {
    if (!this.provider) return;
    try {
      for (const filename of await this.companionsOf(documentFilename)) {
        if (!keep.has(filename)) await this.provider.removeBackup(filename);
      }
    } catch (err) {
      logger.warn(`⚠️  Failed to remove the files beside ${documentFilename}:`, err);
    }
  }

  private async notifyAdmins(level: 'error' | 'warning', title: string, message: string): Promise<void> {
    try {
      await this.engine.getManager<{ addNotification(n: object): Promise<string> }>('NotificationManager')
        ?.addNotification({ type: 'system', level, title, message });
    } catch (err) {
      logger.error(`❌ The notification '${title}' could not be sent:`, err);
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
   * The databases (#1723) go first, and are staged for the next start rather
   * than restored in place: a fresh backup of the live data is taken, then
   * DatabaseManager stages every database in the backup. If either fails,
   * nothing at all is restored.
   *
   * @param ctx - Who asked (#1179): a restore takes a backup and replaces the instance's data on someone's behalf.
   * @param {string} backupPath - Path to backup file
   * @param {RestoreOptions} options - Restore options
   * @param {boolean} options.skipValidation - Skip validation (default: false)
   * @param {string[]} options.managerFilter - Only restore specific managers
   * @returns {Promise<RestoreResults>} Restore results
   */
  async restoreFromFile(ctx: ActorContext, backupPath: string, options: RestoreOptions = {}): Promise<RestoreResults> {
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

      // Where the document is, so a manager finds the files it wrote beside it (#1723).
      const directory = path.dirname(path.isAbsolute(backupPath) ? backupPath : path.join(this.backupDirectory ?? '', backupPath));

      // #1723: the databases first, all or nothing — if they cannot be staged,
      // nothing else is restored either. A fresh backup of the live data is
      // taken before anything is touched.
      const databases = backupData.managers.DatabaseManager as BaseBackupData | undefined;
      const databaseList = (databases?.data as { databases?: unknown } | null | undefined)?.databases;
      const hasDatabases = Array.isArray(databaseList) && databaseList.length > 0;
      if (hasDatabases && (!options.managerFilter || options.managerFilter.includes('DatabaseManager'))) {
        const databaseManager = this.engine.getManager<DatabaseManager>('DatabaseManager');
        if (!databaseManager) throw new Error('The backup holds databases, but DatabaseManager is not available; nothing was restored');
        // D5: never replaced silently — refused before the fresh backup is taken.
        const staged = databaseManager.getStagedRestore?.();
        if (staged && !options.replaceStaged) {
          throw new Error(`A restore from ${staged.source || staged.backup} is already staged; cancel it or replace it. Nothing was restored`);
        }
        logger.info('📦 Taking a backup of the live data before staging the databases...');
        const before = await this.createBackup(ctx, { skipCleanup: true, requireComplete: true });
        logger.info(`✅ Live data backed up to ${before}`);
        await databaseManager.restore(databases!, { ctx, directory, source: path.basename(backupPath), replaceStaged: options.replaceStaged, safetyBackup: path.basename(before) });
        results.success.push('DatabaseManager');
      }

      // Restore each manager
      for (const managerName of managerNames) {
        if (managerName === 'DatabaseManager' && hasDatabases) {
          if (options.managerFilter && !options.managerFilter.includes(managerName)) results.skipped.push(managerName);
          continue;
        }
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
          await manager.restore(managerBackupData as BaseBackupData, { ctx, directory });

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
   * The backups in the backup directory with the database files beside each
   * (#1723): what Admin → Backup offers to download and restore. Read from
   * the file names, so no document is opened to list them.
   */
  async listStoredBackups(): Promise<StoredBackup[]> {
    const backups = await this.listBackups();
    if (!this.provider || backups.length === 0) return [];
    const objects = await this.provider.listBackupObjects();
    return backups.map((b) => {
      const companions = objects.filter((o) => isCompanionOf(o.filename, b.filename));
      const stem = backupStem(b.filename);
      return {
        ...b,
        databases: companions.map((o) => o.filename.slice(stem.length + 1, -'.db'.length)).sort(),
        totalSize: b.size + companions.reduce((n, o) => n + o.size, 0)
      };
    });
  }

  /** A backup in the backup directory by its bare filename, or null: never a path the caller made up. */
  async findStoredBackup(filename: string): Promise<StoredBackup | null> {
    return (await this.listStoredBackups()).find((b) => b.filename === filename) ?? null;
  }

  /**
   * One backup as a `.tar` stream (#1723, D2): the document and every database
   * file beside it, read from disk as the stream is consumed, never built in
   * memory. The database files are already encrypted under the backup key,
   * which is never in the archive.
   */
  async backupArchive(filename: string): Promise<{ name: string; stream: Readable }> {
    const backup = await this.findStoredBackup(filename);
    if (!backup || !this.backupDirectory) throw new Error(`No backup named ${filename} in the backup directory`);
    const stem = backupStem(backup.filename);
    const files = [backup.filename, ...backup.databases.map((d) => `${stem}.${d}.db`)];
    const stream = createTar({ cwd: this.backupDirectory, portable: true, noDirRecurse: true }, files) as unknown as Readable;
    return { name: `${stem}.tar`, stream };
  }

  /** Whether a restore started from Admin → Backup is still taking its fresh backup or staging. */
  isRestoreRunning(): boolean {
    return this.restoreRunning !== null;
  }

  /**
   * Start a restore of a stored backup's databases (#1723, D1): recorded,
   * then a fresh backup of the live data and the staging run in the
   * background, and admins are told when it is staged or why it was not. The
   * databases only: nothing else in the backup is restored, and nothing
   * changes until the next restart. Refused while another is running, and
   * when a restore is already staged unless `replace` says to replace it.
   *
   * @returns the running restore, for a caller (a test) that waits on it.
   */
  async startRestore(ctx: ActorContext, filename: string, options: { replace?: boolean } = {}): Promise<{ done: Promise<RestoreResults | null> }> {
    if (this.restoreRunning) throw new Error('A restore is already being prepared; wait for it to finish');
    const backup = await this.findStoredBackup(filename);
    if (!backup) throw new Error(`No backup named ${filename} in the backup directory`);
    if (backup.databases.length === 0) throw new Error(`Backup ${filename} holds no database to restore`);
    const databaseManager = this.engine.getManager<DatabaseManager>('DatabaseManager');
    if (!databaseManager) throw new Error('DatabaseManager is not available');
    const staged = databaseManager.getStagedRestore();
    if (staged && !options.replace) throw new Error(`A restore from ${staged.source || staged.backup} is already staged; cancel it or replace it`);
    if (!staged && options.replace) throw new Error('There is no staged restore to replace');

    // Recorded before anything happens (refuse): a restore that cannot be recorded does not start.
    const who = actorOf(ctx);
    await recordAuditEvent(this.engine.getManager('AuditManager'), {
      eventType: staged ? AUDIT_EVENT.BACKUP_RESTORE_REPLACE : AUDIT_EVENT.BACKUP_RESTORE,
      ...who,
      action: staged ? 'backup-restore-replace' : 'backup-restore',
      result: 'success',
      severity: 'high',
      resource: backup.filename,
      resourceType: 'backup',
      metadata: { ...who.metadata, databases: backup.databases, ...(staged ? { replaces: staged.source || staged.backup, replacesStagedBy: staged.stagedBy } : {}) }
    });

    const done = this.restoreFromFile(ctx, backup.path, { managerFilter: ['DatabaseManager'], replaceStaged: Boolean(staged) })
      .catch(async (err: Error) => {
        logger.error(`❌ Restore of ${filename} was not staged:`, err);
        await this.notifyAdmins('error', `Restore of ${filename} was not staged`, `${err.message}. The current databases stay as they are.`);
        return null;
      })
      .finally(() => { this.restoreRunning = null; });
    this.restoreRunning = done;
    return { done };
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
        await this.removeCompanions(backup.filename);
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
  async updateAutoBackupConfig(config: Partial<AutoBackupConfig>, ctx: ActorContext): Promise<void> {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) throw new Error('ConfigurationManager not available');

    if (config.enabled !== undefined) {
      await configManager.setProperty('ngdpbase.backup.auto-backup', config.enabled, ctx);
      this.autoBackupEnabled = config.enabled;
    }
    if (config.time !== undefined) {
      await configManager.setProperty('ngdpbase.backup.auto-backup-time', config.time, ctx);
      this.autoBackupTime = config.time;
    }
    if (config.days !== undefined) {
      await configManager.setProperty('ngdpbase.backup.auto-backup-days', config.days, ctx);
      this.autoBackupDays = config.days;
    }
    if (config.maxBackups !== undefined) {
      await configManager.setProperty('ngdpbase.backup.max-backups', config.maxBackups, ctx);
      this.maxBackups = config.maxBackups;
    }
    if (config.directory !== undefined) {
      await configManager.setProperty('ngdpbase.backup.directory', config.directory, ctx);
      this.backupDirectory = config.directory;
      // #170: re-point the storage provider at the new directory.
      await this.provider?.setBackupDirectory(config.directory);
    }

    // The job takes the new settings; a changed rule counts its slots from now (#1720).
    this.scheduleAutoBackup();

    logger.info(`✅ Auto-backup config updated: ${this.autoBackupEnabled ? `enabled at ${this.autoBackupTime} (${this.autoBackupDays})` : 'disabled'}`);
  }

  /**
   * Automatic backups as a scheduled job (#1720, epic #1611).
   *
   * They ran from a timer that checked every minute for an exact match of the
   * clock, so a server that was down at the backup time — or a tick that
   * landed a minute late — skipped that backup and left no record that it had
   * (operator: backups are never silent, #1563). As a scheduled job a backup
   * missed while the server was down runs once when it is back (`catchUp:
   * 'latest'`), a failed one is tried again and then reported, and the run
   * survives a restart. A backup still running when the next one comes due is
   * not doubled (`overlap: 'skip'`).
   *
   * Called at start and whenever the settings change. With automatic backups
   * off, or a setting that cannot be read, the job is registered without a
   * schedule: it can still be run by hand, and nothing runs by itself.
   */
  private scheduleAutoBackup(): void {
    const jobs = this.engine.getManager<BackgroundJobManager>('BackgroundJobManager');
    if (!jobs) {
      if (this.autoBackupEnabled) logger.error('❌ Automatic backups are ON but BackgroundJobManager is not available — NO automatic backup will run');
      return;
    }
    const def: JobDefinition = {
      id: AUTO_BACKUP_JOB_ID,
      displayName: 'Automatic backup',
      run: async (_progress, ctx) => {
        // #1196: the run's context names the system principal on a schedule, or the admin who ran it.
        const file = await this.createBackup(ctx);
        return { success: true, summary: `Backup written: ${file}` };
      }
    };
    if (!this.autoBackupEnabled || !this.provider) {
      jobs.registerJob(def);
      return;
    }
    try {
      jobs.registerJob({
        ...def,
        schedule: autoBackupSchedule(this.autoBackupTime, this.autoBackupDays, serverTimeZone()),
        catchUp: 'latest',
        overlap: 'skip',
        persist: true
      });
      logger.info(`🕐 Automatic backup scheduled: ${this.autoBackupTime} (${this.autoBackupDays}), ${serverTimeZone()}`);
    } catch (err) {
      jobs.registerJob(def);
      logger.error(`❌ Automatic backups are ON but NOT scheduled: ${(err as Error).message}. Fix the setting in Admin → Backup.`);
      void this.engine.getManager<{ addNotification(n: object): Promise<string> }>('NotificationManager')?.addNotification({
        type: 'system', level: 'error', title: 'Automatic backups are not running',
        message: `${(err as Error).message}. Fix the setting in Admin → Backup.`
      }).catch(() => undefined);
    }
  }
}

export default BackupManager;

