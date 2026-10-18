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
 * Boot refuses, naming the cause, when the file would sit on a network
 * filesystem, when the schema is from a newer build, when a migration fails,
 * or when the integrity check does not pass.
 *
 * An add-on that keeps rows gets a database of its own the same way
 * (`openAddonDatabase`, ngdp-accounting-addons#13): its own file beside the
 * application database, opened by the same provider under the same key, with
 * its own migration ledger. A dependent add-on adds its ledger to that file.
 * Only a declared database is opened (#1860): the add-on names it in its own
 * config/default-config.json (`ngdpbase.addons.<slug>.database`), and one
 * declared `encrypt: "required"` is never opened without the key.
 */
import path from 'node:path';
import BaseManager from './BaseManager.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';
import type BaseDatabaseProvider from '../providers/BaseDatabaseProvider.js';
import SqliteDatabaseProvider, { DEFAULT_BUSY_TIMEOUT_MS } from '../providers/SqliteDatabaseProvider.js';
import DATABASE_MIGRATIONS from '../providers/databaseMigrations.js';
import type { Migration } from '../providers/sqliteMigrations.js';
import logger from '../utils/logger.js';
import { ADDON_SLUG, ledgerPrefix, type AddonDatabaseDeclaration } from '../utils/addonDatabaseRules.js';

/** The environment variable holding the SQLCipher key. Never a config key: config is readable from the admin screens. */
export const DATABASE_KEY_ENV = 'NGDPBASE_DATABASE_KEY';

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
    const provider = new SqliteDatabaseProvider(file, key, DATABASE_MIGRATIONS, 'schema_migrations', { busyTimeoutMs: this.busyTimeoutMs });
    if (!provider.integrityOk()) {
      provider.close();
      throw new Error(`The application database ${file} failed its integrity check — refusing to start (#1536)`);
    }
    this.provider = provider;
    this.databaseFile = file;

    const { applied, skipped } = provider.migrations;
    logger.info(`[DatabaseManager] Opened ${file} (${key ? 'encrypted' : 'NOT encrypted'}, lock wait ${this.busyTimeoutMs} ms) — migrations applied ${applied.length}, already present ${skipped}`);
    if (!key) {
      logger.warn(`[DatabaseManager] ${DATABASE_KEY_ENV} is not set, so the application database is stored unencrypted (#1536)`);
    }
  }

  /** Whether an application database is open. */
  isEnabled(): boolean {
    return this.provider !== null;
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
    const provider = new SqliteDatabaseProvider(file, key, options.migrations, options.ledgerTable, { busyTimeoutMs: this.busyTimeoutMs });
    if (!provider.integrityOk()) {
      provider.close();
      throw new Error(`Add-on database ${file} failed its integrity check (ngdp-accounting-addons#13)`);
    }
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
    return `Add-on '${declaration.declaredBy}' declares database '${declaration.owner}' with encrypt "required", but ${DATABASE_KEY_ENV} is not set — it is never opened unencrypted (#1860)`;
  }

  /** Whether every open database passes SQLite's quick check; true when none is configured. */
  integrityOk(): boolean {
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
