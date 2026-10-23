/**
 * The application database as one SQLite file, encrypted with SQLCipher when a
 * key is given (#1536). Ported from yourPHR (yourphr#617).
 *
 * Opened and migrated in the constructor, so every provider built over the
 * handle sees a finished schema. WAL mode with `synchronous = FULL`: a
 * committed transaction is on the device before the call returns. WAL needs
 * shared memory, which network filesystems do not provide, so the file's
 * location is checked first (`refuseNetworkFilesystem`).
 */
import type DatabaseDriver from 'better-sqlite3-multiple-ciphers';
import { createRequire } from 'node:module';
import path from 'node:path';
import { existsSync, statSync } from 'node:fs';
import BaseDatabaseProvider from './BaseDatabaseProvider.js';
import type { ProviderDurability } from './BaseProvider.js';
import { runMigrations, type Migration, type MigrationReport } from './sqliteMigrations.js';
import { refuseNetworkFilesystem } from './sqliteLocation.js';

/**
 * The driver, loaded from the entry its package.json names (#1537). Run from
 * source by tsx — the operator scripts, `npm run audit:verify -- --database` —
 * the bare package name follows tsconfig's `paths`, which maps it to the type
 * declarations, for `import`, `require` and `require.resolve` alike; its
 * `package.json` is not mapped.
 */
const requireHere = createRequire(import.meta.url);
const driverPackage = requireHere.resolve('better-sqlite3-multiple-ciphers/package.json');
const Database = requireHere(path.join(path.dirname(driverPackage), (requireHere(driverPackage) as { main: string }).main)) as typeof DatabaseDriver;

export type SqliteHandle = InstanceType<typeof DatabaseDriver>;

/** The lock wait when none is configured: the driver's own default, stated (#1710). */
export const DEFAULT_BUSY_TIMEOUT_MS = 5000;

class SqliteDatabaseProvider extends BaseDatabaseProvider<SqliteHandle> {
  protected override providerName = 'SqliteDatabaseProvider';
  protected override providerDescription = 'SQLite application database, SQLCipher-encrypted when a key is set';
  private readonly db: SqliteHandle;
  private closed = false;
  private readonly encrypted: boolean;
  /** What the ledger did at open: the ids applied now, and how many were already there. */
  readonly migrations: MigrationReport;

  /**
   * @param file   the database file; created when absent
   * @param key    the SQLCipher key; '' opens the file unencrypted
   * @param ledger the migrations, strictly ascending by id
   * @param ledgerTable where applied ids are recorded; an add-on's database names its own (#13)
   * @param options.busyTimeoutMs how long a statement waits for a lock another connection holds
   *   (`ngdpbase.database.busy-timeout-ms`, #1710) before failing with SQLITE_BUSY
   */
  constructor(private readonly file: string, key: string, ledger: Migration[], ledgerTable = 'schema_migrations', options: { busyTimeoutMs?: number } = {}) {
    super();
    refuseNetworkFilesystem(file);
    // #1892: an existing file is first read through a read-only connection.
    // A wrong or missing key, or a damaged file, fails there, and nothing is
    // written: a read-write connection that fails to read still checkpoints
    // the WAL into the file on close, or deletes a WAL it can't parse. Only
    // the -shm index, which SQLite rebuilds from the WAL, may be rewritten.
    if (existsSync(file)) SqliteDatabaseProvider.probe(file, key);
    this.db = new Database(file, { timeout: options.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS });
    this.encrypted = key !== '';
    try {
      SqliteDatabaseProvider.unlock(this.db, key);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = FULL');
      this.migrations = runMigrations(this.db, ledger, ledgerTable);
    } catch (err) {
      this.db.close();
      throw err;
    }
  }

  private static unlock(db: SqliteHandle, key: string): void {
    if (!key) return;
    db.pragma("cipher='sqlcipher'");
    db.pragma(`key='${key.replace(/'/g, "''")}'`);
  }

  /**
   * Read a database file once, read-only, under `key`, and close it (#1876):
   * nothing is migrated or written. Used for the copy a restore kept as
   * `*.pre-restore`, to read what the site had recorded just before the
   * restore replaced it.
   */
  static readOnce<T>(file: string, key: string, read: (db: SqliteHandle) => T): T {
    const db = new Database(file, { readonly: true, fileMustExist: true });
    try {
      SqliteDatabaseProvider.unlock(db, key);
      return read(db);
    } finally {
      db.close();
    }
  }

  /** Read an existing file read-only: the key opens it and it passes the quick check, or this throws. */
  private static probe(file: string, key: string): void {
    const db = new Database(file, { readonly: true, fileMustExist: true });
    try {
      SqliteDatabaseProvider.unlock(db, key);
      const rows = db.pragma('quick_check') as { quick_check: string }[];
      if (String(rows[0]?.quick_check ?? '').toLowerCase() !== 'ok') {
        throw new Error(`The database ${file} failed its integrity check — nothing was migrated or written`);
      }
    } finally {
      db.close();
    }
  }

  /**
   * Run a further migration ledger on this connection, recorded in its own
   * table: an add-on that depends on the add-on owning this database brings
   * its own tables (ngdp-accounting-addons#13). Same rules as the ledger run at
   * open: once, in order, transactional, and a newer schema is refused.
   */
  migrate(ledger: Migration[], ledgerTable: string): MigrationReport {
    return runMigrations(this.db, ledger, ledgerTable);
  }

  get handle(): SqliteHandle {
    return this.db;
  }

  storage(): { location: string; sizeBytes: number; encrypted: boolean } {
    return { location: this.file, sizeBytes: existsSync(this.file) ? statSync(this.file).size : 0, encrypted: this.encrypted };
  }

  integrityOk(): boolean {
    try {
      return this.quickCheckOk();
    } catch {
      return false;
    }
  }

  /** SQLite's quick check; throws what the driver throws (a wrong key: "file is not a database"). */
  private quickCheckOk(): boolean {
    const rows = this.db.pragma('quick_check') as { quick_check: string }[];
    return String(rows[0]?.quick_check ?? '').toLowerCase() === 'ok';
  }

  override getDurability(): ProviderDurability {
    return { bufferedForMs: 0, bufferedRecords: 0, fsync: true };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }
}

export default SqliteDatabaseProvider;
