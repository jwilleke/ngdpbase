/**
 * Base Manager class - All managers should extend this
 *
 * Following JSPWiki's modular manager pattern, this abstract base class
 * provides common functionality for all managers including initialization,
 * lifecycle management, and backup/restore operations.
 *
 * @class BaseManager
 * @abstract
 *
 * @property {WikiEngine} engine - Reference to the wiki engine
 * @property {boolean} initialized - Flag indicating initialization status
 * @property {Record<string, unknown>} config - Configuration object passed during initialization
 *
 * @see {@link WikiEngine} for the main engine
 */

import logger from '../utils/logger.js';
import { checkConfiguredPath, type PathPreflightResult, type PathPreflightOptions } from '../utils/PathPreflight.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type { ManagerFetchOptions } from '../utils/managerUtils.js';
import { recordAuditEvent } from '../utils/auditEvents.js';
import { AUDIT_EVENT } from '../utils/auditEventNames.js';

/**
 * Backup data structure returned by backup() method
 */
export interface BackupData {
  /** Name of the manager that created this backup */
  managerName: string;

  /** ISO timestamp when backup was created */
  timestamp: string;

  /** Manager-specific backup data */
  data?: unknown;

  /** Provider class name (for managers with providers) */
  providerClass?: string | null;

  /** Provider-specific backup data */
  providerBackup?: unknown;

  /** Optional note about the backup */
  note?: string;

  /** Allow additional properties */
  [key: string]: unknown;
}

/**
 * Base class for all managers
 *
 * Provides common functionality for initialization, lifecycle management,
 * and backup/restore operations.
 */
/**
 * What a manager is doing, uniformly (#1155).
 *
 * Managers already degraded — `preflightConfiguredPath()` existed and 11 of
 * them called it — but each did so in its own way: a log line, a private flag,
 * an early return. Thirteen could end up degraded and exactly ONE reported it
 * anywhere a person could see. So an operator who mistyped
 * `ngdpbase.backup.directory` got backups that silently never ran, an instance
 * answering 302, a readiness probe saying ok, and a dashboard saying nothing.
 *
 * Four values rather than a boolean, because an operator's response differs:
 *
 * - `ready`    — working
 * - `degraded` — configured, wanted, and NOT working. The invisible one
 * - `disabled` — deliberately off; not a problem and must not read as one
 * - `failed`   — could not initialise at all
 *
 * `disabled` versus `degraded` is what decides whether the report is worth
 * reading. A report that warns about features somebody switched off is one
 * nobody reads, and then the real warning is missed with it.
 */
export type ManagerState = 'ready' | 'degraded' | 'disabled' | 'failed';

/**
 * What a manager holds, in one shape (#1006).
 *
 * Three managers already answered versions of this question in three different
 * shapes — `AddonsManager.getStatus()`, `BackgroundJobManager.getStatus()`,
 * `CatalogManager.getSourceInfo()` — so every admin surface rendered a bespoke
 * view per manager, and a manager added later was invisible until somebody
 * wrote another one. That is the drift #762 found from the other direction:
 * three managers existed for weeks without appearing in any inventory, because
 * nothing forced the question.
 */
export interface ManagerStats {
  /**
   * How many items this manager holds.
   *
   * __Omitted, not zero__, when the manager holds no countable collection.
   * `RenderingManager` and `VariableManager` hold behaviour and configuration;
   * reporting `0` for them would read as "empty" rather than "not applicable".
   */
  count?: number;
  /** Most recent write, ISO 8601. Omitted when the manager does not track it. */
  lastModified?: string;
  /** Whether the manager considers itself operational. Derived from #1155's state. */
  healthy: boolean;
  /** One short line for an admin row. __Never item contents.__ */
  summary?: string;
}

export interface ManagerStatus {
  state: ManagerState;
  /** What is wrong, in one line an operator can act on. Absent when ready. */
  reason?: string;
  /** The config key at fault, when there is one, so the admin UI can link to it. */
  configKey?: string;
}

abstract class BaseManager {
  /** Reference to the wiki engine */
  protected engine: WikiEngine;

  /** Initialization status flag */
  protected initialized: boolean;

  /** Configuration passed during initialization */
  protected config?: Record<string, unknown>;

