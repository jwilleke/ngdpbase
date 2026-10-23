import BaseAuditProvider, {
  AuditFilters, AuditSearchResults, AuditStats, AuditBackupData, AUDIT_RETENTION_INTERVAL_MS,
  recordIsAbout, toStoredAuditRecord, type PersonEntriesOptions, type StoredAuditRecord
} from './BaseAuditProvider.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from '../managers/ConfigurationManager.js';
import path from 'path';
import fs from 'fs-extra';
import fsp from 'fs/promises';
import logger from '../utils/logger.js';
import type BackgroundJobManager from '../managers/BackgroundJobManager.js';
import { AuditEvent } from '../types/index.js';
import type { ProviderDurability } from './BaseProvider.js';
import type { AuditReport } from './BaseAuditProvider.js';
import { refusesOnFailure, refuseOnFailureEventTypes } from '../utils/auditRegistry.js';
import { attributedTo, scheduleContext, systemContext } from '../context/bootActions.js';
import type { JobContext } from '../context/JobContext.js';
import { AUDIT_EVENT } from '../utils/auditEventNames.js';
import type { BackupPartRecord, ManagerBackupOptions, ManagerRestoreOptions, SiteRestoreStaging } from '../managers/BaseManager.js';
import { extractTreeArchive, listTreeArchive, writeTreeArchive } from '../utils/treeArchive.js';

/** The stored record shape, shared with every storing provider (#1537). */
type ExtendedAuditEvent = StoredAuditRecord;

/**
 * Configuration for FileAuditProvider
 */
interface FileAuditConfig {
  logLevel: string;
  maxQueueSize: number;
  flushInterval: number;
  retentionDays: number;
  logDirectory: string;
  auditFileName: string;
  archiveFileName: string;
  maxFileSize: string;
  maxFiles: number;
}

/**
 * FileAuditProvider - File-based audit log storage
 *
 * Stores audit logs in local filesystem files with JSON line format.
 * Suitable for single-instance deployments and development.
 *
 * Configuration keys (all lowercase):
 * - ngdpbase.audit.provider.file.logdirectory - Directory for audit log files
 * - ngdpbase.audit.provider.file.auditfilename - Main audit log filename
 * - ngdpbase.audit.provider.file.archivefilename - Archive log filename
 * - ngdpbase.audit.provider.file.maxfilesize - Maximum file size
 * - ngdpbase.audit.provider.file.maxfiles - Maximum number of archived files
 */
const RETENTION_INTERVAL_MS = AUDIT_RETENTION_INTERVAL_MS;

class FileAuditProvider extends BaseAuditProvider {
  /** #1122: how often retention runs after boot. Hourly is far finer than a day-scale window. */

  private auditLogs: ExtendedAuditEvent[];
  private auditQueue: ExtendedAuditEvent[];

  /**
   * Serializes flush batches (#1158). Every `flush()` chains onto this, so a
   * caller awaiting durability waits for its own batch rather than being told
   * "someone else is flushing" and resolving with its record still in memory.
   */
  private flushChain: Promise<void> = Promise.resolve();
  private flushTimer: NodeJS.Timeout | null;
  private config: FileAuditConfig | null;

  constructor(engine: WikiEngine) {
    super(engine);
    this.auditLogs = [];
    this.auditQueue = [];
    this.flushTimer = null;
    this.config = null;
  }

  /**
   * Initialize the file audit provider
   * @returns {Promise<void>}
   */
  async initialize(): Promise<void> {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) {
      throw new Error('FileAuditProvider requires ConfigurationManager');
    }

    // Load shared audit settings (ALL LOWERCASE)
    const logLevel = configManager.getProperty('ngdpbase.audit.loglevel', 'info') as string;
    const maxQueueSize = configManager.getProperty('ngdpbase.audit.maxqueuesize', 1000) as number;
    const flushInterval = configManager.getProperty('ngdpbase.audit.flushinterval', 30000) as number;
    const retentionDays = configManager.getProperty('ngdpbase.audit.retentiondays', 90) as number;

    // Load provider-specific settings (ALL LOWERCASE)
    // logDirectory uses getResolvedDataPath to support INSTANCE_DATA_FOLDER
    const logDirectory = configManager.getResolvedDataPath(
      'ngdpbase.audit.provider.file.logdirectory',
      './data/logs'
    );
    const auditFileName = configManager.getProperty(
      'ngdpbase.audit.provider.file.auditfilename',
      'audit.log'
    ) as string;
    const archiveFileName = configManager.getProperty(
      'ngdpbase.audit.provider.file.archivefilename',
      'audit-archive.log'
    ) as string;
    const maxFileSize = configManager.getProperty(
      'ngdpbase.audit.provider.file.maxfilesize',
      '10MB'
    ) as string;
    const maxFiles = configManager.getProperty(
      'ngdpbase.audit.provider.file.maxfiles',
      10
    ) as number;

