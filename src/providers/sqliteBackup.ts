/**
 * Encrypted, consistent copies of SQLite databases, and the staged restore
 * that puts them back (#1723). Ported from yourPHR (`sqlite-backup.ts`,
 * yourphr#461, #602, #608, #787, #866, #914), with these changes:
 *
 * - __One encrypted file per database__, not one file holding every
 *   database's tables. A restore needs no table-name split, and two databases
 *   may hold tables of the same name.
 * - __Every database's snapshot is taken before any copying starts.__ Each
 *   source gets its own connection with its backup file attached; a read
 *   transaction is opened on every one of them, back to back, and only then
 *   are they copied. SQLite allows ten attached databases per connection, so
 *   one connection for all of them would cap a site at five databases; this
 *   has no cap. The live files are in WAL mode, so these readers never block
 *   the site's writers, and a write committed after the snapshot is in none of
 *   the copies.
 * - `sqlite_sequence` (AUTOINCREMENT counters) and `user_version` are copied,
 *   so a restored table never hands out an id it handed out before.
 * - Staging writes `<live>.staged` beside each live file, the path applying
 *   reads (yourphr#866: they were different directories), and is all or
 *   nothing: on any failure every staged file is removed.
 * - Applying moves the live file's `-wal` and `-shm` aside with it
 *   (yourphr#866), so a leftover WAL can never replay onto the restored file.
 *
 * Every function here is synchronous SQLite and can take minutes on a large
 * database: the managers call them through `runOffThread`, never on the thread
 * that answers requests (yourphr#787, #914). Keys travel in `workerData`
 * (memory), never argv or the environment.
 */
