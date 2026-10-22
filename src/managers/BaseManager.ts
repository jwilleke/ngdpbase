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
import type { FormOption } from '../utils/pluginFormatters.js';
import { recordAuditEvent } from '../utils/auditEvents.js';
import { AUDIT_EVENT } from '../utils/auditEventNames.js';
import type { ActorContext } from '../context/ActorContext.js';

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

  /**
   * Parts of this manager's backup that failed while the rest was written
   * (#1723) — a database that could not be copied, say. BackupManager tells the
   * admins about each one: a backup is never silently partial.
   */
  warnings?: string[];

  /** Allow additional properties */
  [key: string]: unknown;
}

/**
 * What BackupManager hands each manager's `backup()` (#1723): who asked, and
 * where the backup document is being written. A manager whose data is too
 * large for the JSON document (the databases) writes its own files into
 * `directory`, each named `<stem>.<something>`, and references them from its
 * entry; BackupManager prunes them with the document.
 */
export interface ManagerBackupOptions {
  ctx: ActorContext;
  /** The backup directory the document is written to. */
  directory: string;
  /** The document's filename without `.json.gz` / `.json`. */
  stem: string;
  /**
   * The backup a restore takes of the live data first (#1892 D2). A database
   * that can't be opened is left out and recorded in the manager's data, not
   * failed: the restore keeps its file beside the restored one instead.
   */
  safetyBackup?: boolean;
  /**
   * One more archive beside the document, named and keyed by BackupManager
   * (#1985), for a manager whose files are not a declared folder. A declared
   * folder or file (`backupFolders()`) needs none of this.
   */
  archive?: (part: string) => BackupArchiveTarget;
}

/**
 * A folder or file part's record in a manager's entry of the backup document
 * (#1876, #1985): the archive beside the document and what it holds. The
 * shape every backup since v5.21 writes; a restore reads it as it is.
 */
export interface BackupPartRecord {
  format: 1;
  /** The archive beside the document: `<stem>.<part>.tar`, or `.tar.enc` when encrypted. */
  archive: string;
  files: number;
  bytes: number;
  /** `backupKeyFingerprint()` of the key the archive is encrypted under; absent when it is not encrypted. */
  keyFingerprint?: string;
}

/**
 * A folder a manager keeps its data in (#1985): BackupManager archives it
 * beside the backup document, stages it in a site restore, and puts the
 * staged copy in place at the next start before the manager reads it.
 */
export interface BackupFolderPart {
  /** The archive's name: `<stem>.<part>.tar` (`.tar.enc` under the backup key). Never change it: old backups are matched by it. */
  part: string;
  /** The folder, resolved; null when this site has none configured. */
  folder: string | null;
  /** Leave out a path relative to the folder, in posix form (job state's slot locks). */
  exclude?: (relative: string) => boolean;
  /**
   * A backup with no record of this part stages nothing for it, and the
   * restore names it as not restored. Without it such a backup refuses the
   * whole site restore (one taken before the part was backed up).
   */
  optional?: boolean;
}

/**
 * One file a manager keeps its data in (#1985): the credentials store. As a
 * folder, but the archive holds the one file.
 */
export interface BackupFilePart {
  part: string;
  /** The file, resolved; null when this site has none configured. */
  file: string | null;
  /** How the backup and the log name it ("credentials store"). */
  what: string;
  /** Only ever backed up encrypted: without the backup key it is left out, with a warning (#1876). */
  requireKey?: boolean;
  /** Staged in its place when the file was absent at backup time, so the restore still puts the site back as it was. */
  whenAbsent: string;
  optional?: boolean;
}

/** What a manager declares as its data (#1985). */
export type BackupFolder = BackupFolderPart | BackupFilePart;

/**
 * One more archive beside the backup document, named and keyed by
 * BackupManager (#1985): for a manager whose files are not one declared
 * folder (the attachment pool and vaults, the audit log among the
 * application logs). Encrypted under the backup key when it is set.
 */
export interface BackupArchiveTarget {
  /** Its file name, `<stem>.<part>.tar` or `.tar.enc`: what the entry records. */
  archive: string;
  /** Where to write it. */
  path: string;
  backupKey?: string;
  keyFingerprint?: string;
}

