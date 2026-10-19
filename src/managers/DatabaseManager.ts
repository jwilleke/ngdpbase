/**
 * DatabaseManager — the one door to the application database (#1536).
 *
 * Ported from yourPHR (yourphr#617), where it is in production. A manager that
 * stores rows is handed this connection through `getHandle()`; nothing opens a
 * database handle of its own.
 *
 * `ngdpbase.database.provider` chooses the provider:
 *   - `none` (the default) — no database is opened. Nothing in core stores rows
 *     yet; the first will be the database audit provider (#1537). Opening a file
 *     with no reader would only add a way to fail at boot — on a data volume
 *     that is a network filesystem, for instance.
 *   - `sqlite` — one file at `ngdpbase.database.file`, encrypted with SQLCipher
 *     when `NGDPBASE_DATABASE_KEY` is set (in the environment or the instance
 *     `.env`), never from config. Without a key it opens unencrypted and says so.
 *
 * The database is refused, naming the cause, when the file would sit on a
 * network filesystem, when the schema is from a newer build, when a migration
 * fails, when the key is missing or wrong, or when the integrity check does
 * not pass. The process stays up (#1892): the site starts in maintenance mode
 * and administrators are told the fix (`getUnavailableReason`).
 *
 * An add-on that keeps rows gets a database of its own the same way
 * (`openAddonDatabase`, ngdp-accounting-addons#13): its own file beside the
 * application database, opened by the same provider under the same key, with
 * its own migration ledger. A dependent add-on adds its ledger to that file.
 * Only a declared database is opened (#1860): the add-on names it in its own
 * config/default-config.json (`ngdpbase.addons.<slug>.database`), and one
 * declared `encrypt: "required"` is never opened without the key.
 *
 * Backup and restore (#1723): `backup()` and `restore()` are the ones
 * BackupManager calls on every manager, so add-ons write no backup code. A
 * backup copies the application database and every declared add-on database,
 * on or off, at one point in time, on a worker thread, each into its own file
 * beside BackupManager's document, encrypted under `NGDPBASE_BACKUP_KEY`. A
 * restore stages `<file>.staged` beside each database, all or nothing, and the
 * next start puts them in place before any database opens.
 */
import path from 'node:path';
import BaseManager from './BaseManager.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';
import type BaseDatabaseProvider from '../providers/BaseDatabaseProvider.js';
import SqliteDatabaseProvider, { DEFAULT_BUSY_TIMEOUT_MS } from '../providers/SqliteDatabaseProvider.js';
import DATABASE_MIGRATIONS from '../providers/databaseMigrations.js';
import type { Migration } from '../providers/sqliteMigrations.js';
import { createHmac } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { actorOf, type ActorContext } from '../context/ActorContext.js';
import { recordAuditEvent } from '../utils/auditEvents.js';
import { AUDIT_EVENT } from '../utils/auditEventNames.js';
import type { BackupData, ManagerBackupOptions, ManagerRestoreOptions } from './BaseManager.js';
import logger from '../utils/logger.js';
import { ADDON_SLUG, ledgerPrefix, type AddonDatabaseDeclaration } from '../utils/addonDatabaseRules.js';
import { sitePublicMessage } from '../utils/startupState.js';
import {
  applyStagedRestore, manifestPath, runOffThread, stagedPath, writeManifest,
  type ApplyOutcome, type DatabaseExport, type DatabaseStage, type StagedRestoreManifest
} from '../providers/sqliteBackup.js';

/** The environment variable holding the SQLCipher key. Never a config key: config is readable from the admin screens. */
export const DATABASE_KEY_ENV = 'NGDPBASE_DATABASE_KEY';

/**
 * The environment variable holding the key every database backup is encrypted
 * under (#1723). Its own secret, not the database key: the copy that travels
 * and the copy that stays should not fall to the same compromise. Never a
 * config key. Unset, no database is backed up, and admins are told.
 */
export const BACKUP_KEY_ENV = 'NGDPBASE_BACKUP_KEY';

/** How long a database backup or restore staging may run on its worker before it is stopped, when not configured. */
export const DEFAULT_BACKUP_WORKER_TIMEOUT_MS = 3_600_000;

/**
 * A short fingerprint of a backup key (#1723, D3): the first 16 hex digits of
 * an HMAC of a fixed label under the key. Recorded in each backup so a restore
 * under another key says so plainly; it never reveals the key.
 */
export function backupKeyFingerprint(key: string): string {
  return createHmac('sha256', key).update('ngdpbase backup key fingerprint v1').digest('hex').slice(0, 16);
}

/** The backup's name for the application database; an add-on's is `addon-<owner>`. */
const APPLICATION = 'application';
const addonName = (owner: string): string => `addon-${owner}`;