import { chmodSync, copyFileSync, existsSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import type DatabaseConstructor from 'better-sqlite3-multiple-ciphers';

/**
 * The SQLite driver, handed in rather than imported: the worker loads it from
 * the file the site's own thread resolved (`job.driver`), so both threads use
 * the same native module, and a worker run from source (tsx) is not sent to
 * the type declarations tsconfig's `paths` maps the package name to.
 */
export type Driver = typeof DatabaseConstructor;
type Handle = InstanceType<Driver>;

/** One database to copy into a backup: where it is, the key it opens under ('' = plaintext), and the backup file to write. */
export interface DatabaseExport {
  name: string;
  source: string;
  sourceKey: string;
  target: string;
}

export interface ExportOutcome {
  written: Array<{ name: string; target: string; sizeBytes: number; tables: number }>;
  /** Databases that could not be copied; the others still are. Each is named, never dropped silently. */
  failed: Array<{ name: string; error: string }>;
}

/** One database to stage from a backup: the backup's file, and the live file it will replace at the next start. */
export interface DatabaseStage {
  name: string;
  backupFile: string;
  live: string;
  targetKey: string;
}

export interface StageOutcome {
  staged: Array<{ name: string; staged: string; live: string; tables: number }>;
}

export type SqliteBackupJob =
  | { kind: 'export'; exports: DatabaseExport[]; backupKey: string }
  | { kind: 'stage'; stages: DatabaseStage[]; backupKey: string };

/** A job as the worker receives it: with the driver's resolved file. */
export type WorkerJob = SqliteBackupJob & { driver: string };

/** The staged file for a live database: beside it, so staging and applying name the same path. */
export const stagedPath = (live: string): string => `${live}.staged`;

/** SQLCipher key pragma escaping, as SqliteDatabaseProvider does it. */
function quoteKey(key: string): string {
  return `'${key.replace(/'/g, "''")}'`;
}

/** Open a file the way SqliteDatabaseProvider does: SQLCipher, keyed when a key is given. */
function openKeyed(Database: Driver, file: string, key: string): Handle {
  // Checked here, not with `fileMustExist`: SQLite opens an ATTACHed file with
  // the main file's flags, and without CREATE the backup or staged file could
  // not be made.
  if (!existsSync(file)) throw new Error(`${file} does not exist`);
  const db = new Database(file);
  try {
    db.pragma("cipher='sqlcipher'");
    if (key) db.pragma(`key=${quoteKey(key)}`);
    // The first read: a wrong key fails here.
    db.prepare('SELECT COUNT(*) AS n FROM sqlite_master').get();
    return db;
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Copies every table (with its rows), index, trigger and view from one schema
 * of the connection into another, inside the caller's transaction. This is
 * sqlcipher_export(), spelled out: SQLite3MultipleCiphers does not ship it.
 * Tables are created and filled before any index or trigger exists, so the
 * copy fires no trigger.
 */
function copyObjects(db: Handle, from: string, to: string): number {
  const all = db
    .prepare(`SELECT type, name, sql FROM ${from}.sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'trigger' THEN 2 ELSE 3 END`)
    .all() as { type: string; name: string; sql: string }[];
  // A virtual table (FTS5) owns shadow tables, <table>_data, _idx, _content,
  // _docsize, _config: recreating it recreates them, and creating them by hand
  // is refused. Their rows come back through the INSERT into the virtual table.
  const virtual = all.filter((o) => /^CREATE VIRTUAL TABLE/i.test(o.sql)).map((o) => o.name);
  const shadow = (name: string): boolean => virtual.some((v) => name.startsWith(`${v}_`));
  let tables = 0;
  for (const object of all) {
    if (shadow(object.name)) continue;
    // CREATE TABLE x -> CREATE TABLE to.x: the one rewrite sqlcipher_export
    // makes. sqlite_master SQL never carries a schema prefix.
    const ddl = object.sql.replace(
      /^(CREATE (?:TABLE|INDEX|UNIQUE INDEX|TRIGGER|VIEW|VIRTUAL TABLE))\s+(?:IF NOT EXISTS\s+)?("[^"]+"|\[[^\]]+\]|`[^`]+`|\S+)/i,
      (_m, head: string, name: string) => `${head} ${to}.${name}`
    );
    db.exec(ddl);
    if (object.type !== 'table') continue;
    tables++;
    const quoted = `"${object.name.replace(/"/g, '""')}"`;
    if (virtual.includes(object.name)) {
      // A virtual table's rowids are carried explicitly: SELECT * leaves them
      // out, and the copy would be renumbered.
      const cols = (db.prepare(`SELECT name FROM ${from}.pragma_table_info(?)`).all(object.name) as { name: string }[])
        .map((c) => `"${c.name.replace(/"/g, '""')}"`).join(', ');
      db.exec(`INSERT INTO ${to}.${quoted} (rowid, ${cols}) SELECT rowid, ${cols} FROM ${from}.${quoted}`);
    } else {
      db.exec(`INSERT INTO ${to}.${quoted} SELECT * FROM ${from}.${quoted}`);
    }
  }
  // AUTOINCREMENT counters: without them a restored table could hand out an
  // id it had already used for a deleted row.
  const hasSequence = db.prepare(`SELECT 1 FROM ${from}.sqlite_master WHERE name = 'sqlite_sequence'`).get();
  if (hasSequence && db.prepare(`SELECT 1 FROM ${to}.sqlite_master WHERE name = 'sqlite_sequence'`).get()) {
    db.exec(`DELETE FROM ${to}.sqlite_sequence`);
    db.exec(`INSERT INTO ${to}.sqlite_sequence (name, seq) SELECT name, seq FROM ${from}.sqlite_sequence`);
  }
  const userVersion = db.pragma(`${from}.user_version`, { simple: true }) as number;
  if (userVersion) db.pragma(`${to}.user_version = ${Number(userVersion)}`);
  return tables;
}

/** SQLite's full integrity check of an open database; throws naming what it found. */
function requireIntegrity(db: Handle, what: string): void {
  const result = String((db.pragma('integrity_check') as { integrity_check: string }[])[0]?.integrity_check ?? 'no result');
  if (result !== 'ok') throw new Error(`${what} failed its integrity check: ${result}`);
}

/**
 * Write an encrypted copy of each database under `backupKey`. A database that
 * cannot be opened or copied is named in `failed`, its partial file removed;
 * the others are still written. A target that already exists is never
 * overwritten.
 */
export function exportDatabasesSync(Database: Driver, exports: DatabaseExport[], backupKey: string): ExportOutcome {
  if (!backupKey.trim()) {
    throw new Error('a backup key is required: database backups are always encrypted');
  }
  const outcome: ExportOutcome = { written: [], failed: [] };
  const open: Array<{ job: DatabaseExport; db: Handle }> = [];
  const fail = (job: DatabaseExport, err: unknown, db?: Handle): void => {
    try { db?.close(); } catch { /* already failing */ }
    rmSync(job.target, { force: true });
    outcome.failed.push({ name: job.name, error: (err as Error).message });
  };

  // 1. A connection per database, its backup file attached under the backup key.
  for (const job of exports) {
    if (existsSync(job.target)) {
      outcome.failed.push({ name: job.name, error: `${path.basename(job.target)} already exists; a backup never overwrites one` });
      continue;
    }
    let db: Handle | undefined;
    try {
      db = openKeyed(Database, job.source, job.sourceKey);
      db.prepare(`ATTACH DATABASE ? AS backup KEY ${quoteKey(backupKey)}`).run(job.target);
      open.push({ job, db });
    } catch (err) {
      fail(job, err, db);
    }
  }

  // 2. Every snapshot, back to back, before any copying: one point in time.
  const reading: typeof open = [];
  for (const entry of open) {
    try {
      entry.db.exec('BEGIN');
      entry.db.prepare('SELECT COUNT(*) AS n FROM main.sqlite_master').get();
      reading.push(entry);
    } catch (err) {
      fail(entry.job, err, entry.db);
    }
  }

  // 3. Copy each, then close and prove the copy opens under the backup key.
  for (const { job, db } of reading) {
    try {
      const tables = copyObjects(db, 'main', 'backup');
      db.exec('COMMIT');
      db.close();
      const check = openKeyed(Database, job.target, backupKey);
      try { requireIntegrity(check, `the backup of ${job.name}`); } finally { check.close(); }
      chmodSync(job.target, 0o600);
      outcome.written.push({ name: job.name, target: job.target, sizeBytes: statSync(job.target).size, tables });
    } catch (err) {
      try { if (db.inTransaction) db.exec('ROLLBACK'); } catch { /* closing anyway */ }
      fail(job, err, db.open ? db : undefined);
    }
  }
  return outcome;
}

/**
 * Stage a restore: each backup file is opened under the backup key,
 * integrity-checked, and copied into `<live>.staged` under the target
 * database's key, which is then opened and checked too. All or nothing: if
 * any database fails, every staged file is removed and the error names it.
 * Live files are never touched.
 */
export function stageDatabasesSync(Database: Driver, stages: DatabaseStage[], backupKey: string): StageOutcome {
  if (!backupKey.trim()) {
    throw new Error('a backup key is required to read a database backup');
  }
  const outcome: StageOutcome = { staged: [] };
  try {
    for (const stage of stages) {
      const staged = stagedPath(stage.live);
      rmSync(staged, { force: true });
      let db: Handle;
      try {
        db = openKeyed(Database, stage.backupFile, backupKey);
      } catch (err) {
        throw new Error(`the backup of ${stage.name} cannot be read — wrong backup key, or not a backup: ${(err as Error).message}`, { cause: err });
      }
      let tables: number;
      try {
        requireIntegrity(db, `the backup of ${stage.name}`);
        db.prepare(`ATTACH DATABASE ? AS staged KEY ${quoteKey(stage.targetKey)}`).run(staged);
        db.exec('BEGIN');
        try {
          tables = copyObjects(db, 'main', 'staged');
          db.exec('COMMIT');
        } catch (err) {
          db.exec('ROLLBACK');
          throw err;
        }
      } finally {
        db.close();
      }
      const check = openKeyed(Database, staged, stage.targetKey);
      try { requireIntegrity(check, `the staged copy of ${stage.name}`); } finally { check.close(); }
      chmodSync(staged, 0o600);
      outcome.staged.push({ name: stage.name, staged, live: stage.live, tables });
    }
    return outcome;
  } catch (err) {
    for (const stage of stages) rmSync(stagedPath(stage.live), { force: true });
    throw err;
  }
}

/** Run a job of this module on a worker thread, so a large database never stalls requests or the liveness probe. */
export function runOffThread(job: { kind: 'export'; exports: DatabaseExport[]; backupKey: string }, timeoutMs: number): Promise<ExportOutcome>;
export function runOffThread(job: { kind: 'stage'; stages: DatabaseStage[]; backupKey: string }, timeoutMs: number): Promise<StageOutcome>;
export function runOffThread(job: SqliteBackupJob, timeoutMs: number): Promise<ExportOutcome | StageOutcome> {
  // Compiled, the worker is the .js beside this file. From source (vitest,
  // tsx) it is the .ts, which needs tsx's loader.
  const fromSource = import.meta.url.endsWith('.ts');
  const entry = new URL(fromSource ? './sqliteBackupWorker.ts' : './sqliteBackupWorker.js', import.meta.url);
  return new Promise((resolve, reject) => {
    const driver = createRequire(import.meta.url).resolve('better-sqlite3-multiple-ciphers');
    const workerData: WorkerJob = { ...job, driver };
    const worker = new Worker(entry, { workerData, ...(fromSource ? { execArgv: ['--import', 'tsx'] } : {}) });
    let settled = false;
    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      settle(() => reject(new Error(`the database ${job.kind === 'export' ? 'backup' : 'restore'} did not finish within ${timeoutMs} ms (ngdpbase.database.backup.worker-timeout-ms) and was stopped`)));
      void worker.terminate();
    }, timeoutMs);
    worker.once('message', (m: { ok: true; result: ExportOutcome | StageOutcome } | { ok: false; error: string }) => {
      settle(() => (m.ok ? resolve(m.result) : reject(new Error(m.error))));
    });
    worker.once('error', (err: Error) => settle(() => reject(err)));
    worker.once('exit', (code) => settle(() => reject(new Error(`the database backup worker exited (code ${code}) without a result`))));
  });
}

/** What a staged restore is: written last, once every database is staged; its presence is what the next start applies. */
export interface StagedRestoreManifest {
  version: 1;
  stagedAt: string;
  /** The backup document it came from. */
  backup: string;
  databases: Array<{ name: string; live: string; staged: string }>;
}

/** Where the manifest of a staged restore lives: beside the application database. */
export const manifestPath = (applicationFile: string): string => `${applicationFile}.restore.json`;

export function writeManifest(file: string, manifest: StagedRestoreManifest): void {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
  renameSync(tmp, file);
}

export interface ApplyOutcome {
  /** Databases now on the restored copy, each with where its previous file was kept. */
  applied: Array<{ name: string; live: string; kept: string }>;
  /** Why nothing was applied; the staged files were set aside as `*.incomplete`. */
  refused?: string;
}

/**
 * Apply a staged restore at start, before any database opens. Each live file,
 * with its `-wal` and `-shm`, steps aside as `*.pre-restore` (`-wal`/`-shm`
 * beside it, so the kept copy still opens as it was), and the staged file
 * takes its name. A rename, never a write into a live database.
 *
 * All or nothing: if any database the manifest names is not staged, nothing
 * is applied; what is staged is renamed `*.incomplete`, so it is neither
 * applied nor retried. A staged file with no manifest (staging was
 * interrupted) is set aside the same way. `allowed` says which live paths may
 * be replaced, so a tampered manifest cannot rename an arbitrary file.
 */
export function applyStagedRestore(applicationFile: string, allowed: (live: string) => boolean): ApplyOutcome | null {
  const manifestFile = manifestPath(applicationFile);
  const dir = path.dirname(applicationFile);
  const stray = (): string[] => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.db.staged')).map((f) => path.join(dir, f)) : []);

  if (!existsSync(manifestFile)) {
    const leftovers = stray();
    if (leftovers.length === 0) return null;
    for (const f of leftovers) move(f, `${f}.incomplete`);
    return { applied: [], refused: `staged database files with no restore manifest (an interrupted staging): ${leftovers.map((f) => path.basename(f)).join(', ')} — set aside as *.incomplete` };
  }

  const setAside = (reason: string): ApplyOutcome => {
    for (const f of stray()) move(f, `${f}.incomplete`);
    move(manifestFile, `${manifestFile}.incomplete`);
    return { applied: [], refused: reason };
  };

  let manifest: StagedRestoreManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as StagedRestoreManifest;
  } catch (err) {
    return setAside(`the restore manifest cannot be read: ${(err as Error).message}`);
  }
  const entries = Array.isArray(manifest?.databases) ? manifest.databases : [];
  const bad = entries.find((e) => !allowed(e.live) || e.staged !== stagedPath(e.live));
  if (entries.length === 0 || bad) {
    return setAside(bad ? `the restore manifest names ${bad.live}, which is not a database of this site` : 'the restore manifest names no database');
  }
  const missing = entries.filter((e) => !existsSync(e.staged));
  if (missing.length > 0) {
    return setAside(`only ${entries.length - missing.length} of ${entries.length} databases were staged (missing: ${missing.map((e) => e.name).join(', ')}), and they belong together`);
  }

  const applied: ApplyOutcome['applied'] = [];
  for (const entry of entries) {
    const kept = `${entry.live}.pre-restore`;
    // A previous restore's kept WAL must not pair with this restore's kept file.
    for (const sibling of [`${kept}-wal`, `${kept}-shm`]) rmSync(sibling, { force: true });
    if (existsSync(entry.live)) {
      move(entry.live, kept);
      for (const suffix of ['-wal', '-shm']) {
        if (existsSync(`${entry.live}${suffix}`)) move(`${entry.live}${suffix}`, `${kept}${suffix}`);
      }
    }
    // Never a WAL beside the restored file that is not its own.
    for (const suffix of ['-wal', '-shm']) rmSync(`${entry.live}${suffix}`, { force: true });
    move(entry.staged, entry.live);
    applied.push({ name: entry.name, live: entry.live, kept });
  }
  unlinkSync(manifestFile);
  return { applied };
}

/** A rename; a copy and unlink when the two paths are on different devices. */
function move(from: string, to: string): void {
  try {
    renameSync(from, to);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err;
    copyFileSync(from, to);
    unlinkSync(from);
  }
}
