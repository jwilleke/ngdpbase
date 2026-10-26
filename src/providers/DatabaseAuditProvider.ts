/**
 * DatabaseAuditProvider — the audit log in the application database (#1537).
 *
 * Same contract as `FileAuditProvider` (#1119): every record carries `seq`,
 * `prevHash` and `hash`, stamped by `BaseAuditProvider` before it reaches
 * {@link DatabaseAuditProvider.writeEvent}; the head is published to the
 * witness (#1138); `npm run audit:verify -- --database` checks it without
 * booting the application.
 *
 * Storage is `DatabaseManager`'s one connection (`getHandle()`), never a
 * handle of its own, so the records are encrypted when the database is
 * (SQLCipher, `NGDPBASE_DATABASE_KEY`). The tables come from the core
 * migration ledger (`databaseMigrations.ts`, 20261022120000). One store: every
 * event goes here, and nobody clears it; only retention removes rows
 * (operator, 2026-10-22).
 *
 * Writes mirror the file provider: a `continue` event is queued and the queue
 * is written in one transaction on `ngdpbase.audit.flushinterval`, or sooner
 * at `ngdpbase.audit.maxqueuesize`; a `refuse` event writes the queue and
 * itself in one transaction before `writeEvent` returns, so the rows stay in
 * chain order and a failed write rejects (#1158).
 *
 * Retention (`ngdpbase.audit.retentiondays`) is a checkpoint, not an archive:
 * one transaction deletes the oldest rows and writes a checkpoint row naming
 * the seq and hash of the last row it removed. What remains verifies from the
 * newest checkpoint. The purge is recorded as `security-event` /
 * `audit-archive-purge` under the context of whoever ran it.
 *
 * An unencrypted database does not stop the provider (operator, 2026-10-22):
 * `getGuarantees().encryptedAtRest` says so, and initialize() warns.
 *
 * Configuration keys:
 * - ngdpbase.audit.flushinterval, ngdpbase.audit.maxqueuesize — buffering
 * - ngdpbase.audit.retentiondays — how long rows are kept
 * - ngdpbase.audit.provider.database.max-results — the largest page a search
 *   returns and the most rows an export holds
 */
import type Database from 'better-sqlite3-multiple-ciphers';
import BaseAuditProvider, {
  AUDIT_RETENTION_INTERVAL_MS, recordOwner, toStoredAuditRecord,
  type AuditFilters, type AuditReport, type AuditSearchResults, type AuditStats, type PersonEntriesOptions
} from './BaseAuditProvider.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from '../managers/ConfigurationManager.js';
import type BackgroundJobManager from '../managers/BackgroundJobManager.js';
import type { ProviderDurability } from './BaseProvider.js';
import type { AuditEvent } from '../types/index.js';
import type { ChainStart } from '../utils/auditChain.js';
import type { JobContext } from '../context/JobContext.js';
import { attributedTo, scheduleContext, systemContext } from '../context/bootActions.js';
import { refusesOnFailure, refuseOnFailureEventTypes } from '../utils/auditRegistry.js';
import { AUDIT_EVENT } from '../utils/auditEventNames.js';
import logger from '../utils/logger.js';

type Handle = InstanceType<typeof Database>;

/** What the provider asks of DatabaseManager. */
interface DatabaseDoor {
  isEnabled(): boolean;
  isEncrypted(): boolean;
  getUnavailableReason?(): string | null;
  getHandle<H>(): H;
}

/** The largest page a search returns, and the most rows an export holds, when not configured. */
export const DEFAULT_MAX_RESULTS = 10000;

interface DatabaseAuditConfig {
  flushInterval: number;
  maxQueueSize: number;
  retentionDays: number;
  maxResults: number;
}

/** A row's columns besides the record: copies of its fields, for the indexes. */
const INSERT_SQL = `INSERT INTO audit_events
  (id, seq, prev_hash, hash, timestamp, event_type, user, actor, owner, resource, action, result, severity, record)
  VALUES (@id, @seq, @prevHash, @hash, @timestamp, @eventType, @user, @actor, @owner, @resource, @action, @result, @severity, @record)`;

/** The sortable fields, mapped to their columns; anything else sorts by time. */
const SORT_COLUMNS = new Map<string, string>([
  ['timestamp', 'timestamp'],
  ['eventType', 'event_type'],
  ['user', 'user'],
  ['actor', 'actor'],
  ['severity', 'severity'],
  ['result', 'result'],
  ['seq', 'row_id']
]);