/** One database in a backup, as DatabaseManager's entry in the backup document lists it. */
export interface DatabaseBackupEntry {
  /** `application`, or `addon-<owner>`. */
  name: string;
  kind: 'application' | 'addon';
  owner?: string;
  /** The encrypted file beside the backup document: `<stem>.<name>.db`. */
  file: string;
  sizeBytes: number;
  tables: number;
}

/** DatabaseManager's `data` in a backup document. */
export interface DatabaseBackupData {
  format: 1;
  /** `backupKeyFingerprint()` of the key the files are encrypted under. */
  keyFingerprint?: string;
  databases: DatabaseBackupEntry[];
  /** Declared databases with no file yet (an add-on that never opened it). */
  absent: string[];
  /** Databases that could not be copied; the backup carries the others. */
  failed: Array<{ name: string; error: string }>;
  /**
   * #1892 D2: in a restore's safety backup taken while the application
   * database can't be opened, the databases left out and why. The restore
   * keeps their files beside the restored ones, as `*.pre-restore`.
   */
  leftOut?: { databases: string[]; reason: string };
}

interface BackupSource {
  name: string;
  kind: 'application' | 'addon';
  owner?: string;
  file: string;
}

type Fault = 'backup-key' | 'restore';

/** What an add-on hands over to have its database opened and migrated. */
export interface AddonDatabaseOptions {
  /** Dated migrations, strictly ascending by id — the same rules as core's ledger. */
  migrations: Migration[];
  /** Where the applied ids are recorded. Must start with the owner's slug (dashes as underscores) and `_`. */
  ledgerTable: string;
}

/** A declared add-on database as Admin → Add-ons and the backup (#1723) see it. */
export interface DeclaredAddonDatabase extends AddonDatabaseDeclaration {
  /** `<owner>.db` beside the application database; null when no application database is configured. */
  file: string | null;
  /** Whether this declaration's ledger is open in this process. */
  open: boolean;
}

/**
 * The request rules (addonDatabaseRules): the owner is a canonical slug, and
 * the ledger table starts with its prefix. `openAddonDatabase` applies them,
 * and so does the test kit's in-memory database
 * (`@jwilleke/ngdpbase-types/testing`, #1865), so a test refuses what a site
 * refuses.
 */
export function checkAddonDatabaseRequest(owner: string, options: AddonDatabaseOptions): void {
  if (!ADDON_SLUG.test(owner)) {
    throw new Error(`'${owner}' is not an add-on slug — lowercase letters and digits, single dashes (ngdp-accounting-addons#13)`);
  }
  const prefix = ledgerPrefix(owner);
  if (!options.ledgerTable.startsWith(prefix)) {
    throw new Error(`Add-on '${owner}': migration ledger table '${options.ledgerTable}' must start with '${prefix}' (ngdp-accounting-addons#13)`);
  }
}

/**
 * The declaration of this owner's ledger among `declarations`, or a refusal
 * naming what is missing (#1860). `openAddonDatabase` asks it of the site's
 * declarations; the test kit asks it of the add-on's own (#1865).
 */
export function addonDatabaseDeclarationFor(declarations: readonly AddonDatabaseDeclaration[], owner: string, ledgerTable: string): AddonDatabaseDeclaration {
  const forOwner = declarations.filter((d) => d.owner === owner);
  const declaration = forOwner.find((d) => d.ledgerTable === ledgerTable);
  if (!declaration) {
    throw new Error(forOwner.length === 0
      ? `No add-on declares database '${owner}' — declare ngdpbase.addons.<slug>.database { owner, ledgerTable, encrypt } in the add-on's config/default-config.json (#1860)`
      : `Database '${owner}' is declared, but not with ledger '${ledgerTable}' — the add-on that opens it declares that ledger (#1860)`);
  }
  if (!declaration.enabled) {
    throw new Error(`Database '${owner}' ledger '${ledgerTable}' is declared by add-on '${declaration.declaredBy}', which is turned off or not loaded (#1860)`);
  }
  return declaration;
}

interface AddonDatabase {
  provider: SqliteDatabaseProvider;
  ledgers: Set<string>;
}

class DatabaseManager extends BaseManager {
  private provider: BaseDatabaseProvider | null = null;
  private databaseFile: string | null = null;
  private busyTimeoutMs = DEFAULT_BUSY_TIMEOUT_MS;
  private readonly addonDatabases = new Map<string, AddonDatabase>();
  /** What the start did with a staged restore (#1723), reported once the notifications exist. */
  private restoreAtStart: ApplyOutcome | null = null;
  /** Why this manager is degraded, one entry per cause, so one cause clearing leaves the others. */
  private readonly faults = new Map<Fault, string>();
  /** Why the configured application database could not be opened safely (#1892); null otherwise. */
  private unavailable: string | null = null;

  constructor(engine: WikiEngine) {
    super(engine);
  }

