import { AuditEvent } from '../types/index.js';
import logger from '../utils/logger.js';
import { stampRecord, GENESIS_HASH, CHAIN_RESTART_EVENT } from '../utils/auditChain.js';
import type { WikiEngine } from '../types/WikiEngine.js';

/**
 * Provider information
 */
interface ProviderInfo {
  name: string;
  version: string;
  description: string;
  features: string[];
}

/**
 * Audit search filters
 */
export interface AuditFilters {
  /** Filter by username */
  user?: string;

  /** Filter by event type */
  eventType?: string;

  /** Filter by result (allow, deny, error) */
  result?: string;

  /** Filter by severity level */
  severity?: string;

  /** Start date filter */
  startDate?: Date;

  /** End date filter */
  endDate?: Date;

  /** Filter by resource */
  resource?: string;

  /** Filter by action */
  action?: string;

  /** Maximum results to return */
  limit?: number;

  /** Results offset for pagination */
  offset?: number;

  /** Sort field */
  sortBy?: string;

  /** Sort order (asc/desc) */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Audit search results
 */
export interface AuditSearchResults {
  /** Array of audit events */
  results: AuditEvent[];

  /** Total matching events */
  total: number;

  /** Result limit */
  limit: number;

  /** Result offset */
  offset: number;

  /** Whether more results are available */
  hasMore: boolean;
}

/**
 * Audit statistics
 */
export interface AuditStats {
  /** Total number of events */
  totalEvents: number;

  /** Events by type */
  eventsByType?: Record<string, number>;

  /** Events by result */
  eventsByResult?: Record<string, number>;

  /** Events by severity */
  eventsBySeverity?: Record<string, number>;

  /** Events by user */
  eventsByUser?: Record<string, number>;

  /** Recent activity entries */
  recentActivity?: AuditEvent[];

  /** Number of security incidents (high/critical severity) */
  securityIncidents?: number;

  /** Additional statistics */
  [key: string]: unknown;
}

/**
 * Audit backup data
 */
export interface AuditBackupData {
  /** Provider name */
  provider: string;

  /** Initialization state */
  initialized: boolean;

  /** Backup timestamp */
  timestamp: string;

  /** Additional backup data */
  [key: string]: unknown;
}

/**
 * BaseAuditProvider - Abstract base class for audit providers
 *
 * Provides the interface that all audit providers must implement.
 * Follows the provider pattern established in CacheManager, AttachmentManager, and PageManager.
 *
 * Audit providers implement different storage backends (file, database, cloud logging)
 *
 * @class BaseAuditProvider
 * @abstract
 *
 * @property {WikiEngine} engine - Reference to the wiki engine
 * @property {boolean} initialized - Whether provider has been initialized
 *
 * @see {@link FileAuditProvider} for file-based implementation
 * @see {@link DatabaseAuditProvider} for database implementation
 * @see {@link AuditManager} for usage
 *
 * @example
 * class MyAuditProvider extends BaseAuditProvider {
 *   async initialize(): Promise<void> {
 *     const config = this.engine.getManager('ConfigurationManager');
 *     this.auditPath = config.getProperty('audit.path');
 *     this.initialized = true;
 *   }
 *
 *   async logAuditEvent(event: AuditEvent): Promise<string> {
 *     // Implementation
 *     return event.id;
 *   }
 * }
 */
/**
 * What a provider does with a record between accepting it and having it on
 * disk (#1148).
 *
 * Facts rather than a claim. Durability on a single node means write, fsync,
 * then acknowledge — and even that trusts a disk controller's cache, while a
 * failed disk takes the log with it. So a provider reports the window in which
 * a record can still be lost and the reader draws the conclusion.
 */
export interface AuditDurability {
  /** Milliseconds a record may sit in memory before being written. 0 = never buffered. */
  bufferedForMs: number;
  /** Records held before an early write is forced. 0 = no bound. */
  bufferedRecords: number;
  /** Whether a write is flushed to disk before being reported as stored. */
  fsync: boolean;
}

/** What a provider reports about itself. */
export interface AuditReport {
  /** Alteration of a stored record is detectable. Deletion of the tail is not — see #1138. */
  tamperEvident: boolean;
  /** How records reach disk, or null when the provider has not stated it. */
  durability: AuditDurability | null;
  queryable: boolean;
  /** Whether the chain head is held off this machine. See #1138. */
  offBox: boolean;
}

abstract class BaseAuditProvider {
  /** Reference to the wiki engine */
  protected engine: WikiEngine;