/** A text value of a record, or null. */
function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/** A positive whole number from configuration, or the default. */
function positiveInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** The newest checkpoint, or null when retention has never removed a row. */
export function newestCheckpoint(db: Handle): (ChainStart & { throughRow: number }) | null {
  const row = db.prepare('SELECT through_row, seq, hash FROM audit_checkpoints ORDER BY checkpoint_id DESC LIMIT 1').get() as
    { through_row: number; seq: number; hash: string } | undefined;
  return row ? { seq: row.seq, hash: row.hash, throughRow: row.through_row } : null;
}

/**
 * What verification reads (#1537): the newest checkpoint, and every record
 * after it in the order written. Used by the provider and by
 * `scripts/verify-audit-chain.ts`, which opens the database read-only
 * without booting the application.
 */
export function readAuditChain(db: Handle): { start: ChainStart | null; records: Record<string, unknown>[] } {
  const checkpoint = newestCheckpoint(db);
  const rows = db.prepare('SELECT record FROM audit_events WHERE row_id > ? ORDER BY row_id').all(checkpoint?.throughRow ?? 0) as { record: string }[];
  return {
    start: checkpoint ? { seq: checkpoint.seq, hash: checkpoint.hash } : null,
    records: rows.map((r) => JSON.parse(r.record) as Record<string, unknown>)
  };
}

class DatabaseAuditProvider extends BaseAuditProvider {
  private db: Handle | null = null;
  private encrypted = false;
  private config: DatabaseAuditConfig | null = null;
  private queue: Record<string, unknown>[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(engine: WikiEngine) {
    super(engine);
  }

  async initialize(): Promise<void> {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) throw new Error('DatabaseAuditProvider requires ConfigurationManager');
    const database = this.engine.getManager<DatabaseDoor>('DatabaseManager');
    if (!database) throw new Error('DatabaseAuditProvider requires DatabaseManager (#1537)');
    const unavailable = database.getUnavailableReason?.() ?? null;
    if (unavailable) throw new Error(`the application database is not available: ${unavailable}`);
    if (!database.isEnabled()) {
      throw new Error("no application database is open — set ngdpbase.database.provider to 'sqlite' to keep the audit log in it (#1537)");
    }

    this.config = {
      flushInterval: positiveInt(configManager.getProperty('ngdpbase.audit.flushinterval', 30000), 30000),
      maxQueueSize: positiveInt(configManager.getProperty('ngdpbase.audit.maxqueuesize', 1000), 1000),
      retentionDays: Number(configManager.getProperty('ngdpbase.audit.retentiondays', 90)),
      maxResults: positiveInt(configManager.getProperty('ngdpbase.audit.provider.database.max-results', DEFAULT_MAX_RESULTS), DEFAULT_MAX_RESULTS)
    };
    this.db = database.getHandle<Handle>();
    this.encrypted = database.isEncrypted();
    if (!this.encrypted) {
      // Warn, never refuse (operator, 2026-10-22): reported in getGuarantees().
      logger.warn('[DatabaseAuditProvider] The application database is not encrypted (NGDPBASE_DATABASE_KEY is not set), so the audit log is stored unencrypted (#1537)');
    }

    this.flushTimer = setInterval(() => {
      // The fire-and-forget path: doFlush has logged and re-queued already.
      void this.flush().catch(() => { /* logged and re-queued */ });
    }, this.config.flushInterval);
    this.flushTimer.unref?.();

    await this.cleanup(systemContext(this.engine, 'audit retention at boot: records past the retention window'));
    this.engine?.getManager?.<BackgroundJobManager>('BackgroundJobManager')?.registerMaintenance({
      id: 'audit.database-retention',
      displayName: 'Audit: remove records past retention',
      everyMs: AUDIT_RETENTION_INTERVAL_MS,
      run: async (ctx) => { await this.cleanup(ctx); }
    });

    this.initialized = true;
    logger.info(`[DatabaseAuditProvider] Initialized — ${this.encrypted ? 'encrypted' : 'NOT encrypted'}, retention ${this.config.retentionDays} days`);
  }

