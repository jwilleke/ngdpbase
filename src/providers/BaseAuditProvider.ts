import { AuditEvent } from '../types/index.js';
import type { ProviderInfo } from '../types/Provider.js';
import path from 'path';
import fs from 'fs-extra';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';
import { buildWitness, shouldPublish, type ChainWitness } from '../utils/auditHeadWitness.js';
import type ExportManager from '../managers/ExportManager.js';
import { stampRecord, GENESIS_HASH, CHAIN_RESTART_EVENT } from '../utils/auditChain.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import BaseProvider, { type ProviderDurability } from './BaseProvider.js';
import { actorOf, type ActorContext } from '../context/ActorContext.js';

/**
 * Audit search filters
 */
export interface AuditFilters {
  /** Filter by username — the account acted on */
  user?: string;

  /** Filter by the person who actually acted, under a proxy grant (#1762) */
  actor?: string;

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
 * Paging for the entries about one person (#1537): the newest first.
 */
export interface PersonEntriesOptions {
  limit?: number;
  offset?: number;
  /**
   * The user's identity `@id` (#2041). From that release on a row names the
   * owner of its resource by `@id` in `metadata.owner`; rows written before
   * name the owner's username. A row is about the user under either.
   */
  ownerId?: string;
}

/** Where the chain head is published (#1138), shared by every storing provider. */
export const WITNESS_DESTINATION_KEY = 'ngdpbase.audit.chain-witness.destination';
export const WITNESS_INTERVAL_KEY = 'ngdpbase.audit.chain-witness.interval-minutes';

/** #1122, #1537: how often retention runs after boot. Hourly is far finer than a day-scale window. */
export const AUDIT_RETENTION_INTERVAL_MS = 60 * 60 * 1000;

/** A config value is `unknown`; anything that is not a string is not a path. */
function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * The shape every storing provider writes (#1119, #1537): one shape, so a
 * record reads, exports and verifies the same whichever provider wrote it.
 */
export interface StoredAuditRecord {
  id: string;
  timestamp: string;
  level?: string;
  eventType: string;
  user?: string;
  /** Who actually did it when that is not `user` — under a proxy grant (#1762). */
  actor?: string;
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
 * Normalise an incoming event into the stored record shape (#1119). Runs
 * BEFORE the base stamps the chain: the id and timestamp assigned here are
 * part of what gets hashed, and assigning them afterwards would mean the hash
 * covered a record different from the one written.
 */
export function toStoredAuditRecord(auditEvent: Record<string, unknown>): StoredAuditRecord {
  // AuditEvent may come in different shapes - need flexible property access
  const evt = auditEvent;
  const legacy = auditEvent as unknown as { type?: string; actor?: string; target?: string; action?: string; result?: string; error?: string; data?: Record<string, unknown>; ipAddress?: string; userAgent?: string };
  return {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    level: (evt.level as string) || 'info',
    eventType: (evt.eventType as string) || legacy.type || 'unknown',
    user: (evt.user as string) || legacy.actor || 'anonymous',
    // #1762: who actually did it, beside the account acted on. Kept only
    // alongside a `user` — a legacy record's `actor` IS its user (above).
    ...(evt.user && typeof evt.actor === 'string' && evt.actor ? { actor: evt.actor } : {}),
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
}

/**
 * The owner of the resource a record is about (#1537, #1825): `metadata.owner`,
 * where token, private-store and share records carry it today. Null when the
 * record names none.
 */
export function recordOwner(record: Record<string, unknown>): string | null {
  const owner = (record.metadata as Record<string, unknown> | undefined)?.owner;
  return typeof owner === 'string' && owner ? owner : null;
}

/**
 * Whether a record is about the user `person` (#1537): the user is its `user`
 * (the account acted on, or the user represented under a proxy grant), its
 * `actor` (who actually did it, under a proxy grant), or the owner of the
 * resource it names ({@link recordOwner}). The owner is the user's identity
 * `@id` (`ownerId`) on rows written from #2041 on, and their username on
 * rows written before, which are never rewritten; either matches.
 */
export function recordIsAbout(record: Record<string, unknown>, person: string, ownerId?: string): boolean {
  const owner = recordOwner(record);
  return record.user === person || record.actor === person || owner === person || (Boolean(ownerId) && owner === ownerId);
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
/** What a provider reports about itself. */
export interface AuditReport {
  /** Alteration of a stored record is detectable. Deletion of the tail is not — see #1138. */
  tamperEvident: boolean;
  /** How records reach disk, or null when the provider has not stated it. */
  durability: ProviderDurability | null;
  queryable: boolean;
  /**
   * Where and when the chain head was last published, or null when nothing
   * publishes it (#1138).
   *
   * NOT a boolean. The old `offBox: boolean` was hardcoded `false`, and making
   * it `true` would have been a claim nothing on this machine can establish —
   * no code here can verify that a path leaves the box. So this reports the
   * facts and the reader judges, exactly as `durability` does after #1148.
   *
   * Without a witness, truncation of the tail is undetectable: removing records
   * from the end breaks no link.
   */
  headWitness: {
    destination: string;
    intervalMinutes: number;
    lastPublishedAt: string | null;
    lastSeq: number | null;
  } | null;
  /**
   * Whether the records are encrypted where they are stored (#1537). Stated
   * only by a provider that knows: the database provider reports whether the
   * application database is SQLCipher-encrypted. Absent means not stated.
   */
  encryptedAtRest?: boolean;
}

abstract class BaseAuditProvider extends BaseProvider {
  /** Reference to the wiki engine */
  protected engine: WikiEngine;

  /** Whether provider has been initialized */
  protected initialized: boolean;

  /**
   * Create a new audit provider
   *
   * @constructor
   * @param {WikiEngine} engine - The WikiEngine instance
   * @throws {Error} If engine is not provided
   */
  constructor(engine: WikiEngine) {
    super();
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
      // Inherited from BaseProvider, so a provider states its durability once
      // and every reporting surface sees the same answer. Null means the
      // provider has not stated it — silence rather than a default.
      durability: this.getDurability(),
      queryable: true,
      headWitness: null
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
   * @param ctx - Who authorised it (#1179): the operator's context, never a bare name.
   * @returns The id of the marker record.
   */
  async restartChain(reason: string, ctx: ActorContext): Promise<string> {
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
    const who = actorOf(ctx);
    const prepared = this.prepareRecord({
      eventType: CHAIN_RESTART_EVENT,
      ...who,
      severity: 'high',
      result: 'success',
      action: 'audit-chain-restart',
      metadata: {
        ...who.metadata,
        previousSeq: head?.seq ?? null,
        previousHash: head?.hash ?? null,
        reason: reason.trim(),
        actor: who.user
      }
    });

    const marker = stampRecord(prepared, 1, GENESIS_HASH);

    // #1202: the marker is the action, and it is `critical` — it cannot
    // half-complete. The head moves only once the marker is on disk. Moving it
    // first, as this used to, meant a failed write left the process chaining
    // from a hash that never landed: every later record broken, and the log
    // saying nothing about why.
    const id = await this.writeEvent(marker);

    this.chainSeq = 1;
    this.chainPrevHash = marker.hash as string;

    logger.warn(
      `[audit] CHAIN RESTARTED by ${who.user}: ${reason.trim()}. ` +
      `Abandoned chain head ${head?.hash ?? '(unreadable)'} at seq ${head?.seq ?? '(unknown)'}. ` +
      'The abandoned records remain in the log and remain unverifiable.'
    );

    return id;
  }

  /** #1138: when the chain head was last published, and what was published. */
  private witnessPublishedAtMs: number | null = null;
  private witnessLast: ChainWitness | null = null;

  /**
   * Publish the chain head to the configured destination (#1138), after the
   * records it names are stored — never before, or the next verification
   * would report truncation.
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
  protected async publishChainHead(): Promise<void> {
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
    // it (WikiEngine.ts, MetricsManager.ts, and the Config type). #1138 asked
    // for `applicationname`, which matches nothing — and this field exists
    // precisely so one witness store can hold heads from several instances.
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
        `[${this.constructor.name}] Could not publish the audit chain head to "${destination}": ` +
        `${err instanceof Error ? err.message : String(err)}. Truncation of the log tail is undetectable ` +
        'while no witness is being written.'
      );
    }
  }

  /**
   * Where the chain head is published, or null when nothing publishes it
   * (#1138). Facts, not a claim — see the note on AuditReport.headWitness.
   */
  protected headWitnessReport(): AuditReport['headWitness'] {
    const cm = this.engine?.getManager?.('ConfigurationManager') as {
      getProperty?: (k: string, d: unknown) => unknown;
    } | null;
    const destination = asString(cm?.getProperty?.(WITNESS_DESTINATION_KEY, ''));
    return destination === ''
      ? null
      : {
        destination,
        intervalMinutes: Number(cm?.getProperty?.(WITNESS_INTERVAL_KEY, 60) ?? 60),
        lastPublishedAt: this.witnessLast?.publishedAt ?? null,
        lastSeq: this.witnessLast?.seq ?? null
      };
  }

  /**
   * One export format for every provider: JSON as stored, or CSV through
   * ExportManager's writer — quoting, and no cell a spreadsheet would run as a
   * formula.
   */
  protected formatExport(results: readonly AuditEvent[], format: 'json' | 'csv'): string {
    if (format === 'csv') {
      const exportManager = this.engine.getManager<ExportManager>('ExportManager');
      if (!exportManager) throw new Error(`${this.constructor.name}: CSV export needs ExportManager, which is not registered`);
      const rows = results.map((logEntry) => {
        const log = logEntry as unknown as Record<string, unknown>;
        return [
          log.timestamp,
          log.eventType || log.type,
          log.user || log.actor,
          log.resource || log.target,
          log.action,
          log.result,
          log.severity || 'low',
          log.reason || log.error || ''
        ];
      });
      return exportManager.toCsv(['timestamp', 'eventType', 'user', 'resource', 'action', 'result', 'severity', 'reason'], rows);
    }
    return JSON.stringify(results, null, 2);
  }

  /**
   * The entries about one person, newest first, a page at a time (#1537):
   * those where the person is the `user`, the `actor`, or the resource's
   * owner ({@link recordIsAbout}). A provider that cannot answer says so,
   * rather than returning an empty page that reads as "nothing happened".
   */
  searchEntriesAbout(_person: string, _options: PersonEntriesOptions = {}): Promise<AuditSearchResults> {
    return Promise.reject(new Error(`${this.constructor.name} cannot list the entries about one person`));
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

