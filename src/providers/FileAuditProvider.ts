import BaseAuditProvider, { AuditFilters, AuditSearchResults, AuditStats, AuditBackupData } from './BaseAuditProvider.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from '../managers/ConfigurationManager.js';
import path from 'path';
import fs from 'fs-extra';
import fsp from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';
import { AuditEvent } from '../types/index.js';
import type { ProviderDurability } from './BaseProvider.js';
import type { AuditReport } from './BaseAuditProvider.js';
import { buildWitness, shouldPublish, type ChainWitness } from '../utils/auditHeadWitness.js';
import { refusesOnFailure, refuseOnFailureEventTypes } from '../utils/auditRegistry.js';

export const WITNESS_DESTINATION_KEY = 'ngdpbase.audit.chain-witness.destination';
export const WITNESS_INTERVAL_KEY = 'ngdpbase.audit.chain-witness.interval-minutes';

/** A config value is `unknown`; anything that is not a string is not a path. */
function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Extended audit event with additional fields used by FileAuditProvider
 */
interface ExtendedAuditEvent {
  id: string;
  timestamp: string;
  level?: string;
  eventType: string;
  user?: string;
  userId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  resource?: string;
  resourceType?: string;
  action?: string;
  result?: string;
  reason?: string;
  policyId?: string;
  policyName?: string;
  context?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  duration?: number;
  severity?: string;
}

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
const RETENTION_INTERVAL_MS = 60 * 60 * 1000;

class FileAuditProvider extends BaseAuditProvider {
  /** #1122: how often retention runs after boot. Hourly is far finer than a day-scale window. */
  private retentionTimer: NodeJS.Timeout | null = null;

  private auditLogs: ExtendedAuditEvent[];
  private auditQueue: ExtendedAuditEvent[];

  /**
   * Serializes flush batches (#1158). Every `flush()` chains onto this, so a
   * caller awaiting durability waits for its own batch rather than being told
   * "someone else is flushing" and resolving with its record still in memory.
   */
  private flushChain: Promise<void> = Promise.resolve();
  private flushTimer: NodeJS.Timeout | null;

  /** #1138: when the chain head was last published, and what was published. */
  private witnessPublishedAtMs: number | null = null;
  private witnessLast: ChainWitness | null = null;
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
    await this.cleanup();