  async initialize(config: Record<string, unknown> = {}): Promise<void> {
    await super.initialize(config);
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const configured = configManager?.getProperty('ngdpbase.database.provider', 'none');
    const kind = (typeof configured === 'string' ? configured : 'none').toLowerCase();

    if (kind === 'none') {
      logger.info('[DatabaseManager] No application database (ngdpbase.database.provider is none)');
      return;
    }
    if (kind !== 'sqlite' || !configManager) {
      throw new Error(`ngdpbase.database.provider '${kind}' is not a database provider — use 'sqlite' or 'none' (#1536)`);
    }

    const busy = configManager.getProperty('ngdpbase.database.busy-timeout-ms', DEFAULT_BUSY_TIMEOUT_MS);
    if (typeof busy !== 'number' || !Number.isInteger(busy) || busy < 0) {
      throw new Error(`ngdpbase.database.busy-timeout-ms must be a whole number of milliseconds, 0 or more — got ${JSON.stringify(busy)} (#1710)`);
    }
    this.busyTimeoutMs = busy;

    const file = configManager.getResolvedDataPath('ngdpbase.database.file', './data/ngdpbase.db');
    const key = process.env[DATABASE_KEY_ENV] ?? '';
    // Known even when it does not open (#1892): a staged restore stays visible and cancellable.
    this.databaseFile = file;
    // #1723: a staged restore goes in now, before any database opens.
    try {
      this.applyRestoreAtStart(file);
    } catch (err) {
      this.markUnavailable(`A staged database restore could not be put in place: ${(err as Error).message}. ` +
        'No database was opened. Some databases may already be restored: each one moved is kept beside it as *.pre-restore, and the rest are still *.staged beside ' +
        `${path.basename(manifestPath(file))}. Stop the server, put the files back as they should be, and restart (#1892)`);
      return;
    }
    // #1892: a database that cannot be opened safely (no key or the wrong key
    // on an encrypted file, a damaged file, a failed migration, a newer
    // schema) does not stop the process: the site starts in maintenance mode.
    // The provider checks integrity before it writes anything, and a failed
    // migration is rolled back.
    let provider: SqliteDatabaseProvider;
    try {
      provider = new SqliteDatabaseProvider(file, key, DATABASE_MIGRATIONS, 'schema_migrations', { busyTimeoutMs: this.busyTimeoutMs });
    } catch (err) {
      this.markUnavailable(DatabaseManager.openFailure(file, (err as Error).message, key));
      return;
    }
    this.provider = provider;

    const { applied, skipped } = provider.migrations;
    logger.info(`[DatabaseManager] Opened ${file} (${key ? 'encrypted' : 'NOT encrypted'}, lock wait ${this.busyTimeoutMs} ms) — migrations applied ${applied.length}, already present ${skipped}`);
    if (!key) {
      logger.warn(`[DatabaseManager] ${DATABASE_KEY_ENV} is not set, so the application database is stored unencrypted (#1536)`);
    }
    const keyProblem = this.backupKeyProblem();
    if (keyProblem) {
      logger.error(`[DatabaseManager] ${keyProblem}`);
      this.fault('backup-key', keyProblem);
    }
  }

  /** Whether an application database is open. */
  isEnabled(): boolean {
    return this.provider !== null;
  }

  /**
   * Why the configured application database is not open (#1892): it could not
   * be opened safely, and the site is in maintenance mode. Null when it is
   * open, or when none is configured (`ngdpbase.database.provider` `none`).
   * A manager that needs the database asks this and holds its work.
   */
  getUnavailableReason(): string | null {
    return this.unavailable;
  }

  /**
   * #1892 (operator D3 rule, 2026-10-18): the application database can't be
   * opened safely. The process stays up in maintenance mode through core's
   * survivable path (#1152): visitors see only the public message (#1883),
   * administrators can sign in and reach /admin, and `reportAtBoot()` sends
   * them the reason as a critical notification once notifications exist.
   */
  private markUnavailable(reason: string): void {
    this.unavailable = reason;
    this.provider = null;
    logger.error(`[DatabaseManager] ${reason}`);
    this.markFailed(reason, 'ngdpbase.database.file');
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    this.engine.blockConfiguration(reason, {
      publicMessage: sitePublicMessage(configManager ? (k, d) => configManager.getProperty(k, d) : undefined)
    });
  }

  /** The reason for a database that did not open, with the fix that fits the key (#1892). */
  private static openFailure(file: string, cause: string, key: string): string {
    const keyFix = key
      ? `If ${DATABASE_KEY_ENV} is not the key this database was made with, correct ${DATABASE_KEY_ENV} in <FAST_STORAGE>/.env (or the environment) and restart.`
      : `${DATABASE_KEY_ENV} is not set: if the database is encrypted, set ${DATABASE_KEY_ENV} in <FAST_STORAGE>/.env (or the environment) and restart.`;
    return `The application database ${file} could not be opened safely: ${cause.replace(/\.$/, '')}. ` +
      'It was not opened unencrypted, and nothing further was migrated or written. ' +
      `${keyFix} If the file itself is damaged or a migration failed, restore the databases from a backup on Admin → Backup ` +
      '(applied at the next restart; the current file is kept beside it as *.pre-restore), or stop the server, put back a good copy ' +
      'of the database file, and restart (#1892)';
  }

