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
import Database from 'better-sqlite3-multiple-ciphers';
import { existsSync, statSync } from 'node:fs';
import BaseDatabaseProvider from './BaseDatabaseProvider.js';
import type { ProviderDurability } from './BaseProvider.js';
import { runMigrations, type Migration, type MigrationReport } from './sqliteMigrations.js';
import { refuseNetworkFilesystem } from './sqliteLocation.js';

export type SqliteHandle = InstanceType<typeof Database>;

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
   */
  constructor(private readonly file: string, key: string, ledger: Migration[], ledgerTable = 'schema_migrations') {
    super();
    refuseNetworkFilesystem(file);
    this.db = new Database(file);
    this.encrypted = key !== '';
    try {
      if (this.encrypted) {
        this.db.pragma("cipher='sqlcipher'");
        this.db.pragma(`key='${key.replace(/'/g, "''")}'`);
      }
      // The first read: a wrong key fails here, before anything is written.
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = FULL');
      this.migrations = runMigrations(this.db, ledger, ledgerTable);
    } catch (err) {
      this.db.close();
      throw err;
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
      const rows = this.db.pragma('quick_check') as { quick_check: string }[];
      return String(rows[0]?.quick_check ?? '').toLowerCase() === 'ok';
    } catch {
      return false;
    }
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