    // logDirectory is already resolved by getResolvedDataPath
    this.config = {
      logLevel,
      maxQueueSize,
      flushInterval,
      retentionDays,
      logDirectory,
      auditFileName,
      archiveFileName,
      maxFileSize,
      maxFiles
    };

    // Ensure log directory exists
    await fs.ensureDir(this.config.logDirectory);

    // #1876: a staged site restore puts the backed-up audit files in place
    // before the chain head is read from them.
    await this.applyRestoreAtStart();

    // Set up periodic flush
    this.flushTimer = setInterval(() => {
      // #1158: flush now rejects on a failed write so a critical caller learns
      // about it. The timer is the fire-and-forget path and must not turn that
      // into an unhandled rejection — doFlush has already logged and re-queued.
      void this.flush().catch(() => { /* logged and re-queued in doFlush */ });
    }, this.config.flushInterval);

    // Load existing audit logs
    await this.loadExistingLogs();

    // Clean up old logs
    await this.cleanup(systemContext(this.engine, 'audit-archive retention at boot: archives past the retention window'));

    // #1122: and keep doing it. Running retention once at boot meant a
    // long-lived instance applied its own policy exactly once — the same
    // defect #1110 fixed for the token store's purgeExpired.
    // #1721: as a maintenance job on the scheduler, listed on Admin → Scheduled Jobs.
    this.engine?.getManager?.<BackgroundJobManager>('BackgroundJobManager')?.registerMaintenance({
      id: 'audit.archive-retention',
      displayName: 'Audit: remove archives past retention',
      everyMs: RETENTION_INTERVAL_MS,
      run: async (ctx) => { await this.cleanup(ctx); }
    });

    this.initialized = true;