  getProviderInfo(): { name: string; version: string; description: string; features: string[] } {
    return {
      name: 'DatabaseAuditProvider',
      version: '1.0.0',
      description: 'Audit log in the application database',
      features: ['search', 'export', 'retention', 'checkpoint', 'queryable', 'person-view']
    };
  }

  /** The stored shape, the same as the file provider's (#1537). */
  protected override prepareRecord(auditEvent: Record<string, unknown>): Record<string, unknown> {
    return toStoredAuditRecord(auditEvent) as unknown as Record<string, unknown>;
  }

  /** The newest row, else the newest checkpoint: a chain pruned to nothing still continues (#1537). */
  protected override loadChainHead(): Promise<{ seq: number; hash: string } | null> {
    if (!this.db) return Promise.resolve(null);
    const row = this.db.prepare('SELECT seq, hash FROM audit_events ORDER BY row_id DESC LIMIT 1').get() as { seq: number; hash: string } | undefined;
    if (row) return Promise.resolve({ seq: row.seq, hash: row.hash });
    const checkpoint = newestCheckpoint(this.db);
    return Promise.resolve(checkpoint ? { seq: checkpoint.seq, hash: checkpoint.hash } : null);
  }

  /**
   * Queue a stamped record, or write it now (#1158): a `refuse` event writes
   * the queue and itself in one transaction before this resolves, and a
   * failure rejects. Through the queue, never around it, so rows land in
   * chain order.
   */
  async writeEvent(record: Record<string, unknown>): Promise<string> {
    this.queue.push(record);
    const eventType = text(record.eventType) ?? '';
    if (refusesOnFailure(eventType)) {
      await this.flush();
    } else if (this.config && this.queue.length >= this.config.maxQueueSize) {
      await this.flush();
    }
    if (record.severity === 'critical' || record.level === 'error') {
      logger.error(`[DatabaseAuditProvider] CRITICAL: ${eventType} - ${String(record.result)}`, {
        user: record.user,
        resource: record.resource,
        reason: record.reason
      });
    }
    return String(record.id);
  }

  /**
   * Write the queue in one transaction. A failure puts the batch back at the
   * front of the queue, so the order is kept for the retry, and rejects.
   * better-sqlite3 is synchronous, so two flushes never interleave.
   */
  async flush(): Promise<void> {
    if (!this.db || this.queue.length === 0) return;
    const batch = this.queue;
    this.queue = [];
    try {
      const insert = this.db.prepare(INSERT_SQL);
      this.db.transaction((rows: Record<string, unknown>[]) => {
        for (const r of rows) {
          insert.run({
            id: String(r.id),
            seq: r.seq as number,
            prevHash: String(r.prevHash),
            hash: String(r.hash),
            timestamp: String(r.timestamp),
            eventType: String(r.eventType),
            user: text(r.user),
            actor: text(r.actor),
            owner: recordOwner(r),
            resource: text(r.resource),
            action: text(r.action),
            result: text(r.result),
            severity: text(r.severity),
            record: JSON.stringify(r)
          });
        }
      })(batch);
    } catch (error) {
      this.queue.unshift(...batch);
      logger.error('[DatabaseAuditProvider] Failed to write the audit queue:', error);
      throw error;
    }
    logger.debug(`[DatabaseAuditProvider] Wrote ${batch.length} audit record(s)`);
    // #1138: after the write, never before.
    await this.publishChainHead();
  }

  /** Queued records are written before a query, so a search sees every record accepted so far. */
  private flushBeforeRead(): void {
    void this.flush().catch(() => { /* logged and re-queued; the query reads what is stored */ });
  }

  private clampLimit(limit: unknown): number {
    const max = this.config?.maxResults ?? DEFAULT_MAX_RESULTS;
    const n = Number(limit ?? 100);
    return Number.isInteger(n) && n > 0 ? Math.min(n, max) : Math.min(100, max);
  }

  /** The WHERE clause for the existing filters, every one an indexed or plain column. */
  private where(filters: AuditFilters): { sql: string; params: unknown[] } {
    const clauses: string[] = [];
    const params: unknown[] = [];
    const eq = (column: string, value: string | undefined): void => {
      if (value === undefined || value === null || value === '') return;
      clauses.push(`${column} = ?`);
      params.push(value);
    };
    eq('user', filters.user);
    eq('actor', filters.actor);
    eq('event_type', filters.eventType);
    eq('result', filters.result);
    eq('severity', filters.severity);
    eq('resource', filters.resource);
    eq('action', filters.action);
    if (filters.startDate) {
      clauses.push('timestamp >= ?');
      params.push(new Date(filters.startDate).toISOString());
    }
    if (filters.endDate) {
      clauses.push('timestamp <= ?');
      params.push(new Date(filters.endDate).toISOString());
    }
    return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
  }

