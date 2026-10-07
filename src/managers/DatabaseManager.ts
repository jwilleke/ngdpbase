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
 */
import path from 'node:path';
import BaseManager from './BaseManager.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';
import type BaseDatabaseProvider from '../providers/BaseDatabaseProvider.js';
import SqliteDatabaseProvider from '../providers/SqliteDatabaseProvider.js';
import DATABASE_MIGRATIONS from '../providers/databaseMigrations.js';
import type { Migration } from '../providers/sqliteMigrations.js';
import logger from '../utils/logger.js';

/** The environment variable holding the SQLCipher key. Never a config key: config is readable from the admin screens. */
export const DATABASE_KEY_ENV = 'NGDPBASE_DATABASE_KEY';

/** A canonical add-on slug: lowercase letters and digits, single dashes. */
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** What an add-on hands over to have its database opened and migrated. */
export interface AddonDatabaseOptions {
  /** Dated migrations, strictly ascending by id — the same rules as core's ledger. */
  migrations: Migration[];
  /** Where the applied ids are recorded. Must start with the owner's slug (dashes as underscores) and `_`. */
  ledgerTable: string;
}

interface AddonDatabase {
  provider: SqliteDatabaseProvider;
  ledgers: Set<string>;
}

class DatabaseManager extends BaseManager {
  private provider: BaseDatabaseProvider | null = null;
  private databaseFile: string | null = null;
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

    const file = configManager.getResolvedDataPath('ngdpbase.database.file', './data/ngdpbase.db');
    const key = process.env[DATABASE_KEY_ENV] ?? '';
    const provider = new SqliteDatabaseProvider(file, key, DATABASE_MIGRATIONS);
    if (!provider.integrityOk()) {
      provider.close();
      throw new Error(`The application database ${file} failed its integrity check — refusing to start (#1536)`);
    }
    this.provider = provider;
    this.databaseFile = file;

    const { applied, skipped } = provider.migrations;
    logger.info(`[DatabaseManager] Opened ${file} (${key ? 'encrypted' : 'NOT encrypted'}) — migrations applied ${applied.length}, already present ${skipped}`);
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
   */
  openAddonDatabase<Handle = unknown>(owner: string, options: AddonDatabaseOptions): Handle {
    if (!this.provider || !this.databaseFile) {
      throw new Error(`Add-on '${owner}' needs a database, but none is open — set ngdpbase.database.provider to 'sqlite' (ngdp-accounting-addons#13)`);
    }
    if (!SLUG.test(owner)) {
      throw new Error(`'${owner}' is not an add-on slug — lowercase letters and digits, single dashes (ngdp-accounting-addons#13)`);
    }
    const prefix = `${owner.replace(/-/g, '_')}_`;
    if (!options.ledgerTable.startsWith(prefix)) {
      throw new Error(`Add-on '${owner}': migration ledger table '${options.ledgerTable}' must start with '${prefix}' (ngdp-accounting-addons#13)`);
    }

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
    const key = process.env[DATABASE_KEY_ENV] ?? '';
    const provider = new SqliteDatabaseProvider(file, key, options.migrations, options.ledgerTable);
    if (!provider.integrityOk()) {
      provider.close();
      throw new Error(`Add-on database ${file} failed its integrity check (ngdp-accounting-addons#13)`);
    }
    this.addonDatabases.set(owner, { provider, ledgers: new Set([options.ledgerTable]) });
    const { applied, skipped } = provider.migrations;
    logger.info(`[DatabaseManager] Opened ${file} for ${owner} (${key ? 'encrypted' : 'NOT encrypted'}) — ledger ${options.ledgerTable}, migrations applied ${applied.length}, already present ${skipped}`);
    return provider.handle as Handle;
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
