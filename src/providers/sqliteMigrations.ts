/**
 * Schema migrations — dated, run-once, recorded, transactional. Ported from yourPHR (yourphr#542),
 * where it runs in production; ngdpbase #1536. A migration is a FROZEN SNAPSHOT of intent at its
 * date — it never references live code, because the live code moves on and the migration must keep
 * describing what it did the day it ran.
 *
 * Two rules yourPHR paid to learn, made structural here:
 *
 *   - yourphr#528: ADD COLUMN leaves every EXISTING row NULL, not zero — and NULL + 1 is NULL, so
 *     a revocation counter "incremented" for months without moving, reporting success throughout.
 *     addColumnWithDefault() is the required spelling for counter-like columns: default for new
 *     rows, explicit backfill for existing ones, in the same migration.
 *   - Downgrade protection: a database that records a migration THIS build has never heard of is a
 *     database from the future, and opening it "best effort" is how schema corruption happens.
 *     Refuse to start instead.
 *
 * No down() — deliberately: the rollback story is a backup taken before anything migrates, not a
 * reverse script that was never tested against real data.
 */
import type Database from 'better-sqlite3-multiple-ciphers';

export interface Migration {
  /** Dated, sortable: YYYYMMDDHHMMSS. The registry must be strictly ascending. */
  id: string;
  description: string;
  up: (db: InstanceType<typeof Database>) => void;
}

export interface MigrationReport {
  applied: string[];
  skipped: number;
}

const ID_SHAPE = /^\d{14}$/;

/**
 * ADD COLUMN with a default AND a backfill of existing rows, in one statement pair — the yourphr#528
 * spelling. SQLite's ADD COLUMN ... DEFAULT only applies the default to rows created afterwards
 * on some historic versions and to reads via the schema on others; the explicit UPDATE removes
 * the ambiguity for every row that already exists.
 */
export function addColumnWithDefault(
  db: InstanceType<typeof Database>,
  table: string,
  column: string,
  type: 'INTEGER' | 'TEXT' | 'REAL',
  defaultValue: number | string
): void {
  const quoted = typeof defaultValue === 'string' ? `'${defaultValue.replace(/'/g, "''")}'` : String(defaultValue);
  db.exec(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${type} NOT NULL DEFAULT ${quoted}`);
  db.exec(`UPDATE "${table}" SET "${column}" = ${quoted} WHERE "${column}" IS NULL`);
}

/**
 * Applies every pending migration, in order, each in its own transaction. Stops loudly at the
 * first failure, leaving everything before it applied and everything from it untouched — a rerun
 * after the fix picks up exactly there.
 */
/**
 * `ledgerTable` names the table the applied ids are recorded in. A second database keeps its own
 * name (yourphr#784): a backup holding several databases' tables in one file splits them back BY
 * TABLE NAME on restore, and two tables called schema_migrations could not be told apart.
 */
export function runMigrations(db: InstanceType<typeof Database>, registry: Migration[], ledgerTable = 'schema_migrations'): MigrationReport {
  if (!/^[a-z_]+$/.test(ledgerTable)) throw new Error(`migration ledger table ${ledgerTable} is not a plain name`);
  // Registry hygiene before anything touches the database.
  let previous = '';
  for (const m of registry) {
    if (!ID_SHAPE.test(m.id)) {
      throw new Error(`migration id ${m.id} is not YYYYMMDDHHMMSS`);
    }
    if (m.id <= previous) {
      throw new Error(`migration ids must be strictly ascending: ${m.id} follows ${previous}`);
    }
    previous = m.id;
  }

  db.exec(`CREATE TABLE IF NOT EXISTS ${ledgerTable} (
    id TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);

  // Downgrade protection: an applied id the registry does not know means the database belongs to a
  // NEWER build. Opening it anyway is how corruption happens — refuse, name the ids.
  const appliedIds = new Set(
    (db.prepare(`SELECT id FROM ${ledgerTable}`).all() as { id: string }[]).map((r) => r.id)
  );
  const known = new Set(registry.map((m) => m.id));
  const fromTheFuture = [...appliedIds].filter((id) => !known.has(id));
  if (fromTheFuture.length > 0) {
    throw new Error(
      `database schema is newer than this build — applied migrations this build does not know: ${fromTheFuture.sort().join(', ')}. Refusing to start; upgrade the app or restore the matching backup.`
    );
  }

  const report: MigrationReport = { applied: [], skipped: 0 };
  for (const migration of registry) {
    if (appliedIds.has(migration.id)) {
      report.skipped++;
      continue;
    }
    db.exec('BEGIN');
    try {
      migration.up(db);
      db.prepare(`INSERT INTO ${ledgerTable} (id, description, applied_at) VALUES (?, ?, ?)`).run(
        migration.id, migration.description, new Date().toISOString()
      );
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      // The id in the error is what makes a 2am failure debuggable from the log line alone.
      throw new Error(`migration ${migration.id} (${migration.description}) failed and was rolled back: ${(err as Error).message}`);
    }
    report.applied.push(migration.id);
  }
  return report;
}