  /** What this manager is doing (#1155). Ready until something says otherwise. */
  private status: ManagerStatus = { state: 'ready' };

  /**
   * Short description of what this manager does.
   * Used by admin UIs, addon registries, and introspection tools.
   * Override in subclasses to provide a human-readable description.
   */
  readonly description?: string;

  /**
   * Creates a new BaseManager instance
   *
   * @param engine - The wiki engine instance
   *
   * @example
   * class MyManager extends BaseManager {
   *   constructor(engine: WikiEngine) {
   *     super(engine);
   *     this.myData = new Map();
   *   }
   * }
   */
  constructor(engine: WikiEngine) {
    this.engine = engine;
    this.initialized = false;
  }

  /**
   * Initialize the manager with configuration
   *
   * Override this method in subclasses to perform initialization logic.
   * Always call super.initialize() first in overridden implementations.
   *
   * @param config - Configuration object
   *
   * @example
   * async initialize(config: Record<string, any> = {}): Promise<void> {
   *   await super.initialize(config);
   *   // Your initialization logic here
   *   console.log('MyManager initialized');
   * }
   */

  async initialize(config: Record<string, unknown> = {}): Promise<void> {
    this.config = config;
    this.initialized = true;
  }

  /**
   * Check if manager has been initialized
   *
   * @returns True if manager is initialized
   *
   * @example
   * if (manager.isInitialized()) {
   *   // Safe to use manager
   * }
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get the wiki engine instance
   *
   * @returns The wiki engine instance
   *
   * @example
   * const config = this.getEngine().getConfig();
   */
  getEngine(): WikiEngine {
    return this.engine;
  }

  protected invalidateHandlerCache(pageUuid: string): void {
    const pm = this.engine.getManager<{ invalidatePageCache(id: string): void }>('PageManager');
    if (pm) {
      pm.invalidatePageCache(pageUuid);
    }
  }

  /**
   * Preflight a configured filesystem path before any mkdir/write happens.
   *
   * Wraps `checkConfiguredPath()` with a standardized warning log that names
   * the manager (`this.constructor.name`) and the originating config key.
   * Useful for paths that may live on volumes the OS has unmounted (notably
   * macOS `/Volumes/<X>/...`), where `fs.ensureDir` would otherwise crash
   * the engine with an opaque `EACCES`.
   *
   * The caller decides what to do on failure (degrade, fall back to a
   * default, or treat as fatal).
   *
   * @param configKey  The config key that supplied this path — included in
   *                   the warning so operators know what to fix.
   * @param path       The resolved path to check.
   * @returns          The preflight result. `result.ok === true` means safe
   *                   to proceed.
   *
   * @example
   * const preflight = this.preflightConfiguredPath(
   *   'ngdpbase.backup.directory',
   *   this.backupDirectory
   * );
   * if (!preflight.ok) {
   *   // degrade — disable feature, fall back to default, etc.
   *   return;
   * }
   */
  protected preflightConfiguredPath(
    configKey: string,
    path: string | null | undefined,
    options: PathPreflightOptions = {}
  ): PathPreflightResult {
    // `options` carries only test seams (see PathPreflight). It is threaded
    // through so the degraded-state path can be exercised on any platform:
    // the underlying check runs on darwin alone, so on Linux CI this branch
    // was unreachable and the test asserting it failed on every run.
    const result = checkConfiguredPath(path, options);
    if (!result.ok) {
      logger.warn(
        `⚠️  ${this.constructor.name}: ${result.message} ` +
        `(config key: ${configKey}).`
      );
      // #1155: recorded, not only logged. This is the common entry point every
      // degrading manager already goes through, so setting the state here is
      // what makes twelve invisible degradations visible without each caller
      // remembering to say so.
      this.markDegraded(result.message ?? 'the configured path could not be used', configKey);
    }
    return result;
  }

  /**
   * What this manager is doing (#1155).
   *
   * Not `getStatus()`: that name is already taken by `AddonsManager` and
   * `BackgroundJobManager` for entirely different things, and a base-class
   * method silently overridden by two subclasses would be worse than a longer
   * name.
   */
  getManagerStatus(): ManagerStatus {
    return { ...this.status };
  }