  /** Whether provider has been initialized */
  public initialized: boolean;

  /**
   * Create a new audit provider
   *
   * @constructor
   * @param {WikiEngine} engine - The WikiEngine instance
   * @throws {Error} If engine is not provided
   */
  constructor(engine: WikiEngine) {
    if (!engine) {
      throw new Error('BaseAuditProvider requires an engine instance');
    }
    this.engine = engine;
    this.initialized = false;
  }

  /**
   * Initialize the audit provider
   *
   * Implementations should load configuration from ConfigurationManager:
   *   const configManager = this.engine.getManager('ConfigurationManager');
   *   const value = configManager.getProperty('key', 'default');
   *
   * Do NOT read configuration files directly.
   *
   * @async
   * @abstract
   * @returns {Promise<void>}
   * @throws {Error} Always throws - must be implemented by subclass
   */
  abstract initialize(): Promise<void>;

  /**
   * Get provider information
   *
   * @returns {ProviderInfo} Provider metadata
   */
  getProviderInfo(): ProviderInfo {
    return {
      name: 'BaseAuditProvider',
      version: '1.0.0',
      description: 'Base audit provider interface',
      features: []
    };
  }

  /**
   * What this provider actually guarantees (#1119).
   *
   * Reportable rather than inferable. A security property that has to be
   * deduced from configuration is not one an instance can be assessed on — so
   * an operator or an assessor asks the system instead of reading the config
   * and hoping.
   *
   * `tamperEvident` follows from the chain and is therefore true for every
   * storing provider and false for the inert one, without a subclass having to
   * remember to say so.
   */
  getGuarantees(): AuditReport {
    return {
      tamperEvident: this.chainEnabled(),
      // #1148: this was `durable: this.chainEnabled()`. Chaining makes a
      // record's ALTERATION detectable and says nothing about whether the
      // record survives a crash, so every storing provider claimed durability
      // it did not have — FileAuditProvider buffers in memory and appends
      // without fsync.
      //
      // A provider that has not stated its durability claims nothing. Silence
      // rather than a default, because a subclass that buffers and forgets to
      // say so must not inherit an assertion that it writes immediately —
      // which is the shape of the bug this replaces.
      durability: null,
      queryable: true,
      offBox: false
    };
  }

  /** Sequence of the last record this provider stamped (#1119). */
  protected chainSeq = 0;

  /** Hash of the last record this provider stamped (#1119). */
  protected chainPrevHash: string = GENESIS_HASH;

  /**
   * Whether this provider chains its records (#1119).
   *
   * True for anything that stores events. `NullAuditProvider` overrides it: it
   * keeps nothing, so it has nothing to chain — a legitimate state rather than
   * a hole, provided the instance cannot then CLAIM tamper evidence, which is
   * what `getProviderInfo().guarantees` is for.
   */
  protected chainEnabled(): boolean {
    return true;
  }

  /**
   * Resume the chain from storage, or null to start a new one (#1119).
   *
   * Called once, lazily, before the first record is stamped. A provider that
   * cannot resume returns null and starts a fresh chain — honest, and visible
   * as a `seq` restarting at 1 rather than as a silent break.
   *
   * @protected
   */
  protected loadChainHead(): Promise<{ seq: number; hash: string } | null> {
    return Promise.resolve(null);
  }

  /** Whether the chain head has been resumed yet. */
  private chainResumed = false;