  /** The refusal for anything that needs the application database while it is unavailable (#1892). */
  private unavailableRefusal(what: string): string {
    return `The application database is not available, so ${what} — the critical notification about it says why and how to fix it (#1892)`;
  }

  /**
   * The open connection, for a row-storing provider's constructor. Throws when
   * no database is configured, so a provider that needs one fails at boot with
   * the key to set rather than at its first write.
   */
  getHandle<Handle = unknown>(): Handle {
    if (!this.provider) {
      throw new Error("No application database is open — set ngdpbase.database.provider to 'sqlite' (#1536)");
    }
    return this.provider.handle as Handle;
  }

  /**
   * Open (or join) an add-on's own database and run its migrations
   * (ngdp-accounting-addons#13). The file is `<owner>.db` beside the application
   * database, opened by the same provider under the same key, so it gets the
   * same network-filesystem refusal, WAL, integrity check and newer-schema
   * refusal. The first call for an owner opens the file; a later call — from an
   * add-on that depends on the owner — adds its own ledger to the same file.
   *
   * Requires the application database: an operator who has not set
   * `ngdpbase.database.provider` to `sqlite` has not chosen to keep a database.
   *
   * Opens only a declared database (#1860): an enabled add-on declares this
   * owner and this ledger in `ngdpbase.addons.<slug>.database`. A declaration
   * with `encrypt: "required"` is refused when `NGDPBASE_DATABASE_KEY` is not
   * set; nothing is opened in the clear.
   */
  openAddonDatabase<Handle = unknown>(owner: string, options: AddonDatabaseOptions): Handle {
    if (this.unavailable) throw new Error(this.unavailableRefusal(`add-on database '${owner}' is not opened`));
    if (!this.provider || !this.databaseFile) {
      throw new Error(`Add-on '${owner}' needs a database, but none is open — set ngdpbase.database.provider to 'sqlite' (ngdp-accounting-addons#13)`);
    }
    checkAddonDatabaseRequest(owner, options);
    const declaration = addonDatabaseDeclarationFor(this.declarations(), owner, options.ledgerTable);
    const key = process.env[DATABASE_KEY_ENV] ?? '';
    const refusal = DatabaseManager.keyRefusal(declaration, key);
    if (refusal) throw new Error(refusal);

    const existing = this.addonDatabases.get(owner);
    if (existing) {
      if (existing.ledgers.has(options.ledgerTable)) {
        throw new Error(`Add-on '${owner}': migration ledger '${options.ledgerTable}' is already registered (ngdp-accounting-addons#13)`);
      }
      const { applied, skipped } = existing.provider.migrate(options.migrations, options.ledgerTable);
      existing.ledgers.add(options.ledgerTable);
      logger.info(`[DatabaseManager] ${owner}: ledger ${options.ledgerTable} — migrations applied ${applied.length}, already present ${skipped}`);
      return existing.provider.handle as Handle;
    }

    const file = path.join(path.dirname(this.databaseFile), `${owner}.db`);
    if (path.resolve(file) === path.resolve(this.databaseFile)) {
      throw new Error(`Add-on '${owner}' would open the application database itself (${file}) (ngdp-accounting-addons#13)`);
    }
    // Integrity is checked by the provider before anything is written (#1892).
    const provider = new SqliteDatabaseProvider(file, key, options.migrations, options.ledgerTable, { busyTimeoutMs: this.busyTimeoutMs });
    this.addonDatabases.set(owner, { provider, ledgers: new Set([options.ledgerTable]) });
    const { applied, skipped } = provider.migrations;
    logger.info(`[DatabaseManager] Opened ${file} for ${owner} (${key ? 'encrypted' : 'NOT encrypted'}) — ledger ${options.ledgerTable}, migrations applied ${applied.length}, already present ${skipped}`);
    return provider.handle as Handle;
  }

  /**
   * Every add-on database declared on this site (#1860), whether or not its
   * add-on is turned on — so a turned-off add-on's file is still listed and
   * backed up (#1723). One entry per declared ledger; several may share an
   * owner's file.
   */
  getDeclaredDatabases(): DeclaredAddonDatabase[] {
    return this.declarations().map((d) => ({
      ...d,
      file: this.databaseFile ? path.join(path.dirname(this.databaseFile), `${d.owner}.db`) : null,
      open: this.addonDatabases.get(d.owner)?.ledgers.has(d.ledgerTable) ?? false
    }));
  }