    logger.info(`[FileAuditProvider] Initialized - directory: ${this.config.logDirectory}`);
    logger.info(`[FileAuditProvider] Retention: ${this.config.retentionDays} days, Max files: ${this.config.maxFiles}`);
  }

  /**
   * Get provider information
   * @returns {Object} Provider metadata
   */
  getProviderInfo(): { name: string; version: string; description: string; features: string[] } {
    return {
      name: 'FileAuditProvider',
      version: '1.0.0',
      description: 'File-based audit log storage',
      features: ['search', 'export', 'retention', 'archiving', 'local-storage']
    };
  }

  /** Parse "10MB" / "512KB" / "400" into bytes (#1122). */
  private maxFileSizeBytes(): number {
    const raw = String(this.config?.maxFileSize ?? '10MB').trim();
    const m = /^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)?$/i.exec(raw);
    if (!m) return 10 * 1024 * 1024;
    const n = parseFloat(m[1]);
    const unit = (m[2] ?? 'B').toUpperCase();
    const factor = unit === 'GB' ? 1024 ** 3 : unit === 'MB' ? 1024 ** 2 : unit === 'KB' ? 1024 : 1;
    return Math.floor(n * factor);
  }

  /** Archive files, oldest first. Names are ISO-derived so lexical order is chronological. */
  private async listArchives(): Promise<string[]> {
    if (!this.config) return [];
    const prefix = `${this.config.archiveFileName}.`;
    const entries = await fs.readdir(this.config.logDirectory).catch(() => [] as string[]);
    return entries.filter((f) => f.startsWith(prefix)).sort();
  }

  /**
   * Rotate the live log once it passes maxFileSize, then prune to maxFiles (#1122).
   *
   * The chain spans files by construction: rotation only MOVES bytes, and the
   * in-memory chain head is untouched, so the next record links to the last one
   * in the archive. A verifier reads archives then the live log, in order.
   *
   * Pruning removes the OLDEST archives, which drops a prefix of the chain.
   * That is a deliberate trade — bounded disk against verifiability of the
   * distant past — and it is why a verifier reports a non-genesis start rather
   * than silently accepting it.
   */
  private async rotateIfNeeded(): Promise<void> {
    if (!this.config) return;
    const auditLogPath = path.join(this.config.logDirectory, this.config.auditFileName);

    try {
      const stats = await fs.stat(auditLogPath).catch(() => null);
      if (!stats || stats.size < this.maxFileSizeBytes()) return;

      // Colons are stripped so the name is safe on every filesystem, and the
      // ISO prefix keeps lexical order chronological.
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const target = path.join(this.config.logDirectory, `${this.config.archiveFileName}.${stamp}`);
      await fs.move(auditLogPath, target, { overwrite: false });
      logger.info(`[FileAuditProvider] Rotated audit log to ${path.basename(target)}`);

      const archives = await this.listArchives();
      const excess = archives.length - this.config.maxFiles;
      for (let i = 0; i < excess; i++) {
        await fs.remove(path.join(this.config.logDirectory, archives[i]));
        logger.warn(
          `[FileAuditProvider] Removed audit archive ${archives[i]} — over the ${this.config.maxFiles}-file limit. ` +
          'Those records are gone; the chain no longer verifies from genesis.'
        );
      }
    } catch (error) {
      // A failed rotation must not lose the write it was making room for.
      logger.error('[FileAuditProvider] Log rotation failed:', error);
    }
  }

  /**
   * Resume the chain from the last record on disk (#1119).
   *
   * Without this the sequence restarts at 1 on every boot, which reads as a
   * chain break at each restart and makes the whole mechanism useless — a
   * verifier could not tell a restart from a deletion.
   *
   * Reads the tail of the log rather than parsing all of it: on a large file
   * only the final record matters, and this runs once per process.
   */
  protected override async loadChainHead(): Promise<{ seq: number; hash: string } | null> {
    if (!this.config) return null;
    const auditLogPath = path.join(this.config.logDirectory, this.config.auditFileName);
    try {
      // #1122: straight after a rotation the live log is empty, so fall back
      // to the newest archive — otherwise every rotation would restart the
      // sequence and read as a chain break.
      const candidates = [auditLogPath];
      for (const archive of (await this.listArchives()).reverse()) {
        candidates.push(path.join(this.config.logDirectory, archive));
      }

      let contents = '';
      for (const candidate of candidates) {
        if (!(await fs.pathExists(candidate))) continue;
        const text = await fs.readFile(candidate, 'utf8');
        if (text.trim()) { contents = text; break; }
      }
      if (!contents) return null;
      const lines = contents.split('\n').filter((l) => l.trim());
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const parsed = JSON.parse(lines[i]) as { seq?: number; hash?: string };
          if (typeof parsed.seq === 'number' && typeof parsed.hash === 'string') {
            return { seq: parsed.seq, hash: parsed.hash };
          }
          // A record with no seq predates chaining. Everything before it is
          // unchained too, so start a fresh chain rather than pretending.
          return null;
        } catch {
          // A truncated final line — a kill mid-write. Step back one record
          // rather than abandoning the chain over a partial write.
          continue;
        }
      }
      return null;
    } catch (error) {
      logger.warn('[FileAuditProvider] Could not resume the audit chain, starting a new one:', error);
      return null;
    }
  }

  /**
   * Normalise an incoming event into the stored record shape (#1119).
   *
   * Split out of `logAuditEvent` so it runs BEFORE the base stamps the chain:
   * the id and timestamp assigned here are part of what gets hashed, and
   * assigning them afterwards would mean the hash covered a record different
   * from the one written.
   */
  protected override prepareRecord(auditEvent: Record<string, unknown>): Record<string, unknown> {
    return toStoredAuditRecord(auditEvent) as unknown as Record<string, unknown>;
  }

  /**
   * Queue an already-stamped record for the next flush (#1119), or write it
   * through to the device now if its on-failure rule demands that (#1158).
   *
   * The base has applied seq, prevHash and hash by this point; this only
   * decides when the bytes reach disk.
   *
   * __An on-failure: refuse event is written and fsynced before this resolves.__ The
   * registry defines `critical` as *"the action must not complete unless the
   * record does"*, and a 30-second timer flushing into the page cache does not
   * deliver that: `page-delete`, `token-mint`, `token-revoke`, the lifecycle
   * events and `posture-recorded` could all be lost by an unclean exit while
   * the action they describe had already happened. A credential that exists
   * with nothing saying so is the case the rule was written for.
   *
   * __It goes through the queue rather than around it__, even though the issue
   * described bypassing. The records are hash-chained, so the file must hold
   * them in sequence order; a critical record written directly while earlier
   * standard records were still queued would land out of order and break
   * verification at that point. Flushing the queue *including* this record
   * keeps the chain intact and still returns only once the bytes are down.
   *
   * `standard` and `volume` are deliberately untouched — making every event
   * synchronous would charge `page-read` at volume for a guarantee the #1109
   * decision says it does not need.
   */
  async writeEvent(record: Record<string, unknown>): Promise<string> {
    const event = record as unknown as ExtendedAuditEvent;

    // Add to in-memory queue
    this.auditQueue.push(event);

    if (refusesOnFailure(String(event.eventType ?? ''))) {
      await this.flush({ fsync: true });
    } else if (this.config && this.auditQueue.length >= this.config.maxQueueSize) {
      // Flush if queue is getting large
      await this.flush();
    }

    // Log critical events immediately
    if (event.severity === 'critical' || event.level === 'error') {
      logger.error(`[FileAuditProvider] CRITICAL: ${event.eventType} - ${event.result}`, {
        user: event.user,
        resource: event.resource,
        reason: event.reason
      });
    }

    return event.id;
  }

  /**
   * Search audit logs
   * @param {AuditFilters} filters - Search filters
   * @param {Record<string, unknown>} options - Search options
   * @returns {Promise<AuditSearchResults>} Search results
   */
  searchAuditLogs(filters: AuditFilters = {}, options: Record<string, unknown> = {}): Promise<AuditSearchResults> {
    const {
      user,
      actor,
      eventType,
      result,
      severity,
      startDate,
      endDate,
      resource,
      action,
      limit = 100,
      offset = 0,
      sortBy = 'timestamp',
      sortOrder = 'desc'
    } = { ...filters, ...options } as AuditFilters & {
      limit?: number;
      offset?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    };

    let filteredLogs = [...this.auditLogs];

    // Apply filters
    if (user) {
      filteredLogs = filteredLogs.filter(log => log.user === user);
    }
    if (actor) {
      filteredLogs = filteredLogs.filter(log => log.actor === actor);
    }
    if (eventType) {
      filteredLogs = filteredLogs.filter(log => log.eventType === eventType);
    }
    if (result) {
      filteredLogs = filteredLogs.filter(log => log.result === result);
    }
    if (severity) {
      filteredLogs = filteredLogs.filter(log => log.severity === severity);
    }
    if (resource) {
      filteredLogs = filteredLogs.filter(log => log.resource === resource);
    }
    if (action) {
      filteredLogs = filteredLogs.filter(log => log.action === action);
    }
    if (startDate) {
      filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) >= new Date(startDate));
    }
    if (endDate) {
      filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) <= new Date(endDate));
    }

    // Sort by sortBy field
    filteredLogs.sort((a, b) => {
      const aRec = a as unknown as Record<string, unknown>;
      const bRec = b as unknown as Record<string, unknown>;
      const aVal = aRec[sortBy];
      const bVal = bRec[sortBy];
      const order = sortOrder === 'desc' ? -1 : 1;

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return aVal.localeCompare(bVal) * order;
      }
      return (Number(aVal) - Number(bVal)) * order;
    });

    // Paginate
    const total = filteredLogs.length;
    const paginatedResults = filteredLogs.slice(offset, offset + limit);

    return Promise.resolve({
      results: paginatedResults as unknown as AuditEvent[],
      total,
      limit,
      offset,
      hasMore: offset + limit < total
    });
  }

  /**
   * Get audit statistics
   * @param {AuditFilters} filters - Optional filters
   * @returns {Promise<AuditStats>} Audit statistics
   */
  async getAuditStats(filters: AuditFilters = {}): Promise<AuditStats> {
    const logs = await this.searchAuditLogs(filters, { limit: 10000 });

    const stats: AuditStats = {
      totalEvents: logs.total,
      eventsByType: {},
      eventsByResult: {},
      eventsBySeverity: {},
      eventsByUser: {},
      recentActivity: [],
      securityIncidents: 0
    };

    logs.results.forEach((logEntry) => {
      // Cast to record for flexible property access
      const log = logEntry as unknown as Record<string, unknown>;

      // Count by type
      const eventType = (log.eventType as string) || (log.type as string);
      if (eventType && stats.eventsByType) {
        stats.eventsByType[eventType] = (stats.eventsByType[eventType] || 0) + 1;
      }

      // Count by result
      const resultValue = log.result as string | undefined;
      if (resultValue && stats.eventsByResult) {
        stats.eventsByResult[resultValue] = (stats.eventsByResult[resultValue] || 0) + 1;
      }

      // Count by severity
      const severity = (log.severity as string) || 'low';
      if (stats.eventsBySeverity) {
        stats.eventsBySeverity[severity] = (stats.eventsBySeverity[severity] || 0) + 1;
      }

      // Count by user
      const user = (log.user as string) || (log.actor as string);
      if (user && stats.eventsByUser) {
        stats.eventsByUser[user] = (stats.eventsByUser[user] || 0) + 1;
      }

      // Track security incidents
      if (severity === 'high' || severity === 'critical') {
        stats.securityIncidents = (stats.securityIncidents || 0) + 1;
      }
    });

    // Get recent activity (last 10 events)
    stats.recentActivity = logs.results.slice(0, 10);

    return stats;
  }

  /**
   * Export audit logs
   * @param {AuditFilters} filters - Export filters
   * @param {string} format - Export format ('json', 'csv')
   * @returns {Promise<string>} Exported data
   */
  async exportAuditLogs(filters: AuditFilters = {}, format: 'json' | 'csv' = 'json'): Promise<string> {
    const logs = await this.searchAuditLogs(filters, { limit: 10000 });
    return this.formatExport(logs.results, format);
  }

  /**
   * The entries about one person (#1537), from the records held in memory —
   * the same window `searchAuditLogs` reads. Newest first, a page at a time.
   */
  override searchEntriesAbout(person: string, options: PersonEntriesOptions = {}): Promise<AuditSearchResults> {
    const limit = options.limit ?? 100;
    const offset = options.offset ?? 0;
    const about = this.auditLogs
      .filter((log) => recordIsAbout(log as unknown as Record<string, unknown>, person))
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return Promise.resolve({
      results: about.slice(offset, offset + limit) as unknown as AuditEvent[],
      total: about.length,
      limit,
      offset,
      hasMore: offset + limit < about.length
    });
  }

  /**
   * Flush pending audit events to storage
   * @returns {Promise<void>}
   */
  async flush(options: { fsync?: boolean } = {}): Promise<void> {
    // #1158: serialize rather than bail out when a flush is already running.
    //
    // This used to `return` on `isProcessing`, which is a correctness hole on
    // the critical path: a caller that needs its record durable before it
    // returns would resolve while the record was still sitting in the queue,
    // having been told nothing went wrong. Chaining makes every caller wait for
    // its OWN turn, so `await flush()` means "my record is written".
    const next = this.flushChain
      .catch(() => { /* a failed batch must not poison the next one */ })
      .then(() => this.doFlush(options));
    this.flushChain = next.catch(() => { /* settled; the caller below sees the error */ });
    return next;
  }

  /** One flush batch. Never call directly — {@link flush} serializes these. */
  private async doFlush(options: { fsync?: boolean } = {}): Promise<void> {
    if (this.auditQueue.length === 0 || !this.config) {
      return;
    }

    const eventsToFlush = [...this.auditQueue];
    this.auditQueue = [];

    try {
      // Convert to log format
      const logLines = eventsToFlush.map(event => JSON.stringify(event)).join('\n') + '\n';

      // Append to audit log file
      const auditLogPath = path.join(this.config.logDirectory, this.config.auditFileName);
      if (options.fsync) {
        // #1158: `fs.appendFile` resolves once the bytes are in the OS page
        // cache, which a power loss or kernel panic discards. The critical tier
        // means "the action must not complete unless the record does", so the
        // handle is held open long enough to force the data to the device.
        const handle = await fsp.open(auditLogPath, 'a');
        try {
          await handle.write(logLines);
          await handle.sync();
        } finally {
          await handle.close();
        }
      } else {
        await fs.appendFile(auditLogPath, logLines);
      }

      // #1138: after the write, never before — a head published ahead of the
      // records it names would report truncation on the next verification.
      await this.publishChainHead();

      // Add to in-memory logs for search
      this.auditLogs.push(...eventsToFlush);

      // Keep only recent logs in memory (last 10000)
      if (this.auditLogs.length > 10000) {
        this.auditLogs = this.auditLogs.slice(-10000);
      }

      logger.debug(`[FileAuditProvider] Flushed ${eventsToFlush.length} audit events to disk`);

      // #1122: after the write, so a rotation never delays the record it was
      // triggered by.
      await this.rotateIfNeeded();

    } catch (error) {
      logger.error('[FileAuditProvider] Failed to flush audit queue:', error);
      // Re-queue the events that failed, ahead of anything that arrived while
      // the write was in flight, so the chain order is preserved on retry.
      //
      // #1158: this said `unshift(...this.auditQueue)` — the queue onto itself.
      // `eventsToFlush` had already been cleared out of it, so a failed write
      // DISCARDED the batch (and duplicated whatever had arrived since). The
      // records the refuse-on-failure rule exists to protect were the ones being lost.
      this.auditQueue.unshift(...eventsToFlush);
      // A caller that asked for durability has to learn the write failed;
      // swallowing it here is what let `recordAuditEvent` report success.
      throw error;
    }
  }

  /**
   * Load existing audit logs from disk
   * @private
   * @returns {Promise<void>}
   */
  private async loadExistingLogs(): Promise<void> {
    if (!this.config) return;

    try {
      const auditLogPath = path.join(this.config.logDirectory, this.config.auditFileName);

      if (await fs.pathExists(auditLogPath)) {
        const content = await fs.readFile(auditLogPath, 'utf8');
        const lines = content.trim().split('\n');

        // Parse last 1000 lines for in-memory search
        const recentLines = lines.slice(-1000);
        this.auditLogs = recentLines
          .map(line => {
            try {
              return JSON.parse(line) as ExtendedAuditEvent;
            } catch {
              return null;
            }
          })
          .filter((log): log is ExtendedAuditEvent => log !== null);

        logger.info(`[FileAuditProvider] Loaded ${this.auditLogs.length} recent audit logs`);
      }
    } catch (error) {
      logger.error('[FileAuditProvider] Failed to load existing audit logs:', error);
    }
  }

  /**
   * Clean up old audit logs based on retention policy
   * @returns {Promise<void>}
   */
  async cleanup(
    ctx: JobContext = scheduleContext(this.engine, 'audit-archive retention: archives past the retention window')
  ): Promise<void> {
    if (!this.config) return;

    try {
      // #1122: this used to test the mtime of the LIVE log and move the whole
      // file to a single archive, overwriting whatever was there. On an active
      // instance the live log was always just written to, so the branch was
      // unreachable and retention never fired at all — and had it fired it
      // would have discarded the previous archive rather than expiring records.
      //
      // Retention now applies to ARCHIVES: an archive whose newest record is
      // past the window is removed whole. Expiring individual records inside a
      // live file is deliberately not done — it would punch sequence gaps in
      // the #1119 chain that are indistinguishable from tampering until
      // #1124's chain-restart marker exists.
      const retentionMs = this.config.retentionDays * 24 * 60 * 60 * 1000;
      const cutoff = Date.now() - retentionMs;
      let removed = 0;

      for (const archive of await this.listArchives()) {
        const archivePath = path.join(this.config.logDirectory, archive);
        const stats = await fs.stat(archivePath).catch(() => null);
        // An archive is only ever appended to before it is rotated, so its
        // mtime IS the timestamp of its newest record.
        if (!stats || stats.mtime.getTime() > cutoff) continue;
        await fs.remove(archivePath);
        removed++;
        logger.info(`[FileAuditProvider] Removed audit archive ${archive} — past the ${this.config.retentionDays}-day window`);
        // #1196: destroying audit records is itself a security event, and it
        // used to happen as nobody. Recorded into the live log under the
        // principal the caller named, with origin (boot / schedule) and the
        // reason — through this provider directly, because at boot the
        // AuditManager above it is still initialising.
        const who = attributedTo(ctx);
        try {
          await this.logAuditEvent({
            eventType: AUDIT_EVENT.SECURITY_EVENT,
            ...who,
            ipAddress: undefined,
            action: 'audit-archive-purge',
            resource: archive,
            resourceType: 'audit-archive',
            result: 'success',
            severity: 'high',
            metadata: { ...who.metadata, retentionDays: this.config.retentionDays, newestRecordAt: stats.mtime.toISOString() }
          } as unknown as AuditEvent);
        } catch (recordErr) {
          logger.warn(`[FileAuditProvider] Could not record the removal of ${archive}:`, recordErr);
        }
      }

      if (removed > 0) {
        logger.warn(
          `[FileAuditProvider] Retention removed ${removed} archive(s). Those records are gone, ` +
          'so the chain no longer verifies from genesis.'
        );
      }
    } catch (error) {
      logger.error('[FileAuditProvider] Failed to cleanup old audit logs:', error);
    }
  }

  /**
   * Check if the audit provider is healthy
   * @returns {Promise<boolean>} True if healthy
   */
  async isHealthy(): Promise<boolean> {
    if (!this.config) return false;

    try {
      // Test write access to log directory
      const testFile = path.join(this.config.logDirectory, '.health_check');
      await fs.writeFile(testFile, 'test');
      await fs.unlink(testFile);
      return true;
    } catch (error) {
      logger.error('[FileAuditProvider] Health check failed:', error);
      return false;
    }
  }

  /** Where the chain head is published, or null when nothing publishes it (#1138). */
  override getGuarantees(): AuditReport {
    return { ...super.getGuarantees(), headWitness: this.headWitnessReport() };
  }

  /**
   * What this provider does with a record before it is on disk (#1148).
   *
   * It buffers, except on the refuse-on-failure rule. `writeEvent` queues in memory, a
   * timer flushes on `ngdpbase.audit.flushinterval`, and an early flush is
   * forced at `ngdpbase.audit.maxqueuesize`. That write is `fs.appendFile` with
   * no fsync, so even a flushed `standard` or `volume` record sits in the OS
   * page cache.
   *
   * A `critical` event does not wait for any of that: it is written and
   * `fsync`ed before `writeEvent` resolves (#1158), which is what makes the
   * rule's own definition — *the action must not complete unless the record
   * does* — true rather than declared.
   *
   * Reported rather than judged: an operator who can see a 30-second window on
   * one rule and none on the other decides whether that is acceptable for their
   * deployment. The `durable: true` this replaces decided it for them, wrongly.
   *
   * The bound is still the machine. `fsync` trusts a disk controller's cache,
   * and a failed disk takes the log with it — off-box is #1138.
   */
  override getDurability(): ProviderDurability | null {
    // Before initialize() the provider has not read its configuration, so it
    // does not know its own buffering and says nothing rather than reporting
    // the shipped numbers as though they were in force.
    if (!this.config) return null;
    return {
      bufferedForMs: this.config.flushInterval,
      bufferedRecords: this.config.maxQueueSize,
      // Still false, and deliberately: `standard` and `volume` events are
      // buffered exactly as before, so claiming fsync outright would be the
      // #1148 defect in the other direction.
      fsync: false,
      // #1158: the refuse-on-failure rule IS written through and fsynced before the
      // action completes. Named rather than folded into the boolean so the
      // report states which events have the guarantee instead of rounding.
      fsyncedClasses: refuseOnFailureEventTypes()
    };
  }

  async close(): Promise<void> {
    // Flush any remaining events, durably: this is the last chance the records
    // get, and a shutdown that leaves them in the page cache is exactly the
    // unclean-exit case #1149's system-shutdown event exists to make visible.
    // Failure is logged and re-queued by doFlush; close must still complete, or
    // a failing disk would leave the timer running and the provider half-shut.
    await this.flush({ fsync: true }).catch(() => { /* logged in doFlush */ });

    // Clear flush timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    this.initialized = false;
    logger.info('[FileAuditProvider] Closed successfully');
  }

  /** The audit files in the log directory: the live log and its archives, oldest archive first. */
  private async auditFileNames(): Promise<string[]> {
    if (!this.config) return [];
    const live = path.join(this.config.logDirectory, this.config.auditFileName);
    return [...(await this.listArchives()), ...((await fs.pathExists(live)) ? [this.config.auditFileName] : [])];
  }

  /** Whether `name` is one of this provider's audit files (never another log in the shared folder). */
  private isAuditFileName(name: string): boolean {
    if (!this.config) return false;
    return path.basename(name) === name && (name === this.config.auditFileName || name.startsWith(`${this.config.archiveFileName}.`));
  }

  /**
   * The audit log in a backup (#1876): the live log and every archive, as
   * they are on disk, with the hash chain they carry, as
   * `<stem>.audit.tar` beside the document (`.tar.enc` under the backup
   * key). The queue is flushed first, so every record accepted before the
   * backup is in it. Only the audit files: the application logs in the same
   * folder are not.
   */
  async backupFiles(options: ManagerBackupOptions): Promise<{ data: BackupPartRecord; warnings: string[] }> {
    if (!this.config) throw new Error('FileAuditProvider is not initialized');
    // #1985: BackupManager names the archive and says the key.
    if (!options.archive) throw new Error('AuditManager writes its files beside the backup document, so it is backed up through BackupManager (#1876)');
    await this.flush({ fsync: true });
    const entries = await this.auditFileNames();
    const target = options.archive('audit');
    const outcome = await writeTreeArchive(target.path, this.config.logDirectory, { entries, backupKey: target.backupKey });
    logger.info(`[FileAuditProvider] Backed up ${outcome.files} audit file(s), ${(outcome.bytes / 1024).toFixed(1)} KB, as ${target.archive} (#1876)`);
    return {
      data: { format: 1, archive: target.archive, files: outcome.files, bytes: outcome.bytes, ...(target.keyFingerprint ? { keyFingerprint: target.keyFingerprint } : {}) },
      warnings: outcome.skipped.map((s) => `audit: ${s} is not a file, so it was left out`)
    };
  }

  /**
   * Stage the audit files from a backup for the next start (#1876): extracted
   * into `<audit.log>.staged/`, after checking the archive holds audit files
   * only, and recorded in the site restore. The live log is not touched; the
   * site keeps recording into it until the restart.
   */
  async stageRestore(data: BackupPartRecord, options: ManagerRestoreOptions & { siteRestore: SiteRestoreStaging }): Promise<void> {
    if (!this.config) throw new Error('FileAuditProvider is not initialized');
    if (!data || data.format !== 1 || !options.readArchive) throw new Error('The backup names no audit archive in the backup directory; nothing was staged');
    // #1985: BackupManager checks the name and the key.
    const { path: archive, backupKey } = options.readArchive('AuditManager', data.archive, data.keyFingerprint);
    const foreign: string[] = [];
    await listTreeArchive(archive, (e) => { if (!this.isAuditFileName(e.path)) foreign.push(e.path); }, { backupKey });
    if (foreign.length > 0) throw new Error(`The audit archive holds files that are not audit files: ${foreign.slice(0, 5).join(', ')}; nothing was staged`);
    const live = path.join(this.config.logDirectory, this.config.auditFileName);
    const staged = options.siteRestore.stagedPathFor(live);
    const { files } = await extractTreeArchive(archive, staged, { backupKey });
    // #1986: recorded through BackupManager, which keeps the site restore's record.
    options.siteRestore.record([{ live, staged }]);
    logger.warn(`[FileAuditProvider] ${files} audit file(s) staged — applied at the next start with the rest of the site restore (#1876)`);
  }

  /**
   * Put a staged audit log in place, at start, before the chain head is read
   * (#1876). Every audit file now in the folder (the live log and all its
   * archives, including ones newer than the backup) moves into
   * `<audit.log>.pre-restore/`, and the backup's files take their names. The
   * chain then resumes from the backup's last record; the records written
   * after the backup are kept in that folder, and verify there as before.
   * BackupManager decides whether the part goes in, and records what became
   * of it (#1986).
   */
  private async applyRestoreAtStart(): Promise<void> {
    const config = this.config!;
    const live = path.join(config.logDirectory, config.auditFileName);
    let moved = 0;
    const { applyStagedPartAtStart } = await import('../managers/BackupManager.js');
    const outcome = applyStagedPartAtStart(this.engine, 'AuditManager', {
      allowed: (swap) => path.resolve(swap.live) === path.resolve(live),
      mayBeStaged: () => [live],
      put: (swap, kept) => {
        const names = fs.readdirSync(swap.staged);
        const foreign = names.filter((n) => !this.isAuditFileName(n));
        if (foreign.length > 0) throw new Error(`the staged audit log holds files that are not audit files: ${foreign.slice(0, 5).join(', ')}`);
        fs.rmSync(kept, { recursive: true, force: true });
        fs.mkdirSync(kept, { recursive: true, mode: 0o700 });
        for (const name of fs.readdirSync(config.logDirectory).filter((n) => this.isAuditFileName(n))) {
          fs.renameSync(path.join(config.logDirectory, name), path.join(kept, name));
        }
        for (const name of names) fs.renameSync(path.join(swap.staged, name), path.join(config.logDirectory, name));
        fs.rmSync(swap.staged, { recursive: true, force: true });
        moved = names.length;
      }
    });
    if (!outcome) return;
    if (outcome.refused) {
      logger.error(`[FileAuditProvider] A staged audit log was NOT applied: ${outcome.refused} (#1876)`);
      return;
    }
    for (const a of outcome.applied) {
      logger.warn(`[FileAuditProvider] Restore applied: ${moved} audit file(s) from the backup; the audit files from before are kept in ${path.basename(a.kept)}/ (#1876)`);
    }
  }

  /**
   * Backup audit configuration and statistics
   * @returns {Promise<AuditBackupData>} Backup data
   */
  async backup(): Promise<AuditBackupData> {
    const baseBackup = await super.backup();
    return {
      ...baseBackup,
      config: this.config ? { ...this.config } : {},
      eventCount: this.auditLogs.length,
      queueSize: this.auditQueue.length
    };
  }
}

export default FileAuditProvider;