/** What a staged restore of a manager's declared parts did at this start (#1985). */
export interface StagedRestoreAtStart {
  /** Each live path now restored, with where its previous content was kept. */
  applied: Array<{ live: string; kept: string }>;
  /** Why nothing (or, after a failed rename, not everything) was applied. */
  refused?: string;
  /** When the backup it came from was taken. */
  backupTakenAt?: string;
}

/** What BackupManager hands each manager's `restore()` (#1723): who asked, and the directory the backup document was read from. */
export interface ManagerRestoreOptions {
  ctx: ActorContext;
  directory: string;
  /** The backup document's filename. */
  source?: string;
  /**
   * Replace what an earlier restore staged and the restart has not applied
   * yet (#1723, D5). Without it a manager that stages refuses, so a staged
   * restore is never replaced silently.
   */
  replaceStaged?: boolean;
  /** The backup of the live data BackupManager took just before this restore (#1723, D6), by filename. */
  safetyBackup?: string;
  /**
   * The site restore manifest this restore is staged under (#1876). A
   * manager whose restore is staged (`restoreIsStaged()`) stages its files
   * beside its live ones and records its part there; the next start applies
   * every part or none (`src/utils/siteRestore.ts`).
   */
  siteRestore?: string;
  /**
   * An archive the backup names, checked by BackupManager (#1985): a bare
   * file name in the backup directory, read under the key its fingerprint
   * names. Throws, naming `manager`, for anything else. For a manager that
   * stages its own files (attachments, the audit log).
   */
  readArchive?: (manager: string, archive: unknown, keyFingerprint: string | undefined) => { path: string; backupKey?: string };
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
 * What a `degraded` or `failed` state means for the person reading it (#1946).
 *
 * - `outage`    — the feature is NOT working: what it provides is not happening
 * - `attention` — the feature works, but an administrator has something to do:
 *   save the backup key off the server, fix a mistyped value that is read as
 *   false, move vault files in. Telling them their backups are "silently doing
 *   nothing" while backups run is a false alarm, and false alarms teach people
 *   to skip the real one.
 *
 * Declared where the state is set (`markDegraded` versus `markNeedsAttention`),
 * never inferred from the reason's wording.
 */
export type DegradedKind = 'outage' | 'attention';

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
  /** Whether the feature is down or works but needs an admin (#1946). Present when degraded or failed. */
  kind?: DegradedKind;
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
    // #1985: before anything is read, and before the manager counts as started.
    await this.applyStagedBackupParts();
    this.initialized = true;
  }

  /**
   * Where this manager keeps its data as folders or files (#1985): declared,
   * never backed up by hand. BackupManager archives each beside the backup
   * document (`<stem>.<part>.tar`), stages it in a site restore, and puts the
   * staged copy in place at the next start, in `initialize()` above, before
   * the subclass reads it. Resolved from the configuration, so it can be
   * answered before the subclass's own `initialize()` has run. Default none.
   *
   * A manager with data in the document as well keeps its `backup()`; a
   * declared part's record goes beside that data (`data[part]`), or is the
   * entry's `data` when the manager has none and declares one part.
   */
  backupFolders(): BackupFolder[] {
    return [];
  }

  /** What putting a staged restore of the declared parts in place did at this start, or null (#1985). */
  private stagedRestore: StagedRestoreAtStart | null = null;

  /** What this start did with a staged restore of this manager's declared parts (#1985): null when there was none. */
  protected stagedRestoreAtStart(): StagedRestoreAtStart | null {
    return this.stagedRestore;
  }

  /**
   * The name this manager is registered under: a staged part is recorded by
   * it. Its class name when it is not registered (a test).
   */
  private registeredName(): string {
    const engine = this.engine as { getRegisteredManagers?(): string[]; getManager?(name: string): unknown } | undefined;
    const names = typeof engine?.getRegisteredManagers === 'function' ? engine.getRegisteredManagers() : [];
    return names.find((n) => engine?.getManager?.(n) === this) ?? this.constructor.name;
  }