  /**
   * Why this add-on must not load, decided before it is imported (#1860): it
   * declares a database `encrypt: "required"` and no key is set. Null when it
   * may load. Asked by AddonsManager, as the configuration merge's refusals
   * are (#1559).
   */
  addonRefusal(slug: string): string | null {
    const key = process.env[DATABASE_KEY_ENV] ?? '';
    for (const declaration of this.declarations()) {
      if (declaration.declaredBy !== slug || !declaration.enabled) continue;
      // #1892: its database sits beside the application database, under the same key.
      if (this.unavailable) return this.unavailableRefusal(`add-on '${slug}', which declares database '${declaration.owner}', is not loaded`);
      const refusal = DatabaseManager.keyRefusal(declaration, key);
      if (refusal) return refusal;
    }
    return null;
  }

  private declarations(): readonly AddonDatabaseDeclaration[] {
    return this.engine.getManager<ConfigurationManager>('ConfigurationManager')?.getAddonDatabaseDeclarations?.() ?? [];
  }

  /** The one rule: a database declared `encrypt: "required"` is never opened without the key. */
  private static keyRefusal(declaration: AddonDatabaseDeclaration, key: string): string | null {
    if (declaration.encrypt !== 'required' || key) return null;
    return `Add-on '${declaration.declaredBy}' declares database '${declaration.owner}' with encrypt "required", but ${DATABASE_KEY_ENV} is not set — it is never opened unencrypted. Set ${DATABASE_KEY_ENV} in the environment or the instance .env (<FAST_STORAGE>/.env) and restart (#1860, #1883)`;
  }

  // ---- Backup and restore (#1723) ------------------------------------------

  /**
   * Copy every database into the backup BackupManager is writing: the
   * application database and every declared add-on database, on or off, at
   * one point in time, on a worker thread. Each goes into its own file,
   * `<stem>.<name>.db`, beside the document, encrypted under
   * `NGDPBASE_BACKUP_KEY`; the document references them. A database that
   * fails is named in `warnings`, and the others are still written.
   *
   * Throws when there is no backup key: nothing is ever written unencrypted.
   */
  override async backup(options?: ManagerBackupOptions): Promise<BackupData> {
    const base = { managerName: 'DatabaseManager', timestamp: new Date().toISOString() };
    // #1892: never a backup that silently leaves the databases out. A
    // restore's safety backup (D2) leaves them out and says so: they can't be
    // read, and the restore keeps their files as *.pre-restore.
    if (this.unavailable && this.databaseFile) {
      if (!options?.safetyBackup) throw new Error(this.unavailableRefusal('no database was backed up'));
      const leftOut = this.backupSources(this.databaseFile).map((s) => s.name);
      const note = `The databases (${leftOut.join(', ')}) are left out of this safety backup: the application database could not be opened. A restore keeps their files beside the restored ones as *.pre-restore (#1892)`;
      logger.warn(`[DatabaseManager] ${note}`);
      const data: DatabaseBackupData = { format: 1, databases: [], absent: [], failed: [], leftOut: { databases: leftOut, reason: this.unavailable } };
      return { ...base, data, note };
    }
    if (!this.provider || !this.databaseFile) {
      return { ...base, data: null, note: 'No application database (ngdpbase.database.provider is none)' };
    }
    if (!options?.directory || !options.stem) {
      throw new Error('DatabaseManager writes its databases beside the backup document, so it is backed up through BackupManager (#1723)');
    }
    const backupKey = this.backupKey();
    if (!backupKey) {
      const reason = `${BACKUP_KEY_ENV} is not set, so no database was backed up. Database backups are always encrypted and are never written without it (#1723)`;
      this.fault('backup-key', reason);
      throw new Error(reason);
    }
    const key = process.env[DATABASE_KEY_ENV] ?? '';
    const keyProblem = this.backupKeyProblem();
    if (keyProblem) {
      // D3: still backed up, but as loudly as a missing key.
      logger.error(`[DatabaseManager] ${keyProblem}`);
      this.fault('backup-key', keyProblem);
      await this.notify('error', 'The backup key is the database key', `${keyProblem}. This backup was still taken.`);
    } else {
      this.clearFault('backup-key');
    }

    const sources = this.backupSources(this.databaseFile);
    const absent = sources.filter((s) => !existsSync(s.file)).map((s) => s.name);
    const exports: DatabaseExport[] = sources
      .filter((s) => existsSync(s.file))
      .map((s) => ({ name: s.name, source: s.file, sourceKey: key, target: path.join(options.directory, `${options.stem}.${s.name}.db`) }));

    let outcome;
    try {
      outcome = await runOffThread({ kind: 'export', exports, backupKey }, this.workerTimeoutMs());
    } catch (err) {
      for (const e of exports) rmSync(e.target, { force: true });
      throw err;
    }
    const byName = new Map(sources.map((s) => [s.name, s]));
    const data: DatabaseBackupData = {
      format: 1,
      keyFingerprint: backupKeyFingerprint(backupKey),
      databases: outcome.written.map((w) => {
        const s = byName.get(w.name)!;
        return { name: w.name, kind: s.kind, ...(s.owner ? { owner: s.owner } : {}), file: path.basename(w.target), sizeBytes: w.sizeBytes, tables: w.tables };
      }),
      absent,
      failed: outcome.failed
    };
    logger.info(`[DatabaseManager] Backed up ${data.databases.length} database(s): ${data.databases.map((d) => d.name).join(', ')}${absent.length ? `; not created yet: ${absent.join(', ')}` : ''} (#1723)`);
    const warnings = outcome.failed.map((f) => `database ${f.name} was not backed up: ${f.error}`);
    for (const w of warnings) logger.error(`[DatabaseManager] ${w}`);
    return { ...base, data, ...(warnings.length > 0 ? { warnings } : {}) };
  }