  /**
   * Record an audit event.
   *
   * __Deliberately concrete and not overridable in spirit.__ Integrity is a
   * property of the CONTRACT, not of one implementation: stamped in a subclass
   * it would protect that subclass only, and whether an instance were
   * tamper-evident would depend on which storage backend was configured. "It
   * depends on your backend" is not an answer that survives an assessment.
   *
   * A subclass implements {@link writeEvent} — storage — and never sees the
   * un-stamped record, so it cannot skip the integrity step. Adding a fifth
   * provider gets tamper evidence without having to remember it.
   *
   * @param auditEvent - The event to record
   * @returns The stored event's id
   */
  async logAuditEvent(auditEvent: AuditEvent): Promise<string> {
    // Normalise BEFORE stamping. A provider that adds its own id or timestamp
    // must do it here, or the hash would cover a record different from the one
    // stored and every verification would fail.
    const prepared = this.prepareRecord(auditEvent as unknown as Record<string, unknown>);

    if (!this.chainEnabled()) {
      return this.writeEvent(prepared);
    }

    if (!this.chainResumed) {
      this.chainResumed = true;
      const head = await this.loadChainHead();
      if (head) {
        this.chainSeq = head.seq;
        this.chainPrevHash = head.hash;
      }
    }

    const stamped = stampRecord(prepared, this.chainSeq + 1, this.chainPrevHash);

    // Advance only after stamping succeeds, so a throw cannot leave a gap.
    this.chainSeq += 1;
    this.chainPrevHash = stamped.hash as string;

    return this.writeEvent(stamped);
  }

  /**
   * Begin a new chain, recording that the old one was abandoned (#1124).
   *
   * __Never called automatically.__ A system that silently repairs its own
   * audit chain is worse than one that stays visibly broken, so this exists
   * only for an explicit operator action — `npm run audit:restart-chain`.
   *
   * The marker is written INTO the log as an ordinary record, which is what
   * stops it being an escape hatch: an attacker who wants a clean chain has to
   * leave a record saying they broke it. It does not repair the past — the
   * abandoned segment stays in the file and stays unverifiable. It only says
   * the discontinuity is known, by whom, and why.
   *
   * @param reason - Why the chain is being restarted. Recorded verbatim.
   * @param actor - Who authorised it.
   * @returns The id of the marker record.
   */
  async restartChain(reason: string, actor: string): Promise<string> {
    if (!this.chainEnabled()) {
      throw new Error('This audit provider does not chain its records, so there is no chain to restart');
    }
    if (!reason.trim()) {
      // An unexplained restart is itself a finding, so refuse to write one.
      throw new Error('A chain restart must record a reason');
    }

    // Resolve the head being abandoned. The IN-MEMORY head wins when this
    // process has written anything — it is what actually reached storage, and
    // asking the store again could read a stale or partial tail. Only fall back
    // to storage when this process has written nothing yet.
    //
    // Null is legitimate and honest: when the previous chain cannot be read at
    // all, admitting ignorance beats an unverifiable claim about what came
    // before.
    const head = this.chainSeq > 0
      ? { seq: this.chainSeq, hash: this.chainPrevHash }
      : await this.loadChainHead().catch(() => null);

    // Through prepareRecord like any other record, so the marker gets whatever
    // id and timestamp the provider assigns. Building it directly meant it had
    // no id and the write returned undefined.
    const prepared = this.prepareRecord({
      eventType: CHAIN_RESTART_EVENT,
      user: actor,
      severity: 'high',
      result: 'success',
      action: 'audit-chain-restart',
      metadata: {
        previousSeq: head?.seq ?? null,
        previousHash: head?.hash ?? null,
        reason: reason.trim(),
        actor
      }
    });

    const marker = stampRecord(prepared, 1, GENESIS_HASH);

    this.chainSeq = 1;
    this.chainPrevHash = marker.hash as string;

    logger.warn(
      `[audit] CHAIN RESTARTED by ${actor}: ${reason.trim()}. ` +
      `Abandoned chain head ${head?.hash ?? '(unreadable)'} at seq ${head?.seq ?? '(unknown)'}. ` +
      'The abandoned records remain in the log and remain unverifiable.'
    );

    return this.writeEvent(marker);
  }