  /**
   * #1985: a staged site restore of the declared parts goes in before the
   * subclass reads them. BackupManager's own step, reached through its
   * module (BackupManager starts after most managers); loaded only when there
   * is something declared. A part not applied is said on the dashboard.
   */
  private async applyStagedBackupParts(): Promise<void> {
    let declared: BackupFolder[];
    try {
      declared = this.backupFolders();
    } catch (err) {
      logger.error(`[${this.constructor.name}] Its backup folders could not be read, so a staged restore of them was not checked: ${(err as Error).message}`);
      return;
    }
    if (declared.length === 0) return;
    const { applyStagedPartsAtStart } = await import('./BackupManager.js');
    this.stagedRestore = applyStagedPartsAtStart(this.engine, this.registeredName(), declared);
    if (this.stagedRestore?.refused) {
      this.markNeedsAttention(`A staged restore of ${declared.map((d) => d.part).join(', ')} was not applied: ${this.stagedRestore.refused}`);
    }
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

  /** A page's data changed outside savePage: its cached content goes, and every cached render re-renders (#1751). */
  protected invalidateHandlerCache(pageUuid: string): void {
    this.engine.getManager<{ invalidatePageCache(id: string): void }>('PageManager')?.invalidatePageCache(pageUuid);
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
    return this.transition({ state: 'degraded', reason, configKey, kind: 'outage' });
  }

  /**
   * Record that this manager works, but an administrator has something to do
   * (#1946). Still `degraded` — it stays on the dashboard, is audited, and
   * clears with `markReadyIfDegradedBy` — but shown as needing attention, not
   * as down.
   */
  protected markNeedsAttention(reason: string, configKey?: string): boolean {
    return this.transition({ state: 'degraded', reason, configKey, kind: 'attention' });
  }

  /** Record that this manager is deliberately off. Not a problem (#1155). */
  protected markDisabled(reason: string): boolean {
    return this.transition({ state: 'disabled', reason });
  }

  /** Record that this manager could not initialise at all (#1155). */
  protected markFailed(reason: string, configKey?: string): boolean {
    return this.transition({ state: 'failed', reason, configKey, kind: 'outage' });
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
   * Record that this manager is working again, but only while it is still
   * degraded for `reason` — the one a check set, now cleared by re-running
   * it (#1842). A different fault set since stays reported.
   */
  protected markReadyIfDegradedBy(reason: string): boolean {
    if (this.status.state !== 'degraded' || this.status.reason !== reason) return false;
    return this.markReady();
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
    const changed = this.status.state !== next.state || this.status.reason !== next.reason || this.status.kind !== next.kind;
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
  async backup(_options?: ManagerBackupOptions): Promise<BackupData> {
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
  async restore(backupData: BackupData, _options?: ManagerRestoreOptions): Promise<void> {
    // Default implementation does nothing
    // Managers with data MUST override this method
    if (!backupData) {
      throw new Error(`${this.constructor.name}: No backup data provided for restore`);
    }
  }

  /**
   * Whether this manager's `restore()` stages for the next start instead of
   * writing into the running site (#1723, #1876). BackupManager stages every
   * such manager in a site restore together, all or nothing, after a backup
   * of the live data. The default: true when it declares folders or files
   * (#1985), which BackupManager stages; otherwise false, the restore writes
   * live.
   */
  restoreIsStaged(): boolean {
    try {
      return this.backupFolders().length > 0;
    } catch {
      return false;
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
   * @param _viewer   The viewer's context (#1556): show only what they may see.
   *                  Page text reaches this method, and only this method, on
   *                  every render for every viewer.
   * @returns Plain text, or '' if this manager has nothing to display.
   *
   * @example
   * async toMarqueeText(options: ManagerFetchOptions = {}): Promise<string> {
   *   const pages = await this.getRecentChanges(options.limit ?? 5);
   *   return 'Recent: ' + pages.map(p => p.name).join('  •  ');
   * }
   */
  async toMarqueeText(_options: ManagerFetchOptions = {}, _viewer?: unknown): Promise<string> {
    return '';
  }

  /**
   * Return the choices for a form dropdown, for the forms add-on's
   * `"optionsSource": "fetch:ManagerName.toFormOptions(list=funds)"`.
   *
   * The same convention and the same safety rules as `toMarqueeText()`: it is
   * the one other method page content may reach (`resolveManagerOptions`), it
   * runs on every render for every viewer, and it must have no side effect.
   * Offer only what `_viewer` may see. The forms add-on calls it again when the
   * form is submitted and refuses a value that is not among the choices.
   *
   * @param _options  Parsed args from the spec, as raw `{ key: value }` strings.
   * @param _viewer   The viewer's context.
   * @returns `{ value, label }` choices (plain strings are accepted too), or `[]`.
   */
  async toFormOptions(_options: Record<string, string> = {}, _viewer?: unknown): Promise<FormOption[]> {
    return [];
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