  /**
   * Stage a restore of the databases in a backup, for the next start. Each
   * backed-up database is opened under the backup key, integrity-checked, and
   * copied into `<live>.staged` under this site's database key. All or
   * nothing: if any fails, none is staged. A database the backup does not
   * contain is left as it is. Live files are never touched here.
   *
   * BackupManager takes a fresh backup of the live data before calling this.
   * A backed-up add-on database that no add-on on this site declares is not
   * staged, and admins are told.
   */
  override async restore(backupData: BackupData, options?: ManagerRestoreOptions): Promise<void> {
    await super.restore(backupData);
    const data = backupData.data as DatabaseBackupData | null | undefined;
    if (!data || !Array.isArray(data.databases) || data.databases.length === 0) {
      logger.info('[DatabaseManager] The backup holds no database; every database is left as it is (#1723)');
      return;
    }
    // #1892 D2: a restore is how a damaged database is put right, so it is
    // allowed while the application database can't be opened, but never
    // without the key: what it stages would then be unencrypted.
    if (this.unavailable && !(process.env[DATABASE_KEY_ENV] ?? '')) {
      throw new Error(`The application database is not available and ${DATABASE_KEY_ENV} is not set, so nothing was staged: a restore now would put the databases back unencrypted. Set ${DATABASE_KEY_ENV} in <FAST_STORAGE>/.env (or the environment) and restart first; if that opens the database, no restore is needed (#1892)`);
    }
    if (!this.databaseFile || (!this.provider && !this.unavailable)) {
      throw new Error("The backup holds databases, but this site has none open — set ngdpbase.database.provider to 'sqlite' first (#1723)");
    }
    if (!options?.directory) {
      throw new Error('DatabaseManager reads its databases from beside the backup document, so it is restored through BackupManager (#1723)');
    }
    const backupKey = this.backupKey();
    if (!backupKey) {
      throw new Error(`${BACKUP_KEY_ENV} is not set, so the databases in this backup cannot be read; nothing was staged (#1723)`);
    }
    if (data.keyFingerprint && data.keyFingerprint !== backupKeyFingerprint(backupKey)) {
      throw new Error(`This backup was made with a different backup key (fingerprint ${data.keyFingerprint}; ${BACKUP_KEY_ENV} now has ${backupKeyFingerprint(backupKey)}). Set ${BACKUP_KEY_ENV} to the key it was made with; nothing was staged (#1723)`);
    }
    const staged = this.getStagedRestore();
    if (staged && !options.replaceStaged) {
      throw new Error(`A restore from ${staged.source || staged.backup} is already staged (by ${staged.stagedBy || 'unknown'}, ${staged.stagedAt}). Cancel it, or replace it; nothing was changed (#1723)`);
    }
    const targetKey = process.env[DATABASE_KEY_ENV] ?? '';
    const dir = path.dirname(this.databaseFile);
    const declarations = this.declarations();
    const stages: DatabaseStage[] = [];
    const skipped: string[] = [];
    for (const entry of data.databases) {
      if (typeof entry?.file !== 'string' || path.basename(entry.file) !== entry.file || entry.file.startsWith('.')) {
        throw new Error(`The backup names a database file '${String(entry?.file)}' outside its directory; nothing was staged (#1723)`);
      }
      let live: string;
      if (entry.name === APPLICATION) {
        live = this.databaseFile;
      } else {
        const owner = entry.name.startsWith('addon-') ? entry.name.slice('addon-'.length) : '';
        if (!ADDON_SLUG.test(owner)) {
          throw new Error(`The backup holds a database '${entry.name}' this build does not know; nothing was staged (#1723)`);
        }
        const declared = declarations.filter((d) => d.owner === owner);
        if (declared.length === 0) {
          skipped.push(entry.name);
          continue;
        }
        if (!targetKey && declared.some((d) => d.encrypt === 'required')) {
          throw new Error(`Database '${owner}' is declared encrypt "required", but ${DATABASE_KEY_ENV} is not set — it is never restored unencrypted; nothing was staged (#1723)`);
        }
        live = path.join(dir, `${owner}.db`);
      }
      const backupFile = path.join(options.directory, entry.file);
      if (!existsSync(backupFile)) {
        throw new Error(`The backup's database file ${entry.file} is missing from ${options.directory}; nothing was staged (#1723)`);
      }
      stages.push({ name: entry.name, backupFile, live, targetKey });
    }
    if (stages.length === 0) {
      throw new Error(`None of the databases in this backup belongs to this site (${skipped.join(', ')}); nothing was staged (#1723)`);
    }

    // A restore staged earlier and not yet applied is replaced by this one.
    const manifestFile = manifestPath(this.databaseFile);
    for (const previous of this.getStagedRestore()?.databases ?? []) rmSync(stagedPath(previous.live), { force: true });
    rmSync(manifestFile, { force: true });
    try {
      await runOffThread({ kind: 'stage', stages, backupKey }, this.workerTimeoutMs());
    } catch (err) {
      for (const s of stages) rmSync(stagedPath(s.live), { force: true });
      throw new Error(`The databases were not staged, and nothing was changed: ${(err as Error).message}`, { cause: err });
    }
    const manifest: StagedRestoreManifest = {
      version: 1,
      stagedAt: new Date().toISOString(),
      backup: String(backupData.timestamp ?? ''),
      source: options.source ?? '',
      stagedBy: actorOf(options.ctx).user,
      ...(options.safetyBackup ? { safetyBackup: options.safetyBackup } : {}),
      databases: stages.map((s) => ({ name: s.name, live: s.live, staged: stagedPath(s.live) }))
    };
    writeManifest(manifestFile, manifest);
    const names = stages.map((s) => s.name).join(', ');
    logger.warn(`[DatabaseManager] Restore staged for ${names} — restart to apply it (#1723)`);
    const unopened = this.unavailable
      ? ' The application database could not be opened, so that safety backup leaves the databases out; the current database files are kept as *.pre-restore instead.'
      : '';
    await this.notify('warning', 'A database restore is staged', `The databases ${names} from the backup taken ${manifest.backup} are staged. Restart the site to put them in place; the current files are kept as *.pre-restore.${manifest.safetyBackup ? ` The current data was backed up first, as ${manifest.safetyBackup}.` : ''}${unopened}`);
    if (skipped.length > 0) {
      const message = `The backup also holds ${skipped.join(', ')}, which no add-on on this site declares, so they were not restored. Install the add-on and restore again to bring them back.`;
      logger.error(`[DatabaseManager] ${message}`);
      await this.notify('error', 'Some databases in the backup were not restored', message);
    }
  }