  private page(where: { sql: string; params: unknown[] }, order: string, limit: number, offset: number): AuditSearchResults {
    const db = this.requireDb();
    const total = (db.prepare(`SELECT COUNT(*) AS n FROM audit_events ${where.sql}`).get(...where.params) as { n: number }).n;
    const rows = db.prepare(`SELECT record FROM audit_events ${where.sql} ORDER BY ${order} LIMIT ? OFFSET ?`)
      .all(...where.params, limit, offset) as { record: string }[];
    return {
      results: rows.map((r) => JSON.parse(r.record) as AuditEvent),
      total,
      limit,
      offset,
      hasMore: offset + limit < total
    };
  }

  private requireDb(): Handle {
    if (!this.db) throw new Error('DatabaseAuditProvider is not initialized');
    return this.db;
  }

  searchAuditLogs(filters: AuditFilters = {}, options: Record<string, unknown> = {}): Promise<AuditSearchResults> {
    try {
      this.flushBeforeRead();
      const merged: AuditFilters = { ...filters, ...options };
      const limit = this.clampLimit(merged.limit);
      const offset = Math.max(0, Number(merged.offset ?? 0) || 0);
      const column = SORT_COLUMNS.get(merged.sortBy ?? 'timestamp') ?? 'timestamp';
      const dir = merged.sortOrder === 'asc' ? 'ASC' : 'DESC';
      return Promise.resolve(this.page(this.where(merged), `${column} ${dir}, row_id ${dir}`, limit, offset));
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }
  }

  /**
   * The entries about one person (#1537): the person is the row's `user`,
   * its `actor`, or the owner of the resource it names (`metadata.owner`:
   * their identity `@id` from #2041 on, their username before).
   * Each is an indexed column. Newest first, a page at a time.
   */
  override searchEntriesAbout(person: string, options: PersonEntriesOptions = {}): Promise<AuditSearchResults> {
    try {
      this.flushBeforeRead();
      const limit = this.clampLimit(options.limit);
      const offset = Math.max(0, Number(options.offset ?? 0) || 0);
      // #2041: the owner is the user's identity @id on new rows, their
      // username on rows written before; both match, nothing is rewritten.
      const where = options.ownerId
        ? { sql: 'WHERE user = ? OR actor = ? OR owner = ? OR owner = ?', params: [person, person, person, options.ownerId] }
        : { sql: 'WHERE user = ? OR actor = ? OR owner = ?', params: [person, person, person] };
      return Promise.resolve(this.page(where, 'timestamp DESC, row_id DESC', limit, offset));
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }
  }

  async getAuditStats(filters: AuditFilters = {}): Promise<AuditStats> {
    this.flushBeforeRead();
    const db = this.requireDb();
    const where = this.where(filters);
    const grouped = (column: string): Record<string, number> => {
      const rows = db.prepare(`SELECT ${column} AS k, COUNT(*) AS n FROM audit_events ${where.sql} GROUP BY ${column}`).all(...where.params) as { k: string | null; n: number }[];
      const out: Record<string, number> = {};
      for (const r of rows) if (r.k !== null) out[r.k] = r.n;
      return out;
    };
    const total = (db.prepare(`SELECT COUNT(*) AS n FROM audit_events ${where.sql}`).get(...where.params) as { n: number }).n;
    const incidents = (db.prepare(`SELECT COUNT(*) AS n FROM audit_events ${where.sql ? `${where.sql} AND` : 'WHERE'} severity IN ('high', 'critical')`)
      .get(...where.params) as { n: number }).n;
    const recent = await this.searchAuditLogs(filters, { limit: 10 });
    return {
      totalEvents: total,
      eventsByType: grouped('event_type'),
      eventsByResult: grouped('result'),
      eventsBySeverity: grouped('severity'),
      eventsByUser: grouped('user'),
      recentActivity: recent.results,
      securityIncidents: incidents
    };
  }