  /**
   * Record that this manager is configured, wanted, and not working.
   *
   * @returns true when this is a TRANSITION — a state or reason that differs
   *   from the current one. Only a transition is an event: a manager that
   *   starts degraded and stays degraded must not re-emit on every boot, or
   *   the signal is buried in its own noise.
   */
  protected markDegraded(reason: string, configKey?: string): boolean {
    return this.transition({ state: 'degraded', reason, configKey });
  }

  /** Record that this manager is deliberately off. Not a problem (#1155). */
  protected markDisabled(reason: string): boolean {
    return this.transition({ state: 'disabled', reason });
  }

  /** Record that this manager could not initialise at all (#1155). */
  protected markFailed(reason: string, configKey?: string): boolean {
    return this.transition({ state: 'failed', reason, configKey });
  }

  /**
   * Record that this manager is working.
   *
   * Clears the reason rather than leaving a stale one behind — a recovered
   * manager still carrying "the directory is not writable" is a worse lie than
   * no reason at all.
   */
  protected markReady(): boolean {
    return this.transition({ state: 'ready' });
  }

  /**
   * Apply a state and audit it if it CHANGED.
   *
   * Only a transition is an event. A manager that starts degraded and stays
   * degraded must not re-emit on every boot, or the signal is buried in its
   * own noise — and the at-boot picture is already carried by #1149's
   * `system-start` record.
   *
   * Emitted from here rather than each manager, per the #1120 rule: a producer
   * that has to remember to call something can be correct, but can never be
   * PROVABLE.
   */
  private transition(next: ManagerStatus): boolean {
    const changed = this.status.state !== next.state || this.status.reason !== next.reason;
    this.status = next;
    if (!changed) return false;

    // Fire-and-forget. Refusing to degrade because the record could not be
    // written would take an instance down over a feature that is already
    // broken, which is the wrong way round.
    void recordAuditEvent(
      this.engine?.getManager?.('AuditManager'),
      {
        eventType: AUDIT_EVENT.MANAGER_STATE_CHANGE,
        user: 'system',
        ipAddress: undefined,
        action: 'manager-state-change',
        result: 'success',
        severity: next.state === 'degraded' || next.state === 'failed' ? 'high' : 'low',
        metadata: {
          manager: this.constructor.name,
          state: next.state,
          ...(next.reason ? { reason: next.reason } : {}),
          ...(next.configKey ? { configKey: next.configKey } : {})
        }
      }
    );
    return true;
  }

  /**
   * Shutdown the manager and cleanup resources
   *
   * Override this method in subclasses to perform cleanup logic.
   * Always call super.shutdown() at the end of overridden implementations.
   *
   * @example
   * async shutdown(): Promise<void> {
   *   // Your cleanup logic here
   *   await this.closeConnections();
   *   await super.shutdown();
   * }
   */
  async shutdown(): Promise<void> {
    this.initialized = false;
  }

  /**
   * Backup manager data
   *
   * MUST be overridden by all managers that manage persistent data.
   * Default implementation returns an empty backup object.
   *
   * @returns Backup data object containing all manager state
   * @throws {Error} If backup operation fails
   *
   * @example
   * async backup(): Promise<BackupData> {
   *   return {
   *     managerName: this.constructor.name,
   *     timestamp: new Date().toISOString(),
   *     data: {
   *       users: Array.from(this.users.values()),
   *       settings: this.settings
   *     }
   *   };
   * }
   */
  async backup(): Promise<BackupData> {
    // Default implementation returns empty object
    // Managers with data MUST override this method
    return {
      managerName: this.constructor.name,
      timestamp: new Date().toISOString(),
      data: null
    };
  }

  /**
   * Restore manager data from backup
   *
   * MUST be overridden by all managers that manage persistent data.
   * Default implementation only validates that backup data is provided.
   *
   * @param backupData - Backup data object from backup() method
   * @throws {Error} If restore operation fails or backup data is missing
   *
   * @example
   * async restore(backupData: BackupData): Promise<void> {
   *   if (!backupData || !backupData.data) {
   *     throw new Error('Invalid backup data');
   *   }
   *   this.users = new Map(backupData.data.users.map(u => [u.id, u]));
   *   this.settings = backupData.data.settings;
   * }
   */
  async restore(backupData: BackupData): Promise<void> {
    // Default implementation does nothing
    // Managers with data MUST override this method
    if (!backupData) {
      throw new Error(`${this.constructor.name}: No backup data provided for restore`);
    }
  }

