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
 */
import BaseManager from './BaseManager.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';
import type BaseDatabaseProvider from '../providers/BaseDatabaseProvider.js';
import SqliteDatabaseProvider from '../providers/SqliteDatabaseProvider.js';
import DATABASE_MIGRATIONS from '../providers/databaseMigrations.js';
import logger from '../utils/logger.js';

/** The environment variable holding the SQLCipher key. Never a config key: config is readable from the admin screens. */
export const DATABASE_KEY_ENV = 'NGDPBASE_DATABASE_KEY';

class DatabaseManager extends BaseManager {
  private provider: BaseDatabaseProvider | null = null;

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

  /** Whether the database passes SQLite's quick check; true when none is configured. */
  integrityOk(): boolean {
    return this.provider ? this.provider.integrityOk() : true;
  }

  async shutdown(): Promise<void> {
    this.provider?.close();
    this.provider = null;
    await super.shutdown();
  }
}

export default DatabaseManager;