  /** The restore staged and waiting for the next start, or null. */
  getStagedRestore(): StagedRestoreManifest | null {
    if (!this.databaseFile) return null;
    const file = manifestPath(this.databaseFile);
    if (!existsSync(file)) return null;
    try {
      return JSON.parse(readFileSync(file, 'utf8')) as StagedRestoreManifest;
    } catch {
      return null;
    }
  }

  /**
   * Throw away a staged restore before the restart applies it (#1723, D5):
   * the staged files and the manifest are removed, the live databases are
   * untouched. Recorded first (`backup-restore-cancel`, refuse): a cancel that
   * cannot be recorded does not happen.
   */
  async cancelStagedRestore(ctx: ActorContext): Promise<StagedRestoreManifest> {
    const staged = this.getStagedRestore();
    if (!staged || !this.databaseFile) throw new Error('No database restore is staged');
    const who = actorOf(ctx);
    await recordAuditEvent(this.engine.getManager('AuditManager'), {
      eventType: AUDIT_EVENT.BACKUP_RESTORE_CANCEL,
      ...who,
      action: 'backup-restore-cancel',
      result: 'success',
      severity: 'high',
      resource: staged.source || staged.backup,
      resourceType: 'backup',
      metadata: { ...who.metadata, stagedAt: staged.stagedAt, stagedBy: staged.stagedBy, databases: staged.databases.map((d) => d.name) }
    });
    for (const d of staged.databases) rmSync(stagedPath(d.live), { force: true });
    rmSync(manifestPath(this.databaseFile), { force: true });
    logger.warn(`[DatabaseManager] Staged restore from ${staged.source || staged.backup} cancelled by ${who.user} (#1723)`);
    return staged;
  }

  /**
   * Tell admins what the start found (#1723): what it did with a staged
   * restore, and a backup key that is missing or the database key. Called by
   * the engine once every manager exists: DatabaseManager starts before the
   * notifications do.
   */
  async reportAtBoot(): Promise<void> {
    if (this.unavailable) {
      await this.notify('error', 'Critical: the application database is not available',
        `${this.unavailable}. Until then the site is in maintenance mode: visitors see a short notice with no details, and administrators can still sign in and use /admin.`);
    }
    const keyProblem = this.provider ? this.backupKeyProblem() : null;
    if (keyProblem) await this.notify('error', 'Databases are not safely backed up', keyProblem);
    const outcome = this.restoreAtStart;
    this.restoreAtStart = null;
    if (!outcome) return;
    if (outcome.refused) {
      await this.notify('error', 'A database restore was not applied', `${outcome.refused}. The site started on its current databases.`);
      return;
    }
    await this.notify('success', 'A database restore was applied', `Restored at start: ${outcome.applied.map((a) => a.name).join(', ')}. The previous files are kept as *.pre-restore.`);
  }