  /**
   * Normalise an incoming event into the record that will be stored (#1119).
   *
   * Identity by default. A provider that assigns its own id, timestamp or
   * field shape overrides this rather than doing it in {@link writeEvent},
   * because the stamp must cover exactly what is written.
   *
   * @protected
   */
  protected prepareRecord(record: Record<string, unknown>): Record<string, unknown> {
    return record;
  }

  /**
   * Store an already-stamped record.
   *
   * @async
   * @abstract
   * @param record - The record to store, with seq/prevHash/hash already applied
   * @returns {Promise<string>} Event ID
   */
  abstract writeEvent(record: Record<string, unknown>): Promise<string>;

  /**
   * Search audit logs
   *
   * @async
   * @abstract
   * @param {AuditFilters} filters - Search filters
   * @param {Record<string, any>} options - Search options
   * @returns {Promise<AuditSearchResults>} Search results
   * @throws {Error} Always throws - must be implemented by subclass
   */
  abstract searchAuditLogs(
    filters?: AuditFilters,
    options?: Record<string, unknown>
  ): Promise<AuditSearchResults>;

  /**
   * Get audit statistics
   *
   * @async
   * @abstract
   * @param {AuditFilters} filters - Optional filters
   * @returns {Promise<AuditStats>} Audit statistics
   * @throws {Error} Always throws - must be implemented by subclass
   */
  abstract getAuditStats(filters?: AuditFilters): Promise<AuditStats>;

  /**
   * Export audit logs
   *
   * @async
   * @abstract
   * @param {AuditFilters} filters - Export filters
   * @param {string} format - Export format ('json', 'csv')
   * @returns {Promise<string>} Exported data
   * @throws {Error} Always throws - must be implemented by subclass
   */
  abstract exportAuditLogs(
    filters?: AuditFilters,
    format?: 'json' | 'csv'
  ): Promise<string>;

  /**
   * Flush pending audit events to storage
   *
   * @async
   * @abstract
   * @returns {Promise<void>}
   * @throws {Error} Always throws - must be implemented by subclass
   */
  abstract flush(): Promise<void>;

  /**
   * Clean up old audit logs based on retention policy
   *
   * @async
   * @abstract
   * @returns {Promise<void>}
   * @throws {Error} Always throws - must be implemented by subclass
   */
  abstract cleanup(): Promise<void>;

  /**
   * Check if the audit provider is healthy
   *
   * @async
   * @abstract
   * @returns {Promise<boolean>} True if healthy
   * @throws {Error} Always throws - must be implemented by subclass
   */
  abstract isHealthy(): Promise<boolean>;

  /**
   * Close/cleanup the audit provider
   *
   * @async
   * @abstract
   * @returns {Promise<void>}
   * @throws {Error} Always throws - must be implemented by subclass
   */
  abstract close(): Promise<void>;

  /**
   * Backup audit configuration and state (optional)
   *
   * Default implementation provides basic backup data.
   * Subclasses can override to include provider-specific data.
   *
   * @async
   * @returns {Promise<AuditBackupData>} Backup data
   */
  backup(): Promise<AuditBackupData> {
    return Promise.resolve({
      provider: this.constructor.name,
      initialized: this.initialized,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Restore audit from backup (optional)
   *
   * Default implementation does nothing.
   * Subclasses can override if they support restore functionality.
   *
   * @async
   * @param {AuditBackupData} _backupData - Backup data
   * @returns {Promise<void>}
   */
  async restore(_backupData: AuditBackupData): Promise<void> {
    // Default implementation does nothing
    // Subclasses can override if they support restore
  }
}

export default BaseAuditProvider;
export { WikiEngine, ProviderInfo };