  /**
   * Return a plain-text string suitable for use as MarqueePlugin banner text.
   *
   * Override in subclasses to expose live manager data as a scrolling banner:
   *
   *   [{MarqueePlugin fetch='PageManager.toMarqueeText()'}]
   *   [{MarqueePlugin fetch='PageManager.toMarqueeText(limit=5,sort=date-desc)'}]
   *
   * The default returns '' (no output). Subclasses should return a concise,
   * single-line summary. Common options (limit, sortBy, sortOrder, since, before)
   * are available via ManagerFetchOptions; domain-specific keys are read directly
   * from the raw options object passed by the caller.
   *
   * @param _options  Parsed fetch args from the plugin invocation.
   * @returns Plain text, or '' if this manager has nothing to display.
   *
   * @example
   * async toMarqueeText(options: ManagerFetchOptions = {}): Promise<string> {
   *   const pages = await this.getRecentChanges(options.limit ?? 5);
   *   return 'Recent: ' + pages.map(p => p.name).join('  •  ');
   * }
   */
  async toMarqueeText(_options: ManagerFetchOptions = {}): Promise<string> {
    return '';
  }

  /**
   * What this manager holds (#1006).
   *
   * __Counts and health only — never item contents.__ That is the whole safety
   * property, and it is why this is not the `getAll()` the question originally
   * asked for. `AgentTokenManager` holds bearer credentials, `UserManager`
   * holds users, `ShareManager` holds capability tokens; a generic enumeration
   * on the base class means the first generic caller — an admin dump panel, a
   * search indexer, a debug route — reaches all of it by default. A count
   * cannot leak what it counts.
   *
   * Optional by override, with a safe default, exactly like `backup()` and
   * `toMarqueeText()` above. A manager holding no countable collection omits
   * `count` rather than reporting `0`, because "nothing to count" and "none"
   * are different answers and an admin row that shows `0` for
   * `RenderingManager` is noise.
   *
   * __Never throws.__ A broken manager reports `healthy: false`; it does not
   * take down the page rendering every other manager. The base wraps nothing,
   * so an override that can fail must catch its own errors — see the note on
   * `safeGetManagerStats()`.
   *
   * __Named `getManagerStats`, not `getStats`.__ Two managers already have a
   * `getStats()` returning their own domain shape — `FilterManager` (pipeline
   * statistics, #615) and `NotificationManager` (`NotificationStats`, read by
   * a live route). Both are correct for what they do, and taking the name from
   * them would either break those callers or leave `getStats()` meaning two
   * different things depending on the manager, which is the exact confusion
   * this contract exists to remove. A generic caller needs a name that means
   * one thing everywhere.
   *
   * @example
   * async getManagerStats(): Promise<ManagerStats> {
   *   const active = this.list('').filter((r) => !r.revokedAt);
   *   return { ...await super.getManagerStats(), count: active.length };
   * }
   */
  async getManagerStats(): Promise<ManagerStats> {
    return {
      // #1155 already answers "is this manager working", with four states and
      // a reason. Re-deriving health from `isInitialized()` here would put a
      // second, weaker source of truth next to it — a manager could be
      // initialised and degraded, and the two answers would disagree with
      // nothing to reconcile them. So this is the SAME fact, narrowed for a
      // one-line admin row; a caller wanting why asks getManagerStatus().
      healthy: this.getManagerStatus().state === 'ready'
    };
  }

  /**
   * `getManagerStats()` that cannot break the page it is rendered on.
   *
   * The contract says an override must not throw, and saying so does not make
   * it true — an override reads a store, and a store can fail. This is what an
   * admin surface iterating every manager should call: one manager throwing
   * becomes one unhealthy row rather than a 500 for all of them.
   */
  async safeGetManagerStats(): Promise<ManagerStats> {
    try {
      return await this.getManagerStats();
    } catch (err) {
      return {
        healthy: false,
        summary: `stats unavailable: ${err instanceof Error ? err.message : String(err)}`
      };
    }
  }
}

export default BaseManager;