    // #1122: and keep doing it. Running retention once at boot meant a
    // long-lived instance applied its own policy exactly once — the same
    // defect #1110 fixed for the token store's purgeExpired.
    this.retentionTimer = setInterval(() => {
      void this.cleanup().catch((err: unknown) => {
        logger.warn('[FileAuditProvider] Scheduled retention pass failed:', err);
      });
    }, RETENTION_INTERVAL_MS);
    this.retentionTimer.unref?.();

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
    // AuditEvent may come in different shapes - need flexible property access
    const evt = auditEvent;
    const legacy = auditEvent as unknown as { type?: string; actor?: string; target?: string; action?: string; result?: string; error?: string; data?: Record<string, unknown>; ipAddress?: string; userAgent?: string };
    const event: ExtendedAuditEvent = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      level: (evt.level as string) || 'info',
      eventType: (evt.eventType as string) || legacy.type || 'unknown',
      user: (evt.user as string) || legacy.actor || 'anonymous',
      userId: evt.userId as string | undefined,
      sessionId: evt.sessionId as string | undefined,
      ipAddress: legacy.ipAddress,
      userAgent: legacy.userAgent,
      resource: (evt.resource as string) || legacy.target,
      resourceType: evt.resourceType as string | undefined,
      action: legacy.action,
      result: (evt.result as string) || (legacy.result === 'success' ? 'allow' : 'deny'),
      reason: (evt.reason as string) || legacy.error,
      policyId: evt.policyId as string | undefined,
      policyName: evt.policyName as string | undefined,
      context: (evt.context as Record<string, unknown>) || {},
      metadata: (evt.metadata as Record<string, unknown>) || legacy.data || {},
      duration: evt.duration as number | undefined,
      severity: (evt.severity as string) || 'low'
    };

    return event as unknown as Record<string, unknown>;
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

    if (format === 'csv') {
      const csvHeader = 'timestamp,eventType,user,resource,action,result,severity,reason\n';
      const csvRows = logs.results.map((logEntry) => {
        const log = logEntry as unknown as Record<string, unknown>;
        const timestamp = log.timestamp as string;
        const eventType = (log.eventType as string) || (log.type as string);
        const user = (log.user as string) || (log.actor as string);
        const resource = (log.resource as string) || (log.target as string);
        const action = log.action as string;
        const result = log.result as string;
        const severity = (log.severity as string) || 'low';
        const reason = (log.reason as string) || (log.error as string) || '';
        return `"${timestamp}","${eventType}","${user}","${resource}","${action}","${result}","${severity}","${reason}"`;
      }).join('\n');

      return csvHeader + csvRows;
    }

    return JSON.stringify(logs.results, null, 2);
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
  async cleanup(): Promise<void> {
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

  /**
   * Close/cleanup the audit provider
   * @returns {Promise<void>}
   */
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
  /**
   * Publish the chain head to the configured destination (#1138).
   *
   * The chain cannot detect truncation of its own tail — removing records from
   * the end breaks no link — and it cannot be fixed locally, because an
   * attacker who owns the machine owns anything the machine wrote locally. So
   * the head goes to wherever the operator points it, and this code takes no
   * view on whether that is genuinely off-box (D13): it reports the
   * destination and never claims what the destination is (D21).
   *
   * Failure to publish is logged and swallowed. An instance that refuses to
   * serve because it could not write a witness would be trading a working
   * system for a detection property, which is the wrong way round — and the
   * absence of a fresh witness is itself visible in getGuarantees().
   */
  private async publishChainHead(): Promise<void> {
    const cm = this.engine?.getManager?.('ConfigurationManager') as {
      getProperty?: (k: string, d: unknown) => unknown;
    } | null;
    const destination = asString(cm?.getProperty?.(WITNESS_DESTINATION_KEY, ''));
    if (destination === '') return;

    const intervalMinutes = Number(cm?.getProperty?.(WITNESS_INTERVAL_KEY, 60) ?? 60);
    const intervalMs = intervalMinutes * 60_000;
    const now = Date.now();
    if (!shouldPublish(this.witnessPublishedAtMs, now, intervalMs)) return;
    // Nothing to witness yet — publishing a genesis head would assert that an
    // empty log is complete.
    if (this.chainSeq <= 0) return;

    // The key is `application-name`, hyphenated, as every other reader spells
    // it (WikiEngine.ts:409, MetricsManager.ts:82, and the Config type). #1138
    // asked for `applicationname`, which matches nothing, so every instance
    // silently published `ngdpbase` — and this field exists precisely so one
    // witness store can hold heads from several instances.
    const instance = asString(cm?.getProperty?.('ngdpbase.application-name', 'ngdpbase')) || 'ngdpbase';
    const witness = buildWitness({
      seq: this.chainSeq,
      hash: this.chainPrevHash,
      instance,
      at: new Date(now)
    });

    try {
      await fs.ensureDir(path.dirname(destination));
      // Appended, never overwritten: a witness store that can be rewritten
      // reproduces the original problem one hop away, and the history of heads
      // is itself the evidence.
      await fs.appendFile(destination, `${JSON.stringify(witness)}\n`, 'utf8');
      this.witnessPublishedAtMs = now;
      this.witnessLast = witness;
    } catch (err) {
      logger.error(
        `[FileAuditProvider] Could not publish the audit chain head to "${destination}": ` +
        `${err instanceof Error ? err.message : String(err)}. Truncation of the log tail is undetectable ` +
        'while no witness is being written.'
      );
    }
  }

  /**
   * Report where the chain head is published, or null when nothing publishes
   * it (#1138). Facts, not a claim — see the note on AuditReport.headWitness.
   */
  override getGuarantees(): AuditReport {
    const cm = this.engine?.getManager?.('ConfigurationManager') as {
      getProperty?: (k: string, d: unknown) => unknown;
    } | null;
    const destination = asString(cm?.getProperty?.(WITNESS_DESTINATION_KEY, ''));
    return {
      ...super.getGuarantees(),
      headWitness: destination === ''
        ? null
        : {
          destination,
          intervalMinutes: Number(cm?.getProperty?.(WITNESS_INTERVAL_KEY, 60) ?? 60),
          lastPublishedAt: this.witnessLast?.publishedAt ?? null,
          lastSeq: this.witnessLast?.seq ?? null
        }
    };
  }

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

    // #1122: and the retention timer, or it keeps a reference to a closed
    // provider alive.
    if (this.retentionTimer) {
      clearInterval(this.retentionTimer);
      this.retentionTimer = null;
    }

    this.initialized = false;
    logger.info('[FileAuditProvider] Closed successfully');
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