  async exportAuditLogs(filters: AuditFilters = {}, format: 'json' | 'csv' = 'json'): Promise<string> {
    const logs = await this.searchAuditLogs(filters, { limit: this.config?.maxResults ?? DEFAULT_MAX_RESULTS });
    return this.formatExport(logs.results, format);
  }

  /**
   * Remove the rows past `ngdpbase.audit.retentiondays` (#1537): in one
   * transaction, the oldest rows up to the last one older than the cutoff,
   * and a checkpoint naming that row's seq and hash, so what remains verifies
   * from it. The rows removed are a prefix in the order written. Recorded as
   * `security-event` / `audit-archive-purge` under `ctx`, the way the file
   * provider records removing an archive.
   */
  async cleanup(
    ctx: JobContext = scheduleContext(this.engine, 'audit retention: records past the retention window')
  ): Promise<void> {
    if (!this.db || !this.config) return;
    const retentionDays = this.config.retentionDays;
    if (!Number.isFinite(retentionDays) || retentionDays <= 0) return;
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const db = this.db;

    let removed: { count: number; seq: number; hash: string } | null;
    try {
      removed = db.transaction(() => {
        const last = db.prepare('SELECT row_id, seq, hash FROM audit_events WHERE timestamp < ? ORDER BY row_id DESC LIMIT 1').get(cutoff) as
          { row_id: number; seq: number; hash: string } | undefined;
        if (!last) return null;
        const count = db.prepare('DELETE FROM audit_events WHERE row_id <= ?').run(last.row_id).changes;
        db.prepare(`INSERT INTO audit_checkpoints (through_row, seq, hash, removed, cutoff, retention_days, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`).run(last.row_id, last.seq, last.hash, count, cutoff, retentionDays, new Date().toISOString());
        return { count, seq: last.seq, hash: last.hash };
      })();
    } catch (error) {
      logger.error('[DatabaseAuditProvider] Retention failed; no row was removed:', error);
      return;
    }
    if (!removed) return;

    logger.warn(`[DatabaseAuditProvider] Retention removed ${removed.count} audit record(s) older than ${retentionDays} days, through seq ${removed.seq}; the chain now verifies from that checkpoint (#1537)`);
    const who = attributedTo(ctx);
    try {
      await this.logAuditEvent({
        eventType: AUDIT_EVENT.SECURITY_EVENT,
        ...who,
        ipAddress: undefined,
        action: 'audit-archive-purge',
        resource: 'audit_events',
        resourceType: 'audit-records',
        result: 'success',
        severity: 'high',
        metadata: { ...who.metadata, retentionDays, cutoff, removed: removed.count, checkpointSeq: removed.seq, checkpointHash: removed.hash }
      } as unknown as AuditEvent);
    } catch (recordErr) {
      logger.warn('[DatabaseAuditProvider] Could not record the retention purge:', recordErr);
    }
  }

  /** The tables answer a query: the connection is open and the schema is there. */
  isHealthy(): Promise<boolean> {
    try {
      this.requireDb().prepare('SELECT COUNT(*) FROM audit_checkpoints').get();
      return Promise.resolve(true);
    } catch (error) {
      logger.error('[DatabaseAuditProvider] Health check failed:', error);
      return Promise.resolve(false);
    }
  }

  /** The guarantees held, with the witness and whether the database is encrypted at rest (#1537). */
  override getGuarantees(): AuditReport {
    return { ...super.getGuarantees(), headWitness: this.headWitnessReport(), encryptedAtRest: this.encrypted };
  }

  /**
   * As the file provider: `continue` records wait in memory for up to the
   * flush interval or the queue size; `refuse` records are committed
   * (SQLite `synchronous = FULL`) before the action completes.
   */
  override getDurability(): ProviderDurability | null {
    if (!this.config) return null;
    return {
      bufferedForMs: this.config.flushInterval,
      bufferedRecords: this.config.maxQueueSize,
      fsync: false,
      fsyncedClasses: refuseOnFailureEventTypes()
    };
  }

  /**
   * Write what is queued, and stop the timer. The connection is
   * DatabaseManager's, which closes it after this manager has shut down.
   */
  async close(): Promise<void> {
    await this.flush().catch(() => { /* logged and re-queued */ });
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.initialized = false;
    logger.info('[DatabaseAuditProvider] Closed');
  }
}

export default DatabaseAuditProvider;