  /** The application database and every declared add-on database (one per owner), on or off. */
  private backupSources(applicationFile: string): BackupSource[] {
    const sources: BackupSource[] = [{ name: APPLICATION, kind: 'application', file: applicationFile }];
    for (const owner of new Set(this.declarations().map((d) => d.owner))) {
      sources.push({ name: addonName(owner), kind: 'addon', owner, file: path.join(path.dirname(applicationFile), `${owner}.db`) });
    }
    return sources;
  }

  /** Put a staged restore in place, before any database opens; loud when it cannot. */
  private applyRestoreAtStart(file: string): void {
    const dir = path.resolve(path.dirname(file));
    const allowed = (live: string): boolean => {
      const resolved = path.resolve(live);
      if (resolved === path.resolve(file)) return true;
      const name = path.basename(resolved);
      return path.dirname(resolved) === dir && name.endsWith('.db') && ADDON_SLUG.test(name.slice(0, -3));
    };
    const outcome = applyStagedRestore(file, allowed);
    if (!outcome) return;
    this.restoreAtStart = outcome;
    if (outcome.refused) {
      const reason = `A staged database restore was NOT applied: ${outcome.refused}. The site started on its current databases (#1723)`;
      logger.error(`[DatabaseManager] ${reason}`);
      this.fault('restore', reason);
      return;
    }
    for (const a of outcome.applied) {
      logger.warn(`[DatabaseManager] Restore applied: ${a.name} -> ${a.live} (previous kept as ${path.basename(a.kept)}) (#1723)`);
    }
  }

  private backupKey(): string {
    return (process.env[BACKUP_KEY_ENV] ?? '').trim();
  }

  /** What is wrong with the backup key: missing, or the database key itself (D3). Null when sound. */
  private backupKeyProblem(): string | null {
    const backupKey = this.backupKey();
    if (!backupKey) return `${BACKUP_KEY_ENV} is not set, so no database is backed up — set it in the environment or the instance .env (#1723)`;
    const key = process.env[DATABASE_KEY_ENV] ?? '';
    if (key && key.trim() === backupKey) {
      return `${BACKUP_KEY_ENV} is the same as ${DATABASE_KEY_ENV}: a stolen backup and a stolen data disk then fall to one secret — give the backups a key of their own (#1723)`;
    }
    return null;
  }

  /** `ngdpbase.database.backup.worker-timeout-ms`, read at use. */
  private workerTimeoutMs(): number {
    const configured = this.engine.getManager<ConfigurationManager>('ConfigurationManager')
      ?.getProperty('ngdpbase.database.backup.worker-timeout-ms', DEFAULT_BACKUP_WORKER_TIMEOUT_MS) ?? DEFAULT_BACKUP_WORKER_TIMEOUT_MS;
    if (typeof configured !== 'number' || !Number.isInteger(configured) || configured <= 0) {
      throw new Error(`ngdpbase.database.backup.worker-timeout-ms must be a whole number of milliseconds, more than 0 — got ${JSON.stringify(configured)} (#1723)`);
    }
    return configured;
  }

  /** Degrade for one cause; the dashboard shows every cause still standing. */
  private fault(cause: Fault, reason: string): void {
    this.faults.set(cause, reason);
    this.markDegraded([...this.faults.values()].join('; '));
  }

  private clearFault(cause: Fault): void {
    if (!this.faults.delete(cause)) return;
    if (this.faults.size === 0) this.markReady();
    else this.markDegraded([...this.faults.values()].join('; '));
  }

  private async notify(level: 'success' | 'warning' | 'error', title: string, message: string): Promise<void> {
    try {
      await this.engine.getManager<{ addNotification(n: object): Promise<string> }>('NotificationManager')
        ?.addNotification({ type: 'system', level, title, message });
    } catch (err) {
      logger.error(`[DatabaseManager] The notification '${title}' could not be sent (#1723):`, err);
    }
  }

  /** Whether every open database passes SQLite's quick check; true when none is configured, false when the configured one could not be opened (#1892). */
  integrityOk(): boolean {
    if (this.unavailable) return false;
    if (this.provider && !this.provider.integrityOk()) return false;
    for (const { provider } of this.addonDatabases.values()) {
      if (!provider.integrityOk()) return false;
    }
    return true;
  }

  /** Closes the add-on databases, then the application database. */
  async shutdown(): Promise<void> {
    for (const { provider } of this.addonDatabases.values()) provider.close();
    this.addonDatabases.clear();
    this.provider?.close();
    this.provider = null;
    this.databaseFile = null;
    await super.shutdown();
  }
}

export default DatabaseManager;
